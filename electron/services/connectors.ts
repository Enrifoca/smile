import { utilityProcess, UtilityProcess } from 'electron'
import fs from 'fs'
import path from 'path'
import {
  ApproveActionOutcome,
  ConnectorManifest,
  ContextEnvelope,
  HostHttpRequest,
  HostHttpResponse,
  SandboxToHostMessage,
  ToolResult,
  validateManifest,
} from '../../src/connectors/contract'

/**
 * Host-side connector runtime (main process).
 *
 * - Discovers declarative connectors under `<workspace>/.smile/connectors/`.
 * - Runs each connector's `handler.js` in a sandboxed utilityProcess.
 * - Brokers the host capability API (http/mcp/file/secrets/log), enforcing the
 *   permissions/allowlists declared in the manifest.
 *
 * The trusted core (renderer/agent) reaches this over IPC (wired in M3).
 */

const CALL_TIMEOUT_MS = 60_000

export interface LoadedConnector {
  manifest: ConnectorManifest
  dir: string
  promptMarkdown: string
  handlerSource: string
}

/** External services the broker delegates to, injected by main. */
export interface ConnectorCapabilityDeps {
  /** Read a workspace file. */
  readFile: (relativePath: string) => Promise<ToolResult<string>>
  /** Call a tool on a connected MCP server. */
  mcpCall: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<unknown>
  /** Read a connector-scoped secret. */
  getSecret: (connectorId: string, key: string) => string | null
  /** Persist prompt-ready knowledge markdown for a context+connector. */
  saveKnowledge: (contextId: string, connectorId: string, markdown: string) => void
  /** Read previously cached knowledge markdown for a context+connector. */
  getKnowledge: (contextId: string, connectorId: string) => string | null
  /** Surface connector logs (playground/diagnostics). */
  onLog?: (connectorId: string, level: string, args: unknown[]) => void
}

interface PendingCall {
  resolve: (value: ToolResult | ApproveActionOutcome) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

interface SandboxInstance {
  proc: UtilityProcess
  connector: LoadedConnector
  ready: Promise<void>
  pendingCalls: Map<string, PendingCall>
  /** Active context envelope per in-flight call, used to resolve host.context.*. */
  contextByCall: Map<string, ContextEnvelope>
}

export class ConnectorsService {
  private workspacePath: string | null = null
  private deps: ConnectorCapabilityDeps
  private sandboxModulePath: string
  private sandboxes = new Map<string, SandboxInstance>()
  private callSeq = 0

  constructor(deps: ConnectorCapabilityDeps, sandboxModulePath: string) {
    this.deps = deps
    this.sandboxModulePath = sandboxModulePath
  }

  setWorkspace(workspacePath: string | null): void {
    this.workspacePath = workspacePath
    void this.shutdownAll()
  }

  private connectorsRoot(): string | null {
    if (!this.workspacePath) return null
    return path.join(this.workspacePath, '.smile', 'connectors')
  }

  /** Discover and validate all connectors in the workspace. */
  async discover(): Promise<{ connectors: LoadedConnector[]; errors: Array<{ id: string; errors: string[] }> }> {
    const root = this.connectorsRoot()
    const connectors: LoadedConnector[] = []
    const errors: Array<{ id: string; errors: string[] }> = []
    if (!root || !fs.existsSync(root)) return { connectors, errors }

    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const dir = path.join(root, entry.name)
      const manifestPath = path.join(dir, 'manifest.json')
      const handlerPath = path.join(dir, 'handler.js')
      if (!fs.existsSync(manifestPath) || !fs.existsSync(handlerPath)) continue

      let raw: unknown
      try {
        raw = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
      } catch (error) {
        errors.push({ id: entry.name, errors: [`invalid JSON: ${String(error)}`] })
        continue
      }

      const validation = validateManifest(raw)
      if (!validation.ok) {
        errors.push({ id: entry.name, errors: validation.errors })
        continue
      }

      const promptPath = path.join(dir, 'prompt.md')
      connectors.push({
        manifest: validation.manifest,
        dir,
        handlerSource: fs.readFileSync(handlerPath, 'utf-8'),
        promptMarkdown: fs.existsSync(promptPath) ? fs.readFileSync(promptPath, 'utf-8') : '',
      })
    }

    return { connectors, errors }
  }

  /**
   * Discovery view safe to send to the renderer: manifest + prompt only. The
   * handler source never leaves the main process.
   */
  async listForRenderer(): Promise<{
    connectors: Array<{ manifest: ConnectorManifest; promptMarkdown: string }>
    errors: Array<{ id: string; errors: string[] }>
  }> {
    const { connectors, errors } = await this.discover()
    return {
      connectors: connectors.map(item => ({ manifest: item.manifest, promptMarkdown: item.promptMarkdown })),
      errors,
    }
  }

  /** Read cached prompt-ready knowledge for a context+connector (for prompt assembly). */
  getKnowledge(contextId: string, connectorId: string): string | null {
    return this.deps.getKnowledge(contextId, connectorId)
  }

  /** Execute a tool on a connector, spawning its sandbox if needed. */
  async executeTool(
    connectorId: string,
    name: string,
    args: Record<string, unknown>,
    context?: ContextEnvelope,
  ): Promise<ToolResult> {
    const sandbox = await this.ensureSandbox(connectorId)
    const callId = `call_${++this.callSeq}`
    const result = await this.sendCall(sandbox, { type: 'execute', callId, name, args }, callId, context)
    return result as ToolResult
  }

  /** Run a connector's custom approval orchestration. */
  async approveAction(
    connectorId: string,
    actionType: string,
    data: Record<string, unknown>,
    context?: ContextEnvelope,
  ): Promise<ApproveActionOutcome> {
    const sandbox = await this.ensureSandbox(connectorId)
    const callId = `call_${++this.callSeq}`
    const result = await this.sendCall(sandbox, { type: 'approve', callId, actionType, data }, callId, context)
    return result as ApproveActionOutcome
  }

  private sendCall(
    sandbox: SandboxInstance,
    message: { type: 'execute'; callId: string; name: string; args: Record<string, unknown> }
      | { type: 'approve'; callId: string; actionType: string; data: Record<string, unknown> },
    callId: string,
    context?: ContextEnvelope,
  ): Promise<ToolResult | ApproveActionOutcome> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        sandbox.pendingCalls.delete(callId)
        sandbox.contextByCall.delete(callId)
        reject(new Error('Connector call timed out'))
      }, CALL_TIMEOUT_MS)
      if (context) sandbox.contextByCall.set(callId, context)
      sandbox.pendingCalls.set(callId, { resolve, reject, timer })
      sandbox.proc.postMessage(message)
    })
  }

  private async ensureSandbox(connectorId: string): Promise<SandboxInstance> {
    const existing = this.sandboxes.get(connectorId)
    if (existing) {
      await existing.ready
      return existing
    }

    const { connectors } = await this.discover()
    const connector = connectors.find(item => item.manifest.id === connectorId)
    if (!connector) throw new Error(`Connector not found or invalid: ${connectorId}`)

    const proc = utilityProcess.fork(this.sandboxModulePath, [], { serviceName: `connector-${connectorId}` })
    const pendingCalls = new Map<string, PendingCall>()
    const contextByCall = new Map<string, ContextEnvelope>()

    let markReady: () => void = () => {}
    const ready = new Promise<void>(resolve => {
      markReady = resolve
    })

    const instance: SandboxInstance = { proc, connector, ready, pendingCalls, contextByCall }
    this.sandboxes.set(connectorId, instance)

    proc.on('message', (message: SandboxToHostMessage) => {
      void this.handleSandboxMessage(instance, message, markReady)
    })
    proc.on('exit', () => {
      for (const pending of pendingCalls.values()) {
        clearTimeout(pending.timer)
        pending.reject(new Error('Connector sandbox exited'))
      }
      pendingCalls.clear()
      contextByCall.clear()
      this.sandboxes.delete(connectorId)
    })

    proc.postMessage({ type: 'init', source: connector.handlerSource, apiVersion: connector.manifest.apiVersion })
    await ready
    return instance
  }

  private async handleSandboxMessage(
    sandbox: SandboxInstance,
    message: SandboxToHostMessage,
    markReady: () => void,
  ): Promise<void> {
    switch (message.type) {
      case 'ready':
        markReady()
        break
      case 'log':
        this.deps.onLog?.(sandbox.connector.manifest.id, message.level, message.args)
        break
      case 'result': {
        const pending = sandbox.pendingCalls.get(message.callId)
        if (!pending) break
        sandbox.pendingCalls.delete(message.callId)
        sandbox.contextByCall.delete(message.callId)
        clearTimeout(pending.timer)
        if (message.error) pending.reject(new Error(message.error))
        else pending.resolve(message.result as ToolResult | ApproveActionOutcome)
        break
      }
      case 'capability':
        await this.handleCapability(sandbox, message.callId, message.capId, message.method, message.params)
        break
    }
  }

  private async handleCapability(
    sandbox: SandboxInstance,
    callId: string,
    capId: string,
    method: string,
    params: unknown[],
  ): Promise<void> {
    const manifest = sandbox.connector.manifest
    const context = sandbox.contextByCall.get(callId) ?? null
    const respond = (ok: boolean, value?: unknown, error?: string) =>
      sandbox.proc.postMessage({ type: 'capabilityResult', capId, ok, value, error })

    try {
      const value = await this.invokeCapability(manifest, method, params, context)
      respond(true, value)
    } catch (error) {
      respond(false, undefined, error instanceof Error ? error.message : String(error))
    }
  }

  private async invokeCapability(
    manifest: ConnectorManifest,
    method: string,
    params: unknown[],
    context: ContextEnvelope | null,
  ): Promise<unknown> {
    const permissions = manifest.permissions || {}

    switch (method) {
      case 'context.get':
        return context?.config ?? null
      case 'context.saveKnowledge': {
        if (!context) throw new Error('No active context to save knowledge for')
        this.deps.saveKnowledge(context.contextId, manifest.id, params[0] as string)
        return undefined
      }
      case 'http.fetch': {
        const request = params[0] as HostHttpRequest
        const allowed = (permissions.http || []).some(prefix => request.url.startsWith(prefix))
        if (!allowed) throw new Error(`http not allowed for ${request.url}`)
        return this.brokerHttpFetch(request)
      }
      case 'mcp.call': {
        const [serverId, toolName, args] = params as [string, string, Record<string, unknown>]
        if (!(permissions.mcp || []).includes(serverId)) throw new Error(`mcp server not allowed: ${serverId}`)
        return this.deps.mcpCall(serverId, toolName, args)
      }
      case 'file.read': {
        if (!permissions.file?.read) throw new Error('file.read not permitted')
        return this.deps.readFile(params[0] as string)
      }
      case 'secrets.get': {
        const key = params[0] as string
        if (!(permissions.secrets || []).includes(key)) throw new Error(`secret not declared: ${key}`)
        return this.deps.getSecret(manifest.id, key)
      }
      default:
        throw new Error(`Unknown capability: ${method}`)
    }
  }

  private async brokerHttpFetch(request: HostHttpRequest): Promise<HostHttpResponse> {
    const response = await fetch(request.url, {
      method: request.method || 'GET',
      headers: request.headers,
      body: request.body,
    })
    const text = await response.text()
    let json: unknown
    try {
      json = JSON.parse(text)
    } catch {
      json = undefined
    }
    const headers: Record<string, string> = {}
    response.headers.forEach((value, key) => {
      headers[key] = value
    })
    return { ok: response.ok, status: response.status, headers, text, json }
  }

  async shutdownAll(): Promise<void> {
    for (const sandbox of this.sandboxes.values()) {
      try {
        sandbox.proc.postMessage({ type: 'shutdown' })
      } catch {
        // ignore
      }
      sandbox.proc.kill()
    }
    this.sandboxes.clear()
  }
}
