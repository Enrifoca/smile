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

/** @deprecated Use ActionRow */
export type SaveActionRowProps = Omit<ActionRowProps, 'busy' | 'onAction' | 'busyLabel'> & {
  saving: boolean
  onSave: () => void
  savingLabel?: string
}

/** @deprecated Use ActionRow */
export function SaveActionRow({
  label,
  saving,
  status,
  disabled,
  onSave,
  successMessage,
  errorMessage,
  savingLabel,
  variant = 'primary',
  size = 'md',
  feedbackSize,
  extraActions,
}: SaveActionRowProps) {
  return (
    <ActionRow
      label={label}
      busy={saving}
      status={status}
      disabled={disabled}
      onAction={onSave}
      successMessage={successMessage}
      errorMessage={errorMessage}
      busyLabel={savingLabel}
      variant={variant}
      size={size}
      feedbackSize={feedbackSize}
      extraActions={extraActions}
    />
  )
}

/** @deprecated Use ActionFeedback */
export const SaveFeedback = ActionFeedback
