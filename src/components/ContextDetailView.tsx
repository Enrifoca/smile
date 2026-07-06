import { useEffect, useState } from 'react'

import { useElectron } from '../hooks/useElectron'
import { Alert, Button, Field, Input, Spinner } from './ui'
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

const PencilIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
    />
  </svg>
)

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
  const [showRenameModal, setShowRenameModal] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [renaming, setRenaming] = useState(false)
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

  async function handleRename() {
    if (!context) return
    const trimmed = renameValue.trim()
    if (!trimmed || trimmed === context.name) {
      setShowRenameModal(false)
      return
    }

    setRenaming(true)
    setError(null)
    try {
      const result = await contextsAPI.save({ ...context, name: trimmed })
      if (result.success && result.data) {
        const updated = result.data.find((item: ProjectContext) => item.id === contextId)
        if (updated) setContext(updated)
        onContextsChange(result.data)
        setShowRenameModal(false)
      } else if (result.error) {
        setError(result.error)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename context')
    } finally {
      setRenaming(false)
    }
  }

  function openRenameModal() {
    setRenameValue(context?.name ?? '')
    setShowRenameModal(true)
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
            <div className="flex items-center gap-2">
              <h1 className="ui-page-title">{context.name}</h1>
              <button
                type="button"
                onClick={openRenameModal}
                className="ui-chrome-icon-btn text-neutral-500 hover:text-neutral-900"
                aria-label="Rename context"
                title="Rename context"
              >
                <PencilIcon />
              </button>
            </div>
            <p className="ui-page-subtitle">
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

      {showRenameModal && (
        <div className="ui-confirm-modal-backdrop" onClick={() => setShowRenameModal(false)} role="presentation">
          <div
            className="ui-confirm-modal"
            onClick={event => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="rename-context-title"
          >
            <h2 id="rename-context-title" className="ui-confirm-modal-title">Rename context</h2>
            <div className="ui-confirm-modal-description">
              <Field label="Name" hint="The on-disk folder slug will stay the same.">
                <Input
                  autoFocus
                  value={renameValue}
                  onChange={event => setRenameValue(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter') void handleRename()
                    if (event.key === 'Escape') setShowRenameModal(false)
                  }}
                  placeholder="Context name"
                />
              </Field>
            </div>
            <div className="ui-confirm-modal-actions">
              <Button variant="secondary" size="md" onClick={() => setShowRenameModal(false)}>
                Cancel
              </Button>
              <Button
                size="md"
                onClick={() => void handleRename()}
                loading={renaming}
                disabled={!renameValue.trim() || renameValue.trim() === context.name}
              >
                Save
              </Button>
            </div>
            {error && (
              <div className="mt-4">
                <Alert>{error}</Alert>
              </div>
            )}
          </div>
        </div>
      )}

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
