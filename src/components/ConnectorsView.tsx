import { useEffect, useMemo, useState } from 'react'

import { useElectron } from '../hooks/useElectron'
import { Alert, Input, Spinner } from './ui'

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



        {error && <Alert>{error}</Alert>}

      </div>

    </div>

  )

}

