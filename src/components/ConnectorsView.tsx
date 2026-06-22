import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  CatalogEntry,
  getBuiltinCatalogEntries,
  INTEGRATION_TYPE_LABELS,
  isWorkspaceConnectorConfigured,
  mergeCatalogEntries,
} from '../connectors/catalog'
import { ConnectorManifest } from '../connectors/contract'
import { useElectron } from '../hooks/useElectron'
import { GenericConnectorSettingsView } from './connectors/GenericConnectorSettingsView'
import { ConnectorPageHeader } from './connectors/ConnectorPageHeader'
import { Alert, Badge, Button, Input, Panel, Spinner } from './ui'

const CONNECTOR_LOADING_MIN_MS = 700

function CatalogEntryIcon({
  connector,
  iconDataUrl,
}: {
  connector: CatalogEntry
  iconDataUrl?: string | null
}) {
  if (connector.CatalogGraphic) {
    const Graphic = connector.CatalogGraphic
    return <Graphic className="connector-card-icon" />
  }

  const src = iconDataUrl?.trim()
  if (src) {
    return (
      <img
        src={src}
        alt=""
        className="connector-card-icon object-contain"
      />
    )
  }
  const Icon = connector.Icon
  return <Icon />
}

function ConnectorCard({
  connector,
  connected,
  iconDataUrl,
  onClick,
}: {
  connector: CatalogEntry
  connected?: boolean
  iconDataUrl?: string | null
  onClick: () => void
}) {
  const typeLabel = connector.integrationType
    ? INTEGRATION_TYPE_LABELS[connector.integrationType]
    : null

  return (
    <button
      onClick={onClick}
      className="connector-card relative"
      title={connector.description}
    >
      <CatalogEntryIcon connector={connector} iconDataUrl={iconDataUrl} />
      <span className="connector-card-name">{connector.name}</span>
      {typeLabel && (
        <Badge className="connector-card-type-badge ui-text-meta font-normal">
          {typeLabel}
        </Badge>
      )}
      {connected && (
        <span
          className="connector-card-active-dot absolute right-2 top-2 h-2 w-2 rounded-full bg-green-600"
          title="Active"
          aria-label="Connector active"
        />
      )}
    </button>
  )
}

function ConnectorInstallView({
  entry,
  onBack,
  onInstalled,
}: {
  entry: CatalogEntry
  onBack: () => void
  onInstalled: () => void
}) {
  const { connectors } = useElectron()
  const [installing, setInstalling] = useState(false)
  const [installError, setInstallError] = useState<string | null>(null)

  async function handleInstall() {
    setInstalling(true)
    setInstallError(null)
    try {
      const result = await connectors.installPackage(entry.id)
      if (!result.success) throw new Error(result.error || 'Install failed')
      onInstalled()
    } catch (err) {
      setInstallError(err instanceof Error ? err.message : 'Install failed')
    } finally {
      setInstalling(false)
    }
  }

  const typeLabel = entry.integrationType ? INTEGRATION_TYPE_LABELS[entry.integrationType] : null

  return (
    <div className="ui-page-frame">
      <div className="content-shell page-shell space-y-6">
        <ConnectorPageHeader
          name={entry.name}
          description={entry.description}
          integrationLabel={typeLabel}
          onBack={onBack}
        />

        <Panel variant="soft" className="space-y-4">
          <p className="ui-type-ui">
            Install copies this connector into your workspace at{' '}
            <code className="ui-inline-code">.smile/connectors/{entry.id}/</code>.
            You can configure credentials after installation.
          </p>
          {installError && <Alert>{installError}</Alert>}
          <Button
            variant="primary"
            size="sm"
            className="w-fit"
            loading={installing}
            loadingLabel="Installing…"
            onClick={() => void handleInstall()}
          >
            Install
          </Button>
        </Panel>
      </div>
    </div>
  )
}

function ConnectorDetailView({
  entry,
  connectorId,
  workspaceManifest,
  onBack,
  onInstalled,
  onConnectionChange,
}: {
  entry?: CatalogEntry
  connectorId: string
  workspaceManifest?: CatalogEntry['manifest']
  onBack: () => void
  onInstalled: () => void
  onConnectionChange: (connectorId: string, connected: boolean) => void
}) {
  if (workspaceManifest) {
    return (
      <GenericConnectorSettingsView
        manifest={workspaceManifest}
        onBack={onBack}
        onConnectionChange={connected => onConnectionChange(connectorId, connected)}
      />
    )
  }

  if (entry?.origin === 'bundled') {
    return <ConnectorInstallView entry={entry} onBack={onBack} onInstalled={onInstalled} />
  }

  return (
    <div className="content-shell page-shell">
      <Alert>Connector not found.</Alert>
      <button type="button" className="mt-4 ui-text-base underline" onClick={onBack}>
        Back to catalog
      </button>
    </div>
  )
}

export default function ConnectorsView() {
  const { connectors, mcp, storage } = useElectron()
  const [selectedConnectorId, setSelectedConnectorId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [loadingCatalog, setLoadingCatalog] = useState(true)
  const [loadingConnectionState, setLoadingConnectionState] = useState(true)
  const [mcpConnected, setMcpConnected] = useState(false)
  const [workspaceConnectors, setWorkspaceConnectors] = useState<Array<{ manifest: ConnectorManifest; promptMarkdown: string }>>([])
  const [discoveryErrors, setDiscoveryErrors] = useState<Array<{ id: string; errors: string[] }>>([])
  const [connectedIds, setConnectedIds] = useState<Set<string>>(new Set())
  const [iconUrls, setIconUrls] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  const catalog = useMemo(
    () => mergeCatalogEntries(getBuiltinCatalogEntries(), workspaceConnectors),
    [workspaceConnectors],
  )

  const selectedEntry = useMemo(
    () => catalog.find(entry => entry.id === selectedConnectorId),
    [catalog, selectedConnectorId],
  )

  const filteredCatalog = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return catalog
    return catalog.filter(entry =>
      entry.name.toLowerCase().includes(query)
      || entry.description.toLowerCase().includes(query)
      || entry.id.toLowerCase().includes(query),
    )
  }, [catalog, search])

  const refreshConnectedState = useCallback(async (entries: CatalogEntry[], mcpIsConnected: boolean) => {
    const next = new Set<string>()
    for (const entry of entries) {
      if (entry.manifest && await isWorkspaceConnectorConfigured(entry.manifest, storage.getSecure, mcpIsConnected)) {
        next.add(entry.id)
      }
    }
    setConnectedIds(next)
  }, [storage.getSecure])

  const loadCatalog = useCallback(async () => {
    setLoadingCatalog(true)
    try {
      const result = await connectors.list()
      if (result.success && result.data) {
        setWorkspaceConnectors(result.data.connectors)
        setDiscoveryErrors(result.data.errors)
      } else if (result.error) {
        setError(result.error)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load connectors')
    } finally {
      setLoadingCatalog(false)
    }
  }, [connectors])

  const loadMcpState = useCallback(async () => {
    setLoadingConnectionState(true)
    const startedAt = Date.now()
    let keepLoading = false
    try {
      const [status, connectionState] = await Promise.all([mcp.status(), mcp.getConnectionState()])
      const connected = status.connected || connectionState.connected
      setMcpConnected(connected)
      keepLoading = connectionState.state === 'connecting' || connectionState.state === 'oauth_pending'
      await refreshConnectedState(catalog, connected)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load connector state')
    } finally {
      if (!keepLoading) {
        const elapsed = Date.now() - startedAt
        const remaining = Math.max(0, CONNECTOR_LOADING_MIN_MS - elapsed)
        window.setTimeout(() => setLoadingConnectionState(false), remaining)
      }
    }
  }, [catalog, mcp, refreshConnectedState])

  useEffect(() => {
    void loadCatalog()
  }, [loadCatalog])

  useEffect(() => {
    void loadMcpState()
  }, [loadMcpState])

  useEffect(() => {
    void refreshConnectedState(catalog, mcpConnected)
  }, [catalog, mcpConnected, refreshConnectedState])

  useEffect(() => {
    let active = true
    void (async () => {
      const next: Record<string, string> = {}
      await Promise.all(catalog.map(async entry => {
        let dataUrl: string | null = null
        if (entry.origin === 'workspace') {
          const result = await connectors.getIcon(entry.id)
          if (result.success && result.data) dataUrl = result.data
        }
        if (!dataUrl) {
          const bundled = await connectors.getBundledIcon(entry.id)
          if (bundled.success && bundled.data) dataUrl = bundled.data
        }
        if (dataUrl) next[entry.id] = dataUrl
      }))
      if (active) setIconUrls(next)
    })()
    return () => {
      active = false
    }
  }, [catalog, connectors])

  useEffect(() => {
    const cleanup = mcp.onConnectionStateChange(state => {
      const connected = state.state === 'connected'
      const inProgress = state.state === 'connecting' || state.state === 'oauth_pending'
      setMcpConnected(connected)
      setLoadingConnectionState(inProgress)
      if (state.state === 'error' && state.error) setError(state.error)
    })
    return cleanup
  }, [mcp])

  const connectedCatalog = useMemo(
    () => catalog.filter(entry => connectedIds.has(entry.id)),
    [catalog, connectedIds],
  )

  function handleConnectionChange(connectorId: string, connected: boolean) {
    setConnectedIds(prev => {
      const next = new Set(prev)
      if (connected) next.add(connectorId)
      else next.delete(connectorId)
      return next
    })
  }

  if (selectedConnectorId) {
    return (
      <ConnectorDetailView
        entry={selectedEntry}
        connectorId={selectedConnectorId}
        workspaceManifest={selectedEntry?.manifest}
        onBack={() => {
          setSelectedConnectorId(null)
          void loadCatalog()
          void loadMcpState()
        }}
        onInstalled={() => {
          void loadCatalog().then(() => {
            void loadMcpState()
          })
        }}
        onConnectionChange={handleConnectionChange}
      />
    )
  }

  return (
    <div className="ui-page-frame">
      <div className="content-shell page-shell space-y-8">
        <section>
          <div className="flex items-center gap-3">
            <h1 className="ui-page-title">Connected</h1>
            {loadingConnectionState && (
              <div className="flex items-center gap-2 ui-type-ui">
                <Spinner size="sm" />
                <span>Checking...</span>
              </div>
            )}
          </div>
          <div className="mt-5 flex flex-wrap gap-4">
            {!loadingConnectionState && connectedCatalog.length === 0 ? (
              <p className="ui-type-ui">No connectors configured yet.</p>
            ) : (
              connectedCatalog.map(connector => (
                <ConnectorCard
                  key={connector.id}
                  connector={connector}
                  connected
                  iconDataUrl={iconUrls[connector.id]}
                  onClick={() => setSelectedConnectorId(connector.id)}
                />
              ))
            )}
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <h2 className="ui-section-title">Catalog</h2>
            {loadingCatalog && <Spinner size="sm" />}
          </div>
          <p className="ui-type-ui">
            Install connectors from the catalog into <code className="ui-inline-code">.smile/connectors/&lt;id&gt;/</code>, or author custom packages — see{' '}
            <code className="ui-inline-code">docs/creating-a-connector.md</code>.
          </p>
          <Input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search"
            className="ui-field--emphasis"
          />
          <div className="flex flex-wrap gap-4">
            {filteredCatalog.map(connector => (
              <ConnectorCard
                key={connector.id}
                connector={connector}
                connected={connectedIds.has(connector.id)}
                iconDataUrl={iconUrls[connector.id]}
                onClick={() => setSelectedConnectorId(connector.id)}
              />
            ))}
            {!loadingCatalog && filteredCatalog.length === 0 && (
              <p className="ui-type-ui">No connectors match your search.</p>
            )}
          </div>
        </section>

        {discoveryErrors.map(err => (
          <Alert key={err.id}>
            {err.id}: {err.errors.join('; ')}
          </Alert>
        ))}
        {error && <Alert>{error}</Alert>}
      </div>
    </div>
  )
}
