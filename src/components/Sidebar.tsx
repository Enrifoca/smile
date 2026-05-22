import { useState, useEffect } from 'react'
import { useElectron } from '../hooks/useElectron'

interface Chat {
  id: string
  title: string
  date: string
}

interface SidebarProps {
  currentView: 'chat' | 'memories' | 'connectors' | 'settings'
  onNavigate: (view: 'chat' | 'memories' | 'connectors' | 'settings') => void
  onSelectChat: (chatId: string) => void
  onNewChat: () => void
  currentChatId: string | null
  collapsed: boolean
}

// Icons as simple SVG components
const ChatIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
  </svg>
)

const SettingsIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
)

const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg 
    className={`w-4 h-4 transition-transform ${open ? 'rotate-90' : ''}`} 
    fill="none" 
    stroke="currentColor" 
    viewBox="0 0 24 24"
  >
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
)

const MemoriesIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
  </svg>
)

const ConnectorsIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.5 13.5l3-3m-6 1.5l-1.5 1.5a3 3 0 104.243 4.243l1.5-1.5m4.5-4.5l1.5-1.5A3 3 0 1013.5 6l-1.5 1.5" />
  </svg>
)

const PlusIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14m7-7H5" />
  </svg>
)

export default function Sidebar({ 
  currentView, 
  onNavigate, 
  onSelectChat, 
  onNewChat,
  currentChatId,
  collapsed,
}: SidebarProps) {
  const [chatHistoryOpen, setChatHistoryOpen] = useState(true)
  const [chats, setChats] = useState<Chat[]>([])
  const { storage } = useElectron()

  useEffect(() => {
    loadChats()
  }, [currentChatId])

  const loadChats = async () => {
    try {
      const history = await storage.get('chatHistory') as Chat[] | null
      if (history) {
        setChats(history)
      }
    } catch (error) {
      console.error('Failed to load chat history:', error)
    }
  }

  // Group chats by date
  const groupedChats = chats.reduce((groups, chat) => {
    const date = new Date(chat.date)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    let group = 'Older'
    if (date.toDateString() === today.toDateString()) {
      group = 'Today'
    } else if (date.toDateString() === yesterday.toDateString()) {
      group = 'Yesterday'
    } else if (date > new Date(today.setDate(today.getDate() - 7))) {
      group = 'This Week'
    }

    if (!groups[group]) {
      groups[group] = []
    }
    groups[group].push(chat)
    return groups
  }, {} as Record<string, Chat[]>)

  return (
    <aside className={`app-sidebar ${collapsed ? 'collapsed' : ''} relative bg-white border-r-2 border-neutral-950 flex flex-col h-full transition-[width] duration-200`}>
      {/* Drag region for macOS */}
      <div className="h-7 drag-region border-b-2 border-neutral-950 px-2 text-center text-sm font-medium flex items-center justify-center">
        <span className="truncate">{collapsed ? ':D' : 'smile:D'}</span>
      </div>

      {/* New Chat Button */}
      <div className="p-4 pb-3">
        <button
          onClick={onNewChat}
          className="new-chat-button btn-primary w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors"
          title="New Chat"
        >
          <PlusIcon />
          {!collapsed && <span>New Chat</span>}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-4 py-2 space-y-1">
        {/* Agent Memory */}
        <button
          onClick={() => onNavigate('memories')}
          className={`sidebar-item w-full ${collapsed ? 'justify-center px-0' : ''} ${currentView === 'memories' ? 'active' : ''}`}
          title="Agent Memory"
        >
          <MemoriesIcon />
          {!collapsed && <span>Agent Memory</span>}
        </button>

        <button
          onClick={() => onNavigate('connectors')}
          className={`sidebar-item w-full ${collapsed ? 'justify-center px-0' : ''} ${currentView === 'connectors' ? 'active' : ''}`}
          title="Connectors"
        >
          <ConnectorsIcon />
          {!collapsed && <span>Connectors</span>}
        </button>

        {/* Chat History Accordion */}
        <div>
          <button
            onClick={() => collapsed ? onNavigate('chat') : setChatHistoryOpen(!chatHistoryOpen)}
            className={`sidebar-item w-full ${collapsed ? 'justify-center px-0' : ''}`}
            title="Chat History"
          >
            <ChatIcon />
            {!collapsed && (
              <>
                <span>Chat History</span>
                <ChevronIcon open={chatHistoryOpen} />
              </>
            )}
          </button>

          {!collapsed && chatHistoryOpen && (
            <div className="ml-4 mt-1 space-y-1">
              {Object.entries(groupedChats).map(([group, groupChats]) => (
                <div key={group}>
                  <p className="text-xs text-gray-500 px-3 py-1">{group}</p>
                  {groupChats.map(chat => (
                    <button
                      key={chat.id}
                      onClick={() => onSelectChat(chat.id)}
                      className={`w-full text-left px-3 py-1.5 text-sm rounded-lg truncate ${
                        currentChatId === chat.id
                          ? 'bg-neutral-100 text-neutral-950'
                          : 'text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {chat.title || 'New Chat'}
                    </button>
                  ))}
                </div>
              ))}
              {chats.length === 0 && (
                <p className="text-xs text-gray-400 px-3 py-2">No chat history yet</p>
              )}
            </div>
          )}
        </div>
      </nav>

      {/* Settings */}
      <div className="p-4">
        <button
          onClick={() => onNavigate('settings')}
          className={`sidebar-item w-full ${collapsed ? 'justify-center px-0' : ''} ${currentView === 'settings' ? 'active' : ''}`}
          title="Settings"
        >
          <SettingsIcon />
          {!collapsed && <span>Settings</span>}
        </button>
      </div>
    </aside>
  )
}
