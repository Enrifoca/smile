// Type definitions for the Electron API exposed via preload
import { AIConfig, ModelCatalog, ModelProvider } from '../shared/modelCatalog'

export interface ElectronAPI {
  platform: NodeJS.Platform
  storage: {
    get: (key: string) => Promise<unknown>
    set: (key: string, value: unknown) => Promise<void>
    getSecure: (key: string) => Promise<string | null>
    setSecure: (key: string, value: string) => Promise<void>
  }
  windowControls: {
    minimize: () => Promise<void>
    toggleMaximize: () => Promise<void>
    close: () => Promise<void>
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
    mkdir: (relativePath: string) => Promise<{ success: boolean; error?: string }>
    exists: (relativePath: string) => Promise<{ success: boolean; exists?: boolean; error?: string }>
    search: (pattern: string, directory?: string) => Promise<{ success: boolean; data?: Array<{ name: string; path: string; size: number; isDirectory: boolean }>; error?: string }>
    getFileInfo: (relativePath: string) => Promise<{ success: boolean; data?: { name: string; size: number; isDirectory: boolean; mimeType?: string }; error?: string }>
    ensureAttachmentsDir: () => Promise<{ success: boolean; path?: string; error?: string }>
    saveAttachment: (fileName: string, data: ArrayBuffer) => Promise<{ success: boolean; path?: string; error?: string }>
  }
  ai: {
    configure: (config: AIConfig) => Promise<{ success: boolean }>
    configureReasoning: (config: AIConfig) => Promise<{ success: boolean }>
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
    abortStream: () => void
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
        connectors: Array<{ manifest: import('../connectors/contract').ConnectorManifest; promptMarkdown: string }>
        errors: Array<{ id: string; errors: string[] }>
      }
      error?: string
    }>
    execute: (
      connectorId: string,
      name: string,
      args: Record<string, unknown>,
      context?: import('../connectors/contract').ContextEnvelope,
    ) => Promise<import('../connectors/contract').ToolResult>
    approve: (
      connectorId: string,
      actionType: string,
      data: Record<string, unknown>,
      context?: import('../connectors/contract').ContextEnvelope,
    ) => Promise<import('../connectors/contract').ApproveActionOutcome>
    getKnowledge: (
      contextId: string,
      connectorId: string,
    ) => Promise<{ success: boolean; data?: string | null; error?: string }>
    saveKnowledge: (
      contextId: string,
      connectorId: string,
      markdown: string,
    ) => Promise<{ success: boolean; error?: string }>
    deletePackage: (connectorId: string) => Promise<{ success: boolean; error?: string }>
    installPackage: (connectorId: string) => Promise<{ success: boolean; data?: import('../connectors/contract').ConnectorManifest; error?: string }>
    getIcon: (connectorId: string) => Promise<{ success: boolean; data?: string | null; error?: string }>
    getBundledIcon: (connectorId: string) => Promise<{ success: boolean; data?: string | null; error?: string }>
  }
  contexts: {
    list: () => Promise<{ success: boolean; data?: import('../context/types').ProjectContext[]; error?: string }>
    create: (name: string) => Promise<{
      success: boolean
      data?: import('../context/types').ProjectContext[]
      context?: import('../context/types').ProjectContext
      error?: string
    }>
    save: (
      context: import('../context/types').ProjectContext,
    ) => Promise<{ success: boolean; data?: import('../context/types').ProjectContext[]; error?: string }>
    delete: (
      contextId: string,
    ) => Promise<{ success: boolean; data?: import('../context/types').ProjectContext[]; error?: string }>
    readMarkdown: (contextId: string) => Promise<{ success: boolean; data?: string; error?: string }>
    writeMarkdown: (
      contextId: string,
      content: string,
    ) => Promise<{ success: boolean; error?: string }>
    getPromptBody: (contextId: string) => Promise<{
      success: boolean
      data?: import('../context/promptInjection').ContextPromptBody
      error?: string
    }>
    appendSection: (
      contextId: string,
      section: string,
      content: string,
    ) => Promise<{ success: boolean; data?: string; error?: string }>
    replaceSection: (
      contextId: string,
      heading: string,
      content: string,
    ) => Promise<{ success: boolean; data?: string; error?: string }>
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
  app: {
    getVersion: () => Promise<string>
  }
  updates: {
    check: () => Promise<{ success: boolean; data?: import('../shared/updates').UpdateState; error?: string }>
    install: () => Promise<{ success: boolean }>
    onStateChange: (callback: (state: import('../shared/updates').UpdateState) => void) => () => void
  }
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
