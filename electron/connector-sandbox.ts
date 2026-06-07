/**
 * Connector sandbox bootstrap — runs as an Electron utilityProcess child.
 *
 * Loads a connector's `handler.js` source (sent by the trusted host, so this
 * process needs no filesystem access) into a constrained `node:vm` context with
 * no `require`/`process`/`fetch`. The handler reaches the outside world only
 * through the `host` bridge, whose methods are RPC calls back to the host broker.
 *
 * This is the process boundary + a constrained JS context (apiVersion 1.0). A
 * stronger isolate (isolated-vm / QuickJS) can replace the vm layer later without
 * changing the protocol.
 */
import vm from 'node:vm'
import type {
  ApproveActionOutcome,
  ConnectorHandlerModule,
  HostBridge,
  HostToSandboxMessage,
  SandboxToHostMessage,
  ToolResult,
} from '../src/connectors/contract'

interface ParentPort {
  on(event: 'message', listener: (message: { data: HostToSandboxMessage }) => void): void
  postMessage(message: SandboxToHostMessage): void
}

const parentPort = (process as unknown as { parentPort: ParentPort }).parentPort

let handler: Partial<ConnectorHandlerModule> = {}
let handlerApiVersion = '0.0'
const pendingCapabilities = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
let capabilitySeq = 0

function post(message: SandboxToHostMessage): void {
  parentPort.postMessage(message)
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function makeHost(callId: string): HostBridge {
  const callCapability = (method: string, params: unknown[]): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const capId = `cap_${callId}_${++capabilitySeq}`
      pendingCapabilities.set(capId, { resolve, reject })
      post({ type: 'capability', callId, capId, method, params })
    })

  return {
    http: { fetch: request => callCapability('http.fetch', [request]) as ReturnType<HostBridge['http']['fetch']> },
    mcp: { call: (serverId, toolName, args) => callCapability('mcp.call', [serverId, toolName, args]) },
    file: { read: path => callCapability('file.read', [path]) as Promise<ToolResult<string>> },
    secrets: { get: key => callCapability('secrets.get', [key]) as Promise<string | null> },
    context: {
      get: () => callCapability('context.get', []) as Promise<Record<string, unknown> | null>,
      saveKnowledge: markdown => callCapability('context.saveKnowledge', [markdown]) as Promise<void>,
    },
    log: (level, ...args) => post({ type: 'log', callId, level, args }),
  }
}

function loadHandler(source: string, apiVersion: string): void {
  const moduleObject = { exports: {} as Partial<ConnectorHandlerModule> }
  const context = vm.createContext({
    module: moduleObject,
    exports: moduleObject.exports,
    console: {
      log: (...args: unknown[]) => post({ type: 'log', level: 'info', args }),
      info: (...args: unknown[]) => post({ type: 'log', level: 'info', args }),
      warn: (...args: unknown[]) => post({ type: 'log', level: 'warn', args }),
      error: (...args: unknown[]) => post({ type: 'log', level: 'error', args }),
    },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  })

  const script = new vm.Script(source, { filename: 'handler.js' })
  script.runInContext(context, { timeout: 5000 })
  handler = moduleObject.exports
  handlerApiVersion = apiVersion
}

async function handleExecute(callId: string, name: string, args: Record<string, unknown>): Promise<void> {
  if (typeof handler.executeTool !== 'function') {
    post({ type: 'result', callId, error: 'Connector handler does not export executeTool' })
    return
  }
  try {
    const result = await handler.executeTool(name, args, makeHost(callId))
    post({ type: 'result', callId, result })
  } catch (error) {
    post({ type: 'result', callId, error: errorMessage(error) })
  }
}

async function handleApprove(callId: string, actionType: string, data: Record<string, unknown>): Promise<void> {
  if (typeof handler.approveAction !== 'function') {
    const outcome: ApproveActionOutcome = { handled: false }
    post({ type: 'result', callId, result: outcome })
    return
  }
  try {
    const result = await handler.approveAction(actionType, data, makeHost(callId))
    post({ type: 'result', callId, result })
  } catch (error) {
    post({ type: 'result', callId, error: errorMessage(error) })
  }
}

function handleCapabilityResult(capId: string, ok: boolean, value?: unknown, error?: string): void {
  const pending = pendingCapabilities.get(capId)
  if (!pending) return
  pendingCapabilities.delete(capId)
  if (ok) pending.resolve(value)
  else pending.reject(new Error(error || 'Capability call failed'))
}

parentPort.on('message', ({ data }) => {
  switch (data.type) {
    case 'init':
      try {
        loadHandler(data.source, data.apiVersion)
        post({ type: 'ready', apiVersion: handlerApiVersion })
      } catch (error) {
        post({ type: 'log', level: 'error', args: ['Failed to load handler', errorMessage(error)] })
      }
      break
    case 'execute':
      void handleExecute(data.callId, data.name, data.args)
      break
    case 'approve':
      void handleApprove(data.callId, data.actionType, data.data)
      break
    case 'capabilityResult':
      handleCapabilityResult(data.capId, data.ok, data.value, data.error)
      break
    case 'shutdown':
      process.exit(0)
      break
  }
})
