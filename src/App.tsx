import { useCallback, useState, useEffect } from 'react'
import { AppShell } from './components/shell'
import { Spinner } from './components/ui'
import { UpdateToast } from './components/UpdateToast'
import { UpdateProvider } from './context/UpdateContext'
import { ChatActivityProvider } from './chat/ChatActivityContext'
import { useElectron } from './hooks/useElectron'
import { useWorkspaceTabs } from './shell/useWorkspaceTabs'
import type { ProjectContext } from './context/types'

function areContextListsEqual(previous: ProjectContext[], next: ProjectContext[]) {
  if (previous.length !== next.length) return false
  return previous.every((context, index) => {
    const nextContext = next[index]
    return nextContext
      && context.id === nextContext.id
      && context.name === nextContext.name
      && context.slug === nextContext.slug
      && context.updatedAt === nextContext.updatedAt
  })
}

function App() {
  const [isLoading, setIsLoading] = useState(true)
  const [activeContextId, setActiveContextId] = useState<string | null>(null)
  const [contexts, setContexts] = useState<ProjectContext[]>([])

  const workspace = useWorkspaceTabs()
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
      const loadedContexts = ctxResult.success && ctxResult.data ? ctxResult.data : []
      setContexts(loadedContexts)
      if (storedActiveId && loadedContexts.some(context => context.id === storedActiveId)) {
        setActiveContextId(storedActiveId)
      } else if (storedActiveId) {
        setActiveContextId(null)
        void storage.set('activeContextId', null)
      }
    } catch (error) {
      console.error('Failed to load app state:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSetActiveContextId = useCallback(async (contextId: string | null) => {
    setActiveContextId(contextId)
    try {
      await storage.set('activeContextId', contextId)
    } catch (error) {
      console.error('Failed to save active context:', error)
    }
  }, [storage])

  const handleContextsChange = useCallback((nextContexts: ProjectContext[]) => {
    setContexts(previous => areContextListsEqual(previous, nextContexts) ? previous : nextContexts)
    setActiveContextId(prev => {
      if (prev && !nextContexts.some(context => context.id === prev)) {
        void storage.set('activeContextId', null)
        return null
      }
      return prev
    })
  }, [storage])

  useEffect(() => {
    const refreshContexts = async () => {
      try {
        const result = await contextsAPI.list()
        if (result.success && result.data) handleContextsChange(result.data)
      } catch (error) {
        console.error('Failed to refresh contexts:', error)
      }
    }

    window.addEventListener('focus', refreshContexts)
    return () => window.removeEventListener('focus', refreshContexts)
  }, [contextsAPI, handleContextsChange])

  if (isLoading) {
    return (
      <div className="flex h-full flex-col bg-white">
        {isMac ? <div className="mac-titlebar" /> : null}
        <div className="flex flex-1 items-center justify-center">
          <Spinner size="lg" />
        </div>
      </div>
    )
  }

  return (
    <UpdateProvider>
      <ChatActivityProvider>
        <AppShell
          workspace={workspace}
          contexts={contexts}
          activeContextId={activeContextId}
          onSetActiveContextId={handleSetActiveContextId}
          onContextsChange={handleContextsChange}
          isMac={isMac}
          showWindowControls={showCustomWindowControls}
          onMinimize={windowControls.minimize}
          onToggleMaximize={windowControls.toggleMaximize}
          onClose={windowControls.close}
        >
          <UpdateToast />
        </AppShell>
      </ChatActivityProvider>
    </UpdateProvider>
  )
}

export default App
