import { useState, type ReactNode } from 'react'
import MacWindowChrome from '../MacWindowChrome'
import AppTitleBar from './AppTitleBar'
import ChatHistorySidebar from './ChatHistorySidebar'
import WorkspaceTabBar from './WorkspaceTabBar'
import WorkspaceToolbar from './WorkspaceToolbar'
import WorkspaceContent from './WorkspaceContent'
import InspectorPanel from './InspectorPanel'
import StatusBar from './StatusBar'
import type { WorkspaceTabsApi } from '../../shell/useWorkspaceTabs'
import type { ActivityId } from '../../shell/types'
import type { ProjectContext } from '../../context/types'
import type { AgentContextSnapshot } from '../../agent'

interface AppShellProps {
  workspace: WorkspaceTabsApi
  contexts: ProjectContext[]
  activeContextId: string | null
  onSetActiveContextId: (contextId: string | null) => void
  onContextsChange: (contexts: ProjectContext[]) => void
  isMac: boolean
  showWindowControls: boolean
  onMinimize: () => void
  onToggleMaximize: () => void
  onClose: () => void
  children?: ReactNode
}

export default function AppShell({
  workspace,
  contexts,
  activeContextId,
  onSetActiveContextId,
  onContextsChange,
  isMac,
  showWindowControls,
  onMinimize,
  onToggleMaximize,
  onClose,
  children,
}: AppShellProps) {
  const [chatSidebarOpen, setChatSidebarOpen] = useState(true)
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const [pinnedReportPath, setPinnedReportPath] = useState<string | null>(null)
  const [contextSnapshots, setContextSnapshots] = useState<Map<string, AgentContextSnapshot>>(new Map())

  const {
    tabs,
    activeTabId,
    activeTab,
    activity,
    setActivity,
    focusTab,
    openChat,
    openContextDetail,
    openContextNew,
    openOrFocus,
    closeTab,
    updateTab,
  } = workspace

  const activeContext = contexts.find(c => c.id === activeContextId) ?? null

  const handleNavigate = (next: ActivityId) => {
    setActivity(next)
  }

  const handleNewChat = () => {
    openChat(null, 'New Chat')
  }

  const handleSelectChat = (chatId: string, title: string) => {
    openChat(chatId, title)
  }

  const handleChatCreated = (tabId: string, chatId: string, title: string) => {
    updateTab(tabId, { chatId, title })
  }

  const handleContextSnapshot = (tabId: string, snapshot: AgentContextSnapshot) => {
    setContextSnapshots(prev => new Map(prev).set(tabId, snapshot))
  }

  const activeContextSnapshot = activeTabId ? contextSnapshots.get(activeTabId) ?? null : null

  const handleSetActiveReport = (path: string | null) => {
    if (path && activeTab.kind !== 'chat') {
      openChat(null, 'New Chat')
    }
    setPinnedReportPath(path)
  }

  return (
    <div className="flex h-full flex-col bg-white">
      {isMac ? <MacWindowChrome /> : null}
      <AppTitleBar
        activity={activity}
        onNavigate={handleNavigate}
        isMac={isMac}
        showWindowControls={showWindowControls}
        onMinimize={onMinimize}
        onToggleMaximize={onToggleMaximize}
        onClose={onClose}
      />
      <div className="ui-shell-body">
        <ChatHistorySidebar
          open={chatSidebarOpen}
          onToggleOpen={() => setChatSidebarOpen(open => !open)}
          currentChatId={activeTab.kind === 'chat' ? activeTab.chatId ?? null : null}
          activeTabKind={activeTab.kind}
          onNewChat={handleNewChat}
          onSelectChat={handleSelectChat}
        />
        <main className="ui-workspace">
          <div className="ui-workspace-chrome">
            <WorkspaceTabBar
              tabs={tabs}
              activeTabId={activeTabId}
              onSelectTab={focusTab}
              onCloseTab={closeTab}
              onNewChatTab={handleNewChat}
            />
          </div>
          <WorkspaceToolbar activeTab={activeTab} activeContext={activeContext} contextSnapshot={activeContextSnapshot} />
          <WorkspaceContent
            tabs={tabs}
            activeTab={activeTab}
            contexts={contexts}
            activeContextId={activeContextId}
            pinnedReportPath={pinnedReportPath}
            onChatCreated={handleChatCreated}
            onOpenSettings={() => openOrFocus({ kind: 'settings' })}
            onContextsChange={onContextsChange}
            onSetActiveContextId={onSetActiveContextId}
            onOpenContextDetail={openContextDetail}
            onNewContext={openContextNew}
            onCancelContextNew={() => focusTab(tabs.find(t => t.kind === 'context-home')?.id ?? activeTabId)}
            onBackFromContextDetail={() => setActivity('context')}
            onContextSnapshot={handleContextSnapshot}
          />
        </main>
        <InspectorPanel
          open={inspectorOpen}
          onToggleOpen={() => setInspectorOpen(open => !open)}
          contexts={contexts}
          activeContextId={activeContextId}
          onContextsChange={onContextsChange}
          onSetActiveContextId={onSetActiveContextId}
          onOpenContextDetail={openContextDetail}
          onSetActiveReport={(path, _title) => handleSetActiveReport(path)}
          activeReportPath={pinnedReportPath}
        />
      </div>
      <StatusBar />
      {children}
    </div>
  )
}
