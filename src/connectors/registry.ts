import { ConnectorRuntime } from './types'
import { ElectronAPI } from '../types/electron'
import { createJiraRuntime, normalizeJiraMetadata } from './jira/runtime'

export interface ConnectorScope {
  connectorId: string
  scopeId: string
  key: string
  name: string
  avatarUrl?: string
}

export interface LoadedConnectors {
  runtimes: ConnectorRuntime<any>[]
  scopes: ConnectorScope[]
}

export async function loadEnabledConnectors(electron: ElectronAPI): Promise<LoadedConnectors> {
  const metadata = normalizeJiraMetadata(await electron.jiraMetadata.get())
  const jiraScopes = metadata.monitoredProjects.map(project => ({
    connectorId: 'jira',
    scopeId: project.key,
    key: project.key,
    name: project.name,
    avatarUrl: project.avatarUrl,
  }))

  return {
    runtimes: [createJiraRuntime(electron, metadata)],
    scopes: jiraScopes,
  }
}
