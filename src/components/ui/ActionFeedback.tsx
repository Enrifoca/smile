import { joinClasses } from './classNames'
import type { ActionStatus, FeedbackSize } from './types'

export interface ActionFeedbackProps {
  status: ActionStatus
  busy?: boolean
  busyMessage?: string
  successMessage?: string
  errorMessage?: string
  size?: FeedbackSize
}

export function ActionFeedback({
  status,
  busy = false,
  busyMessage = 'Working...',
  successMessage = 'Done',
  errorMessage = 'Something went wrong',
  size = 'md',
}: ActionFeedbackProps) {
  const sizeClass = size === 'sm' ? 'ui-feedback ui-feedback--sm' : 'ui-feedback'

  if (busy) {
    return <span className={joinClasses(sizeClass, 'ui-feedback--pending')}>{busyMessage}</span>
  }
  if (status === 'success') {
    return <span className={joinClasses(sizeClass, 'ui-feedback--success')}>{successMessage}</span>
  }
  if (status === 'error') {
    return <span className={joinClasses(sizeClass, 'ui-feedback--error')}>{errorMessage}</span>
  }
  return null
}

/** Inline status text for secondary actions (refresh, auto-save) without a primary button. */
export function StatusText({
  status,
  busy = false,
  busyMessage = 'Working...',
  successMessage = 'Done',
  errorMessage = 'Something went wrong',
  size = 'md',
}: ActionFeedbackProps) {
  return (
    <ActionFeedback
      status={status}
      busy={busy}
      busyMessage={busyMessage}
      successMessage={successMessage}
      errorMessage={errorMessage}
      size={size}
    />
  )
}
