import { useEffect, useMemo, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'

import { useElectron } from '../../hooks/useElectron'
import { Alert, Button, Field, Input, Spinner } from '../ui'
import { ConnectorManifest, JSONSchema } from '../../connectors/contract'
import type { ProjectContext } from '../../context/types'

/**
 * Context management: define projects that circumscribe the agent. Each context
 * binds a name, an optional working folder (soft scoping), and a per-connector
 * domain shaped by each connector's `contextSchema`.
 *
 * Users activate a context in chat by typing `/` followed by the context name.
 */

interface ConnectorWithSchema {
  id: string
  name: string
  contextSchema?: JSONSchema
}

function blankContext(): ProjectContext {
  return { id: uuidv4(), name: '', folder: '', connectorScopes: {} }
}

/** Render a single schema property into a stored value (comma lists for arrays). */
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

function ContextEditor({
  draft,
  connectors,
  onChange,
  onSave,
  onCancel,
  saving,
  onPickFolder,
}: {
  draft: ProjectContext
  connectors: ConnectorWithSchema[]
  onChange: (next: ProjectContext) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
  onPickFolder: () => void
}) {
  return (
    <div className="space-y-4 rounded-lg border border-neutral-300 p-4">
      <Field label="Name" hint="Type / followed by this name in chat to activate the context">
        <Input
          value={draft.name}
          placeholder="e.g. Acme Website"
          onChange={event => onChange({ ...draft, name: event.target.value })}
        />
      </Field>
      <Field label="Folder" hint="Optional working subdirectory within the workspace (soft scope)">
        <div className="flex items-center gap-2">
          <div className="flex-1 truncate rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-700">
            {draft.folder ? draft.folder : <span className="text-neutral-400">Whole workspace</span>}
          </div>
          <Button variant="secondary" size="sm" onClick={onPickFolder}>
            Choose folder
          </Button>
          {draft.folder && (
            <Button variant="secondary" size="sm" onClick={() => onChange({ ...draft, folder: '' })}>
              Clear
            </Button>
          )}
        </div>
      </Field>

      {connectors.length > 0 && (
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-neutral-700">Connector domain</h4>
          {connectors.map(connector => (
            <div key={connector.id} className="rounded border border-neutral-200 p-3">
              <p className="mb-2 text-sm font-medium text-neutral-800">{connector.name}</p>
              <ConnectorScopeEditor
                connector={connector}
                value={(draft.connectorScopes[connector.id] as Record<string, unknown>) || {}}
                onChange={next =>
                  onChange({
                    ...draft,
                    connectorScopes: { ...draft.connectorScopes, [connector.id]: next },
                  })
                }
              />
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Button onClick={onSave} loading={saving} disabled={!draft.name.trim()}>
          Save context
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

export default function ContextManagementSection() {
  const { contexts: contextsAPI, connectors: connectorsAPI, file } = useElectron()
  const [loading, setLoading] = useState(true)
  const [contexts, setContexts] = useState<ProjectContext[]>([])
  const [connectors, setConnectors] = useState<ConnectorWithSchema[]>([])
  const [draft, setDraft] = useState<ProjectContext | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const [ctxResult, connResult] = await Promise.all([contextsAPI.list(), connectorsAPI.list()])
        if (!active) return
        if (ctxResult.success && ctxResult.data) setContexts(ctxResult.data)
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
        if (active) setError(err instanceof Error ? err.message : 'Failed to load contexts')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [contextsAPI, connectorsAPI])

  const connectorsWithSchema = useMemo(
    () => connectors.filter(connector => connector.contextSchema),
    [connectors],
  )

  async function handleSave() {
    if (!draft) return
    setSaving(true)
    setError(null)
    try {
      const result = await contextsAPI.save(draft)
      if (result.success && result.data) {
        setContexts(result.data)
        setDraft(null)
      } else if (result.error) {
        setError(result.error)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save context')
    } finally {
      setSaving(false)
    }
  }

  async function handlePickFolder() {
    if (!draft) return
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

  async function handleDelete(contextId: string) {
    setError(null)
    try {
      const result = await contextsAPI.delete(contextId)
      if (result.success && result.data) setContexts(result.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete context')
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-medium text-neutral-950">Context</h2>
        {loading && <Spinner size="sm" />}
      </div>
      <p className="text-sm text-neutral-500">
        Define projects that scope the agent. Activate one in chat by typing <code>/</code> and the context name.
      </p>

      {!loading && contexts.length === 0 && !draft && (
        <p className="text-sm text-neutral-500">No contexts defined yet.</p>
      )}

      <div className="space-y-2">
        {contexts.map(context => (
          <div
            key={context.id}
            className="flex items-center justify-between rounded-lg border border-neutral-200 px-4 py-3"
          >
            <div>
              <p className="font-medium text-neutral-950">{context.name}</p>
              <p className="text-xs text-neutral-400">
                {context.folder ? `Folder: ${context.folder} · ` : ''}
                {Object.keys(context.connectorScopes).length} connector(s)
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setDraft(context)}>
                Edit
              </Button>
              <Button variant="secondary" size="sm" onClick={() => handleDelete(context.id)}>
                Delete
              </Button>
            </div>
          </div>
        ))}
      </div>

      {draft ? (
        <ContextEditor
          draft={draft}
          connectors={connectorsWithSchema}
          onChange={setDraft}
          onSave={handleSave}
          onCancel={() => setDraft(null)}
          saving={saving}
          onPickFolder={handlePickFolder}
        />
      ) : (
        <Button variant="secondary" onClick={() => setDraft(blankContext())}>
          New context
        </Button>
      )}

      {error && <Alert>{error}</Alert>}
    </section>
  )
}
