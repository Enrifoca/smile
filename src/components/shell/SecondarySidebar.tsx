import { useEffect, useState } from 'react'
import { useElectron } from '../../hooks/useElectron'
import type { ActivityId } from '../../shell/types'
import type { ProjectContext } from '../../context/types'
import { Button } from '../ui'

interface ChatRow {
  id: string
  title: string
  date: string
}

interface SecondarySidebarProps {
  activity: ActivityId
  currentChatId: string | null
  activeTabKind: string
  contexts: ProjectContext[]
  onNewChat: () => void
  onSelectChat: (chatId: string, title: string) => void
  onOpenContextNew: () => void
  onOpenContextDetail: (contextId: string, name: string) => void
  onOpenMemories: () => void
  onOpenConnectors: () => void
}

const SIDEBAR_HEAD: Record<ActivityId, string> = {
  chat: 'Chat History',
  context: 'Contexts',
  memories: 'Memory',
  connectors: 'Connectors',
  settings: 'Settings',
}

function groupChats(chats: ChatRow[]): Record<string, ChatRow[]> {
  return chats.reduce((groups, chat) => {
    const date = new Date(chat.date)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    let group = 'Older'
    if (date.toDateString() === today.toDateString()) group = 'Today'
    else if (date.toDateString() === yesterday.toDateString()) group = 'Yesterday'
    else if (date > new Date(today.setDate(today.getDate() - 7))) group = 'This Week'
    if (!groups[group]) groups[group] = []
    groups[group].push(chat)
    return groups
  }, {} as Record<string, ChatRow[]>)
}

export default function SecondarySidebar({
  activity,
  currentChatId,
  activeTabKind,
  contexts,
  onNewChat,
  onSelectChat,
  onOpenContextNew,
  onOpenContextDetail,
  onOpenMemories,
  onOpenConnectors,
}: SecondarySidebarProps) {
  const { storage } = useElectron()
  const [chats, setChats] = useState<ChatRow[]>([])

  useEffect(() => {
    void (async () => {
      try {
        const history = (await storage.get('chatHistory')) as ChatRow[] | null
        if (history) setChats(history)
      } catch (error) {
        console.error('Failed to load chat history:', error)
      }
    })()
  }, [storage, currentChatId, activeTabKind])

  const grouped = groupChats(chats)

  const primaryAction = () => {
    switch (activity) {
      case 'chat':
        onNewChat()
        break
      case 'context':
        onOpenContextNew()
        break
      case 'memories':
        onOpenMemories()
        break
      case 'connectors':
        onOpenConnectors()
        break
      default:
        break
    }
  }

  const primaryLabel =
    activity === 'chat'
      ? 'New Chat'
      : activity === 'context'
        ? 'New Context'
        : activity === 'memories'
          ? 'Open Memory'
          : activity === 'connectors'
            ? 'Open Connectors'
            : null

  return (
    <aside className="ui-secondary-sidebar">
      <div className="ui-secondary-sidebar__head">
        <h2 className="ui-secondary-sidebar__title ui-type-section-label">{SIDEBAR_HEAD[activity]}</h2>
      </div>

      <div className="ui-secondary-sidebar__subrow">
        {primaryLabel ? (
          <Button variant="primary" size="sm" className="w-full" onClick={primaryAction}>
            {primaryLabel}
          </Button>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {activity === 'chat' && (
          <>
            {Object.entries(grouped).map(([group, groupChats]) => (
              <div key={group} className="mb-2">
                <p className="ui-sidebar-subitem-group-label">{group}</p>
                <div className="space-y-1">
                  {groupChats.map(chat => (
                    <button
                      key={chat.id}
                      type="button"
                      onClick={() => onSelectChat(chat.id, chat.title || 'New Chat')}
                      className={`ui-sidebar-subitem w-full ${currentChatId === chat.id && activeTabKind === 'chat' ? 'ui-sidebar-subitem--current' : ''}`}
                    >
                      <span className="truncate">{chat.title || 'New Chat'}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {chats.length === 0 ? <p className="ui-secondary-sidebar__empty">No chat history yet</p> : null}
          </>
        )}

        {activity === 'context' && (
          <div className="space-y-1">
            {contexts.map(context => (
              <button
                key={context.id}
                type="button"
                onClick={() => onOpenContextDetail(context.id, context.name)}
                className={`ui-sidebar-subitem w-full ${activeTabKind === 'context-detail' ? '' : ''}`}
              >
                {context.name}
              </button>
            ))}
            {contexts.length === 0 ? <p className="ui-secondary-sidebar__empty">No contexts yet</p> : null}
          </div>
        )}

        {activity === 'memories' && (
          <p className="ui-secondary-sidebar__hint">
            User Memory and Learned Notes live in the Memory tab. Contexts appear in the inspector.
          </p>
        )}

        {activity === 'connectors' && (
          <p className="ui-secondary-sidebar__hint">
            Installed connectors and catalog browse open in the main workspace tab.
          </p>
        )}

        {activity === 'settings' && (
          <p className="ui-secondary-sidebar__hint">
            AI models, workspace, and app preferences open in the Settings tab.
          </p>
        )}
      </div>
    </aside>
  )
}
