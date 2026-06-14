import { useEffect, useState } from 'react'
import { Spinner } from '../ui/Spinner'
import { joinClasses } from '../ui/classNames'

export interface ChatActivityIndicatorProps {
  status?: string | null
  className?: string
}

export function ChatActivityIndicator({ status, className }: ChatActivityIndicatorProps) {
  const [elapsedSec, setElapsedSec] = useState(0)

  useEffect(() => {
    if (!status) {
      setElapsedSec(0)
      return
    }

    setElapsedSec(0)
    const started = Date.now()
    const timer = window.setInterval(() => {
      setElapsedSec(Math.max(1, Math.round((Date.now() - started) / 1000)))
    }, 1000)

    return () => window.clearInterval(timer)
  }, [status])

  const label = status || 'Working on your request…'
  const showElapsed = elapsedSec >= 3

  return (
    <div className={joinClasses('ui-chat-activity', className)} role="status" aria-live="polite">
      <Spinner size="sm" />
      <span>
        {label}
        {showElapsed ? ` (${elapsedSec}s)` : ''}
      </span>
    </div>
  )
}
