import { useEffect, useMemo, useState } from 'react'

import { useElectron } from '../hooks/useElectron'
import { Alert, Input, Spinner } from './ui'

import { jiraCatalogEntry, JiraSettingsView } from '../connectors/jira/ui'
import { ConnectorManifest, ConnectorPermissions } from '../connectors/contract'

function describePermissions(permissions: ConnectorPermissions): string {
  const parts: string[] = []
  if (permissions.http?.length) parts.push(`http(${permissions.http.length})`)
  if (permissions.mcp?.length) parts.push(`mcp(${permissions.mcp.join(', ')})`)
  if (permissions.file?.read || permissions.file?.write) {
    parts.push(`file(${[permissions.file?.read && 'read', permissions.file?.write && 'write'].filter(Boolean).join('/')})`)
  }
  if (permissions.secrets?.length) parts.push(`secrets(${permissions.secrets.length})`)
  return parts.length ? parts.join(' · ') : 'none'
}

function PluginConnectorsSection() {
  const { connectors } = useElectron()
  const [loading, setLoading] = useState(true)
  const [plugins, setPlugins] = useState<Array<{ manifest: ConnectorManifest; promptMarkdown: string }>>([])
  const [discoveryErrors, setDiscoveryErrors] = useState<Array<{ id: string; errors: string[] }>>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const result = await connectors.list()
        if (!active) return
        if (result.success && result.data) {
          setPlugins(result.data.connectors)
          setDiscoveryErrors(result.data.errors)
        } else if (result.error) {
          setLoadError(result.error)
        }
      } catch (err) {
        if (active) setLoadError(err instanceof Error ? err.message : 'Failed to load plugins')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [connectors])

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-medium text-neutral-950">Plugins</h2>
        {loading && <Spinner size="sm" />}
      </div>
      <p className="text-sm text-neutral-500">
        Declarative connectors discovered in <code>.smile/connectors</code> of your workspace.
      </p>

      {!loading && plugins.length === 0 && discoveryErrors.length === 0 && (
        <p className="text-sm text-neutral-500">No plugin connectors installed yet.</p>
      )}

      <div className="space-y-3">
        {plugins.map(({ manifest }) => (
          <div key={manifest.id} className="rounded-lg border border-neutral-200 p-4">
            <div className="flex items-baseline justify-between">
              <h3 className="font-medium text-neutral-950">{manifest.name}</h3>
              <span className="text-xs text-neutral-400">
                v{manifest.version} · api {manifest.apiVersion}
              </span>
            </div>
            {manifest.description && <p className="mt-1 text-sm text-neutral-500">{manifest.description}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              {manifest.tools.map(tool => (
                <span
                  key={tool.name}
                  className="rounded border border-neutral-200 px-2 py-0.5 text-xs text-neutral-600"
                  title={tool.description}
                >
                  {tool.name}
                  {tool.requiresConfirmation ? ' · confirm' : ''}
                </span>
              ))}
            </div>
            {manifest.permissions && (
              <p className="mt-2 text-xs text-neutral-400">Permissions: {describePermissions(manifest.permissions)}</p>
            )}
          </div>
        ))}
      </div>

      {discoveryErrors.map(err => (
        <Alert key={err.id}>
          {err.id}: {err.errors.join('; ')}
        </Alert>
      ))}
      {loadError && <Alert>{loadError}</Alert>}
    </section>
  )
}



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
      const inProgress = state.state === 'connecting' || state.state === 'oauth_pending'
      setMcpConnected(connected)
      setLoadingConnectorState(inProgress)
      if (state.state === 'error' && state.error) {
        setError(state.error)
      }
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
        || connectionState.state === 'oauth_pending'

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

        onBack={() => {
          setSelectedConnector(null)
          void loadConnectorState()
        }}

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

                <Spinner size="sm" />

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

                onClick={() => setSelectedConnector(connector.id)}

              />

            ))}

          </div>

        </section>



        <PluginConnectorsSection />



        {error && <Alert>{error}</Alert>}

      </div>

    </div>

  )

}

