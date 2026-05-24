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

  return (
    <div className={joinClasses('ui-write-action-bar', className)} role="region" aria-label="Pending write action">
      {(action.confirmation?.preview || action.preview) ? (
        <p className="ui-write-action-bar-summary">
          {action.confirmation?.preview || action.preview}
        </p>
      ) : null}
      <div className="ui-write-action-bar-actions">
        <Button variant="primary" size="sm" onClick={onApprove}>
          {resolveApproveLabel(action)}
        </Button>
        <Button variant="outline" size="sm" onClick={onReject}>
          {labels.refuseLabel}
        </Button>
      </div>
    </div>
  )
}

export default WriteActionConfirmModule
