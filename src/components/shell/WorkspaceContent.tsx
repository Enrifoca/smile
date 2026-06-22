import type { WorkspaceTab } from '../../shell/types'
import ChatView from '../ChatView'
import MemoriesView from '../MemoriesView'
import SettingsView from '../SettingsView'
import ConnectorsView from '../ConnectorsView'
import ContextHomeView from '../ContextHomeView'
import ContextNewView from '../ContextNewView'
import ContextDetailView from '../ContextDetailView'
import type { ProjectContext } from '../../context/types'
import type { AgentContextSnapshot } from '../../agent'

interface WorkspaceContentProps {
  tabs: WorkspaceTab[]
  activeTab: WorkspaceTab
  contexts: ProjectContext[]
  activeContextId: string | null
  pinnedReportPath: string | null
  onChatCreated: (tabId: string, chatId: string, title: string) => void
  onOpenSettings: () => void
  onContextsChange: (contexts: ProjectContext[]) => void
  onSetActiveContextId: (contextId: string | null) => void
  onOpenContextDetail: (contextId: string, name: string) => void
  onNewContext: () => void
  onCancelContextNew: () => void
  onBackFromContextDetail: () => void
  onContextSnapshot?: (tabId: string, snapshot: AgentContextSnapshot) => void
}

export default function WorkspaceContent({
  tabs,
  activeTab,
  contexts,
  activeContextId,
  pinnedReportPath,
  onChatCreated,
  onOpenSettings,
  onContextsChange,
  onSetActiveContextId,
  onOpenContextDetail,
  onNewContext,
  onCancelContextNew,
  onBackFromContextDetail,
  onContextSnapshot,
}: WorkspaceContentProps) {
  const activeContext = contexts.find(context => context.id === activeContextId) ?? null
  const chatTabs = tabs.filter(tab => tab.kind === 'chat')

  return (
    <div className="ui-workspace-content h-full relative">
      {chatTabs.map(tab => {
        const isVisible = activeTab.kind === 'chat' && activeTab.id === tab.id
        return (
          <div
            key={tab.id}
            className={`absolute inset-0 flex h-full w-full min-w-0 flex-col ${isVisible ? '' : 'hidden'}`}
            aria-hidden={!isVisible}
          >
            <ChatView
              chatId={tab.chatId ?? null}
              isVisible={isVisible}
              onChatCreated={(chatId, title) => onChatCreated(tab.id, chatId, title)}
              onOpenSettings={onOpenSettings}
              activeContext={activeContext}
              pinnedReportPath={pinnedReportPath}
              onContextSnapshot={snapshot => onContextSnapshot?.(tab.id, snapshot)}
            />
          </div>
        )
      })}

      {activeTab.kind === 'memories' ? (
        <div className="h-full">
          <MemoriesView />
        </div>
      ) : null}

      {activeTab.kind === 'connectors' ? (
        <div className="h-full">
          <ConnectorsView />
        </div>
      ) : null}

      {activeTab.kind === 'settings' ? (
        <div className="h-full">
          <SettingsView onContextsChange={onContextsChange} />
        </div>
      ) : null}

      {activeTab.kind === 'context-home' ? (
        <div className="h-full">
          <ContextHomeView
            contexts={contexts}
            activeContextId={activeContextId}
            onSetActiveContextId={onSetActiveContextId}
            onOpenContextDetail={onOpenContextDetail}
            onNewContext={onNewContext}
          />
        </div>
      ) : null}

      {activeTab.kind === 'context-new' ? (
        <div className="h-full">
          <ContextNewView
            onContextsChange={onContextsChange}
            onOpenContext={id => onOpenContextDetail(id, contexts.find(c => c.id === id)?.name ?? 'Context')}
            onCancel={onCancelContextNew}
          />
        </div>
      ) : null}

      {activeTab.kind === 'context-detail' && activeTab.contextId ? (
        <div className="h-full">
          <ContextDetailView
            contextId={activeTab.contextId}
            onContextsChange={onContextsChange}
            onActiveContextChange={onSetActiveContextId}
            activeContextId={activeContextId}
            onBack={onBackFromContextDetail}
          />
        </div>
      ) : null}
    </div>
  )
}
