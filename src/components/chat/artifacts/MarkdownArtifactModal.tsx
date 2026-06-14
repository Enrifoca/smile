import { useEffect, useRef, useState } from 'react'
import { MarkdownArtifact } from '../../../agent/types'
import { exportReportAsDoc, exportReportAsPdf } from '../../../utils/exportReport'
import { MarkdownRenderer } from './MarkdownRenderer'
import { Button } from '../../ui/Button'

export interface MarkdownArtifactModalProps {
  artifact: MarkdownArtifact
  content: string | null
  loading?: boolean
  error?: string | null
  onClose: () => void
  /** When false, hides the download menu (e.g. context knowledge viewer). */
  showDownload?: boolean
}

const DownloadIcon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" />
  </svg>
)

export function MarkdownArtifactModal({
  artifact,
  content,
  loading = false,
  error = null,
  onClose,
  showDownload = true,
}: MarkdownArtifactModalProps) {
  const [downloadOpen, setDownloadOpen] = useState(false)
  const downloadRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!downloadOpen) return
    const handleClick = (event: MouseEvent) => {
      if (downloadRef.current && !downloadRef.current.contains(event.target as Node)) {
        setDownloadOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [downloadOpen])

  const canDownload = !loading && !error && !!content

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
          <div className="flex items-center gap-2 shrink-0">
            {showDownload ? (
              <div className="relative" ref={downloadRef}>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!canDownload}
                  onClick={() => setDownloadOpen(open => !open)}
                  aria-expanded={downloadOpen}
                  aria-haspopup="menu"
                >
                  <DownloadIcon />
                  Download
                </Button>
                {downloadOpen && canDownload ? (
                  <div className="ui-download-popover" role="menu">
                    <button
                      type="button"
                      className="ui-download-popover-item"
                      role="menuitem"
                      onClick={() => {
                        exportReportAsPdf(content || '', artifact.title, artifact.path)
                        setDownloadOpen(false)
                      }}
                    >
                      PDF
                    </button>
                    <button
                      type="button"
                      className="ui-download-popover-item"
                      role="menuitem"
                      onClick={() => {
                        exportReportAsDoc(content || '', artifact.title, artifact.path)
                        setDownloadOpen(false)
                      }}
                    >
                      .doc
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
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
