import { joinClasses } from './classNames'

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger'

export interface BadgeProps {
  children: React.ReactNode
  tone?: BadgeTone
  className?: string
}

export function Badge({ children, tone = 'neutral', className }: BadgeProps) {
  return (
    <span className={joinClasses('ui-badge', `ui-badge--${tone}`, className)}>
      {children}
    </span>
  )
}
