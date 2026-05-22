import { useEffect, useMemo, useState } from 'react'
import { useElectron } from '../hooks/useElectron'
import { jiraCatalogEntry, JiraSettingsView } from '../connectors/jira/ui'

const CONNECTOR_LOADING_MIN_MS = 700

const connectorCatalog = [jiraCatalogEntry]

type ConnectorId = (typeof connectorCatalog)[number]['id']

function ConnectorCard({
  connector,
  onClick,
}: {
  connector: (typeof connectorCatalog)[number]
  onClick: () => void
}) {
  const Icon = connector.Icon

  return (
    <button
      onClick={onClick}
      className="connector-card"
      title={connector.description}
    >
      <Icon />
      <span>{connector.name}</span>
    </button>
  )
}

function ConnectorDetailView({
  connectorId,
  onBack,
  onConnectionChange,
}: {
  connectorId: ConnectorId
  onBack: () => void
  onConnectionChange: (connected: boolean) => void
}) {
  switch (connectorId) {
    case 'jira':
      return <JiraSettingsView onBack={onBack} onConnectionChange={onConnectionChange} />
    default:
      return null
  }
}

export default function ConnectorsView() {
  const [selectedConnector, setSelectedConnector] = useState<ConnectorId | null>(null)
  const [search, setSearch] = useState('')
  const [mcpConnected, setMcpConnected] = useState(false)
  const [loadingConnectorState, setLoadingConnectorState] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const { mcp } = useElectron()

  useEffect(() => {
    void loadConnectorState()

    const cleanup = mcp.onConnectionStateChange((state) => {
      const connected = state.state === 'connected'
      setMcpConnected(connected)
      setLoadingConnectorState(state.state === 'connecting')
    })

    return cleanup
  }, [])

  const filteredCatalog = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return connectorCatalog
    return connectorCatalog.filter(connector =>
      connector.name.toLowerCase().includes(query) ||
      connector.description.toLowerCase().includes(query)
    )
  }, [search])

  const connectedConnectors = mcpConnected
    ? connectorCatalog.filter(connector => connector.id === 'jira')
    : []

  async function loadConnectorState() {
    setLoadingConnectorState(true)
    const startedAt = Date.now()
    let keepLoadingForConnection = false
    try {
      const [status, connectionState] = await Promise.all([
        mcp.status(),
        mcp.getConnectionState(),
      ])
      setMcpConnected(status.connected || connectionState.connected)
      keepLoadingForConnection = connectionState.state === 'connecting'
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load connector state')
    } finally {
      if (!keepLoadingForConnection) {
        const elapsed = Date.now() - startedAt
        const remaining = Math.max(0, CONNECTOR_LOADING_MIN_MS - elapsed)
        window.setTimeout(() => setLoadingConnectorState(false), remaining)
      }
    }
  }

  if (selectedConnector) {
    return (
      <ConnectorDetailView
        connectorId={selectedConnector}
        onBack={() => setSelectedConnector(null)}
        onConnectionChange={setMcpConnected}
      />
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-white">
      <div className="content-shell page-shell space-y-8">
        <section>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-medium text-neutral-950">Connected</h1>
            {loadingConnectorState && (
              <div className="flex items-center gap-2 text-sm text-neutral-500">
                <div
                  className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-950"
                  aria-label="Loading connected connectors"
                  title="Loading connected connectors"
                />
                <span>Checking...</span>
              </div>
            )}
          </div>
          <div className="mt-5 flex flex-wrap gap-4">
            {!loadingConnectorState && connectedConnectors.length === 0 ? (
              <p className="text-sm text-neutral-500">No connectors connected yet.</p>
            ) : (
              connectedConnectors.map(connector => (
                <ConnectorCard
                  key={connector.id}
                  connector={connector}
                  onClick={() => setSelectedConnector(connector.id)}
                />
              ))
            )}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-medium text-neutral-950">Catalog</h2>
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search"
            className="w-full rounded-lg border-2 border-neutral-950 px-4 py-2"
          />

          <div className="flex flex-wrap gap-4">
            {filteredCatalog.map(connector => (
              <ConnectorCard
                key={connector.id}
                connector={connector}
                onClick={() => setSelectedConnector(connector.id)}
              />
            ))}
          </div>
        </section>

        {error && (
          <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
        )}
      </div>
    </div>
  )
}
