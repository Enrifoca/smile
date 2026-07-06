import type { ComponentType } from 'react'

import { createWorkspaceIconComponent } from '../components/connectors/GenericConnectorIcon'
import { BraveIcon } from '../components/connectors/BraveIcon'
import { GmailIcon } from '../components/connectors/GmailIcon'
import { GcalIcon } from '../components/connectors/GcalIcon'
import { GdriveIcon } from '../components/connectors/GdriveIcon'
import { JiraIcon } from '../components/connectors/JiraIcon'
import { LinearIcon } from '../components/connectors/LinearIcon'
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
    id: 'brave',
    name: 'Brave Search',
    description: 'Web search via the Brave Search API. Add an API key to get citeable search results.',
    origin: 'bundled',
    integrationType: 'rest',
    tagline: 'Web search',
    CatalogGraphic: BraveIcon,
  },
  {
    id: 'jira',
    name: 'Jira',
    description: 'Atlassian Jira work tracking via MCP. OAuth for reads/writes; REST API token for attachments.',
    origin: 'bundled',
    integrationType: 'mcp',
    tagline: 'Issues & projects',
    CatalogGraphic: JiraIcon,
  },
  {
    id: 'linear',
    name: 'Linear',
    description: 'Linear issue tracking via GraphQL. API key for reads/writes; team-scoped contexts.',
    origin: 'bundled',
    integrationType: 'graphql',
    tagline: 'Issues & teams',
    CatalogGraphic: LinearIcon,
  },
  {
    id: 'gmail',
    name: 'Gmail',
    description: 'Gmail via Google OAuth. Read, send, and label messages scoped to context labels.',
    origin: 'bundled',
    integrationType: 'rest',
    tagline: 'Email',
    CatalogGraphic: GmailIcon,
  },
  {
    id: 'gcal',
    name: 'Google Calendar',
    description: 'Google Calendar via Google OAuth. Read and manage events scoped to context calendars.',
    origin: 'bundled',
    integrationType: 'rest',
    tagline: 'Calendar',
    CatalogGraphic: GcalIcon,
  },
  {
    id: 'gdrive',
    name: 'Google Drive',
    description: 'Google Drive via Google OAuth. List, search, download, and upload files scoped to context folders.',
    origin: 'bundled',
    integrationType: 'rest',
    tagline: 'Files',
    CatalogGraphic: GdriveIcon,
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

export function getOAuthServiceId(manifest: ConnectorManifest): string | null {
  const host = manifest.permissions?.host?.find(h => h.endsWith('.api'))
  return host ? host.split('.')[0] : null
}

export async function isOAuthClientConfigured(
  manifest: ConnectorManifest,
  getSecure: (key: string) => Promise<string | null>,
): Promise<boolean> {
  const serviceId = getOAuthServiceId(manifest)
  if (!serviceId) return false
  const raw = await getSecure(`connector:${serviceId}:client`)
  if (!raw?.trim()) return false
  try {
    const client = JSON.parse(raw) as Record<string, string>
    const fields = manifest.auth?.fields ?? []
    return fields.every(field => {
      if (field.optional) return true
      return !!client[field.key]?.trim()
    })
  } catch {
    return false
  }
}

export async function isWorkspaceConnectorConfigured(
  manifest: ConnectorManifest,
  getSecure: (key: string) => Promise<string | null>,
  mcpConnected: boolean,
): Promise<boolean> {
  const secretFields = (manifest.auth?.fields ?? []).filter(field => field.secret !== false)
  const needsMcp = (manifest.permissions?.mcp?.length ?? 0) > 0
  const optionalSecrets = manifest.auth?.type === 'oauth-with-rest-token'
  const isOAuth = manifest.auth?.type === 'oauth'

  if (isOAuth) {
    return isOAuthClientConfigured(manifest, getSecure)
  }

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
