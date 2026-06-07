import { ConnectorRuntime } from './types'
import { ElectronAPI } from '../types/electron'
import { createJiraRuntime, normalizeJiraMetadata } from './jira/runtime'
import { createPluginConnectorRuntime } from './pluginLoader'

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

  const runtimes: ConnectorRuntime<any>[] = [createJiraRuntime(electron, metadata)]
  const scopes: ConnectorScope[] = [...jiraScopes]

  // Discover declarative plugin connectors from the workspace's .smile/connectors.
  try {
    const discovered = await electron.connectors.list()
    if (discovered.success && discovered.data) {
      for (const { manifest, promptMarkdown } of discovered.data.connectors) {
        runtimes.push(createPluginConnectorRuntime(electron, manifest, promptMarkdown))
      }
    }
  } catch {
    // Discovery failures must not break the built-in connectors.
  }

  return { runtimes, scopes }
}
