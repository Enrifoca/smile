import { MarkdownArtifact } from '../../../agent/types'
import { MarkdownRenderer } from './MarkdownRenderer'
import { Button } from '../../ui/Button'

export interface MarkdownArtifactModalProps {
  artifact: MarkdownArtifact
  content: string | null
  loading?: boolean
  error?: string | null
  onClose: () => void
}

export function MarkdownArtifactModal({
  artifact,
  content,
  loading = false,
  error = null,
  onClose,
}: MarkdownArtifactModalProps) {
  return (
    <div className="ui-artifact-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="ui-artifact-modal"
        onClick={event => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={artifact.title}
      >
        <div className="ui-artifact-modal-header">
          <div>
            <h2 className="ui-artifact-modal-title">{artifact.title}</h2>
            <p className="ui-artifact-modal-path">{artifact.path}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="ui-artifact-modal-body">
          {loading ? (
            <p className="ui-artifact-card-loading">Loading report…</p>
          ) : error ? (
            <p className="ui-artifact-card-error">{error}</p>
          ) : content ? (
            <MarkdownRenderer content={content} />
          ) : (
            <p className="ui-artifact-card-loading">Report is empty</p>
          )}
        </div>
      </div>
    </div>
  )
}
