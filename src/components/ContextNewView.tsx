import { useState } from 'react'

import { useElectron } from '../hooks/useElectron'
import { Alert, Button, Field, Input } from './ui'

interface ContextNewViewProps {
  onContextsChange: (contexts: import('../context/types').ProjectContext[]) => void
  onOpenContext: (contextId: string) => void
  onCancel: () => void
}

export default function ContextNewView({ onContextsChange, onOpenContext, onCancel }: ContextNewViewProps) {
  const { contexts: contextsAPI } = useElectron()
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    const trimmed = name.trim()
    if (!trimmed) return

    setCreating(true)
    setError(null)
    try {
      const result = await contextsAPI.create(trimmed)
      if (result.success && result.data) {
        onContextsChange(result.data)
        const created = result.context ?? result.data[result.data.length - 1]
        if (created) onOpenContext(created.id)
        else onCancel()
      } else if (result.error) {
        setError(result.error)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create context')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-white">
      <div className="content-shell page-shell space-y-6">
        <div>
          <h1 className="text-xl font-medium text-neutral-950">New context</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Enter a name to create a portable context folder under <code className="text-xs">.smile/contexts/</code>.
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <Field label="Name" hint="Creates a folder under .smile/contexts/ with smile.json and smile.md">
            <Input
              value={name}
              placeholder="e.g. Acme Website"
              autoFocus
              onChange={event => setName(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') void handleCreate()
              }}
            />
          </Field>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button onClick={() => void handleCreate()} loading={creating} disabled={!name.trim()}>
              Create context
            </Button>
            <Button variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
          </div>

          {error && (
            <div className="mt-4">
              <Alert>{error}</Alert>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
