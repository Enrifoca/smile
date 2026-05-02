import { useState, useEffect } from 'react'
import { useElectron } from '../hooks/useElectron'

interface AIConfig {
  provider: 'openai' | 'anthropic' | 'groq' | 'moonshot'
  apiKey: string
  model?: string
}

interface JiraProject {
  id: string
  key: string
  name: string
  projectTypeKey: string
  avatarUrl?: string
  avatarUrls?: Record<string, string>
}

interface SettingsViewProps {
  onResetOnboarding: () => void
}

const CheckIcon = () => (
  <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
)

const XIcon = () => (
  <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
)

const FolderIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
  </svg>
)

const LinkIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
  </svg>
)

const RefreshIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
)

export default function SettingsView({ onResetOnboarding }: SettingsViewProps) {
  const [aiConfig, setAIConfig] = useState<AIConfig | null>(null)
  const [workspace, setWorkspace] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  
  // Agent behavior
  const [maxIterations, setMaxIterations] = useState<number>(10)
  const [savingMaxIter, setSavingMaxIter] = useState(false)

  // Reasoning model
  const [reasoningForm, setReasoningForm] = useState({
    provider: 'anthropic' as 'openai' | 'anthropic' | 'groq' | 'moonshot',
    apiKey: '',
    model: '',
    useSameKey: true,
  })
  const [reasoningConfigured, setReasoningConfigured] = useState(false)
  const [savingReasoning, setSavingReasoning] = useState(false)
  const [reasoningSaveStatus, setReasoningSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')

  // MCP state
  const [mcpConnected, setMcpConnected] = useState(false)
  const [mcpConnecting, setMcpConnecting] = useState(false)
  const [mcpError, setMcpError] = useState<string | null>(null)
  
  // Monitored projects
  const [monitoredProjects, setMonitoredProjects] = useState<JiraProject[]>([])
  const [allProjects, setAllProjects] = useState<JiraProject[]>([])
  const [showProjectSelector, setShowProjectSelector] = useState(false)
  const [selectedProjectKeys, setSelectedProjectKeys] = useState<Set<string>>(new Set())
  const [loadingProjects, setLoadingProjects] = useState(false)
  
  // Form state
  const [aiForm, setAIForm] = useState({
    provider: 'openai' as 'openai' | 'anthropic' | 'groq' | 'moonshot',
    apiKey: '',
    model: '',
  })
  
  // Jira API token for attachments (REST API)
  const [jiraApiForm, setJiraApiForm] = useState({
    baseUrl: '',
    email: '',
    apiToken: '',
  })
  const [hasJiraApiToken, setHasJiraApiToken] = useState(false)

  const { storage, mcp, file, jiraMetadata: jiraMetadataAPI } = useElectron()

  const normalizeJiraSiteUrl = (url: string) => url.trim().replace(/\/+$/, '').toLowerCase()

  const emptyJiraMetadata = {
    monitoredProjects: [],
    projectMetadata: {},
    standardFields: [],
    users: [],
    lastSynced: null,
    syncedProjects: [],
  }

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      // Check MCP connection status
      const mcpStatus = await mcp.status()
      setMcpConnected(mcpStatus.connected)

      // Load monitored projects
      const metadata = await jiraMetadataAPI.get()
      if (metadata.monitoredProjects) {
        setMonitoredProjects(metadata.monitoredProjects)
        setSelectedProjectKeys(new Set(metadata.monitoredProjects.map(p => p.key)))
      }

      // Load AI config
      const aiConfigStr = await storage.getSecure('aiConfig')
      if (aiConfigStr) {
        const config = JSON.parse(aiConfigStr) as AIConfig
        setAIConfig(config)
        setAIForm({
          provider: config.provider,
          apiKey: '••••••••',
          model: config.model || '',
        })
      }

      // Load workspace
      const workspacePath = await file.getWorkspace()
      setWorkspace(workspacePath)
      
      // Load agent behavior settings
      const savedMaxIter = await storage.get('agentMaxIterations') as number | null
      if (savedMaxIter !== null && savedMaxIter !== undefined) setMaxIterations(savedMaxIter)

      // Load reasoning model config (migrates legacy plannerConfig)
      const reasoningConfigStr = await storage.getSecure('reasoningConfig')
        || await storage.getSecure('plannerConfig')
      if (reasoningConfigStr) {
        const rc = JSON.parse(reasoningConfigStr)
        setReasoningConfigured(true)
        setReasoningForm({
          provider: rc.provider || 'anthropic',
          apiKey: '••••••••',
          model: rc.model || '',
          useSameKey: false,
        })
      }

      // Load Jira API config (for attachments)
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
    } catch (error) {
      console.error('Failed to load settings:', error)
    }
  }

  // MCP Connection handlers
  const handleMCPConnect = async () => {
    setMcpConnecting(true)
    setMcpError(null)
    
    try {
      const result = await mcp.connect({ forceReauth: true })
      if (result.success) {
        setMcpConnected(true)
        // Refresh projects list
        await loadProjects(true)
      } else {
        setMcpError(result.error || 'Failed to connect')
      }
    } catch (err) {
      setMcpError(err instanceof Error ? err.message : 'Connection failed')
    } finally {
      setMcpConnecting(false)
    }
  }

  const handleMCPDisconnect = async () => {
    try {
      await mcp.disconnect()
      setMcpConnected(false)
      setAllProjects([])
      setMcpError(null)
    } catch (err) {
      console.error('Failed to disconnect:', err)
    }
  }

  const handleMCPSwitchAccount = async () => {
    if (!confirm('Reconnect Atlassian? This will clear Mirai\'s cached Atlassian login and open the browser so you can choose the right account.')) return
    await handleMCPConnect()
  }

  const loadProjects = async (force = false) => {
    if (!force && !mcpConnected) return
    
    setLoadingProjects(true)
    setMcpError(null)
    try {
      const result = await mcp.getProjects()
      if (result.success && Array.isArray(result.data)) {
        setAllProjects(result.data as JiraProject[])
      } else if (!result.success) {
        setMcpError(result.error || 'Failed to load Jira projects')
        setAllProjects([])
      }
    } catch (err) {
      console.error('Failed to load projects:', err)
      setMcpError(err instanceof Error ? err.message : 'Failed to load Jira projects')
      setAllProjects([])
    } finally {
      setLoadingProjects(false)
    }
  }

  const handleOpenProjectSelector = async () => {
    await loadProjects(true)
    setShowProjectSelector(true)
  }

  const toggleProject = (key: string) => {
    const newSelected = new Set(selectedProjectKeys)
    if (newSelected.has(key)) {
      newSelected.delete(key)
    } else {
      newSelected.add(key)
    }
    setSelectedProjectKeys(newSelected)
  }

  const saveMonitoredProjects = async () => {
    setIsSaving(true)
    try {
      const selected = allProjects.filter(p => selectedProjectKeys.has(p.key))
      await jiraMetadataAPI.setMonitoredProjects(selected.map(p => ({
        id: p.id,
        key: p.key,
        name: p.name,
        projectTypeKey: p.projectTypeKey,
        avatarUrl: p.avatarUrls?.['48x48'] || p.avatarUrl
      })))
      setMonitoredProjects(selected)
      setShowProjectSelector(false)
      
      // Sync ALL metadata for selected projects (issue types, fields, users)
      if (selected.length > 0) {
        const result = await mcp.syncAllMetadata(selected.map(p => p.key))
        
        if (result.success && result.metadata) {
          const syncedMetadata = result.metadata as {
            projects: Record<string, unknown>
            users: Array<{ accountId: string; displayName: string; emailAddress?: string; avatarUrl?: string; active: boolean }>
          }
          
          // Save users if found
          if (syncedMetadata.users && syncedMetadata.users.length > 0) {
            await jiraMetadataAPI.setUsers(syncedMetadata.users)
          }
        }
      }
    } catch (err) {
      console.error('Failed to save projects:', err)
    } finally {
      setIsSaving(false)
    }
  }

  const saveAIConfig = async () => {
    if (!aiForm.provider || !aiForm.apiKey) return

    setIsSaving(true)
    try {
      const config: AIConfig = {
        provider: aiForm.provider,
        apiKey: aiForm.apiKey === '••••••••'
          ? aiConfig?.apiKey || ''
          : aiForm.apiKey,
        model: aiForm.model || undefined,
      }

      await storage.setSecure('aiConfig', JSON.stringify(config))
      setAIConfig(config)
    } catch (error) {
      console.error('Failed to save AI config:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const saveReasoningConfig = async () => {
    setSavingReasoning(true)
    try {
      let apiKey = reasoningForm.apiKey

      if (reasoningForm.useSameKey) {
        const chatConfigStr = await storage.getSecure('aiConfig')
        if (chatConfigStr) apiKey = JSON.parse(chatConfigStr).apiKey
      } else if (apiKey === '••••••••') {
        const existing = await storage.getSecure('reasoningConfig')
          || await storage.getSecure('plannerConfig')
        if (existing) apiKey = JSON.parse(existing).apiKey
      }

      if (!apiKey) {
        setReasoningSaveStatus('error')
        setTimeout(() => setReasoningSaveStatus('idle'), 3000)
        return
      }

      const config = { provider: reasoningForm.provider, apiKey, model: reasoningForm.model || undefined }
      await storage.setSecure('reasoningConfig', JSON.stringify(config))
      setReasoningConfigured(true)
      setReasoningSaveStatus('success')
      setTimeout(() => setReasoningSaveStatus('idle'), 3000)
    } catch {
      setReasoningSaveStatus('error')
      setTimeout(() => setReasoningSaveStatus('idle'), 3000)
    } finally {
      setSavingReasoning(false)
    }
  }

  const saveMaxIterations = async (value: number) => {
    setSavingMaxIter(true)
    try {
      await storage.set('agentMaxIterations', value)
    } finally {
      setSavingMaxIter(false)
    }
  }

  const selectWorkspace = async () => {
    try {
      const result = await file.selectWorkspace()
      if (result.success && result.path) {
        setWorkspace(result.path)
      }
    } catch (error) {
      console.error('Failed to select workspace:', error)
    }
  }

  const [jiraApiSaveStatus, setJiraApiSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')
  
  const saveJiraApiConfig = async () => {
    // Validate required fields
    if (!jiraApiForm.baseUrl || !jiraApiForm.email) {
      console.log('Missing baseUrl or email')
      setJiraApiSaveStatus('error')
      setTimeout(() => setJiraApiSaveStatus('idle'), 3000)
      return
    }
    
    // If token is masked, we need to get the existing token
    let tokenToSave = jiraApiForm.apiToken
    if (jiraApiForm.apiToken === '••••••••') {
      // Load existing config to get the token
      const existingConfig = await storage.getSecure('jiraApiConfig')
      if (existingConfig) {
        try {
          const parsed = JSON.parse(existingConfig)
          tokenToSave = parsed.apiToken
        } catch {
          console.error('Failed to parse existing config')
          setJiraApiSaveStatus('error')
          setTimeout(() => setJiraApiSaveStatus('idle'), 3000)
          return
        }
      } else {
        // No existing config and no new token entered
        console.log('No API token provided')
        setJiraApiSaveStatus('error')
        setTimeout(() => setJiraApiSaveStatus('idle'), 3000)
        return
      }
    }
    
    if (!tokenToSave) {
      console.log('No API token to save')
      setJiraApiSaveStatus('error')
      setTimeout(() => setJiraApiSaveStatus('idle'), 3000)
      return
    }

    setIsSaving(true)
    setJiraApiSaveStatus('idle')
    try {
      const existingConfigStr = await storage.getSecure('jiraApiConfig')
      let existingBaseUrl: string | null = null
      if (existingConfigStr) {
        try {
          existingBaseUrl = JSON.parse(existingConfigStr).baseUrl || null
        } catch {
          existingBaseUrl = null
        }
      }

      const configToSave = {
        baseUrl: jiraApiForm.baseUrl.replace(/\/$/, ''), // Remove trailing slash
        email: jiraApiForm.email,
        apiToken: tokenToSave,
      }
      const siteChanged = !!existingBaseUrl
        && normalizeJiraSiteUrl(existingBaseUrl) !== normalizeJiraSiteUrl(configToSave.baseUrl)

      console.log('Saving Jira API config:', { baseUrl: configToSave.baseUrl, email: configToSave.email, hasToken: !!configToSave.apiToken })
      
      await storage.setSecure('jiraApiConfig', JSON.stringify(configToSave))
      if (siteChanged) {
        await jiraMetadataAPI.set(emptyJiraMetadata)
        await mcp.disconnect()
        setMcpConnected(false)
        setMonitoredProjects([])
        setSelectedProjectKeys(new Set())
        setAllProjects([])
        setShowProjectSelector(false)
        setMcpError('Jira site changed. Reconnect to Atlassian, then select the projects you manage in this site.')
      }

      setHasJiraApiToken(true)
      setJiraApiForm(prev => ({ ...prev, apiToken: '••••••••' }))
      console.log('Jira API config saved successfully')
      setJiraApiSaveStatus('success')
      setTimeout(() => setJiraApiSaveStatus('idle'), 3000)
    } catch (error) {
      console.error('Failed to save Jira API config:', error)
      setJiraApiSaveStatus('error')
      setTimeout(() => setJiraApiSaveStatus('idle'), 3000)
    } finally {
      setIsSaving(false)
    }
  }

  const clearJiraApiConfig = async () => {
    if (!confirm('Remove Jira API token? You won\'t be able to upload attachments.')) return
    
    try {
      await storage.setSecure('jiraApiConfig', '')
      await jiraMetadataAPI.set(emptyJiraMetadata)
      await mcp.disconnect()
      setHasJiraApiToken(false)
      setJiraApiForm({ baseUrl: '', email: '', apiToken: '' })
      setMcpConnected(false)
      setMonitoredProjects([])
      setSelectedProjectKeys(new Set())
      setAllProjects([])
      setMcpError(null)
    } catch (error) {
      console.error('Failed to clear Jira API config:', error)
    }
  }

  const getModelOptions = (provider: string, mode: 'chat' | 'reasoning' = 'chat') => {
    switch (provider) {
      case 'openai':
        if (mode === 'reasoning') return [
          'o4-mini',           // Fast reasoning — recommended
          'o3',                // Strongest reasoning
          'o3-mini',           // Balanced reasoning
          'o1',                // Original reasoning model
          'gpt-4o',            // Works well with prompt-based thinking
        ]
        return [
          'gpt-4o',
          'gpt-4o-mini',
          'gpt-4-turbo',
          'gpt-3.5-turbo',
        ]
      case 'anthropic':
        if (mode === 'reasoning') return [
          'claude-3-7-sonnet-20250219',  // Extended thinking — recommended
          'claude-opus-4-5',             // Most capable
          'claude-sonnet-4-5',
          'claude-3-5-sonnet-20241022',  // Works with prompt-based thinking
        ]
        return [
          'claude-opus-4-5',
          'claude-sonnet-4-5',
          'claude-3-7-sonnet-20250219',
          'claude-3-5-sonnet-20241022',
          'claude-3-5-haiku-20241022',
          'claude-3-opus-20240229',
          'claude-3-haiku-20240307',
        ]
      case 'groq':
        if (mode === 'reasoning') return [
          'qwen/qwen3-32b',                          // Thinking-capable, 400 t/s — recommended
          'moonshotai/kimi-k2-instruct-0905',        // Strong reasoning, 262k ctx
          'deepseek-r1-distill-llama-70b',           // Native <think> reasoning
          'llama-3.3-70b-versatile',
        ]
        return [
          'openai/gpt-oss-120b',
          'openai/gpt-oss-20b',
          'llama-3.3-70b-versatile',
          'llama-3.1-8b-instant',
          'groq/compound',
          'groq/compound-mini',
          'moonshotai/kimi-k2-instruct-0905',
          'qwen/qwen3-32b',
          'meta-llama/llama-4-scout-17b-16e-instruct',
          'openai/gpt-oss-safeguard-20b',
          'whisper-large-v3',
          'whisper-large-v3-turbo',
        ]
      case 'moonshot':
        return [
          'kimi-k2.5',
          'kimi-k2-0905-preview',
          'moonshot-v1-128k',
          'moonshot-v1-32k',
          'moonshot-v1-8k',
        ]
      default:
        return []
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto p-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Settings</h1>
          <p className="text-gray-500 mt-1">
            Configure your integrations and preferences
          </p>
        </div>

        <div className="space-y-6">
          {/* Atlassian Connection */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <LinkIcon />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-800">Atlassian Connection</h2>
                  <p className="text-sm text-gray-500">Connect to Jira via Atlassian MCP</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {mcpConnected ? <CheckIcon /> : <XIcon />}
                <span className={`text-sm font-medium ${mcpConnected ? 'text-green-600' : 'text-gray-500'}`}>
                  {mcpConnected ? 'Connected' : 'Not connected'}
                </span>
              </div>
            </div>

            {mcpError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700">{mcpError}</p>
              </div>
            )}

            {mcpConnecting && (
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent"></div>
                  <p className="text-sm text-blue-700">Connecting... A browser window may open for authentication.</p>
                </div>
              </div>
            )}

            <div className="space-y-4">
              {mcpConnected ? (
                <>
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-start gap-3">
                      <CheckIcon />
                      <div>
                        <p className="font-medium text-green-800">Connected to Atlassian</p>
                        <p className="text-sm text-green-700 mt-1">
                          Mirai can access your Jira projects securely via OAuth.
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex gap-3">
                    <button
                      onClick={handleMCPDisconnect}
                      className="btn btn-secondary"
                    >
                      Disconnect
                    </button>
                    <button
                      onClick={handleMCPSwitchAccount}
                      disabled={mcpConnecting}
                      className="btn btn-primary"
                    >
                      {mcpConnecting ? 'Reconnecting...' : 'Switch Account / Site'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-600">
                    Connect your Atlassian account to allow Mirai to access your Jira projects. 
                    This uses secure OAuth authentication - no API tokens needed.
                  </p>
                  
                  <button
                    onClick={handleMCPConnect}
                    disabled={mcpConnecting}
                    className="btn btn-primary flex items-center gap-2"
                  >
                    <LinkIcon />
                    {mcpConnecting ? 'Connecting...' : 'Connect to Atlassian'}
                  </button>
                </>
              )}
            </div>
          </section>

          {/* Monitored Projects */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">Monitored Projects</h2>
                <p className="text-sm text-gray-500">Projects that Mirai will focus on</p>
              </div>
              {mcpConnected && (
                <button
                  onClick={handleOpenProjectSelector}
                  disabled={loadingProjects}
                  className="btn btn-secondary flex items-center gap-2"
                >
                  {loadingProjects ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-600 border-t-transparent"></div>
                      Loading...
                    </>
                  ) : (
                    <>
                      <RefreshIcon />
                      {monitoredProjects.length > 0 ? 'Change' : 'Select Projects'}
                    </>
                  )}
                </button>
              )}
            </div>

            {!mcpConnected ? (
              <p className="text-sm text-gray-500 italic">
                Connect to Atlassian first to select projects.
              </p>
            ) : monitoredProjects.length === 0 ? (
              <p className="text-sm text-gray-500 italic">
                No projects selected. Click "Select Projects" to choose which Jira projects Mirai should monitor.
              </p>
            ) : (
              <div className="space-y-2">
                {monitoredProjects.map(project => (
                  <div
                    key={project.id}
                    className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
                  >
                    {project.avatarUrl && (
                      <img src={project.avatarUrl} alt="" className="w-6 h-6 rounded" />
                    )}
                    <div>
                      <span className="font-medium text-gray-900">{project.name}</span>
                      <span className="text-sm text-gray-500 ml-2">({project.key})</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Project Selector Modal */}
            {showProjectSelector && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
                  <div className="p-4 border-b border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-800">Select Projects to Monitor</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      Choose which Jira projects Mirai should focus on
                    </p>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-4">
                    <div className="flex items-center justify-between mb-3 text-sm">
                      <span className="text-gray-600">
                        {selectedProjectKeys.size} of {allProjects.length} selected
                      </span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setSelectedProjectKeys(new Set(allProjects.map(p => p.key)))}
                          className="text-mirai-600 hover:underline"
                        >
                          Select all
                        </button>
                        <span className="text-gray-300">|</span>
                        <button
                          onClick={() => setSelectedProjectKeys(new Set())}
                          className="text-mirai-600 hover:underline"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      {allProjects.map(project => (
                        <label
                          key={project.id}
                          className={`flex items-center p-3 rounded-lg border cursor-pointer transition-colors ${
                            selectedProjectKeys.has(project.key)
                              ? 'border-mirai-500 bg-mirai-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedProjectKeys.has(project.key)}
                            onChange={() => toggleProject(project.key)}
                            className="sr-only"
                          />
                          <div className={`w-5 h-5 rounded border-2 mr-3 flex items-center justify-center transition-colors ${
                            selectedProjectKeys.has(project.key)
                              ? 'border-mirai-500 bg-mirai-500'
                              : 'border-gray-300'
                          }`}>
                            {selectedProjectKeys.has(project.key) && (
                              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                          {(project.avatarUrls?.['24x24'] || project.avatarUrl) && (
                            <img src={project.avatarUrls?.['24x24'] || project.avatarUrl} alt="" className="w-6 h-6 rounded mr-2" />
                          )}
                          <div className="flex-1">
                            <div className="font-medium text-gray-900">{project.name}</div>
                            <div className="text-xs text-gray-500">{project.key}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                  
                  <div className="p-4 border-t border-gray-200 flex gap-3">
                    <button
                      onClick={() => setShowProjectSelector(false)}
                      className="flex-1 btn btn-secondary"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveMonitoredProjects}
                      disabled={isSaving}
                      className="flex-1 btn btn-primary"
                    >
                      {isSaving ? 'Saving...' : 'Save Selection'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Jira API Token for Attachments */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">Jira API Token</h2>
                <p className="text-sm text-gray-500">Required for uploading attachments to Jira</p>
              </div>
              {hasJiraApiToken && (
                <div className="flex items-center gap-2">
                  <CheckIcon />
                  <span className="text-sm font-medium text-green-600">Configured</span>
                </div>
              )}
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-amber-800">
                <strong>Why is this needed?</strong> The Atlassian MCP doesn't support file uploads. 
                To attach images/files to Jira issues, we need a separate API token.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Jira Site URL
                </label>
                <input
                  type="text"
                  value={jiraApiForm.baseUrl}
                  onChange={(e) => setJiraApiForm({ ...jiraApiForm, baseUrl: e.target.value })}
                  placeholder="https://your-domain.atlassian.net"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={jiraApiForm.email}
                  onChange={(e) => setJiraApiForm({ ...jiraApiForm, email: e.target.value })}
                  placeholder="your-email@example.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  API Token
                </label>
                <input
                  type="password"
                  value={jiraApiForm.apiToken}
                  onChange={(e) => setJiraApiForm({ ...jiraApiForm, apiToken: e.target.value })}
                  onFocus={() => jiraApiForm.apiToken === '••••••••' && setJiraApiForm({ ...jiraApiForm, apiToken: '' })}
                  placeholder="Your Jira API token"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Get your token from <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noopener noreferrer" className="text-mirai-600 hover:underline">Atlassian Account Settings</a>
                </p>
              </div>

              <div className="flex gap-3 items-center">
                <button
                  onClick={saveJiraApiConfig}
                  disabled={isSaving || !jiraApiForm.baseUrl || !jiraApiForm.email || (!jiraApiForm.apiToken && !hasJiraApiToken)}
                  className="btn btn-primary"
                >
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
                {hasJiraApiToken && (
                  <button
                    onClick={clearJiraApiConfig}
                    className="btn btn-secondary"
                  >
                    Remove
                  </button>
                )}
                {jiraApiSaveStatus === 'success' && (
                  <span className="text-sm text-green-600 font-medium">Saved successfully!</span>
                )}
                {jiraApiSaveStatus === 'error' && (
                  <span className="text-sm text-red-600 font-medium">Failed to save. Check all fields.</span>
                )}
              </div>
            </div>
          </section>

          {/* AI Configuration */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">AI Provider</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Provider
                </label>
                <select
                  value={aiForm.provider}
                  onChange={(e) => setAIForm({ 
                    ...aiForm, 
                    provider: e.target.value as 'openai' | 'anthropic' | 'groq' | 'moonshot',
                    model: '' 
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic (Claude)</option>
                  <option value="groq">Groq</option>
                  <option value="moonshot">Moonshot AI (Kimi)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  API Key
                </label>
                <input
                  type="password"
                  value={aiForm.apiKey}
                  onChange={(e) => setAIForm({ ...aiForm, apiKey: e.target.value })}
                  onFocus={() => aiForm.apiKey === '••••••••' && setAIForm({ ...aiForm, apiKey: '' })}
                  placeholder={`Your ${aiForm.provider} API key`}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Model
                </label>
                <select
                  value={aiForm.model}
                  onChange={(e) => setAIForm({ ...aiForm, model: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">Default</option>
                  {getModelOptions(aiForm.provider, 'chat').map(model => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                </select>
              </div>

              <button
                onClick={saveAIConfig}
                disabled={isSaving}
                className="btn btn-primary"
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </section>

          {/* Reasoning Model */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-gray-800">Reasoning Model</h2>
                  <p className="text-xs text-gray-400 font-normal mt-0.5">Optional</p>
                </div>
              </div>
              {reasoningConfigured && (
                <span className="flex items-center gap-1.5 text-sm font-medium text-green-600">
                  <CheckIcon /> Active
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 mb-2">
              A dedicated model for complex, multi-step tasks. When configured, it takes over automatically whenever the agent needs to plan deeply — like analysing documents, creating multiple Jira issues, or reasoning through ambiguous requests.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-5">
              <p className="text-xs text-blue-800">
                <strong>Best picks:</strong> Claude 3.7 Sonnet (extended thinking), o4-mini / o3-mini (OpenAI reasoning), or DeepSeek-R1 on Groq (free, native chain-of-thought). If you leave this empty, the main model handles everything.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Provider</label>
                <select
                  value={reasoningForm.provider}
                  onChange={e => setReasoningForm({ ...reasoningForm, provider: e.target.value as 'openai' | 'anthropic' | 'groq' | 'moonshot', model: '' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic (Claude)</option>
                  <option value="groq">Groq</option>
                  <option value="moonshot">Moonshot AI (Kimi)</option>
                </select>
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={reasoningForm.useSameKey}
                    onChange={e => setReasoningForm({ ...reasoningForm, useSameKey: e.target.checked, apiKey: '' })}
                    className="rounded"
                  />
                  Use same API key as main model
                </label>
                {!reasoningForm.useSameKey && (
                  <input
                    type="password"
                    value={reasoningForm.apiKey}
                    onChange={e => setReasoningForm({ ...reasoningForm, apiKey: e.target.value })}
                    onFocus={() => reasoningForm.apiKey === '••••••••' && setReasoningForm({ ...reasoningForm, apiKey: '' })}
                    placeholder={`Your ${reasoningForm.provider} API key`}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
                <select
                  value={reasoningForm.model}
                  onChange={e => setReasoningForm({ ...reasoningForm, model: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">Default for provider</option>
                  {getModelOptions(reasoningForm.provider, 'reasoning').map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={saveReasoningConfig}
                  disabled={savingReasoning || (!reasoningForm.useSameKey && !reasoningForm.apiKey)}
                  className="btn btn-primary"
                >
                  {savingReasoning ? 'Saving…' : 'Save Reasoning Model'}
                </button>
                {reasoningSaveStatus === 'success' && <span className="text-sm text-green-600">Saved!</span>}
                {reasoningSaveStatus === 'error' && <span className="text-sm text-red-600">Failed — check API key.</span>}
              </div>
            </div>
          </section>

          {/* OCR Model — coming soon */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 opacity-60">
            <div className="flex items-center justify-between mb-1">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">OCR Model</h2>
                <p className="text-xs text-gray-400 font-normal mt-0.5">Coming soon</p>
              </div>
              <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">
                Not available yet
              </span>
            </div>
            <p className="text-sm text-gray-400 mb-3">
              A specialist model for reading scanned PDFs and image-based documents. Will use Mistral AI's OCR API to extract text from files that have no readable text layer.
            </p>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Planned for a future release
            </div>
          </section>

          {/* Workspace */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Workspace Folder</h2>
            
            <p className="text-sm text-gray-600 mb-4">
              This is the folder where Mirai can read project documents and create reports.
            </p>

            <div className="flex items-center gap-4">
              <div className="flex-1 flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-lg">
                <FolderIcon />
                <span className="text-sm text-gray-700 truncate">
                  {workspace || 'No folder selected'}
                </span>
              </div>
              <button
                onClick={selectWorkspace}
                className="btn btn-secondary"
              >
                {workspace ? 'Change' : 'Select Folder'}
              </button>
            </div>
          </section>

          {/* Agent Behavior */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-1">Agent Behavior</h2>
            <p className="text-sm text-gray-500 mb-5">Control how the agent processes your requests.</p>

            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-gray-800">Max iterations per request</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  How many tool-call loops the agent can run before stopping. Higher values allow more complex tasks.
                </p>
              </div>
              <div className="flex items-center gap-3 ml-6">
                <select
                  value={maxIterations}
                  onChange={e => {
                    const val = Number(e.target.value)
                    setMaxIterations(val)
                    saveMaxIterations(val)
                  }}
                  disabled={savingMaxIter}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-mirai-300"
                >
                  <option value={5}>5</option>
                  <option value={10}>10 (default)</option>
                  <option value={15}>15</option>
                  <option value={20}>20</option>
                  <option value={0}>No limit</option>
                </select>
                {savingMaxIter && <span className="text-xs text-gray-400">Saving…</span>}
              </div>
            </div>
          </section>

          {/* Danger Zone */}
          <section className="bg-white rounded-xl shadow-sm border border-red-200 p-6">
            <h2 className="text-lg font-semibold text-red-700 mb-4">Danger Zone</h2>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-gray-800">Reset Onboarding</h3>
                  <p className="text-sm text-gray-500">
                    Go through the setup process again
                  </p>
                </div>
                <button
                  onClick={onResetOnboarding}
                  className="btn btn-secondary"
                >
                  Reset
                </button>
              </div>

              <hr className="border-gray-200" />

              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-gray-800">Clear All Data</h3>
                  <p className="text-sm text-gray-500">
                    Delete all stored data including credentials and chat history
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (confirm('Are you sure? This will delete all your data including credentials and chat history.')) {
                      // Clear all storage
                      storage.set('chatHistory', [])
                      storage.set('userProfile', null)
                      storage.setSecure('jiraConfig', '')
                      storage.setSecure('aiConfig', '')
                      window.location.reload()
                    }
                  }}
                  className="btn btn-danger"
                >
                  Clear Data
                </button>
              </div>
            </div>
          </section>

          {/* About */}
          <section className="text-center py-4">
            <p className="text-sm text-gray-500">
              Mirai v0.1.0 - AI Project Management Assistant
            </p>
            <p className="text-xs text-gray-400 mt-1">
              All data is stored locally on your machine
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
