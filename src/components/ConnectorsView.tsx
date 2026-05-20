import { useEffect, useMemo, useState } from 'react'
import { useElectron } from '../hooks/useElectron'

interface ConnectorProject {
  id: string
  key: string
  name: string
  projectTypeKey: string
  avatarUrl?: string
  avatarUrls?: Record<string, string>
}

type ConnectorId = 'jira'

const connectorCatalog: Array<{
  id: ConnectorId
  name: string
  description: string
  status: 'available'
}> = [
  {
    id: 'jira',
    name: 'Jira',
    description: 'Example connector module for Atlassian work tracking.',
    status: 'available',
  },
]

export default function ConnectorsView() {
  const [selectedConnector, setSelectedConnector] = useState<ConnectorId | null>(null)
  const [search, setSearch] = useState('')
  const [mcpConnected, setMcpConnected] = useState(false)
  const [mcpConnecting, setMcpConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [projects, setProjects] = useState<ConnectorProject[]>([])
  const [selectedProjectKeys, setSelectedProjectKeys] = useState<Set<string>>(new Set())
  const [loadingProjects, setLoadingProjects] = useState(false)
  const [savingProjects, setSavingProjects] = useState(false)

  const { mcp, jiraMetadata } = useElectron()

  useEffect(() => {
    loadConnectorState()
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
    try {
      const [status, metadata] = await Promise.all([
        mcp.status(),
        jiraMetadata.get(),
      ])
      setMcpConnected(status.connected)
      setSelectedProjectKeys(new Set(metadata.monitoredProjects.map(project => project.key)))
      if (metadata.monitoredProjects.length > 0) {
        setProjects(metadata.monitoredProjects)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load connector state')
    }
  }

  async function connectJira() {
    setMcpConnecting(true)
    setError(null)
    try {
      const result = await mcp.connect({ forceReauth: true })
      if (!result.success) {
        setError(result.error || 'Failed to connect connector')
        return
      }
      setMcpConnected(true)
      await loadProjects()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect connector')
    } finally {
      setMcpConnecting(false)
    }
  }

  async function loadProjects() {
    setLoadingProjects(true)
    setError(null)
    try {
      const result = await mcp.getProjects()
      if (!result.success || !Array.isArray(result.data)) {
        setError(result.error || 'Failed to load projects')
        return
      }
      setProjects(result.data as ConnectorProject[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects')
    } finally {
      setLoadingProjects(false)
    }
  }

  async function saveProjects() {
    setSavingProjects(true)
    setError(null)
    try {
      const selected = projects.filter(project => selectedProjectKeys.has(project.key))
      await jiraMetadata.setMonitoredProjects(selected.map(project => ({
        id: project.id,
        key: project.key,
        name: project.name,
        projectTypeKey: project.projectTypeKey,
        avatarUrl: project.avatarUrls?.['48x48'] || project.avatarUrl,
      })))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save projects')
    } finally {
      setSavingProjects(false)
    }
  }

  function toggleProject(projectKey: string) {
    setSelectedProjectKeys(prev => {
      const next = new Set(prev)
      if (next.has(projectKey)) next.delete(projectKey)
      else next.add(projectKey)
      return next
    })
  }

  if (selectedConnector === 'jira') {
    return (
      <div className="h-full overflow-y-auto bg-white">
        <div className="max-w-3xl px-10 py-8 space-y-8">
          <button
            onClick={() => setSelectedConnector(null)}
            className="text-sm underline underline-offset-4"
          >
            Connected/Jira
          </button>

          <section className="space-y-4">
            <div>
              <h1 className="text-xl font-medium text-neutral-950">Atlassian connection</h1>
              <p className="text-sm text-neutral-500 mt-1">
                This connector is intentionally isolated from the core framework.
              </p>
            </div>

            <button
              onClick={connectJira}
              disabled={mcpConnecting}
              className="min-w-44 rounded-xl border-2 border-neutral-950 px-6 py-3 text-sm font-medium hover:bg-neutral-950 hover:text-white disabled:opacity-50"
            >
              {mcpConnecting ? 'Connecting...' : mcpConnected ? 'Reconnect to Atlassian' : 'Connect to Atlassian'}
            </button>
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-medium text-neutral-950">Monitored projects</h2>
                <p className="text-sm text-neutral-500">Optional connector-specific scope.</p>
              </div>
              <button
                onClick={loadProjects}
                disabled={!mcpConnected || loadingProjects}
                className="rounded-xl border border-neutral-950 px-4 py-2 text-sm hover:bg-neutral-950 hover:text-white disabled:opacity-50"
              >
                {loadingProjects ? 'Loading...' : 'Load projects'}
              </button>
            </div>

            <div className="rounded-2xl border-2 border-neutral-950 p-3">
              {projects.length === 0 ? (
                <p className="px-2 py-6 text-center text-sm text-neutral-500">
                  Connect and load projects to select a scope.
                </p>
              ) : (
                <div className="max-h-72 space-y-2 overflow-y-auto">
                  {projects.map(project => (
                    <label
                      key={project.id}
                      className="flex cursor-pointer items-center gap-3 rounded-xl border border-neutral-200 p-3 hover:border-neutral-950"
                    >
                      <input
                        type="checkbox"
                        checked={selectedProjectKeys.has(project.key)}
                        onChange={() => toggleProject(project.key)}
                      />
                      <span className="font-medium">{project.name}</span>
                      <span className="text-sm text-neutral-500">{project.key}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={saveProjects}
              disabled={savingProjects || projects.length === 0}
              className="rounded-xl bg-neutral-950 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
            >
              {savingProjects ? 'Saving...' : 'Save selected projects'}
            </button>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-medium text-neutral-950">Connector notes</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {['System prompt extension', 'Read/write tool registration', 'Human approval prompts'].map(item => (
                <div key={item} className="rounded-2xl border border-neutral-950 p-4 text-sm">
                  {item}
                </div>
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

  return (
    <div className="h-full overflow-y-auto bg-white">
      <div className="max-w-5xl px-10 py-8 space-y-8">
        <section>
          <h1 className="text-xl font-medium text-neutral-950">Connected</h1>
          <div className="mt-5 flex flex-wrap gap-4">
            {connectedConnectors.length === 0 ? (
              <p className="text-sm text-neutral-500">No connectors connected yet.</p>
            ) : (
              connectedConnectors.map(connector => (
                <button
                  key={connector.id}
                  onClick={() => setSelectedConnector(connector.id)}
                  className="flex h-24 w-24 items-center justify-center rounded-2xl border-2 border-neutral-950 text-sm font-medium hover:bg-neutral-950 hover:text-white"
                >
                  {connector.name}
                </button>
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

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
            {filteredCatalog.map(connector => (
              <button
                key={connector.id}
                onClick={() => setSelectedConnector(connector.id)}
                className="flex h-24 items-center justify-center rounded-2xl border-2 border-neutral-950 px-3 text-sm font-medium hover:bg-neutral-950 hover:text-white"
                title={connector.description}
              >
                {connector.name}
              </button>
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
