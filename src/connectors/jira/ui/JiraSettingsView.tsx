import { useEffect, useState } from 'react'
import { useElectron } from '../../../hooks/useElectron'
import {
  ApiConnectionModule,
  CustomSettingsModule,
  McpConnectionModule,
} from '../../../components/connectors/ConnectorSettingsModules'
import { jiraManifest } from '../manifest'

interface JiraProject {
  id: string
  key: string
  name: string
  projectTypeKey: string
  avatarUrl?: string
  avatarUrls?: Record<string, string>
}

interface JiraSettingsViewProps {
  onBack: () => void
  onConnectionChange?: (connected: boolean) => void
}

const emptyJiraMetadata = {
  monitoredProjects: [],
  projectMetadata: {},
  standardFields: [],
  users: [],
  lastSynced: null,
  syncedProjects: [],
}

const normalizeJiraSiteUrl = (url: string) => url.trim().replace(/\/+$/, '').toLowerCase()

const BackIcon = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 12H5m0 0 6-6m-6 6 6 6" />
  </svg>
)

export function JiraSettingsView({ onBack, onConnectionChange }: JiraSettingsViewProps) {
  const [mcpConnected, setMcpConnected] = useState(false)
  const [mcpConnecting, setMcpConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [projects, setProjects] = useState<JiraProject[]>([])
  const [selectedProjectKeys, setSelectedProjectKeys] = useState<Set<string>>(new Set())
  const [loadingProjects, setLoadingProjects] = useState(false)
  const [savingProjects, setSavingProjects] = useState(false)
  const [jiraApiForm, setJiraApiForm] = useState({ baseUrl: '', email: '', apiToken: '' })
  const [hasJiraApiToken, setHasJiraApiToken] = useState(false)
  const [jiraApiSaveStatus, setJiraApiSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')

  const { mcp, jiraMetadata, storage } = useElectron()

  async function clearProjectScope() {
    setProjects([])
    setSelectedProjectKeys(new Set())
    await jiraMetadata.setMonitoredProjects([])
  }

  useEffect(() => {
    void loadSettings()

    const cleanup = mcp.onConnectionStateChange((state) => {
      const connected = state.state === 'connected'
      setMcpConnected(connected)
      onConnectionChange?.(connected)
      if (connected) {
        void loadSettings()
      } else {
        void clearProjectScope()
      }
    })

    return cleanup
  }, [])

  async function loadSettings() {
    try {
      const [status, connectionState, metadata] = await Promise.all([
        mcp.status(),
        mcp.getConnectionState(),
        jiraMetadata.get(),
      ])
      const connected = status.connected || connectionState.connected
      setMcpConnected(connected)
      onConnectionChange?.(connected)

      if (!connected) {
        if (metadata.monitoredProjects.length > 0) {
          await jiraMetadata.setMonitoredProjects([])
        }
        setProjects([])
        setSelectedProjectKeys(new Set())
      } else {
        setSelectedProjectKeys(new Set(metadata.monitoredProjects.map(project => project.key)))
        if (metadata.monitoredProjects.length > 0) {
          setProjects(metadata.monitoredProjects)
        }
      }

      const jiraConfigStr = await storage.getSecure('jiraApiConfig')
      if (jiraConfigStr) {
        const jiraConfig = JSON.parse(jiraConfigStr)
        setHasJiraApiToken(true)
        setJiraApiForm({
          baseUrl: jiraConfig.baseUrl || '',
          email: jiraConfig.email || '',
          apiToken: '••••••••',
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load connector settings')
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
      onConnectionChange?.(true)
      await loadProjects()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect connector')
    } finally {
      setMcpConnecting(false)
    }
  }

  async function disconnectJira() {
    try {
      await mcp.disconnect()
      setMcpConnected(false)
      onConnectionChange?.(false)
      await clearProjectScope()
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect connector')
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
      setProjects(result.data as JiraProject[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects')
    } finally {
      setLoadingProjects(false)
    }
  }

  async function saveProjects() {
    if (!mcpConnected || projects.length === 0) return

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
      if (selected.length > 0) {
        const result = await mcp.syncAllMetadata(selected.map(project => project.key))
        if (result.success && result.metadata) {
          const syncedMetadata = result.metadata as {
            users?: Array<{ accountId: string; displayName: string; emailAddress?: string; avatarUrl?: string; active: boolean }>
          }
          if (syncedMetadata.users?.length) {
            await jiraMetadata.setUsers(syncedMetadata.users)
          }
        }
      }
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

  async function saveJiraApiConfig() {
    setJiraApiSaveStatus('idle')

    if (!jiraApiForm.baseUrl || !jiraApiForm.email) {
      setJiraApiSaveStatus('error')
      return
    }

    let apiToken = jiraApiForm.apiToken
    if (apiToken === '••••••••') {
      const existingConfig = await storage.getSecure('jiraApiConfig')
      if (!existingConfig) {
        setJiraApiSaveStatus('error')
        return
      }
      apiToken = JSON.parse(existingConfig).apiToken
    }

    if (!apiToken) {
      setJiraApiSaveStatus('error')
      return
    }

    setSavingProjects(true)
    try {
      const existingConfigStr = await storage.getSecure('jiraApiConfig')
      const existingBaseUrl = existingConfigStr ? JSON.parse(existingConfigStr).baseUrl || null : null
      const configToSave = {
        baseUrl: jiraApiForm.baseUrl.replace(/\/$/, ''),
        email: jiraApiForm.email,
        apiToken,
      }
      const siteChanged = !!existingBaseUrl
        && normalizeJiraSiteUrl(existingBaseUrl) !== normalizeJiraSiteUrl(configToSave.baseUrl)

      await storage.setSecure('jiraApiConfig', JSON.stringify(configToSave))
      if (siteChanged) {
        await jiraMetadata.set(emptyJiraMetadata)
        await mcp.disconnect()
        setMcpConnected(false)
        onConnectionChange?.(false)
        await clearProjectScope()
        setError('Jira site changed. Reconnect to Atlassian, then select the projects this connector should expose.')
      }

      setHasJiraApiToken(true)
      setJiraApiForm(prev => ({ ...prev, apiToken: '••••••••' }))
      setJiraApiSaveStatus('success')
      setTimeout(() => setJiraApiSaveStatus('idle'), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save API token')
      setJiraApiSaveStatus('error')
    } finally {
      setSavingProjects(false)
    }
  }

  async function clearJiraApiConfig() {
    if (!confirm('Remove Jira API token? Attachments will stop working until you add a new token.')) return
    try {
      await storage.setSecure('jiraApiConfig', '')
      await jiraMetadata.set(emptyJiraMetadata)
      await mcp.disconnect()
      setHasJiraApiToken(false)
      setJiraApiForm({ baseUrl: '', email: '', apiToken: '' })
      setMcpConnected(false)
      onConnectionChange?.(false)
      await clearProjectScope()
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove API token')
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-white">
      <div className="content-shell page-shell space-y-8">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-700 transition-colors hover:bg-neutral-100 hover:text-neutral-950"
            aria-label="Back to connectors"
            title="Back to connectors"
          >
            <BackIcon />
          </button>
          <div className="text-lg font-medium text-neutral-950">
            Connected / {jiraManifest.name}
          </div>
        </div>

        <McpConnectionModule
          title="Atlassian MCP connection"
          description="OAuth connection used by the Jira connector for reading, creating, and updating Jira records through Atlassian MCP."
          connected={mcpConnected}
          connecting={mcpConnecting}
          onConnect={connectJira}
          onDisconnect={disconnectJira}
          connectLabel="Connect to Atlassian"
          reconnectLabel="Reconnect to Atlassian"
        />

        <ApiConnectionModule
          title="Jira API connection"
          description="Optional REST API credentials for connector features Atlassian MCP does not cover, such as uploading images and videos up to 10MB per file."
          configured={hasJiraApiToken}
          saving={savingProjects}
          saveDisabled={!jiraApiForm.baseUrl || !jiraApiForm.email || (!jiraApiForm.apiToken && !hasJiraApiToken)}
          saveStatus={jiraApiSaveStatus}
          onSave={saveJiraApiConfig}
          onRemove={clearJiraApiConfig}
          saveLabel="Save API connection"
        >
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Jira site URL</label>
            <input
              type="text"
              value={jiraApiForm.baseUrl}
              onChange={event => setJiraApiForm({ ...jiraApiForm, baseUrl: event.target.value })}
              placeholder="https://your-domain.atlassian.net"
              className="w-full rounded-xl border border-neutral-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Email</label>
            <input
              type="email"
              value={jiraApiForm.email}
              onChange={event => setJiraApiForm({ ...jiraApiForm, email: event.target.value })}
              placeholder="you@example.com"
              className="w-full rounded-xl border border-neutral-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">API token</label>
            <input
              type="password"
              value={jiraApiForm.apiToken}
              onChange={event => setJiraApiForm({ ...jiraApiForm, apiToken: event.target.value })}
              onFocus={() => jiraApiForm.apiToken === '••••••••' && setJiraApiForm({ ...jiraApiForm, apiToken: '' })}
              placeholder="Token for this connector"
              className="w-full rounded-xl border border-neutral-300 px-3 py-2"
            />
            <p className="mt-1 text-xs text-neutral-500">
              This connector stores the token securely and uses it only for attachment uploads and site matching.
            </p>
          </div>
        </ApiConnectionModule>

        <CustomSettingsModule
          title={jiraManifest.ui.scopeLabel}
          description="Choose which Jira projects the agent can access. Only selected projects are used for search, metadata sync, and write actions."
          action={(
            <button
              onClick={loadProjects}
              disabled={!mcpConnected || loadingProjects}
              className="shrink-0 rounded-xl border border-neutral-950 px-4 py-2 text-sm hover:bg-neutral-950 hover:text-white disabled:opacity-50"
            >
              {loadingProjects ? 'Loading...' : 'Load projects'}
            </button>
          )}
          footer={(
            <button
              onClick={saveProjects}
              disabled={!mcpConnected || savingProjects || projects.length === 0}
              className="rounded-xl bg-neutral-950 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
            >
              {savingProjects ? 'Saving...' : 'Save selected projects'}
            </button>
          )}
        >
          {projects.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-neutral-500">
              Connect to Atlassian, then load projects to choose a scope.
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
                    disabled={!mcpConnected}
                  />
                  <span className="font-medium">{project.name}</span>
                  <span className="text-sm text-neutral-500">{project.key}</span>
                </label>
              ))}
            </div>
          )}
        </CustomSettingsModule>

        {error && (
          <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
        )}
      </div>
    </div>
  )
}
