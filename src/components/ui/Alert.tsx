import { ReactNode } from 'react'
import { joinClasses } from './classNames'

export interface AlertProps {
  children: ReactNode
  className?: string
}

export function Alert({ children, className }: AlertProps) {
  return (
    <p className={joinClasses('ui-alert ui-alert--error', className)} role="alert">
      {children}
    </p>
  )
}
