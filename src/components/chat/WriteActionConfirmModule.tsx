import { useState } from 'react'
import { PendingAction } from '../../agent/types'
import { Button } from '../ui/Button'
import { joinClasses } from '../ui/classNames'
import { defaultWriteActionBarLabels, type WriteActionBarLabels } from './writeActionConfirmDefaults'
import { WriteActionConfirmModal } from './WriteActionConfirmModal'

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

function compactSummary(action: PendingAction): string {
  const preview = action.confirmation?.preview || action.preview || ''
  if (preview) return preview.replace(/\s+/g, ' ').trim()
  const description = action.confirmation?.description || action.description || ''
  if (description) return description.replace(/\s+/g, ' ').trim()
  return ''
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
  const [detailsOpen, setDetailsOpen] = useState(false)
  const summary = compactSummary(action)
  const itemCount = action.confirmation?.items?.length ?? 0

  const handleApprove = (event: React.MouseEvent) => {
    event.stopPropagation()
    setDetailsOpen(false)
    onApprove()
  }

  const handleReject = (event: React.MouseEvent) => {
    event.stopPropagation()
    setDetailsOpen(false)
    onReject()
  }

  return (
    <>
      <button
        type="button"
        className={joinClasses('ui-write-action-bar ui-hover-surface', className)}
        onClick={() => setDetailsOpen(true)}
        role="region"
        aria-label="Pending write action. Click to view details."
      >
        <div className="flex items-center gap-2 min-w-0">
          {summary ? (
            <p className="ui-write-action-bar-summary truncate" title={summary}>
              {summary}
            </p>
          ) : (
            <p className="ui-write-action-bar-summary text-neutral-500">A write action is waiting for approval.</p>
          )}
          {itemCount > 0 ? (
            <span className="shrink-0 text-xs text-neutral-500">({itemCount} item{itemCount > 1 ? 's' : ''})</span>
          ) : null}
        </div>
        <div className="ui-write-action-bar-actions">
          <Button variant="primary" size="sm" onClick={handleApprove}>
            {resolveApproveLabel(action)}
          </Button>
          <Button variant="secondary" size="sm" onClick={handleReject}>
            {labels.refuseLabel}
          </Button>
        </div>
      </button>

      {detailsOpen && (
        <WriteActionConfirmModal
          action={action}
          approveLabel={resolveApproveLabel(action)}
          onApprove={() => { setDetailsOpen(false); onApprove() }}
          onReject={() => { setDetailsOpen(false); onReject() }}
          onClose={() => setDetailsOpen(false)}
        />
      )}
    </>
  )
}

export default WriteActionConfirmModule
