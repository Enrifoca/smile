import { Message, PendingAction, UserProfile } from './types'
import { MemoryStore } from '../types/memory'
import { ConnectorRuntime } from '../connectors/types'
import { ConnectorScope } from '../connectors/registry'
import { SourceMemoryLeafInput } from '../memory/sourceTypes'
import type { AIStreamProgressEvent } from '../shared/streamProgress'
import type { ContextPromptBody } from '../context/promptInjection'
import type { ProjectContext } from '../context/types'

export interface AIResponse {
  content: string
  toolCalls?: Array<{
    id: string
    name: string
    arguments: Record<string, unknown>
  }>
}

export interface AgentConfig {
  userProfile: UserProfile | null
  connectors?: ConnectorRuntime[]
  monitoredScopes?: ConnectorScope[]
  memory?: MemoryStore | null
  loadMemory?: () => Promise<MemoryStore | null>
  appendSourceMemory?: (leaf: SourceMemoryLeafInput) => Promise<void>
  maxIterations?: number
  onMessage: (message: Message) => void
  onUpdateMessage?: (id: string, content: string, isStreaming: boolean) => void
  onPendingAction: (action: PendingAction) => void
  /** Live status line while the agent is working (null clears it) */
  onAgentStatus?: (status: string | null) => void
  executeFileTool: (name: string, args: Record<string, unknown>) => Promise<unknown>
  executeMemoryTool: (name: string, args: Record<string, unknown>) => Promise<unknown>
  executeContextTool: (name: string, args: Record<string, unknown>) => Promise<unknown>
  /** Load context markdown for prompt injection (full file or tool-only gate). */
  loadContextPromptBody?: (contextId: string) => Promise<ContextPromptBody>
  /** Reload the active context record from storage before tool calls (avoids stale scope config). */
  refreshActiveContext?: (contextId: string) => Promise<ProjectContext | null>
  callAI: (messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>, tools?: unknown[]) => Promise<{
    success: boolean
    data?: AIResponse
    error?: string
  }>
  callAIStream?: (
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    tools: unknown[] | undefined,
    onToken: (token: string) => void,
    onProgress?: (event: AIStreamProgressEvent) => void,
  ) => Promise<{ success: boolean; data?: AIResponse; error?: string }>
  callAIReasoning?: (messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>, tools?: unknown[]) => Promise<{ success: boolean; data?: AIResponse; error?: string }>
  callAIReasoningStream?: (
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    tools: unknown[] | undefined,
    onToken: (token: string) => void,
    onProgress?: (event: AIStreamProgressEvent) => void,
  ) => Promise<{ success: boolean; data?: AIResponse; error?: string }>
  /** Cancel an in-flight streaming chat request, if any. */
  abortAIStream?: () => void
}
