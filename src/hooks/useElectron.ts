import { useCallback } from 'react'
import '../types/electron.d.ts'
import { AIConfig, ModelProvider } from '../shared/modelCatalog'

// Hook to access Electron API from renderer
export function useElectron() {
  const api = window.electronAPI

  // Storage operations
  const storage = {
    get: useCallback(async (key: string) => {
      return api.storage.get(key)
    }, []),
    
    set: useCallback(async (key: string, value: unknown) => {
      return api.storage.set(key, value)
    }, []),
    
    getSecure: useCallback(async (key: string) => {
      return api.storage.getSecure(key)
    }, []),
    
    setSecure: useCallback(async (key: string, value: string) => {
      return api.storage.setSecure(key, value)
    }, []),
  }

  const models = {
    getCatalog: useCallback(async () => {
      return api.models.getCatalog()
    }, []),

    refresh: useCallback(async () => {
      return api.models.refresh()
    }, []),

    refreshProvider: useCallback(async (provider: ModelProvider) => {
      return api.models.refreshProvider(provider)
    }, []),
  }

  const windowControls = {
    minimize: useCallback(async () => {
      return api.windowControls.minimize()
    }, []),

    toggleMaximize: useCallback(async () => {
      return api.windowControls.toggleMaximize()
    }, []),

    close: useCallback(async () => {
      return api.windowControls.close()
    }, []),
  }

  // Jira operations
  const jira = {
    configure: useCallback(async (config: { baseUrl: string; email: string; apiToken: string }) => {
      return api.jira.configure(config)
    }, []),
    
    testConnection: useCallback(async () => {
      return api.jira.testConnection()
    }, []),
    
    getProjects: useCallback(async () => {
      return api.jira.getProjects()
    }, []),
    
    searchIssues: useCallback(async (jql: string, maxResults?: number) => {
      return api.jira.searchIssues(jql, maxResults)
    }, []),
    
    getIssue: useCallback(async (issueKey: string) => {
      return api.jira.getIssue(issueKey)
    }, []),
    
    createIssue: useCallback(async (issueData: Record<string, unknown>) => {
      return api.jira.createIssue(issueData)
    }, []),
    
    updateIssue: useCallback(async (issueKey: string, updateData: Record<string, unknown>) => {
      return api.jira.updateIssue(issueKey, updateData)
    }, []),
    
    addComment: useCallback(async (issueKey: string, comment: string) => {
      return api.jira.addComment(issueKey, comment)
    }, []),
    
    transitionIssue: useCallback(async (issueKey: string, transitionId: string) => {
      return api.jira.transitionIssue(issueKey, transitionId)
    }, []),
    
    getTransitions: useCallback(async (issueKey: string) => {
      return api.jira.getTransitions(issueKey)
    }, []),
    
    getSprints: useCallback(async (boardId: number) => {
      return api.jira.getSprints(boardId)
    }, []),
    
    getBoards: useCallback(async () => {
      return api.jira.getBoards()
    }, []),
  }

  // File operations
  const file = {
    selectWorkspace: useCallback(async () => {
      return api.file.selectWorkspace()
    }, []),
    
    getWorkspace: useCallback(async () => {
      return api.file.getWorkspace()
    }, []),
    
    list: useCallback(async (relativePath?: string) => {
      return api.file.list(relativePath)
    }, []),
    
    read: useCallback(async (relativePath: string) => {
      return api.file.read(relativePath)
    }, []),

    readOcr: useCallback(async (relativePath: string) => {
      return api.file.readOcr(relativePath)
    }, []),
    
    write: useCallback(async (relativePath: string, content: string) => {
      return api.file.write(relativePath, content)
    }, []),

    mkdir: useCallback(async (relativePath: string) => {
      return api.file.mkdir(relativePath)
    }, []),
    
    exists: useCallback(async (relativePath: string) => {
      return api.file.exists(relativePath)
    }, []),
    
    search: useCallback(async (pattern: string, directory?: string) => {
      return api.file.search(pattern, directory)
    }, []),
    
    getFileInfo: useCallback(async (relativePath: string) => {
      return api.file.getFileInfo(relativePath)
    }, []),
    
    ensureAttachmentsDir: useCallback(async () => {
      return api.file.ensureAttachmentsDir()
    }, []),
    
    saveAttachment: useCallback(async (fileName: string, data: ArrayBuffer) => {
      return api.file.saveAttachment(fileName, data)
    }, []),
  }

  // Jira Attachment operations (REST API)
  const jiraAttachment = {
    upload: useCallback(async (issueKey: string, filePath: string) => {
      return api.jiraAttachment.upload(issueKey, filePath)
    }, []),
    
    isConfigured: useCallback(async () => {
      return api.jiraAttachment.isConfigured()
    }, []),
  }

  // AI operations
  const ai = {
    configure: useCallback(async (config: AIConfig) => {
      return api.ai.configure(config)
    }, []),

    configureReasoning: useCallback(async (config: AIConfig) => {
      return api.ai.configureReasoning(config)
    }, []),

    configurePlanner: useCallback(async (config: AIConfig) => {
      return api.ai.configurePlanner(config)
    }, []),

    plan: useCallback(async (messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>) => {
      return api.ai.plan(messages)
    }, []),
    
    chat: useCallback(async (messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>, tools?: unknown[]) => {
      return api.ai.chat(messages, tools)
    }, []),

    chatReasoning: useCallback(async (messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>, tools?: unknown[]) => {
      return api.ai.chatReasoning(messages, tools)
    }, []),

    chatStream: useCallback((
      messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
      tools: unknown[] | undefined,
      onToken: (token: string) => void
    ) => {
      return api.ai.chatStream(messages, tools, onToken)
    }, []),

    chatReasoningStream: useCallback((
      messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
      tools: unknown[] | undefined,
      onToken: (token: string) => void
    ) => {
      return api.ai.chatReasoningStream(messages, tools, onToken)
    }, []),
  }

  // Atlassian MCP operations
  const mcp = {
    connect: useCallback(async (options?: { forceReauth?: boolean }) => {
      return api.mcp.connect(options)
    }, []),
    
    disconnect: useCallback(async () => {
      return api.mcp.disconnect()
    }, []),
    
    status: useCallback(async () => {
      return api.mcp.status()
    }, []),
    
    getConnectionState: useCallback(async () => {
      return api.mcp.getConnectionState()
    }, []),
    
    onConnectionStateChange: useCallback((callback: (state: { state: string; error?: string }) => void) => {
      return api.mcp.onConnectionStateChange(callback)
    }, []),
    
    getProjects: useCallback(async () => {
      return api.mcp.getProjects()
    }, []),
    
    getProjectIssueTypes: useCallback(async (projectKey: string) => {
      return api.mcp.getProjectIssueTypes(projectKey)
    }, []),
    
    getFieldMetadata: useCallback(async (projectKey: string, issueTypeId: string) => {
      return api.mcp.getFieldMetadata(projectKey, issueTypeId)
    }, []),
    
    searchIssues: useCallback(async (jql: string, maxResults?: number, fields?: string | string[]) => {
      return api.mcp.searchIssues(jql, maxResults, fields)
    }, []),
    
    getIssue: useCallback(async (issueKey: string) => {
      return api.mcp.getIssue(issueKey)
    }, []),
    
    createIssue: useCallback(async (projectKey: string, issueTypeName: string, summary: string, description?: string, additionalFields?: Record<string, unknown>) => {
      return api.mcp.createIssue(projectKey, issueTypeName, summary, description, additionalFields)
    }, []),
    
    editIssue: useCallback(async (issueKey: string, fields: Record<string, unknown>) => {
      return api.mcp.editIssue(issueKey, fields)
    }, []),
    
    addComment: useCallback(async (issueKey: string, body: string) => {
      return api.mcp.addComment(issueKey, body)
    }, []),
    
    getTransitions: useCallback(async (issueKey: string) => {
      return api.mcp.getTransitions(issueKey)
    }, []),
    
    transitionIssue: useCallback(async (issueKey: string, transitionId: string) => {
      return api.mcp.transitionIssue(issueKey, transitionId)
    }, []),
    
    syncMetadata: useCallback(async (projectKeys: string[]) => {
      return api.mcp.syncMetadata(projectKeys)
    }, []),
    
    syncAllMetadata: useCallback(async (projectKeys: string[]) => {
      return api.mcp.syncAllMetadata(projectKeys)
    }, []),
    
    fetchUsers: useCallback(async (projectKeys: string[]) => {
      return api.mcp.fetchUsers(projectKeys)
    }, []),
    
    getAssignableUsers: useCallback(async (projectKey: string) => {
      return api.mcp.getAssignableUsers(projectKey)
    }, []),
    
    getCurrentUser: useCallback(async () => {
      return api.mcp.getCurrentUser()
    }, []),
    
    listTools: useCallback(async () => {
      return api.mcp.listTools()
    }, []),
    
    lookupUser: useCallback(async (query: string) => {
      return api.mcp.lookupUser(query)
    }, []),
  }

  // Jira Metadata operations
  const jiraMetadata = {
    get: useCallback(async () => {
      return api.jiraMetadata.get()
    }, []),
    
    setMonitoredProjects: useCallback(async (projects: Array<{ id: string; key: string; name: string; projectTypeKey: string; avatarUrl?: string }>) => {
      return api.jiraMetadata.setMonitoredProjects(projects)
    }, []),
    
    updateProjectMetadata: useCallback(async (projectKey: string, metadata: unknown) => {
      return api.jiraMetadata.updateProjectMetadata(projectKey, metadata)
    }, []),
    
    set: useCallback(async (metadata: unknown) => {
      return api.jiraMetadata.set(metadata)
    }, []),
    
    setUsers: useCallback(async (users: Array<{ accountId: string; displayName: string; emailAddress?: string; avatarUrl?: string; active: boolean }>) => {
      return api.jiraMetadata.setUsers(users)
    }, []),
  }

  // Shell operations
  const shell = {
    openExternal: useCallback(async (url: string) => {
      return api.shell.openExternal(url)
    }, []),
  }

  // Memory operations
  const memory = {
    getAll: useCallback(async () => {
      return api.memory.getAll()
    }, []),
    
    save: useCallback(async (memoryData: unknown) => {
      return api.memory.save(memoryData)
    }, []),

    saveUserMarkdown: useCallback(async (markdown: string) => {
      return api.memory.saveUserMarkdown(markdown)
    }, []),
    
    addGeneral: useCallback(async (content: string, source?: 'learned' | 'user') => {
      return api.memory.addGeneral(content, source)
    }, []),
    
    addLexicon: useCallback(async (content: string, source?: 'learned' | 'user') => {
      return api.memory.addLexicon(content, source)
    }, []),
    
    addCommonPhrase: useCallback(async (phrase: string) => {
      return api.memory.addCommonPhrase(phrase)
    }, []),
    
    addIssueExample: useCallback(async (issueTypeName: string, issueTypeId: string, example: {
      issueKey: string
      summary: string
      description?: string
      createdAt: string
      customFields?: Record<string, unknown>
    }) => {
      return api.memory.addIssueExample(issueTypeName, issueTypeId, example)
    }, []),
    
    syncIssueExamples: useCallback(async (issueTypeName: string, issueTypeId: string, examples: Array<{
      issueKey: string
      summary: string
      description?: string
      createdAt: string
      customFields?: Record<string, unknown>
    }>) => {
      return api.memory.syncIssueExamples(issueTypeName, issueTypeId, examples)
    }, []),
    
    updateLastSynced: useCallback(async () => {
      return api.memory.updateLastSynced()
    }, []),
    
    deleteGeneral: useCallback(async (id: string) => {
      return api.memory.deleteGeneral(id)
    }, []),
    
    deleteLexicon: useCallback(async (id: string) => {
      return api.memory.deleteLexicon(id)
    }, []),
    
    updateEntry: useCallback(async (category: 'general' | 'lexicon', id: string, content: string) => {
      return api.memory.updateEntry(category, id, content)
    }, []),
  }

  return {
    storage,
    windowControls,
    models,
    jira,
    file,
    ai,
    mcp,
    jiraMetadata,
    shell,
    memory,
    jiraAttachment,
  }
}
