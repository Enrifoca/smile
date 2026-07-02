import { useEffect, useState } from 'react'

import { useElectron } from '../../hooks/useElectron'
import { Alert, Callout, Spinner, Toggle } from '../ui'
import { GenericContextSettings } from './GenericContextSettings'
import { ConnectorManifest, JSONSchema } from '../../connectors/contract'
import type { ContextConnectorConfig, ProjectContext } from '../../context/types'
import { getContextFolderPath } from '../../context/types'

interface ConnectorItem {
  id: string
  name: string
  contextSchema?: JSONSchema
}

interface ContextConnectorsPanelProps {
  context: ProjectContext
  onSaved: (contexts: ProjectContext[]) => void
}

function defaultConnectorEntry(): ContextConnectorConfig {
  return { enabled: false, config: {} }
}

export function ContextConnectorsPanel({ context, onSaved }: ContextConnectorsPanelProps) {
  const { contexts: contextsAPI, connectors: connectorsAPI } = useElectron()
  const [draft, setDraft] = useState<ProjectContext>(context)
  const [connectors, setConnectors] = useState<ConnectorItem[]>([])
  const [loadingConnectors, setLoadingConnectors] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setDraft(context)
  }, [context])

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

  async function persist(next: ProjectContext) {
    setSaving(true)
    setError(null)
    try {
      const result = await contextsAPI.save(next)
      if (result.success && result.data) {
        setDraft(next)
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

  function updateConnector(connectorId: string, patch: Partial<ContextConnectorConfig>) {
    const current = draft.connectors[connectorId] ?? defaultConnectorEntry()
    const next: ProjectContext = {
      ...draft,
      connectors: {
        ...draft.connectors,
        [connectorId]: { ...current, ...patch },
      },
    }
    void persist(next)
  }

  function setConnectorEnabled(connectorId: string, enabled: boolean) {
    const current = draft.connectors[connectorId] ?? defaultConnectorEntry()
    updateConnector(connectorId, { enabled, config: enabled ? current.config : {} })
  }

  function setConnectorConfig(connectorId: string, config: Record<string, unknown>) {
    updateConnector(connectorId, { config })
  }

  return (
    <div className="space-y-4">
      <p className="ui-type-ui">
        Folder: <code className="ui-text-meta">{getContextFolderPath(draft)}</code>
        {saving ? <span className="ml-2 ui-text-meta">Saving…</span> : null}
      </p>

      {loadingConnectors ? (
        <Spinner size="sm" />
      ) : connectors.length === 0 ? (
        <Callout>No connectors installed. Add connectors from the Connectors page first.</Callout>
      ) : (
        <div className="space-y-3">
          {connectors.map(connector => {
            const entry = draft.connectors[connector.id] ?? defaultConnectorEntry()
            return (
              <div key={connector.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="ui-text-strong text-neutral-900">{connector.name}</p>
                    {!connector.contextSchema && entry.enabled ? (
                      <p className="mt-0.5 ui-text-meta">No per-context settings for this connector.</p>
                    ) : null}
                  </div>
                  <Toggle
                    checked={entry.enabled}
                    onChange={event => setConnectorEnabled(connector.id, event.target.checked)}
                    label={`Enable ${connector.name} for this context`}
                    className="ui-toggle--compact shrink-0"
                  />
                </div>

                {entry.enabled && connector.contextSchema ? (
                  <div className="mt-4 border-t border-gray-100 pt-4">
                    <GenericContextSettings
                      schema={connector.contextSchema}
                      value={entry.config}
                      onChange={config => setConnectorConfig(connector.id, config)}
                    />
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}

      {error && <Alert>{error}</Alert>}
    </div>
  )
}
