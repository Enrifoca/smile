/** Primary navigation rail — drives secondary sidebar content. */
export type ActivityId = 'chat' | 'context' | 'memories' | 'connectors' | 'settings'

/** Workspace tab document kinds. */
export type TabKind =
  | 'chat'
  | 'connectors'
  | 'settings'
  | 'memories'
  | 'context-new'
  | 'context-detail'

export interface WorkspaceTab {
  id: string
  kind: TabKind
  title: string
  chatId?: string | null
  contextId?: string
}

export type InspectorTabId = 'reports' | 'context' | 'memories'

export const SINGLETON_TAB_KINDS: TabKind[] = [
  'connectors',
  'settings',
  'memories',
  'context-new',
]

export const ACTIVITY_DEFAULT_TAB: Record<ActivityId, TabKind> = {
  chat: 'chat',
  context: 'context-new',
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
    case 'context-new':
      return 'New context'
    case 'context-detail':
      return 'Context'
    default:
      return 'Untitled'
  }
}
