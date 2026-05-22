import { useState, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import ChatView from './components/ChatView'
import MemoriesView from './components/MemoriesView'
import SettingsView from './components/SettingsView'
import Onboarding from './components/Onboarding'
import ConnectorsView from './components/ConnectorsView'
import { useElectron } from './hooks/useElectron'

type View = 'chat' | 'memories' | 'connectors' | 'settings'

interface UserProfileStore {
  onboardingCompleted: boolean
}

const SidebarCollapseIcon = ({ collapsed }: { collapsed: boolean }) => (
  <svg className="transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    {collapsed ? (
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

function App() {
  const [currentView, setCurrentView] = useState<View>('chat')
  const [isLoading, setIsLoading] = useState(true)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [currentChatId, setCurrentChatId] = useState<string | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const { storage, windowControls } = useElectron()

  useEffect(() => {
    checkOnboarding()
  }, [])

  const checkOnboarding = async () => {
    try {
      const profile = await storage.get('userProfile') as UserProfileStore | null
      if (!profile || !profile.onboardingCompleted) {
        setShowOnboarding(true)
      }
    } catch (error) {
      console.error('Failed to check onboarding status:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleOnboardingComplete = () => {
    setShowOnboarding(false)
  }

  const handleSelectChat = (chatId: string) => {
    setCurrentChatId(chatId)
    setCurrentView('chat')
  }

  const handleNewChat = () => {
    setCurrentChatId(null)
    setCurrentView('chat')
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-white">
        <div className="loading-dots">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    )
  }

  if (showOnboarding) {
    return <Onboarding onComplete={handleOnboardingComplete} />
  }

  return (
    <div className="flex h-full bg-white">
      <Sidebar
        currentView={currentView}
        onNavigate={setCurrentView}
        onSelectChat={handleSelectChat}
        onNewChat={handleNewChat}
        currentChatId={currentChatId}
        collapsed={sidebarCollapsed}
      />

      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Drag region */}
        <div className="h-7 drag-region bg-white border-b-2 border-neutral-950 flex items-center justify-between px-2">
          <button
            type="button"
            onClick={() => setSidebarCollapsed(prev => !prev)}
            className="sidebar-collapse-button no-drag"
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <SidebarCollapseIcon collapsed={sidebarCollapsed} />
          </button>
          <div className="no-drag flex h-full items-center gap-1">
            <button
              type="button"
              onClick={windowControls.minimize}
              className="flex h-5 w-8 items-center justify-center rounded hover:bg-neutral-100"
              aria-label="Minimize window"
              title="Minimize"
            >
              <span className="h-px w-3 bg-neutral-950" />
            </button>
            <button
              type="button"
              onClick={windowControls.toggleMaximize}
              className="flex h-5 w-8 items-center justify-center rounded hover:bg-neutral-100"
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
        </div>

        <div className="flex-1 overflow-hidden">
          {currentView === 'chat' && (
            <ChatView
              chatId={currentChatId}
              onChatCreated={setCurrentChatId}
              onOpenSettings={() => setCurrentView('settings')}
            />
          )}
          {currentView === 'memories' && (
            <MemoriesView />
          )}
          {currentView === 'connectors' && (
            <ConnectorsView />
          )}
          {currentView === 'settings' && (
            <SettingsView onResetOnboarding={() => setShowOnboarding(true)} />
          )}
        </div>
      </main>
    </div>
  )
}

export default App
