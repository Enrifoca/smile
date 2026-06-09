import { useEffect, useMemo, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'

import { useElectron } from '../../hooks/useElectron'
import { Alert, Button, Field, Input, Spinner } from '../ui'
import { ConnectorManifest, JSONSchema } from '../../connectors/contract'
import type { ProjectContext } from '../../context/types'

interface ConnectorWithSchema {
  id: string
  name: string
  contextSchema?: JSONSchema
}

export function blankContext(): ProjectContext {
  return { id: uuidv4(), name: '', folder: '', connectorScopes: {} }
}

function fieldValueToString(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ')
  if (value === undefined || value === null) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function parseFieldValue(schema: JSONSchema, raw: string): unknown {
  if (schema.type === 'array') {
    return raw
      .split(',')
      .map(item => item.trim())
      .filter(Boolean)
  }
  if (schema.type === 'number' || schema.type === 'integer') {
    const num = Number(raw)
    return Number.isFinite(num) ? num : undefined
  }
  if (schema.type === 'boolean') return raw === 'true'
  return raw
}

function ConnectorScopeEditor({
  connector,
  value,
  onChange,
}: {
  connector: ConnectorWithSchema
  value: Record<string, unknown>
  onChange: (next: Record<string, unknown>) => void
}) {
  const properties = connector.contextSchema?.properties
  if (!properties || Object.keys(properties).length === 0) {
    return <p className="text-xs text-neutral-400">This connector declares no per-context configuration.</p>
  }

  return (
    <div className="space-y-3">
      {Object.entries(properties).map(([key, schema]) => {
        const hint = schema.type === 'array' ? 'Comma-separated' : schema.description
        return (
          <Field key={key} label={key} hint={hint}>
            <Input
              value={fieldValueToString(value[key])}
              placeholder={schema.description || key}
              onChange={event => onChange({ ...value, [key]: parseFieldValue(schema, event.target.value) })}
            />
          </Field>
        )
      })}
    </div>
  )
}

export interface ContextEditorFormProps {
  initial: ProjectContext
  onSaved: (contexts: ProjectContext[]) => void
  onCancel: () => void
  onDeleted?: () => void
}

export function ContextEditorForm({ initial, onSaved, onCancel, onDeleted }: ContextEditorFormProps) {
  const { contexts: contextsAPI, connectors: connectorsAPI, file } = useElectron()
  const [draft, setDraft] = useState<ProjectContext>(initial)
  const [connectors, setConnectors] = useState<ConnectorWithSchema[]>([])
  const [loadingConnectors, setLoadingConnectors] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setDraft(initial)
  }, [initial])

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const connResult = await connectorsAPI.list()
        if (!active) return
        if (connResult.success && connResult.data) {
          setConnectors(
            connResult.data.connectors.map(({ manifest }: { manifest: ConnectorManifest }) => ({
              id: manifest.id,
              name: manifest.name,
              contextSchema: manifest.contextSchema,
            })),
          )
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load connectors')
      } finally {
        if (active) setLoadingConnectors(false)
      }
    })()
    return () => {
      active = false
    }
  }, [connectorsAPI])

  const connectorsWithSchema = useMemo(
    () => connectors.filter(connector => connector.contextSchema),
    [connectors],
  )

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const result = await contextsAPI.save(draft)
      if (result.success && result.data) {
        onSaved(result.data)
      } else if (result.error) {
        setError(result.error)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save context')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!onDeleted) return
    setDeleting(true)
    setError(null)
    try {
      const result = await contextsAPI.delete(draft.id)
      if (result.success) onDeleted()
      else if (result.error) setError(result.error)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete context')
    } finally {
      setDeleting(false)
    }
  }

  async function handlePickFolder() {
    setError(null)
    try {
      const result = await file.selectFolderInWorkspace()
      if (result.success && result.path !== undefined) {
        setDraft({ ...draft, folder: result.path })
      } else if (result.error) {
        setError(result.error)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to pick folder')
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-6">
      <Field label="Name" hint="Shown in the sidebar Context menu">
        <Input
          value={draft.name}
          placeholder="e.g. Acme Website"
          onChange={event => setDraft({ ...draft, name: event.target.value })}
        />
      </Field>

      <Field label="Folder" hint="Optional working subdirectory within the workspace">
        <div className="flex items-center gap-2">
          <div className="flex-1 truncate rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-700">
            {draft.folder ? draft.folder : <span className="text-neutral-400">Whole workspace</span>}
          </div>
          <Button variant="secondary" size="sm" onClick={handlePickFolder}>
            Choose folder
          </Button>
          {draft.folder && (
            <Button variant="secondary" size="sm" onClick={() => setDraft({ ...draft, folder: '' })}>
              Clear
            </Button>
          )}
        </div>
      </Field>

      {loadingConnectors ? (
        <Spinner size="sm" />
      ) : connectorsWithSchema.length > 0 ? (
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-neutral-700">Connector domain</h4>
          {connectorsWithSchema.map(connector => (
            <div key={connector.id} className="rounded-lg border border-gray-200 p-3">
              <p className="mb-2 text-sm font-medium text-neutral-800">{connector.name}</p>
              <ConnectorScopeEditor
                connector={connector}
                value={(draft.connectorScopes[connector.id] as Record<string, unknown>) || {}}
                onChange={next =>
                  setDraft({
                    ...draft,
                    connectorScopes: { ...draft.connectorScopes, [connector.id]: next },
                  })
                }
              />
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={handleSave} loading={saving} disabled={!draft.name.trim()}>
          Save context
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        {onDeleted && (
          <Button variant="danger" onClick={handleDelete} loading={deleting} className="ml-auto">
            Delete context
          </Button>
        )}
      </div>

      {error && <Alert>{error}</Alert>}
    </div>
  )
}
