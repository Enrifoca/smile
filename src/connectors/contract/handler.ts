import { HostBridge } from './host'
import { ToolResult } from './result'

/**
 * Shape of a connector's sandboxed `handler.js` module.
 *
 * Only execution crosses the sandbox boundary; declarative concerns (prompt,
 * confirmations, previews, formatting) live in the manifest/prompt and are read
 * by the host directly. Host-side bookkeeping (cache, scratchpad, source memory,
 * resume) stays in the trusted core and is replayed over reported `writes`.
 */

/** A write performed by approveAction, reported back so the core can post-process it. */
export interface ReportedWrite {
  name: string
  args: Record<string, unknown>
  result: ToolResult
}

export interface ApproveActionOutcome {
  /** True when the handler fully handled the approved action itself. */
  handled: boolean
  /** Optional user-facing completion message. */
  message?: string
  /** Ask the core to resume the agent loop (e.g. after recoverable errors). */
  resumeAgent?: boolean
  /** Writes executed by the handler, for core-side cache/scratchpad/source-memory replay. */
  writes?: ReportedWrite[]
}

export interface ConnectorHandlerModule {
  /** Execute a single tool call. */
  executeTool(
    name: string,
    args: Record<string, unknown>,
    host: HostBridge,
  ): Promise<ToolResult>
  /**
   * Optional custom approval orchestration (e.g. batched writes). When absent,
   * the core performs a plain single-tool execution after user approval.
   */
  approveAction?(
    actionType: string,
    data: Record<string, unknown>,
    host: HostBridge,
  ): Promise<ApproveActionOutcome>
}
