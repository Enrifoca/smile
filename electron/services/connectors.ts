import { app, utilityProcess, UtilityProcess } from 'electron'
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import {
  ApproveActionOutcome,
  ConnectorManifest,
  ContextEnvelope,
  HostCliRequest,
  HostCliResponse,
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
const CLI_TIMEOUT_MS = 30_000
const CLI_MAX_OUTPUT_BYTES = 512 * 1024
const RESERVED_CONNECTOR_IDS = new Set<string>()

function isCliCommandAllowed(executable: string, allowlist: string[]): boolean {
  const trimmed = executable.trim()
  return allowlist.some(prefix => trimmed === prefix || trimmed.endsWith(`${path.sep}${prefix}`))
}

function resolveWorkspaceSubpath(workspacePath: string, relative?: string): string {
  const base = path.resolve(workspacePath)
  if (!relative) return base
  const resolved = path.resolve(base, relative)
  if (!resolved.startsWith(base + path.sep) && resolved !== base) {
    throw new Error('Path must stay inside the workspace')
  }
  return resolved
}

function resolveBundledConnectorsRoot(): string {
  const candidates = [
    path.join(app.getAppPath(), 'bundled', 'connectors'),
    path.join(process.resourcesPath, 'bundled', 'connectors'),
    path.join(__dirname, '..', 'bundled', 'connectors'),
    path.join(process.cwd(), 'bundled', 'connectors'),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  return candidates[0]
}

export interface LoadedConnector {
  manifest: ConnectorManifest
  dir: string
  promptMarkdown: string
  /** Present only when handlerKind is 'code' (default). */
  handlerSource?: string
}

/** External services the broker delegates to, injected by main. */
export interface ConnectorCapabilityDeps {
  /** Read a workspace file. */
  readFile: (relativePath: string) => Promise<ToolResult<string>>
  /** Call a tool on a connected MCP server. Result is already normalized to {@link ToolResult}. */
  mcpCall: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<ToolResult>
  /** Read a connector-scoped secret. */
  getSecret: (connectorId: string, key: string) => string | null
  /** Persist prompt-ready knowledge markdown for a context+connector. */
  saveKnowledge: (contextId: string, connectorId: string, markdown: string) => void
  /** Read previously cached knowledge markdown for a context+connector. */
  getKnowledge: (contextId: string, connectorId: string) => string | null
  /** Optional host-provided integrations declared in permissions.host. */
  hostCall?: (capability: string, params: Record<string, unknown>) => Promise<ToolResult>
  /** Optional diagnostic callback when a connector calls host.log. */
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
      if (!fs.existsSync(manifestPath)) continue

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

      const handlerKind = validation.manifest.handlerKind ?? 'code'
      const handlerPath = path.join(dir, 'handler.js')
      if (handlerKind === 'code' && !fs.existsSync(handlerPath)) continue

      const promptPath = path.join(dir, 'prompt.md')
      connectors.push({
        manifest: validation.manifest,
        dir,
        handlerSource: handlerKind === 'code' ? fs.readFileSync(handlerPath, 'utf-8') : undefined,
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

  async deletePackage(connectorId: string): Promise<void> {
    if (RESERVED_CONNECTOR_IDS.has(connectorId)) {
      throw new Error(`Cannot delete reserved connector: ${connectorId}`)
    }
    const connector = await this.getConnector(connectorId)
    await this.shutdownConnector(connectorId)
    fs.rmSync(connector.dir, { recursive: true, force: true })
  }

  /** Copy a shipped bundled connector from `bundled/connectors/<id>/` into the workspace. */
  async installBundledPackage(connectorId: string): Promise<ConnectorManifest> {
    const root = this.connectorsRoot()
    if (!root) throw new Error('Workspace not configured')

    const sourceDir = path.join(resolveBundledConnectorsRoot(), connectorId)
    if (!fs.existsSync(sourceDir)) {
      throw new Error(`Bundled connector not found: ${connectorId}`)
    }

    const manifestPath = path.join(sourceDir, 'manifest.json')
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`Bundled connector is missing manifest.json: ${connectorId}`)
    }

    let raw: unknown
    try {
      raw = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
    } catch (error) {
      throw new Error(`Invalid bundled manifest: ${String(error)}`)
    }

    const validation = validateManifest(raw)
    if (!validation.ok) {
      throw new Error(validation.errors.join('; '))
    }
    if (validation.manifest.id !== connectorId) {
      throw new Error(`Bundled manifest id "${validation.manifest.id}" does not match folder "${connectorId}"`)
    }

    const destDir = path.join(root, connectorId)
    if (fs.existsSync(destDir)) {
      throw new Error(`Connector already installed: ${connectorId}`)
    }

    fs.mkdirSync(root, { recursive: true })
    fs.cpSync(sourceDir, destDir, { recursive: true })
    return validation.manifest
  }

  async getIconDataUrl(connectorId: string): Promise<string | null> {
    try {
      const connector = await this.getConnector(connectorId)
      return this.readIconDataUrl(connector.dir, connector.manifest)
    } catch {
      return null
    }
  }

  getBundledIconDataUrl(connectorId: string): string | null {
    const sourceDir = path.join(resolveBundledConnectorsRoot(), connectorId)
    if (!fs.existsSync(sourceDir)) return null

    const manifestPath = path.join(sourceDir, 'manifest.json')
    if (!fs.existsSync(manifestPath)) return null

    try {
      const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
      const validation = validateManifest(raw)
      if (!validation.ok) return null
      return this.readIconDataUrl(sourceDir, validation.manifest)
    } catch {
      return null
    }
  }

  /** Execute a tool on a connector, spawning its sandbox if needed. */
  async executeTool(
    connectorId: string,
    name: string,
    args: Record<string, unknown>,
    context?: ContextEnvelope,
  ): Promise<ToolResult> {
    const connector = await this.getConnector(connectorId)
    if ((connector.manifest.handlerKind ?? 'code') === 'mcp') {
      return this.executeMcpTool(connector.manifest, name, args)
    }

    const sandbox = await this.ensureSandbox(connector)
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
    const connector = await this.getConnector(connectorId)
    if ((connector.manifest.handlerKind ?? 'code') === 'mcp') {
      return { handled: false }
    }

    const sandbox = await this.ensureSandbox(connector)
    const callId = `call_${++this.callSeq}`
    const result = await this.sendCall(sandbox, { type: 'approve', callId, actionType, data }, callId, context)
    return result as ApproveActionOutcome
  }

  private async getConnector(connectorId: string): Promise<LoadedConnector> {
    const { connectors } = await this.discover()
    const connector = connectors.find(item => item.manifest.id === connectorId)
    if (!connector) throw new Error(`Connector not found or invalid: ${connectorId}`)
    return connector
  }

  private async executeMcpTool(
    manifest: ConnectorManifest,
    name: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    const tool = manifest.tools.find(item => item.name === name)
    if (!tool?.mcp) return { success: false, error: `Unknown tool: ${name}` }

    const { serverId, toolName } = tool.mcp
    if (!(manifest.permissions?.mcp || []).includes(serverId)) {
      return { success: false, error: `mcp server not allowed: ${serverId}` }
    }

    try {
      return await this.deps.mcpCall(serverId, toolName, args)
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
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

  private async ensureSandbox(connectorOrId: LoadedConnector | string): Promise<SandboxInstance> {
    const connector = typeof connectorOrId === 'string'
      ? await this.getConnector(connectorOrId)
      : connectorOrId

    const connectorId = connector.manifest.id
    const existing = this.sandboxes.get(connectorId)
    if (existing) {
      await existing.ready
      return existing
    }

    if (!connector.handlerSource) {
      throw new Error(`Connector ${connectorId} has no handler.js (handlerKind must be "code")`)
    }

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
      case 'cli.run': {
        if (!(permissions.cli || []).length) throw new Error('cli.run not permitted')
        return this.brokerCliRun(params[0] as HostCliRequest, permissions.cli || [])
      }
      case 'secrets.get': {
        const key = params[0] as string
        if (!(permissions.secrets || []).includes(key)) throw new Error(`secret not declared: ${key}`)
        return this.deps.getSecret(manifest.id, key)
      }
      case 'host.call': {
        const [capability, callParams] = params as [string, Record<string, unknown>]
        if (!(permissions.host || []).includes(capability)) {
          throw new Error(`host capability not permitted: ${capability}`)
        }
        if (!this.deps.hostCall) {
          throw new Error(`Host capability not available: ${capability}`)
        }
        return this.deps.hostCall(capability, callParams)
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

  private readIconDataUrl(dir: string, manifest: ConnectorManifest): string | null {
    const candidates = [
      manifest.catalog?.icon,
      'icon.svg',
      'icon.png',
    ].filter((value): value is string => typeof value === 'string' && value.length > 0)

    for (const iconRel of [...new Set(candidates)]) {
      const iconPath = path.join(dir, iconRel)
      if (!fs.existsSync(iconPath)) continue
      const buf = fs.readFileSync(iconPath)
      const ext = path.extname(iconPath).toLowerCase()
      const mime = ext === '.svg'
        ? 'image/svg+xml'
        : ext === '.jpg' || ext === '.jpeg'
          ? 'image/jpeg'
          : 'image/png'
      return `data:${mime};base64,${buf.toString('base64')}`
    }
    return null
  }

  private brokerCliRun(request: HostCliRequest, allowlist: string[]): Promise<HostCliResponse> {
    if (!this.workspacePath) {
      return Promise.resolve({ success: false, exitCode: null, stdout: '', stderr: '', error: 'No workspace selected' })
    }

    const command = request.command?.trim()
    if (!command) {
      return Promise.resolve({ success: false, exitCode: null, stdout: '', stderr: '', error: 'command is required' })
    }

    const hasSeparateArgs = (request.args?.length ?? 0) > 0
    const executable = hasSeparateArgs ? command : command.split(/\s+/)[0]
    const inlineArgs = hasSeparateArgs ? [] : command.split(/\s+/).slice(1)
    if (!isCliCommandAllowed(executable, allowlist)) {
      return Promise.resolve({ success: false, exitCode: null, stdout: '', stderr: '', error: `cli not allowed: ${executable}` })
    }

    const cwd = resolveWorkspaceSubpath(this.workspacePath, request.cwd)
    const args = [...inlineArgs, ...(request.args ?? [])]

    return new Promise(resolve => {
      let stdout = ''
      let stderr = ''
      let truncated = false

      const append = (target: 'stdout' | 'stderr', chunk: string) => {
        const current = target === 'stdout' ? stdout : stderr
        if (current.length >= CLI_MAX_OUTPUT_BYTES) {
          truncated = true
          return
        }
        const next = current + chunk
        if (next.length > CLI_MAX_OUTPUT_BYTES) {
          if (target === 'stdout') stdout = next.slice(0, CLI_MAX_OUTPUT_BYTES)
          else stderr = next.slice(0, CLI_MAX_OUTPUT_BYTES)
          truncated = true
          return
        }
        if (target === 'stdout') stdout = next
        else stderr = next
      }

      const child = spawn(executable, args, {
        cwd,
        env: { ...process.env, ...request.env },
        windowsHide: true,
      })

      const timer = setTimeout(() => {
        child.kill()
        resolve({
          success: false,
          exitCode: null,
          stdout,
          stderr,
          error: 'CLI timed out',
        })
      }, CLI_TIMEOUT_MS)

      child.stdout?.on('data', chunk => append('stdout', String(chunk)))
      child.stderr?.on('data', chunk => append('stderr', String(chunk)))
      child.on('error', error => {
        clearTimeout(timer)
        resolve({
          success: false,
          exitCode: null,
          stdout,
          stderr,
          error: error.message,
        })
      })
      child.on('close', exitCode => {
        clearTimeout(timer)
        resolve({
          success: exitCode === 0,
          exitCode,
          stdout,
          stderr: truncated ? `${stderr}\n[output truncated]`.trim() : stderr,
          error: exitCode === 0 ? undefined : `Process exited with code ${exitCode}`,
        })
      })
    })
  }

  private async shutdownConnector(connectorId: string): Promise<void> {
    const sandbox = this.sandboxes.get(connectorId)
    if (!sandbox) return
    try {
      sandbox.proc.postMessage({ type: 'shutdown' })
    } catch {
      // ignore
    }
    sandbox.proc.kill()
    this.sandboxes.delete(connectorId)
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
