import { z } from 'zod'
import { ConfirmationViewModel, ToolEntry } from '../agent/types'
import { ContextEnvelope } from './contract'

export type ToolCategory =
  | 'connector-read'
  | 'connector-write'
  | 'connector-attachment'
  | 'file-read'
  | 'file-write'
  | 'file-manage'
  | 'memory'
  | 'scratchpad'
  | 'analysis'
  | 'context'

export interface ToolDefinition {
  name: string
  description: string
  /** Zod schema for core/built-in tools. Omit when `jsonSchema` is provided. */
  schema?: z.ZodObject<z.ZodRawShape>
  /**
   * Precomputed JSON Schema for declarative plugin tools (manifest `inputSchema`).
   * When present it is sent to the model as-is; otherwise `schema` is converted.
   */
  jsonSchema?: Record<string, unknown>
  requiresConfirmation: boolean
  category: ToolCategory
}

export interface ConnectorDefinition<TContext = unknown> {
  id: string
  name: string
  description: string
  tools: ToolDefinition[]
  getPromptSection?: (context?: TContext | null) => string
  getToolEntry?: (name: string, args: Record<string, unknown>) => ToolEntry | null
  getActionConfirmation?: (name: string, args: Record<string, unknown>) => ConfirmationViewModel | null
  getActionConfirmationPrompt?: (name: string, args: Record<string, unknown>) => string | null
  getActionPreview?: (name: string, args: Record<string, unknown>) => string | null
  formatToolResultForAI?: (name: string, result: unknown) => string | null
  getScratchpadNote?: (name: string, args: Record<string, unknown>, formattedResult: string) => string | null
  invalidateCacheAfterWrite?: (name: string, args: Record<string, unknown>, cacheKeys: string[]) => string[]
  /** Map a write tool call to a monitored connector scope for source memory. */
  getScopeForSourceMemory?: (name: string, args: Record<string, unknown>) => { connectorId: string; scopeId: string } | null
  /**
   * Optional high-level capability tokens for agent prompt injection (e.g. `email`, `web-search`).
   * Declared in connector `manifest.json`; summarized in the Enabled capabilities prompt section.
   */
  agentCapabilities?: string[]
  /** Optional override for the source memory leaf summary on writes. */
  buildSourceMemoryLeaf?: (
    name: string,
    args: Record<string, unknown>,
    formattedResult: string,
  ) => { kind: 'write_outcome'; toolName: string; summary: string } | null
  approveAction?: (input: {
    actionType: string
    data: Record<string, unknown>
    contextEnvelope?: ContextEnvelope
    executeTool: (name: string, args: Record<string, unknown>) => Promise<unknown>
    formatToolResultForAI: (name: string, result: unknown) => string
    updateScratchpadAfterTool: (name: string, args: Record<string, unknown>, formattedResult: string) => void
    invalidateCacheAfterWrite: (name: string, args: Record<string, unknown>) => void
    cacheToolResult: (name: string, args: Record<string, unknown>, formattedResult: string) => void
  }) => Promise<{ handled: boolean; message?: string; resumeAgent?: boolean }>
}

export interface ConnectorRuntime<TContext = any> {
  definition: ConnectorDefinition<TContext>
  context?: TContext | null
  executeTool: (name: string, args: Record<string, unknown>, context?: ContextEnvelope) => Promise<unknown>
  /**
   * Set the active project context envelope for this connector. The runtime
   * threads it into execution and approval so tools run scoped to the context.
   */
  setActiveContext?: (envelope: ContextEnvelope | null) => void
}

export function ownsTool(connector: ConnectorDefinition, toolName: string): boolean {
  return connector.tools.some(tool => tool.name === toolName)
}
