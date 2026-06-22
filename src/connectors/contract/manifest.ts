import { ApiVersion } from './version'
import { JSONSchema } from './jsonSchema'

/**
 * Declarative connector package manifest (`manifest.json`).
 *
 * Language-neutral: describes identity, capabilities (permissions), auth fields,
 * UI labels, and the tools the connector exposes. Tool execution itself lives in
 * the sandboxed `handler.js` (see `handler.ts`).
 */

/** Categories a plugin tool may declare. Core tool categories are host-owned. */
export type PluginToolCategory = 'connector-read' | 'connector-write' | 'connector-attachment'

/** A single auth field collected from the user and stored connector-scoped. */
export interface ConnectorAuthField {
  key: string
  label: string
  /** When true, the value is stored as an encrypted secret and never logged. */
  secret?: boolean
}

export interface ConnectorAuth {
  /** Free-form so connectors can describe their own scheme; host treats unknown as opaque. */
  type: 'none' | 'api-key' | 'oauth' | 'oauth-with-rest-token' | string
  fields?: ConnectorAuthField[]
}

/**
 * Capabilities a connector is allowed to use, reviewed/approved on install.
 * The host broker enforces these; the sandbox cannot exceed them.
 */
export interface ConnectorPermissions {
  /** Allowlisted HTTP origins/prefixes for host.http.fetch (e.g. "https://api.example.com"). */
  http?: string[]
  /** Allowed MCP server ids for host.mcp.call. */
  mcp?: string[]
  /** Workspace file access. */
  file?: { read?: boolean; write?: boolean }
  /** Secret keys the connector may read via host.secrets.get (subset of auth fields). */
  secrets?: string[]
  /** Host-provided integrations brokered by the main process (integration id is manifest-defined). */
  host?: string[]
  /** Allowlisted CLI command prefixes for host.cli.run (v1 broker). */
  cli?: string[]
}

/** How the connector reaches external systems; used for catalog labels and author guidance. */
export type ConnectorIntegrationType =
  | 'sop'
  | 'rest'
  | 'graphql'
  | 'ftp'
  | 'sftp'
  | 'mcp'
  | 'cli'

export interface ConnectorCatalogMeta {
  /** Relative path inside the connector dir, e.g. "icon.png". */
  icon?: string
  /** Optional short label on catalog cards. */
  tagline?: string
}

export interface ConnectorUI {
  catalogLabel?: string
  connectedLabel?: string
  scopeLabel?: string
}

/** Optional declarative templates rendered with the tool args (e.g. "{{title}}"). */
export interface ToolConfirmationTemplate {
  title?: string
  summary?: string
}

/** How tool execution is implemented for this connector package. */
export type ConnectorHandlerKind = 'code' | 'mcp'

/** Maps a connector tool to an MCP server tool (used when handlerKind is 'mcp'). */
export interface ToolMcpBinding {
  serverId: string
  toolName: string
}

export interface ToolManifest {
  name: string
  description: string
  category: PluginToolCategory
  requiresConfirmation: boolean
  inputSchema: JSONSchema
  /** Required when manifest.handlerKind is 'mcp'. */
  mcp?: ToolMcpBinding
  /** Declarative confirmation card content for write tools. */
  confirmation?: ToolConfirmationTemplate
  /** Declarative one-line action preview, supports {{arg}} placeholders. */
  preview?: string
}

export interface ConnectorManifest {
  apiVersion: ApiVersion
  id: string
  name: string
  version: string
  description?: string
  /**
   * Execution model for this connector:
   * - `code` (default): sandboxed `handler.js` with custom logic.
   * - `mcp`: declarative 1:1 mapping to MCP tools; no handler.js required.
   */
  handlerKind?: ConnectorHandlerKind
  /** Integration style; optional — connector author may set explicitly. */
  integrationType?: ConnectorIntegrationType
  auth?: ConnectorAuth
  permissions?: ConnectorPermissions
  ui?: ConnectorUI
  /** Catalog presentation (icon path relative to connector dir). */
  catalog?: ConnectorCatalogMeta
  /**
   * JSON Schema describing what a per-project context must provide for this
   * connector (e.g. `{ projectKeys: string[] }`). The Context management UI
   * collects values against this schema; the host injects them via
   * `host.context.get()` and the connector's prompt section.
   */
  contextSchema?: JSONSchema
  /**
   * High-level capability tokens for agent prompt injection when this connector is enabled
   * (e.g. `["email"]`, `["web-search"]`). See `AGENT_CAPABILITY_LABELS` in `src/agent/capabilities.ts`.
   */
  agentCapabilities?: string[]
  tools: ToolManifest[]
}

