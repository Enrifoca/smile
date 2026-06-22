import type { ActivityId } from '../../shell/types'

const NAV_ITEMS: Array<{ id: ActivityId; label: string }> = [
  { id: 'context', label: 'Contexts' },
  { id: 'memories', label: 'Memories' },
  { id: 'connectors', label: 'Connectors' },
  { id: 'settings', label: 'Settings' },
]

interface AppTitleBarProps {
  activity: ActivityId
  onNavigate: (activity: ActivityId) => void
  isMac: boolean
  showWindowControls: boolean
  onMinimize: () => void
  onToggleMaximize: () => void
  onClose: () => void
}

export default function AppTitleBar({
  activity,
  onNavigate,
  isMac,
  showWindowControls,
  onMinimize,
  onToggleMaximize,
  onClose,
}: AppTitleBarProps) {
  return (
    <header className={`ui-shell-titlebar ${isMac ? 'pl-16' : 'drag-region'}`}>
      <span className="ui-shell-titlebar__brand no-drag">
        smile<span className="ui-shell-titlebar__face">:D</span>
      </span>
      <nav className="ui-shell-titlebar__nav no-drag" aria-label="Main sections">
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            type="button"
            className={`ui-shell-titlebar__nav-item ${activity === item.id ? 'ui-shell-titlebar__nav-item--active' : ''}`}
            onClick={() => onNavigate(item.id)}
            aria-current={activity === item.id ? 'page' : undefined}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <span className="flex-1" />
      {showWindowControls ? (
        <div className="no-drag flex h-full items-center gap-1">
          <button
            type="button"
            onClick={onMinimize}
            className="flex h-5 w-8 items-center justify-center rounded ui-hover-surface"
            aria-label="Minimize window"
            title="Minimize"
          >
            <span className="h-px w-3 bg-neutral-950" />
          </button>
          <button
            type="button"
            onClick={onToggleMaximize}
            className="flex h-5 w-8 items-center justify-center rounded ui-hover-surface"
            aria-label="Maximize window"
            title="Maximize"
          >
            <span className="h-2.5 w-2.5 border border-neutral-950" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-5 w-8 items-center justify-center rounded hover:bg-red-500 hover:text-white"
            aria-label="Close window"
            title="Close"
          >
            <span className="ui-text-base leading-none">x</span>
          </button>
        </div>
      ) : null}
    </header>
  )
}
