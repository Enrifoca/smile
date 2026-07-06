/**
 * Context management: a portable project scope stored under `.smile/contexts/<slug>/`.
 *
 * Each context folder contains:
 * - `<slug>.json` — metadata and connector configuration (no secrets)
 * - `<slug>.md` — textual knowledge the agent maintains via context tools
 * - `history/` — automatic backups before agent writes
 * - `files/` — generic file outputs created while the context is active
 * - Markdown reports created while the context is active are saved directly in this folder.
 *
 * Activate one context globally from the sidebar. When active, only enabled
 * connectors and their scoped settings apply, and file outputs are scoped to
 * this folder.
 */

/** Sentinel context id for workspace-wide connector knowledge (no active context). */
export const WORKSPACE_KNOWLEDGE_CONTEXT_ID = '__workspace__'

export const CONTEXT_FILE_VERSION = 1

export interface ContextConnectorConfig {
  enabled: boolean
  /** Connector-specific scope fields validated by each connector's contextSchema. */
  config: Record<string, unknown>
}

export interface ProjectContext {
  id: string
  name: string
  /** Filesystem-safe folder name under `.smile/contexts/`. */
  slug: string
  createdAt: string
  updatedAt: string
  version: number
  connectors: Record<string, ContextConnectorConfig>
}

/** Legacy shape kept for one-time migration from electron-store. */
export interface LegacyProjectContext {
  id: string
  name: string
  folder?: string
  connectorScopes?: Record<string, Record<string, unknown>>
}

export function getConnectorScopeConfig(
  context: ProjectContext,
  connectorId: string,
): Record<string, unknown> | null {
  const entry = context.connectors[connectorId]
  if (!entry?.enabled) return null
  return entry.config
}

export function getEnabledConnectorIds(context: ProjectContext): string[] {
  return Object.entries(context.connectors)
    .filter(([, entry]) => entry.enabled)
    .map(([id]) => id)
}

/** Workspace-relative path to the context folder (e.g. `.smile/contexts/acme`). */
export function getContextFolderPath(context: ProjectContext): string {
  return `.smile/contexts/${context.slug}`
}

/** Workspace-relative path to the context generic files folder. */
export function getContextFilesPath(context: ProjectContext): string {
  return `.smile/contexts/${context.slug}/files`
}
