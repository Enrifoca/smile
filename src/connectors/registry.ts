import { ConnectorRuntime } from './types'
import { ElectronAPI } from '../types/electron'
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

  try {
    const discovered = await electron.connectors.list()
    if (discovered.success && discovered.data) {
      for (const { manifest, promptMarkdown } of discovered.data.connectors) {
        runtimes.push(createPluginConnectorRuntime(electron, manifest, promptMarkdown))
      }
    }
  } catch {
    // Discovery failures must not break chat initialization.
  }

  return { runtimes, scopes: [] }
}
