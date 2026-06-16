import { joinClasses } from '../ui/classNames'

export function ChatLoadingDots({ className }: { className?: string }) {
  return (
    <span className={joinClasses('ui-chat-loading-dots', className)} aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  )
}
