import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import path from 'path'
import { EncryptionService } from './services/encryption'
import { StorageService } from './services/storage'
import { FileService } from './services/files'
import { AIService } from './services/ai'
import { OCRConfig, OCRService } from './services/ocr'
import { ModelCatalogService } from './services/model-catalog'
import { AIConfig, ModelProvider, getDefaultModelId } from '../src/shared/modelCatalog'
import { getAtlassianMCPService, AtlassianMCPService } from './services/atlassian-mcp'
import { getJiraAttachmentService, JiraAttachmentService } from './services/jira-attachment'
import { ConnectorsService } from './services/connectors'
import type { ContextEnvelope, ToolResult } from '../src/connectors/contract'
import { normalizeMcpResult } from '../src/connectors/contract'
import type { ProjectContext } from '../src/context/types'
import { getMemoryService, MemoryService } from './services/memory'
import { getContextService, ContextService } from './services/contexts'
import { getSourceMemoryService } from './services/sourceMemory'
import { SourceMemoryLeafInput } from '../src/memory/sourceTypes'

// Services
let encryptionService: EncryptionService
let storageService: StorageService
let fileService: FileService | null = null
let aiService: AIService | null = null
let mcpService: AtlassianMCPService | null = null
let jiraAttachmentService: JiraAttachmentService | null = null
let modelCatalogService: ModelCatalogService | null = null
let connectorsService: ConnectorsService | null = null
let contextService: ContextService | null = null

/** A connected MCP server that can answer generic tool calls from connectors. */
interface McpServerHandle {
  callRawTool(toolName: string, args: Record<string, unknown>): Promise<unknown>
}

/**
 * Registry of MCP servers indexed by serverId, resolved lazily so a server is
 * only constructed when a connector actually calls it. Add a server = add an
 * entry here; the broker stays connector-neutral.
 */
const mcpServerRegistry: Record<string, () => McpServerHandle> = {
  atlassian: () => getAtlassianMCPService(),
}

function resolveMcpServer(serverId: string): McpServerHandle {
  const factory = mcpServerRegistry[serverId]
  if (!factory) throw new Error(`Unknown MCP server: ${serverId}`)
  return factory()
}

async function uploadJiraAttachmentFromWorkspace(issueKey: string, filePath: string): Promise<ToolResult> {
  if (!fileService) return { success: false, error: 'Workspace not configured' }

  const baseUrl = storageService.getSecure('connector:jira:baseUrl')
  const email = storageService.getSecure('connector:jira:email')
  const apiToken = storageService.getSecure('connector:jira:apiToken')

  if (!baseUrl || !email || !apiToken) {
    const missing = [
      !baseUrl && 'Site URL',
      !email && 'Email',
      !apiToken && 'API token',
    ].filter(Boolean)
    return {
      success: false,
      error: `Jira attachment credentials incomplete. Missing: ${missing.join(', ')}. Configure them in Connectors → Jira.`,
    }
  }

  jiraAttachmentService = getJiraAttachmentService({ baseUrl, email, apiToken })
  const fullPath = fileService.getFullPath(filePath)
  return jiraAttachmentService.uploadAttachment(issueKey, fullPath)
}

function ensureContextService(): ContextService {
  contextService = getContextService()
  const workspace = storageService.getWorkspacePath()
  if (workspace) contextService.setWorkspace(workspace)
  return contextService
}

function listContextsWithMigration(): ProjectContext[] {
  const service = ensureContextService()
  const workspace = storageService.getWorkspacePath()
  if (!workspace) return []

  const legacy = storageService.getContexts()
  if (legacy.length > 0) {
    service.migrateLegacyContexts(legacy)
    storageService.set('contexts', [])
  }

  return service.list()
}

/** Lazily construct the connector runtime with its capability broker dependencies. */
function getConnectorsService(): ConnectorsService {
  if (!connectorsService) {
    connectorsService = new ConnectorsService(
      {
        readFile: async (relativePath: string) => {
          if (!fileService) return { success: false, error: 'Workspace not configured' }
          return fileService.readFile(relativePath) as Promise<{ success: boolean; data?: string; error?: string }>
        },
        mcpCall: async (serverId: string, toolName: string, args: Record<string, unknown>) => {
          if (serverId === 'atlassian') {
            const blocked = await ensureAtlassianMcpConnected()
            if (blocked) return blocked
          }
          const raw = await resolveMcpServer(serverId).callRawTool(toolName, args)
          return normalizeMcpResult(raw)
        },
        getSecret: (connectorId: string, key: string) =>
          storageService.getSecure(`connector:${connectorId}:${key}`),
        saveKnowledge: (contextId: string, connectorId: string, markdown: string) =>
          storageService.setConnectorKnowledge(contextId, connectorId, markdown),
        getKnowledge: (contextId: string, connectorId: string) =>
          storageService.getConnectorKnowledge(contextId, connectorId),
        hostCall: async (capability, params) => {
          if (capability === 'jira.uploadAttachment') {
            const issueKey = String(params.issueKey || '')
            const filePath = String(params.filePath || '')
            if (!issueKey || !filePath) {
              return { success: false, error: 'issueKey and filePath are required' }
            }
            return uploadJiraAttachmentFromWorkspace(issueKey, filePath)
          }
          return { success: false, error: `Host capability not implemented: ${capability}` }
        },
      },
      path.join(__dirname, 'connector-sandbox.js'),
    )
  }
  return connectorsService
}

let mainWindow: BrowserWindow | null = null
let mcpKeepAliveInterval: NodeJS.Timeout | null = null
let mcpConnectionState: 'disconnected' | 'connecting' | 'oauth_pending' | 'connected' | 'error' = 'disconnected'
let memoryService: MemoryService | null = null

// Keep-alive interval in milliseconds (10 minutes)
const MCP_KEEPALIVE_INTERVAL = 10 * 60 * 1000

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

/** Keep in sync with --mac-titlebar-height in src/theme/tokens.css */
const MAC_TITLEBAR_HEIGHT_PX = 28
/** macOS traffic-light cluster height (frameless + hidden title bar). */
const MAC_TRAFFIC_LIGHT_CLUSTER_HEIGHT_PX = 12

function getMacWindowButtonY(): number {
  return Math.round((MAC_TITLEBAR_HEIGHT_PX - MAC_TRAFFIC_LIGHT_CLUSTER_HEIGHT_PX) / 2)
}

function applyMacWindowButtonPosition(win: BrowserWindow) {
  // Electron 28+ renamed setTrafficLightPosition → setWindowButtonPosition
  win.setWindowButtonPosition({ x: 16, y: getMacWindowButtonY() })
}

function getConfiguredOcrService(): OCRService | null {
  const configStr = storageService.getSecure('ocrConfig')
  if (!configStr) return null

  try {
    const config = JSON.parse(configStr) as OCRConfig
    if (!config.apiKey) return null
    return new OCRService(config)
  } catch {
    return null
  }
}

function withReasoningDefault(config: AIConfig): AIConfig {
  return {
    ...config,
    model: config.model || getDefaultModelId(config.provider, 'reasoning'),
  }
}

// Prevent multiple instances from opening (common in vite-plugin-electron dev mode
// when both main.ts and preload.ts trigger their onstart callbacks simultaneously).
if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

// When a second instance tries to start, focus the existing window instead.
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    // Frameless on macOS so button Y aligns with our .mac-titlebar (hiddenInset uses a taller system inset).
    ...(process.platform === 'darwin'
      ? {
          frame: false,
          titleBarStyle: 'hidden',
          trafficLightPosition: { x: 16, y: getMacWindowButtonY() },
        }
      : { frame: false }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  if (isDev) {
    const devServerUrl = process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5173'
    mainWindow.loadURL(devServerUrl)
    // Open DevTools only when explicitly requested via SMILE_DEVTOOLS=1
    if (process.env.SMILE_DEVTOOLS === '1') {
      mainWindow.webContents.openDevTools()
    }
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  if (process.platform === 'darwin' && mainWindow) {
    mainWindow.once('ready-to-show', () => {
      if (mainWindow) {
        applyMacWindowButtonPosition(mainWindow)
        mainWindow.show()
      }
    })
  } else if (mainWindow) {
    mainWindow.once('ready-to-show', () => mainWindow?.show())
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// Initialize services
async function initializeServices() {
  encryptionService = new EncryptionService()
  storageService = new StorageService(encryptionService)
  modelCatalogService = new ModelCatalogService(storageService)

  // Initialize File service if workspace is set
  const workspace = await storageService.getWorkspacePath()
  if (workspace) {
    fileService = new FileService(workspace, getConfiguredOcrService)
    // Initialize memory service with workspace
    memoryService = getMemoryService()
    memoryService.setWorkspace(workspace)
    getSourceMemoryService().setWorkspace(workspace)
    getConnectorsService().setWorkspace(workspace)
    ensureContextService()
  }

  void modelCatalogService.refreshAll().catch(error => {
    console.warn('[ModelCatalog] Startup refresh failed:', error instanceof Error ? error.message : error)
  })
}

function attachMcpServiceListeners(service: AtlassianMCPService) {
  service.removeAllListeners('oauth-started')
  service.removeAllListeners('disconnected')
  service.removeAllListeners('error')

  service.on('oauth-started', () => {
    sendMcpConnectionState('oauth_pending')
  })

  service.on('disconnected', () => {
    if (mcpConnectionState === 'connecting' || mcpConnectionState === 'oauth_pending') {
      sendMcpConnectionState(
        'error',
        'MCP connection closed before setup finished. Complete OAuth in the browser if it opened, then reconnect.',
      )
      return
    }
    if (mcpConnectionState === 'connected') {
      sendMcpConnectionState('disconnected')
    }
  })

  service.on('error', (err: Error) => {
    if (mcpConnectionState === 'connecting' || mcpConnectionState === 'oauth_pending') {
      sendMcpConnectionState('error', err.message)
    }
  })
}

// Send MCP connection state to renderer
function sendMcpConnectionState(state: typeof mcpConnectionState, error?: string) {
  mcpConnectionState = state
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('mcp:connectionState', { state, error })
  }
}

async function connectAtlassianMcp(options?: { forceReauth?: boolean }): Promise<{ success: boolean; error?: string }> {
  stopMcpKeepAlive()
  sendMcpConnectionState('connecting')
  mcpService = getAtlassianMCPService()
  attachMcpServiceListeners(mcpService)
  const result = await mcpService.connect({ forceReauth: options?.forceReauth ?? false })
  if (result.success) {
    storageService.set('atlassianMcpAutoConnect', true)
    sendMcpConnectionState('connected')
    startMcpKeepAlive()
  } else {
    sendMcpConnectionState('error', result.error)
  }
  return result
}

/** Reconnect using stored OAuth when the proxy was stopped (app restart) but tokens remain on disk. */
async function ensureAtlassianMcpConnected(): Promise<ToolResult | null> {
  const service = getAtlassianMCPService()
  if (service.getConnectionStatus()) return null

  if (!service.hasStoredAuth()) {
    return {
      success: false,
      error: 'Atlassian MCP is not connected. Open Connectors → Jira and connect your account.',
    }
  }

  console.log('[MCP] Restoring Atlassian session from stored OAuth')
  const result = await connectAtlassianMcp()
  if (!result.success) {
    return { success: false, error: result.error || 'Failed to connect to Atlassian MCP' }
  }
  return null
}

async function autoConnectAtlassianMcpOnStartup(): Promise<void> {
  const service = getAtlassianMCPService()
  if (storageService.get('atlassianMcpAutoConnect') === false) {
    console.log('[MCP] User disconnected Atlassian MCP — skipping auto-connect')
    return
  }
  if (!service.hasStoredAuth()) {
    console.log('[MCP] No stored Atlassian OAuth session — skipping auto-connect')
    return
  }
  if (service.getConnectionStatus()) return

  console.log('[MCP] Auto-connecting Atlassian MCP from stored OAuth')
  const result = await connectAtlassianMcp()
  if (!result.success) {
    console.warn('[MCP] Auto-connect failed:', result.error)
    sendMcpConnectionState('disconnected')
  }
}

// Start keep-alive interval
function startMcpKeepAlive() {
  // Clear any existing interval
  if (mcpKeepAliveInterval) {
    clearInterval(mcpKeepAliveInterval)
  }

  console.log('[MCP] Starting keep-alive (interval: 10 minutes)')
  
  mcpKeepAliveInterval = setInterval(async () => {
    if (!mcpService) {
      console.log('[MCP] Keep-alive: No MCP service, stopping')
      stopMcpKeepAlive()
      return
    }

    const isConnected = mcpService.getConnectionStatus()
    console.log(`[MCP] Keep-alive check: connected=${isConnected}`)

    if (!isConnected) {
      console.log('[MCP] Keep-alive: Connection lost, attempting reconnect...')
      sendMcpConnectionState('connecting')
      
      try {
        const result = await connectAtlassianMcp()
        if (result.success) {
          console.log('[MCP] Keep-alive: Reconnected successfully')
        } else {
          console.log('[MCP] Keep-alive: Reconnect failed:', result.error)
          sendMcpConnectionState('error', result.error)
        }
      } catch (error) {
        console.error('[MCP] Keep-alive: Reconnect error:', error)
        sendMcpConnectionState('error', error instanceof Error ? error.message : 'Reconnection failed')
      }
    } else {
      // Connection is alive, just confirm state
      sendMcpConnectionState('connected')
    }
  }, MCP_KEEPALIVE_INTERVAL)
}

// Stop keep-alive interval
function stopMcpKeepAlive() {
  if (mcpKeepAliveInterval) {
    clearInterval(mcpKeepAliveInterval)
    mcpKeepAliveInterval = null
    console.log('[MCP] Keep-alive stopped')
  }
}

// IPC Handlers

// Storage
ipcMain.handle('storage:get', async (_, key: string) => {
  return storageService.get(key)
})

ipcMain.handle('storage:set', async (_, key: string, value: unknown) => {
  return storageService.set(key, value)
})

ipcMain.handle('storage:getSecure', async (_, key: string) => {
  return storageService.getSecure(key)
})

ipcMain.handle('storage:setSecure', async (_, key: string, value: string) => {
  return storageService.setSecure(key, value)
})

// Window controls
ipcMain.handle('window:minimize', async () => {
  mainWindow?.minimize()
})

ipcMain.handle('window:toggleMaximize', async () => {
  if (!mainWindow) return
  if (mainWindow.isMaximized()) mainWindow.unmaximize()
  else mainWindow.maximize()
})

ipcMain.handle('window:close', async () => {
  mainWindow?.close()
})

// Model catalog
ipcMain.handle('models:getCatalog', async () => {
  if (!modelCatalogService) return { success: false, error: 'Model catalog not initialized' }
  return { success: true, data: modelCatalogService.getCatalog() }
})

ipcMain.handle('models:refresh', async () => {
  if (!modelCatalogService) return { success: false, error: 'Model catalog not initialized' }
  try {
    return { success: true, data: await modelCatalogService.refreshAll() }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to refresh model catalog' }
  }
})

ipcMain.handle('models:refreshProvider', async (_, provider: ModelProvider) => {
  if (!modelCatalogService) return { success: false, error: 'Model catalog not initialized' }
  try {
    return { success: true, data: await modelCatalogService.refreshProviderFromStorage(provider) }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to refresh provider models' }
  }
})

// File operations
ipcMain.handle('file:selectWorkspace', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: 'Select Workspace Folder'
  })
  
  if (!result.canceled && result.filePaths.length > 0) {
    const workspacePath = result.filePaths[0]
    await storageService.setWorkspacePath(workspacePath)
    fileService = new FileService(workspacePath, getConfiguredOcrService)
    memoryService = getMemoryService()
    memoryService.setWorkspace(workspacePath)
    getSourceMemoryService().setWorkspace(workspacePath)
    getConnectorsService().setWorkspace(workspacePath)
    ensureContextService()
    return { success: true, path: workspacePath }
  }
  return { success: false }
})

ipcMain.handle('file:getWorkspace', async () => {
  return storageService.getWorkspacePath()
})

// Pick a folder inside the current workspace, returning a workspace-relative path.
ipcMain.handle('file:selectFolderInWorkspace', async () => {
  const workspace = await storageService.getWorkspacePath()
  if (!workspace) return { success: false, error: 'Workspace not configured' }

  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: 'Select Folder',
    defaultPath: workspace,
  })
  if (result.canceled || result.filePaths.length === 0) return { success: false }

  const selected = result.filePaths[0]
  const relative = path.relative(workspace, selected)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return { success: false, error: 'Folder must be inside the workspace' }
  }
  // Normalize to forward slashes; empty string means the workspace root.
  return { success: true, path: relative.split(path.sep).join('/') }
})

ipcMain.handle('file:list', async (_, relativePath?: string) => {
  if (!fileService) return { success: false, error: 'Workspace not configured' }
  return fileService.listFiles(relativePath)
})

ipcMain.handle('file:read', async (_, relativePath: string) => {
  if (!fileService) return { success: false, error: 'Workspace not configured' }
  return fileService.readFile(relativePath)
})

ipcMain.handle('file:readOcr', async (_, relativePath: string) => {
  if (!fileService) return { success: false, error: 'Workspace not configured' }
  return fileService.readFileWithOcr(relativePath)
})

ipcMain.handle('file:write', async (_, relativePath: string, content: string) => {
  if (!fileService) return { success: false, error: 'Workspace not configured' }
  return fileService.writeFile(relativePath, content)
})

ipcMain.handle('file:mkdir', async (_, relativePath: string) => {
  if (!fileService) return { success: false, error: 'Workspace not configured' }
  return fileService.createDirectory(relativePath)
})

ipcMain.handle('file:exists', async (_, relativePath: string) => {
  if (!fileService) return { success: false, error: 'Workspace not configured' }
  return fileService.exists(relativePath)
})

ipcMain.handle('file:search', async (_, pattern: string, directory?: string) => {
  if (!fileService) return { success: false, error: 'Workspace not configured' }
  return fileService.searchFiles(pattern, directory || '')
})

ipcMain.handle('file:getFileInfo', async (_, relativePath: string) => {
  if (!fileService) return { success: false, error: 'Workspace not configured' }
  return fileService.getFileInfo(relativePath)
})

ipcMain.handle('file:ensureAttachmentsDir', async () => {
  if (!fileService) return { success: false, error: 'Workspace not configured' }
  return fileService.ensureAttachmentsDir()
})

ipcMain.handle('file:saveAttachment', async (_, fileName: string, data: ArrayBuffer) => {
  if (!fileService) return { success: false, error: 'Workspace not configured' }
  return fileService.saveAttachment(fileName, Buffer.from(data))
})

// AI Service
let reasoningAiService: AIService | null = null

ipcMain.handle('ai:configure', async (_, config: AIConfig) => {
  aiService = new AIService(config)
  return { success: true }
})

// Reasoning model configuration (replaces the old "planner" concept)
ipcMain.handle('ai:configureReasoning', async (_, config: AIConfig) => {
  reasoningAiService = new AIService(withReasoningDefault(config))
  return { success: true }
})

// Legacy alias — kept so old plannerConfig stored values still work on first load
ipcMain.handle('ai:configurePlanner', async (_, config: AIConfig) => {
  reasoningAiService = new AIService(withReasoningDefault(config))
  return { success: true }
})

ipcMain.handle('ai:chatReasoning', async (_, messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>, tools?: unknown[]) => {
  if (!reasoningAiService) {
    // Auto-load from storage on first use
    const cfgStr = storageService.getSecure('reasoningConfig') || storageService.getSecure('plannerConfig')
    if (cfgStr) {
      try { reasoningAiService = new AIService(withReasoningDefault(JSON.parse(cfgStr) as AIConfig)) }
      catch { return { success: false, error: 'Reasoning model not configured' } }
    } else {
      return { success: false, error: 'Reasoning model not configured' }
    }
  }
  try {
    const response = await reasoningAiService.chat(messages, tools as Array<{
      type: 'function'
      function: { name: string; description: string; parameters: Record<string, unknown> }
    }>)
    return { success: true, data: response }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Reasoning model request failed'
    console.error('[AI:chatReasoning] Error:', msg)
    return { success: false, error: msg }
  }
})

// Legacy — kept for backward compatibility
ipcMain.handle('ai:plan', async (_, messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>) => {
  if (!reasoningAiService) {
    return { success: false, error: 'Reasoning model not configured' }
  }
  try {
    const response = await reasoningAiService.chat(messages)
    return { success: true, plan: response.content }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Request failed'
    return { success: false, error: msg }
  }
})

ipcMain.handle('ai:chat', async (_, messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>, tools?: unknown[]) => {
  if (!aiService) {
    const aiConfigStr = storageService.getSecure('aiConfig')
    if (aiConfigStr) {
      try { aiService = new AIService(JSON.parse(aiConfigStr)) }
      catch { return { success: false, error: 'AI not configured' } }
    } else {
      return { success: false, error: 'AI not configured' }
    }
  }
  try {
    const response = await aiService.chat(messages, tools as Array<{
      type: 'function'
      function: { name: string; description: string; parameters: Record<string, unknown> }
    }>)
    return { success: true, data: response }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'AI request failed'
    console.error('[AI:chat] Error:', msg)
    return { success: false, error: msg }
  }
})

// Streaming version — uses ipcMain.on (not handle) so we can push tokens back
ipcMain.on('ai:chat:stream', async (event, messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>, tools?: unknown[]) => {
  if (!aiService) {
    const aiConfigStr = storageService.getSecure('aiConfig')
    if (aiConfigStr) {
      try { aiService = new AIService(JSON.parse(aiConfigStr)) }
      catch { event.sender.send('ai:stream:error', 'AI not configured'); return }
    } else {
      event.sender.send('ai:stream:error', 'AI not configured'); return
    }
  }
  try {
    const response = await aiService.chatStream(
      messages,
      tools as Array<{ type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }>,
      (token: string) => {
        if (!event.sender.isDestroyed()) event.sender.send('ai:stream:token', token)
      },
      (progress) => {
        if (!event.sender.isDestroyed()) event.sender.send('ai:stream:progress', progress)
      },
    )
    if (!event.sender.isDestroyed()) event.sender.send('ai:stream:done', response)
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'AI stream failed'
    console.error('[AI:stream] Error:', msg)
    if (!event.sender.isDestroyed()) event.sender.send('ai:stream:error', msg)
  }
})

ipcMain.on('ai:abortStream', () => {
  aiService?.abortStream()
  reasoningAiService?.abortStream()
})

// Streaming version for the reasoning model
ipcMain.on('ai:reasoning:stream', async (event, messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>, tools?: unknown[]) => {
  if (!reasoningAiService) {
    const cfgStr = storageService.getSecure('reasoningConfig') || storageService.getSecure('plannerConfig')
    if (cfgStr) {
      try { reasoningAiService = new AIService(withReasoningDefault(JSON.parse(cfgStr) as AIConfig)) }
      catch { event.sender.send('ai:reasoning:stream:error', 'Reasoning model not configured'); return }
    } else {
      event.sender.send('ai:reasoning:stream:error', 'Reasoning model not configured'); return
    }
  }
  try {
    const response = await reasoningAiService.chatStream(
      messages,
      tools as Array<{ type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }>,
      (token: string) => {
        if (!event.sender.isDestroyed()) event.sender.send('ai:reasoning:stream:token', token)
      },
      (progress) => {
        if (!event.sender.isDestroyed()) event.sender.send('ai:reasoning:stream:progress', progress)
      },
    )
    if (!event.sender.isDestroyed()) event.sender.send('ai:reasoning:stream:done', response)
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Reasoning stream failed'
    console.error('[AI:reasoning:stream] Error:', msg)
    if (!event.sender.isDestroyed()) event.sender.send('ai:reasoning:stream:error', msg)
  }
})

// ============================================
// ATLASSIAN MCP HANDLERS
// ============================================

ipcMain.handle('mcp:connect', async (_, options?: { forceReauth?: boolean }) => {
  try {
    return await connectAtlassianMcp(options)
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'MCP connection failed'
    sendMcpConnectionState('error', errorMsg)
    return { success: false, error: errorMsg }
  }
})

ipcMain.handle('mcp:disconnect', async () => {
  stopMcpKeepAlive()
  storageService.set('atlassianMcpAutoConnect', false)
  sendMcpConnectionState('disconnected')
  if (mcpService) {
    await mcpService.disconnect()
    mcpService = null
  }
  return { success: true }
})

ipcMain.handle('mcp:status', async () => {
  return {
    connected: mcpService?.getConnectionStatus() ?? false,
  }
})

ipcMain.handle('mcp:getConnectionState', async () => {
  return {
    state: mcpConnectionState,
    connected: mcpService?.getConnectionStatus() ?? false,
  }
})

// Open external URL (for OAuth)
ipcMain.handle('shell:openExternal', async (_, url: string) => {
  await shell.openExternal(url)
  return { success: true }
})

// Declarative connectors (sandboxed plugins)
ipcMain.handle('connectors:list', async () => {
  try {
    return { success: true, data: await getConnectorsService().listForRenderer() }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})

ipcMain.handle(
  'connectors:execute',
  async (_, connectorId: string, name: string, args: Record<string, unknown>, context?: ContextEnvelope) => {
    try {
      return await getConnectorsService().executeTool(connectorId, name, args, context)
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  },
)

ipcMain.handle(
  'connectors:approve',
  async (_, connectorId: string, actionType: string, data: Record<string, unknown>, context?: ContextEnvelope) => {
    try {
      return await getConnectorsService().approveAction(connectorId, actionType, data, context)
    } catch (error) {
      return { handled: false, message: error instanceof Error ? error.message : String(error) }
    }
  },
)

ipcMain.handle('connectors:getKnowledge', async (_, contextId: string, connectorId: string) => {
  try {
    return { success: true, data: getConnectorsService().getKnowledge(contextId, connectorId) }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})

ipcMain.handle('connectors:saveKnowledge', async (_, contextId: string, connectorId: string, markdown: string) => {
  try {
    storageService.setConnectorKnowledge(contextId, connectorId, markdown)
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})

ipcMain.handle('connectors:deletePackage', async (_, connectorId: string) => {
  try {
    await getConnectorsService().deletePackage(connectorId)
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})

ipcMain.handle('connectors:installPackage', async (_, connectorId: string) => {
  try {
    const manifest = await getConnectorsService().installBundledPackage(connectorId)
    return { success: true, data: manifest }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})

ipcMain.handle('connectors:getIcon', async (_, connectorId: string) => {
  try {
    return { success: true, data: await getConnectorsService().getIconDataUrl(connectorId) }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})

ipcMain.handle('connectors:getBundledIcon', async (_, connectorId: string) => {
  try {
    return { success: true, data: getConnectorsService().getBundledIconDataUrl(connectorId) }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})

// Project contexts (Context management)
ipcMain.handle('contexts:list', async () => {
  try {
    return { success: true, data: listContextsWithMigration() }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})

ipcMain.handle('contexts:create', async (_, name: string) => {
  try {
    const service = ensureContextService()
    if (!storageService.getWorkspacePath()) {
      return { success: false, error: 'Workspace not configured' }
    }
    const created = service.create(name)
    return { success: true, data: listContextsWithMigration(), context: created }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})

ipcMain.handle('contexts:save', async (_, context: ProjectContext) => {
  try {
    const service = ensureContextService()
    service.update(context)
    return { success: true, data: listContextsWithMigration() }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})

ipcMain.handle('contexts:delete', async (_, contextId: string) => {
  try {
    const service = ensureContextService()
    service.delete(contextId)
    return { success: true, data: listContextsWithMigration() }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})

ipcMain.handle('contexts:readMarkdown', async (_, contextId: string) => {
  try {
    const service = ensureContextService()
    return { success: true, data: service.readMarkdown(contextId) }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})

ipcMain.handle('contexts:getPromptBody', async (_, contextId: string) => {
  try {
    const service = ensureContextService()
    return { success: true, data: service.getPromptBody(contextId) }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})

ipcMain.handle('contexts:appendSection', async (_, contextId: string, section: string, content: string) => {
  try {
    const service = ensureContextService()
    const markdown = service.appendSection(contextId, section, content)
    return { success: true, data: markdown }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})

ipcMain.handle('contexts:replaceSection', async (_, contextId: string, heading: string, content: string) => {
  try {
    const service = ensureContextService()
    const markdown = service.replaceSection(contextId, heading, content)
    return { success: true, data: markdown }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})

// ============================================
// MEMORY HANDLERS
// ============================================

ipcMain.handle('memory:getAll', async () => {
  if (!memoryService) {
    // Try to initialize with workspace
    const workspace = await storageService.getWorkspacePath()
    if (workspace) {
      memoryService = getMemoryService()
      memoryService.setWorkspace(workspace)
    } else {
      return { success: false, error: 'Workspace not configured' }
    }
  }
  try {
    const memories = await memoryService.getMemories()
    return { success: true, data: memories }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to load memories' }
  }
})

ipcMain.handle('memory:save', async (_, memory: unknown) => {
  if (!memoryService) {
    const workspace = await storageService.getWorkspacePath()
    if (workspace) {
      memoryService = getMemoryService()
      memoryService.setWorkspace(workspace)
    } else {
      return { success: false, error: 'Workspace not configured' }
    }
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await memoryService.saveMemories(memory as any)
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to save memories' }
  }
})

ipcMain.handle('memory:saveUserMarkdown', async (_, markdown: string) => {
  if (!memoryService) {
    const workspace = await storageService.getWorkspacePath()
    if (workspace) {
      memoryService = getMemoryService()
      memoryService.setWorkspace(workspace)
    } else {
      return { success: false, error: 'Workspace not configured' }
    }
  }
  try {
    await memoryService.saveUserMemory(markdown)
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to save user memory' }
  }
})

ipcMain.handle('memory:addGeneral', async (_, content: string, source?: 'learned' | 'user') => {
  if (!memoryService) {
    const workspace = await storageService.getWorkspacePath()
    if (workspace) {
      memoryService = getMemoryService()
      memoryService.setWorkspace(workspace)
    } else {
      return { success: false, error: 'Workspace not configured' }
    }
  }
  try {
    const saved = await memoryService.addGeneralMemory(content, source || 'learned')
    if (!saved) {
      return { success: false, error: 'Learned note rejected. Save a short preference, not tool output or JSON.' }
    }
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to add memory' }
  }
})

ipcMain.handle('memory:addLexicon', async (_, content: string, source?: 'learned' | 'user') => {
  if (!memoryService) {
    const workspace = await storageService.getWorkspacePath()
    if (workspace) {
      memoryService = getMemoryService()
      memoryService.setWorkspace(workspace)
    } else {
      return { success: false, error: 'Workspace not configured' }
    }
  }
  try {
    const saved = await memoryService.addLexiconEntry(content, source || 'learned')
    if (!saved) {
      return { success: false, error: 'Learned note rejected. Save a short preference, not tool output or JSON.' }
    }
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to add lexicon' }
  }
})

ipcMain.handle('memory:addCommonPhrase', async (_, phrase: string) => {
  if (!memoryService) {
    const workspace = await storageService.getWorkspacePath()
    if (workspace) {
      memoryService = getMemoryService()
      memoryService.setWorkspace(workspace)
    } else {
      return { success: false, error: 'Workspace not configured' }
    }
  }
  try {
    await memoryService.addCommonPhrase(phrase)
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to add phrase' }
  }
})

ipcMain.handle('memory:addIssueExample', async (_, issueTypeName: string, issueTypeId: string, example: {
  issueKey: string
  summary: string
  description?: string
  createdAt: string
  customFields?: Record<string, unknown>
}) => {
  if (!memoryService) {
    const workspace = await storageService.getWorkspacePath()
    if (workspace) {
      memoryService = getMemoryService()
      memoryService.setWorkspace(workspace)
    } else {
      return { success: false, error: 'Workspace not configured' }
    }
  }
  try {
    await memoryService.addIssueExample(issueTypeName, issueTypeId, example)
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to add issue example' }
  }
})

ipcMain.handle('memory:syncIssueExamples', async (_, issueTypeName: string, issueTypeId: string, examples: Array<{
  issueKey: string
  summary: string
  description?: string
  createdAt: string
  customFields?: Record<string, unknown>
}>) => {
  if (!memoryService) {
    const workspace = await storageService.getWorkspacePath()
    if (workspace) {
      memoryService = getMemoryService()
      memoryService.setWorkspace(workspace)
    } else {
      return { success: false, error: 'Workspace not configured' }
    }
  }
  try {
    await memoryService.syncIssueExamples(issueTypeName, issueTypeId, examples)
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to sync examples' }
  }
})

ipcMain.handle('memory:updateLastSynced', async () => {
  if (!memoryService) {
    const workspace = await storageService.getWorkspacePath()
    if (workspace) {
      memoryService = getMemoryService()
      memoryService.setWorkspace(workspace)
    } else {
      return { success: false, error: 'Workspace not configured' }
    }
  }
  try {
    await memoryService.updateLastSynced()
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update sync time' }
  }
})

ipcMain.handle('memory:deleteGeneral', async (_, id: string) => {
  if (!memoryService) return { success: false, error: 'Workspace not configured' }
  try {
    await memoryService.deleteGeneralMemory(id)
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to delete' }
  }
})

ipcMain.handle('memory:deleteLexicon', async (_, id: string) => {
  if (!memoryService) return { success: false, error: 'Workspace not configured' }
  try {
    await memoryService.deleteLexiconEntry(id)
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to delete' }
  }
})

ipcMain.handle('memory:updateEntry', async (_, category: 'general' | 'lexicon', id: string, content: string) => {
  if (!memoryService) return { success: false, error: 'Workspace not configured' }
  try {
    await memoryService.updateMemoryEntry(category, id, content)
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update' }
  }
})

ipcMain.handle('memory:appendSourceLeaf', async (_, leaf: SourceMemoryLeafInput) => {
  const workspace = await storageService.getWorkspacePath()
  if (!workspace) return { success: false, error: 'Workspace not configured' }
  try {
    getSourceMemoryService().setWorkspace(workspace)
    const saved = getSourceMemoryService().appendLeaf(leaf)
    return saved ? { success: true } : { success: false, error: 'Failed to save source leaf' }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to save source leaf' }
  }
})

ipcMain.handle('memory:readSource', async (_, connectorId: string, scopeId: string) => {
  const workspace = await storageService.getWorkspacePath()
  if (!workspace) return { success: false, error: 'Workspace not configured' }
  try {
    getSourceMemoryService().setWorkspace(workspace)
    const data = getSourceMemoryService().readSource(connectorId, scopeId)
    if (!data) return { success: true, data: null }
    return { success: true, data }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to read source memory' }
  }
})

ipcMain.handle('memory:listSources', async () => {
  const workspace = await storageService.getWorkspacePath()
  if (!workspace) return { success: false, error: 'Workspace not configured' }
  try {
    getSourceMemoryService().setWorkspace(workspace)
    const data = getSourceMemoryService().listScopes()
    return { success: true, data }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to list source memory' }
  }
})

// App lifecycle
app.whenReady().then(async () => {
  await initializeServices()
  void autoConnectAtlassianMcpOnStartup()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  stopMcpKeepAlive()
  if (mcpService) {
    void mcpService.disconnect()
  }
})
