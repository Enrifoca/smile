import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react'

export type ChatActivityKind = 'running' | 'unread'

export interface ChatActivityEntry {
  kind: ChatActivityKind
  agentStatus: string | null
}

interface ChatActivityStore {
  runningChatId: string | null
  entries: Map<string, ChatActivityEntry>
}

interface ChatActivityContextValue {
  revision: number
  runningChatId: string | null
  getActivity: (chatId: string | null | undefined) => ChatActivityEntry | null
  startRunning: (chatId: string) => void
  setAgentStatus: (chatId: string, status: string | null) => void
  finishRunning: (chatId: string, viewingChatId: string | null) => void
  clearUnread: (chatId: string) => void
}

const ChatActivityContext = createContext<ChatActivityContextValue | null>(null)

function createStore(): ChatActivityStore {
  return { runningChatId: null, entries: new Map() }
}

export function ChatActivityProvider({ children }: { children: ReactNode }) {
  const storeRef = useRef<ChatActivityStore>(createStore())
  const listenersRef = useRef(new Set<() => void>())
  const revisionRef = useRef(0)

  const subscribe = useCallback((listener: () => void) => {
    listenersRef.current.add(listener)
    return () => listenersRef.current.delete(listener)
  }, [])

  const getRevision = useCallback(() => revisionRef.current, [])

  const revision = useSyncExternalStore(subscribe, getRevision, getRevision)

  const emit = useCallback(() => {
    revisionRef.current += 1
    for (const listener of listenersRef.current) {
      listener()
    }
  }, [])

  const getActivity = useCallback((chatId: string | null | undefined) => {
    if (!chatId) return null
    return storeRef.current.entries.get(chatId) ?? null
  }, [])

  const startRunning = useCallback(
    (chatId: string) => {
      const store = storeRef.current
      store.runningChatId = chatId
      store.entries.set(chatId, { kind: 'running', agentStatus: null })
      emit()
    },
    [emit],
  )

  const setAgentStatus = useCallback(
    (chatId: string, status: string | null) => {
      const entry = storeRef.current.entries.get(chatId)
      if (!entry || entry.kind !== 'running') return
      storeRef.current.entries.set(chatId, { ...entry, agentStatus: status })
      emit()
    },
    [emit],
  )

  const finishRunning = useCallback(
    (chatId: string, viewingChatId: string | null) => {
      const store = storeRef.current
      if (store.runningChatId === chatId) {
        store.runningChatId = null
      }
      if (viewingChatId === chatId) {
        store.entries.delete(chatId)
      } else {
        store.entries.set(chatId, { kind: 'unread', agentStatus: null })
      }
      emit()
    },
    [emit],
  )

  const clearUnread = useCallback(
    (chatId: string) => {
      const entry = storeRef.current.entries.get(chatId)
      if (!entry || entry.kind !== 'unread') return
      storeRef.current.entries.delete(chatId)
      emit()
    },
    [emit],
  )

  const value = useMemo(
    () => ({
      revision,
      runningChatId: storeRef.current.runningChatId,
      getActivity,
      startRunning,
      setAgentStatus,
      finishRunning,
      clearUnread,
    }),
    [revision, getActivity, startRunning, setAgentStatus, finishRunning, clearUnread],
  )

  return <ChatActivityContext.Provider value={value}>{children}</ChatActivityContext.Provider>
}

export function useChatActivity(): ChatActivityContextValue {
  const context = useContext(ChatActivityContext)
  if (!context) throw new Error('useChatActivity must be used within ChatActivityProvider')
  return context
}
