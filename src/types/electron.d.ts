// Type definitions for the Electron API exposed via preload
import { AIConfig, ModelCatalog, ModelProvider } from '../shared/modelCatalog'

export interface JiraUser {
  accountId: string
  displayName: string
  emailAddress?: string
  avatarUrl?: string
  active: boolean
}

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
  jiraAttachment: {
    upload: (issueKey: string, filePath: string) => Promise<{ success: boolean; data?: unknown; error?: string }>
    isConfigured: () => Promise<{ configured: boolean }>
  }
  ai: {
    configure: (config: AIConfig) => Promise<{ success: boolean }>
    configureReasoning: (config: AIConfig) => Promise<{ success: boolean }>
    configurePlanner: (config: AIConfig) => Promise<{ success: boolean }>
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
    status: () => Promise<{ connected: boolean; mode: 'api' | 'mcp' | null }>
    getConnectionState: () => Promise<{ state: 'disconnected' | 'connecting' | 'oauth_pending' | 'connected' | 'error'; connected: boolean }>
    onConnectionStateChange: (callback: (state: { state: string; error?: string }) => void) => () => void
    getProjects: () => Promise<{ success: boolean; data?: unknown; error?: string }>
    getProjectIssueTypes: (projectKey: string) => Promise<{ success: boolean; data?: unknown; error?: string }>
    getFieldMetadata: (projectKey: string, issueTypeId: string) => Promise<{ success: boolean; data?: unknown; error?: string }>
    searchIssues: (jql: string, maxResults?: number, fields?: string | string[]) => Promise<{ success: boolean; data?: unknown; error?: string }>
    getIssue: (issueKey: string) => Promise<{ success: boolean; data?: unknown; error?: string }>
    createIssue: (projectKey: string, issueTypeName: string, summary: string, description?: string, additionalFields?: Record<string, unknown>) => Promise<{ success: boolean; data?: unknown; error?: string }>
    editIssue: (issueKey: string, fields: Record<string, unknown>) => Promise<{ success: boolean; data?: unknown; error?: string }>
    addComment: (issueKey: string, body: string) => Promise<{ success: boolean; data?: unknown; error?: string }>
    getTransitions: (issueKey: string) => Promise<{ success: boolean; data?: unknown; error?: string }>
    transitionIssue: (issueKey: string, transitionId: string) => Promise<{ success: boolean; error?: string }>
    syncMetadata: (projectKeys: string[]) => Promise<{ success: boolean; data?: unknown; error?: string }>
    syncAllMetadata: (projectKeys: string[]) => Promise<{ success: boolean; metadata?: unknown; error?: string }>
    fetchUsers: (projectKeys: string[]) => Promise<{ success: boolean; users?: JiraUser[]; error?: string }>
    getAssignableUsers: (projectKey: string) => Promise<{ success: boolean; data?: unknown; error?: string }>
    getCurrentUser: () => Promise<{ success: boolean; data?: unknown; error?: string }>
    listTools: () => Promise<{ success: boolean; data?: unknown; error?: string }>
    lookupUser: (query: string) => Promise<{ success: boolean; data?: unknown; error?: string }>
  }
  jiraMetadata: {
    get: () => Promise<{
      monitoredProjects: Array<{ id: string; key: string; name: string; projectTypeKey: string; avatarUrl?: string }>
      projectMetadata: Record<string, unknown>
      standardFields: unknown[]
      users: JiraUser[]
      lastSynced: string | null
      syncedProjects: string[]
    }>
    setMonitoredProjects: (projects: Array<{ id: string; key: string; name: string; projectTypeKey: string; avatarUrl?: string }>) => Promise<{ success: boolean }>
    updateProjectMetadata: (projectKey: string, metadata: unknown) => Promise<{ success: boolean }>
    set: (metadata: unknown) => Promise<{ success: boolean }>
    setUsers: (users: JiraUser[]) => Promise<{ success: boolean }>
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
  }
  contexts: {
    list: () => Promise<{ success: boolean; data?: import('../context/types').ProjectContext[]; error?: string }>
    save: (
      context: import('../context/types').ProjectContext,
    ) => Promise<{ success: boolean; data?: import('../context/types').ProjectContext[]; error?: string }>
    delete: (
      contextId: string,
    ) => Promise<{ success: boolean; data?: import('../context/types').ProjectContext[]; error?: string }>
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
