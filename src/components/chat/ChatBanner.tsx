import { ReactNode } from 'react'
import { joinClasses } from '../ui/classNames'
import { Spinner } from '../ui/Spinner'

export type ChatBannerVariant = 'info' | 'error'

export interface ChatBannerProps {
  variant: ChatBannerVariant
  message: ReactNode
  actionLabel?: string
  onAction?: () => void
  className?: string
}

export function ChatBanner({ variant, message, actionLabel, onAction, className }: ChatBannerProps) {
  return (
    <div className={joinClasses('ui-chat-banner', `ui-chat-banner--${variant}`, className)}>
      <div className="ui-chat-banner-inner">
        <div className="ui-chat-banner-message">
          {variant === 'info' ? <Spinner size="sm" /> : null}
          <span>{message}</span>
        </div>
        {actionLabel && onAction ? (
          <button type="button" onClick={onAction} className="ui-chat-banner-action">
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  )
}
