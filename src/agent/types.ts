// Agent types

/** A single tool operation recorded in a tool-summary block */
export interface ToolEntry {
  tool: string
  label: string
  group: 'jira' | 'file' | 'memory' | 'task'
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
   */
  type?: 'thinking' | 'tool_summary'
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

export interface PendingAction {
  id: string
  type: 'jira_create_issue' | 'jira_update_issue' | 'jira_add_comment' | 'jira_transition' | 'jira_transition_issue' | 'file_write' | 'file_create' | 'jira_upload_attachment' | string
  description: string
  data: Record<string, unknown>
  preview?: string
}

export interface UserProfile {
  style: 'technical' | 'conversational' | 'balanced'
  verbosity: 'concise' | 'detailed' | 'balanced'
  tone: 'formal' | 'casual' | 'balanced'
  writingPatterns: {
    commonPhrases: string[]
    taskFormat: string
    commentStyle: string
  }
  focusProjects: string[]
  confirmAllJiraActions: boolean
  onboardingCompleted: boolean
}

export interface AIConfig {
  provider: 'openai' | 'anthropic' | 'mistral' | 'groq' | 'moonshot' | 'deepseek'
  apiKey: string
  model?: string
}

export interface JiraConfig {
  baseUrl: string
  email: string
  apiToken: string
}

export interface Chat {
  id: string
  title: string
  date: string
  messages: Message[]
}


// Tool definitions for the agent
export const TOOL_DEFINITIONS = {
  // Jira read tools (no confirmation needed)
  jira_search_issues: {
    description: 'Search for Jira issues using JQL query',
    requiresConfirmation: false,
  },
  jira_get_issue: {
    description: 'Get details of a specific Jira issue',
    requiresConfirmation: false,
  },
  jira_get_projects: {
    description: 'List all accessible Jira projects',
    requiresConfirmation: false,
  },
  jira_get_sprints: {
    description: 'Get sprints for a board',
    requiresConfirmation: false,
  },
  jira_get_boards: {
    description: 'List all Jira boards',
    requiresConfirmation: false,
  },
  
  // Jira write tools (require confirmation)
  jira_create_issue: {
    description: 'Create a new Jira issue',
    requiresConfirmation: true,
  },
  jira_update_issue: {
    description: 'Update an existing Jira issue',
    requiresConfirmation: true,
  },
  jira_add_comment: {
    description: 'Add a comment to a Jira issue',
    requiresConfirmation: true,
  },
  jira_transition_issue: {
    description: 'Change the status of a Jira issue',
    requiresConfirmation: true,
  },
  
  // File tools
  file_list: {
    description: 'List files in the workspace',
    requiresConfirmation: false,
  },
  file_read: {
    description: 'Read contents of a file',
    requiresConfirmation: false,
  },
  file_read_ocr: {
    description: 'Read difficult documents with OCR',
    requiresConfirmation: false,
  },
  file_write: {
    description: 'Write or update a file',
    requiresConfirmation: true,
  },
  
  // Analysis tools
  analyze_sprint: {
    description: 'Analyze sprint progress and health',
    requiresConfirmation: false,
  },
  generate_report: {
    description: 'Generate a project report',
    requiresConfirmation: false,
  },
} as const

export type ToolName = keyof typeof TOOL_DEFINITIONS
