import { useState } from 'react'
import { MarkdownArtifact } from '../../../agent/types'
import { MarkdownRenderer } from './MarkdownRenderer'
import { MarkdownArtifactModal } from './MarkdownArtifactModal'
import { joinClasses } from '../../ui/classNames'
import { useArtifactContent } from './useArtifactContent'

export interface MarkdownArtifactCardProps {
  artifact: MarkdownArtifact
  /** Bumps reload when the same path is overwritten (new artifact message). */
  messageId?: string
  className?: string
}

const DocIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6M8 4h7l5 5v11a1 1 0 01-1 1H8a1 1 0 01-1-1V5a1 1 0 011-1z" />
  </svg>
)

export function MarkdownArtifactCard({ artifact, messageId, className }: MarkdownArtifactCardProps) {
  const reloadKey = messageId ? `${messageId}:${artifact.path}:${artifact.title}` : artifact.path
  const { content, error, loading, reload } = useArtifactContent(artifact.path, reloadKey)
  const [open, setOpen] = useState(false)

  const handleOpen = () => {
    reload()
    setOpen(true)
  }

  return (
    <>
      <div className={joinClasses('ui-artifact-card', className)}>
        <button type="button" className="ui-artifact-card-header" onClick={handleOpen}>
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
            <p className="ui-artifact-card-loading">{loading ? 'Loading report…' : 'Report is empty'}</p>
          )}
        </div>
      </div>

      {open ? (
        <MarkdownArtifactModal
          artifact={artifact}
          content={content}
          loading={loading}
          error={error}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  )
}
