import { useState, useEffect, useRef, useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useElectron } from '../hooks/useElectron'
import { Agent, Message, PendingAction, UserProfile } from '../agent'
import { MemoryStore } from '../types/memory'
import ChatMessage from './ChatMessage'

interface ChatViewProps {
  chatId: string | null
  onChatCreated: (chatId: string) => void
}

type McpConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error'

interface ManagedProject {
  id: string
  key: string
  name: string
  avatarUrl?: string
}


/** Returns a specific, human-readable label for a tool call based on its arguments */

const SendIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
  </svg>
)

const StopIcon = () => (
  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
    <rect x="3" y="3" width="10" height="10" rx="1.5" />
  </svg>
)

const LoadingSpinner = () => (
  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
)

export default function ChatView({ chatId, onChatCreated }: ChatViewProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [agent, setAgent] = useState<Agent | null>(null)
  const [isConfigured, setIsConfigured] = useState(false)
  const [mcpConnectionState, setMcpConnectionState] = useState<McpConnectionState>('disconnected')
  const [attachedFiles, setAttachedFiles] = useState<Array<{ name: string; path: string; size: number }>>([])
  const [managedProjects, setManagedProjects] = useState<ManagedProject[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Streaming content accumulator (keyed by message id)
  const streamingContentRef = useRef<Map<string, string>>(new Map())
  // Hard cap: allow at most 1 memory_update per user turn (reset on each send)
  const memoryUpdateCountRef = useRef(0)

  // Stable chat ID for the current session. When chatId prop is null (new chat),
  // we generate one on first save and reuse it for all subsequent saves.
  const sessionChatIdRef = useRef<string | null>(null)

  // In-memory cache of the full chatHistory array.
  // Loaded once on mount. All saveChat calls read/write this ref synchronously
  // so concurrent saves never race against each other via storage reads.
  const chatHistoryRef = useRef<Array<{ id: string; title: string; date: string; messages: Message[] }>>([])
  const historyLoadedRef = useRef(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { storage, mcp, file, ai, jiraMetadata: jiraMetadataAPI, memory: memoryAPI, jiraAttachment } = useElectron()

  const loadMemoryForAgent = async (): Promise<MemoryStore | null> => {
    try {
      const memoryResult = await memoryAPI.getAll()
      if (memoryResult.success && memoryResult.data) {
        return memoryResult.data as MemoryStore
      }
    } catch (memError) {
      console.log('[ChatView] Memory not available:', memError)
    }
    return null
  }

  // Handle file drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const droppedFiles = Array.from(e.dataTransfer.files)
    await processFiles(droppedFiles)
  }, [file])

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files)
      await processFiles(selectedFiles)
    }
  }, [file])

  const processFiles = async (files: File[]) => {
    const MAX_SIZE = 10 * 1024 * 1024 // 10MB
    const newAttachments: Array<{ name: string; path: string; size: number }> = []

    for (const f of files) {
      if (f.size > MAX_SIZE) {
        alert(`File "${f.name}" is too large (${(f.size / 1024 / 1024).toFixed(2)}MB). Maximum size is 10MB.`)
        continue
      }

      try {
        // Read file as ArrayBuffer
        const arrayBuffer = await f.arrayBuffer()
        
        // Save to .mirai/attachments folder
        const result = await file.saveAttachment(f.name, arrayBuffer)
        
        if (result.success && result.path) {
          newAttachments.push({
            name: f.name,
            path: result.path,
            size: f.size
          })
        } else {
          console.error('Failed to save attachment:', result.error)
        }
      } catch (err) {
        console.error('Error processing file:', err)
      }
    }

    if (newAttachments.length > 0) {
      setAttachedFiles(prev => [...prev, ...newAttachments])
    }
  }

  const removeAttachment = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index))
  }

  const openFilePicker = () => {
    fileInputRef.current?.click()
  }

  // Initialize agent and pre-load chat history into memory
  useEffect(() => {
    initializeAgent()
    storage.get('chatHistory').then(h => {
      const arr = h as Array<{ id: string; title: string; date: string; messages: Message[] }> | null
      chatHistoryRef.current = arr || []
      historyLoadedRef.current = true
    }).catch(() => {
      chatHistoryRef.current = []
      historyLoadedRef.current = true
    })
  }, [])

  // Listen for MCP connection state changes
  useEffect(() => {
    // Get initial state
    mcp.getConnectionState().then((result) => {
      setMcpConnectionState(result.state as McpConnectionState)
    })

    // Subscribe to state changes
    const cleanup = mcp.onConnectionStateChange((data) => {
      setMcpConnectionState(data.state as McpConnectionState)
    })

    return cleanup
  }, [mcp])

  // Load chat if chatId provided. Also reset the session ID ref whenever the
  // active chat changes (so a new chat doesn't reuse a stale generated ID).
  useEffect(() => {
    sessionChatIdRef.current = chatId
    if (chatId) {
      loadChat(chatId)
      // Re-sync the in-memory cache in case other sessions wrote to storage
      // (e.g. the user was looking at another chat while this one was saved)
      storage.get('chatHistory').then(h => {
        const arr = h as Array<{ id: string; title: string; date: string; messages: Message[] }> | null
        if (arr) chatHistoryRef.current = arr
      }).catch(() => {/* keep existing cache */})
    } else {
      setMessages([])
      agent?.clearHistory()
    }
  }, [chatId, agent])

  // Auto-scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`
    }
  }, [input])

  const initializeAgent = async () => {
    try {
      // Get AI config
      const aiConfigStr = await storage.getSecure('aiConfig')
      if (!aiConfigStr) {
        setIsConfigured(false)
        return
      }

      // Configure AI service in main process
      const aiConfig = JSON.parse(aiConfigStr)
      await ai.configure(aiConfig)
      
      const userProfile = await storage.get('userProfile') as UserProfile | null
      
      // Get Jira metadata for the agent's system prompt
      const jiraMetadataRaw = await jiraMetadataAPI.get()
      // Cast to the proper type since the IPC returns a more generic type
      // Ensure all required fields exist with defaults for backward compatibility
      const jiraMetadata: import('../types/jira').JiraMetadataStore = {
        monitoredProjects: jiraMetadataRaw?.monitoredProjects || [],
        projectMetadata: (jiraMetadataRaw?.projectMetadata || {}) as Record<string, import('../types/jira').JiraProjectMetadata>,
        standardFields: (jiraMetadataRaw?.standardFields || []) as import('../types/jira').JiraField[],
        users: (jiraMetadataRaw?.users || []) as import('../types/jira').JiraUser[],
        lastSynced: jiraMetadataRaw?.lastSynced || null,
        syncedProjects: jiraMetadataRaw?.syncedProjects || [],
      }
      setManagedProjects(jiraMetadata.monitoredProjects)

      // Load memory for the agent
      const memory = await loadMemoryForAgent()

      // Load max iterations from settings (0 = no limit)
      let maxIterations: number = 10
      try {
        const iterSetting = await storage.get('agentMaxIterations') as number | null
        if (iterSetting !== null && iterSetting !== undefined) maxIterations = iterSetting
      } catch { /* use default */ }

      // Load optional reasoning model config
      let reasoningConfigured = false
      try {
        const reasoningConfigStr = await storage.getSecure('reasoningConfig')
          || await storage.getSecure('plannerConfig') // migrate legacy
        if (reasoningConfigStr) {
          const reasoningCfg = JSON.parse(reasoningConfigStr)
          await ai.configureReasoning(reasoningCfg)
          reasoningConfigured = true
        }
      } catch { /* reasoning model is optional */ }

      const newAgent = new Agent({
        userProfile,
        jiraMetadata: jiraMetadata.monitoredProjects.length > 0 ? jiraMetadata : null,
        memory,
        loadMemory: loadMemoryForAgent,
        maxIterations,
        onMessage: handleNewMessage,
        onUpdateMessage: handleUpdateMessage,
        onPendingAction: handlePendingAction,
        executeJiraTool,
        executeFileTool,
        executeMemoryTool,
        callAI: async (messages, tools) => ai.chat(messages, tools),
        callAIStream: async (messages, tools, onToken) => ai.chatStream(messages, tools, onToken),
        ...(reasoningConfigured && {
          callAIReasoning: async (messages, tools) => ai.chatReasoning(messages, tools),
          callAIReasoningStream: async (messages, tools, onToken) => ai.chatReasoningStream(messages, tools, onToken),
        }),
      })

      setAgent(newAgent)
      setIsConfigured(true)
    } catch (error) {
      console.error('Failed to initialize agent:', error)
      setIsConfigured(false)
    }
  }

  const loadChat = async (id: string) => {
    try {
      const history = await storage.get('chatHistory') as Array<{
        id: string
        messages: Message[]
      }> | null
      
      const chat = history?.find(c => c.id === id)
      if (chat) {
        setMessages(chat.messages)
        agent?.loadHistory(chat.messages)
      }
    } catch (error) {
      console.error('Failed to load chat:', error)
    }
  }

  const saveChat = useCallback((chatMessages: Message[]) => {
    try {
      // Resolve the chat ID for this session — synchronous, no storage read needed.
      let currentId: string
      let isNew = false
      if (chatId) {
        currentId = chatId
      } else if (sessionChatIdRef.current) {
        currentId = sessionChatIdRef.current
      } else {
        currentId = uuidv4()
        sessionChatIdRef.current = currentId
        isNew = true
      }

      const firstUserMsg = chatMessages.find(m => m.role === 'user')
      const title = firstUserMsg?.content.substring(0, 50) || 'New Chat'

      const chatData = {
        id: currentId,
        title,
        date: new Date().toISOString(),
        messages: chatMessages,
      }

      // Update the in-memory history ref synchronously — no race condition.
      const history = chatHistoryRef.current
      const existingIndex = history.findIndex(c => c.id === currentId)
      if (existingIndex >= 0) {
        history[existingIndex] = chatData
      } else {
        history.unshift(chatData)
        // Trim to 100 entries
        if (history.length > 100) history.pop()
      }

      // Flush to storage asynchronously (fire-and-forget — the ref is already updated)
      storage.set('chatHistory', history).catch(err =>
        console.error('Failed to persist chat:', err)
      )

      // Notify parent about new chat ID outside the storage path.
      // Use setTimeout(0) so this never runs inside a React state updater context.
      if (isNew) {
        setTimeout(() => onChatCreated(currentId), 0)
      }
    } catch (error) {
      console.error('Failed to save chat:', error)
    }
  }, [chatId, onChatCreated, storage])

  const handleNewMessage = useCallback((message: Message) => {
    setMessages(prev => {
      const exists = prev.find(m => m.id === message.id)
      const newMessages = exists
        ? prev.map(m => m.id === message.id ? message : m)
        : [...prev, message]
      saveChat(newMessages)
      return newMessages
    })
  }, [saveChat])

  /**
   * Called by the agent during streaming:
   * - token = '' and isStreaming = false → remove the streaming placeholder (tool call round)
   * - token = full content and isStreaming = false → finalise the message
   * - token = partial and isStreaming = true → append token
   */
  const handleUpdateMessage = useCallback((id: string, token: string, isStreaming: boolean) => {
    if (!isStreaming && token === '') {
      // Cancel — remove the streaming placeholder
      streamingContentRef.current.delete(id)
      setMessages(prev => prev.filter(m => m.id !== id))
      return
    }
    if (isStreaming) {
      setMessages(prev => {
        // Use existing message content as fallback for the first append call
        // (streamingContentRef is only populated after the first onUpdateMessage call)
        const existing = prev.find(m => m.id === id)
        const base = streamingContentRef.current.get(id) ?? (existing?.content || '')
        const next = base + token
        streamingContentRef.current.set(id, next)
        return prev.map(m => m.id === id ? { ...m, content: next, isStreaming: true } : m)
      })
    } else {
      // Finalise
      streamingContentRef.current.delete(id)
      setMessages(prev => {
        const newMessages = prev.map(m =>
          m.id === id ? { ...m, content: token, isStreaming: false } : m
        )
        saveChat(newMessages)
        return newMessages
      })
    }
  }, [saveChat])

  const handlePendingAction = useCallback((action: PendingAction) => {
    setPendingAction(action)
  }, [])

  const markPendingActionCard = useCallback((actionId: string, status: Message['pendingActionStatus']) => {
    setMessages(prev => {
      const newMessages = prev.map(m =>
        m.pendingAction?.id === actionId
          ? { ...m, pendingActionStatus: status }
          : m
      )
      saveChat(newMessages)
      return newMessages
    })
  }, [saveChat])

  const executeJiraTool = async (name: string, args: Record<string, unknown>): Promise<unknown> => {
    console.log('[ChatView] executeJiraTool:', name, args)
    try {
      // Use MCP for Jira operations
      switch (name) {
        case 'jira_search_issues': {
          const jql = args.jql as string
          const maxResults = (args.maxResults as number) || 20
          
          let fields: string[] | undefined
          if (args.fields) {
            if (Array.isArray(args.fields)) {
              fields = args.fields as string[]
            } else if (typeof args.fields === 'string') {
              fields = (args.fields as string).split(',').map(f => f.trim()).filter(f => f)
            }
          }
          
          if (!jql) return { success: false, error: 'JQL query is required.' }
          return await mcp.searchIssues(jql, maxResults, fields)
        }
        case 'jira_get_issue': {
          const issueKey = (args.issueIdOrKey || args.issueKey) as string
          if (!issueKey) return { success: false, error: 'Issue key is required.' }
          return await mcp.getIssue(issueKey)
        }
        case 'jira_get_projects':
          return await mcp.getProjects()
        case 'jira_get_issue_types': {
          const projectKey = (args.projectIdOrKey || args.projectKey) as string
          if (!projectKey) return { success: false, error: 'Project key is required.' }
          return await mcp.getProjectIssueTypes(projectKey)
        }
        case 'jira_get_transitions': {
          const issueKey = (args.issueIdOrKey || args.issueKey) as string
          if (!issueKey) return { success: false, error: 'Issue key is required.' }
          return await mcp.getTransitions(issueKey)
        }
        case 'jira_lookup_user': {
          const searchString = (args.searchString || args.query) as string
          if (!searchString) return { success: false, error: 'Search string is required.' }
          return await mcp.lookupUser(searchString)
        }
        case 'jira_create_issue': {
          const projectKey = (args.projectKey || args.project) as string
          const issueTypeName = (args.issueTypeName || args.issueType) as string
          const summary = args.summary as string
          const description = args.description as string | undefined
          if (!projectKey || !issueTypeName || !summary) return { success: false, error: 'Project key, issue type, and summary are required.' }
          const { projectKey: _pk, project: _p, issueTypeName: _itn, issueType: _it, summary: _s, description: _d, ...extra } = args
          return await mcp.createIssue(projectKey, issueTypeName, summary, description, Object.keys(extra).length > 0 ? extra : undefined)
        }
        case 'jira_update_issue': {
          const issueKey = (args.issueIdOrKey || args.issueKey) as string
          if (!issueKey) return { success: false, error: 'Issue key is required.' }
          return await mcp.editIssue(issueKey, args)
        }
        case 'jira_add_comment': {
          const issueKey = (args.issueIdOrKey || args.issueKey) as string
          const body = (args.body || args.comment || args.commentBody) as string
          if (!issueKey || !body) return { success: false, error: 'Issue key and body are required.' }
          return await mcp.addComment(issueKey, body)
        }
        case 'jira_transition_issue': {
          const issueKey = (args.issueIdOrKey || args.issueKey) as string
          const transitionId = args.transitionId as string
          if (!issueKey || !transitionId) return { success: false, error: 'Issue key and transition ID are required.' }
          return await mcp.transitionIssue(issueKey, transitionId)
        }
        case 'jira_upload_attachment': {
          const issueKey = (args.issueIdOrKey || args.issueKey) as string
          const filePath = args.filePath as string
          if (!issueKey || !filePath) return { success: false, error: 'Issue key and file path are required.' }
          return await jiraAttachment.upload(issueKey, filePath)
        }
        default:
          return { success: false, error: `Unknown Jira tool: ${name}` }
      }
    } catch (error) {
      throw error
    }
  }

  const executeFileTool = async (name: string, args: Record<string, unknown>): Promise<unknown> => {
    try {
      switch (name) {
        case 'file_list':   return await file.list(args.path as string)
        case 'file_read':   return await file.read(args.path as string)
        case 'file_write':  return await file.write(args.path as string, args.content as string)
        case 'file_mkdir':  return await file.mkdir(args.path as string)
        case 'file_search': return await file.search(args.pattern as string, args.directory as string | undefined)
        default:            return { success: false, error: `Unknown file tool: ${name}` }
      }
    } catch (error) {
      throw error
    }
  }

  const deleteMemoryByQuery = async (query: string): Promise<number> => {
    const result = await memoryAPI.getAll()
    if (!result.success || !result.data) throw new Error('Could not load memory')

    const mem = result.data as MemoryStore
    let deleted = 0
    const normalizedQuery = query.trim().toLowerCase()
    const matches = (value: string) => value.toLowerCase().includes(normalizedQuery)

    const userLines = (mem.userMarkdown || '').split('\n')
    const filteredUserLines = userLines.filter(line => !matches(line))
    deleted += userLines.length - filteredUserLines.length
    mem.userMarkdown = filteredUserLines.join('\n')

    const beforeGeneral = mem.general.entries.length
    mem.general.entries = mem.general.entries.filter(entry => !matches(entry.content))
    deleted += beforeGeneral - mem.general.entries.length

    const beforeLexicon = mem.lexicon.entries.length
    mem.lexicon.entries = mem.lexicon.entries.filter(entry => !matches(entry.content))
    deleted += beforeLexicon - mem.lexicon.entries.length

    const beforePhrases = mem.lexicon.commonPhrases.length
    mem.lexicon.commonPhrases = mem.lexicon.commonPhrases.filter(phrase => !matches(phrase))
    deleted += beforePhrases - mem.lexicon.commonPhrases.length

    const beforeVocabulary = mem.lexicon.vocabularyNotes.length
    mem.lexicon.vocabularyNotes = mem.lexicon.vocabularyNotes.filter(note => !matches(note))
    deleted += beforeVocabulary - mem.lexicon.vocabularyNotes.length

    await memoryAPI.save(mem)
    return deleted
  }

  const extractForgetQuery = (text: string): string | null => {
    const quoted = text.match(/["'“”]([^"'“”]+)["'“”]/)
    if (quoted?.[1]?.trim()) return quoted[1].trim()

    const explicit = text.match(/(?:forget|remove|erase|delete|cancel)\s+(?:all\s+)?(?:references?\s+(?:to|about)\s+)?(.+?)(?:\s+(?:from|in)\s+(?:the\s+)?memor(?:y|ies)|\s+memor(?:y|ies)|$)/i)
    const query = explicit?.[1]?.trim()
    if (!query) return null
    return query.replace(/^(?:the|all)\s+/i, '').trim()
  }

  const handleDirectMemoryCommand = async (text: string): Promise<boolean> => {
    const rememberMatch = text.match(/^(?:please\s+)?(?:remember|keep in mind|save (?:this|that) to memory)(?:\s+that)?[:\s]+([\s\S]+)$/i)
    const forgetLike = /\b(?:forget|remove|erase|delete|cancel)\b/i.test(text) && /\bmemor(?:y|ies|ized|ised)|\bremembered\b/i.test(text)

    if (!rememberMatch && !forgetLike) return false

    const timestamp = new Date().toISOString()
    const userMsg: Message = { id: uuidv4(), role: 'user', content: text, timestamp }
    let assistantContent = ''

    if (rememberMatch) {
      const content = rememberMatch[1].trim()
      if (!content) return false
      await memoryAPI.addGeneral(content, 'learned')
      assistantContent = `Saved to learned memory: ${content}`
    } else {
      const query = extractForgetQuery(text)
      if (!query) return false
      const deleted = await deleteMemoryByQuery(query)
      assistantContent = deleted > 0
        ? `Removed ${deleted} memory entr${deleted === 1 ? 'y' : 'ies'} matching "${query}".`
        : `I checked memory and did not find anything matching "${query}".`
    }

    const assistantMsg: Message = {
      id: uuidv4(),
      role: 'assistant',
      content: assistantContent,
      timestamp: new Date().toISOString(),
    }

    setMessages(prev => {
      const next = [...prev, userMsg, assistantMsg]
      saveChat(next)
      return next
    })
    agent?.loadHistory([...messages, userMsg, assistantMsg])
    return true
  }

  const executeMemoryTool = async (name: string, args: Record<string, unknown>): Promise<unknown> => {
    try {
      if (name === 'memory_read') {
        const result = await memoryAPI.getAll()
        if (!result.success || !result.data) return { success: false, error: 'Could not load memory' }
        const mem = result.data as MemoryStore
        const section = (args.section as string) || 'all'
        const parts: string[] = []
        if (section === 'all' || section === 'learned' || section === 'general') {
          parts.push('## User Memory')
          parts.push(mem.userMarkdown?.trim() || '(empty)')
          const entries = mem.general?.entries?.filter(entry => entry.source === 'learned') || []
          parts.push('\n## Learned Notes')
          parts.push(entries.length ? entries.map(e => `- ${e.content}`).join('\n') : '(empty)')
        }
        if (section === 'all' || section === 'style' || section === 'lexicon') {
          const entries = mem.lexicon?.entries?.filter(entry => entry.source === 'learned') || []
          const phrases = mem.lexicon?.commonPhrases || []
          parts.push('\n## Learned Style Notes')
          parts.push(entries.length ? entries.map(e => `- ${e.content}`).join('\n') : '(empty)')
          if (phrases.length) parts.push('\n### Common Phrases\n' + phrases.map(p => `- "${p}"`).join('\n'))
        }
        return { success: true, data: parts.join('\n').trim() || 'Memory is empty.' }
      }

      if (name === 'memory_update') {
        if (memoryUpdateCountRef.current >= 1) {
          return { success: true, data: 'Already saved this turn. Do not call memory_update again. Provide your final response now.' }
        }
        memoryUpdateCountRef.current++
        const section = args.section as 'learned' | 'style' | 'general' | 'lexicon'
        const content = args.content as string
        if (!content?.trim()) return { success: false, error: 'content is required' }
        if (section === 'style' || section === 'lexicon') {
          await memoryAPI.addLexicon(content, 'learned')
        } else {
          await memoryAPI.addGeneral(content, 'learned')
        }
        return { success: true, data: 'Saved to learned memory. Do not call memory_update again this turn. Give your final response now.' }
      }

      if (name === 'memory_delete') {
        const section = (args.section as 'learned' | 'style' | 'general' | 'lexicon' | 'all') || 'all'
        const query = String(args.query || '').trim().toLowerCase()
        if (!query) return { success: false, error: 'query is required' }

        const result = await memoryAPI.getAll()
        if (!result.success || !result.data) return { success: false, error: 'Could not load memory' }

        const mem = result.data as MemoryStore
        let deleted = 0
        const matches = (value: string) => value.toLowerCase().includes(query)
        const userLines = (mem.userMarkdown || '').split('\n')
        const filteredUserLines = userLines.filter(line => !matches(line))
        deleted += userLines.length - filteredUserLines.length
        mem.userMarkdown = filteredUserLines.join('\n')

        if (section === 'all' || section === 'learned' || section === 'general') {
          const before = mem.general.entries.length
          mem.general.entries = mem.general.entries.filter(entry => entry.source !== 'learned' || !matches(entry.content))
          deleted += before - mem.general.entries.length
        }

        if (section === 'all' || section === 'style' || section === 'lexicon') {
          const beforeEntries = mem.lexicon.entries.length
          mem.lexicon.entries = mem.lexicon.entries.filter(entry => entry.source !== 'learned' || !matches(entry.content))
          deleted += beforeEntries - mem.lexicon.entries.length

          const beforePhrases = mem.lexicon.commonPhrases.length
          mem.lexicon.commonPhrases = mem.lexicon.commonPhrases.filter(phrase => !matches(phrase))
          deleted += beforePhrases - mem.lexicon.commonPhrases.length

          const beforeVocabulary = mem.lexicon.vocabularyNotes.length
          mem.lexicon.vocabularyNotes = mem.lexicon.vocabularyNotes.filter(note => !matches(note))
          deleted += beforeVocabulary - mem.lexicon.vocabularyNotes.length
        }

        await memoryAPI.save(mem)
        return { success: true, data: `Deleted ${deleted} memory entr${deleted === 1 ? 'y' : 'ies'} matching "${args.query}".` }
      }

      return { success: false, error: `Unknown memory tool: ${name}` }
    } catch (error) {
      throw error
    }
  }

  const handleSend = async () => {
    if (!input.trim() || isLoading || !agent) return

    let userMessage = input.trim()
    
    // If files are attached, add info about them to the message
    if (attachedFiles.length > 0) {
      const fileInfo = attachedFiles.map(f => `- ${f.name} (${f.path})`).join('\n')
      userMessage = `${userMessage}\n\n[Attached files in workspace]\n${fileInfo}`
    }
    
    setInput('')
    setAttachedFiles([])
    memoryUpdateCountRef.current = 0
    setIsLoading(true)

    try {
      if (await handleDirectMemoryCommand(userMessage)) {
        if (pendingAction) {
          const actionId = pendingAction.id
          setPendingAction(null)
          markPendingActionCard(actionId, 'cancelled')
          agent.rejectAction(actionId, { silent: true })
        }
        return
      }

      if (pendingAction) {
        await handleReiterateAction(userMessage)
      } else {
        await agent.processMessage(userMessage)
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleApproveAction = async () => {
    if (!pendingAction || !agent) return
    const action = pendingAction
    setPendingAction(null)
    markPendingActionCard(action.id, 'approved')
    
    try {
      await agent.approveAction(action.id)
      
      // If this was a create issue action, add it to memory for style learning
      if (action.type === 'jira_create_issue') {
        try {
          const data = action.data as {
            projectKey?: string
            issueTypeName?: string
            issueType?: string
            summary?: string
            description?: string
          }
          
          const issueTypeName = data.issueTypeName || data.issueType || 'Task'
          
          // Add to memory (the memoryService will handle rotation of old examples)
          await memoryAPI.addIssueExample(issueTypeName, '', {
            issueKey: `NEW-${Date.now()}`, // Placeholder key, will be replaced on next sync
            summary: data.summary || '',
            description: data.description,
            createdAt: new Date().toISOString(),
          })
          
          console.log('[ChatView] Added new issue to memory for style learning')
        } catch (memError) {
          console.log('[ChatView] Failed to add to memory:', memError)
          // Non-critical - don't interrupt flow
        }
      }
    } catch (error) {
      console.error('Failed to execute action:', error)
    }
  }

  const handleRejectAction = () => {
    if (!pendingAction || !agent) return
    const actionId = pendingAction.id
    setPendingAction(null)
    markPendingActionCard(actionId, 'cancelled')
    agent.rejectAction(actionId, { silent: true })
  }

  const handleReiterateAction = async (text: string) => {
    if (!pendingAction || !agent) return
    const actionId = pendingAction.id
    // Cancel the pending action silently (no rejection message)
    agent.rejectAction(actionId, { silent: true })
    setPendingAction(null)
    markPendingActionCard(actionId, 'revision_requested')
    // Send the user's reiteration as a new message so the agent can adjust
    await agent.processMessage(text)
  }

  if (!isConfigured) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <div className="max-w-md">
          <h2 className="text-xl font-semibold text-gray-800 mb-2">
            AI Not Configured
          </h2>
          <p className="text-gray-600 mb-4">
            Please complete the onboarding or go to Settings to configure your AI provider.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="btn btn-primary"
          >
            Refresh
          </button>
        </div>
      </div>
    )
  }

  // Render connection status banner
  const renderConnectionStatus = () => {
    if (mcpConnectionState === 'connected') return null
    
    if (mcpConnectionState === 'connecting') {
      return (
        <div className="bg-mirai-50 border-b border-mirai-200 px-4 py-2">
          <div className="max-w-3xl mx-auto flex items-center gap-2 text-mirai-700 text-sm">
            <LoadingSpinner />
            <span>Connecting to Jira...</span>
          </div>
        </div>
      )
    }
    
    if (mcpConnectionState === 'error') {
      return (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2">
          <div className="max-w-3xl mx-auto flex items-center justify-between">
            <span className="text-red-700 text-sm">Connection to Jira failed</span>
            <button 
              onClick={() => mcp.connect()}
              className="text-sm text-red-600 hover:text-red-800 font-medium"
            >
              Retry
            </button>
          </div>
        </div>
      )
    }
    
    // disconnected state - only show if user has configured MCP before
    return null
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Connection Status Banner */}
      {renderConnectionStatus()}
      
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.length === 0 ? (
            <div className="text-center py-12">
              <h2 className="text-2xl font-semibold text-gray-800 mb-2">
                How can I help you today?
              </h2>
              <p className="text-gray-500 mb-8">
                Ask me about your Jira projects, sprint progress, or let me help you create tasks.
              </p>
              <div className="grid grid-cols-2 gap-3 max-w-lg mx-auto">
                {[
                  'Show me open issues',
                  'What\'s the sprint progress?',
                  'Generate a status report',
                  'List my projects',
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => setInput(suggestion)}
                    className="p-3 text-sm text-left bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-mirai-300 transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                onApproveAction={handleApproveAction}
                onRejectAction={handleRejectAction}
                activePendingActionId={pendingAction?.id || null}
              />
            ))
          )}

          {isLoading && (
            <div className="pl-11 flex items-center gap-2 text-gray-400 text-xs">
              <div className="loading-dots">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div 
        className={`border-t border-gray-200 bg-white px-4 py-4 transition-colors ${
          isDragging ? 'bg-mirai-50 border-mirai-300' : ''
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="max-w-3xl mx-auto">
          {/* Attached Files Preview */}
          {attachedFiles.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {attachedFiles.map((f, index) => (
                <div 
                  key={`${f.name}-${index}`}
                  className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-lg text-sm"
                >
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                  <span className="text-gray-700 truncate max-w-[150px]">{f.name}</span>
                  <span className="text-gray-400">({(f.size / 1024).toFixed(0)}KB)</span>
                  <button
                    onClick={() => removeAttachment(index)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Drag overlay */}
          {isDragging && (
            <div className="mb-3 p-4 border-2 border-dashed border-mirai-400 rounded-lg bg-mirai-50 text-center">
              <p className="text-mirai-600 font-medium">Drop files here to attach</p>
              <p className="text-sm text-mirai-500">Max 10MB per file</p>
            </div>
          )}

          <div className="relative">
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            
            {/* Attach button */}
            <button
              onClick={openFilePicker}
              disabled={isLoading || mcpConnectionState === 'connecting'}
              className="absolute left-3 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-gray-600 disabled:text-gray-300 transition-colors"
              title="Attach files"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            </button>
            
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={mcpConnectionState === 'connecting' ? 'Connecting to Jira...' : 'Ask me anything...'}
              rows={1}
              className="chat-input pl-12" 
              disabled={isLoading || mcpConnectionState === 'connecting'}
            />
            {isLoading ? (
              <button
                onClick={() => agent?.abort()}
                title="Stop"
                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-red-500 hover:text-red-600 transition-colors"
              >
                <StopIcon />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim() || mcpConnectionState === 'connecting'}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-mirai-600 hover:text-mirai-700 disabled:text-gray-300 transition-colors"
              >
                <SendIcon />
              </button>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-2 text-center">
            {mcpConnectionState === 'connecting' 
              ? 'Please wait while connecting to Jira...' 
              : 'Press Enter to send, Shift+Enter for new line. Drop files or click 📎 to attach.'}
          </p>
          {managedProjects.length > 0 && (
            <details className="mt-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
              <summary className="cursor-pointer select-none font-medium text-gray-700">
                Scope this message with / "project name" or a project key. Managed projects ({managedProjects.length})
              </summary>
              <div className="mt-2 flex flex-wrap gap-2">
                {managedProjects.map(project => (
                  <button
                    key={project.id || project.key}
                    type="button"
                    onClick={() => {
                      const prefix = `/ "${project.name}" `
                      setInput(current => current.startsWith(prefix) ? current : `${prefix}${current}`)
                      textareaRef.current?.focus()
                    }}
                    className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-gray-700 hover:border-mirai-300 hover:text-mirai-700"
                    title={`Use ${project.name} for this message`}
                  >
                    {project.avatarUrl && <img src={project.avatarUrl} alt="" className="h-4 w-4 rounded" />}
                    <span>{project.name}</span>
                    <span className="text-gray-400">{project.key}</span>
                  </button>
                ))}
              </div>
            </details>
          )}
        </div>
      </div>
    </div>
  )
}
