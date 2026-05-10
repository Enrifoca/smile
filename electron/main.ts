import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import path from 'path'
import { EncryptionService } from './services/encryption'
import { StorageService } from './services/storage'
import { JiraService } from './services/jira'
import { FileService } from './services/files'
import { AIService } from './services/ai'
import { OCRConfig, OCRService } from './services/ocr'
import { ModelCatalogService } from './services/model-catalog'
import { AIConfig, ModelProvider, getDefaultModelId } from '../src/shared/modelCatalog'
import { getAtlassianMCPService, AtlassianMCPService } from './services/atlassian-mcp'
import { getMemoryService, MemoryService } from './services/memory'
import { getJiraAttachmentService, JiraAttachmentService, isJiraAttachmentConfigured } from './services/jira-attachment'

// Services
let encryptionService: EncryptionService
let storageService: StorageService
let jiraService: JiraService | null = null
let fileService: FileService | null = null
let aiService: AIService | null = null
let mcpService: AtlassianMCPService | null = null
let jiraAttachmentService: JiraAttachmentService | null = null
let modelCatalogService: ModelCatalogService | null = null

let mainWindow: BrowserWindow | null = null
let mcpKeepAliveInterval: NodeJS.Timeout | null = null
let mcpConnectionState: 'disconnected' | 'connecting' | 'connected' | 'error' = 'disconnected'
let memoryService: MemoryService | null = null

// Keep-alive interval in milliseconds (10 minutes)
const MCP_KEEPALIVE_INTERVAL = 10 * 60 * 1000

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

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
    titleBarStyle: 'hiddenInset',
    frame: process.platform === 'darwin' ? true : false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    // Open DevTools only when explicitly requested via MIRAI_DEVTOOLS=1
    if (process.env.MIRAI_DEVTOOLS === '1') {
      mainWindow.webContents.openDevTools()
    }
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
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

  // Initialize Jira if credentials exist
  const jiraConfig = await storageService.getJiraConfig()
  if (jiraConfig) {
    jiraService = new JiraService(jiraConfig)
  }

  // Initialize File service if workspace is set
  const workspace = await storageService.getWorkspacePath()
  if (workspace) {
    fileService = new FileService(workspace, getConfiguredOcrService)
    // Initialize memory service with workspace
    memoryService = getMemoryService()
    memoryService.setWorkspace(workspace)
  }

  void modelCatalogService.refreshAll().catch(error => {
    console.warn('[ModelCatalog] Startup refresh failed:', error instanceof Error ? error.message : error)
  })
}

// Send MCP connection state to renderer
function sendMcpConnectionState(state: typeof mcpConnectionState, error?: string) {
  mcpConnectionState = state
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('mcp:connectionState', { state, error })
  }
}

function getConfiguredJiraSiteUrl(): string | null {
  const configStr = storageService.getSecure('jiraApiConfig')
  if (!configStr) return null

  try {
    const config = JSON.parse(configStr) as { baseUrl?: string }
    return config.baseUrl || null
  } catch {
    return null
  }
}

// Auto-connect to MCP if user has previously connected
async function autoConnectMcp() {
  // Check if user has completed onboarding and has monitored projects
  const jiraMetadata = storageService.getJiraMetadata()
  const connectionMode = storageService.getJiraConnectionMode()
  
  // Only auto-connect if user has set up MCP before
  if (connectionMode !== 'mcp' || !jiraMetadata.monitoredProjects || jiraMetadata.monitoredProjects.length === 0) {
    console.log('[MCP] Skipping auto-connect: not configured or no monitored projects')
    return
  }

  console.log('[MCP] Auto-connecting to Atlassian MCP...')
  sendMcpConnectionState('connecting')

  try {
    mcpService = getAtlassianMCPService()
    mcpService.setPreferredSiteUrl(getConfiguredJiraSiteUrl())
    const result = await mcpService.connect()
    
    if (result.success) {
      console.log('[MCP] Auto-connect successful')
      sendMcpConnectionState('connected')
      startMcpKeepAlive()
    } else {
      console.log('[MCP] Auto-connect failed:', result.error)
      sendMcpConnectionState('error', result.error)
    }
  } catch (error) {
    console.error('[MCP] Auto-connect error:', error)
    sendMcpConnectionState('error', error instanceof Error ? error.message : 'Connection failed')
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
        const result = await mcpService.connect()
        if (result.success) {
          console.log('[MCP] Keep-alive: Reconnected successfully')
          sendMcpConnectionState('connected')
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

// Jira
ipcMain.handle('jira:configure', async (_, config: { baseUrl: string; email: string; apiToken: string }) => {
  await storageService.setJiraConfig(config)
  jiraService = new JiraService(config)
  return { success: true }
})

ipcMain.handle('jira:testConnection', async () => {
  if (!jiraService) return { success: false, error: 'Jira not configured' }
  return jiraService.testConnection()
})

ipcMain.handle('jira:getProjects', async () => {
  if (!jiraService) return { success: false, error: 'Jira not configured' }
  return jiraService.getProjects()
})

ipcMain.handle('jira:searchIssues', async (_, jql: string, maxResults?: number) => {
  if (!jiraService) return { success: false, error: 'Jira not configured' }
  return jiraService.searchIssues(jql, maxResults)
})

ipcMain.handle('jira:getIssue', async (_, issueKey: string) => {
  if (!jiraService) return { success: false, error: 'Jira not configured' }
  return jiraService.getIssue(issueKey)
})

ipcMain.handle('jira:createIssue', async (_, issueData: Record<string, unknown>) => {
  if (!jiraService) return { success: false, error: 'Jira not configured' }
  return jiraService.createIssue(issueData)
})

ipcMain.handle('jira:updateIssue', async (_, issueKey: string, updateData: Record<string, unknown>) => {
  if (!jiraService) return { success: false, error: 'Jira not configured' }
  return jiraService.updateIssue(issueKey, updateData)
})

ipcMain.handle('jira:addComment', async (_, issueKey: string, comment: string) => {
  if (!jiraService) return { success: false, error: 'Jira not configured' }
  return jiraService.addComment(issueKey, comment)
})

ipcMain.handle('jira:transitionIssue', async (_, issueKey: string, transitionId: string) => {
  if (!jiraService) return { success: false, error: 'Jira not configured' }
  return jiraService.transitionIssue(issueKey, transitionId)
})

ipcMain.handle('jira:getTransitions', async (_, issueKey: string) => {
  if (!jiraService) return { success: false, error: 'Jira not configured' }
  return jiraService.getTransitions(issueKey)
})

ipcMain.handle('jira:getSprints', async (_, boardId: number) => {
  if (!jiraService) return { success: false, error: 'Jira not configured' }
  return jiraService.getSprints(boardId)
})

ipcMain.handle('jira:getBoards', async () => {
  if (!jiraService) return { success: false, error: 'Jira not configured' }
  return jiraService.getBoards()
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
    return { success: true, path: workspacePath }
  }
  return { success: false }
})

ipcMain.handle('file:getWorkspace', async () => {
  return storageService.getWorkspacePath()
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

// ============================================
// JIRA ATTACHMENT HANDLERS (REST API)
// ============================================

ipcMain.handle('jiraAttachment:upload', async (_, issueKey: string, filePath: string) => {
  if (!fileService) return { success: false, error: 'Workspace not configured' }
  
  // Always reload config fresh to pick up any changes from Settings
  const configStr = await storageService.getSecure('jiraApiConfig')
  console.log('[JiraAttachment] Config string:', configStr ? 'exists' : 'not found')
  
  if (!configStr) {
    return { success: false, error: 'Jira API token not configured. Please add it in Settings to upload attachments.' }
  }
  
  let config
  try {
    config = JSON.parse(configStr)
    console.log('[JiraAttachment] Loaded config:', { 
      baseUrl: config.baseUrl || '(empty)', 
      email: config.email || '(empty)',
      hasToken: !!config.apiToken 
    })
  } catch (e) {
    console.error('[JiraAttachment] Failed to parse config:', e)
    return { success: false, error: 'Invalid Jira API configuration' }
  }
  
  if (!config.baseUrl || !config.email || !config.apiToken) {
    const missing = []
    if (!config.baseUrl) missing.push('Site URL')
    if (!config.email) missing.push('Email')
    if (!config.apiToken) missing.push('API Token')
    return { 
      success: false, 
      error: `Jira API configuration incomplete. Missing: ${missing.join(', ')}. Please go to Settings and fill in all fields.` 
    }
  }
  
  // Create/update the service with current config
  jiraAttachmentService = getJiraAttachmentService(config)
  
  // Get full path
  const fullPath = fileService.getFullPath(filePath)
  console.log('[JiraAttachment] Uploading file:', fullPath, 'to issue:', issueKey)
  return jiraAttachmentService!.uploadAttachment(issueKey, fullPath)
})

ipcMain.handle('jiraAttachment:isConfigured', async () => {
  // Check if config exists
  if (!jiraAttachmentService) {
    const configStr = await storageService.getSecure('jiraApiConfig')
    if (configStr) {
      try {
        const config = JSON.parse(configStr)
        jiraAttachmentService = getJiraAttachmentService(config)
      } catch {
        return { configured: false }
      }
    }
  }
  return { configured: isJiraAttachmentConfigured() }
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
      }
    )
    if (!event.sender.isDestroyed()) event.sender.send('ai:stream:done', response)
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'AI stream failed'
    console.error('[AI:stream] Error:', msg)
    if (!event.sender.isDestroyed()) event.sender.send('ai:stream:error', msg)
  }
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
      }
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
    sendMcpConnectionState('connecting')
    mcpService = getAtlassianMCPService()
    mcpService.setPreferredSiteUrl(getConfiguredJiraSiteUrl())
    const result = await mcpService.connect({ forceReauth: options?.forceReauth ?? true })
    if (result.success) {
      storageService.setJiraConnectionMode('mcp')
      sendMcpConnectionState('connected')
      startMcpKeepAlive()
    } else {
      sendMcpConnectionState('error', result.error)
    }
    return result
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'MCP connection failed'
    sendMcpConnectionState('error', errorMsg)
    return { success: false, error: errorMsg }
  }
})

ipcMain.handle('mcp:disconnect', async () => {
  stopMcpKeepAlive()
  sendMcpConnectionState('disconnected')
  storageService.setJiraConnectionMode(null)
  if (mcpService) {
    mcpService.disconnect()
    mcpService = null
  }
  return { success: true }
})

ipcMain.handle('mcp:status', async () => {
  return { 
    connected: mcpService?.getConnectionStatus() ?? false,
    mode: storageService.getJiraConnectionMode()
  }
})

ipcMain.handle('mcp:getConnectionState', async () => {
  return { 
    state: mcpConnectionState,
    connected: mcpService?.getConnectionStatus() ?? false
  }
})

ipcMain.handle('mcp:getProjects', async () => {
  if (!mcpService) return { success: false, error: 'MCP not connected' }
  return mcpService.getVisibleProjects()
})

ipcMain.handle('mcp:getProjectIssueTypes', async (_, projectKey: string) => {
  if (!mcpService) return { success: false, error: 'MCP not connected' }
  return mcpService.getProjectIssueTypes(projectKey)
})

ipcMain.handle('mcp:getFieldMetadata', async (_, projectKey: string, issueTypeId: string) => {
  if (!mcpService) return { success: false, error: 'MCP not connected' }
  return mcpService.getIssueTypeFieldMetadata(projectKey, issueTypeId)
})

ipcMain.handle('mcp:searchIssues', async (_, jql: string, maxResults?: number, fields?: string | string[]) => {
  if (!mcpService) return { success: false, error: 'MCP not connected' }
  return mcpService.searchIssues(jql, maxResults, fields)
})

ipcMain.handle('mcp:getIssue', async (_, issueKey: string) => {
  if (!mcpService) return { success: false, error: 'MCP not connected' }
  return mcpService.getIssue(issueKey)
})

ipcMain.handle('mcp:createIssue', async (_, projectKey: string, issueTypeId: string, summary: string, description?: string, additionalFields?: Record<string, unknown>) => {
  if (!mcpService) return { success: false, error: 'MCP not connected' }
  return mcpService.createIssue(projectKey, issueTypeId, summary, description, additionalFields)
})

ipcMain.handle('mcp:editIssue', async (_, issueKey: string, fields: Record<string, unknown>) => {
  if (!mcpService) return { success: false, error: 'MCP not connected' }
  return mcpService.editIssue(issueKey, fields)
})

ipcMain.handle('mcp:addComment', async (_, issueKey: string, body: string) => {
  if (!mcpService) return { success: false, error: 'MCP not connected' }
  return mcpService.addComment(issueKey, body)
})

ipcMain.handle('mcp:getTransitions', async (_, issueKey: string) => {
  if (!mcpService) return { success: false, error: 'MCP not connected' }
  return mcpService.getTransitions(issueKey)
})

ipcMain.handle('mcp:transitionIssue', async (_, issueKey: string, transitionId: string) => {
  if (!mcpService) return { success: false, error: 'MCP not connected' }
  return mcpService.transitionIssue(issueKey, transitionId)
})

ipcMain.handle('mcp:syncMetadata', async (_, projectKeys: string[]) => {
  if (!mcpService) return { success: false, error: 'MCP not connected' }
  return mcpService.syncProjectMetadata(projectKeys)
})

ipcMain.handle('mcp:syncAllMetadata', async (_, projectKeys: string[]) => {
  if (!mcpService) return { success: false, error: 'MCP not connected' }
  return mcpService.syncAllMetadata(projectKeys)
})

ipcMain.handle('mcp:fetchUsers', async (_, projectKeys: string[]) => {
  if (!mcpService) return { success: false, error: 'MCP not connected' }
  return mcpService.fetchAllUsers(projectKeys)
})

ipcMain.handle('mcp:getAssignableUsers', async (_, projectKey: string) => {
  if (!mcpService) return { success: false, error: 'MCP not connected' }
  return mcpService.getAssignableUsers(projectKey)
})

ipcMain.handle('mcp:lookupUser', async (_, query: string) => {
  if (!mcpService) return { success: false, error: 'MCP not connected' }
  return mcpService.lookupUser(query)
})

ipcMain.handle('mcp:getCurrentUser', async () => {
  if (!mcpService) return { success: false, error: 'MCP not connected' }
  return mcpService.getCurrentUser()
})

ipcMain.handle('mcp:listTools', async () => {
  if (!mcpService) return { success: false, error: 'MCP not connected' }
  return mcpService.listTools()
})

// ============================================
// JIRA METADATA HANDLERS
// ============================================

ipcMain.handle('jiraMetadata:get', async () => {
  return storageService.getJiraMetadata()
})

ipcMain.handle('jiraMetadata:setMonitoredProjects', async (_, projects: Array<{ id: string; key: string; name: string; projectTypeKey: string; avatarUrl?: string }>) => {
  storageService.setMonitoredProjects(projects)
  return { success: true }
})

ipcMain.handle('jiraMetadata:updateProjectMetadata', async (_, projectKey: string, metadata: unknown) => {
  storageService.updateProjectMetadata(projectKey, metadata as Parameters<typeof storageService.updateProjectMetadata>[1])
  return { success: true }
})

ipcMain.handle('jiraMetadata:set', async (_, metadata: unknown) => {
  storageService.setJiraMetadata(metadata as Parameters<typeof storageService.setJiraMetadata>[0])
  return { success: true }
})

ipcMain.handle('jiraMetadata:setUsers', async (_, users: Array<{ accountId: string; displayName: string; emailAddress?: string; avatarUrl?: string; active: boolean }>) => {
  storageService.setJiraUsers(users)
  return { success: true }
})

// Open external URL (for OAuth)
ipcMain.handle('shell:openExternal', async (_, url: string) => {
  await shell.openExternal(url)
  return { success: true }
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
    await memoryService.addGeneralMemory(content, source || 'learned')
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
    await memoryService.addLexiconEntry(content, source || 'learned')
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

// App lifecycle
app.whenReady().then(async () => {
  await initializeServices()
  createWindow()

  // Auto-connect to MCP after a short delay (let the renderer load first)
  setTimeout(() => {
    autoConnectMcp()
  }, 2000)

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
    mcpService.disconnect()
  }
})
