import { Message, PendingAction, UserProfile } from './types'
import { MemoryStore } from '../types/memory'
import { ConnectorRuntime } from '../connectors/types'

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
  memory?: MemoryStore | null
  loadMemory?: () => Promise<MemoryStore | null>
  maxIterations?: number
  onMessage: (message: Message) => void
  onUpdateMessage?: (id: string, content: string, isStreaming: boolean) => void
  onPendingAction: (action: PendingAction) => void
  executeFileTool: (name: string, args: Record<string, unknown>) => Promise<unknown>
  executeMemoryTool: (name: string, args: Record<string, unknown>) => Promise<unknown>
  callAI: (messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>, tools?: unknown[]) => Promise<{
    success: boolean
    data?: AIResponse
    error?: string
  }>
  callAIStream?: (
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    tools: unknown[] | undefined,
    onToken: (token: string) => void
  ) => Promise<{ success: boolean; data?: AIResponse; error?: string }>
  callAIReasoning?: (messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>, tools?: unknown[]) => Promise<{ success: boolean; data?: AIResponse; error?: string }>
  callAIReasoningStream?: (
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    tools: unknown[] | undefined,
    onToken: (token: string) => void
  ) => Promise<{ success: boolean; data?: AIResponse; error?: string }>
}
