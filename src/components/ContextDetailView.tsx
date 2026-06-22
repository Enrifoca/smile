import { useEffect, useState } from 'react'

import { useElectron } from '../hooks/useElectron'
import { Alert, Button, Spinner } from './ui'
import { ConfirmModal } from './ui/ConfirmModal'
import type { ProjectContext } from '../context/types'
import { ContextConnectorsPanel } from './context/ContextConnectorsPanel'
import { ContextKnowledgeCard } from './context/ContextKnowledgeCard'

interface ContextDetailViewProps {
  contextId: string
  onContextsChange: (contexts: ProjectContext[]) => void
  onActiveContextChange: (contextId: string | null) => void
  activeContextId: string | null
  onBack: () => void
}

export default function ContextDetailView({
  contextId,
  onContextsChange,
  onActiveContextChange,
  activeContextId,
  onBack,
}: ContextDetailViewProps) {
  const { contexts: contextsAPI } = useElectron()
  const [context, setContext] = useState<ProjectContext | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      setLoading(true)
      try {
        const result = await contextsAPI.list()
        if (!active) return
        const found = result.data?.find(item => item.id === contextId) ?? null
        setContext(found)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [contextId, contextsAPI])

  async function handleDelete() {
    setDeleting(true)
    setError(null)
    try {
      const result = await contextsAPI.delete(contextId)
      if (result.success) {
        if (activeContextId === contextId) onActiveContextChange(null)
        if (result.data) onContextsChange(result.data)
        onBack()
      } else if (result.error) {
        setError(result.error)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete context')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!context) {
    return (
      <div className="content-shell page-shell py-8">
        <p className="ui-type-ui">Context not found.</p>
        <button type="button" className="mt-4 ui-text-base text-neutral-700 underline" onClick={onBack}>
          Back to chat
        </button>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-white">
      <div className="content-shell page-shell space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="ui-page-title">{context.name}</h1>
            <p className="mt-1 ui-type-ui">
              Enable connectors and configure scope for this project context.
            </p>
          </div>
          <Button variant="danger" onClick={() => setShowDeleteModal(true)} loading={deleting}>
            Delete context
          </Button>
        </div>

        <ContextKnowledgeCard
          contextId={context.id}
          contextName={context.name}
          slug={context.slug}
        />

        <ContextConnectorsPanel
          context={context}
          onSaved={contexts => {
            onContextsChange(contexts)
            const updated = contexts.find(item => item.id === contextId)
            if (updated) setContext(updated)
          }}
        />

        {error && <Alert>{error}</Alert>}
      </div>

      {showDeleteModal && (
        <ConfirmModal
          title="Delete context?"
          description={
            <>
              Are you sure you want to delete <strong>{context.name}</strong>? This will remove the context folder and all its knowledge. This cannot be undone.
            </>
          }
          confirmLabel="Delete"
          confirmVariant="danger"
          onConfirm={() => {
            setShowDeleteModal(false)
            void handleDelete()
          }}
          onCancel={() => setShowDeleteModal(false)}
        />
      )}
    </div>
  )
}
