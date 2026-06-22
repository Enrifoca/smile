import { useCallback, useMemo } from 'react'
import '../types/electron.d.ts'
import { AIConfig, ModelProvider } from '../shared/modelCatalog'

// Hook to access Electron API from renderer
export function useElectron() {
  const api = window.electronAPI
  const platform = api.platform

  // Storage operations
  const storageGet = useCallback(async (key: string) => api.storage.get(key), [])
  const storageSet = useCallback(async (key: string, value: unknown) => api.storage.set(key, value), [])
  const storageGetSecure = useCallback(async (key: string) => api.storage.getSecure(key), [])
  const storageSetSecure = useCallback(async (key: string, value: string) => api.storage.setSecure(key, value), [])
  const storage = useMemo(
    () => ({ get: storageGet, set: storageSet, getSecure: storageGetSecure, setSecure: storageSetSecure }),
    [storageGet, storageSet, storageGetSecure, storageSetSecure],
  )

  const modelsGetCatalog = useCallback(async () => api.models.getCatalog(), [])
  const modelsRefresh = useCallback(async () => api.models.refresh(), [])
  const modelsRefreshProvider = useCallback(async (provider: ModelProvider) => api.models.refreshProvider(provider), [])
  const models = useMemo(
    () => ({ getCatalog: modelsGetCatalog, refresh: modelsRefresh, refreshProvider: modelsRefreshProvider }),
    [modelsGetCatalog, modelsRefresh, modelsRefreshProvider],
  )

  const windowMinimize = useCallback(async () => api.windowControls.minimize(), [])
  const windowToggleMaximize = useCallback(async () => api.windowControls.toggleMaximize(), [])
  const windowClose = useCallback(async () => api.windowControls.close(), [])
  const windowControls = useMemo(
    () => ({ minimize: windowMinimize, toggleMaximize: windowToggleMaximize, close: windowClose }),
    [windowMinimize, windowToggleMaximize, windowClose],
  )

  const fileSelectWorkspace = useCallback(async () => api.file.selectWorkspace(), [])
  const fileGetWorkspace = useCallback(async () => api.file.getWorkspace(), [])
  const fileSelectFolderInWorkspace = useCallback(async () => api.file.selectFolderInWorkspace(), [])
  const fileList = useCallback(async (relativePath?: string) => api.file.list(relativePath), [])
  const fileRead = useCallback(async (relativePath: string) => api.file.read(relativePath), [])
  const fileReadOcr = useCallback(async (relativePath: string) => api.file.readOcr(relativePath), [])
  const fileWrite = useCallback(async (relativePath: string, content: string) => api.file.write(relativePath, content), [])
  const fileMkdir = useCallback(async (relativePath: string) => api.file.mkdir(relativePath), [])
  const fileExists = useCallback(async (relativePath: string) => api.file.exists(relativePath), [])
  const fileSearch = useCallback(async (pattern: string, directory?: string) => api.file.search(pattern, directory), [])
  const fileGetFileInfo = useCallback(async (relativePath: string) => api.file.getFileInfo(relativePath), [])
  const fileEnsureAttachmentsDir = useCallback(async () => api.file.ensureAttachmentsDir(), [])
  const fileSaveAttachment = useCallback(async (fileName: string, data: ArrayBuffer) => api.file.saveAttachment(fileName, data), [])
  const file = useMemo(
    () => ({
      selectWorkspace: fileSelectWorkspace,
      getWorkspace: fileGetWorkspace,
      selectFolderInWorkspace: fileSelectFolderInWorkspace,
      list: fileList,
      read: fileRead,
      readOcr: fileReadOcr,
      write: fileWrite,
      mkdir: fileMkdir,
      exists: fileExists,
      search: fileSearch,
      getFileInfo: fileGetFileInfo,
      ensureAttachmentsDir: fileEnsureAttachmentsDir,
      saveAttachment: fileSaveAttachment,
    }),
    [
      fileSelectWorkspace, fileGetWorkspace, fileSelectFolderInWorkspace, fileList, fileRead, fileReadOcr,
      fileWrite, fileMkdir, fileExists, fileSearch, fileGetFileInfo, fileEnsureAttachmentsDir, fileSaveAttachment,
    ],
  )

  const mcpConnect = useCallback(async (options?: { forceReauth?: boolean }) => api.mcp.connect(options), [])
  const mcpDisconnect = useCallback(async () => api.mcp.disconnect(), [])
  const mcpStatus = useCallback(async () => api.mcp.status(), [])
  const mcpGetConnectionState = useCallback(async () => api.mcp.getConnectionState(), [])
  const mcpOnConnectionStateChange = useCallback((callback: (state: { state: string; error?: string }) => void) => api.mcp.onConnectionStateChange(callback), [])
  const mcp = useMemo(
    () => ({
      connect: mcpConnect,
      disconnect: mcpDisconnect,
      status: mcpStatus,
      getConnectionState: mcpGetConnectionState,
      onConnectionStateChange: mcpOnConnectionStateChange,
    }),
    [mcpConnect, mcpDisconnect, mcpStatus, mcpGetConnectionState, mcpOnConnectionStateChange],
  )

  const aiConfigure = useCallback(async (config: AIConfig) => api.ai.configure(config), [])
  const aiConfigureReasoning = useCallback(async (config: AIConfig) => api.ai.configureReasoning(config), [])
  const aiChat = useCallback(async (messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>, tools?: unknown[]) => api.ai.chat(messages, tools), [])
  const aiChatReasoning = useCallback(async (messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>, tools?: unknown[]) => api.ai.chatReasoning(messages, tools), [])
  const aiChatStream = useCallback((
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    tools: unknown[] | undefined,
    onToken: (token: string) => void,
    onProgress?: (event: { toolName: string; title?: string }) => void,
  ) => api.ai.chatStream(messages, tools, onToken, onProgress), [])
  const aiChatReasoningStream = useCallback((
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    tools: unknown[] | undefined,
    onToken: (token: string) => void,
    onProgress?: (event: { toolName: string; title?: string }) => void,
  ) => api.ai.chatReasoningStream(messages, tools, onToken, onProgress), [])
  const aiAbortStream = useCallback(() => api.ai.abortStream(), [])
  const ai = useMemo(
    () => ({
      configure: aiConfigure,
      configureReasoning: aiConfigureReasoning,
      chat: aiChat,
      chatReasoning: aiChatReasoning,
      chatStream: aiChatStream,
      chatReasoningStream: aiChatReasoningStream,
      abortStream: aiAbortStream,
    }),
    [aiConfigure, aiConfigureReasoning, aiChat, aiChatReasoning, aiChatStream, aiChatReasoningStream, aiAbortStream],
  )

  const shellOpenExternal = useCallback(async (url: string) => api.shell.openExternal(url), [])
  const shell = useMemo(() => ({ openExternal: shellOpenExternal }), [shellOpenExternal])

  const connectorsList = useCallback(async () => api.connectors.list(), [])
  const connectorsExecute = useCallback(
    async (
      connectorId: string,
      name: string,
      args: Record<string, unknown>,
      context?: import('../connectors/contract').ContextEnvelope,
    ) => api.connectors.execute(connectorId, name, args, context),
    [],
  )
  const connectorsApprove = useCallback(
    async (
      connectorId: string,
      actionType: string,
      data: Record<string, unknown>,
      context?: import('../connectors/contract').ContextEnvelope,
    ) => api.connectors.approve(connectorId, actionType, data, context),
    [],
  )
  const connectorsGetKnowledge = useCallback(async (contextId: string, connectorId: string) => api.connectors.getKnowledge(contextId, connectorId), [])
  const connectorsSaveKnowledge = useCallback(async (contextId: string, connectorId: string, markdown: string) => api.connectors.saveKnowledge(contextId, connectorId, markdown), [])
  const connectorsDeletePackage = useCallback(async (connectorId: string) => api.connectors.deletePackage(connectorId), [])
  const connectorsInstallPackage = useCallback(async (connectorId: string) => api.connectors.installPackage(connectorId), [])
  const connectorsGetIcon = useCallback(async (connectorId: string) => api.connectors.getIcon(connectorId), [])
  const connectorsGetBundledIcon = useCallback(async (connectorId: string) => api.connectors.getBundledIcon(connectorId), [])
  const connectors = useMemo(
    () => ({
      list: connectorsList,
      execute: connectorsExecute,
      approve: connectorsApprove,
      getKnowledge: connectorsGetKnowledge,
      saveKnowledge: connectorsSaveKnowledge,
      deletePackage: connectorsDeletePackage,
      installPackage: connectorsInstallPackage,
      getIcon: connectorsGetIcon,
      getBundledIcon: connectorsGetBundledIcon,
    }),
    [
      connectorsList,
      connectorsExecute,
      connectorsApprove,
      connectorsGetKnowledge,
      connectorsSaveKnowledge,
      connectorsDeletePackage,
      connectorsInstallPackage,
      connectorsGetIcon,
      connectorsGetBundledIcon,
    ],
  )

  const contextsList = useCallback(async () => api.contexts.list(), [])
  const contextsCreate = useCallback(async (name: string) => api.contexts.create(name), [])
  const contextsSave = useCallback(async (context: import('../context/types').ProjectContext) => api.contexts.save(context), [])
  const contextsDelete = useCallback(async (contextId: string) => api.contexts.delete(contextId), [])
  const contextsReadMarkdown = useCallback(async (contextId: string) => api.contexts.readMarkdown(contextId), [])
  const contextsWriteMarkdown = useCallback(async (contextId: string, content: string) => api.contexts.writeMarkdown(contextId, content), [])
  const contextsGetPromptBody = useCallback(async (contextId: string) => api.contexts.getPromptBody(contextId), [])
  const contextsAppendSection = useCallback(async (contextId: string, section: string, content: string) => api.contexts.appendSection(contextId, section, content), [])
  const contextsReplaceSection = useCallback(async (contextId: string, heading: string, content: string) => api.contexts.replaceSection(contextId, heading, content), [])
  const contexts = useMemo(
    () => ({
      list: contextsList,
      create: contextsCreate,
      save: contextsSave,
      delete: contextsDelete,
      readMarkdown: contextsReadMarkdown,
      writeMarkdown: contextsWriteMarkdown,
      getPromptBody: contextsGetPromptBody,
      appendSection: contextsAppendSection,
      replaceSection: contextsReplaceSection,
    }),
    [
      contextsList,
      contextsCreate,
      contextsSave,
      contextsDelete,
      contextsReadMarkdown,
      contextsWriteMarkdown,
      contextsGetPromptBody,
      contextsAppendSection,
      contextsReplaceSection,
    ],
  )

  const memoryGetAll = useCallback(async () => api.memory.getAll(), [])
  const memorySave = useCallback(async (memoryData: unknown) => api.memory.save(memoryData), [])
  const memorySaveUserMarkdown = useCallback(async (markdown: string) => api.memory.saveUserMarkdown(markdown), [])
  const memoryAddGeneral = useCallback(async (content: string, source?: 'learned' | 'user') => api.memory.addGeneral(content, source), [])
  const memoryAddLexicon = useCallback(async (content: string, source?: 'learned' | 'user') => api.memory.addLexicon(content, source), [])
  const memoryAddCommonPhrase = useCallback(async (phrase: string) => api.memory.addCommonPhrase(phrase), [])
  const memoryAddIssueExample = useCallback(async (issueTypeName: string, issueTypeId: string, example: {
    issueKey: string
    summary: string
    description?: string
    createdAt: string
    customFields?: Record<string, unknown>
  }) => api.memory.addIssueExample(issueTypeName, issueTypeId, example), [])
  const memorySyncIssueExamples = useCallback(async (issueTypeName: string, issueTypeId: string, examples: Array<{
    issueKey: string
    summary: string
    description?: string
    createdAt: string
    customFields?: Record<string, unknown>
  }>) => api.memory.syncIssueExamples(issueTypeName, issueTypeId, examples), [])
  const memoryUpdateLastSynced = useCallback(async () => api.memory.updateLastSynced(), [])
  const memoryDeleteGeneral = useCallback(async (id: string) => api.memory.deleteGeneral(id), [])
  const memoryDeleteLexicon = useCallback(async (id: string) => api.memory.deleteLexicon(id), [])
  const memoryUpdateEntry = useCallback(async (category: 'general' | 'lexicon', id: string, content: string) => api.memory.updateEntry(category, id, content), [])
  const memoryAppendSourceLeaf = useCallback(async (leaf: {
    connectorId: string
    scopeId: string
    kind: 'write_outcome' | 'scope_sync' | 'user_pin'
    toolName: string
    summary: string
  }) => api.memory.appendSourceLeaf(leaf), [])
  const memoryReadSource = useCallback(async (connectorId: string, scopeId: string) => api.memory.readSource(connectorId, scopeId), [])
  const memoryListSources = useCallback(async () => api.memory.listSources(), [])
  const memory = useMemo(
    () => ({
      getAll: memoryGetAll,
      save: memorySave,
      saveUserMarkdown: memorySaveUserMarkdown,
      addGeneral: memoryAddGeneral,
      addLexicon: memoryAddLexicon,
      addCommonPhrase: memoryAddCommonPhrase,
      addIssueExample: memoryAddIssueExample,
      syncIssueExamples: memorySyncIssueExamples,
      updateLastSynced: memoryUpdateLastSynced,
      deleteGeneral: memoryDeleteGeneral,
      deleteLexicon: memoryDeleteLexicon,
      updateEntry: memoryUpdateEntry,
      appendSourceLeaf: memoryAppendSourceLeaf,
      readSource: memoryReadSource,
      listSources: memoryListSources,
    }),
    [
      memoryGetAll, memorySave, memorySaveUserMarkdown, memoryAddGeneral, memoryAddLexicon,
      memoryAddCommonPhrase, memoryAddIssueExample, memorySyncIssueExamples, memoryUpdateLastSynced,
      memoryDeleteGeneral, memoryDeleteLexicon, memoryUpdateEntry, memoryAppendSourceLeaf,
      memoryReadSource, memoryListSources,
    ],
  )

  return {
    platform,
    storage,
    windowControls,
    models,
    file,
    ai,
    mcp,
    shell,
    connectors,
    contexts,
    memory,
    app: api.app,
    updates: api.updates,
  }
}
