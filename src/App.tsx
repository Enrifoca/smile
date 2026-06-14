import { useState, useEffect, useMemo, type ReactNode } from 'react'



import Sidebar, { type SidebarView } from './components/Sidebar'

import ChatView from './components/ChatView'

import MemoriesView from './components/MemoriesView'

import SettingsView from './components/SettingsView'

import ConnectorsView from './components/ConnectorsView'

import ContextDetailView from './components/ContextDetailView'

import { Spinner } from './components/ui'

import ContextNewView from './components/ContextNewView'

import MacWindowChrome from './components/MacWindowChrome'
import { UpdateToast } from './components/UpdateToast'
import { UpdateProvider } from './context/UpdateContext'

import { useElectron } from './hooks/useElectron'

import type { ProjectContext } from './context/types'



function App() {

  const [currentView, setCurrentView] = useState<SidebarView>('chat')

  const [contextDetailId, setContextDetailId] = useState<string | null>(null)

  const [isLoading, setIsLoading] = useState(true)

  const [currentChatId, setCurrentChatId] = useState<string | null>(null)

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const [activeContextId, setActiveContextId] = useState<string | null>(null)

  const [contexts, setContexts] = useState<ProjectContext[]>([])

  const { storage, windowControls, platform, contexts: contextsAPI } = useElectron()

  const isMac = platform === 'darwin'

  const showCustomWindowControls = !isMac



  useEffect(() => {

    void loadInitialState()

  }, [])



  const loadInitialState = async () => {

    try {

      const [storedActiveId, ctxResult] = await Promise.all([

        storage.get('activeContextId') as Promise<string | null>,

        contextsAPI.list(),

      ])

      if (storedActiveId) setActiveContextId(storedActiveId)

      if (ctxResult.success && ctxResult.data) setContexts(ctxResult.data)

    } catch (error) {

      console.error('Failed to load app state:', error)

    } finally {

      setIsLoading(false)

    }

  }



  const activeContext = useMemo(

    () => contexts.find(context => context.id === activeContextId) ?? null,

    [contexts, activeContextId],

  )



  const handleSetActiveContextId = async (contextId: string | null) => {

    setActiveContextId(contextId)

    try {

      await storage.set('activeContextId', contextId)

    } catch (error) {

      console.error('Failed to save active context:', error)

    }

  }



  const handleNavigate = (view: SidebarView, contextId?: string) => {

    setCurrentView(view)

    if (view === 'context-detail' && contextId) {

      setContextDetailId(contextId)

    } else if (view !== 'context-detail') {

      setContextDetailId(null)

    }

  }



  const handleSelectChat = (chatId: string) => {

    setCurrentChatId(chatId)

    setCurrentView('chat')

  }



  const handleNewChat = () => {

    setCurrentChatId(null)

    setCurrentView('chat')

  }



  const shell = (content: ReactNode) => (

    <div className="flex h-full flex-col bg-white">

      {isMac && <MacWindowChrome />}

      <div className="flex flex-1 min-h-0 overflow-hidden">{content}</div>

    </div>

  )



  if (isLoading) {

    return shell(

      <div className="flex flex-1 items-center justify-center">

        <Spinner size="lg" />

      </div>,

    )

  }



  return shell(

    <UpdateProvider>

      <>

      <Sidebar

        currentView={currentView}

        contextDetailId={contextDetailId}

        onNavigate={handleNavigate}

        onSelectChat={handleSelectChat}

        onNewChat={handleNewChat}

        currentChatId={currentChatId}

        collapsed={sidebarCollapsed}

        onToggleCollapsed={() => setSidebarCollapsed(prev => !prev)}

        activeContextId={activeContextId}

        onSetActiveContextId={handleSetActiveContextId}

        contexts={contexts}

        onContextsChange={setContexts}

      />



      <main className="flex-1 flex flex-col overflow-hidden">

        <div className="h-7 drag-region bg-white border-b-2 border-neutral-950 flex items-center justify-end px-2">

          {showCustomWindowControls && (

            <div className="no-drag flex h-full items-center gap-1">

              <button

                type="button"

                onClick={windowControls.minimize}

                className="flex h-5 w-8 items-center justify-center rounded ui-hover-surface"

                aria-label="Minimize window"

                title="Minimize"

              >

                <span className="h-px w-3 bg-neutral-950" />

              </button>

              <button

                type="button"

                onClick={windowControls.toggleMaximize}

                className="flex h-5 w-8 items-center justify-center rounded ui-hover-surface"

                aria-label="Maximize window"

                title="Maximize"

              >

                <span className="h-2.5 w-2.5 border border-neutral-950" />

              </button>

              <button

                type="button"

                onClick={windowControls.close}

                className="flex h-5 w-8 items-center justify-center rounded hover:bg-red-500 hover:text-white"

                aria-label="Close window"

                title="Close"

              >

                <span className="text-sm leading-none">x</span>

              </button>

            </div>

          )}

        </div>



        <div className="flex-1 overflow-hidden">

          {currentView === 'chat' && (

            <ChatView

              chatId={currentChatId}

              onChatCreated={setCurrentChatId}

              onOpenSettings={() => setCurrentView('settings')}

              activeContext={activeContext}

            />

          )}

          {currentView === 'memories' && <MemoriesView />}

          {currentView === 'connectors' && <ConnectorsView />}

          {currentView === 'context-new' && (

            <ContextNewView

              onContextsChange={setContexts}

              onOpenContext={id => handleNavigate('context-detail', id)}

              onCancel={() => setCurrentView('chat')}

            />

          )}

          {currentView === 'context-detail' && contextDetailId && (

            <ContextDetailView

              contextId={contextDetailId}

              onContextsChange={setContexts}

              onActiveContextChange={handleSetActiveContextId}

              activeContextId={activeContextId}

              onBack={() => setCurrentView('chat')}

            />

          )}

          {currentView === 'settings' && <SettingsView />}

        </div>

      </main>

      <UpdateToast />

      </>

    </UpdateProvider>,

  )

}



export default App

