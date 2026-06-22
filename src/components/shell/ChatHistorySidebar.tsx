import { useCallback, useEffect, useState } from 'react'
import { useElectron } from '../../hooks/useElectron'
import { CHAT_HISTORY_CHANGED } from '../../shell/chatHistoryEvents'
import { useChatActivity } from '../../chat/ChatActivityContext'
import { ChatLoadingDots } from '../chat/ChatLoadingDots'
import PanelCollapseIcon from './PanelCollapseIcon'

interface ChatRow {
  id: string
  title: string
  date: string
}

interface ChatHistorySidebarProps {
  open: boolean
  onToggleOpen: () => void
  currentChatId: string | null
  activeTabKind: string
  onNewChat: () => void
  onSelectChat: (chatId: string, title: string) => void
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

export default function ChatHistorySidebar({
  open,
  onToggleOpen,
  currentChatId,
  activeTabKind,
  onNewChat,
  onSelectChat,
}: ChatHistorySidebarProps) {
  const { storage } = useElectron()
  const [chats, setChats] = useState<ChatRow[]>([])
  const chatActivity = useChatActivity()
  void chatActivity.revision

  const loadChats = useCallback(async () => {
    try {
      const history = (await storage.get('chatHistory')) as ChatRow[] | null
      setChats(history ?? [])
    } catch (error) {
      console.error('Failed to load chat history:', error)
    }
  }, [storage])

  useEffect(() => {
    void loadChats()
  }, [loadChats, currentChatId, activeTabKind])

  useEffect(() => {
    const onHistoryChanged = () => {
      void loadChats()
    }
    window.addEventListener(CHAT_HISTORY_CHANGED, onHistoryChanged)
    return () => window.removeEventListener(CHAT_HISTORY_CHANGED, onHistoryChanged)
  }, [loadChats])

  const grouped = groupChats(chats)

  return (
    <aside className={`ui-chat-history-sidebar ${open ? '' : 'ui-chat-history-sidebar--collapsed'}`}>
      <div className="ui-chat-history-sidebar__head">
        {open ? <h2 className="ui-chat-history-sidebar__title">Chat History</h2> : <span className="flex-1" aria-hidden />}
        <button
          type="button"
          className="ui-panel-toggle ui-chrome-icon-btn"
          onClick={onToggleOpen}
          aria-label={open ? 'Hide chat history' : 'Show chat history'}
          title={open ? 'Hide chat history' : 'Show chat history'}
        >
          <PanelCollapseIcon expanded={open} side="left" />
        </button>
      </div>

      {open ? (
        <>
          <div className="ui-chat-history-sidebar__body">
            <div className="ui-chat-history-sidebar__scroll">
              <button type="button" className="ui-chat-history-sidebar__new-chat" onClick={onNewChat}>
                <span className="ui-chat-history-sidebar__new-chat-icon" aria-hidden>
                  +
                </span>
                New chat
              </button>
              {Object.entries(grouped).map(([group, groupChats]) => (
                <div key={group} className="mb-2">
                  <p className="ui-sidebar-subitem-group-label">{group}</p>
                  <div className="space-y-0.5">
                    {groupChats.map(chat => {
                      const isRunning = chatActivity.getActivity(chat.id)?.kind === 'running'
                      return (
                        <button
                          key={chat.id}
                          type="button"
                          onClick={() => onSelectChat(chat.id, chat.title || 'New Chat')}
                          className={`ui-sidebar-subitem w-full ${
                            currentChatId === chat.id && activeTabKind === 'chat' ? 'ui-sidebar-subitem--current' : ''
                          }`}
                        >
                          <span className="ui-sidebar-subitem__label">{chat.title || 'New Chat'}</span>
                          {isRunning ? (
                            <ChatLoadingDots className="ui-sidebar-subitem__spinner" aria-label="Agent working" />
                          ) : null}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
              {chats.length === 0 ? <p className="ui-chat-history-sidebar__empty">No chat history yet</p> : null}
            </div>
            <div className="ui-chat-history-sidebar__fade" aria-hidden />
          </div>
        </>
      ) : null}
    </aside>
  )
}
