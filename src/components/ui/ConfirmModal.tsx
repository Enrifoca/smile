import { ReactNode } from 'react'
import { Button } from './Button'

export interface ConfirmModalProps {
  title: string
  description: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  confirmVariant?: 'primary' | 'danger' | 'secondary'
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmVariant = 'primary',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <div className="ui-confirm-modal-backdrop" onClick={onCancel} role="presentation">
      <div
        className="ui-confirm-modal"
        onClick={event => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
      >
        <h2 id="confirm-modal-title" className="ui-confirm-modal-title">{title}</h2>
        <div className="ui-confirm-modal-description">{description}</div>
        <div className="ui-confirm-modal-actions">
          <Button variant="secondary" size="md" onClick={onCancel}>{cancelLabel}</Button>
          <Button variant={confirmVariant} size="md" onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  )
}
