import { ReactNode } from 'react'
import { joinClasses } from './classNames'

export interface PageProps {
  title: string
  description?: string
  children: ReactNode
  className?: string
}

export function Page({ title, description, children, className }: PageProps) {
  return (
    <div className={joinClasses('h-full overflow-y-auto bg-white', className)}>
      <div className="content-shell page-shell">
        <header className="ui-page-header">
          <h1 className="ui-page-title">{title}</h1>
          {description && <p className="ui-page-description">{description}</p>}
        </header>
        {children}
      </div>
    </div>
  )
}

export function PageStack({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={joinClasses('space-y-6', className)}>{children}</div>
}

export function PageStackWide({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={joinClasses('space-y-8', className)}>{children}</div>
}
