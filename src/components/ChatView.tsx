import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useElectron } from '../hooks/useElectron'
import { Agent, Message, PendingAction, UserProfile } from '../agent'
import { MemoryStore } from '../types/memory'
import { validateLearnedNoteContent } from '../memory/admission'
import { formatSourceMemoryListing, formatSourceMemoryRead } from '../memory/promptSections'
import { SourceMemoryReadResult, SourceMemoryScopeListing } from '../memory/sourceTypes'
import { buildReportPath, buildReportToolResult, getActiveReportFromMessages } from '../agent/artifacts'
import { loadEnabledConnectors, ConnectorScope } from '../connectors/registry'
import type { ProjectContext } from '../context/types'
import ChatMessage from './ChatMessage'
import { Button } from './ui/Button'
import { ChatBanner, ChatEmptyState, ChatActivityIndicator, WriteActionConfirmModule, ActiveReportPill } from './chat'

interface ChatViewProps {
  chatId: string | null
  onChatCreated: (chatId: string) => void
  onOpenSettings: () => void
}

type McpConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error'

/**
 * Parse a leading `/<name>` context command. The name immediately follows the
 * slash (a leading `/ ` with a space is left untouched, e.g. Jira per-message
 * scopes). Returns the resolved context (matched by name, case-insensitive) and
 * the message with the command stripped. `clear` is true for `/none`.
 */
function parseContextCommand(
  raw: string,
  contexts: ProjectContext[],
): { context: ProjectContext | null; clear: boolean; message: string; unmatched?: string } {
  const match = /^\/(?:"([^"]+)"|([^\s/][^\s]*))(?:\s+|$)/.exec(raw)
  if (!match) return { context: null, clear: false, message: raw }

  const name = (match[1] || match[2] || '').trim()
  const message = raw.slice(match[0].length)

  if (/^(none|nessuno|clear|off)$/i.test(name)) {
    return { context: null, clear: true, message }
  }

  const found = contexts.find(ctx => ctx.name.toLowerCase() === name.toLowerCase())
  if (!found) return { context: null, clear: false, message: raw, unmatched: name }

  return { context: found, clear: false, message }
}

/** When the input is a bare `/partial` (no space yet), the context picker opens. */
function matchContextTrigger(raw: string): string | null {
  const m = /^\/([^\s/]*)$/.exec(raw)
  return m ? m[1] : null
}

/** Returns a specific, human-readable label for a tool call based on its arguments */

const PaperclipIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
    />
  </svg>
)

const SendIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14m-7-7l7 7-7 7" />
  </svg>
)

const StopIcon = () => (
  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
    <rect x="3" y="3" width="10" height="10" rx="1.5" />
  </svg>
)

export default function ChatView({ chatId, onChatCreated, onOpenSettings }: ChatViewProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [agentStatus, setAgentStatus] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [agent, setAgent] = useState<Agent | null>(null)
  const [isConfigured, setIsConfigured] = useState(false)
  const [mcpConnectionState, setMcpConnectionState] = useState<McpConnectionState>('disconnected')
  const [attachedFiles, setAttachedFiles] = useState<Array<{ name: string; path: string; size: number }>>([])
  const [managedProjects, setManagedProjects] = useState<ConnectorScope[]>([])
  const [availableContexts, setAvailableContexts] = useState<ProjectContext[]>([])
  const [activeContext, setActiveContext] = useState<ProjectContext | null>(null)
  const [contextMenuIndex, setContextMenuIndex] = useState(0)
  const [contextMenuDismissed, setContextMenuDismissed] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [dismissedReportMessageId, setDismissedReportMessageId] = useState<string | null>(null)
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
  const electron = useElectron()
  const { storage, mcp, file, ai, memory: memoryAPI, contexts: contextsAPI } = electron

  const activeReport = useMemo(() => getActiveReportFromMessages(messages), [messages])
  const showActiveReport = activeReport && activeReport.messageId !== dismissedReportMessageId

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
        
        // Save to .smile/attachments folder
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
    setDismissedReportMessageId(null)
  }, [chatId, agent])

  // Auto-scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const CHAT_INPUT_MAX_HEIGHT_PX = 150

  // Auto-resize textarea; scrollbar only when content exceeds visible height
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return

    el.style.height = 'auto'
    const scrollHeight = el.scrollHeight
    const nextHeight = Math.min(scrollHeight, CHAT_INPUT_MAX_HEIGHT_PX)
    el.style.height = `${nextHeight}px`
    el.style.overflowY = scrollHeight > nextHeight ? 'auto' : 'hidden'
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
      
      const connectors = await loadEnabledConnectors(electron)
      setManagedProjects(connectors.scopes)

      try {
        const ctxResult = await contextsAPI.list()
        if (ctxResult.success && ctxResult.data) setAvailableContexts(ctxResult.data)
      } catch { /* contexts are optional */ }

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
        connectors: connectors.runtimes,
        monitoredScopes: connectors.scopes,
        memory,
        loadMemory: loadMemoryForAgent,
        appendSourceMemory: async (leaf) => {
          await memoryAPI.appendSourceLeaf(leaf)
        },
        maxIterations,
        onMessage: handleNewMessage,
        onUpdateMessage: handleUpdateMessage,
        onPendingAction: handlePendingAction,
        onAgentStatus: setAgentStatus,
        executeFileTool,
        executeMemoryTool,
        callAI: async (messages, tools) => ai.chat(messages, tools),
        callAIStream: async (messages, tools, onToken, onProgress) => ai.chatStream(messages, tools, onToken, onProgress),
        ...(reasoningConfigured && {
          callAIReasoning: async (messages, tools) => ai.chatReasoning(messages, tools),
          callAIReasoningStream: async (messages, tools, onToken, onProgress) => ai.chatReasoningStream(messages, tools, onToken, onProgress),
        }),
      })

      setAgent(newAgent)
      if (activeContext) newAgent.setActiveContext(activeContext)
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

  const executeFileTool = async (name: string, args: Record<string, unknown>): Promise<unknown> => {
    try {
      switch (name) {
        case 'file_list':   return await file.list(args.path as string)
        case 'file_read':   return await file.read(args.path as string)
        case 'file_read_ocr': return await file.readOcr(args.path as string)
        case 'file_write':  return await file.write(args.path as string, args.content as string)
        case 'report_write': {
          const title = String(args.title || 'Report')
          const content = String(args.content || '')
          const path = buildReportPath(title, args.path as string | undefined)
          const writeResult = await file.write(path, content)
          if (!writeResult.success) return writeResult
          return {
            success: true,
            path,
            title,
            data: buildReportToolResult(path, title),
          }
        }
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
          if (mem.learnedRollup?.trim()) {
            parts.push('\n### Archived Rollup')
            parts.push(mem.learnedRollup.trim())
          }
          parts.push('\n### Full entries')
          parts.push(entries.length ? entries.map(e => `- ${e.content}`).join('\n') : '(empty)')
        }
        if (section === 'all' || section === 'style' || section === 'lexicon') {
          const entries = mem.lexicon?.entries?.filter(entry => entry.source === 'learned') || []
          const phrases = mem.lexicon?.commonPhrases || []
          parts.push('\n## Learned Style Notes')
          parts.push(entries.length ? entries.map(e => `- ${e.content}`).join('\n') : '(empty)')
          if (phrases.length) parts.push('\n### Common Phrases\n' + phrases.map(p => `- "${p}"`).join('\n'))
        }
        if (section === 'source') {
          const connectorId = String(args.connectorId || '').trim()
          const scopeId = String(args.scopeId || '').trim()
          if (connectorId && scopeId) {
            const sourceResult = await memoryAPI.readSource(connectorId, scopeId)
            if (!sourceResult.success) {
              return { success: false, error: sourceResult.error || 'Could not read source memory' }
            }
            if (!sourceResult.data) {
              return { success: true, data: `(no source memory for ${connectorId}/${scopeId} yet)` }
            }
            return {
              success: true,
              data: formatSourceMemoryRead(sourceResult.data as SourceMemoryReadResult),
            }
          }
          const listResult = await memoryAPI.listSources()
          if (!listResult.success) {
            return { success: false, error: listResult.error || 'Could not list source memory' }
          }
          return {
            success: true,
            data: formatSourceMemoryListing((listResult.data || []) as SourceMemoryScopeListing[]),
          }
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

        const admission = validateLearnedNoteContent(content)
        if (!admission.ok) {
          return { success: false, error: admission.reason || 'Invalid learned note content' }
        }

        if (section === 'style' || section === 'lexicon') {
          const result = await memoryAPI.addLexicon(content, 'learned')
          if (!result.success) return { success: false, error: result.error || 'Could not save learned note' }
        } else {
          const result = await memoryAPI.addGeneral(content, 'learned')
          if (!result.success) return { success: false, error: result.error || 'Could not save learned note' }
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

  const refreshAgentProfile = async () => {
    if (!agent) return
    const userProfile = await storage.get('userProfile') as UserProfile | null
    agent.updateUserProfile(userProfile)
  }

  const contextTriggerQuery = matchContextTrigger(input)
  const contextMenuOptions = useMemo(() => {
    if (contextTriggerQuery === null) return []
    const q = contextTriggerQuery.toLowerCase()
    const matches = availableContexts.filter(ctx => ctx.name.toLowerCase().includes(q))
    const options: Array<{ kind: 'context'; context: ProjectContext } | { kind: 'clear' }> = matches.map(
      context => ({ kind: 'context', context }),
    )
    // Offer a "clear" entry when a context is active and not filtered out.
    if (activeContext && ('none'.includes(q) || 'clear'.includes(q) || q === '')) {
      options.push({ kind: 'clear' })
    }
    return options
  }, [contextTriggerQuery, availableContexts, activeContext])
  const contextMenuOpen = !contextMenuDismissed && contextTriggerQuery !== null && contextMenuOptions.length > 0

  const applyContext = (next: ProjectContext | null) => {
    setActiveContext(next)
    agent?.setActiveContext(next)
    setInput('')
    setContextMenuIndex(0)
    setContextMenuDismissed(false)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  const selectContextOption = (option: { kind: 'context'; context: ProjectContext } | { kind: 'clear' }) => {
    applyContext(option.kind === 'clear' ? null : option.context)
  }

  const refreshContexts = useCallback(async () => {
    try {
      const result = await contextsAPI.list()
      if (result.success && result.data) setAvailableContexts(result.data)
    } catch { /* contexts are optional */ }
  }, [contextsAPI])

  const handleSend = async () => {
    if (!input.trim() || isLoading || !agent) return

    let userMessage = input.trim()

    // Resolve a leading /progetto command (sticky context for the conversation).
    let parsed = parseContextCommand(userMessage, availableContexts)
    // The contexts list is loaded at chat init; a context created afterwards
    // won't be there yet. On a miss, refresh once and re-parse before warning.
    if (parsed.unmatched) {
      try {
        const refreshed = await contextsAPI.list()
        if (refreshed.success && refreshed.data) {
          setAvailableContexts(refreshed.data)
          parsed = parseContextCommand(userMessage, refreshed.data)
        }
      } catch { /* keep original parse */ }
    }
    if (parsed.unmatched) {
      setInput('')
      const warning: Message = {
        id: uuidv4(),
        role: 'assistant',
        content: `No context named "${parsed.unmatched}". Define it in the Context section, or check the name.`,
        timestamp: new Date().toISOString(),
      }
      setMessages(prev => [...prev, warning])
      return
    }
    if (parsed.clear) {
      setActiveContext(null)
      agent.setActiveContext(null)
    } else if (parsed.context) {
      setActiveContext(parsed.context)
      agent.setActiveContext(parsed.context)
    }
    userMessage = parsed.message.trim()
    if (!userMessage) {
      // Command-only message (e.g. just "/progetto X"): switch context, no agent run.
      setInput('')
      return
    }

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
          agent.rejectAction(actionId, { silent: true })
        }
        return
      }

      if (pendingAction) {
        await handleReiterateAction(userMessage)
      } else {
        await refreshAgentProfile()
        await agent.processMessage(userMessage)
      }
    } finally {
      setIsLoading(false)
      setAgentStatus(null)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (contextMenuOpen) {
      const len = contextMenuOptions.length
      const current = Math.min(contextMenuIndex, len - 1)
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setContextMenuIndex((current + 1) % len)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setContextMenuIndex((current - 1 + len) % len)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        selectContextOption(contextMenuOptions[current])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setContextMenuDismissed(true)
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleApproveAction = async () => {
    if (!pendingAction || !agent) return
    const action = pendingAction
    setPendingAction(null)
    setIsLoading(true)

    try {
      await agent.approveAction(action.id)
    } catch (error) {
      console.error('Failed to execute action:', error)
    } finally {
      setIsLoading(false)
      setAgentStatus(null)
    }
  }

  const handleRejectAction = () => {
    if (!pendingAction || !agent) return
    const actionId = pendingAction.id
    setPendingAction(null)
    agent.rejectAction(actionId)
  }

  const handleReiterateAction = async (text: string) => {
    if (!pendingAction || !agent) return
    const actionId = pendingAction.id
    agent.rejectAction(actionId, { silent: true })
    setPendingAction(null)
    await refreshAgentProfile()
    await agent.processMessage(text)
  }

  if (!isConfigured) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center page-shell text-center">
        <div className="max-w-md">
          <h2 className="text-xl font-semibold text-gray-800 mb-2">
            AI Not Configured
          </h2>
          <p className="text-gray-600 mb-4">
            Go to Settings to configure the framework AI provider before starting a chat.
          </p>
          <Button onClick={onOpenSettings}>
            Open Settings
          </Button>
        </div>
      </div>
    )
  }

  const renderConnectionStatus = () => {
    if (mcpConnectionState === 'connected') return null

    if (mcpConnectionState === 'connecting') {
      return (
        <ChatBanner
          variant="info"
          message="Connecting to connector..."
        />
      )
    }

    if (mcpConnectionState === 'error') {
      return (
        <ChatBanner
          variant="error"
          message="Connector connection failed"
          actionLabel="Retry"
          onAction={() => mcp.connect()}
        />
      )
    }

    return null
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Connection Status Banner */}
      {renderConnectionStatus()}
      
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto page-shell">
        <div className="content-shell space-y-4">
          {messages.length === 0 ? (
            <ChatEmptyState onSuggestionClick={setInput} />
          ) : (
            messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))
          )}

          {isLoading && (
            <ChatActivityIndicator status={agentStatus} />
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div 
        className={`border-t border-gray-200 bg-white px-[var(--page-padding-x)] py-4 transition-colors ${
          isDragging ? 'bg-neutral-50 border-neutral-300' : ''
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="content-shell">
          {pendingAction && (
            <WriteActionConfirmModule
              action={pendingAction}
              onApprove={handleApproveAction}
              onReject={handleRejectAction}
              className="mb-3"
            />
          )}

          {showActiveReport && (
            <ActiveReportPill
              artifact={activeReport.artifact}
              messageId={activeReport.messageId}
              onDismiss={() => setDismissedReportMessageId(activeReport.messageId)}
              className="mb-3"
            />
          )}

          {/* Active context indicator */}
          {activeContext && (
            <div className="mb-3 flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-900 bg-neutral-900 px-2.5 py-1 text-xs text-white">
                <span className="font-semibold uppercase tracking-wide text-[10px] text-neutral-300">Context</span>
                <span className="h-1.5 w-1.5 rounded-full bg-white" />
                <span className="font-medium">{activeContext.name}</span>
                {activeContext.folder && <span className="text-neutral-400">/{activeContext.folder}</span>}
                <button
                  type="button"
                  onClick={() => {
                    setActiveContext(null)
                    agent?.setActiveContext(null)
                  }}
                  className="ml-1 text-neutral-400 hover:text-white"
                  title="Clear active context"
                  aria-label="Clear active context"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            </div>
          )}

          {/* Attached Files Preview */}
          {attachedFiles.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {attachedFiles.map((f, index) => (
                <div 
                  key={`${f.name}-${index}`}
                  className="ui-chat-attachment"
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
            <div className="ui-chat-dropzone">
              <p className="text-neutral-700 font-medium">Drop files here to attach</p>
              <p className="text-sm text-neutral-500">Max 10MB per file</p>
            </div>
          )}

          {contextMenuOpen && (
            <div className="mb-2 overflow-hidden rounded-lg border border-neutral-300 bg-white shadow-sm">
              <p className="border-b border-neutral-100 px-3 py-1.5 text-xs text-neutral-400">
                Select a context
              </p>
              {contextMenuOptions.map((option, index) => {
                const isActive = index === Math.min(contextMenuIndex, contextMenuOptions.length - 1)
                const key = option.kind === 'clear' ? '__clear__' : option.context.id
                return (
                  <button
                    key={key}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); selectContextOption(option) }}
                    onMouseEnter={() => setContextMenuIndex(index)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                      isActive ? 'bg-neutral-100 text-neutral-950' : 'text-neutral-700 hover:bg-neutral-50'
                    }`}
                  >
                    {option.kind === 'clear' ? (
                      <span className="text-neutral-500">Clear active context</span>
                    ) : (
                      <>
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-900" />
                        <span className="font-medium">{option.context.name}</span>
                        {option.context.folder && (
                          <span className="truncate text-xs text-neutral-400">{option.context.folder}</span>
                        )}
                      </>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          <div className="ui-chat-input-shell">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />

            <button
              type="button"
              onClick={openFilePicker}
              disabled={isLoading || mcpConnectionState === 'connecting'}
              className="ui-chat-input-action text-gray-400 hover:text-gray-600 disabled:text-gray-300"
              title="Attach files"
              aria-label="Attach files"
            >
              <PaperclipIcon />
            </button>

            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value)
                setContextMenuIndex(0)
                setContextMenuDismissed(false)
              }}
              onFocus={() => { void refreshContexts() }}
              onKeyDown={handleKeyDown}
              placeholder={
                mcpConnectionState === 'connecting'
                  ? 'Connecting to connector...'
                  : showActiveReport
                    ? 'Ask about this report, or dismiss it to chat about something else…'
                    : 'Ask me anything...'
              }
              rows={1}
              className="ui-chat-input"
              disabled={isLoading || mcpConnectionState === 'connecting'}
            />

            {isLoading ? (
              <button
                type="button"
                onClick={() => agent?.abort()}
                title="Stop"
                aria-label="Stop"
                className="ui-chat-input-action text-red-500 hover:text-red-600"
              >
                <StopIcon />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSend}
                disabled={!input.trim() || mcpConnectionState === 'connecting'}
                className="ui-chat-input-action text-neutral-700 hover:text-neutral-950 disabled:text-gray-300"
                title="Send message"
                aria-label="Send message"
              >
                <SendIcon />
              </button>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-2 text-center">
            {mcpConnectionState === 'connecting' ? (
              'Please wait while connecting to connector...'
            ) : (
              <span className="inline-flex items-center justify-center gap-1 flex-wrap">
                <span>Press Enter to send, Shift+Enter for new line. Drop files or click</span>
                <PaperclipIcon className="w-3.5 h-3.5 shrink-0" />
                <span>to attach.</span>
              </span>
            )}
          </p>
          {managedProjects.length > 0 && mcpConnectionState !== 'connected' && (
            <details className="mt-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
              <summary className="cursor-pointer select-none font-medium text-gray-700">
                Scope this message with / "scope name" or a connector key. Connected scopes ({managedProjects.length})
              </summary>
              <div className="mt-2 flex flex-wrap gap-2">
                {managedProjects.map(project => (
                  <button
                    key={project.scopeId || project.key}
                    type="button"
                    onClick={() => {
                      const prefix = `/ "${project.name}" `
                      setInput(current => current.startsWith(prefix) ? current : `${prefix}${current}`)
                      textareaRef.current?.focus()
                    }}
                    className="ui-chat-scope-chip text-xs"
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
