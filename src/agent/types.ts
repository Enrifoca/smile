// Agent types

import type { MarkdownArtifact } from './artifacts'

export type { MarkdownArtifact } from './artifacts'

import type { ToolCategory } from '../connectors/types'

/** A single tool operation recorded in a tool-summary block */
export interface ToolEntry {
  tool: string
  /** Past-tense label shown in the expanded tool-summary row */
  label: string
  /** Grouping key: `file`, `memory`, or a connector id */
  group: string
  category?: ToolCategory
  /** Display name when group is a connector id */
  connectorName?: string
  /** Status while the model streams this tool call */
  preparingLabel: string
  /** Status while the tool executes */
  runningLabel: string
  /** Status before the next model call after this tool */
  afterLabel: string
  /** Arguments used for this tool call (shown in expanded details for debugging) */
  args?: Record<string, unknown>
  /** Formatted result returned by the tool (shown for read tools) */
  result?: string
  /** Whether the tool returned an error */
  isError?: boolean
}

export interface AgentContextSnapshotSection {
  name: string
  present: boolean
  /** Undefined when the section is referenced but its content is intentionally hidden (e.g. system prompt, memory). */
  content?: string
  /** Estimated token count for this section (0 if content is hidden or empty). */
  tokens?: number
}

export interface AgentContextSnapshot {
  /** The last user message that started this turn. */
  userMessage: string
  /** Sections included in the latest call to the model, in prompt order. */
  sections: AgentContextSnapshotSection[]
  /** The assembled system prompt content sent to the model (may be large). */
  systemPrompt?: string
  /** Recent conversation history included in the latest call. */
  recentHistory?: Array<{ role: string; content: string }>
  /** Latest tool results included in context after the most recent tool loop. */
  latestToolResults?: Array<{ tool: string; args: Record<string, unknown>; result: string; isError: boolean }>
  /** Full formatted memory content included in the system prompt. */
  memoryContent?: string
  /** Estimated total tokens for the latest call (system prompt + history + tool results). */
  totalTokens?: number
  /** Debug metadata about the call. */
  metadata?: { model?: string; reasoningModel?: string; timestamp: string; iteration: number }
}

export type AgentActivityKind = 'model' | 'thinking' | 'tool' | 'approval' | 'task'
export type AgentActivityStatus = 'running' | 'completed' | 'waiting' | 'error'

/** Structured activity row shown in the transcript without becoming assistant prose. */
export interface AgentActivity {
  kind: AgentActivityKind
  status: AgentActivityStatus
  label: string
  detail?: string
  toolEntry?: ToolEntry
  startedAt?: string
  completedAt?: string
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
   *  - 'tool_summary'  → grouped tool-call summary row (legacy saved history)
   *  - 'activity'      → structured lifecycle row for model/tool/task progress
   *  - 'artifact'      → markdown report card (see artifact)
   *  - 'tool_result'   → private model-visible tool output; persisted but hidden from chat UI
   *  - 'summary'       → compressed history tier (system role, hidden from chat UI)
   */
  type?: 'thinking' | 'tool_summary' | 'activity' | 'artifact' | 'tool_result' | 'summary'
  /** Structured activity row (set on type:'activity' messages) */
  activity?: AgentActivity
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
