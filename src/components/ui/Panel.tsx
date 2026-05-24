import { ReactNode } from 'react'
import { joinClasses } from './classNames'
import type { PanelVariant } from './types'

export interface PanelProps {
  children: ReactNode
  variant?: PanelVariant
  className?: string
}

export function Panel({ children, variant = 'soft', className }: PanelProps) {
  return (
    <section className={joinClasses('ui-panel', `ui-panel--${variant}`, className)}>
      {children}
    </section>
  )
}

export interface SectionHeaderProps {
  title: string
  description?: string
  aside?: ReactNode
}

export function SectionHeader({ title, description, aside }: SectionHeaderProps) {
  return (
    <div className="ui-section-header">
      <div>
        <h2 className="ui-section-title">{title}</h2>
        {description && <p className="ui-section-description">{description}</p>}
      </div>
      {aside}
    </div>
  )
}

export interface ModuleSectionProps {
  title: string
  description?: string
  aside?: ReactNode
  children: ReactNode
}

/** Connector/settings module shell — title row + content. */
export function ModuleSection({ title, description, aside, children }: ModuleSectionProps) {
  return (
    <section className="ui-module-section">
      <SectionHeader title={title} description={description} aside={aside} />
      {children}
    </section>
  )
}

export function PanelBody({  children,
  variant = 'emphasis',
  className,
}: {
  children: ReactNode
  variant?: 'emphasis' | 'emphasisCompact' | 'soft'
  className?: string
}) {
  const variantClass = variant === 'emphasisCompact'
    ? 'ui-panel--emphasis-compact'
    : variant === 'soft'
      ? 'ui-panel--soft'
      : 'ui-panel--emphasis'

  return (
    <div className={joinClasses('ui-panel', variantClass, className)}>
      {children}
    </div>
  )
}
