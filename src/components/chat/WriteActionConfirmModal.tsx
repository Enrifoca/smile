import { useEffect, useRef } from 'react'
import { PendingAction } from '../../agent/types'
import { Button } from '../ui/Button'

export interface WriteActionConfirmModalProps {
  action: PendingAction
  approveLabel?: string
  onApprove: () => void
  onReject: () => void
  onClose: () => void
}

export function WriteActionConfirmModal({
  action,
  approveLabel,
  onApprove,
  onReject,
  onClose,
}: WriteActionConfirmModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const confirmation = action.confirmation

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  const title = confirmation?.title || action.description || 'Confirm action'

  return (
    <div className="ui-artifact-modal-backdrop" onClick={onClose} role="presentation">
      <div
        ref={panelRef}
        className="ui-artifact-modal"
        onClick={event => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="ui-artifact-modal-header">
          <div>
            <h2 className="ui-artifact-modal-title">{title}</h2>
            {confirmation?.description ? (
              <p className="ui-artifact-modal-path">{confirmation.description}</p>
            ) : null}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="ui-artifact-modal-body space-y-4 text-sm">
          {(confirmation?.preview || action.preview) ? (
            <div className="rounded border border-neutral-200 bg-neutral-50 p-3">
              <p className="text-xs uppercase tracking-wide text-neutral-400 mb-1">Preview</p>
              <p className="text-neutral-800 whitespace-pre-wrap">{confirmation?.preview || action.preview}</p>
            </div>
          ) : null}

          {confirmation?.fields && confirmation.fields.length > 0 ? (
            <div>
              <p className="text-xs uppercase tracking-wide text-neutral-400 mb-2">Details</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                {confirmation.fields.map((field, i) => (
                  <div key={i} className="contents">
                    <dt className="text-neutral-500">{field.label}</dt>
                    <dd className="text-neutral-900">{field.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}

          {confirmation?.items && confirmation.items.length > 0 ? (
            <div>
              <p className="text-xs uppercase tracking-wide text-neutral-400 mb-2">Items ({confirmation.items.length})</p>
              <ul className="space-y-2">
                {confirmation.items.map((item, i) => (
                  <li key={i} className="rounded border border-neutral-200 p-2">
                    <p className="font-medium text-neutral-900">{item.title}</p>
                    {item.subtitle ? <p className="text-xs text-neutral-500">{item.subtitle}</p> : null}
                    {item.body ? <p className="mt-1 text-sm text-neutral-700 whitespace-pre-wrap">{item.body}</p> : null}
                    {item.badge ? <span className="mt-1 inline-block text-xs bg-neutral-100 px-1.5 py-0.5 rounded">{item.badge}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {confirmation?.acceptanceCriteria && confirmation.acceptanceCriteria.length > 0 ? (
            <div>
              <p className="text-xs uppercase tracking-wide text-neutral-400 mb-2">Acceptance criteria</p>
              <ul className="list-disc pl-4 space-y-0.5 text-neutral-700">
                {confirmation.acceptanceCriteria.map((criterion, i) => (
                  <li key={i}>{criterion}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {confirmation?.risk ? (
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wide text-neutral-400">Risk</span>
              <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                confirmation.risk === 'high'
                  ? 'bg-red-100 text-red-800'
                  : confirmation.risk === 'medium'
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-green-100 text-green-800'
              }`}>
                {confirmation.risk}
              </span>
            </div>
          ) : null}
        </div>

        <div className="ui-artifact-modal-footer">
          <Button variant="primary" size="sm" onClick={onApprove}>
            {approveLabel || confirmation?.approveLabel || 'Approve'}
          </Button>
          <Button variant="secondary" size="sm" onClick={onReject}>
            Refuse
          </Button>
        </div>
      </div>
    </div>
  )
}

export default WriteActionConfirmModal
