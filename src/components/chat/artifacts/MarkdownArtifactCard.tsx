import { useEffect, useState } from 'react'
import { MarkdownArtifact } from '../../../agent/types'
import { useElectron } from '../../../hooks/useElectron'
import { MarkdownRenderer } from './MarkdownRenderer'
import { MarkdownArtifactModal } from './MarkdownArtifactModal'
import { joinClasses } from '../../ui/classNames'

export interface MarkdownArtifactCardProps {
  artifact: MarkdownArtifact
  className?: string
}

const DocIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6M8 4h7l5 5v11a1 1 0 01-1 1H8a1 1 0 01-1-1V5a1 1 0 011-1z" />
  </svg>
)

export function MarkdownArtifactCard({ artifact, className }: MarkdownArtifactCardProps) {
  const { file } = useElectron()
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    setError(null)
    file.read(artifact.path).then(result => {
      if (cancelled) return
      if (result.success && result.data) {
        setContent(result.data)
      } else {
        setError(result.error || 'Could not load report')
      }
    }).catch(() => {
      if (!cancelled) setError('Could not load report')
    })
    return () => { cancelled = true }
  }, [artifact.path, file])

  return (
    <>
      <div className={joinClasses('ui-artifact-card', className)}>
        <button type="button" className="ui-artifact-card-header" onClick={() => setOpen(true)}>
          <span className="ui-artifact-card-icon"><DocIcon /></span>
          <span className="ui-artifact-card-title">{artifact.title}</span>
          <span className="ui-artifact-card-action">Open</span>
        </button>
        <div className="ui-artifact-card-preview">
          {error ? (
            <p className="ui-artifact-card-error">{error}</p>
          ) : content ? (
            <MarkdownRenderer content={content} />
          ) : (
            <p className="ui-artifact-card-loading">Loading report…</p>
          )}
        </div>
      </div>

      {open && content ? (
        <MarkdownArtifactModal
          artifact={artifact}
          content={content}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  )
}
