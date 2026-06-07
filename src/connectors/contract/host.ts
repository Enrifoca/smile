import { ToolResult } from './result'

/**
 * Host capability bridge handed to a sandboxed connector handler.
 *
 * The handler never touches Electron/Node directly: every method here is an RPC
 * to the trusted host broker, gated by the connector's declared permissions and
 * allowlists. Keeping this interface free of host-specific types is what lets a
 * future Tauri/Rust host implement the same boundary without breaking connectors.
 */

export interface HostHttpRequest {
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  headers?: Record<string, string>
  body?: string
}

export interface HostHttpResponse {
  ok: boolean
  status: number
  headers: Record<string, string>
  text: string
  /** Parsed JSON body when the response is JSON, otherwise undefined. */
  json?: unknown
}

export type HostLogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface HostBridge {
  http: {
    /** Fetch a resource. Only origins in permissions.http are allowed. */
    fetch(request: HostHttpRequest): Promise<HostHttpResponse>
  }
  mcp: {
    /** Call a tool on a connected MCP server in permissions.mcp. Returns a normalized {@link ToolResult}. */
    call(serverId: string, toolName: string, args: Record<string, unknown>): Promise<ToolResult>
  }
  file: {
    /** Read a workspace file (requires permissions.file.read). */
    read(path: string): Promise<ToolResult<string>>
  }
  secrets: {
    /** Read a connector-scoped secret declared in permissions.secrets. */
    get(key: string): Promise<string | null>
  }
  /**
   * Host-provided integrations declared in permissions.host (e.g.
   * `jira.uploadAttachment`). Params shape is integration-specific.
   */
  call: (capability: string, params: Record<string, unknown>) => Promise<ToolResult>
  context: {
    /**
     * This connector's resolved configuration for the active context, shaped by
     * the manifest `contextSchema` (e.g. `{ projectKeys: [...] }`). Null when no
     * context is active or the connector is unconfigured for it.
     */
    get(): Promise<Record<string, unknown> | null>
    /**
     * Persist prompt-ready Markdown "knowledge" for the active context+connector.
     * The host caches it and injects it into the connector's prompt section, so
     * formatting stays in the connector while prompt assembly stays synchronous.
     * Typically called from a `*_sync` tool, not on every turn.
     */
    saveKnowledge(markdown: string): Promise<void>
  }
  /** Diagnostic logging surfaced in the connector playground. */
  log(level: HostLogLevel, ...args: unknown[]): void
}
