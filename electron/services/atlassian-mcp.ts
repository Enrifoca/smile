/**
 * Atlassian Rovo MCP Server Integration
 * 
 * This service connects to the Atlassian MCP server for Jira operations.
 * The MCP server handles OAuth 2.1 authentication and provides tools for
 * Jira, Confluence, and Compass.
 * 
 * MCP Endpoint: https://mcp.atlassian.com/v1/mcp
 * 
 * Key tools used:
 * - getVisibleJiraProjects: List accessible projects
 * - getJiraProjectIssueTypesMetadata: Get issue types per project
 * - getJiraIssueTypeMetaWithFields: Get fields (including custom) per project+issue type
 * - searchJiraIssuesUsingJql: Search with JQL
 * - createJiraIssue: Create issues
 * - editJiraIssue: Update issues
 * - transitionJiraIssue: Change status
 * 
 * Uses mcp-remote proxy to handle OAuth 2.1 flow
 * Docs: https://github.com/geelen/mcp-remote
 */

import { spawn, ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'
import * as crypto from 'crypto'

// Use the correct MCP endpoint (HTTP transport, not SSE)
const MCP_SERVER_URL = 'https://mcp.atlassian.com/v1/mcp'
const MCP_SERVER_HASH = crypto.createHash('md5').update(MCP_SERVER_URL).digest('hex')

// Keep Mirai auth isolated from other mcp-remote clients so switching accounts
// can clear Mirai's OAuth state without touching unrelated tools.
const MCP_AUTH_DIR = path.join(os.homedir(), '.mirai-mcp-auth')
const LEGACY_MCP_AUTH_DIR = path.join(os.homedir(), '.mcp-auth')
const DEBUG_LOG_FILE = path.join(MCP_AUTH_DIR, 'mirai_mcp_debug.log')

interface MCPToolCall {
  name: string
  arguments: Record<string, unknown>
}

interface MCPToolResult {
  success: boolean
  data?: unknown
  error?: string
}

interface JiraProject {
  id: string
  key: string
  name: string
  projectTypeKey: string
  avatarUrls?: Record<string, string>
}

interface AtlassianResource {
  id?: string
  cloudId?: string
  name?: string
  url?: string
}

interface JiraIssueType {
  id: string
  name: string
  description?: string
  subtask: boolean
  hierarchyLevel?: number
  iconUrl?: string
}

interface JiraField {
  fieldId: string
  key: string
  name: string
  required: boolean
  hasDefaultValue: boolean
  schema: {
    type: string
    items?: string
    custom?: string
    customId?: number
    system?: string
  }
  allowedValues?: Array<{ id: string; value?: string; name?: string }>
}

export class AtlassianMCPService extends EventEmitter {
  private mcpProxy: ChildProcess | null = null
  private isConnected: boolean = false
  private isInitialized: boolean = false
  private pendingRequests: Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void; timeout: NodeJS.Timeout }> = new Map()
  private requestId: number = 0
  private outputBuffer: string = ''

  /**
   * Write debug log
   */
  private debugLog(message: string): void {
    const timestamp = new Date().toISOString()
    const logLine = `[${timestamp}] ${message}\n`
    console.log('[MCP]', message)
    
    try {
      if (!fs.existsSync(MCP_AUTH_DIR)) {
        fs.mkdirSync(MCP_AUTH_DIR, { recursive: true })
      }
      fs.appendFileSync(DEBUG_LOG_FILE, logLine)
    } catch (err) {
      // Ignore file write errors
    }
  }

  /**
   * Initialize the MCP connection
   * This starts the mcp-remote proxy that handles the OAuth flow
   */
  async connect(options: { forceReauth?: boolean } = {}): Promise<{ success: boolean; error?: string }> {
    if (options.forceReauth) {
      this.debugLog('Force reauth requested; clearing Mirai MCP auth cache')
      this.clearAuthCache()
    }

    // If already connected, return success
    if (this.isConnected && this.mcpProxy) {
      this.debugLog('Already connected, reusing existing connection')
      return { success: true }
    }

    // Clean up any existing process
    if (this.mcpProxy) {
      this.debugLog('Cleaning up existing process before reconnecting')
      this.mcpProxy.kill()
      this.mcpProxy = null
    }

    try {
      this.debugLog(`Starting mcp-remote with URL: ${MCP_SERVER_URL}`)
      
      const isWindows = process.platform === 'win32'
      
      // On Windows, we need to use shell: true for npx to work properly
      // On other platforms, we can spawn directly
      const spawnOptions = {
        stdio: ['pipe', 'pipe', 'pipe'] as const,
        shell: isWindows,  // Windows requires shell for npx
        windowsHide: true,  // Hide the console window on Windows
        env: {
          ...process.env,
          PATH: process.env.PATH,
          MCP_REMOTE_CONFIG_DIR: MCP_AUTH_DIR
        }
      }
      this.debugLog(`Using MCP_REMOTE_CONFIG_DIR: ${MCP_AUTH_DIR}`)
      
      // The mcp-remote proxy handles the OAuth flow
      // User will be prompted in browser to authorize
      // Using -y to auto-accept install, and --debug for verbose logging
      const args = [
        '-y',
        'mcp-remote@latest',
        MCP_SERVER_URL,
        '--transport', 'http-first',
        '--debug',
        '--auth-timeout', '120'  // 2 minutes for OAuth flow
      ]
      
      this.debugLog(`Spawn command: npx ${args.join(' ')}`)
      this.debugLog(`Using shell: ${isWindows}`)
      
      this.mcpProxy = spawn('npx', args, spawnOptions)

      this.debugLog(`Spawned mcp-remote process with PID: ${this.mcpProxy.pid}`)

      // Handle stdout (responses from MCP)
      this.mcpProxy.stdout?.on('data', (data: Buffer) => {
        const text = data.toString()
        this.debugLog(`stdout: ${text.substring(0, 500)}${text.length > 500 ? '...' : ''}`)
        this.outputBuffer += text
        this.processOutputBuffer()
      })

      // Handle stderr (errors and logs from mcp-remote)
      this.mcpProxy.stderr?.on('data', (data: Buffer) => {
        const text = data.toString()
        this.debugLog(`stderr: ${text}`)
        const lowerText = text.toLowerCase()

        // Check for OAuth flow indicators
        if (
          text.includes('Opening browser') ||
          text.includes('Please authorize this client by visiting:') ||
          text.includes('Browser opened automatically') ||
          text.includes('Authentication required')
        ) {
          this.emit('oauth-started')
          this.debugLog('OAuth flow detected - browser should open')
        }

        // Avoid false positives: invalid/missing tokens are common during discovery.
        const hasAuthSuccessSignal =
          lowerText.includes('authentication successful') ||
          lowerText.includes('authenticated successfully') ||
          lowerText.includes('oauth callback received') ||
          lowerText.includes('token saved')
        const hasAuthFailureSignal =
          lowerText.includes('invalid_token') ||
          lowerText.includes('missing or invalid access token') ||
          lowerText.includes('token result: not found') ||
          lowerText.includes('unauthorized')

        if (hasAuthSuccessSignal && !hasAuthFailureSignal) {
          this.debugLog('OAuth token exchange completed')
        }
      })

      // Handle process exit
      this.mcpProxy.on('exit', (code, signal) => {
        this.debugLog(`Process exited with code ${code}, signal ${signal}`)
        this.isConnected = false
        this.isInitialized = false
        this.emit('disconnected', { code, signal })
      })

      this.mcpProxy.on('error', (err) => {
        this.debugLog(`Process error: ${err.message}`)
        this.emit('error', err)
      })

      // Wait for the MCP proxy to be ready
      // The proxy sends a JSON-RPC response when it's ready
      const connectionResult = await this.waitForConnection()
      
      if (connectionResult.success) {
        this.debugLog('MCP proxy started; attempting initialize handshake')
        await this.initialize()
        this.isConnected = true

        const workspaceValidation = await this.ensureAccessibleWorkspace()
        if (!workspaceValidation.success) {
          this.debugLog(`Workspace validation failed: ${workspaceValidation.error}`)
          this.disconnect()
          return { success: false, error: workspaceValidation.error }
        }

        this.debugLog('MCP connection established successfully')
      }
      
      return connectionResult
    } catch (error) {
      this.debugLog(`Connection error: ${error instanceof Error ? error.message : String(error)}`)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to connect to Atlassian MCP' 
      }
    }
  }

  /**
   * Wait for the mcp-remote process to be ready
   */
  private waitForConnection(): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.debugLog('Connection timeout after 120 seconds')
        resolve({ 
          success: false, 
          error: 'MCP connection timeout. Please ensure you complete the OAuth flow in the browser.' 
        })
      }, 120000) // 120 second timeout for OAuth flow

      // Check for any output indicating readiness
      const checkReady = () => {
        // mcp-remote outputs to stderr when ready, look for connection success
        // For now, we'll wait a bit then try to send initialize
        setTimeout(() => {
          clearTimeout(timeout)
          this.debugLog('Proceeding with initialization attempt')
          resolve({ success: true })
        }, 5000) // Wait 5 seconds for initial setup
      }

      // Start checking after process spawns
      if (this.mcpProxy?.pid) {
        checkReady()
      } else {
        this.mcpProxy?.on('spawn', checkReady)
      }

      this.mcpProxy?.on('error', (err) => {
        clearTimeout(timeout)
        resolve({ success: false, error: err.message })
      })
    })
  }

  /**
   * Send MCP initialize request
   */
  private async initialize(): Promise<void> {
    if (this.isInitialized) return

    try {
      this.debugLog('Sending MCP initialize request')
      
      const id = `init_${++this.requestId}`
      const request = {
        jsonrpc: '2.0',
        id,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'Mirai',
            version: '0.1.0'
          }
        }
      }

      const result = await this.sendRequest(request, 30000)
      this.debugLog(`Initialize response: ${JSON.stringify(result)}`)
      
      // Send initialized notification
      const notification = {
        jsonrpc: '2.0',
        method: 'notifications/initialized'
      }
      this.mcpProxy?.stdin?.write(JSON.stringify(notification) + '\n')
      
      this.isInitialized = true
      this.debugLog('MCP initialization complete')
    } catch (error) {
      this.debugLog(`Initialize error: ${error instanceof Error ? error.message : String(error)}`)
      throw error
    }
  }

  /**
   * Send a raw request and wait for response
   */
  private sendRequest(request: object, timeoutMs: number = 60000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = (request as { id?: string }).id || `req_${++this.requestId}`
      
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error(`Request timeout for ${(request as { method?: string }).method || 'unknown'}`))
      }, timeoutMs)

      this.pendingRequests.set(id, { resolve, reject, timeout })
      
      const requestStr = JSON.stringify(request) + '\n'
      this.debugLog(`Sending request: ${requestStr.substring(0, 200)}`)
      
      this.mcpProxy?.stdin?.write(requestStr, (err) => {
        if (err) {
          clearTimeout(timeout)
          this.pendingRequests.delete(id)
          reject(err)
        }
      })
    })
  }

  /**
   * Disconnect from MCP
   */
  disconnect(): void {
    this.debugLog('Disconnecting from MCP')
    
    // Clear all pending requests
    for (const [_id, { reject, timeout }] of this.pendingRequests) {
      clearTimeout(timeout)
      reject(new Error('Connection closed'))
    }
    this.pendingRequests.clear()
    
    if (this.mcpProxy) {
      this.mcpProxy.kill()
      this.mcpProxy = null
    }
    this.isConnected = false
    this.isInitialized = false
    this.outputBuffer = ''
    this.cloudId = null  // Reset cloudId on disconnect
  }

  clearAuthCache(): void {
    this.disconnect()

    try {
      this.clearServerAuthFiles(MCP_AUTH_DIR)
      this.clearServerAuthFiles(LEGACY_MCP_AUTH_DIR)
      this.debugLog('Atlassian MCP auth cache cleared')
    } catch (error) {
      this.debugLog(`Failed to clear Atlassian MCP auth cache: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private clearServerAuthFiles(rootDir: string): void {
    if (!fs.existsSync(rootDir)) return

    for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
      const fullPath = path.join(rootDir, entry.name)
      if (entry.isDirectory()) {
        this.clearServerAuthFiles(fullPath)
        continue
      }

      if (entry.name.startsWith(`${MCP_SERVER_HASH}_`)) {
        fs.rmSync(fullPath, { force: true })
        this.debugLog(`Removed cached Atlassian MCP auth file: ${fullPath}`)
      }
    }
  }

  /**
   * Check if connected
   */
  getConnectionStatus(): boolean {
    return this.isConnected && this.isInitialized
  }

  /**
   * Process the output buffer for complete JSON messages
   */
  private processOutputBuffer(): void {
    // Try to extract complete JSON objects from the buffer
    const lines = this.outputBuffer.split('\n')
    
    // Keep the last potentially incomplete line in the buffer
    this.outputBuffer = lines.pop() || ''
    
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      
      try {
        const response = JSON.parse(trimmed)
        this.handleMCPResponse(response)
      } catch {
        // Not JSON, might be log output
        this.debugLog(`Non-JSON output: ${trimmed.substring(0, 100)}`)
      }
    }
  }

  /**
   * Handle a parsed MCP response
   */
  private handleMCPResponse(response: { id?: string; error?: { message?: string; code?: number }; result?: unknown }): void {
    if (response.id && this.pendingRequests.has(response.id)) {
      const { resolve, reject, timeout } = this.pendingRequests.get(response.id)!
      clearTimeout(timeout)
      this.pendingRequests.delete(response.id)
      
      if (response.error) {
        this.debugLog(`Response error for ${response.id}: ${response.error.message}`)
        reject(new Error(response.error.message || `MCP error code ${response.error.code}`))
      } else {
        this.debugLog(`Response success for ${response.id}`)
        resolve(response.result)
      }
    } else if (response.id) {
      this.debugLog(`Received response for unknown request: ${response.id}`)
    }
  }

  /**
   * Call an MCP tool
   */
  private async callTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.isConnected || !this.mcpProxy) {
      throw new Error('Not connected to Atlassian MCP. Please connect first.')
    }

    // Ensure initialized
    if (!this.isInitialized) {
      await this.initialize()
    }

    const id = `tool_${++this.requestId}`
    
    const request = {
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args
      }
    }

    this.debugLog(`Calling tool: ${toolName} with args: ${JSON.stringify(args).substring(0, 200)}`)
    
    try {
      const result = await this.sendRequest(request, 60000)
      this.debugLog(`Tool ${toolName} returned successfully`)
      return result
    } catch (error) {
      this.debugLog(`Tool ${toolName} failed: ${error instanceof Error ? error.message : String(error)}`)
      throw error
    }
  }

  /**
   * List available tools from the MCP server
   */
  async listTools(): Promise<MCPToolResult> {
    try {
      const id = `list_${++this.requestId}`
      const request = {
        jsonrpc: '2.0',
        id,
        method: 'tools/list',
        params: {}
      }
      
      const result = await this.sendRequest(request, 30000)
      this.debugLog(`Available tools: ${JSON.stringify(result)}`)
      return { success: true, data: result }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to list tools' 
      }
    }
  }

  private extractAccessibleResources(data: unknown): AtlassianResource[] {
    if (Array.isArray(data)) {
      return data.filter((item): item is AtlassianResource => typeof item === 'object' && item !== null)
    }

    if (data && typeof data === 'object') {
      const record = data as { values?: unknown[]; resources?: unknown[] }
      const candidate = Array.isArray(record.values)
        ? record.values
        : Array.isArray(record.resources)
          ? record.resources
          : []
      return candidate.filter((item): item is AtlassianResource => typeof item === 'object' && item !== null)
    }

    return []
  }

  private async ensureAccessibleWorkspace(): Promise<{ success: boolean; error?: string }> {
    try {
      this.debugLog('Validating accessible Atlassian workspaces...')
      const result = await this.callTool('getAccessibleAtlassianResources', {})
      const parsedResult = this.parseToolText(result)

      if (parsedResult.isError) {
        const rawError = parsedResult.error || 'Unable to verify accessible Atlassian workspaces.'
        const normalizedError = rawError.toLowerCase()

        if (
          normalizedError.includes('requires access to a jira') ||
          normalizedError.includes('confluence') ||
          normalizedError.includes('create a site')
        ) {
          return {
            success: false,
            error: 'The authenticated Atlassian account has no accessible Jira/Confluence site. Create or join a site, then use Switch Account / Site.'
          }
        }

        return { success: false, error: rawError }
      }

      const resources = this.extractAccessibleResources(parsedResult.data)
      if (resources.length === 0) {
        return {
          success: false,
          error: 'No Atlassian workspace is accessible for this account. Create or request access to at least one Jira/Confluence site, then reconnect.'
        }
      }

      if (this.preferredSiteUrl) {
        const preferredResource = resources.find(resource => this.normalizeSiteUrl(resource.url) === this.preferredSiteUrl)
        if (!preferredResource) {
          const availableSites = resources
            .map(resource => resource.url || resource.name)
            .filter(Boolean)
            .join(', ')
          return {
            success: false,
            error: `The connected Atlassian account cannot access ${this.preferredSiteUrl}. Available sites: ${availableSites || '(none)'}.`
          }
        }
      }

      this.debugLog(`Workspace validation succeeded with ${resources.length} accessible site(s)`)
      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to verify accessible Atlassian workspaces.'
      this.debugLog(`Workspace validation error: ${message}`)
      return { success: false, error: message }
    }
  }

  // ============================================
  // CLOUD ID MANAGEMENT
  // ============================================
  
  private cloudId: string | null = null
  private preferredSiteUrl: string | null = null

  private normalizeSiteUrl(url?: string | null): string | null {
    if (!url) return null
    return url.trim().replace(/\/+$/, '').toLowerCase()
  }

  private parseToolText(result: unknown): { data?: unknown; error?: string; isError: boolean } {
    if (!result || typeof result !== 'object') {
      return { data: result, isError: false }
    }

    const toolResult = result as { content?: Array<{ text?: string }>; isError?: boolean }
    const text = toolResult.content?.find(item => typeof item.text === 'string')?.text
    if (!text) {
      return { data: result, isError: Boolean(toolResult.isError) }
    }

    try {
      const parsed = JSON.parse(text)
      if (toolResult.isError || parsed?.error === true) {
        return {
          data: parsed,
          error: parsed?.message || parsed?.errorMessage || text,
          isError: true
        }
      }
      return { data: parsed, isError: false }
    } catch {
      return {
        data: text,
        error: toolResult.isError ? text : undefined,
        isError: Boolean(toolResult.isError)
      }
    }
  }

  setPreferredSiteUrl(siteUrl: string | null): void {
    const normalized = this.normalizeSiteUrl(siteUrl)
    if (normalized !== this.preferredSiteUrl) {
      this.cloudId = null
    }
    this.preferredSiteUrl = normalized
    this.debugLog(`Preferred Jira site URL set to: ${this.preferredSiteUrl || '(none)'}`)
  }

  /**
   * Get the cloud ID for the authenticated user's Atlassian site
   * This is required for most Jira API calls
   * 
   * Uses the `getAccessibleAtlassianResources` tool which returns all
   * Atlassian cloud sites (cloudIds) the user can access.
   */
  async getCloudId(): Promise<string | null> {
    if (this.cloudId) {
      return this.cloudId
    }

    try {
      this.debugLog('Fetching cloudId via getAccessibleAtlassianResources...')
      
      // This is the correct tool for getting cloudId - returns list of accessible sites
      const result = await this.callTool('getAccessibleAtlassianResources', {})
      this.debugLog(`getAccessibleAtlassianResources result: ${JSON.stringify(result).substring(0, 2000)}`)
      
      // Parse the result to find cloudId
      if (result && typeof result === 'object') {
        const content = (result as { content?: Array<{ text?: string }> }).content
        if (content && content[0] && content[0].text) {
          const text = content[0].text
          
          // Try to parse as JSON
          try {
            const data = JSON.parse(text)
            
            // Response is typically an array of resources with id (cloudId), name, url
            if (Array.isArray(data) && data.length > 0) {
              const resources = data as AtlassianResource[]
              const preferredResource = this.preferredSiteUrl
                ? resources.find(resource => this.normalizeSiteUrl(resource.url) === this.preferredSiteUrl)
                : undefined
              if (this.preferredSiteUrl && !preferredResource) {
                const availableSites = resources
                  .map(resource => resource.url || resource.name)
                  .filter(Boolean)
                  .join(', ')
                this.debugLog(`Authenticated Atlassian resources do not include configured Jira site ${this.preferredSiteUrl}. Available: ${availableSites || '(none)'}`)
                return null
              }
              const firstResource = preferredResource || resources[0]
              if (firstResource.id) {
                this.cloudId = firstResource.id
                this.debugLog(`Extracted cloudId from resources array: ${this.cloudId}`)
                return this.cloudId
              }
              if (firstResource.cloudId) {
                this.cloudId = firstResource.cloudId
                this.debugLog(`Extracted cloudId: ${this.cloudId}`)
                return this.cloudId
              }
            }
            
            // Handle object response
            if (data.id) {
              this.cloudId = data.id
              this.debugLog(`Extracted cloudId from id field: ${this.cloudId}`)
              return this.cloudId
            }
            if (data.cloudId) {
              this.cloudId = data.cloudId
              this.debugLog(`Extracted cloudId from cloudId field: ${this.cloudId}`)
              return this.cloudId
            }
          } catch {
            // Not valid JSON, try regex
          }
          
          // Fallback to regex matching for UUID-like cloudId
          const cloudIdMatch = text.match(/"id"\s*:\s*"([a-f0-9-]{36})"/i) ||
                               text.match(/"cloudId"\s*:\s*"([a-f0-9-]{36})"/i)
          if (cloudIdMatch) {
            this.cloudId = cloudIdMatch[1]
            this.debugLog(`Extracted cloudId via regex: ${this.cloudId}`)
            return this.cloudId
          }
        }
      }
      
      this.debugLog('Could not extract cloudId from getAccessibleAtlassianResources')
      return null
    } catch (error) {
      this.debugLog(`Error getting cloud ID: ${error instanceof Error ? error.message : String(error)}`)
      return null
    }
  }

  /**
   * Set the cloud ID manually
   */
  setCloudId(cloudId: string): void {
    this.cloudId = cloudId
    this.debugLog(`Cloud ID set to: ${cloudId}`)
  }
  
  /**
   * Check if cloudId is available
   */
  hasCloudId(): boolean {
    return this.cloudId !== null
  }

  // ============================================
  // JIRA TOOLS
  // ============================================

  /**
   * Get all visible Jira projects
   * 
   * MCP Tool: getVisibleJiraProjects
   * REQUIRES cloudId - must call getAccessibleAtlassianResources first
   */
  async getVisibleProjects(): Promise<MCPToolResult> {
    try {
      // Ensure we have cloudId first
      const cloudId = await this.getCloudId()
      if (!cloudId) {
        return {
          success: false,
          error: this.preferredSiteUrl
            ? `The connected Atlassian account cannot access ${this.preferredSiteUrl}. Use "Switch Account / Site" to sign in with the right account.`
            : 'Cloud ID not available. Please reconnect to Atlassian.'
        }
      }
      
      this.debugLog(`Calling getVisibleJiraProjects with cloudId: ${cloudId}`)
      const result = await this.callTool('getVisibleJiraProjects', { cloudId })
      
      this.debugLog(`getVisibleJiraProjects result: ${JSON.stringify(result).substring(0, 500)}`)
      const parsedResult = this.parseToolText(result)
      if (parsedResult.isError) {
        return {
          success: false,
          error: parsedResult.error || 'Failed to load Jira projects'
        }
      }
      
      // Try to extract cloudId from the response
      // The response typically includes cloudId in each project or in the response metadata
      if (result && typeof result === 'object') {
        const content = (result as { content?: Array<{ text?: string }> }).content
        if (content && content[0] && content[0].text) {
          const text = content[0].text
          // Look for cloudId in various formats
          const cloudIdMatch = text.match(/"cloudId":\s*"([a-f0-9-]+)"/i) ||
                               text.match(/cloudId["\s:]+([a-f0-9-]+)/i)
          if (cloudIdMatch && !this.cloudId) {
            this.cloudId = cloudIdMatch[1]
            this.debugLog(`Extracted cloudId from projects: ${this.cloudId}`)
          }
        }
      }
      
      const data = parsedResult.data
      if (Array.isArray(data)) {
        return { success: true, data }
      }
      if (data && typeof data === 'object' && Array.isArray((data as { values?: unknown[] }).values)) {
        return { success: true, data: (data as { values: unknown[] }).values }
      }

      return { success: true, data: result }
    } catch (error) {
      this.debugLog(`getVisibleProjects error: ${error instanceof Error ? error.message : String(error)}`)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to get projects' 
      }
    }
  }

  /**
   * Get issue types for a project
   * 
   * MCP Tool: getJiraProjectIssueTypesMetadata
   * Required params: cloudId, projectIdOrKey
   */
  async getProjectIssueTypes(projectIdOrKey: string): Promise<MCPToolResult> {
    try {
      if (!projectIdOrKey) {
        return { success: false, error: 'Project key is required' }
      }

      const cloudId = await this.getCloudId()
      if (!cloudId) {
        return { success: false, error: 'Cloud ID not available. Please reconnect to Atlassian.' }
      }

      const args: Record<string, unknown> = { 
        cloudId,
        projectIdOrKey  // Note: MCP uses projectIdOrKey, not projectKeyOrId
      }
      
      this.debugLog(`getProjectIssueTypes args: ${JSON.stringify(args)}`)
      const result = await this.callTool('getJiraProjectIssueTypesMetadata', args)
      return { success: true, data: result }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to get issue types' 
      }
    }
  }

  /**
   * Get field metadata for a specific project and issue type
   * This includes custom fields!
   * 
   * MCP Tool: getJiraIssueTypeMetaWithFields
   * Required params: cloudId, projectIdOrKey, issueTypeId
   */
  async getIssueTypeFieldMetadata(projectIdOrKey: string, issueTypeId: string): Promise<MCPToolResult> {
    try {
      if (!projectIdOrKey || !issueTypeId) {
        return { success: false, error: 'Project key and issue type ID are required' }
      }

      const cloudId = await this.getCloudId()
      if (!cloudId) {
        return { success: false, error: 'Cloud ID not available. Please reconnect to Atlassian.' }
      }

      const args: Record<string, unknown> = { 
        cloudId,
        projectIdOrKey,
        issueTypeId 
      }
      
      this.debugLog(`getIssueTypeFieldMetadata args: ${JSON.stringify(args)}`)
      const result = await this.callTool('getJiraIssueTypeMetaWithFields', args)
      return { success: true, data: result }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to get field metadata' 
      }
    }
  }

  /**
   * Search issues using JQL
   * 
   * MCP Tool: searchJiraIssuesUsingJql
   * Required params: cloudId, jql
   * Optional params: fields (ARRAY of strings!), maxResults (number)
   * 
   * IMPORTANT: fields must be an ARRAY like ["summary", "status", "assignee"]
   */
  async searchIssues(jql: string, maxResults: number = 50, fields?: string | string[]): Promise<MCPToolResult> {
    try {
      // Validate jql is provided
      if (!jql || typeof jql !== 'string') {
        return { 
          success: false, 
          error: 'JQL query is required for searching issues' 
        }
      }

      const cloudId = await this.getCloudId()
      if (!cloudId) {
        return {
          success: false,
          error: 'Cloud ID not available. Please reconnect to Atlassian.'
        }
      }

      const args: Record<string, unknown> = { 
        cloudId,
        jql,
        maxResults: Number(maxResults) || 50
      }
      
      // fields must be an ARRAY - convert string to array if needed
      if (fields) {
        if (Array.isArray(fields)) {
          args.fields = fields
        } else if (typeof fields === 'string' && fields.trim()) {
          // Convert comma-separated string to array
          args.fields = fields.split(',').map(f => f.trim()).filter(f => f)
        }
      }
      
      this.debugLog(`searchIssues calling MCP with args: ${JSON.stringify(args)}`)
      const result = await this.callTool('searchJiraIssuesUsingJql', args)
      return { success: true, data: result }
    } catch (error) {
      this.debugLog(`searchIssues error: ${error instanceof Error ? error.message : String(error)}`)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to search issues' 
      }
    }
  }

  /**
   * Get a single issue by key
   * 
   * MCP Tool: getJiraIssue
   * Required params: cloudId, issueIdOrKey
   */
  async getIssue(issueIdOrKey: string): Promise<MCPToolResult> {
    try {
      if (!issueIdOrKey) {
        return { success: false, error: 'Issue key is required' }
      }

      const cloudId = await this.getCloudId()
      if (!cloudId) {
        return { success: false, error: 'Cloud ID not available. Please reconnect to Atlassian.' }
      }

      const args: Record<string, unknown> = { 
        cloudId,
        issueIdOrKey 
      }
      
      this.debugLog(`getIssue args: ${JSON.stringify(args)}`)
      const result = await this.callTool('getJiraIssue', args)
      return { success: true, data: result }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to get issue' 
      }
    }
  }

  /**
   * Create a new issue
   * 
   * MCP Tool: createJiraIssue
   * Required params: cloudId, projectKey, issueTypeName, summary
   * Optional params: description, additional_fields
   */
  async createIssue(
    projectKey: string,
    issueTypeName: string,
    summary: string,
    description?: string,
    additionalFields?: Record<string, unknown>
  ): Promise<MCPToolResult> {
    try {
      if (!projectKey || !issueTypeName || !summary) {
        return { success: false, error: 'Project key, issue type, and summary are required' }
      }

      const cloudId = await this.getCloudId()
      if (!cloudId) {
        return { success: false, error: 'Cloud ID not available. Please reconnect to Atlassian.' }
      }

      const args: Record<string, unknown> = {
        cloudId,
        projectKey,
        issueTypeName,  // Note: MCP uses issueTypeName, not issueTypeId
        summary
      }
      
      if (description) {
        args.description = description
      }
      
      if (additionalFields && Object.keys(additionalFields).length > 0) {
        args.additional_fields = additionalFields
      }
      
      this.debugLog(`createIssue args: ${JSON.stringify(args)}`)
      const result = await this.callTool('createJiraIssue', args)
      return { success: true, data: result }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to create issue' 
      }
    }
  }

  /**
   * Update an existing issue
   * 
   * MCP Tool: editJiraIssue
   * Required params: cloudId, issueIdOrKey
   * Optional params: summary, description, etc.
   */
  async editIssue(
    issueIdOrKey: string,
    fields: Record<string, unknown>
  ): Promise<MCPToolResult> {
    try {
      if (!issueIdOrKey) {
        return { success: false, error: 'Issue key is required' }
      }

      const cloudId = await this.getCloudId()
      if (!cloudId) {
        return { success: false, error: 'Cloud ID not available. Please reconnect to Atlassian.' }
      }

      // Remove issueKey from fields if present (we pass it separately)
      const { issueKey: _ik, issueIdOrKey: _iok, ...updateFields } = fields

      const args: Record<string, unknown> = {
        cloudId,
        issueIdOrKey,
        ...updateFields
      }
      
      this.debugLog(`editIssue args: ${JSON.stringify(args)}`)
      const result = await this.callTool('editJiraIssue', args)
      return { success: true, data: result }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to update issue' 
      }
    }
  }

  /**
   * Add a comment to an issue
   * 
   * MCP Tool: addCommentToJiraIssue
   * Required params: cloudId, issueIdOrKey, commentBody
   */
  async addComment(issueIdOrKey: string, commentBody: string): Promise<MCPToolResult> {
    try {
      if (!issueIdOrKey || !commentBody) {
        return { success: false, error: 'Issue key and comment body are required' }
      }

      const cloudId = await this.getCloudId()
      if (!cloudId) {
        return { success: false, error: 'Cloud ID not available. Please reconnect to Atlassian.' }
      }

      const args: Record<string, unknown> = { 
        cloudId,
        issueIdOrKey, 
        commentBody  // Note: MCP uses commentBody, not body
      }
      
      this.debugLog(`addComment args: ${JSON.stringify(args)}`)
      const result = await this.callTool('addCommentToJiraIssue', args)
      return { success: true, data: result }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to add comment' 
      }
    }
  }

  /**
   * Get available transitions for an issue
   * 
   * MCP Tool: getTransitionsForJiraIssue
   * Required params: cloudId, issueIdOrKey
   */
  async getTransitions(issueIdOrKey: string): Promise<MCPToolResult> {
    try {
      if (!issueIdOrKey) {
        return { success: false, error: 'Issue key is required' }
      }

      const cloudId = await this.getCloudId()
      if (!cloudId) {
        return { success: false, error: 'Cloud ID not available. Please reconnect to Atlassian.' }
      }

      const args: Record<string, unknown> = { 
        cloudId,
        issueIdOrKey 
      }
      
      this.debugLog(`getTransitions args: ${JSON.stringify(args)}`)
      const result = await this.callTool('getTransitionsForJiraIssue', args)
      return { success: true, data: result }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to get transitions' 
      }
    }
  }

  /**
   * Transition an issue to a new status
   * 
   * MCP Tool: transitionJiraIssue
   * Required params: cloudId, issueIdOrKey, transitionId
   */
  async transitionIssue(issueIdOrKey: string, transitionId: string): Promise<MCPToolResult> {
    try {
      if (!issueIdOrKey || !transitionId) {
        return { success: false, error: 'Issue key and transition ID are required' }
      }

      const cloudId = await this.getCloudId()
      if (!cloudId) {
        return { success: false, error: 'Cloud ID not available. Please reconnect to Atlassian.' }
      }

      const args: Record<string, unknown> = { 
        cloudId,
        issueIdOrKey, 
        transitionId 
      }
      
      this.debugLog(`transitionIssue args: ${JSON.stringify(args)}`)
      const result = await this.callTool('transitionJiraIssue', args)
      return { success: true, data: result }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to transition issue' 
      }
    }
  }

  /**
   * Look up user account ID by name or email
   * 
   * MCP Tool: lookupJiraAccountId
   * Required params: cloudId, searchString (NOT query!)
   */
  async lookupUser(searchString: string): Promise<MCPToolResult> {
    try {
      if (!searchString) {
        return { success: false, error: 'Search string is required' }
      }

      const cloudId = await this.getCloudId()
      if (!cloudId) {
        return { success: false, error: 'Cloud ID not available. Please reconnect to Atlassian.' }
      }

      const args: Record<string, unknown> = { 
        cloudId,
        searchString  // MCP uses searchString, not query!
      }
      
      this.debugLog(`lookupUser args: ${JSON.stringify(args)}`)
      const result = await this.callTool('lookupJiraAccountId', args)
      return { success: true, data: result }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to lookup user' 
      }
    }
  }

  /**
   * Get current user info
   * 
   * MCP Tool: atlassianUserInfo
   * No params required - returns info about the authenticated user
   */
  async getCurrentUser(): Promise<MCPToolResult> {
    try {
      this.debugLog('Getting current user info')
      const result = await this.callTool('atlassianUserInfo', {})
      
      // Try to extract cloudId from the user info response
      if (result && typeof result === 'object' && !this.cloudId) {
        const content = (result as { content?: Array<{ text?: string }> }).content
        if (content && content[0] && content[0].text) {
          const text = content[0].text
          const cloudIdMatch = text.match(/"cloudId":\s*"([a-f0-9-]+)"/i) ||
                               text.match(/cloudId["\s:]+([a-f0-9-]+)/i)
          if (cloudIdMatch) {
            this.cloudId = cloudIdMatch[1]
            this.debugLog(`Extracted cloudId from user info: ${this.cloudId}`)
          }
        }
      }
      
      return { success: true, data: result }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to get user info' 
      }
    }
  }

  // ============================================
  // METADATA SYNC (for pre-fetching)
  // ============================================

  /**
   * Get all assignable users for a project
   * 
   * MCP Tool: getAssignableUsersForJiraIssue
   * Required params: cloudId, projectIdOrKey
   */
  async getAssignableUsers(projectIdOrKey: string): Promise<MCPToolResult> {
    try {
      if (!projectIdOrKey) {
        return { success: false, error: 'Project key is required' }
      }

      const cloudId = await this.getCloudId()
      if (!cloudId) {
        return { success: false, error: 'Cloud ID not available. Please reconnect to Atlassian.' }
      }

      const args: Record<string, unknown> = { 
        cloudId,
        projectIdOrKey
      }
      
      this.debugLog(`getAssignableUsers args: ${JSON.stringify(args)}`)
      const result = await this.callTool('getAssignableUsersForJiraIssue', args)
      return { success: true, data: result }
    } catch (error) {
      // If this tool doesn't exist, try alternative approach
      this.debugLog(`getAssignableUsers error: ${error instanceof Error ? error.message : String(error)}`)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to get assignable users' 
      }
    }
  }

  /**
   * Fetch all users from multiple projects (deduplicates)
   * Returns unique users that can be assigned across all selected projects
   */
  async fetchAllUsers(projectKeys: string[]): Promise<{
    success: boolean
    users?: Array<{
      accountId: string
      displayName: string
      emailAddress?: string
      avatarUrl?: string
      active: boolean
    }>
    error?: string
  }> {
    try {
      const usersMap = new Map<string, {
        accountId: string
        displayName: string
        emailAddress?: string
        avatarUrl?: string
        active: boolean
      }>()

      for (const projectKey of projectKeys) {
        const result = await this.getAssignableUsers(projectKey)
        
        if (result.success && result.data) {
          // Parse the MCP response
          const users = this.parseUsersFromResponse(result.data)
          
          for (const user of users) {
            if (user.accountId && !usersMap.has(user.accountId)) {
              usersMap.set(user.accountId, user)
            }
          }
        }
      }

      // If no users found via getAssignableUsers, try searching with common queries
      if (usersMap.size === 0) {
        this.debugLog('No users found via getAssignableUsers, trying lookupUser...')
        
        // Try searching with empty/wildcard to get all users
        // This is a fallback if getAssignableUsersForJiraIssue doesn't exist
        const searchQueries = ['a', 'e', 'i', 'o', 'u']  // Common letters to find most users
        
        for (const query of searchQueries) {
          try {
            const lookupResult = await this.lookupUser(query)
            if (lookupResult.success && lookupResult.data) {
              const users = this.parseUsersFromResponse(lookupResult.data)
              for (const user of users) {
                if (user.accountId && !usersMap.has(user.accountId)) {
                  usersMap.set(user.accountId, user)
                }
              }
            }
          } catch {
            // Continue with next query
          }
        }
      }

      return { 
        success: true, 
        users: Array.from(usersMap.values()) 
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch users'
      }
    }
  }

  /**
   * Parse users from MCP response
   */
  private parseUsersFromResponse(data: unknown): Array<{
    accountId: string
    displayName: string
    emailAddress?: string
    avatarUrl?: string
    active: boolean
  }> {
    const users: Array<{
      accountId: string
      displayName: string
      emailAddress?: string
      avatarUrl?: string
      active: boolean
    }> = []

    try {
      // MCP responses typically have content[0].text with JSON
      let rawData = data
      
      if (data && typeof data === 'object') {
        const content = (data as { content?: Array<{ text?: string }> }).content
        if (content && content[0] && content[0].text) {
          try {
            rawData = JSON.parse(content[0].text)
          } catch {
            // Use as-is
          }
        }
      }

      // Handle array of users
      if (Array.isArray(rawData)) {
        for (const item of rawData) {
          if (item.accountId) {
            users.push({
              accountId: item.accountId,
              displayName: item.displayName || item.name || item.accountId,
              emailAddress: item.emailAddress || item.email,
              avatarUrl: item.avatarUrls?.['48x48'] || item.avatarUrl,
              active: item.active !== false  // Default to true if not specified
            })
          }
        }
      } else if (rawData && typeof rawData === 'object' && (rawData as Record<string, unknown>).accountId) {
        // Single user object
        const item = rawData as Record<string, unknown>
        users.push({
          accountId: item.accountId as string,
          displayName: (item.displayName || item.name || item.accountId) as string,
          emailAddress: (item.emailAddress || item.email) as string | undefined,
          avatarUrl: ((item.avatarUrls as Record<string, string>)?.['48x48'] || item.avatarUrl) as string | undefined,
          active: item.active !== false
        })
      }
    } catch (error) {
      this.debugLog(`Error parsing users: ${error instanceof Error ? error.message : String(error)}`)
    }

    return users
  }

  /**
   * Sync all metadata for selected projects
   * This fetches issue types and custom fields for each project
   */
  async syncProjectMetadata(projectKeys: string[]): Promise<{
    success: boolean
    data?: Record<string, {
      project: JiraProject
      issueTypes: JiraIssueType[]
      fieldsByIssueType: Record<string, JiraField[]>
    }>
    error?: string
  }> {
    try {
      const metadata: Record<string, {
        project: JiraProject
        issueTypes: JiraIssueType[]
        fieldsByIssueType: Record<string, JiraField[]>
      }> = {}

      // Get all visible projects first
      const projectsResult = await this.getVisibleProjects()
      if (!projectsResult.success) {
        return { success: false, error: projectsResult.error }
      }

      // Parse projects from MCP response
      const allProjects = this.parseProjectsFromResponse(projectsResult.data)
      this.debugLog(`Found ${allProjects.length} projects`)
      
      for (const projectKey of projectKeys) {
        this.debugLog(`Syncing metadata for project: ${projectKey}`)
        
        // Find project info
        const project = allProjects.find(p => p.key === projectKey || p.id === projectKey)
        if (!project) {
          console.warn(`[MCP] Project ${projectKey} not found in ${allProjects.map(p => p.key).join(', ')}`)
          continue
        }

        // Get issue types for this project
        const issueTypesResult = await this.getProjectIssueTypes(projectKey)
        if (!issueTypesResult.success) {
          console.warn(`[MCP] Failed to get issue types for ${projectKey}:`, issueTypesResult.error)
          continue
        }

        const issueTypes = this.parseIssueTypesFromResponse(issueTypesResult.data)
        this.debugLog(`Found ${issueTypes.length} issue types for ${projectKey}`)
        
        const fieldsByIssueType: Record<string, JiraField[]> = {}

        // Get fields for each issue type
        for (const issueType of issueTypes) {
          this.debugLog(`Fetching fields for ${projectKey}/${issueType.name} (${issueType.id})`)
          const fieldsResult = await this.getIssueTypeFieldMetadata(projectKey, issueType.id)
          if (fieldsResult.success && fieldsResult.data) {
            fieldsByIssueType[issueType.id] = this.parseFieldsFromResponse(fieldsResult.data)
            this.debugLog(`Found ${fieldsByIssueType[issueType.id].length} fields for ${issueType.name}`)
          }
        }

        metadata[projectKey] = {
          project,
          issueTypes,
          fieldsByIssueType
        }
      }

      return { success: true, data: metadata }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to sync metadata'
      }
    }
  }

  /**
   * Parse projects from MCP response
   */
  private parseProjectsFromResponse(data: unknown): JiraProject[] {
    const projects: JiraProject[] = []
    
    try {
      let rawData = data
      
      if (data && typeof data === 'object') {
        const content = (data as { content?: Array<{ text?: string }> }).content
        if (content && content[0] && content[0].text) {
          try {
            rawData = JSON.parse(content[0].text)
          } catch {
            // Use as-is
          }
        }
      }

      // Handle paginated response with values array
      let projectsArray: unknown[]
      if (rawData && typeof rawData === 'object' && Array.isArray((rawData as { values?: unknown[] }).values)) {
        projectsArray = (rawData as { values: unknown[] }).values
      } else if (Array.isArray(rawData)) {
        projectsArray = rawData
      } else {
        return projects
      }

      for (const item of projectsArray) {
        const p = item as Record<string, unknown>
        if (p.key && p.id) {
          projects.push({
            id: p.id as string,
            key: p.key as string,
            name: (p.name || p.key) as string,
            projectTypeKey: (p.projectTypeKey || 'software') as string,
            avatarUrls: p.avatarUrls as Record<string, string> | undefined
          })
        }
      }
    } catch (error) {
      this.debugLog(`Error parsing projects: ${error instanceof Error ? error.message : String(error)}`)
    }

    return projects
  }

  /**
   * Parse issue types from MCP response
   */
  private parseIssueTypesFromResponse(data: unknown): JiraIssueType[] {
    const issueTypes: JiraIssueType[] = []
    
    try {
      let rawData = data
      
      if (data && typeof data === 'object') {
        const content = (data as { content?: Array<{ text?: string }> }).content
        if (content && content[0] && content[0].text) {
          try {
            rawData = JSON.parse(content[0].text)
          } catch {
            // Use as-is
          }
        }
      }

      // Handle various response formats
      let issueTypesArray: unknown[]
      if (rawData && typeof rawData === 'object' && Array.isArray((rawData as { issueTypes?: unknown[] }).issueTypes)) {
        issueTypesArray = (rawData as { issueTypes: unknown[] }).issueTypes
      } else if (rawData && typeof rawData === 'object' && Array.isArray((rawData as { values?: unknown[] }).values)) {
        issueTypesArray = (rawData as { values: unknown[] }).values
      } else if (Array.isArray(rawData)) {
        issueTypesArray = rawData
      } else {
        return issueTypes
      }

      for (const item of issueTypesArray) {
        const it = item as Record<string, unknown>
        if (it.id && it.name) {
          issueTypes.push({
            id: it.id as string,
            name: it.name as string,
            description: it.description as string | undefined,
            subtask: (it.subtask === true),
            hierarchyLevel: (it.hierarchyLevel as number) || 0,
            iconUrl: it.iconUrl as string | undefined
          })
        }
      }
    } catch (error) {
      this.debugLog(`Error parsing issue types: ${error instanceof Error ? error.message : String(error)}`)
    }

    return issueTypes
  }

  /**
   * Parse fields from MCP response
   */
  private parseFieldsFromResponse(data: unknown): JiraField[] {
    const fields: JiraField[] = []
    
    try {
      let rawData = data
      
      if (data && typeof data === 'object') {
        const content = (data as { content?: Array<{ text?: string }> }).content
        if (content && content[0] && content[0].text) {
          try {
            rawData = JSON.parse(content[0].text)
          } catch {
            // Use as-is
          }
        }
      }

      // Handle various response formats
      let fieldsArray: unknown[]
      if (rawData && typeof rawData === 'object' && Array.isArray((rawData as { fields?: unknown[] }).fields)) {
        fieldsArray = (rawData as { fields: unknown[] }).fields
      } else if (rawData && typeof rawData === 'object' && Array.isArray((rawData as { values?: unknown[] }).values)) {
        fieldsArray = (rawData as { values: unknown[] }).values
      } else if (Array.isArray(rawData)) {
        fieldsArray = rawData
      } else {
        return fields
      }

      for (const item of fieldsArray) {
        const f = item as Record<string, unknown>
        const fieldId = (f.fieldId || f.id || f.key) as string
        if (fieldId) {
          fields.push({
            fieldId,
            key: (f.key || fieldId) as string,
            name: (f.name || fieldId) as string,
            required: (f.required === true),
            hasDefaultValue: (f.hasDefaultValue === true),
            schema: (f.schema || { type: 'string' }) as JiraField['schema'],
            allowedValues: f.allowedValues as JiraField['allowedValues']
          })
        }
      }
    } catch (error) {
      this.debugLog(`Error parsing fields: ${error instanceof Error ? error.message : String(error)}`)
    }

    return fields
  }

  /**
   * Comprehensive metadata sync - fetches projects, issue types, fields, AND users
   * Call this after connection to populate all knowledge for the AI
   */
  async syncAllMetadata(projectKeys: string[]): Promise<{
    success: boolean
    metadata?: {
      projects: Record<string, {
        project: JiraProject
        issueTypes: JiraIssueType[]
        fieldsByIssueType: Record<string, JiraField[]>
      }>
      users: Array<{
        accountId: string
        displayName: string
        emailAddress?: string
        avatarUrl?: string
        active: boolean
      }>
    }
    error?: string
  }> {
    this.debugLog(`Starting comprehensive metadata sync for projects: ${projectKeys.join(', ')}`)
    
    try {
      // Sync project metadata (issue types, fields)
      const projectResult = await this.syncProjectMetadata(projectKeys)
      if (!projectResult.success) {
        return { success: false, error: projectResult.error }
      }

      // Fetch users
      const usersResult = await this.fetchAllUsers(projectKeys)
      
      return {
        success: true,
        metadata: {
          projects: projectResult.data || {},
          users: usersResult.users || []
        }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to sync all metadata'
      }
    }
  }
}

// Singleton instance
let mcpService: AtlassianMCPService | null = null

export function getAtlassianMCPService(): AtlassianMCPService {
  if (!mcpService) {
    mcpService = new AtlassianMCPService()
  }
  return mcpService
}
