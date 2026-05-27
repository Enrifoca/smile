import { useState } from 'react'
import { MarkdownArtifact } from '../../../agent/types'
import { joinClasses } from '../../ui/classNames'
import { MarkdownArtifactModal } from './MarkdownArtifactModal'
import { useArtifactContent } from './useArtifactContent'

export interface ActiveReportPillProps {
  artifact: MarkdownArtifact
  /** Bumps reload when the same path is overwritten (new artifact message). */
  messageId: string
  onDismiss: () => void
  className?: string
}

const DocIcon = () => (
  <svg className="w-4 h-4 shrink-0 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6M8 4h7l5 5v11a1 1 0 01-1 1H8a1 1 0 01-1-1V5a1 1 0 011-1z" />
  </svg>
)

/** Active report chip above the composer — click to open, × to dismiss. */
export function ActiveReportPill({ artifact, messageId, onDismiss, className }: ActiveReportPillProps) {
  const [open, setOpen] = useState(false)
  const { content, error, loading } = useArtifactContent(artifact.path, messageId)

  return (
    <>
      <div className={joinClasses('ui-chat-active-report', className)}>
        <p className="ui-chat-active-report-heading" id={`active-report-${messageId}`}>
          Active report
        </p>
        <div className="ui-chat-report-pill">
          <button
            type="button"
            className="ui-chat-report-pill-trigger"
            onClick={() => setOpen(true)}
            title={`${artifact.title}\n${artifact.path}\nClick to read full report`}
            aria-labelledby={`active-report-${messageId}`}
            aria-describedby={loading ? `active-report-status-${messageId}` : undefined}
          >
            <DocIcon />
            <span className="ui-chat-report-pill-title">{artifact.title}</span>
            {loading ? (
              <span className="ui-chat-report-pill-status" id={`active-report-status-${messageId}`}>Loading…</span>
            ) : null}
            {error ? (
              <span className="ui-chat-report-pill-status ui-chat-report-pill-status-error" id={`active-report-status-${messageId}`}>
                Unavailable
              </span>
            ) : null}
          </button>
          <button
            type="button"
            className="ui-chat-report-pill-dismiss"
            onClick={onDismiss}
            aria-label="Dismiss active report"
            title="Dismiss — your next message won't be tied to this report"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
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
