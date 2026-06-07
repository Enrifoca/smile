import { useState, useEffect } from 'react'
import { useElectron } from '../hooks/useElectron'
import { UserProfile } from '../agent/types'
import { syncMemoryFromJira } from '../utils/memorySync'
import { syncJiraWorkspaceKnowledge } from '../connectors/jira/syncKnowledge'
import {
  AIProvider,
  AI_PROVIDER_LABELS,
  CHAT_PROVIDERS,
  ModelCatalog,
  ModelProvider,
  ModelRole,
  getBundledProviderRole,
} from '../shared/modelCatalog'

interface OnboardingProps {
  onComplete: () => void
}

// Steps:
// 1. Jira REST API setup for uploads and site selection
// 2. Connect to Atlassian via MCP OAuth
// 3. Select projects to monitor
// 4. AI Provider setup
// 5. Workspace folder selection
// 6. Communication style preferences + Complete
type Step = 1 | 2 | 3 | 4 | 5 | 6

// MCP connection states
type MCPConnectionState = 'idle' | 'connecting' | 'oauth_pending' | 'connected' | 'error'

const API_TOKEN_MASK = '********'

interface JiraProject {
  id: string
  key: string
  name: string
  projectTypeKey: string
  avatarUrls?: Record<string, string>
}

const ArrowIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
  </svg>
)

const CheckCircleIcon = () => (
  <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)

const FolderIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
  </svg>
)

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState<Step>(1)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // MCP connection state
  const [mcpState, setMCPState] = useState<MCPConnectionState>('idle')
  const [mcpStatusMessage, setMCPStatusMessage] = useState<string>('')
  
  // Form states
  const [jiraApiForm, setJiraApiForm] = useState({
    baseUrl: '',
    email: '',
    apiToken: '',
  })
  const [hasJiraApiConfig, setHasJiraApiConfig] = useState(false)
  const [aiForm, setAIForm] = useState({
    provider: 'openai' as AIProvider,
    apiKey: '',
    model: '',
  })
  const [workspace, setWorkspace] = useState<string | null>(null)
  const [allProjects, setAllProjects] = useState<JiraProject[]>([])
  const [selectedProjectKeys, setSelectedProjectKeys] = useState<Set<string>>(new Set())
  const [modelCatalog, setModelCatalog] = useState<ModelCatalog | null>(null)
  const [profile, setProfile] = useState<Partial<UserProfile>>({
    style: 'balanced',
    verbosity: 'balanced',
    tone: 'balanced',
    writingPatterns: {
      commonPhrases: [],
      taskFormat: '',
      commentStyle: '',
    },
    focusProjects: [],
    confirmAllConnectorActions: true,
  })

  const { storage, models: modelCatalogAPI, mcp, file, jiraMetadata: jiraMetadataAPI, connectors } = useElectron()

  const normalizeJiraSiteUrl = (url: string) => url.trim().replace(/\/+$/, '')

  // Check saved connection details on mount
  useEffect(() => {
    const loadSetupState = async () => {
      try {
        const jiraApiConfigStr = await storage.getSecure('jiraApiConfig')
        if (jiraApiConfigStr) {
          const jiraApiConfig = JSON.parse(jiraApiConfigStr) as {
            baseUrl?: string
            email?: string
            apiToken?: string
          }
          setHasJiraApiConfig(!!jiraApiConfig.apiToken)
          setJiraApiForm({
            baseUrl: jiraApiConfig.baseUrl || '',
            email: jiraApiConfig.email || '',
            apiToken: jiraApiConfig.apiToken ? API_TOKEN_MASK : '',
          })
        }

        const catalogResult = await modelCatalogAPI.getCatalog()
        if (catalogResult.success && catalogResult.data) {
          setModelCatalog(catalogResult.data)
        }

        const status = await mcp.status()
        if (status.connected) {
          setMCPState('connected')
          // If already connected, fetch projects
          const projectsResult = await mcp.getProjects()
          if (projectsResult.success && projectsResult.data) {
            setAllProjects(projectsResult.data as JiraProject[])
          }
        }
      } catch {
        // Ignore - not connected yet
      }
    }
    loadSetupState()
  }, [])

  // Handle Jira REST API setup (Step 1 -> Step 2)
  const handleJiraApiSubmit = async () => {
    if (!jiraApiForm.baseUrl || !jiraApiForm.email || (!jiraApiForm.apiToken && !hasJiraApiConfig)) {
      setError('Please enter your Jira site URL, email, and API token')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      let apiToken = jiraApiForm.apiToken
      if (apiToken === API_TOKEN_MASK) {
        const existingConfig = await storage.getSecure('jiraApiConfig')
        if (existingConfig) {
          apiToken = (JSON.parse(existingConfig) as { apiToken?: string }).apiToken || ''
        }
      }

      if (!apiToken) {
        setError('Please enter your Jira API token')
        return
      }

      await storage.setSecure('jiraApiConfig', JSON.stringify({
        baseUrl: normalizeJiraSiteUrl(jiraApiForm.baseUrl),
        email: jiraApiForm.email.trim(),
        apiToken,
      }))
      setHasJiraApiConfig(true)
      setJiraApiForm(prev => ({ ...prev, apiToken: API_TOKEN_MASK }))
      setStep(2)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save Jira API configuration')
    } finally {
      setIsLoading(false)
    }
  }

  // Handle Atlassian MCP connection (Step 2 -> Step 3)
  const handleMCPConnect = async () => {
    setIsLoading(true)
    setError(null)
    setMCPState('connecting')
    setMCPStatusMessage('Starting connection to Atlassian...')

    try {
      // Start MCP connection - this will trigger OAuth flow
      setMCPStatusMessage('A browser window will open for authentication...')
      setMCPState('oauth_pending')
      
      const result = await mcp.connect()
      
      if (!result.success) {
        setError(result.error || 'Failed to connect to Atlassian')
        setMCPState('error')
        return
      }

      setMCPState('connected')
      setMCPStatusMessage('Connected! Fetching your projects...')

      // Fetch projects via MCP
      const projectsResult = await mcp.getProjects()
      if (projectsResult.success && projectsResult.data) {
        setAllProjects(projectsResult.data as JiraProject[])
        setStep(3)
      } else {
        setError(projectsResult.error || 'Failed to fetch projects')
        setMCPState('error')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed')
      setMCPState('error')
    } finally {
      setIsLoading(false)
    }
  }

  // Retry MCP connection
  const handleMCPRetry = () => {
    setMCPState('idle')
    setError(null)
    setMCPStatusMessage('')
  }

  const handleMCPContinue = async () => {
    if (allProjects.length > 0) {
      setStep(3)
      return
    }

    setIsLoading(true)
    setError(null)
    setMCPStatusMessage('Fetching your projects...')
    try {
      const projectsResult = await mcp.getProjects()
      if (projectsResult.success && projectsResult.data) {
        setAllProjects(projectsResult.data as JiraProject[])
        setStep(3)
      } else {
        setError(projectsResult.error || 'Failed to fetch projects')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch projects')
    } finally {
      setIsLoading(false)
    }
  }

  // Handle project selection (Step 3 -> Step 4)
  const handleProjectsSelected = async () => {
    if (selectedProjectKeys.size === 0) {
      setError('Please select at least one project')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const selectedProjects = allProjects.filter(p => selectedProjectKeys.has(p.key))
      const projectKeys = selectedProjects.map(p => p.key)
      
      // Save monitored projects to metadata store
      await jiraMetadataAPI.setMonitoredProjects(selectedProjects.map(p => ({
        id: p.id,
        key: p.key,
        name: p.name,
        projectTypeKey: p.projectTypeKey,
        avatarUrl: p.avatarUrls?.['48x48']
      })))

      // Sync ALL metadata for selected projects via MCP (issue types, fields, AND users)
      setMCPStatusMessage('Syncing project metadata (issue types, custom fields, team members)...')
      const allMetadataResult = await mcp.syncAllMetadata(projectKeys)
      
      if (allMetadataResult.success && allMetadataResult.metadata) {
        const syncedMetadata = allMetadataResult.metadata as {
          projects: Record<string, {
            project: JiraProject
            issueTypes: Array<{ id: string; name: string; description?: string; subtask: boolean; hierarchyLevel?: number }>
            fieldsByIssueType: Record<string, Array<{ fieldId: string; key: string; name: string; required: boolean; hasDefaultValue?: boolean; schema: { type: string; custom?: string }; allowedValues?: Array<{ id: string; value?: string; name?: string }> }>>
          }>
          users: Array<{ accountId: string; displayName: string; emailAddress?: string; avatarUrl?: string; active: boolean }>
        }
        
        // Update project metadata in storage
        for (const [projectKey, data] of Object.entries(syncedMetadata.projects)) {
          await jiraMetadataAPI.updateProjectMetadata(projectKey, {
            project: {
              id: data.project.id,
              key: data.project.key,
              name: data.project.name,
              projectTypeKey: data.project.projectTypeKey
            },
            issueTypes: data.issueTypes.map(it => ({
              id: it.id,
              name: it.name,
              description: it.description,
              subtask: it.subtask,
              hierarchyLevel: it.hierarchyLevel || 0
            })),
            fieldsByIssueType: Object.fromEntries(
              Object.entries(data.fieldsByIssueType).map(([issueTypeId, fields]) => [
                issueTypeId,
                fields.map(f => ({
                  id: f.fieldId || f.key,
                  key: f.key,
                  name: f.name,
                  type: f.schema?.type || 'string',
                  custom: !!f.schema?.custom,
                  required: f.required,
                  hasDefaultValue: f.hasDefaultValue || false,
                  schema: f.schema,
                  allowedValues: f.allowedValues
                }))
              ])
            )
          })
        }
        
        // Save users/team members
        if (syncedMetadata.users && syncedMetadata.users.length > 0) {
          await jiraMetadataAPI.setUsers(syncedMetadata.users)
          setMCPStatusMessage(`Synced ${Object.keys(syncedMetadata.projects).length} project(s) and ${syncedMetadata.users.length} team member(s)`)
        } else {
          setMCPStatusMessage(`Synced ${Object.keys(syncedMetadata.projects).length} project(s)`)
        }
      } else {
        // Fallback to basic sync if comprehensive sync fails
        setMCPStatusMessage('Syncing project metadata...')
        const metadataResult = await mcp.syncMetadata(projectKeys)
        
        if (metadataResult.success && metadataResult.data) {
          const syncedData = metadataResult.data as Record<string, {
            project: JiraProject
            issueTypes: Array<{ id: string; name: string; description?: string; subtask: boolean }>
            fieldsByIssueType: Record<string, Array<{ fieldId: string; key: string; name: string; required: boolean; schema: { type: string; custom?: string } }>>
          }>
          
          for (const [projectKey, data] of Object.entries(syncedData)) {
            await jiraMetadataAPI.updateProjectMetadata(projectKey, {
              issueTypes: data.issueTypes.map(it => ({
                id: it.id,
                name: it.name,
                description: it.description,
                subtask: it.subtask
              })),
              customFields: Object.values(data.fieldsByIssueType).flat()
                .filter((f, i, arr) => arr.findIndex(x => x.fieldId === f.fieldId) === i)
                .filter(f => f.schema.custom)
                .map(f => ({
                  id: f.fieldId,
                  key: f.key,
                  name: f.name,
                  type: f.schema.type,
                  custom: f.schema.custom
                }))
            })
          }
        }
      }

      await syncJiraWorkspaceKnowledge({ jiraMetadata: jiraMetadataAPI, connectors })

      setProfile(prev => ({
        ...prev,
        focusProjects: selectedProjects.map(p => p.key)
      }))

      // Sync memory - learn user's writing style from their Jira issues
      setMCPStatusMessage('Learning your writing style from existing issues...')
      try {
        // Cast to any to bypass strict type checking - the API shapes are compatible at runtime
        await syncMemoryFromJira(mcp as Parameters<typeof syncMemoryFromJira>[0], jiraMetadataAPI as Parameters<typeof syncMemoryFromJira>[1], projectKeys)
      } catch (memoryError) {
        console.error('Failed to sync memory:', memoryError)
        // Non-critical - continue with onboarding
      }

      // Small delay to show success message
      await new Promise(resolve => setTimeout(resolve, 1000))
      setMCPStatusMessage('')
      setStep(4)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save projects')
    } finally {
      setIsLoading(false)
    }
  }

  // Handle AI provider setup (Step 4 -> Step 5)
  const handleAISubmit = async () => {
    if (!aiForm.apiKey) {
      setError('Please enter your API key')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      await storage.setSecure('aiConfig', JSON.stringify({
        provider: aiForm.provider,
        apiKey: aiForm.apiKey,
        model: aiForm.model || undefined,
      }))
      setStep(5)
    } catch (err) {
      setError('Failed to save AI configuration')
    } finally {
      setIsLoading(false)
    }
  }

  // Handle workspace selection
  const handleWorkspaceSelect = async () => {
    try {
      const result = await file.selectWorkspace()
      if (result.success && result.path) {
        setWorkspace(result.path)
      }
    } catch (err) {
      setError('Failed to select folder')
    }
  }

  // Handle style preferences and complete onboarding
  const handleStyleSubmit = async () => {
    await handleComplete(profile)
  }

  // Complete onboarding
  const handleComplete = async (profileOverride: Partial<UserProfile> = profile) => {
    setIsLoading(true)
    
    try {
      const selectedProjects = allProjects.filter(p => selectedProjectKeys.has(p.key))
      
      const fullProfile: UserProfile = {
        style: profileOverride.style || 'balanced',
        verbosity: profileOverride.verbosity || 'balanced',
        tone: profileOverride.tone || 'balanced',
        writingPatterns: profileOverride.writingPatterns || {
          commonPhrases: [],
          taskFormat: '',
          commentStyle: '',
        },
        focusProjects: selectedProjects.map(p => p.key),
        confirmAllConnectorActions: true,
        onboardingCompleted: true,
      }
      
      await storage.set('userProfile', fullProfile)
      onComplete()
    } catch (err) {
      setError('Failed to save settings')
      setIsLoading(false)
    }
  }

  const handleSkipOnboarding = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const skippedProfile: UserProfile = {
        style: 'balanced',
        verbosity: 'balanced',
        tone: 'balanced',
        writingPatterns: {
          commonPhrases: [],
          taskFormat: '',
          commentStyle: '',
        },
        focusProjects: [],
        confirmAllConnectorActions: true,
        onboardingCompleted: true,
      }

      await storage.set('userProfile', skippedProfile)
      onComplete()
    } catch {
      setError('Failed to skip onboarding')
      setIsLoading(false)
    }
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

  const getCatalogModels = (provider: ModelProvider, role: ModelRole, selectedModel?: string) => {
    const roleCatalog = modelCatalog?.[provider]?.[role] || getBundledProviderRole(provider, role)
    const ids = roleCatalog.models.map(model => model.id)
    if (selectedModel && !ids.includes(selectedModel)) return [selectedModel, ...ids]
    return ids
  }

  const renderStep = () => {
    switch (step) {
      // Step 1: Jira REST API setup
      case 1:
        return (
          <div className="space-y-6 animate-fade-in">
            <div className="text-center">
              <div className="w-20 h-20 bg-gradient-to-br from-neutral-700 to-neutral-950 rounded-2xl mx-auto mb-6 flex items-center justify-center shadow-lg">
                <span className="text-white text-3xl font-bold">M</span>
              </div>
              <h2 className="text-2xl font-bold text-gray-800">Connect your Jira site</h2>
              <p className="text-gray-600 mt-2">
                Start with the Jira API details this example connector needs for uploads and site matching.
              </p>
            </div>

            <div className="snippet-info">
              <p className="text-sm">
                Atlassian MCP handles Jira reading and updates through OAuth. The REST API token is used for attachment uploads and site selection.
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
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-neutral-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Atlassian Email
                </label>
                <input
                  type="email"
                  value={jiraApiForm.email}
                  onChange={(e) => setJiraApiForm({ ...jiraApiForm, email: e.target.value })}
                  placeholder="your-email@example.com"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-neutral-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Jira API Token
                </label>
                <input
                  type="password"
                  value={jiraApiForm.apiToken}
                  onChange={(e) => setJiraApiForm({ ...jiraApiForm, apiToken: e.target.value })}
                  onFocus={() => jiraApiForm.apiToken === API_TOKEN_MASK && setJiraApiForm({ ...jiraApiForm, apiToken: '' })}
                  placeholder="Your Jira API token"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-neutral-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Create one in <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noopener noreferrer" className="text-neutral-700 hover:underline">Atlassian Account Settings</a>.
                </p>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}

            <button
              onClick={handleJiraApiSubmit}
              disabled={isLoading || !jiraApiForm.baseUrl || !jiraApiForm.email || (!jiraApiForm.apiToken && !hasJiraApiConfig)}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-neutral-950 text-white rounded-xl hover:bg-neutral-700 disabled:opacity-50 transition-colors"
            >
              {isLoading ? 'Saving...' : 'Continue to Atlassian MCP'}
              <ArrowIcon />
            </button>
          </div>
        )

      // Step 2: Welcome + Connect to Atlassian via MCP OAuth
      case 2:
        return (
          <div className="space-y-6 animate-fade-in">
            <div className="text-center">
              <div className="w-20 h-20 bg-gradient-to-br from-neutral-700 to-neutral-950 rounded-2xl mx-auto mb-6 flex items-center justify-center shadow-lg">
                <span className="text-white text-3xl font-bold">M</span>
              </div>
              <h2 className="text-2xl font-bold text-gray-800">Connect Atlassian MCP</h2>
              <p className="text-gray-600 mt-2">
                Sign in with Atlassian so the connector can read, create, and update Jira issues securely.
              </p>
            </div>

            {/* MCP Connection Status */}
            {mcpState === 'idle' && (
              <div className="snippet-info">
                <div className="flex items-start gap-3">
                  <svg className="w-6 h-6 text-neutral-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <p className="font-medium">Secure Atlassian Connection</p>
                    <p className="text-sm mt-1">
                      Clicking the button below opens your browser for Atlassian OAuth. Your Jira API token is only used locally for REST features like attachments.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {mcpState === 'connecting' && (
              <div className="snippet-info">
                <div className="flex items-center gap-3">
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-neutral-500 border-t-transparent"></div>
                  <p>{mcpStatusMessage || 'Connecting...'}</p>
                </div>
              </div>
            )}

            {mcpState === 'oauth_pending' && (
              <div className="snippet-info">
                <div className="flex items-start gap-3">
                  <svg className="w-6 h-6 text-neutral-500 mt-0.5 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  <div>
                    <p className="font-medium">Waiting for authentication...</p>
                    <p className="text-sm mt-1">
                      Please complete the sign-in process in your browser. If a browser window didn't open, check if it was blocked by your popup blocker.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {mcpState === 'connected' && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <CheckCircleIcon />
                  <p className="text-green-800 font-medium">{mcpStatusMessage || 'Connected to Atlassian!'}</p>
                </div>
              </div>
            )}

            {mcpState === 'error' && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <svg className="w-6 h-6 text-red-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="flex-1">
                    <p className="font-medium text-red-800">Connection failed</p>
                    <p className="text-sm text-red-700 mt-1">{error}</p>
                  </div>
                </div>
              </div>
            )}

            {error && mcpState !== 'error' && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                disabled={isLoading || mcpState === 'connecting' || mcpState === 'oauth_pending'}
                className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                Back
              </button>
              {mcpState === 'error' ? (
                <button
                  onClick={handleMCPRetry}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gray-600 text-white rounded-xl hover:bg-gray-700 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Try Again
                </button>
              ) : mcpState === 'connected' ? (
                <button
                  onClick={handleMCPContinue}
                  disabled={isLoading}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-neutral-950 text-white rounded-xl hover:bg-neutral-700 disabled:opacity-50 transition-colors"
                >
                  {isLoading ? 'Loading...' : 'Continue'}
                  <ArrowIcon />
                </button>
              ) : (
                <button
                  onClick={handleMCPConnect}
                  disabled={isLoading || mcpState === 'connecting' || mcpState === 'oauth_pending'}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-neutral-950 text-white rounded-xl hover:bg-neutral-700 disabled:opacity-50 transition-colors"
                >
                  {isLoading || mcpState === 'connecting' || mcpState === 'oauth_pending' ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                      {mcpState === 'oauth_pending' ? 'Waiting for browser...' : 'Connecting...'}
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                      Connect to Atlassian
                    </>
                  )}
                </button>
              )}
            </div>

            <p className="text-xs text-center text-gray-500">
              This example connector uses the official Atlassian MCP server for secure access to Jira data.
            </p>
          </div>
        )

      // Step 3: Project Selection
      case 3:
        return (
          <div className="space-y-6 animate-fade-in">
            <div className="flex items-center gap-3 text-green-600">
              <CheckCircleIcon />
              <span className="font-medium">Jira connected successfully!</span>
            </div>

            <div>
              <h2 className="text-2xl font-bold text-gray-800">Select Projects to Monitor</h2>
              <p className="text-gray-600 mt-2">
                Choose which Jira projects this connector should expose to the agent.
              </p>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">
                {selectedProjectKeys.size} of {allProjects.length} selected
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedProjectKeys(new Set(allProjects.map(p => p.key)))}
                  className="text-neutral-700 hover:underline"
                >
                  Select all
                </button>
                <span className="text-gray-300">|</span>
                <button
                  onClick={() => setSelectedProjectKeys(new Set())}
                  className="text-neutral-700 hover:underline"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto space-y-2 border border-gray-200 rounded-xl p-3">
              {allProjects.map(project => (
                <label
                  key={project.id}
                  className={`flex items-center p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedProjectKeys.has(project.key)
                      ? 'border-neutral-500 bg-neutral-50'
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
                      ? 'border-neutral-500 bg-neutral-950'
                      : 'border-gray-300'
                  }`}>
                    {selectedProjectKeys.has(project.key) && (
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  {project.avatarUrls?.['24x24'] && (
                    <img src={project.avatarUrls['24x24']} alt="" className="w-6 h-6 rounded mr-2" />
                  )}
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">{project.name}</div>
                    <div className="text-xs text-gray-500">{project.key}</div>
                  </div>
                </label>
              ))}
            </div>

            {error && (
              <p className="text-red-500 text-sm">{error}</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setStep(2)}
                className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleProjectsSelected}
                disabled={isLoading || selectedProjectKeys.size === 0}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-neutral-950 text-white rounded-xl hover:bg-neutral-700 disabled:opacity-50 transition-colors"
              >
                {isLoading ? 'Saving...' : 'Continue'}
                <ArrowIcon />
              </button>
            </div>
          </div>
        )

      // Step 4: AI Provider
      case 4:
        return (
          <div className="space-y-6 animate-fade-in">
            <div className="flex items-center gap-3 text-green-600">
              <CheckCircleIcon />
              <span className="font-medium">
                {selectedProjectKeys.size} project{selectedProjectKeys.size !== 1 ? 's' : ''} selected
              </span>
            </div>

            <div>
              <h2 className="text-2xl font-bold text-gray-800">Choose your AI provider</h2>
              <p className="text-gray-600 mt-2">
                Select which AI service you'd like to use for intelligent assistance.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Provider
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {CHAT_PROVIDERS.map((provider) => (
                    <button
                      key={provider}
                      onClick={() => setAIForm({ ...aiForm, provider, model: '' })}
                      className={`px-4 py-3 rounded-xl border-2 transition-colors ${
                        aiForm.provider === provider
                          ? 'border-neutral-500 bg-neutral-50 text-neutral-700'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {AI_PROVIDER_LABELS[provider]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  API Key
                </label>
                <input
                  type="password"
                  value={aiForm.apiKey}
                  onChange={(e) => setAIForm({ ...aiForm, apiKey: e.target.value })}
                  placeholder={`Your ${aiForm.provider} API key`}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-neutral-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Model
                </label>
                <select
                  value={aiForm.model}
                  onChange={(e) => setAIForm({ ...aiForm, model: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-neutral-500 focus:border-transparent"
                >
                  <option value="">Default for provider</option>
                  {getCatalogModels(aiForm.provider, 'chat', aiForm.model).map(model => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                </select>
              </div>
            </div>

            {error && (
              <p className="text-red-500 text-sm">{error}</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setStep(3)}
                className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleAISubmit}
                disabled={isLoading || !aiForm.apiKey}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-neutral-950 text-white rounded-xl hover:bg-neutral-700 disabled:opacity-50 transition-colors"
              >
                {isLoading ? 'Saving...' : 'Continue'}
                <ArrowIcon />
              </button>
            </div>
          </div>
        )

      // Step 5: Workspace folder
      case 5:
        return (
          <div className="space-y-6 animate-fade-in">
            <div className="flex items-center gap-3 text-green-600">
              <CheckCircleIcon />
              <span className="font-medium">AI provider configured!</span>
            </div>

            <div>
              <h2 className="text-2xl font-bold text-gray-800">Select a workspace folder</h2>
              <p className="text-gray-600 mt-2">
                Choose a folder where I can read your project documents and create reports for you.
              </p>
            </div>

            <div 
              onClick={handleWorkspaceSelect}
              className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-neutral-400 hover:bg-neutral-50/50 transition-colors"
            >
              <div className="w-12 h-12 mx-auto mb-3 bg-gray-100 rounded-full flex items-center justify-center text-gray-400">
                <FolderIcon />
              </div>
              {workspace ? (
                <p className="text-neutral-700 font-medium">{workspace}</p>
              ) : (
                <>
                  <p className="text-gray-600 font-medium">Click to select a folder</p>
                  <p className="text-gray-400 text-sm mt-1">
                    This is optional - you can set it later in Settings
                  </p>
                </>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep(4)}
                className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => setStep(6)}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-neutral-950 text-white rounded-xl hover:bg-neutral-700 transition-colors"
              >
                {workspace ? 'Continue' : 'Skip for now'}
                <ArrowIcon />
              </button>
            </div>
          </div>
        )

      // Step 6: Communication style
      case 6:
        return (
          <div className="space-y-6 animate-fade-in">
            <div>
              <h2 className="text-2xl font-bold text-gray-800">How should I communicate?</h2>
              <p className="text-gray-600 mt-2">
                Tell me your preferences so I can adapt to your style.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Communication Style
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {(['technical', 'balanced', 'conversational'] as const).map((style) => (
                    <button
                      key={style}
                      onClick={() => setProfile({ ...profile, style })}
                      className={`px-4 py-3 rounded-xl border-2 transition-colors capitalize ${
                        profile.style === style
                          ? 'border-neutral-500 bg-neutral-50 text-neutral-700'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {style}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Response Length
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {(['concise', 'balanced', 'detailed'] as const).map((verbosity) => (
                    <button
                      key={verbosity}
                      onClick={() => setProfile({ ...profile, verbosity })}
                      className={`px-4 py-3 rounded-xl border-2 transition-colors capitalize ${
                        profile.verbosity === verbosity
                          ? 'border-neutral-500 bg-neutral-50 text-neutral-700'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {verbosity}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tone
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {(['formal', 'balanced', 'casual'] as const).map((tone) => (
                    <button
                      key={tone}
                      onClick={() => setProfile({ ...profile, tone })}
                      className={`px-4 py-3 rounded-xl border-2 transition-colors capitalize ${
                        profile.tone === tone
                          ? 'border-neutral-500 bg-neutral-50 text-neutral-700'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {tone}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep(5)}
                className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleStyleSubmit}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-neutral-950 text-white rounded-xl hover:bg-neutral-700 transition-colors"
              >
                {isLoading ? 'Setting up...' : 'Complete Setup'}
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </button>
            </div>
          </div>
        )
      default:
        return null
    }
  }

  // Progress indicator
  const renderProgress = () => {
    return (
      <div className="flex items-center justify-center gap-2 mb-8">
        {[1, 2, 3, 4, 5, 6].map((s) => (
          <div
            key={s}
            className={`h-2 rounded-full transition-all ${
              s === step 
                ? 'w-8 bg-neutral-950'
                : s < step 
                  ? 'w-2 bg-neutral-300'
                  : 'w-2 bg-gray-200'
            }`}
          />
        ))}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-8 overflow-hidden">
        {renderProgress()}
        {renderStep()}
        <div className="mt-6 pt-4 border-t border-gray-100 text-center">
          <button
            onClick={handleSkipOnboarding}
            disabled={isLoading}
            className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50 transition-colors"
          >
            Skip onboarding and configure later in Settings
          </button>
        </div>
      </div>
    </div>
  )
}

