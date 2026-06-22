import type { ActivityId } from '../../shell/types'
import { ACTIVITY_ITEMS, SettingsActivityIcon } from './shellIcons'

interface ActivityBarProps {
  activity: ActivityId
  hasActiveContext: boolean
  onSelect: (activity: ActivityId) => void
}

export default function ActivityBar({ activity, hasActiveContext, onSelect }: ActivityBarProps) {
  return (
    <nav className="ui-activity-bar" aria-label="Primary navigation">
      {ACTIVITY_ITEMS.map(item => {
        const Icon = item.icon
        return (
          <button
            key={item.id}
            type="button"
            className={`ui-activity-bar__item ${activity === item.id ? 'ui-activity-bar__item--active' : ''}`}
            title={item.label}
            aria-label={item.label}
            aria-current={activity === item.id ? 'page' : undefined}
            onClick={() => onSelect(item.id)}
          >
            <Icon />
            {item.id === 'context' && hasActiveContext ? (
              <span className="ui-activity-bar__dot" aria-hidden />
            ) : null}
          </button>
        )
      })}
      <span className="ui-activity-bar__spacer" />
      <button
        type="button"
        className={`ui-activity-bar__item ${activity === 'settings' ? 'ui-activity-bar__item--active' : ''}`}
        title="Settings"
        aria-label="Settings"
        onClick={() => onSelect('settings')}
      >
        <SettingsActivityIcon />
      </button>
    </nav>
  )
}
