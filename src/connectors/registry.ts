import { ConnectorRuntime } from './types'
import { ElectronAPI } from '../types/electron'
import { normalizeJiraMetadata } from './jira/runtime'
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
  const runtimes: ConnectorRuntime<any>[] = []
  const scopes: ConnectorScope[] = []

  try {
    const discovered = await electron.connectors.list()
    if (discovered.success && discovered.data) {
      for (const { manifest, promptMarkdown } of discovered.data.connectors) {
        runtimes.push(createPluginConnectorRuntime(electron, manifest, promptMarkdown))

        if (manifest.id === 'jira') {
          const metadata = normalizeJiraMetadata(await electron.jiraMetadata.get())
          scopes.push(
            ...metadata.monitoredProjects.map(project => ({
              connectorId: 'jira',
              scopeId: project.key,
              key: project.key,
              name: project.name,
              avatarUrl: project.avatarUrl,
            })),
          )
        }
      }
    }
  } catch {
    // Discovery failures must not break chat initialization.
  }

  return { runtimes, scopes }
}
