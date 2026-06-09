import { useMemo } from 'react'

import type { ProjectContext } from '../context/types'
import { blankContext, ContextEditorForm } from './context/ContextEditorForm'

interface ContextNewViewProps {
  onContextsChange: (contexts: ProjectContext[]) => void
  onOpenContext: (contextId: string) => void
  onCancel: () => void
}

export default function ContextNewView({ onContextsChange, onOpenContext, onCancel }: ContextNewViewProps) {
  const draft = useMemo(() => blankContext(), [])

  return (
    <div className="h-full overflow-y-auto bg-white">
      <div className="content-shell page-shell space-y-6">
        <div>
          <h1 className="text-xl font-medium text-neutral-950">New context</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Define a project scope with an optional working folder and connector settings.
          </p>
        </div>

        <ContextEditorForm
          initial={draft}
          onSaved={contexts => {
            onContextsChange(contexts)
            const created = contexts[contexts.length - 1]
            if (created) onOpenContext(created.id)
            else onCancel()
          }}
          onCancel={onCancel}
        />
      </div>
    </div>
  )
}
