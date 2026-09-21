import { joinClasses } from '../ui/classNames'

export function SimilarWebIcon({ className }: { className?: string }) {
  return (
    <svg
      className={joinClasses('connector-card-icon connector-card-icon--similarweb', className)}
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="SimilarWeb"
    >
      <circle cx="50" cy="50" r="50" fill="#092540" />
      <path
        d="M50,0 A50,50 0 0,1 50,100 A25,25 0 0,1 50,50 A25,25 0 0,0 50,0"
        fill="#F4732A"
      />
    </svg>
  )
}
