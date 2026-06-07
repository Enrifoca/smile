import { ApproveActionOutcome } from './handler'
import { HostLogLevel } from './host'
import { ToolResult } from './result'

/**
 * RPC protocol between the trusted host (main process) and a sandboxed connector
 * runtime (utilityProcess). Plain JSON messages so the transport is portable.
 *
 * Flow:
 *  host -> sandbox: { execute | approve }
 *  sandbox -> host: { capability } whenever the handler calls host.*
 *  host -> sandbox: { capabilityResult }
 *  sandbox -> host: { result } when the call settles
 */

/** Active per-project context resolved for the connector on a given call. */
export interface ContextEnvelope {
  contextId: string
  config: Record<string, unknown> | null
}

/** Messages sent from the host into the sandbox. */
export type HostToSandboxMessage =
  | { type: 'init'; source: string; apiVersion: string }
  | { type: 'execute'; callId: string; name: string; args: Record<string, unknown> }
  | { type: 'approve'; callId: string; actionType: string; data: Record<string, unknown> }
  | { type: 'capabilityResult'; capId: string; ok: boolean; value?: unknown; error?: string }
  | { type: 'shutdown' }

/** Messages sent from the sandbox back to the host. */
export type SandboxToHostMessage =
  | { type: 'ready'; apiVersion: string }
  | {
      type: 'capability'
      callId: string
      capId: string
      /** Dotted capability path, e.g. "http.fetch", "secrets.get". */
      method: string
      params: unknown[]
    }
  | { type: 'log'; callId?: string; level: HostLogLevel; args: unknown[] }
  | { type: 'result'; callId: string; result?: ToolResult | ApproveActionOutcome; error?: string }
