import { useState, useEffect } from 'react'
import { useElectron } from '../hooks/useElectron'

interface JiraProject {
  id: string
  key: string
  name: string
  projectTypeKey: string
  avatarUrls?: Record<string, string>
  avatarUrl?: string
}

interface ProjectSelectorProps {
  onSelectionComplete: (selectedProjects: JiraProject[]) => void
  onBack?: () => void
  mode?: 'onboarding' | 'settings'
}

export function ProjectSelector({ onSelectionComplete, onBack, mode = 'onboarding' }: ProjectSelectorProps) {
  const electron = useElectron()
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected')
  const [projects, setProjects] = useState<JiraProject[]>([])
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [syncProgress, setSyncProgress] = useState<{ current: number; total: number } | null>(null)

  // Check existing connection on mount
  useEffect(() => {
    async function checkStatus() {
      const status = await electron.mcp.status()
      if (status.connected) {
        setConnectionStatus('connected')
        loadProjects()
      }

      // Load previously selected projects
      const metadata = await electron.jiraMetadata.get()
      if (metadata.monitoredProjects.length > 0) {
        setSelectedProjects(new Set(metadata.monitoredProjects.map(p => p.key)))
      }
    }
    checkStatus()
  }, [])

  const connectToAtlassian = async () => {
    setConnectionStatus('connecting')
    setError(null)
    
    try {
      const result = await electron.mcp.connect()
      
      if (result.success) {
        setConnectionStatus('connected')
        await loadProjects()
      } else {
        setConnectionStatus('error')
        setError(result.error || 'Failed to connect to Atlassian')
      }
    } catch (err) {
      setConnectionStatus('error')
      setError(err instanceof Error ? err.message : 'Connection failed')
    }
  }

  const loadProjects = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const result = await electron.mcp.getProjects()
      
      if (result.success && result.data) {
        const projectList = result.data as JiraProject[]
        setProjects(projectList.map(p => ({
          ...p,
          avatarUrl: p.avatarUrls?.['48x48'] || p.avatarUrls?.['32x32']
        })))
      } else {
        setError(result.error || 'Failed to load projects')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects')
    } finally {
      setLoading(false)
    }
  }

  const toggleProject = (projectKey: string) => {
    const newSelected = new Set(selectedProjects)
    if (newSelected.has(projectKey)) {
      newSelected.delete(projectKey)
    } else {
      newSelected.add(projectKey)
    }
    setSelectedProjects(newSelected)
  }

  const selectAll = () => {
    setSelectedProjects(new Set(projects.map(p => p.key)))
  }

  const deselectAll = () => {
    setSelectedProjects(new Set())
  }

  const handleContinue = async () => {
    if (selectedProjects.size === 0) {
      setError('Please select at least one project to monitor')
      return
    }

    setLoading(true)
    setSyncProgress({ current: 0, total: selectedProjects.size })
    setError(null)

    try {
      const projectKeys = Array.from(selectedProjects)
      const selectedProjectObjects = projects.filter(p => selectedProjects.has(p.key))

      // Save monitored projects first
      await electron.jiraMetadata.setMonitoredProjects(selectedProjectObjects)

      // Sync metadata for each project
      const result = await electron.mcp.syncMetadata(projectKeys)
      
      if (result.success && result.data) {
        // Update metadata store with synced data
        const syncedData = result.data as Record<string, unknown>
        
        for (const [projectKey, projectMeta] of Object.entries(syncedData)) {
          await electron.jiraMetadata.updateProjectMetadata(projectKey, projectMeta)
        }

        onSelectionComplete(selectedProjectObjects)
      } else {
        // Even if sync fails, we can continue with just project selection
        console.warn('Metadata sync failed:', result.error)
        onSelectionComplete(selectedProjectObjects)
      }
    } catch (err) {
      console.error('Error during project selection:', err)
      // Still continue even if there's an error
      const selectedProjectObjects = projects.filter(p => selectedProjects.has(p.key))
      onSelectionComplete(selectedProjectObjects)
    } finally {
      setLoading(false)
      setSyncProgress(null)
    }
  }

  // Grouped projects by type
  const projectsByType = projects.reduce((acc, project) => {
    const type = project.projectTypeKey || 'other'
    if (!acc[type]) acc[type] = []
    acc[type].push(project)
    return acc
  }, {} as Record<string, JiraProject[]>)

  const typeLabels: Record<string, string> = {
    software: 'Software Projects',
    business: 'Business Projects',
    service_desk: 'Service Desk Projects',
    other: 'Other Projects'
  }

  if (connectionStatus === 'disconnected' || connectionStatus === 'connecting' || connectionStatus === 'error') {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Connect to Atlassian</h2>
            <p className="text-gray-600 text-sm">
              {mode === 'onboarding' 
                ? "Connect your Atlassian account to select which projects this connector should expose."
                : "Connect your Atlassian account to access Jira projects."}
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          <button
            onClick={connectToAtlassian}
            disabled={connectionStatus === 'connecting'}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {connectionStatus === 'connecting' ? (
              <>
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Connecting...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.005-1.005z" />
                  <path d="M5.232 5.735a5.218 5.218 0 0 0 5.232 5.214h2.13v2.058A5.216 5.216 0 0 0 17.807 18.22V6.74a1.005 1.005 0 0 0-1.005-1.005H5.232z" opacity="0.8" />
                  <path d="M12.464 0a5.217 5.217 0 0 0 5.232 5.214h2.13v2.058A5.215 5.215 0 0 0 25.039 12.485V.99a1.005 1.005 0 0 0-1.005-1.005H12.464V0z" opacity="0.6" />
                </svg>
                Connect with Atlassian
              </>
            )}
          </button>

          <p className="text-xs text-gray-500 text-center mt-4">
            You'll be redirected to Atlassian to authorize the connector. Only project access needed by this module is requested.
          </p>

          {onBack && (
            <button
              onClick={onBack}
              className="w-full mt-4 text-gray-600 hover:text-gray-900 py-2"
            >
              Back
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <h2 className="text-xl font-semibold text-gray-900 mb-1">Select Projects to Monitor</h2>
        <p className="text-gray-600 text-sm">
          Choose which Jira projects this connector should expose to the agent.
        </p>
      </div>

      {/* Selection toolbar */}
      <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <div className="text-sm text-gray-600">
          {selectedProjects.size} of {projects.length} projects selected
        </div>
        <div className="flex gap-2">
          <button
            onClick={selectAll}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            Select all
          </button>
          <span className="text-gray-300">|</span>
          <button
            onClick={deselectAll}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            Deselect all
          </button>
        </div>
      </div>

      {/* Projects list */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading && projects.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex items-center gap-3 text-gray-600">
              <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Loading projects...
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-red-600 mb-4">{error}</p>
              <button
                onClick={loadProjects}
                className="text-blue-600 hover:text-blue-700"
              >
                Try again
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(projectsByType).map(([type, typeProjects]) => (
              <div key={type} className="space-y-2">
                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
                  {typeLabels[type] || type}
                </h3>
                <div className="grid gap-2">
                  {typeProjects.map(project => (
                    <label
                      key={project.id}
                      className={`flex items-center p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedProjects.has(project.key)
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedProjects.has(project.key)}
                        onChange={() => toggleProject(project.key)}
                        className="sr-only"
                      />
                      <div className={`w-5 h-5 rounded border-2 mr-3 flex items-center justify-center transition-colors ${
                        selectedProjects.has(project.key)
                          ? 'border-blue-500 bg-blue-500'
                          : 'border-gray-300'
                      }`}>
                        {selectedProjects.has(project.key) && (
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      {project.avatarUrl && (
                        <img
                          src={project.avatarUrl}
                          alt=""
                          className="w-8 h-8 rounded mr-3"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900">{project.name}</div>
                        <div className="text-sm text-gray-500">{project.key}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-6 border-t border-gray-200 bg-white">
        {syncProgress && (
          <div className="mb-4">
            <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
              <span>Syncing project metadata...</span>
              <span>{syncProgress.current} / {syncProgress.total}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}
        
        <div className="flex gap-3">
          {onBack && (
            <button
              onClick={onBack}
              disabled={loading}
              className="flex-1 py-2 px-4 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              Back
            </button>
          )}
          <button
            onClick={handleContinue}
            disabled={loading || selectedProjects.size === 0}
            className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Syncing...
              </>
            ) : (
              'Continue'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
