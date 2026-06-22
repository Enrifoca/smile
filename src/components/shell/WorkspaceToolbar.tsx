import { useState } from 'react'
import type { WorkspaceTab } from '../../shell/types'
import type { ProjectContext } from '../../context/types'
import type { AgentContextSnapshot } from '../../agent'
import { ContextSummaryModal } from './ContextSummaryModal'

interface WorkspaceToolbarProps {
  activeTab: WorkspaceTab
  activeContext: ProjectContext | null
  contextSnapshot?: AgentContextSnapshot | null
}

function breadcrumb(tab: WorkspaceTab): string {
  switch (tab.kind) {
    case 'chat':
      return `Chat / ${tab.title}`
    case 'connectors':
      return 'Connectors'
    case 'settings':
      return 'Settings'
    case 'memories':
      return 'Memory'
    case 'context-home':
      return 'Contexts'
    case 'context-new':
      return 'Contexts / New'
    case 'context-detail':
      return `Contexts / ${tab.title}`
    default:
      return tab.title
  }
}

function ContextBadgeIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
      />
    </svg>
  )
}

export default function WorkspaceToolbar({ activeTab, activeContext, contextSnapshot }: WorkspaceToolbarProps) {
  const parts = breadcrumb(activeTab).split(' / ')
  const [contextOpen, setContextOpen] = useState(false)
  const isChat = activeTab.kind === 'chat'

  return (
    <>
      <div className="ui-workspace-toolbar flex items-center justify-between">
        <span>
          {parts.map((part, index) => (
            <span key={`${part}-${index}`}>
              {index > 0 ? <span className="ui-workspace-toolbar__sep">/</span> : null}
              {index === parts.length - 1 ? (
                <span className="ui-workspace-toolbar__strong">{part}</span>
              ) : (
                <span>{part}</span>
              )}
            </span>
          ))}
        </span>

        {isChat && (
          <button
            type="button"
            onClick={() => setContextOpen(true)}
            className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-neutral-500 transition-colors ui-hover-surface hover:text-neutral-800"
            title="Chat context"
            aria-label="Chat context"
          >
            <ContextBadgeIcon />
          </button>
        )}
      </div>

      {contextOpen && (
        <ContextSummaryModal activeContext={activeContext} contextSnapshot={contextSnapshot ?? null} onClose={() => setContextOpen(false)} />
      )}
    </>
  )
}
