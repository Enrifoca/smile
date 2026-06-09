import type { ComponentType } from 'react'

import { createWorkspaceIconComponent } from '../components/connectors/GenericConnectorIcon'
import { JiraIcon } from '../components/connectors/JiraIcon'
import type { ConnectorIntegrationType, ConnectorManifest } from './contract'

/**
 * Catalog entries for Connectors UI.
 * Workspace packages are discovered via IPC; shipped install targets are listed in BUNDLED_CATALOG.
 */

export type CatalogEntryOrigin = 'workspace' | 'bundled'

export type CatalogGraphic = ComponentType<{ className?: string }>

export interface CatalogEntry {
  id: string
  name: string
  description: string
  origin: CatalogEntryOrigin
  integrationType?: ConnectorIntegrationType
  tagline?: string
  /** Inline catalog artwork (React component — reliable in Electron). */
  CatalogGraphic?: CatalogGraphic
  Icon: ComponentType
  manifest?: ConnectorManifest
}

export const INTEGRATION_TYPE_LABELS: Record<ConnectorIntegrationType, string> = {
  sop: 'SOP',
  rest: 'REST',
  graphql: 'GraphQL',
  ftp: 'FTP',
  sftp: 'SFTP',
  mcp: 'MCP',
  cli: 'CLI',
}

const BUNDLED_CATALOG: Array<Omit<CatalogEntry, 'Icon'>> = [
  {
    id: 'jira',
    name: 'Jira',
    description: 'Atlassian Jira work tracking via MCP. OAuth for reads/writes; REST API token for attachments.',
    origin: 'bundled',
    integrationType: 'mcp',
    tagline: 'Issues & projects',
    CatalogGraphic: JiraIcon,
  },
]

export function inferIntegrationType(manifest: ConnectorManifest): ConnectorIntegrationType | undefined {
  if (manifest.integrationType) return manifest.integrationType
  const handlerKind = manifest.handlerKind ?? 'code'
  if (handlerKind === 'mcp') return 'mcp'
  if (manifest.permissions?.mcp?.length) return 'mcp'
  if (manifest.permissions?.cli?.length) return 'cli'
  if (manifest.permissions?.http?.length) return 'rest'
  if (manifest.permissions?.file?.read && !manifest.permissions?.http?.length) return 'sop'
  return undefined
}

export function buildWorkspaceCatalogEntry(manifest: ConnectorManifest): CatalogEntry {
  return {
    id: manifest.id,
    name: manifest.name,
    description: manifest.description || manifest.name,
    origin: 'workspace',
    integrationType: inferIntegrationType(manifest),
    tagline: manifest.catalog?.tagline,
    Icon: createWorkspaceIconComponent(manifest),
    manifest,
  }
}

export function getBuiltinCatalogEntries(): CatalogEntry[] {
  return BUNDLED_CATALOG.map(entry => ({
    ...entry,
    Icon: createWorkspaceIconComponent({
      id: entry.id,
      name: entry.name,
    } as ConnectorManifest),
  }))
}

export function mergeCatalogEntries(
  builtins: CatalogEntry[],
  workspace: Array<{ manifest: ConnectorManifest }>,
): CatalogEntry[] {
  const byId = new Map<string, CatalogEntry>()
  for (const entry of builtins) byId.set(entry.id, entry)
  for (const { manifest } of workspace) {
    const builtin = byId.get(manifest.id)
    byId.set(manifest.id, {
      ...buildWorkspaceCatalogEntry(manifest),
      CatalogGraphic: builtin?.CatalogGraphic,
    })
  }
  return Array.from(byId.values())
}

export async function isWorkspaceConnectorConfigured(
  manifest: ConnectorManifest,
  getSecure: (key: string) => Promise<string | null>,
  mcpConnected: boolean,
): Promise<boolean> {
  const secretFields = (manifest.auth?.fields ?? []).filter(field => field.secret !== false)
  const needsMcp = (manifest.permissions?.mcp?.length ?? 0) > 0
  const optionalSecrets = manifest.auth?.type === 'oauth-with-rest-token'

  if (secretFields.length > 0 && !optionalSecrets) {
    for (const field of secretFields) {
      const value = await getSecure(`connector:${manifest.id}:${field.key}`)
      if (!value?.trim()) return false
    }
  }

  if (needsMcp) {
    return mcpConnected
  }

  if (secretFields.length > 0) {
    return true
  }

  return true
}
