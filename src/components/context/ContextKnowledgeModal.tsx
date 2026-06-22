import { useEffect, useRef, useState } from 'react'
import { useElectron } from '../../hooks/useElectron'
import { Button } from '../ui/Button'

export interface ContextKnowledgeModalProps {
  contextId: string
  contextName: string
  slug: string
  initialContent: string | null
  initialLoading: boolean
  initialError: string | null
  onClose: () => void
  onSaved?: () => void
}

export function ContextKnowledgeModal({
  contextId,
  contextName,
  slug,
  initialContent,
  initialLoading,
  initialError,
  onClose,
  onSaved,
}: ContextKnowledgeModalProps) {
  const { contexts: contextsAPI } = useElectron()
  const panelRef = useRef<HTMLDivElement>(null)
  const [content, setContent] = useState(initialContent ?? '')
  const [editMode, setEditMode] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(initialError)
  const [loading, setLoading] = useState(initialLoading)

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  useEffect(() => {
    if (initialContent === null && !initialLoading && !initialError) {
      setLoading(true)
      setError(null)
      contextsAPI
        .readMarkdown(contextId)
        .then(result => {
          if (result.success) setContent(result.data || '')
          else setError(result.error || 'Could not load context file')
        })
        .catch(err => setError(err instanceof Error ? err.message : 'Failed to load context file'))
        .finally(() => setLoading(false))
    }
  }, [contextId, contextsAPI, initialContent, initialLoading, initialError])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const result = await contextsAPI.writeMarkdown(contextId, content)
      if (result.success) {
        setEditMode(false)
        onSaved?.()
      } else {
        setError(result.error || 'Failed to save context file')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save context file')
    } finally {
      setSaving(false)
    }
  }

  const filePath = `.smile/contexts/${slug}/${slug}.md`

  return (
    <div className="ui-artifact-modal-backdrop" onClick={onClose} role="presentation">
      <div
        ref={panelRef}
        className="ui-artifact-modal"
        onClick={event => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Context knowledge: ${contextName}`}
      >
        <div className="ui-artifact-modal-header">
          <div>
            <h2 className="ui-artifact-modal-title">{contextName}</h2>
            <p className="ui-artifact-modal-path">{filePath}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="ui-artifact-modal-body">
          {loading ? (
            <p className="ui-artifact-card-loading">Loading context knowledge…</p>
          ) : error && !editMode ? (
            <p className="ui-artifact-card-error">{error}</p>
          ) : editMode ? (
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              className="w-full h-96 rounded border border-neutral-300 p-3 font-mono text-sm focus:border-neutral-500 focus:outline-none resize-y"
              spellCheck={false}
            />
          ) : (
            <div className="prose prose-sm max-w-none">
              {content ? (
                <pre className="whitespace-pre-wrap text-sm text-neutral-800 bg-neutral-50 p-3 rounded">
                  <code>{content}</code>
                </pre>
              ) : (
                <p className="text-neutral-500 italic">No context knowledge yet.</p>
              )}
            </div>
          )}
        </div>

        <div className="ui-artifact-modal-footer">
          {editMode ? (
            <>
              <Button variant="secondary" size="sm" onClick={() => setEditMode(false)} disabled={saving}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleSave} loading={saving}>
                Save
              </Button>
            </>
          ) : (
            <Button variant="primary" size="sm" onClick={() => setEditMode(true)}>
              Edit
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

export default ContextKnowledgeModal
