import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { flushSync } from 'react-dom'
import { v4 as uuidv4 } from 'uuid'
import { useElectron } from '../hooks/useElectron'
import { Agent, Message, PendingAction, UserProfile, type AgentContextSnapshot, type ToolEntry } from '../agent'
import { normalizeUserProfile } from '../agent/communicationPreferences'
import { MemoryStore } from '../types/memory'
import { validateLearnedNoteContent } from '../memory/admission'

import { buildReportPath, buildReportToolResult, getActiveReportFromMessages, titleFromReportPath, type MarkdownArtifact } from '../agent/artifacts'
import {
  getContextFilesPath,
  getContextFolderPath,
  type ProjectContext,
} from '../context/types'
import { loadEnabledConnectors, ConnectorScope } from '../connectors/registry'
import type { ContextPromptBody } from '../context/promptInjection'
import ChatMessage from './ChatMessage'
import { Button } from './ui/Button'
import { ChatBanner, ChatEmptyState, ChatActivityIndicator, WriteActionConfirmModule, ActiveReportPill } from './chat'
import { useChatActivity } from '../chat/ChatActivityContext'
import { CHAT_HISTORY_CHANGED, notifyChatHistoryChanged } from '../shell/chatHistoryEvents'

interface ChatViewProps {
  chatId: string | null
  isVisible: boolean
  onChatCreated: (chatId: string, title: string) => void
  onOpenSettings: () => void
  activeContext: ProjectContext | null
  pinnedReportPath?: string | null
  onContextSnapshot?: (snapshot: AgentContextSnapshot) => void
}

type McpConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error'

const MAX_QUEUED_MESSAGES = 3

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

const ThinkingIcon = ({ active = false }: { active?: boolean }) => (
  <svg className="w-5 h-5" fill={active ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
    />
  </svg>
)

export default function ChatView({
  chatId,
  isVisible,
  onChatCreated,
  onOpenSettings,
  activeContext,
  pinnedReportPath,
  onContextSnapshot,
}: ChatViewProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [agent, setAgent] = useState<Agent | null>(null)
  const [isConfigured, setIsConfigured] = useState(false)
  const [mcpConnectionState, setMcpConnectionState] = useState<McpConnectionState>('disconnected')
  const [attachedFiles, setAttachedFiles] = useState<Array<{ name: string; path: string; size: number }>>([])
  const [managedProjects, setManagedProjects] = useState<ConnectorScope[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [dismissedReportMessageId, setDismissedReportMessageId] = useState<string | null>(null)
  const [useThinking, setUseThinking] = useState(false)
  const [reasoningConfigured, setReasoningConfigured] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Streaming content accumulator (keyed by message id)
  const streamingContentRef = useRef<Map<string, string>>(new Map())
  // Hard cap: allow at most 3 memory writes per user turn (reset on each send)
  const memoryUpdateCountRef = useRef(0)

  // Stable chat ID for the current session. When chatId prop is null (new chat),
  // we generate one on first save and reuse it for all subsequent saves.
  const sessionChatIdRef = useRef<string | null>(null)

  // In-memory cache of the full chatHistory array.
  // Loaded once on mount. All saveChat calls read/write this ref synchronously
  // so concurrent saves never race against each other via storage reads.
  const chatHistoryRef = useRef<Array<{ id: string; title: string; date: string; messages: Message[] }>>([])
  const historyLoadedRef = useRef(false)
  const isLoadingHistoryRef = useRef(false)
  const runningChatIdRef = useRef<string | null>(null)
  const activeChatIdRef = useRef<string | null>(null)
  const pendingByChatRef = useRef<Map<string, PendingAction>>(new Map())
  const lastBackgroundSyncRef = useRef<string | null>(null)
  const messagesRef = useRef<Message[]>([])
  const chatIdRef = useRef(chatId)
  const isVisibleRef = useRef(isVisible)
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const streamRafRef = useRef<number | null>(null)
  const streamPendingRef = useRef<{ targetId: string; id: string; token: string; epoch: number } | null>(null)
  const sendInFlightRef = useRef(false)
  /** Bumped when a stream is finalised - stale rAF callbacks must not re-open isStreaming. */
  const streamEpochRef = useRef<Map<string, number>>(new Map())
  /** Messages typed while the agent is running, queued per chat. */
  const queuedByChatRef = useRef<Map<string, string[]>>(new Map())
  const [queuedVersion, setQueuedVersion] = useState(0)
  isVisibleRef.current = isVisible
  chatIdRef.current = chatId
  messagesRef.current = messages

  const agentCallbacksRef = useRef<{
    onMessage: (message: Message) => void
    onUpdateMessage: (id: string, token: string, isStreaming: boolean) => void
    onPendingAction: (action: PendingAction) => void
  }>({
    onMessage: () => {},
    onUpdateMessage: () => {},
    onPendingAction: () => {},
  })

  const chatActivity = useChatActivity()
  const visibleChatId = chatId ?? sessionChatIdRef.current
  const visibleActivity = visibleChatId ? chatActivity.getActivity(visibleChatId) : null
  const isLoading = visibleActivity?.kind === 'running'
  /** Tracks the previous running chat id so we can auto-send queued messages when any run finishes. */
  const prevRunningChatIdRef = useRef<string | null>(chatActivity.runningChatId)
  const agentStatus = visibleActivity?.agentStatus ?? null
  const queuedMessages = visibleChatId ? queuedByChatRef.current.get(visibleChatId) ?? [] : []
  const queuedCount = queuedMessages.length
  // queuedVersion is only used to force a re-render when the queue mutates.
  void queuedVersion
  const otherChatRunning = Boolean(
    chatActivity.runningChatId && chatActivity.runningChatId !== visibleChatId,
  )

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const electron = useElectron()
  const { storage, mcp, file, chat: chatAPI, ai, memory: memoryAPI, contexts: contextsAPI } = electron

  const transcriptReport = useMemo(() => getActiveReportFromMessages(messages), [messages])
  const pinnedReport = useMemo(() => {
    if (!pinnedReportPath) return null
    return {
      artifact: { path: pinnedReportPath, title: titleFromReportPath(pinnedReportPath) },
      messageId: `pinned:${pinnedReportPath}`,
    }
  }, [pinnedReportPath])
  const activeReport = transcriptReport ?? pinnedReport
  const showActiveReport = activeReport && activeReport.messageId !== dismissedReportMessageId

  useEffect(() => {
    agent?.setActiveContext(activeContext)
  }, [agent, activeContext])

  // If the user starts typing while a write action is awaiting approval, they
  // are implicitly choosing to respond instead. Dismiss the approval bar silently
  // so it doesn't block the composer.
  useEffect(() => {
    if (!pendingAction || !agent) return
    if (input.trim().length === 0) return
    const actionId = pendingAction.id
    const targetId = runningChatIdRef.current ?? activeChatIdRef.current ?? chatIdRef.current
    agent.rejectAction(actionId, { silent: true })
    setPendingAction(null)
    if (targetId) pendingByChatRef.current.delete(targetId)
  }, [input, pendingAction, agent])

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

  // Initialize agent and pre-load chat history from SQLite
  useEffect(() => {
    initializeAgent()
    loadChatHistoryFromSqlite()
  }, [])

  const loadChatHistoryFromSqlite = async (options?: { silent?: boolean }) => {
    if (isLoadingHistoryRef.current) return
    isLoadingHistoryRef.current = true
    try {
      const recent = await chatAPI.loadRecent(100)
      if (recent.success && recent.data) {
        const loaded: typeof chatHistoryRef.current = []
        for (const summary of recent.data) {
          const msgResult = await chatAPI.loadMessages(summary.id)
          const messages = normalizeLoadedMessages((msgResult.success ? msgResult.data : []) as Message[])
          const firstUserMsg = messages.find(m => m.role === 'user')
          const title = (summary.title && summary.title !== summary.id)
            ? summary.title
            : (firstUserMsg?.content.substring(0, 50) || 'New Chat')
          loaded.push({
            id: summary.id,
            title,
            date: summary.date,
            messages,
          })
        }
        chatHistoryRef.current = loaded
        const summaries = loaded.map(c => ({ id: c.id, title: c.title, date: c.date }))
        await storage.set('chatHistory', summaries)
        if (!options?.silent) notifyChatHistoryChanged()
      } else {
        chatHistoryRef.current = []
        await storage.set('chatHistory', [])
        if (!options?.silent) notifyChatHistoryChanged()
      }
    } catch (error) {
      console.error('Failed to load chat history from SQLite:', error)
      chatHistoryRef.current = []
    } finally {
      isLoadingHistoryRef.current = false
      historyLoadedRef.current = true
    }
  }

  // Reload the in-memory chat cache when another part of the app mutates history
  // (e.g. Settings trims or clears conversations).
  useEffect(() => {
    const handleHistoryChanged = () => {
      // Cancel any pending persist so a stale cache can't overwrite the freshly
      // trimmed SQLite data.
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current)
        persistTimerRef.current = null
      }
      // Reload silently so we don't re-dispatch the same event and loop.
      void loadChatHistoryFromSqlite({ silent: true })
    }
    window.addEventListener(CHAT_HISTORY_CHANGED, handleHistoryChanged)
    return () => window.removeEventListener(CHAT_HISTORY_CHANGED, handleHistoryChanged)
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
    activeChatIdRef.current = chatId
    sessionChatIdRef.current = chatId

    if (chatId && isVisible) {
      chatActivity.clearUnread(chatId)
    }

    const runningElsewhere = chatActivity.runningChatId && chatActivity.runningChatId !== chatId

    if (runningElsewhere) {
      if (chatId) {
        void loadMessagesOnly(chatId)
      } else {
        setMessages([])
      }
      setPendingAction(pendingByChatRef.current.get(chatId ?? '') ?? null)
      setDismissedReportMessageId(null)
      return
    }

    if (chatId) {
      const isActiveRun = runningChatIdRef.current === chatId
        || chatActivity.runningChatId === chatId
      if (isActiveRun) {
        // Don't clobber live streaming UI when chatId is assigned mid-run (new chat).
        if (messagesRef.current.length === 0) {
          const cached = chatHistoryRef.current.find(c => c.id === chatId)
          if (cached) setMessages(cached.messages)
        }
      } else {
        if (!applyCachedChat(chatId, true)) {
          void loadChat(chatId)
        }
      }
    } else {
      setMessages([])
      agent?.clearHistory()
    }
    setPendingAction(pendingByChatRef.current.get(chatId ?? '') ?? null)
    setDismissedReportMessageId(null)
  }, [chatId, agent, chatActivity.runningChatId, isVisible])

  // When returning to a chat that is still running in the background, hydrate once if empty.
  useEffect(() => {
    if (!isVisible || !visibleChatId) return
    if (chatActivity.runningChatId !== visibleChatId) {
      lastBackgroundSyncRef.current = null
      return
    }
    const syncKey = `${visibleChatId}:running`
    if (lastBackgroundSyncRef.current === syncKey) return
    lastBackgroundSyncRef.current = syncKey
    if (messagesRef.current.length > 0) return
    const cached = chatHistoryRef.current.find(c => c.id === visibleChatId)
    if (cached) setMessages(cached.messages)
  }, [isVisible, visibleChatId, chatActivity.runningChatId])

  // Auto-scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Focus composer for a new chat once the input is mounted and enabled
  useEffect(() => {
    if (!isVisible || !isConfigured || chatId) return
    if (mcpConnectionState === 'connecting') return

    const frame = requestAnimationFrame(() => {
      textareaRef.current?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [chatId, isVisible, isConfigured, mcpConnectionState])

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
      
      const userProfile = normalizeUserProfile(await storage.get('userProfile') as Partial<UserProfile> | null)
      
      const connectors = await loadEnabledConnectors(electron)
      setManagedProjects(connectors.scopes)

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
        if (reasoningConfigStr) {
          const reasoningCfg = JSON.parse(reasoningConfigStr)
          await ai.configureReasoning(reasoningCfg)
          reasoningConfigured = true
        }
      } catch { /* reasoning model is optional */ }
      setReasoningConfigured(reasoningConfigured)

      // Load optional review model config (cheap model for memory/context review)
      let reviewConfigured = false
      let reviewModelConfig: { provider: string; apiKey: string; model?: string } | null = null
      try {
        const reviewConfigStr = await storage.getSecure('memoryReviewModel')
        if (reviewConfigStr) {
          const reviewCfg = JSON.parse(reviewConfigStr)
          await ai.configureReview(reviewCfg)
          reviewModelConfig = reviewCfg as { provider: string; apiKey: string; model?: string }
          reviewConfigured = true
        }
      } catch { /* review model is optional */ }

      // Load agent loop settings
      let agentLightThinking = false
      let agentParallelReads = true
      let agentAutoMemoryReview = false
      let agentContextWindow = 128_000
      try {
        const light = await storage.get('agentLightThinking') as boolean | null
        if (light !== null && light !== undefined) agentLightThinking = light
      } catch { /* use default */ }
      try {
        const parallel = await storage.get('agentParallelReads') as boolean | null
        if (parallel !== null && parallel !== undefined) agentParallelReads = parallel
      } catch { /* use default */ }
      try {
        const autoReview = await storage.get('agentAutoMemoryReview') as boolean | null
        if (autoReview !== null && autoReview !== undefined) agentAutoMemoryReview = autoReview
      } catch { /* use default */ }
      try {
        const windowSetting = await storage.get('agentContextWindow') as number | null
        if (windowSetting !== null && windowSetting !== undefined) agentContextWindow = windowSetting
      } catch { /* use default */ }

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
        onMessage: (message) => agentCallbacksRef.current.onMessage(message),
        onUpdateMessage: (id, token, streaming) =>
          agentCallbacksRef.current.onUpdateMessage(id, token, streaming),
        onPendingAction: (action) => agentCallbacksRef.current.onPendingAction(action),
        onAgentStatus: (status) => {
          const id = runningChatIdRef.current
          if (id) chatActivity.setAgentStatus(id, status)
        },
        onContextSnapshot: (snapshot) => onContextSnapshot?.(snapshot),
        executeFileTool,
        executeMemoryTool,
        executeContextTool,
        loadContextPromptBody: async (contextId: string): Promise<ContextPromptBody> => {
          const result = await contextsAPI.getPromptBody(contextId)
          if (result.success && result.data) return result.data
          return { length: 0, markdown: '', injectFull: true }
        },
        refreshActiveContext: async (contextId: string) => {
          const result = await contextsAPI.list()
          if (result.success && result.data) {
            return result.data.find(context => context.id === contextId) ?? null
          }
          return null
        },
        callAI: async (messages, tools) => ai.chat(messages, tools),
        callAIStream: async (messages, tools, onToken, onProgress) => ai.chatStream(messages, tools, onToken, onProgress),
        abortAIStream: () => ai.abortStream(),
        ...(reasoningConfigured && {
          callAIReasoning: async (messages, tools) => ai.chatReasoning(messages, tools),
          callAIReasoningStream: async (messages, tools, onToken, onProgress) => ai.chatReasoningStream(messages, tools, onToken, onProgress),
        }),
        agentLightThinking,
        agentParallelReads,
        agentAutoMemoryReview,
        contextWindowTokens: agentContextWindow,
        agentMemoryReviewModel: reviewModelConfig,
        ...(reviewConfigured && {
          callReviewAI: async (messages) => ai.chatReview(messages),
        }),
        dequeueSteeringMessage: async () => {
          const targetChatId = runningChatIdRef.current
          if (!targetChatId) return null
          const next = dequeueMessage(targetChatId)
          if (next) {
            setQueuedVersion(v => v + 1)
            return next
          }
          return null
        },
      })

      setAgent(newAgent)
      if (activeContext) newAgent.setActiveContext(activeContext)
      setIsConfigured(true)
    } catch (error) {
      console.error('Failed to initialize agent:', error)
      setIsConfigured(false)
    }
  }

  const loadMessagesOnly = async (id: string) => {
    const cached = chatHistoryRef.current.find(c => c.id === id)
    if (cached) {
      setMessages(normalizeLoadedMessages(cached.messages))
      return
    }

    try {
      const result = await chatAPI.loadMessages(id)
      if (result.success && result.data) {
        const msgs = normalizeLoadedMessages(result.data as Message[])
        chatHistoryRef.current.push({ id, title: 'Untitled', date: new Date().toISOString(), messages: msgs })
        setMessages(msgs)
      }
    } catch (error) {
      console.error('Failed to load chat messages:', error)
    }
  }

  const clearStreamingFlags = (msgs: Message[]): Message[] =>
    msgs.map(m => (m.isStreaming ? { ...m, isStreaming: false } : m))

  const extractArtifactFromToolResult = (content: string): MarkdownArtifact | null => {
    const pathMatch = content.match(/Report saved:\s*(.+)/i)
    const titleMatch = content.match(/Title:\s*(.+)/i)
    if (!pathMatch?.[1] || !titleMatch?.[1]) return null
    return {
      path: pathMatch[1].trim(),
      title: titleMatch[1].trim(),
    }
  }

  const restoreMetadata = (msgs: Message[]): Message[] =>
    msgs.map((m, index) => {
      const metadata = (m as Message & {
        metadata?: {
          toolEntries?: ToolEntry[]
          artifact?: MarkdownArtifact
        } | null
      }).metadata
      if (m.type === 'tool_summary' && !m.toolEntries && metadata?.toolEntries) {
        return { ...m, toolEntries: metadata.toolEntries }
      }
      if (m.type === 'artifact' && !m.artifact) {
        if (metadata?.artifact) {
          return { ...m, artifact: metadata.artifact }
        }
        // Backfill older chats whose artifact payload was not persisted by
        // parsing the report details from the preceding tool_result message.
        for (let i = index - 1; i >= 0; i--) {
          const candidate = msgs[i]
          if (candidate.type !== 'tool_result') continue
          const artifact = extractArtifactFromToolResult(candidate.content)
          if (artifact) {
            return { ...m, artifact }
          }
        }
      }
      return m
    })

  const normalizeLoadedMessages = (msgs: Message[]): Message[] =>
    restoreMetadata(clearStreamingFlags(msgs))

  const applyCachedChat = (id: string, loadAgentHistory: boolean): boolean => {
    const cached = chatHistoryRef.current.find(c => c.id === id)
    if (!cached) return false
    const msgs = normalizeLoadedMessages(cached.messages)
    setMessages(msgs)
    if (loadAgentHistory) agent?.loadHistory(msgs)
    return true
  }

  const loadChat = async (id: string) => {
    if (applyCachedChat(id, true)) return

    try {
      const result = await chatAPI.loadMessages(id)
      if (result.success && result.data) {
        const msgs = normalizeLoadedMessages(result.data as Message[])
        const existing = chatHistoryRef.current.findIndex(c => c.id === id)
        const chatData = { id, title: 'Untitled', date: new Date().toISOString(), messages: msgs }
        if (existing >= 0) {
          chatHistoryRef.current[existing] = chatData
        } else {
          chatHistoryRef.current.unshift(chatData)
        }
        setMessages(msgs)
        agent?.loadHistory(msgs)
      }
    } catch (error) {
      console.error('Failed to load chat:', error)
    }
  }

  const resolveChatId = useCallback((targetChatId?: string): string => {
    if (targetChatId) return targetChatId
    if (chatIdRef.current) return chatIdRef.current
    if (sessionChatIdRef.current) return sessionChatIdRef.current
    const newId = uuidv4()
    sessionChatIdRef.current = newId
    return newId
  }, [])

  const updateHistoryRef = useCallback((currentId: string, chatMessages: Message[]): boolean => {
    const firstUserMsg = chatMessages.find(m => m.role === 'user')
    const title = firstUserMsg?.content.substring(0, 50) || 'New Chat'
    const chatData = {
      id: currentId,
      title,
      date: new Date().toISOString(),
      messages: chatMessages,
    }
    const history = chatHistoryRef.current
    const existingIndex = history.findIndex(c => c.id === currentId)
    const isFirstPersist = existingIndex < 0
    if (existingIndex >= 0) {
      history[existingIndex] = chatData
    } else {
      history.unshift(chatData)
      if (history.length > 100) history.pop()
    }
    return isFirstPersist
  }, [])

  const persistHistoryNow = useCallback(async () => {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current)
      persistTimerRef.current = null
    }
    const writes: Promise<unknown>[] = []
    for (const chat of chatHistoryRef.current) {
      for (const message of chat.messages) {
        writes.push(
          chatAPI.upsertMessage(chat.id, {
            id: message.id,
            role: message.role,
            content: message.content,
            timestamp: message.timestamp,
            type: message.type,
            metadata: message.toolEntries
              ? { toolEntries: message.toolEntries }
              : message.type === 'artifact' && message.artifact
                ? { artifact: message.artifact }
                : undefined,
          }),
        )
      }
    }
    await Promise.all(writes).catch(err => console.error('Failed to persist messages:', err))
    const summaries = chatHistoryRef.current.map(c => ({ id: c.id, title: c.title, date: c.date }))
    await storage.set('chatHistory', summaries)
    notifyChatHistoryChanged()
  }, [chatAPI, storage])

  const schedulePersist = useCallback(() => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current)
    persistTimerRef.current = setTimeout(() => {
      persistTimerRef.current = null
      persistHistoryNow()
    }, 400)
  }, [persistHistoryNow])

  const getViewingChatId = useCallback((): string | null => {
    if (!isVisibleRef.current) return null
    return activeChatIdRef.current
      ?? chatIdRef.current
      ?? sessionChatIdRef.current
  }, [])

  const isViewingChat = useCallback((targetId: string): boolean => {
    if (!targetId) return false
    return targetId === getViewingChatId()
  }, [getViewingChatId])

  const getMessagesForChat = useCallback((targetId: string): Message[] => {
    if (isViewingChat(targetId)) return messagesRef.current
    return chatHistoryRef.current.find(c => c.id === targetId)?.messages ?? []
  }, [isViewingChat])

  /** Update in-memory cache + UI immediately; debounce disk persist unless immediate. */
  const commitMessages = useCallback((
    targetId: string,
    next: Message[],
    options?: { immediate?: boolean; sync?: boolean },
  ) => {
    const isFirstPersist = updateHistoryRef(targetId, next)
    const firstUserMsg = next.find(m => m.role === 'user')
    const title = firstUserMsg?.content.substring(0, 50) || 'New Chat'
    if (isViewingChat(targetId)) {
      messagesRef.current = next
      if (options?.sync) {
        flushSync(() => setMessages(next))
      } else {
        setMessages(next)
      }
    }
    if (options?.immediate) {
      persistHistoryNow()
    } else {
      schedulePersist()
    }
    if (isFirstPersist) {
      setTimeout(() => onChatCreated(targetId, title), 0)
    }
  }, [updateHistoryRef, isViewingChat, persistHistoryNow, schedulePersist, onChatCreated])

  const saveChat = useCallback((chatMessages: Message[], targetChatId?: string) => {
    try {
      commitMessages(resolveChatId(targetChatId), chatMessages, { immediate: true })
    } catch (error) {
      console.error('Failed to save chat:', error)
    }
  }, [commitMessages, resolveChatId])

  const resolveTargetChatId = useCallback((): string | null => {
    return runningChatIdRef.current
      ?? activeChatIdRef.current
      ?? chatIdRef.current
      ?? sessionChatIdRef.current
  }, [])

  const resolveFinalMessages = useCallback((msgs: Message[]): Message[] =>
    msgs.map(m => {
      if (!m.isStreaming) return m
      const snap = streamingContentRef.current.get(m.id)
      return { ...m, content: snap ?? m.content, isStreaming: false }
    }), [])

  const applyStreamUpdate = useCallback((
    targetId: string,
    id: string,
    token: string,
    isStreaming: boolean,
  ) => {
    const prev = getMessagesForChat(targetId)
    let next: Message[]
    if (isStreaming) {
      streamingContentRef.current.set(id, token)
      next = prev.some(m => m.id === id)
        ? prev.map(m => m.id === id ? { ...m, content: token, isStreaming: true } : m)
        : [...prev, { id, role: 'assistant' as const, content: token, timestamp: new Date().toISOString(), isStreaming: true }]
      commitMessages(targetId, next)
      return
    }

    const existing = prev.find(m => m.id === id)
    const snap = streamingContentRef.current.get(id)
    streamingContentRef.current.delete(id)
    const bestContent = [token, snap, existing?.content]
      .filter((v): v is string => !!v)
      .reduce((a, b) => (a.length >= b.length ? a : b), token)
    const exists = !!existing
    next = exists
      ? prev.map(m => m.id === id ? { ...m, content: bestContent, isStreaming: false } : m)
      : [...prev, { id, role: 'assistant' as const, content: bestContent, timestamp: new Date().toISOString() }]
    commitMessages(targetId, next, { sync: true, immediate: true })
  }, [commitMessages, getMessagesForChat])

  const flushPendingStream = useCallback(() => {
    streamRafRef.current = null
    const pending = streamPendingRef.current
    if (!pending) return
    streamPendingRef.current = null
    const currentEpoch = streamEpochRef.current.get(pending.id) ?? 0
    if (pending.epoch !== currentEpoch) return
    applyStreamUpdate(pending.targetId, pending.id, pending.token, true)
  }, [applyStreamUpdate])

  const bumpStreamEpoch = useCallback((id: string) => {
    streamEpochRef.current.set(id, (streamEpochRef.current.get(id) ?? 0) + 1)
  }, [])

  const finishAgentRun = useCallback((targetChatId: string) => {
    if (streamRafRef.current !== null) {
      cancelAnimationFrame(streamRafRef.current)
      streamRafRef.current = null
    }
    if (streamPendingRef.current) {
      flushPendingStream()
    }

    runningChatIdRef.current = null
    lastBackgroundSyncRef.current = null

    const cached = chatHistoryRef.current.find(c => c.id === targetChatId)
    const fromCache = resolveFinalMessages(cached?.messages ?? [])
    const fromLive = resolveFinalMessages(messagesRef.current)
    const resolved = fromCache.length >= fromLive.length ? fromCache : fromLive
    const viewing = isViewingChat(targetChatId)

    if (viewing) {
      messagesRef.current = resolved
      flushSync(() => setMessages(resolved))
    }

    if (resolved.length > 0) {
      updateHistoryRef(targetChatId, resolved)
      persistHistoryNow()
    }

    streamingContentRef.current.clear()
    streamPendingRef.current = null
    streamEpochRef.current.clear()
    chatActivity.finishRunning(targetChatId, viewing ? targetChatId : null)
  }, [
    chatActivity,
    flushPendingStream,
    isViewingChat,
    persistHistoryNow,
    resolveFinalMessages,
    updateHistoryRef,
  ])

  const handleNewMessage = useCallback((message: Message) => {
    const targetId = resolveTargetChatId()
    if (!targetId) return

    const prev = getMessagesForChat(targetId)
    const exists = prev.find(m => m.id === message.id)
    const next = exists
      ? prev.map(m => m.id === message.id ? message : m)
      : [...prev, message]
    commitMessages(targetId, next, { sync: true })
  }, [resolveTargetChatId, getMessagesForChat, commitMessages])

  /**
   * Called by the agent during streaming:
   * - token = '' and isStreaming = false -> remove the streaming placeholder (tool call round)
   * - token = full content and isStreaming = false -> finalise the message
   * - token = full content snapshot and isStreaming = true -> replace message content
   */
  const handleUpdateMessage = useCallback((id: string, token: string, isStreaming: boolean) => {
    const targetId = resolveTargetChatId()
    if (!targetId) return

    if (!isStreaming && token === '') {
      bumpStreamEpoch(id)
      streamingContentRef.current.delete(id)
      streamEpochRef.current.delete(id)
      if (streamRafRef.current !== null) {
        cancelAnimationFrame(streamRafRef.current)
        streamRafRef.current = null
      }
      streamPendingRef.current = null
      const prev = getMessagesForChat(targetId)
      commitMessages(targetId, prev.filter(m => m.id !== id), { sync: true })
      return
    }

    if (isStreaming) {
      const epoch = streamEpochRef.current.get(id) ?? 0
      streamPendingRef.current = { targetId, id, token, epoch }
      if (streamRafRef.current === null) {
        streamRafRef.current = requestAnimationFrame(flushPendingStream)
      }
      return
    }

    bumpStreamEpoch(id)
    if (streamRafRef.current !== null) {
      cancelAnimationFrame(streamRafRef.current)
      streamRafRef.current = null
    }
    streamPendingRef.current = null
    applyStreamUpdate(targetId, id, token, false)
  }, [resolveTargetChatId, getMessagesForChat, commitMessages, flushPendingStream, applyStreamUpdate, bumpStreamEpoch])

  const handlePendingAction = useCallback((action: PendingAction) => {
    const targetId = resolveTargetChatId()
    if (targetId) pendingByChatRef.current.set(targetId, action)
    if (targetId && isViewingChat(targetId)) {
      setPendingAction(action)
    }
  }, [resolveTargetChatId, isViewingChat])

  agentCallbacksRef.current = {
    onMessage: handleNewMessage,
    onUpdateMessage: handleUpdateMessage,
    onPendingAction: handlePendingAction,
  }

  const isScopedPath = (inputPath: string): boolean => {
    const normalized = inputPath.replace(/\\/g, '/')
    return normalized.startsWith('.smile/') || normalized.includes('/')
  }

  const resolveWritePath = (inputPath: string, context: ProjectContext | null): string => {
    const trimmed = inputPath.trim()
    if (!trimmed) return ''
    if (context && !isScopedPath(trimmed)) {
      return `${getContextFilesPath(context)}/${trimmed}`
    }
    return trimmed
  }

  const resolveReadPath = async (
    inputPath: string,
    context: ProjectContext | null,
  ): Promise<{ success: boolean; data?: string; error?: string }> => {
    const trimmed = inputPath.trim()
    if (!trimmed) return { success: false, error: 'No path provided' }

    const direct = await file.read(trimmed)
    if (direct.success) return direct
    if (!context) return direct

    // Fallback: look inside the active context folder.
    const contextPath = `${getContextFolderPath(context)}/${trimmed}`
    return await file.read(contextPath)
  }

  const executeFileTool = async (name: string, args: Record<string, unknown>): Promise<unknown> => {
    try {
      switch (name) {
        case 'file_list': {
          const inputPath = (args.path as string) || ''
          if (!inputPath && activeContext) {
            return await file.list(getContextFilesPath(activeContext))
          }
          return await file.list(inputPath)
        }
        case 'file_read': {
          const inputPath = args.path as string
          return await resolveReadPath(inputPath, activeContext)
        }
        case 'file_read_ocr': {
          const inputPath = args.path as string
          const direct = await file.readOcr(inputPath)
          if (direct.success || !activeContext) return direct
          return await file.readOcr(`${getContextFilesPath(activeContext)}/${inputPath}`)
        }
        case 'file_write': {
          const writePath = resolveWritePath(args.path as string, activeContext)
          return await file.write(writePath, args.content as string)
        }
        case 'report_write': {
          const title = String(args.title || 'Report')
          const content = String(args.content || '')
          const path = buildReportPath(title, args.path as string | undefined, activeContext)
          const writeResult = await file.write(path, content)
          if (!writeResult.success) return writeResult
          return {
            success: true,
            path,
            title,
            data: buildReportToolResult(path, title),
          }
        }
        case 'file_mkdir': {
          const mkdirPath = resolveWritePath(args.path as string, activeContext)
          return await file.mkdir(mkdirPath)
        }
        case 'file_search': {
          const pattern = args.pattern as string
          const directory = args.directory as string | undefined
          if (!directory && activeContext) {
            const contextResult = await file.search(pattern, getContextFolderPath(activeContext))
            if (contextResult.success && Array.isArray(contextResult.data) && contextResult.data.length > 0) {
              return contextResult
            }
          }
          return await file.search(pattern, directory)
        }
        case 'file_search_content':
          return await file.searchContent(
            args.query as string,
            args.path as string | undefined,
            args.max_results as number | undefined,
          )
        case 'file_patch':
          return await file.patch(
            args.path as string,
            args.search as string,
            args.replace as string,
            args.count as number | undefined,
          )
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
    const quoted = text.match(/["']([^"']+)["']/)
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
      if (name === 'memory_search') {
        const query = String(args.query || '').trim()
        if (!query) return { success: false, error: 'query is required' }
        const result = await memoryAPI.searchIndex(
          query,
          args.kind as 'user' | 'learned' | 'source' | undefined,
          args.max_results as number | undefined,
        )
        if (!result.success) return { success: false, error: result.error || 'Memory search failed' }
        return { success: true, data: result.data || [] }
      }

      if (name === 'memory_update') {
        if (memoryUpdateCountRef.current >= 3) {
          return { success: true, data: 'Memory write limit reached for this turn (3). Provide your final response now.' }
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
        void memoryAPI.reindex()
        return { success: true, data: 'Saved to learned memory.' }
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
        void memoryAPI.reindex()
        return { success: true, data: `Deleted ${deleted} memory entr${deleted === 1 ? 'y' : 'ies'} matching "${args.query}".` }
      }

      return { success: false, error: `Unknown memory tool: ${name}` }
    } catch (error) {
      throw error
    }
  }

  const executeContextTool = async (name: string, args: Record<string, unknown>): Promise<unknown> => {
    if (!activeContext) {
      return { success: false, error: 'No active project context. Enable a context from the sidebar first.' }
    }

    try {
      if (name === 'context_read') {
        const result = await contextsAPI.readMarkdown(activeContext.id)
        if (!result.success) return { success: false, error: result.error || 'Could not read context' }
        return { success: true, data: result.data || '(empty context file)' }
      }

      if (name === 'context_append') {
        const section = String(args.section || '').trim()
        const content = String(args.content || '').trim()
        if (!section) return { success: false, error: 'section is required' }
        if (!content) return { success: false, error: 'content is required' }
        const result = await contextsAPI.appendSection(activeContext.id, section, content)
        if (!result.success) return { success: false, error: result.error || 'Could not append to context' }
        return { success: true, data: 'Context updated. Give your final response - do not call context tools again unless the user asks for more changes.' }
      }

      if (name === 'context_replace_section') {
        const heading = String(args.heading || '').trim()
        const content = String(args.content || '').trim()
        if (!heading) return { success: false, error: 'heading is required' }
        if (!content) return { success: false, error: 'content is required' }
        const result = await contextsAPI.replaceSection(activeContext.id, heading, content)
        if (!result.success) return { success: false, error: result.error || 'Could not update context section' }
        return { success: true, data: 'Context section replaced. Give your final response - do not call context tools again unless the user asks for more changes.' }
      }

      return { success: false, error: `Unknown context tool: ${name}` }
    } catch (error) {
      throw error
    }
  }

  const refreshAgentProfile = async () => {
    if (!agent) return
    const userProfile = normalizeUserProfile(await storage.get('userProfile') as Partial<UserProfile> | null)
    agent.updateUserProfile(userProfile)
  }

  const handleStop = useCallback(() => {
    if (!agent || !runningChatIdRef.current) return
    if (runningChatIdRef.current !== visibleChatId) return
    const targetChatId = runningChatIdRef.current
    agent.abort()
    finishAgentRun(targetChatId)
  }, [agent, finishAgentRun, visibleChatId])

  // Queue helpers for mid-turn user input.
  const queueMessage = (targetChatId: string, message: string) => {
    const list = queuedByChatRef.current.get(targetChatId) ?? []
    queuedByChatRef.current.set(targetChatId, [...list, message])
    setQueuedVersion(v => v + 1)
  }

  const dequeueMessage = (targetChatId: string): string | undefined => {
    const list = queuedByChatRef.current.get(targetChatId)
    if (!list || list.length === 0) return undefined
    const [first, ...rest] = list
    if (rest.length === 0) queuedByChatRef.current.delete(targetChatId)
    else queuedByChatRef.current.set(targetChatId, rest)
    setQueuedVersion(v => v + 1)
    return first
  }

  const removeQueuedMessage = (targetChatId: string, index: number) => {
    const list = queuedByChatRef.current.get(targetChatId)
    if (!list) return
    const next = [...list.slice(0, index), ...list.slice(index + 1)]
    if (next.length === 0) queuedByChatRef.current.delete(targetChatId)
    else queuedByChatRef.current.set(targetChatId, next)
    setQueuedVersion(v => v + 1)
  }

  // Ref so the auto-send effect always uses the latest send function.
  const sendUserMessageRef = useRef<(message: string, options?: { clearInput?: boolean }) => Promise<void>>(async () => {})

  const sendUserMessage = async (message: string, options?: { clearInput?: boolean }) => {
    const clearInput = options?.clearInput !== false
    if (!message || !agent || otherChatRunning || sendInFlightRef.current) return
    sendInFlightRef.current = true

    let userMessage = message
    if (clearInput && attachedFiles.length > 0) {
      const fileInfo = attachedFiles.map(f => `- ${f.name} (${f.path})`).join('\n')
      userMessage = `${userMessage}\n\n[Attached files in workspace]\n${fileInfo}`
    }

    if (clearInput) {
      setInput('')
      setAttachedFiles([])
    }
    memoryUpdateCountRef.current = 0

    const targetChatId = chatId ?? sessionChatIdRef.current ?? uuidv4()
    const isNewChat = !chatId
    if (!chatId && !sessionChatIdRef.current) {
      sessionChatIdRef.current = targetChatId
    }
    if (isNewChat) {
      onChatCreated(targetChatId, userMessage.substring(0, 50) || 'New Chat')
    }

    try {
      if (await handleDirectMemoryCommand(userMessage)) {
        if (pendingAction) {
          const actionId = pendingAction.id
          setPendingAction(null)
          pendingByChatRef.current.delete(targetChatId)
          agent.rejectAction(actionId, { silent: true })
        }
        return
      }

      runningChatIdRef.current = targetChatId
      chatActivity.startRunning(targetChatId)

      if (pendingAction) {
        await handleReiterateAction(userMessage)
      } else {
        await refreshAgentProfile()
        agent.setActiveContext(activeContext)
        await agent.processMessage(userMessage, { useReasoning: useThinking })
      }
    } finally {
      if (runningChatIdRef.current === targetChatId) {
        finishAgentRun(targetChatId)
      }
      sendInFlightRef.current = false
    }
  }

  sendUserMessageRef.current = sendUserMessage

  const handleSend = async () => {
    const message = input.trim()
    if (!message || !agent || otherChatRunning || mcpConnectionState === 'connecting' || sendInFlightRef.current) return

    if (isLoading) {
      if (queuedCount >= MAX_QUEUED_MESSAGES) return
      queueMessage(visibleChatId ?? '', message)
      setInput('')
      setAttachedFiles([])
      return
    }

    await sendUserMessage(message)
    setUseThinking(false)
  }

  // Auto-send queued messages when any run finishes, even for a chat that is not currently visible.
  useEffect(() => {
    const prev = prevRunningChatIdRef.current
    const current = chatActivity.runningChatId
    if (prev && !current) {
      const next = dequeueMessage(prev)
      if (next) {
        sendUserMessageRef.current(next, { clearInput: true })
      }
    }
    prevRunningChatIdRef.current = current
  }, [chatActivity.runningChatId])
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleApproveAction = async () => {
    if (!pendingAction || !agent || otherChatRunning) return
    const action = pendingAction
    const targetChatId = chatId ?? sessionChatIdRef.current ?? uuidv4()
    if (!chatId && !sessionChatIdRef.current) {
      sessionChatIdRef.current = targetChatId
    }
    setPendingAction(null)
    pendingByChatRef.current.delete(targetChatId)
    runningChatIdRef.current = targetChatId
    chatActivity.startRunning(targetChatId)

    try {
      agent.setActiveContext(activeContext)
      await agent.approveAction(action.id)
    } catch (error) {
      console.error('Failed to execute action:', error)
    } finally {
      finishAgentRun(targetChatId)
    }
  }

  const handleRejectAction = () => {
    if (!pendingAction || !agent) return
    const actionId = pendingAction.id
    const targetId = resolveTargetChatId()
    setPendingAction(null)
    if (targetId) pendingByChatRef.current.delete(targetId)
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
          message="Checking the connectors..."
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
    <div className="ui-chat-pane">
      {/* Connection Status Banner */}
      {renderConnectionStatus()}

      {otherChatRunning && (
        <ChatBanner
          variant="info"
          message="The agent is still working in another chat. You can open it from Chat History."
        />
      )}
      
      {/* Messages Area */}
      <div className="ui-chat-scroll">
        <div className="content-shell ui-chat-messages space-y-4">
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
        className={`ui-chat-composer transition-colors ${
          isDragging ? 'bg-neutral-50' : ''
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className={`content-shell ${showActiveReport ? 'ui-chat-composer--with-report' : ''}`}>
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
              key={activeReport.messageId}
              artifact={activeReport.artifact}
              messageId={activeReport.messageId}
              onDismiss={() => setDismissedReportMessageId(activeReport.messageId)}
              className="mb-3"
            />
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

          {queuedMessages.length > 0 && (
            <div className="mb-2 flex flex-col items-end gap-1.5">
              {queuedMessages.map((msg, i) => (
                <div
                  key={`queued-${i}`}
                  className="group max-w-[80%] rounded-2xl rounded-br-sm bg-neutral-100 px-4 py-2 text-sm text-neutral-700 shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <span className="break-words">{msg}</span>
                    <button
                      type="button"
                      onClick={() => removeQueuedMessage(visibleChatId ?? '', i)}
                      className="text-neutral-400 hover:text-neutral-600 leading-none"
                      aria-label="Remove queued message"
                      title="Remove"
                    >
                      ×
                    </button>
                  </div>
                  <span className="mt-1 block text-xs text-neutral-400">Queued</span>
                </div>
              ))}
              {queuedCount >= MAX_QUEUED_MESSAGES && (
                <span className="text-xs text-neutral-400">Max {MAX_QUEUED_MESSAGES} queued messages</span>
              )}
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

            <button
              type="button"
              onClick={() => setUseThinking(v => !v)}
              disabled={!reasoningConfigured || isLoading || mcpConnectionState === 'connecting'}
              className={[
                'ui-chat-input-action',
                useThinking ? 'text-neutral-900' : 'text-gray-400 hover:text-gray-600',
                (!reasoningConfigured || isLoading || mcpConnectionState === 'connecting') && 'disabled:text-gray-300',
              ].filter(Boolean).join(' ')}
              title={reasoningConfigured ? 'Think (use reasoning model)' : 'Reasoning model not configured'}
              aria-label="Toggle thinking"
            >
              <ThinkingIcon active={useThinking} />
            </button>

            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                mcpConnectionState === 'connecting'
                  ? 'Checking the connectors...'
                  : isLoading
                    ? 'Type a follow-up. It will be queued until the agent finishes...'
                    : showActiveReport
                      ? 'Ask about this report, or dismiss it to chat about something else...'
                      : 'Ask me anything...'
              }
              rows={1}
              className="ui-chat-input"
              disabled={otherChatRunning || mcpConnectionState === 'connecting'}
            />

            {isLoading && (
              <button
                type="button"
                onClick={handleStop}
                title="Stop"
                aria-label="Stop"
                className="ui-chat-input-action text-red-500 hover:text-red-600"
              >
                <StopIcon />
              </button>
            )}

            <button
              type="button"
              onClick={handleSend}
              disabled={
                !input.trim() ||
                otherChatRunning ||
                mcpConnectionState === 'connecting' ||
                (isLoading && queuedCount >= MAX_QUEUED_MESSAGES)
              }
              className="ui-chat-input-action ui-chat-input-action--end text-neutral-700 hover:text-neutral-950 disabled:text-gray-300"
              title={
                isLoading
                  ? queuedCount >= MAX_QUEUED_MESSAGES
                    ? `Queue full (max ${MAX_QUEUED_MESSAGES})`
                    : 'Queue message'
                  : 'Send message'
              }
              aria-label={isLoading ? 'Queue message' : 'Send message'}
            >
              <SendIcon />
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2 text-center">
            {mcpConnectionState === 'connecting' ? (
              'Please wait while connecting to connector...'
            ) : (
              <span className="inline-flex items-center justify-center gap-1 flex-wrap">
                <span>Press Enter to send, Shift+Enter for new line. Drop files or click</span>
                <PaperclipIcon className="w-3.5 h-3.5 shrink-0" />
                <span>to attach. Select the light bulb to invoke the Reasoning model.</span>
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
