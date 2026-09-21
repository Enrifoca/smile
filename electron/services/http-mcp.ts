/**
 * Generic HTTP MCP client service.
 *
 * Wraps the official MCP TypeScript SDK's Client + StreamableHTTPClientTransport
 * to provide per-server lifecycle management for connectors that declare
 * `handlerKind: "mcp"` with `mcpServers` in their manifest.
 *
 * This service is transport infrastructure only. It does not contain connector
 * tool logic, schemas, or prompt text — those live in connector packages.
 */

import { EventEmitter } from 'events'
import { Client } from '@modelcontextprotocol/sdk/client'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp'
import type { McpServerConfig, ToolResult } from '../../src/connectors/contract'
import { normalizeMcpResult } from '../../src/connectors/contract'

export type HttpMcpConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error'

export interface HttpMcpServerHandle {
  callRawTool(toolName: string, args: Record<string, unknown>): Promise<unknown>
}

interface ServerEntry {
  config: McpServerConfig
  getSecret: (key: string) => string | null | Promise<string | null>
  client?: Client
  transport?: StreamableHTTPClientTransport
  state: HttpMcpConnectionState
  error?: string
}

interface ConnectionStateEvent {
  serverId: string
  state: HttpMcpConnectionState
  error?: string
}

const DEFAULT_CLIENT_NAME = 'smile:D'
const DEFAULT_CLIENT_VERSION = '0.3.0'

export class HttpMcpService extends EventEmitter {
  private servers = new Map<string, ServerEntry>()

  /**
   * Register (or re-register) an HTTP MCP server configuration.
   * Re-registration disconnects any existing connection so stale config is never reused.
   */
  async register(
    serverId: string,
    config: McpServerConfig,
    getSecret: (key: string) => string | null | Promise<string | null>,
  ): Promise<void> {
    if (this.servers.has(serverId)) {
      await this.disconnect(serverId)
    }
    this.servers.set(serverId, { config, getSecret, state: 'disconnected' })
  }

  unregister(serverId: string): Promise<void> {
    return this.disconnect(serverId).then(() => {
      this.servers.delete(serverId)
    })
  }

  private getEntry(serverId: string): ServerEntry {
    const entry = this.servers.get(serverId)
    if (!entry) throw new Error(`HTTP MCP server not registered: ${serverId}`)
    return entry
  }

  private setState(serverId: string, state: HttpMcpConnectionState, error?: string): void {
    const entry = this.getEntry(serverId)
    entry.state = state
    entry.error = error
    this.emit('connectionState', { serverId, state, error } as ConnectionStateEvent)
  }

  getConnectionStatus(serverId: string): boolean {
    return this.servers.get(serverId)?.state === 'connected'
  }

  getConnectionState(serverId: string): { state: HttpMcpConnectionState; error?: string } {
    const entry = this.servers.get(serverId)
    if (!entry) return { state: 'disconnected' }
    return { state: entry.state, error: entry.error }
  }

  isRegistered(serverId: string): boolean {
    return this.servers.has(serverId)
  }

  getRegisteredServerIds(): string[] {
    return [...this.servers.keys()]
  }

  private async resolveAuthHeader(entry: ServerEntry): Promise<Record<string, string>> {
    const { config } = entry
    const rawSecret = await entry.getSecret(config.authSecretField)
    if (!rawSecret?.trim()) {
      throw new Error(`${config.authSecretField} is not configured`)
    }
    const headerName = config.authHeader || 'Authorization'
    const headerValue = config.authHeaderPrefix
      ? `${config.authHeaderPrefix}${rawSecret}`
      : rawSecret
    return { [headerName]: headerValue }
  }

  async connect(serverId: string): Promise<{ success: boolean; error?: string }> {
    const entry = this.getEntry(serverId)

    if (entry.state === 'connected' && entry.client && entry.transport) {
      return { success: true }
    }

    if (entry.state === 'connecting') {
      return { success: false, error: 'Connection already in progress' }
    }

    this.setState(serverId, 'connecting')

    try {
      // Tear down any half-open state from a previous attempt.
      await this.closeEntry(serverId)

      const authHeaders = await this.resolveAuthHeader(entry)
      const url = new URL(entry.config.baseUrl)
      const transport = new StreamableHTTPClientTransport(url, {
        requestInit: { headers: authHeaders },
      })

      const client = new Client(
        { name: DEFAULT_CLIENT_NAME, version: DEFAULT_CLIENT_VERSION },
        { capabilities: {} },
      )

      await client.connect(transport)

      // Verify the server actually exposed tools capability; listTools is cheap diagnostics.
      try {
        await client.listTools()
      } catch {
        // Some servers may not support tools/list or may require specific scopes.
        // We don't fail the connection here; the tool call itself will surface errors.
      }

      entry.client = client
      entry.transport = transport
      this.setState(serverId, 'connected')
      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.setState(serverId, 'error', this.sanitizeError(message))
      await this.closeEntry(serverId)
      return { success: false, error: this.sanitizeError(message) }
    }
  }

  async disconnect(serverId: string): Promise<void> {
    const entry = this.servers.get(serverId)
    if (!entry) return
    await this.closeEntry(serverId)
    entry.state = 'disconnected'
    entry.error = undefined
    this.setState(serverId, 'disconnected')
  }

  async disconnectAll(): Promise<void> {
    await Promise.all([...this.servers.keys()].map(id => this.disconnect(id)))
  }

  private async closeEntry(serverId: string): Promise<void> {
    const entry = this.getEntry(serverId)
    try {
      await entry.client?.close()
    } catch {
      // ignore
    }
    try {
      await entry.transport?.close()
    } catch {
      // ignore
    }
    entry.client = undefined
    entry.transport = undefined
  }

  async callRawTool(serverId: string, toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    const entry = this.getEntry(serverId)

    if (entry.state !== 'connected' || !entry.client) {
      const connectResult = await this.connect(serverId)
      if (!connectResult.success) {
        return { success: false, error: connectResult.error || `Could not connect to ${serverId}` }
      }
    }

    const client = entry.client!
    try {
      const raw = await client.callTool({ name: toolName, arguments: args })
      return normalizeMcpResult(raw)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      // If the session expired, try once to reconnect and retry the call.
      if (/session|expired|unauthorized|401|403/i.test(message)) {
        await this.closeEntry(serverId)
        const reconnect = await this.connect(serverId)
        if (!reconnect.success) {
          return { success: false, error: this.sanitizeError(reconnect.error || message) }
        }
        try {
          const raw = await entry.client!.callTool({ name: toolName, arguments: args })
          return normalizeMcpResult(raw)
        } catch (retryError) {
          const retryMessage = retryError instanceof Error ? retryError.message : String(retryError)
          return { success: false, error: this.sanitizeError(retryMessage) }
        }
      }
      return { success: false, error: this.sanitizeError(message) }
    }
  }

  getHandle(serverId: string): HttpMcpServerHandle {
    return {
      callRawTool: (toolName: string, args: Record<string, unknown>) =>
        this.callRawTool(serverId, toolName, args),
    }
  }

  private sanitizeError(message: string): string {
    // Never let raw API keys or bearer tokens leak into error strings returned to the model/UI.
    return message
      .replace(/([Bb]earer\s+)[\w\-\.]+/g, '$1••••••••')
      .replace(/([Aa]pi[_-]?[Kk]ey\s*[:=]\s*)[\w\-\.]+/g, '$1••••••••')
      .replace(/([Xx]-[Aa]pi-[Kk]ey\s*[:=]\s*)[\w\-\.]+/g, '$1••••••••')
  }
}

let sharedService: HttpMcpService | null = null

export function getHttpMcpService(): HttpMcpService {
  if (!sharedService) {
    sharedService = new HttpMcpService()
  }
  return sharedService
}
