import { joinClasses } from './classNames'

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizeClass: Record<NonNullable<SpinnerProps['size']>, string> = {
  sm: 'ui-spinner ui-spinner--sm',
  md: 'ui-spinner ui-spinner--md',
  lg: 'ui-spinner ui-spinner--lg',
}

export function Spinner({ size = 'md', className }: SpinnerProps) {
  return (
    <div
      className={joinClasses(sizeClass[size], className)}
      role="status"
      aria-label="Loading"
    />
  )
}
