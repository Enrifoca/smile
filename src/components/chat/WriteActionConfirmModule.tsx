import { PendingAction } from '../../agent/types'
import { Button } from '../ui/Button'
import { joinClasses } from '../ui/classNames'
import { defaultWriteActionBarLabels, type WriteActionBarLabels } from './writeActionConfirmDefaults'

export interface WriteActionConfirmModuleProps {
  action: PendingAction
  onApprove: () => void
  onReject: () => void
  /** Override button copy (see writeActionConfirmDefaults.ts) */
  labels?: WriteActionBarLabels
  /** Override primary button label; defaults to confirmation.approveLabel */
  resolveApproveLabel?: (action: PendingAction) => string
  className?: string
}

function defaultResolveApproveLabel(action: PendingAction): string {
  return action.confirmation?.approveLabel || defaultWriteActionBarLabels.approveLabel
}

/** Compact accept/refuse bar shown above the chat composer while a write action is pending. */
export function WriteActionConfirmModule({
  action,
  onApprove,
  onReject,
  labels: labelOverrides,
  resolveApproveLabel = defaultResolveApproveLabel,
  className,
}: WriteActionConfirmModuleProps) {
  const labels = { ...defaultWriteActionBarLabels, ...labelOverrides }
  const confirmation = action.confirmation
  const items = confirmation?.items

  return (
    <div className={joinClasses('ui-write-action-bar', className)} role="region" aria-label="Pending write action">
      {confirmation?.title ? (
        <p className="ui-write-action-bar-title">{confirmation.title}</p>
      ) : null}
      {items && items.length > 0 ? (
        <ul className="ui-write-action-bar-items">
          {items.map((item, index) => (
            <li key={`${item.title}-${index}`}>
              <span className="ui-write-action-bar-item-title">
                {item.badge ? `[${item.badge}] ` : ''}{item.title}
              </span>
              {item.subtitle ? (
                <span className="ui-write-action-bar-item-subtitle">{item.subtitle}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (confirmation?.preview || action.preview) ? (
        <p className="ui-write-action-bar-summary">
          {confirmation?.preview || action.preview}
        </p>
      ) : confirmation?.description ? (
        <p className="ui-write-action-bar-summary">{confirmation.description}</p>
      ) : null}
      <div className="ui-write-action-bar-actions">
        <Button variant="primary" size="sm" onClick={onApprove}>
          {resolveApproveLabel(action)}
        </Button>
        <Button variant="secondary" size="sm" onClick={onReject}>
          {labels.refuseLabel}
        </Button>
      </div>
    </div>
  )
}

export default WriteActionConfirmModule
