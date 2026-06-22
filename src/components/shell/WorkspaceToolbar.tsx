import type { WorkspaceTab } from '../../shell/types'

interface WorkspaceToolbarProps {
  activeTab: WorkspaceTab
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

export default function WorkspaceToolbar({ activeTab }: WorkspaceToolbarProps) {
  const parts = breadcrumb(activeTab).split(' / ')

  return (
    <div className="ui-workspace-toolbar">
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
    </div>
  )
}
