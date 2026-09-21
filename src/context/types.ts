/**
 * Context management: a portable project scope.
 *
 * Framework metadata for each context is stored under `.smile/contexts/<slug>/`:
 * - `<slug>.json` — metadata and connector configuration (no secrets)
 * - `<slug>.md` — textual knowledge the agent maintains via context tools
 * - `history/` — automatic backups before agent writes
 *
 * User-facing files for the context live in the visible workspace folder
 * `contexts/<slug>/` with subfolders:
 * - `reports/` — markdown reports
 * - `charts/` — charts and diagrams
 * - `images/` — generated images
 * - `files/` — generic file outputs
 *
 * Activate one context globally from the sidebar. When active, only enabled
 * connectors and their scoped settings apply, and file outputs are scoped to
 * the `contexts/<slug>/` folder.
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
  /** Filesystem-safe folder name under `contexts/` and `.smile/contexts/`. */
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

/** Workspace-relative path to the visible context folder (e.g. `contexts/acme`). */
export function getContextFolderPath(context: ProjectContext): string {
  return `contexts/${context.slug}`
}

/** Workspace-relative path to the context generic files folder. */
export function getContextFilesPath(context: ProjectContext): string {
  return `contexts/${context.slug}/files`
}

/** Workspace-relative path to the context reports folder. */
export function getContextReportsPath(context: ProjectContext): string {
  return `contexts/${context.slug}/reports`
}
