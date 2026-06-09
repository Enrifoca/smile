// Agent types

import type { MarkdownArtifact } from './artifacts'

export type { MarkdownArtifact } from './artifacts'

/** A single tool operation recorded in a tool-summary block */
export interface ToolEntry {
  tool: string
  label: string
  group: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
  toolCalls?: ToolCall[]
  pendingAction?: PendingAction
  pendingActionStatus?: 'active' | 'approved' | 'cancelled' | 'revision_requested'
  isStreaming?: boolean
  /**
   * Message type:
   *  - undefined / omitted → normal response bubble
   *  - 'thinking'      → "Thought for Xs" collapsible reasoning block
   *  - 'tool_summary'  → grouped tool-call summary row
   *  - 'artifact'      → markdown report card (see artifact)
   */
  type?: 'thinking' | 'tool_summary' | 'artifact'
  /** Markdown report shown as an in-chat card + modal */
  artifact?: MarkdownArtifact
  /** Elapsed thinking time in ms (set on type:'thinking' messages) */
  thinkingMs?: number
  /** Tool operations for this round (set on type:'tool_summary' messages) */
  toolEntries?: ToolEntry[]
  /** @deprecated use type:'thinking' — kept for backwards compat with saved history */
  isPlan?: boolean
}

export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
  result?: unknown
  status: 'pending' | 'approved' | 'rejected' | 'completed' | 'error'
}

export interface ConfirmationField {
  label: string
  value: string
}

export interface ConfirmationItem {
  title: string
  subtitle?: string
  body?: string
  badge?: string
}

export interface ConfirmationViewModel {
  title: string
  description?: string
  preview?: string
  fields?: ConfirmationField[]
  items?: ConfirmationItem[]
  risk?: 'low' | 'medium' | 'high'
  approveLabel?: string
  /** Optional checklist appended to fallback chat copy when the model does not explain the action */
  acceptanceCriteria?: string[]
}

export interface PendingAction {
  id: string
  type: string
  description: string
  data: Record<string, unknown>
  preview?: string
  confirmation?: ConfirmationViewModel
}

export interface UserProfile {
  /** 0 = technical, 100 = conversational */
  styleSpectrum: number
  /** 0 = concise, 100 = detailed */
  detailSpectrum: number
  /** 0 = formal, 100 = casual */
  toneSpectrum: number
  focusProjects: string[]
  confirmAllConnectorActions: boolean
}

export interface AIConfig {
  provider: 'openai' | 'anthropic' | 'mistral' | 'groq' | 'moonshot' | 'deepseek'
  apiKey: string
  model?: string
}

export interface Chat {
  id: string
  title: string
  date: string
  messages: Message[]
}

export type ToolName = string
