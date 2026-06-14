import { joinClasses } from './classNames'

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizeClass: Record<NonNullable<SpinnerProps['size']>, string> = {
  sm: 'ui-loading-dots ui-loading-dots--sm',
  md: 'ui-loading-dots',
  lg: 'ui-loading-dots ui-loading-dots--lg',
}

export function Spinner({ size = 'md', className }: SpinnerProps) {
  return (
    <div
      className={joinClasses(sizeClass[size], className)}
      role="status"
      aria-label="Loading"
    >
      <span />
      <span />
      <span />
    </div>
  )
}
