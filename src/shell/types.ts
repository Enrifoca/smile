/** Primary navigation rail — drives secondary sidebar content. */
export type ActivityId = 'chat' | 'context' | 'memories' | 'connectors' | 'settings'

/** Workspace tab document kinds. */
export type TabKind =
  | 'chat'
  | 'connectors'
  | 'settings'
  | 'memories'
  | 'context-home'
  | 'context-new'
  | 'context-detail'

export interface WorkspaceTab {
  id: string
  kind: TabKind
  title: string
  chatId?: string | null
  contextId?: string
}

export type InspectorTabId = 'reports' | 'context'

export const SINGLETON_TAB_KINDS: TabKind[] = [
  'connectors',
  'settings',
  'memories',
  'context-home',
  'context-new',
]

export const ACTIVITY_DEFAULT_TAB: Record<ActivityId, TabKind> = {
  chat: 'chat',
  context: 'context-home',
  memories: 'memories',
  connectors: 'connectors',
  settings: 'settings',
}

export function defaultTabTitle(kind: TabKind): string {
  switch (kind) {
    case 'chat':
      return 'New Chat'
    case 'connectors':
      return 'Connectors'
    case 'settings':
      return 'Settings'
    case 'memories':
      return 'Memory'
    case 'context-home':
      return 'Contexts'
    case 'context-new':
      return 'New Context'
    case 'context-detail':
      return 'Context'
    default:
      return 'Untitled'
  }
}

export function tabKindForActivity(activity: ActivityId): TabKind {
  return ACTIVITY_DEFAULT_TAB[activity]
}

export function isSingletonKind(kind: TabKind): boolean {
  return SINGLETON_TAB_KINDS.includes(kind)
}
