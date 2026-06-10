import { contextBridge, ipcRenderer } from 'electron'
import type { ModelCatalog, ModelProvider } from '../src/shared/modelCatalog'
import type { ApproveActionOutcome, ConnectorManifest, ContextEnvelope, ToolResult } from '../src/connectors/contract'
import type { ProjectContext } from '../src/context/types'

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,

  // Storage
  storage: {
    get: (key: string) => ipcRenderer.invoke('storage:get', key),
    set: (key: string, value: unknown) => ipcRenderer.invoke('storage:set', key, value),
    getSecure: (key: string) => ipcRenderer.invoke('storage:getSecure', key),
    setSecure: (key: string, value: string) => ipcRenderer.invoke('storage:setSecure', key, value),
  },

  // Window controls
  windowControls: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('window:toggleMaximize'),
    close: () => ipcRenderer.invoke('window:close'),
  },

  // Model catalog
  models: {
    getCatalog: () => ipcRenderer.invoke('models:getCatalog'),
    refresh: () => ipcRenderer.invoke('models:refresh'),
    refreshProvider: (provider: string) => ipcRenderer.invoke('models:refreshProvider', provider),
  },

  // Files
  file: {
    selectWorkspace: () => ipcRenderer.invoke('file:selectWorkspace'),
    getWorkspace: () => ipcRenderer.invoke('file:getWorkspace'),
    selectFolderInWorkspace: () => ipcRenderer.invoke('file:selectFolderInWorkspace'),
    list: (relativePath?: string) => ipcRenderer.invoke('file:list', relativePath),
    read: (relativePath: string) => ipcRenderer.invoke('file:read', relativePath),
    readOcr: (relativePath: string) => ipcRenderer.invoke('file:readOcr', relativePath),
    write: (relativePath: string, content: string) => 
      ipcRenderer.invoke('file:write', relativePath, content),
    mkdir: (relativePath: string) => ipcRenderer.invoke('file:mkdir', relativePath),
    exists: (relativePath: string) => ipcRenderer.invoke('file:exists', relativePath),
    search: (pattern: string, directory?: string) => 
      ipcRenderer.invoke('file:search', pattern, directory),
    getFileInfo: (relativePath: string) => ipcRenderer.invoke('file:getFileInfo', relativePath),
    ensureAttachmentsDir: () => ipcRenderer.invoke('file:ensureAttachmentsDir'),
    saveAttachment: (fileName: string, data: ArrayBuffer) => 
      ipcRenderer.invoke('file:saveAttachment', fileName, data),
  },

  // AI
  ai: {
    configure: (config: { provider: 'openai' | 'anthropic' | 'mistral' | 'groq' | 'moonshot' | 'deepseek'; apiKey: string; model?: string }) =>
      ipcRenderer.invoke('ai:configure', config),
    configureReasoning: (config: { provider: 'openai' | 'anthropic' | 'mistral' | 'groq' | 'moonshot' | 'deepseek'; apiKey: string; model?: string }) =>
      ipcRenderer.invoke('ai:configureReasoning', config),
    // Legacy alias kept for backward compatibility
    configurePlanner: (config: { provider: 'openai' | 'anthropic' | 'mistral' | 'groq' | 'moonshot' | 'deepseek'; apiKey: string; model?: string }) =>
      ipcRenderer.invoke('ai:configurePlanner', config),
    plan: (messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>) =>
      ipcRenderer.invoke('ai:plan', messages),
    chat: (messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>, tools?: unknown[]) =>
      ipcRenderer.invoke('ai:chat', messages, tools),
    chatReasoning: (messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>, tools?: unknown[]) =>
      ipcRenderer.invoke('ai:chatReasoning', messages, tools),
    chatStream: (
      messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
      tools: unknown[] | undefined,
      onToken: (token: string) => void,
      onProgress?: (event: { toolName: string; title?: string }) => void,
    ): Promise<{ success: boolean; data?: { content: string; toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }> }; error?: string }> => {
      return new Promise((resolve) => {
        const onTokenListener = (_: Electron.IpcRendererEvent, token: string) => onToken(token)
        const onProgressListener = (_: Electron.IpcRendererEvent, event: { toolName: string; title?: string }) => onProgress?.(event)
        const onDone = (_: Electron.IpcRendererEvent, response: unknown) => {
          cleanup()
          resolve({ success: true, data: response as { content: string; toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }> } })
        }
        const onError = (_: Electron.IpcRendererEvent, err: string) => {
          cleanup()
          resolve({ success: false, error: err })
        }
        const cleanup = () => {
          ipcRenderer.removeListener('ai:stream:token', onTokenListener)
          ipcRenderer.removeListener('ai:stream:progress', onProgressListener)
          ipcRenderer.removeListener('ai:stream:done', onDone)
          ipcRenderer.removeListener('ai:stream:error', onError)
        }
        ipcRenderer.on('ai:stream:token', onTokenListener)
        ipcRenderer.on('ai:stream:progress', onProgressListener)
        ipcRenderer.on('ai:stream:done', onDone)
        ipcRenderer.on('ai:stream:error', onError)
        ipcRenderer.send('ai:chat:stream', messages, tools)
      })
    },
    chatReasoningStream: (
      messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
      tools: unknown[] | undefined,
      onToken: (token: string) => void,
      onProgress?: (event: { toolName: string; title?: string }) => void,
    ): Promise<{ success: boolean; data?: { content: string; toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }> }; error?: string }> => {
      return new Promise((resolve) => {
        const onTokenListener = (_: Electron.IpcRendererEvent, token: string) => onToken(token)
        const onProgressListener = (_: Electron.IpcRendererEvent, event: { toolName: string; title?: string }) => onProgress?.(event)
        const onDone = (_: Electron.IpcRendererEvent, response: unknown) => {
          cleanup()
          resolve({ success: true, data: response as { content: string; toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }> } })
        }
        const onError = (_: Electron.IpcRendererEvent, err: string) => {
          cleanup()
          resolve({ success: false, error: err })
        }
        const cleanup = () => {
          ipcRenderer.removeListener('ai:reasoning:stream:token', onTokenListener)
          ipcRenderer.removeListener('ai:reasoning:stream:progress', onProgressListener)
          ipcRenderer.removeListener('ai:reasoning:stream:done', onDone)
          ipcRenderer.removeListener('ai:reasoning:stream:error', onError)
        }
        ipcRenderer.on('ai:reasoning:stream:token', onTokenListener)
        ipcRenderer.on('ai:reasoning:stream:progress', onProgressListener)
        ipcRenderer.on('ai:reasoning:stream:done', onDone)
        ipcRenderer.on('ai:reasoning:stream:error', onError)
        ipcRenderer.send('ai:reasoning:stream', messages, tools)
      })
    },
    abortStream: () => ipcRenderer.send('ai:abortStream'),
  },

  // MCP connection (OAuth / session lifecycle only; tool calls go through connector sandbox)
  mcp: {
    connect: (options?: { forceReauth?: boolean }) => ipcRenderer.invoke('mcp:connect', options),
    disconnect: () => ipcRenderer.invoke('mcp:disconnect'),
    status: () => ipcRenderer.invoke('mcp:status'),
    getConnectionState: () => ipcRenderer.invoke('mcp:getConnectionState'),
    onConnectionStateChange: (callback: (state: { state: string; error?: string }) => void) => {
      ipcRenderer.on('mcp:connectionState', (_, data) => callback(data))
      return () => ipcRenderer.removeAllListeners('mcp:connectionState')
    },
  },

  // Shell
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  },

  // Declarative connectors (sandboxed plugins)
  connectors: {
    list: () => ipcRenderer.invoke('connectors:list'),
    execute: (connectorId: string, name: string, args: Record<string, unknown>, context?: ContextEnvelope) =>
      ipcRenderer.invoke('connectors:execute', connectorId, name, args, context),
    approve: (connectorId: string, actionType: string, data: Record<string, unknown>, context?: ContextEnvelope) =>
      ipcRenderer.invoke('connectors:approve', connectorId, actionType, data, context),
    getKnowledge: (contextId: string, connectorId: string) =>
      ipcRenderer.invoke('connectors:getKnowledge', contextId, connectorId),
    saveKnowledge: (contextId: string, connectorId: string, markdown: string) =>
      ipcRenderer.invoke('connectors:saveKnowledge', contextId, connectorId, markdown),
    deletePackage: (connectorId: string) => ipcRenderer.invoke('connectors:deletePackage', connectorId),
    installPackage: (connectorId: string) => ipcRenderer.invoke('connectors:installPackage', connectorId),
    getIcon: (connectorId: string) => ipcRenderer.invoke('connectors:getIcon', connectorId),
    getBundledIcon: (connectorId: string) => ipcRenderer.invoke('connectors:getBundledIcon', connectorId),
  },

  // Project contexts (Context management)
  contexts: {
    list: () => ipcRenderer.invoke('contexts:list'),
    create: (name: string) => ipcRenderer.invoke('contexts:create', name),
    save: (context: ProjectContext) => ipcRenderer.invoke('contexts:save', context),
    delete: (contextId: string) => ipcRenderer.invoke('contexts:delete', contextId),
    readMarkdown: (contextId: string) => ipcRenderer.invoke('contexts:readMarkdown', contextId),
    getPromptBody: (contextId: string) => ipcRenderer.invoke('contexts:getPromptBody', contextId),
    appendSection: (contextId: string, section: string, content: string) =>
      ipcRenderer.invoke('contexts:appendSection', contextId, section, content),
    replaceSection: (contextId: string, heading: string, content: string) =>
      ipcRenderer.invoke('contexts:replaceSection', contextId, heading, content),
  },

  // Memory
  memory: {
    getAll: () => ipcRenderer.invoke('memory:getAll'),
    save: (memory: unknown) => ipcRenderer.invoke('memory:save', memory),
    saveUserMarkdown: (markdown: string) => ipcRenderer.invoke('memory:saveUserMarkdown', markdown),
    addGeneral: (content: string, source?: 'learned' | 'user') => 
      ipcRenderer.invoke('memory:addGeneral', content, source),
    addLexicon: (content: string, source?: 'learned' | 'user') => 
      ipcRenderer.invoke('memory:addLexicon', content, source),
    addCommonPhrase: (phrase: string) => ipcRenderer.invoke('memory:addCommonPhrase', phrase),
    addIssueExample: (issueTypeName: string, issueTypeId: string, example: {
      issueKey: string
      summary: string
      description?: string
      createdAt: string
      customFields?: Record<string, unknown>
    }) => ipcRenderer.invoke('memory:addIssueExample', issueTypeName, issueTypeId, example),
    syncIssueExamples: (issueTypeName: string, issueTypeId: string, examples: Array<{
      issueKey: string
      summary: string
      description?: string
      createdAt: string
      customFields?: Record<string, unknown>
    }>) => ipcRenderer.invoke('memory:syncIssueExamples', issueTypeName, issueTypeId, examples),
    updateLastSynced: () => ipcRenderer.invoke('memory:updateLastSynced'),
    deleteGeneral: (id: string) => ipcRenderer.invoke('memory:deleteGeneral', id),
    deleteLexicon: (id: string) => ipcRenderer.invoke('memory:deleteLexicon', id),
    updateEntry: (category: 'general' | 'lexicon', id: string, content: string) =>
      ipcRenderer.invoke('memory:updateEntry', category, id, content),
    appendSourceLeaf: (leaf: {
      connectorId: string
      scopeId: string
      kind: 'write_outcome' | 'scope_sync' | 'user_pin'
      toolName: string
      summary: string
    }) => ipcRenderer.invoke('memory:appendSourceLeaf', leaf),
    readSource: (connectorId: string, scopeId: string) =>
      ipcRenderer.invoke('memory:readSource', connectorId, scopeId),
    listSources: () => ipcRenderer.invoke('memory:listSources'),
  },
})

// Type definitions for the exposed API
export interface ElectronAPI {
  storage: {
    get: (key: string) => Promise<unknown>
    set: (key: string, value: unknown) => Promise<void>
    getSecure: (key: string) => Promise<string | null>
    setSecure: (key: string, value: string) => Promise<void>
  }
  models: {
    getCatalog: () => Promise<{ success: boolean; data?: ModelCatalog; error?: string }>
    refresh: () => Promise<{ success: boolean; data?: ModelCatalog; error?: string }>
    refreshProvider: (provider: ModelProvider) => Promise<{ success: boolean; data?: ModelCatalog; error?: string }>
  }
  file: {
    selectWorkspace: () => Promise<{ success: boolean; path?: string }>
    getWorkspace: () => Promise<string | null>
    selectFolderInWorkspace: () => Promise<{ success: boolean; path?: string; error?: string }>
    list: (relativePath?: string) => Promise<{ success: boolean; data?: unknown[]; error?: string }>
    read: (relativePath: string) => Promise<{ success: boolean; data?: string; error?: string }>
    readOcr: (relativePath: string) => Promise<{ success: boolean; data?: string; error?: string }>
    write: (relativePath: string, content: string) => Promise<{ success: boolean; error?: string }>
    exists: (relativePath: string) => Promise<{ success: boolean; exists?: boolean; error?: string }>
    search: (pattern: string, directory?: string) => Promise<{ success: boolean; data?: Array<{ name: string; path: string; size: number; isDirectory: boolean }>; error?: string }>
    getFileInfo: (relativePath: string) => Promise<{ success: boolean; data?: { name: string; size: number; isDirectory: boolean; mimeType?: string }; error?: string }>
    ensureAttachmentsDir: () => Promise<{ success: boolean; path?: string; error?: string }>
    saveAttachment: (fileName: string, data: ArrayBuffer) => Promise<{ success: boolean; path?: string; error?: string }>
  }
  ai: {
    configure: (config: { provider: 'openai' | 'anthropic' | 'mistral' | 'groq' | 'moonshot' | 'deepseek'; apiKey: string; model?: string }) => Promise<{ success: boolean }>
    configureReasoning: (config: { provider: 'openai' | 'anthropic' | 'mistral' | 'groq' | 'moonshot' | 'deepseek'; apiKey: string; model?: string }) => Promise<{ success: boolean }>
    configurePlanner: (config: { provider: 'openai' | 'anthropic' | 'mistral' | 'groq' | 'moonshot' | 'deepseek'; apiKey: string; model?: string }) => Promise<{ success: boolean }>
    plan: (messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>) => Promise<{ success: boolean; plan?: string; error?: string }>
    chat: (messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>, tools?: unknown[]) => Promise<{
      success: boolean
      data?: { content: string; toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }> }
      error?: string
    }>
    chatReasoning: (messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>, tools?: unknown[]) => Promise<{
      success: boolean
      data?: { content: string; toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }> }
      error?: string
    }>
    chatStream: (
      messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
      tools: unknown[] | undefined,
      onToken: (token: string) => void,
      onProgress?: (event: { toolName: string; title?: string }) => void,
    ) => Promise<{
      success: boolean
      data?: { content: string; toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }> }
      error?: string
    }>
    chatReasoningStream: (
      messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
      tools: unknown[] | undefined,
      onToken: (token: string) => void,
      onProgress?: (event: { toolName: string; title?: string }) => void,
    ) => Promise<{
      success: boolean
      data?: { content: string; toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }> }
      error?: string
    }>
  }
  mcp: {
    connect: (options?: { forceReauth?: boolean }) => Promise<{ success: boolean; error?: string }>
    disconnect: () => Promise<{ success: boolean }>
    status: () => Promise<{ connected: boolean }>
    getConnectionState: () => Promise<{ state: 'disconnected' | 'connecting' | 'oauth_pending' | 'connected' | 'error'; connected: boolean }>
    onConnectionStateChange: (callback: (state: { state: string; error?: string }) => void) => () => void
  }
  shell: {
    openExternal: (url: string) => Promise<{ success: boolean }>
  }
  connectors: {
    list: () => Promise<{
      success: boolean
      data?: {
        connectors: Array<{ manifest: ConnectorManifest; promptMarkdown: string }>
        errors: Array<{ id: string; errors: string[] }>
      }
      error?: string
    }>
    execute: (connectorId: string, name: string, args: Record<string, unknown>, context?: ContextEnvelope) => Promise<ToolResult>
    approve: (connectorId: string, actionType: string, data: Record<string, unknown>, context?: ContextEnvelope) => Promise<ApproveActionOutcome>
    getKnowledge: (contextId: string, connectorId: string) => Promise<{ success: boolean; data?: string | null; error?: string }>
    saveKnowledge: (contextId: string, connectorId: string, markdown: string) => Promise<{ success: boolean; error?: string }>
    deletePackage: (connectorId: string) => Promise<{ success: boolean; error?: string }>
    installPackage: (connectorId: string) => Promise<{ success: boolean; data?: ConnectorManifest; error?: string }>
    getIcon: (connectorId: string) => Promise<{ success: boolean; data?: string | null; error?: string }>
    getBundledIcon: (connectorId: string) => Promise<{ success: boolean; data?: string | null; error?: string }>
  }
  contexts: {
    list: () => Promise<{ success: boolean; data?: ProjectContext[]; error?: string }>
    create: (name: string) => Promise<{ success: boolean; data?: ProjectContext[]; context?: ProjectContext; error?: string }>
    save: (context: ProjectContext) => Promise<{ success: boolean; data?: ProjectContext[]; error?: string }>
    delete: (contextId: string) => Promise<{ success: boolean; data?: ProjectContext[]; error?: string }>
    readMarkdown: (contextId: string) => Promise<{ success: boolean; data?: string; error?: string }>
    getPromptBody: (contextId: string) => Promise<{
      success: boolean
      data?: import('../context/promptInjection').ContextPromptBody
      error?: string
    }>
    appendSection: (contextId: string, section: string, content: string) => Promise<{ success: boolean; data?: string; error?: string }>
    replaceSection: (contextId: string, heading: string, content: string) => Promise<{ success: boolean; data?: string; error?: string }>
  }
  memory: {
    getAll: () => Promise<{ success: boolean; data?: unknown; error?: string }>
    save: (memory: unknown) => Promise<{ success: boolean; error?: string }>
    saveUserMarkdown: (markdown: string) => Promise<{ success: boolean; error?: string }>
    addGeneral: (content: string, source?: 'learned' | 'user') => Promise<{ success: boolean; error?: string }>
    addLexicon: (content: string, source?: 'learned' | 'user') => Promise<{ success: boolean; error?: string }>
    addCommonPhrase: (phrase: string) => Promise<{ success: boolean; error?: string }>
    addIssueExample: (issueTypeName: string, issueTypeId: string, example: {
      issueKey: string
      summary: string
      description?: string
      createdAt: string
      customFields?: Record<string, unknown>
    }) => Promise<{ success: boolean; error?: string }>
    syncIssueExamples: (issueTypeName: string, issueTypeId: string, examples: Array<{
      issueKey: string
      summary: string
      description?: string
      createdAt: string
      customFields?: Record<string, unknown>
    }>) => Promise<{ success: boolean; error?: string }>
    updateLastSynced: () => Promise<{ success: boolean; error?: string }>
    deleteGeneral: (id: string) => Promise<{ success: boolean; error?: string }>
    deleteLexicon: (id: string) => Promise<{ success: boolean; error?: string }>
    updateEntry: (category: 'general' | 'lexicon', id: string, content: string) => Promise<{ success: boolean; error?: string }>
    appendSourceLeaf: (leaf: {
      connectorId: string
      scopeId: string
      kind: 'write_outcome' | 'scope_sync' | 'user_pin'
      toolName: string
      summary: string
    }) => Promise<{ success: boolean; error?: string }>
    readSource: (connectorId: string, scopeId: string) => Promise<{ success: boolean; data?: unknown; error?: string }>
    listSources: () => Promise<{ success: boolean; data?: unknown; error?: string }>
  }
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
