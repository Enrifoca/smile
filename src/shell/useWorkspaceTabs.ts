import { useCallback, useReducer } from 'react'
import { v4 as uuidv4 } from 'uuid'
import {
  type ActivityId,
  type WorkspaceTab,
  defaultTabTitle,
  isSingletonKind,
  tabKindForActivity,
} from './types'

interface WorkspaceState {
  tabs: WorkspaceTab[]
  activeTabId: string
  activity: ActivityId
}

type WorkspaceAction =
  | { type: 'SET_ACTIVITY'; activity: ActivityId }
  | { type: 'FOCUS_TAB'; tabId: string }
  | { type: 'OPEN_TAB'; tab: WorkspaceTab }
  | { type: 'OPEN_OR_FOCUS'; spec: Omit<WorkspaceTab, 'id' | 'title'> & { title?: string } }
  | { type: 'CLOSE_TAB'; tabId: string }
  | { type: 'UPDATE_TAB'; tabId: string; patch: Partial<Pick<WorkspaceTab, 'title' | 'chatId' | 'contextId'>> }

function findMatchingTab(
  tabs: WorkspaceTab[],
  spec: Omit<WorkspaceTab, 'id' | 'title'> & { title?: string },
): WorkspaceTab | undefined {
  return tabs.find(tab => {
    if (tab.kind !== spec.kind) return false
    if (spec.kind === 'context-detail') return tab.contextId === spec.contextId
    if (spec.kind === 'chat' && spec.chatId) return tab.chatId === spec.chatId
    if (isSingletonKind(tab.kind)) return true
    return false
  })
}

function createInitialState(): WorkspaceState {
  const firstTab: WorkspaceTab = {
    id: uuidv4(),
    kind: 'chat',
    title: defaultTabTitle('chat'),
    chatId: null,
  }
  return { tabs: [firstTab], activeTabId: firstTab.id, activity: 'chat' }
}

function activityFromTab(tab: WorkspaceTab): ActivityId {
  if (tab.kind === 'chat') return 'chat'
  if (tab.kind === 'context-home' || tab.kind === 'context-new' || tab.kind === 'context-detail') return 'context'
  return tab.kind
}

function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case 'SET_ACTIVITY': {
      const kind = tabKindForActivity(action.activity)
      const existing = kind === 'chat'
        ? [...state.tabs].reverse().find(tab => tab.kind === 'chat')
        : state.tabs.find(tab => {
            if (tab.kind !== kind) return false
            if (isSingletonKind(kind)) return true
            return false
          })
      if (existing) {
        return { ...state, activity: action.activity, activeTabId: existing.id }
      }
      const tab: WorkspaceTab = {
        id: uuidv4(),
        kind,
        title: defaultTabTitle(kind),
        chatId: kind === 'chat' ? null : undefined,
      }
      return {
        activity: action.activity,
        activeTabId: tab.id,
        tabs: [...state.tabs, tab],
      }
    }
    case 'FOCUS_TAB': {
      const tab = state.tabs.find(t => t.id === action.tabId)
      if (!tab) return state
      return { ...state, activeTabId: action.tabId, activity: activityFromTab(tab) }
    }
    case 'OPEN_TAB':
      return {
        ...state,
        activeTabId: action.tab.id,
        activity: activityFromTab(action.tab),
        tabs: [...state.tabs, action.tab],
      }
    case 'OPEN_OR_FOCUS': {
      const existing = findMatchingTab(state.tabs, action.spec)
      if (existing) {
        const tabs = action.spec.title
          ? state.tabs.map(tab =>
              tab.id === existing.id ? { ...tab, title: action.spec.title! } : tab,
            )
          : state.tabs
        return {
          ...state,
          activeTabId: existing.id,
          activity: activityFromTab(existing),
          tabs,
        }
      }
      const tab: WorkspaceTab = {
        id: uuidv4(),
        kind: action.spec.kind,
        title: action.spec.title ?? defaultTabTitle(action.spec.kind),
        chatId: action.spec.chatId,
        contextId: action.spec.contextId,
      }
      return {
        ...state,
        activeTabId: tab.id,
        activity: activityFromTab(tab),
        tabs: [...state.tabs, tab],
      }
    }
    case 'CLOSE_TAB': {
      const idx = state.tabs.findIndex(t => t.id === action.tabId)
      if (idx < 0) return state
      const tabs = state.tabs.filter(t => t.id !== action.tabId)

      if (tabs.length === 0) {
        const newTab: WorkspaceTab = {
          id: uuidv4(),
          kind: 'chat',
          title: defaultTabTitle('chat'),
          chatId: null,
        }
        return { tabs: [newTab], activeTabId: newTab.id, activity: 'chat' }
      }

      const nextActive = state.activeTabId === action.tabId
        ? tabs[Math.min(idx, tabs.length - 1)]!.id
        : state.activeTabId
      const nextTab = tabs.find(t => t.id === nextActive) ?? tabs[0]!
      return {
        ...state,
        tabs,
        activeTabId: nextActive,
        activity: activityFromTab(nextTab),
      }
    }
    case 'UPDATE_TAB':
      return {
        ...state,
        tabs: state.tabs.map(tab =>
          tab.id === action.tabId ? { ...tab, ...action.patch } : tab,
        ),
      }
    default:
      return state
  }
}

export function useWorkspaceTabs() {
  const [state, dispatch] = useReducer(workspaceReducer, undefined, createInitialState)

  const activeTab = state.tabs.find(t => t.id === state.activeTabId) ?? state.tabs[0]!

  const setActivity = useCallback((activity: ActivityId) => {
    dispatch({ type: 'SET_ACTIVITY', activity })
  }, [])

  const focusTab = useCallback((tabId: string) => {
    dispatch({ type: 'FOCUS_TAB', tabId })
  }, [])

  const openOrFocus = useCallback(
    (spec: Omit<WorkspaceTab, 'id' | 'title'> & { title?: string }) => {
      dispatch({ type: 'OPEN_OR_FOCUS', spec })
    },
    [],
  )

  const openChat = useCallback(
    (chatId: string | null, title: string) => {
      if (chatId) {
        dispatch({
          type: 'OPEN_OR_FOCUS',
          spec: { kind: 'chat', chatId, title },
        })
      } else {
        const tab: WorkspaceTab = {
          id: uuidv4(),
          kind: 'chat',
          title,
          chatId: null,
        }
        dispatch({ type: 'OPEN_TAB', tab })
      }
    },
    [],
  )

  const openContextDetail = useCallback((contextId: string, name: string) => {
    dispatch({ type: 'SET_ACTIVITY', activity: 'context' })
    dispatch({
      type: 'OPEN_OR_FOCUS',
      spec: { kind: 'context-detail', contextId, title: name },
    })
  }, [])

  const openContextNew = useCallback(() => {
    dispatch({ type: 'SET_ACTIVITY', activity: 'context' })
    dispatch({ type: 'OPEN_OR_FOCUS', spec: { kind: 'context-new' } })
  }, [])

  const closeTab = useCallback((tabId: string) => {
    dispatch({ type: 'CLOSE_TAB', tabId })
  }, [])

  const updateTab = useCallback(
    (tabId: string, patch: Partial<Pick<WorkspaceTab, 'title' | 'chatId' | 'contextId'>>) => {
      dispatch({ type: 'UPDATE_TAB', tabId, patch })
    },
    [],
  )

  return {
    tabs: state.tabs,
    activeTabId: state.activeTabId,
    activeTab,
    activity: state.activity,
    setActivity,
    focusTab,
    openOrFocus,
    openChat,
    openContextDetail,
    openContextNew,
    closeTab,
    updateTab,
  }
}

export type WorkspaceTabsApi = ReturnType<typeof useWorkspaceTabs>
