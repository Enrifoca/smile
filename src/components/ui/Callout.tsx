import { ReactNode } from 'react'
import { joinClasses } from './classNames'

export interface CalloutProps {
  children: ReactNode
  className?: string
}

export function Callout({ children, className }: CalloutProps) {
  return (
    <div className={joinClasses('ui-callout', className)}>
      {children}
    </div>
  )
}
