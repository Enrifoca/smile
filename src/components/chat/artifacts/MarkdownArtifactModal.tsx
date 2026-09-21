import { useEffect, useRef, useState, useMemo, memo } from 'react'
import { MarkdownArtifact } from '../../../agent/types'
import { exportReportAsDocx, exportReportAsPdf } from '../../../utils/exportReport'
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

interface DownloadMenuProps {
  canDownload: boolean
  onExport: (format: 'pdf' | 'docx') => Promise<void>
}

const DownloadMenu = memo(function DownloadMenu({ canDownload, onExport }: DownloadMenuProps) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const handleClick = () => setOpen(v => !v)

  const handleExport = async (format: 'pdf' | 'docx') => {
    setError(null)
    try {
      await onExport(format)
      setOpen(false)
    } catch (err) {
      console.error(`[DownloadMenu] ${format} export failed:`, err)
      setError(err instanceof Error ? err.message : `${format} export failed`)
    }
  }

  return (
    <div className="relative" ref={ref}>
      <Button variant="ghost" size="sm" disabled={!canDownload} onClick={handleClick} aria-expanded={open} aria-haspopup="menu">
        <DownloadIcon />
        Download
      </Button>
      {open && canDownload ? (
        <div className="ui-download-popover" role="menu">
          {error ? <div className="ui-download-popover-error">{error}</div> : null}
          <button type="button" className="ui-download-popover-item" role="menuitem" onClick={() => handleExport('pdf')}>
            PDF
          </button>
          <button type="button" className="ui-download-popover-item" role="menuitem" onClick={() => handleExport('docx')}>
            .docx
          </button>
        </div>
      ) : null}
    </div>
  )
})

export function MarkdownArtifactModal({
  artifact,
  content,
  loading = false,
  error = null,
  onClose,
  showDownload = true,
}: MarkdownArtifactModalProps) {
  const canDownload = !loading && !error && !!content

  const handleExport = async (format: 'pdf' | 'docx') => {
    if (format === 'pdf') {
      await exportReportAsPdf(content || '', artifact.title, artifact.path)
    } else {
      await exportReportAsDocx(content || '', artifact.title, artifact.path)
    }
  }

  const body = useMemo(() => {
    if (loading) return <p className="ui-artifact-card-loading">Loading report…</p>
    if (error) return <p className="ui-artifact-card-error">{error}</p>
    if (content) return <MarkdownRenderer content={content} />
    return <p className="ui-artifact-card-loading">Report is empty</p>
  }, [loading, error, content])

  return (
    <div className="ui-artifact-modal-backdrop" onClick={onClose} role="presentation">
      <div className="ui-artifact-modal" onClick={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={artifact.title}>
        <div className="ui-artifact-modal-header">
          <div>
            <h2 className="ui-artifact-modal-title">{artifact.title}</h2>
            <p className="ui-artifact-modal-path">{artifact.path}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {showDownload ? <DownloadMenu canDownload={canDownload} onExport={handleExport} /> : null}
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
        <div className="ui-artifact-modal-body">{body}</div>
      </div>
    </div>
  )
}
