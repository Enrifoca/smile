import { useCallback, useState } from 'react'

import { useElectron } from '../../hooks/useElectron'
import { MarkdownArtifactModal } from '../chat/artifacts/MarkdownArtifactModal'
import { joinClasses } from '../ui/classNames'

interface ContextKnowledgeCardProps {
  contextId: string
  contextName: string
  slug: string
  className?: string
}

export function ContextKnowledgeCard({ contextId, contextName, slug, className }: ContextKnowledgeCardProps) {
  const { contexts: contextsAPI } = useElectron()
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  const filePath = `.smile/contexts/${slug}/${slug}.md`

  const loadMarkdown = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await contextsAPI.readMarkdown(contextId)
      if (result.success) {
        setContent(result.data || '')
      } else {
        setError(result.error || 'Could not load context file')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load context file')
    } finally {
      setLoading(false)
    }
  }, [contextId, contextsAPI])

  const handleOpen = () => {
    setOpen(true)
    void loadMarkdown()
  }

  return (
    <>
      <div className={joinClasses('ui-artifact-card w-fit', className)}>
        <button
          type="button"
          className="ui-artifact-card-header border-b-0 py-2.5"
          onClick={handleOpen}
        >
          <span className="ui-artifact-card-title">Context knowledge</span>
          <span className="ui-artifact-card-action">Open</span>
        </button>
      </div>

      {open ? (
        <MarkdownArtifactModal
          artifact={{ title: contextName, path: filePath }}
          content={content}
          loading={loading}
          error={error}
          showDownload={false}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  )
}
