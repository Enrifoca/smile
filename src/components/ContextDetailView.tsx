import { useEffect, useState } from 'react'

import { useElectron } from '../hooks/useElectron'
import { Spinner } from './ui'
import type { ProjectContext } from '../context/types'
import { ContextEditorForm } from './context/ContextEditorForm'

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
        <p className="text-sm text-neutral-500">Context not found.</p>
        <button type="button" className="mt-4 text-sm text-neutral-700 underline" onClick={onBack}>
          Back to chat
        </button>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-white">
      <div className="content-shell page-shell space-y-6">
        <div>
          <h1 className="text-xl font-medium text-neutral-950">{context.name || 'Context'}</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Manage folder scope and connector configuration for this project context.
          </p>
        </div>

        <ContextEditorForm
          initial={context}
          onSaved={contexts => {
            onContextsChange(contexts)
            const updated = contexts.find(item => item.id === contextId)
            if (updated) setContext(updated)
          }}
          onCancel={onBack}
          onDeleted={() => {
            if (activeContextId === contextId) onActiveContextChange(null)
            void contextsAPI.list().then(result => {
              if (result.success && result.data) onContextsChange(result.data)
            })
            onBack()
          }}
        />
      </div>
    </div>
  )
}
