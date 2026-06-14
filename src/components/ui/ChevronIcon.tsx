import { joinClasses } from './classNames'

interface ChevronIconProps {
  open?: boolean
  className?: string
}

/** Sidebar accordion chevron — points right when closed, down when open. */
export function ChevronIcon({ open = false, className }: ChevronIconProps) {
  return (
    <svg
      className={joinClasses(
        'ui-chevron-icon shrink-0 transition-transform',
        open && 'ui-chevron-icon--open',
        className,
      )}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  )
}
