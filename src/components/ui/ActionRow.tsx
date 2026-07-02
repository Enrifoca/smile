import { ReactNode } from 'react'
import { ActionFeedback } from './ActionFeedback'
import { Button } from './Button'
import type { ActionStatus, ButtonSize, ButtonVariant, FeedbackSize } from './types'

export interface ActionRowProps {
  label: string
  busy?: boolean
  status: ActionStatus
  disabled?: boolean
  onAction: () => void
  successMessage?: string
  errorMessage?: string
  busyLabel?: string
  variant?: ButtonVariant
  size?: ButtonSize
  feedbackSize?: FeedbackSize
  extraActions?: ReactNode
}

export function ActionRow({
  label,
  busy = false,
  status,
  disabled = false,
  onAction,
  successMessage = 'Saved',
  errorMessage = 'Could not save',
  busyLabel = 'Saving...',
  variant = 'primary',
  size = 'md',
  feedbackSize = 'md',
  extraActions,
}: ActionRowProps) {
  return (
    <div className="ui-action-row">
      <Button
        variant={variant}
        size={size}
        loading={busy}
        loadingLabel={busyLabel}
        disabled={disabled}
        onClick={onAction}
      >
        {label}
      </Button>
      {extraActions}
      <ActionFeedback
        status={status}
        successMessage={successMessage}
        errorMessage={errorMessage}
        size={feedbackSize}
      />
    </div>
  )
}

