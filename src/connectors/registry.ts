import { ConnectorRuntime } from './types'
import { ElectronAPI } from '../types/electron'
import { createJiraRuntime, normalizeJiraMetadata } from './jira/runtime'

export interface ConnectorScope {
  id: string
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

  return {
    runtimes: [createJiraRuntime(electron, metadata)],
    scopes: metadata.monitoredProjects,
  }
}
