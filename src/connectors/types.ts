import { z } from 'zod'
import { ConfirmationViewModel, ToolEntry } from '../agent/types'

export type ToolCategory =
  | 'connector-read'
  | 'connector-write'
  | 'connector-attachment'
  | 'file-read'
  | 'file-write'
  | 'file-manage'
  | 'memory'
  | 'scratchpad'

export interface ToolDefinition {
  name: string
  description: string
  schema: z.ZodObject<z.ZodRawShape>
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
  /** Optional override for the source memory leaf summary on writes. */
  buildSourceMemoryLeaf?: (
    name: string,
    args: Record<string, unknown>,
    formattedResult: string,
  ) => { kind: 'write_outcome'; toolName: string; summary: string } | null
  approveAction?: (input: {
    actionType: string
    data: Record<string, unknown>
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
  executeTool: (name: string, args: Record<string, unknown>) => Promise<unknown>
}

export function ownsTool(connector: ConnectorDefinition, toolName: string): boolean {
  return connector.tools.some(tool => tool.name === toolName)
}
