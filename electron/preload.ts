import { contextBridge, ipcRenderer } from 'electron'

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Storage
  storage: {
    get: (key: string) => ipcRenderer.invoke('storage:get', key),
    set: (key: string, value: unknown) => ipcRenderer.invoke('storage:set', key, value),
    getSecure: (key: string) => ipcRenderer.invoke('storage:getSecure', key),
    setSecure: (key: string, value: string) => ipcRenderer.invoke('storage:setSecure', key, value),
  },

  // Jira
  jira: {
    configure: (config: { baseUrl: string; email: string; apiToken: string }) => 
      ipcRenderer.invoke('jira:configure', config),
    testConnection: () => ipcRenderer.invoke('jira:testConnection'),
    getProjects: () => ipcRenderer.invoke('jira:getProjects'),
    searchIssues: (jql: string, maxResults?: number) => 
      ipcRenderer.invoke('jira:searchIssues', jql, maxResults),
    getIssue: (issueKey: string) => ipcRenderer.invoke('jira:getIssue', issueKey),
    createIssue: (issueData: Record<string, unknown>) => 
      ipcRenderer.invoke('jira:createIssue', issueData),
    updateIssue: (issueKey: string, updateData: Record<string, unknown>) => 
      ipcRenderer.invoke('jira:updateIssue', issueKey, updateData),
    addComment: (issueKey: string, comment: string) => 
      ipcRenderer.invoke('jira:addComment', issueKey, comment),
    transitionIssue: (issueKey: string, transitionId: string) => 
      ipcRenderer.invoke('jira:transitionIssue', issueKey, transitionId),
    getTransitions: (issueKey: string) => ipcRenderer.invoke('jira:getTransitions', issueKey),
    getSprints: (boardId: number) => ipcRenderer.invoke('jira:getSprints', boardId),
    getBoards: () => ipcRenderer.invoke('jira:getBoards'),
  },

  // Files
  file: {
    selectWorkspace: () => ipcRenderer.invoke('file:selectWorkspace'),
    getWorkspace: () => ipcRenderer.invoke('file:getWorkspace'),
    list: (relativePath?: string) => ipcRenderer.invoke('file:list', relativePath),
    read: (relativePath: string) => ipcRenderer.invoke('file:read', relativePath),
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

  // Jira Attachments (REST API)
  jiraAttachment: {
    upload: (issueKey: string, filePath: string) => 
      ipcRenderer.invoke('jiraAttachment:upload', issueKey, filePath),
    isConfigured: () => ipcRenderer.invoke('jiraAttachment:isConfigured'),
  },

  // AI
  ai: {
    configure: (config: { provider: 'openai' | 'anthropic' | 'groq' | 'moonshot'; apiKey: string; model?: string }) =>
      ipcRenderer.invoke('ai:configure', config),
    configureReasoning: (config: { provider: 'openai' | 'anthropic' | 'groq' | 'moonshot'; apiKey: string; model?: string }) =>
      ipcRenderer.invoke('ai:configureReasoning', config),
    // Legacy alias kept for backward compatibility
    configurePlanner: (config: { provider: 'openai' | 'anthropic' | 'groq' | 'moonshot'; apiKey: string; model?: string }) =>
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
      onToken: (token: string) => void
    ): Promise<{ success: boolean; data?: { content: string; toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }> }; error?: string }> => {
      return new Promise((resolve) => {
        const onTokenListener = (_: Electron.IpcRendererEvent, token: string) => onToken(token)
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
          ipcRenderer.removeListener('ai:stream:done', onDone)
          ipcRenderer.removeListener('ai:stream:error', onError)
        }
        ipcRenderer.on('ai:stream:token', onTokenListener)
        ipcRenderer.on('ai:stream:done', onDone)
        ipcRenderer.on('ai:stream:error', onError)
        ipcRenderer.send('ai:chat:stream', messages, tools)
      })
    },
    chatReasoningStream: (
      messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
      tools: unknown[] | undefined,
      onToken: (token: string) => void
    ): Promise<{ success: boolean; data?: { content: string; toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }> }; error?: string }> => {
      return new Promise((resolve) => {
        const onTokenListener = (_: Electron.IpcRendererEvent, token: string) => onToken(token)
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
          ipcRenderer.removeListener('ai:reasoning:stream:done', onDone)
          ipcRenderer.removeListener('ai:reasoning:stream:error', onError)
        }
        ipcRenderer.on('ai:reasoning:stream:token', onTokenListener)
        ipcRenderer.on('ai:reasoning:stream:done', onDone)
        ipcRenderer.on('ai:reasoning:stream:error', onError)
        ipcRenderer.send('ai:reasoning:stream', messages, tools)
      })
    },
  },

  // Atlassian MCP
  mcp: {
    connect: (options?: { forceReauth?: boolean }) => ipcRenderer.invoke('mcp:connect', options),
    disconnect: () => ipcRenderer.invoke('mcp:disconnect'),
    status: () => ipcRenderer.invoke('mcp:status'),
    getConnectionState: () => ipcRenderer.invoke('mcp:getConnectionState'),
    onConnectionStateChange: (callback: (state: { state: string; error?: string }) => void) => {
      ipcRenderer.on('mcp:connectionState', (_, data) => callback(data))
      // Return cleanup function
      return () => ipcRenderer.removeAllListeners('mcp:connectionState')
    },
    getProjects: () => ipcRenderer.invoke('mcp:getProjects'),
    getProjectIssueTypes: (projectKey: string) => ipcRenderer.invoke('mcp:getProjectIssueTypes', projectKey),
    getFieldMetadata: (projectKey: string, issueTypeId: string) => 
      ipcRenderer.invoke('mcp:getFieldMetadata', projectKey, issueTypeId),
    searchIssues: (jql: string, maxResults?: number, fields?: string | string[]) => ipcRenderer.invoke('mcp:searchIssues', jql, maxResults, fields),
    getIssue: (issueKey: string) => ipcRenderer.invoke('mcp:getIssue', issueKey),
    createIssue: (projectKey: string, issueTypeId: string, summary: string, description?: string, additionalFields?: Record<string, unknown>) =>
      ipcRenderer.invoke('mcp:createIssue', projectKey, issueTypeId, summary, description, additionalFields),
    editIssue: (issueKey: string, fields: Record<string, unknown>) =>
      ipcRenderer.invoke('mcp:editIssue', issueKey, fields),
    addComment: (issueKey: string, body: string) => ipcRenderer.invoke('mcp:addComment', issueKey, body),
    getTransitions: (issueKey: string) => ipcRenderer.invoke('mcp:getTransitions', issueKey),
    transitionIssue: (issueKey: string, transitionId: string) =>
      ipcRenderer.invoke('mcp:transitionIssue', issueKey, transitionId),
    syncMetadata: (projectKeys: string[]) => ipcRenderer.invoke('mcp:syncMetadata', projectKeys),
    syncAllMetadata: (projectKeys: string[]) => ipcRenderer.invoke('mcp:syncAllMetadata', projectKeys),
    fetchUsers: (projectKeys: string[]) => ipcRenderer.invoke('mcp:fetchUsers', projectKeys),
    getAssignableUsers: (projectKey: string) => ipcRenderer.invoke('mcp:getAssignableUsers', projectKey),
    getCurrentUser: () => ipcRenderer.invoke('mcp:getCurrentUser'),
    listTools: () => ipcRenderer.invoke('mcp:listTools'),
    lookupUser: (query: string) => ipcRenderer.invoke('mcp:lookupUser', query),
  },

  // Jira Metadata
  jiraMetadata: {
    get: () => ipcRenderer.invoke('jiraMetadata:get'),
    setMonitoredProjects: (projects: Array<{ id: string; key: string; name: string; projectTypeKey: string; avatarUrl?: string }>) =>
      ipcRenderer.invoke('jiraMetadata:setMonitoredProjects', projects),
    updateProjectMetadata: (projectKey: string, metadata: unknown) =>
      ipcRenderer.invoke('jiraMetadata:updateProjectMetadata', projectKey, metadata),
    set: (metadata: unknown) => ipcRenderer.invoke('jiraMetadata:set', metadata),
    setUsers: (users: Array<{ accountId: string; displayName: string; emailAddress?: string; avatarUrl?: string; active: boolean }>) =>
      ipcRenderer.invoke('jiraMetadata:setUsers', users),
  },

  // Shell
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
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
  jira: {
    configure: (config: { baseUrl: string; email: string; apiToken: string }) => Promise<{ success: boolean }>
    testConnection: () => Promise<{ success: boolean; error?: string; user?: unknown }>
    getProjects: () => Promise<{ success: boolean; data?: unknown[]; error?: string }>
    searchIssues: (jql: string, maxResults?: number) => Promise<{ success: boolean; data?: unknown; error?: string }>
    getIssue: (issueKey: string) => Promise<{ success: boolean; data?: unknown; error?: string }>
    createIssue: (issueData: Record<string, unknown>) => Promise<{ success: boolean; data?: unknown; error?: string }>
    updateIssue: (issueKey: string, updateData: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>
    addComment: (issueKey: string, comment: string) => Promise<{ success: boolean; data?: unknown; error?: string }>
    transitionIssue: (issueKey: string, transitionId: string) => Promise<{ success: boolean; error?: string }>
    getTransitions: (issueKey: string) => Promise<{ success: boolean; data?: unknown[]; error?: string }>
    getSprints: (boardId: number) => Promise<{ success: boolean; data?: unknown[]; error?: string }>
    getBoards: () => Promise<{ success: boolean; data?: unknown[]; error?: string }>
  }
  file: {
    selectWorkspace: () => Promise<{ success: boolean; path?: string }>
    getWorkspace: () => Promise<string | null>
    list: (relativePath?: string) => Promise<{ success: boolean; data?: unknown[]; error?: string }>
    read: (relativePath: string) => Promise<{ success: boolean; data?: string; error?: string }>
    write: (relativePath: string, content: string) => Promise<{ success: boolean; error?: string }>
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
    configure: (config: { provider: 'openai' | 'anthropic' | 'groq' | 'moonshot'; apiKey: string; model?: string }) => Promise<{ success: boolean }>
    configureReasoning: (config: { provider: 'openai' | 'anthropic' | 'groq' | 'moonshot'; apiKey: string; model?: string }) => Promise<{ success: boolean }>
    configurePlanner: (config: { provider: 'openai' | 'anthropic' | 'groq' | 'moonshot'; apiKey: string; model?: string }) => Promise<{ success: boolean }>
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
      onToken: (token: string) => void
    ) => Promise<{
      success: boolean
      data?: { content: string; toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }> }
      error?: string
    }>
    chatReasoningStream: (
      messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
      tools: unknown[] | undefined,
      onToken: (token: string) => void
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
    getConnectionState: () => Promise<{ state: 'disconnected' | 'connecting' | 'connected' | 'error'; connected: boolean }>
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
    fetchUsers: (projectKeys: string[]) => Promise<{ success: boolean; users?: unknown[]; error?: string }>
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
      users: Array<{ accountId: string; displayName: string; emailAddress?: string; avatarUrl?: string; active: boolean }>
      lastSynced: string | null
      syncedProjects: string[]
    }>
    setMonitoredProjects: (projects: Array<{ id: string; key: string; name: string; projectTypeKey: string; avatarUrl?: string }>) => Promise<{ success: boolean }>
    updateProjectMetadata: (projectKey: string, metadata: unknown) => Promise<{ success: boolean }>
    set: (metadata: unknown) => Promise<{ success: boolean }>
    setUsers: (users: Array<{ accountId: string; displayName: string; emailAddress?: string; avatarUrl?: string; active: boolean }>) => Promise<{ success: boolean }>
  }
  shell: {
    openExternal: (url: string) => Promise<{ success: boolean }>
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
  }
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
