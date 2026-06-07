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

export interface ToolManifest {
  name: string
  description: string
  category: PluginToolCategory
  requiresConfirmation: boolean
  inputSchema: JSONSchema
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
  auth?: ConnectorAuth
  permissions?: ConnectorPermissions
  ui?: ConnectorUI
  /**
   * JSON Schema describing what a per-project context must provide for this
   * connector (e.g. `{ projectKeys: string[] }`). The Context management UI
   * collects values against this schema; the host injects them via
   * `host.context.get()` and the connector's prompt section.
   */
  contextSchema?: JSONSchema
  tools: ToolManifest[]
}
