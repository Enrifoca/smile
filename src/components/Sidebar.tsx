import { useState, useEffect } from 'react'

import { useElectron } from '../hooks/useElectron'

import type { ProjectContext } from '../context/types'

import { Toggle } from './ui'
import { ChevronIcon } from './ui/ChevronIcon'



interface Chat {

  id: string

  title: string

  date: string

}



export type SidebarView = 'chat' | 'memories' | 'connectors' | 'settings' | 'context-new' | 'context-detail'



interface SidebarProps {

  currentView: SidebarView

  contextDetailId: string | null

  onNavigate: (view: SidebarView, contextId?: string) => void

  onSelectChat: (chatId: string) => void

  onNewChat: () => void

  currentChatId: string | null

  collapsed: boolean

  onToggleCollapsed: () => void

  activeContextId: string | null

  onSetActiveContextId: (contextId: string | null) => void

  contexts: ProjectContext[]

  onContextsChange: (contexts: ProjectContext[]) => void

}



const SidebarCollapseIcon = ({ expand }: { expand: boolean }) => (

  <svg

    className="sidebar-collapse-icon"

    fill="none"

    stroke="currentColor"

    viewBox="0 0 24 24"

    aria-hidden

  >

    {expand ? (

      <>

        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 5l7 7-7 7" />

        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7" />

      </>

    ) : (

      <>

        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7" />

        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 19l-7-7 7-7" />

      </>

    )}

  </svg>

)



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



const ContextIcon = () => (

  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">

    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />

  </svg>

)



const PlusIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14m7-7H5" />
  </svg>
)



export default function Sidebar({ 

  currentView, 

  contextDetailId,

  onNavigate, 

  onSelectChat, 

  onNewChat,

  currentChatId,

  collapsed,

  onToggleCollapsed,

  activeContextId,

  onSetActiveContextId,

  contexts,

  onContextsChange,

}: SidebarProps) {

  const [chatHistoryOpen, setChatHistoryOpen] = useState(true)

  const [contextMenuOpen, setContextMenuOpen] = useState(true)

  const [chats, setChats] = useState<Chat[]>([])

  const { storage, platform, contexts: contextsAPI } = useElectron()

  const isMac = platform === 'darwin'



  useEffect(() => {

    loadChats()

  }, [currentChatId])



  useEffect(() => {

    void loadContexts()

  }, [currentView, contextDetailId])



  useEffect(() => {
    if (currentView === 'context-new' || currentView === 'context-detail') {
      setContextMenuOpen(true)
    }
  }, [currentView])



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



  const loadContexts = async () => {

    try {

      const result = await contextsAPI.list()

      if (result.success && result.data) onContextsChange(result.data)

    } catch (error) {

      console.error('Failed to load contexts:', error)

    }

  }



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



  const contextViewActive = currentView === 'context-new' || currentView === 'context-detail'



  const handleContextToggle = (contextId: string, enabled: boolean) => {
    if (enabled) {
      onSetActiveContextId(contextId)
      return
    }
    if (activeContextId === contextId) {
      onSetActiveContextId(null)
    }
  }



  return (

    <aside className={`app-sidebar ${collapsed ? 'collapsed' : ''} relative bg-white border-r-2 border-neutral-950 flex flex-col h-full transition-[width] duration-200`}>

      {collapsed ? (

        <button

          type="button"

          onClick={onToggleCollapsed}

          className="sidebar-brand sidebar-brand--collapsed h-7 border-b-2 border-neutral-950 text-sm font-medium no-drag"

          title="Expand sidebar"

          aria-label="Expand sidebar"

        >

          <span className="sidebar-brand-mark">:D</span>

          <span className="sidebar-brand-expand-icon" aria-hidden="true">

            <SidebarCollapseIcon expand />

          </span>

        </button>

      ) : (

        <div

          className={`sidebar-brand h-7 border-b-2 border-neutral-950 px-2 text-sm font-medium flex items-center ${

            isMac ? '' : 'drag-region'

          }`}

        >

          <div className="sidebar-brand-spacer shrink-0" aria-hidden="true" />

          <span className="sidebar-brand-title truncate flex-1 text-center">smile:D</span>

          <button

            type="button"

            onClick={onToggleCollapsed}

            className="sidebar-collapse-button no-drag shrink-0"

            title="Collapse sidebar"

            aria-label="Collapse sidebar"

          >

            <SidebarCollapseIcon expand={false} />

          </button>

        </div>

      )}



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



      <nav className="flex-1 overflow-y-auto px-4 py-2 space-y-1">

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



        <div>

          <button

            onClick={() => collapsed ? onNavigate('context-new') : setContextMenuOpen(!contextMenuOpen)}

            className={`sidebar-item w-full ${collapsed ? 'justify-center px-0' : ''} ${contextViewActive ? 'active' : ''}`}

            title="Context"

          >

            <ContextIcon />

            {!collapsed && (

              <>

                <span className="inline-flex min-w-0 flex-1 items-center gap-2">

                  Context

                  {activeContextId ? <span className="ui-context-active-dot" title="Context active" aria-label="Context active" /> : null}

                </span>

                <ChevronIcon open={contextMenuOpen} />

              </>

            )}

          </button>



          {!collapsed && contextMenuOpen && (
            <div className="ui-sidebar-subitem-group">
              <button
                type="button"
                onClick={() => onNavigate('context-new')}
                className={`ui-sidebar-subitem ui-sidebar-context-row ui-sidebar-context-row--button ${currentView === 'context-new' ? 'ui-sidebar-subitem--current' : ''}`}
              >
                New context
              </button>

              {contexts.map(context => {
                const isActive = activeContextId === context.id
                const isOpenPage = currentView === 'context-detail' && contextDetailId === context.id
                return (
                  <div
                    key={context.id}
                    className={`ui-sidebar-subitem ui-sidebar-context-row ${isOpenPage ? 'ui-sidebar-subitem--current' : ''}`}
                  >
                    <button
                      type="button"
                      className={`ui-sidebar-context-name ${isActive ? 'ui-sidebar-context-name--active' : ''}`}
                      onClick={() => onNavigate('context-detail', context.id)}
                    >
                      {context.name}
                    </button>
                    <div
                      className="ui-sidebar-context-toggle-cell"
                      role="switch"
                      aria-checked={isActive}
                      aria-label={`Activate ${context.name}`}
                      tabIndex={0}
                      onClick={event => {
                        event.stopPropagation()
                        handleContextToggle(context.id, !isActive)
                      }}
                      onKeyDown={event => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          event.stopPropagation()
                          handleContextToggle(context.id, !isActive)
                        }
                      }}
                    >
                      <Toggle
                        checked={isActive}
                        onChange={event => handleContextToggle(context.id, event.target.checked)}
                        label={`Activate ${context.name}`}
                        className="ui-toggle--compact shrink-0 pointer-events-none"
                        tabIndex={-1}
                        aria-hidden
                      />
                    </div>
                  </div>
                )
              })}

              {contexts.length === 0 && (
                <p className="text-xs text-gray-400 px-3 py-2">No contexts yet</p>
              )}
            </div>
          )}

        </div>



        <div>

          <button

            onClick={() => collapsed ? onNavigate('chat') : setChatHistoryOpen(!chatHistoryOpen)}

            className={`sidebar-item w-full ${collapsed ? 'justify-center px-0' : ''}`}

            title="Chat History"

          >

            <ChatIcon />

            {!collapsed && (

              <>

                <span className="flex-1 text-left">Chat History</span>

                <ChevronIcon open={chatHistoryOpen} />

              </>

            )}

          </button>



          {!collapsed && chatHistoryOpen && (
            <div className="ui-sidebar-subitem-group">
              {Object.entries(groupedChats).map(([group, groupChats]) => (
                <div key={group} className="space-y-1">
                  <p className="ui-sidebar-subitem-group-label">{group}</p>
                  <div className="space-y-1">
                    {groupChats.map(chat => (
                      <button
                        key={chat.id}
                        onClick={() => onSelectChat(chat.id)}
                        className={`ui-sidebar-subitem truncate ${currentView === 'chat' && currentChatId === chat.id ? 'ui-sidebar-subitem--current' : ''}`}
                      >
                        {chat.title || 'New Chat'}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {chats.length === 0 && (

                <p className="text-xs text-gray-400 px-3 py-2">No chat history yet</p>

              )}

            </div>

          )}

        </div>

      </nav>



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

