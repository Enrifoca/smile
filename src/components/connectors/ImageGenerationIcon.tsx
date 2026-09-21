import { joinClasses } from '../ui/classNames'

export function ImageGenerationIcon({ className }: { className?: string }) {
  return (
    <svg
      className={joinClasses('connector-card-icon connector-card-icon--image-generation', className)}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      role="img"
      aria-label="Image Generation"
      fill="none"
      stroke="#8B5CF6"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="M21 15l-5-5L5 17" />
    </svg>
  )
}
