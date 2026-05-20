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

function App() {
  const [currentView, setCurrentView] = useState<View>('chat')
  const [isLoading, setIsLoading] = useState(true)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [currentChatId, setCurrentChatId] = useState<string | null>(null)
  const { storage } = useElectron()

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
      />

      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Drag region */}
        <div className="h-7 drag-region bg-white border-b-2 border-neutral-950 flex items-center justify-end px-2">
          <div className="no-drag flex gap-1" />
        </div>

        <div className="flex-1 overflow-hidden">
          {currentView === 'chat' && (
            <ChatView
              chatId={currentChatId}
              onChatCreated={setCurrentChatId}
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
