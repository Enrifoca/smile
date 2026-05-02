import { z } from 'zod'

/**
 * Tool schemas aligned with Atlassian MCP Server tool signatures
 * 
 * IMPORTANT: All Jira tools require `cloudId` which is automatically
 * injected by the MCP service. The agent does NOT need to provide cloudId.
 * 
 * Reference: https://support.atlassian.com/atlassian-rovo-mcp-server/docs/supported-tools/
 */

// ============ JIRA READ TOOLS ============

export const jiraSearchIssuesSchema = z.object({
  jql: z.string().describe('JQL query to search for issues. Examples: "project = PROJ", "status = Open AND assignee = currentUser()", "sprint in openSprints()"'),
  maxResults: z.number().optional().default(20).describe('Maximum results to return (default: 20, max: 100)'),
  fields: z.array(z.string()).optional().describe('Array of field names to return (e.g., ["summary", "status", "assignee", "priority"])'),
})

export const jiraGetIssueSchema = z.object({
  issueIdOrKey: z.string().describe('The issue key (e.g., PROJ-123) or issue ID'),
})

export const jiraGetProjectsSchema = z.object({}).describe('No parameters needed - returns all visible projects')

export const jiraGetIssueTypesSchema = z.object({
  projectIdOrKey: z.string().describe('Project key or ID to get issue types for'),
})

export const jiraGetTransitionsSchema = z.object({
  issueIdOrKey: z.string().describe('The issue key or ID to get available transitions for'),
})

export const jiraLookupUserSchema = z.object({
  searchString: z.string().describe('Name or email of the user to find'),
})

// ============ JIRA WRITE TOOLS ============

// Batch creation — one approval creates many issues
export const jiraBatchCreateIssuesSchema = z.object({
  issues: z.array(z.object({
    projectKey: z.string().describe('Project key (e.g., SCOP)'),
    issueTypeName: z.string().describe('Issue type name (e.g., Tech Task, Bug, Task)'),
    summary: z.string().describe('Issue summary / title'),
    description: z.string().optional().describe('Detailed description'),
    priority: z.string().optional().describe('Priority (e.g., High, Medium, Low)'),
  })).min(1).describe('List of issues to create — all created with one approval'),
})

export const jiraCreateIssueSchema = z.object({
  projectKey: z.string().describe('The project key (e.g., PROJ)'),
  issueTypeName: z.string().describe('Issue type name (e.g., Task, Bug, Story, Epic)'),
  summary: z.string().describe('Issue summary/title'),
  description: z.string().optional().describe('Issue description (supports Atlassian Document Format)'),
})

export const jiraEditIssueSchema = z.object({
  issueIdOrKey: z.string().describe('The issue key or ID to update'),
  summary: z.string().optional().describe('New summary/title'),
  description: z.string().optional().describe('New description'),
})

export const jiraAddCommentSchema = z.object({
  issueIdOrKey: z.string().describe('The issue key or ID'),
  body: z.string().describe('Comment text to add'),
})

export const jiraTransitionIssueSchema = z.object({
  issueIdOrKey: z.string().describe('The issue key or ID'),
  transitionId: z.string().describe('The transition ID (get from jira_get_transitions)'),
})

export const jiraAddWorklogSchema = z.object({
  issueIdOrKey: z.string().describe('The issue key or ID'),
  timeSpentSeconds: z.number().describe('Time spent in seconds'),
  comment: z.string().optional().describe('Worklog comment'),
})

// ============ FILE TOOLS ============

export const fileListSchema = z.object({
  path: z.string().optional().default('').describe('Relative path to list (empty for root)'),
})

export const fileReadSchema = z.object({
  path: z.string().describe('Relative path to the file'),
})

export const fileWriteSchema = z.object({
  path: z.string().describe('Relative path for the file. Parent directories are created automatically if they do not exist.'),
  content: z.string().describe('Content to write'),
})

export const fileMkdirSchema = z.object({
  path: z.string().describe('Relative path of the directory to create (creates all intermediate directories automatically)'),
})

export const fileSearchSchema = z.object({
  pattern: z.string().describe('File name or glob pattern to search for (e.g., "report.pdf", "*.png", "screenshot*")'),
  directory: z.string().optional().describe('Specific subdirectory to search in (searches all folders if not specified)'),
})

export const fileDeleteSchema = z.object({
  path: z.string().describe('Relative path to the file to delete'),
})

// ============ MEMORY TOOLS ============

export const memoryReadSchema = z.object({
  section: z.enum(['all', 'learned', 'style']).optional().default('all')
    .describe('Which memory area to read. Use "all" to read User Memory plus Learned Notes.'),
})

export const memoryUpdateSchema = z.object({
  section: z.enum(['learned', 'style'])
    .describe('"learned" for ordinary notes/preferences/project rules. "style" only for writing style, tone, or recurring phrases.'),
  content: z.string()
    .describe('The memory entry to save. Be specific and actionable. Example: "User always wants reports in HTML format, never markdown." or "User writes bug summaries starting with the affected area in brackets, e.g. [Login] Button not responding."'),
})

export const memoryDeleteSchema = z.object({
  section: z.enum(['learned', 'style', 'all'])
    .describe('Which memory area to delete from. Use "all" when the user asks to remove a topic everywhere.'),
  query: z.string()
    .describe('Case-insensitive text to match and delete from memory entries, for example "Tech Task" or "reports in markdown".'),
})

// ============ SCRATCHPAD TOOL ============

export const scratchpadWriteSchema = z.object({
  note: z.string().describe('The note to add to your session scratchpad. Use this to record key findings, decisions, or progress so you can refer back without re-running tools. Examples: "Document has 4 sections: Setup, API, Deployment, FAQ. Tasks to create: 6 total.", "Using project SCOP, issue type Tech Task for all items."'),
})

// ============ JIRA ATTACHMENT TOOL ============

export const jiraUploadAttachmentSchema = z.object({
  issueIdOrKey: z.string().describe('The issue key (e.g., PROJ-123) to attach the file to'),
  filePath: z.string().describe('Path to the file in the workspace (relative to workspace root)'),
})

// ============ TOOL DEFINITIONS ============

export interface ToolDefinition {
  name: string
  description: string
  schema: z.ZodObject<z.ZodRawShape>
  requiresConfirmation: boolean
  category: 'jira-read' | 'jira-write' | 'jira-attachment' | 'file-read' | 'file-write' | 'file-manage' | 'task-manage' | 'memory' | 'scratchpad'
}

export const toolDefinitions: ToolDefinition[] = [
  // Jira Read Operations - agent can use freely
  {
    name: 'jira_search_issues',
    description: 'Search Jira issues using JQL (Jira Query Language). Supports complex queries with AND/OR, functions like currentUser(), openSprints(), etc.',
    schema: jiraSearchIssuesSchema,
    requiresConfirmation: false,
    category: 'jira-read',
  },
  {
    name: 'jira_get_issue',
    description: 'Get detailed information about a specific Jira issue including all fields, comments, and history.',
    schema: jiraGetIssueSchema,
    requiresConfirmation: false,
    category: 'jira-read',
  },
  {
    name: 'jira_get_projects',
    description: 'List all Jira projects the user has access to view, edit, or create issues in.',
    schema: jiraGetProjectsSchema,
    requiresConfirmation: false,
    category: 'jira-read',
  },
  {
    name: 'jira_get_issue_types',
    description: 'Get available issue types (Task, Bug, Story, etc.) for a specific project.',
    schema: jiraGetIssueTypesSchema,
    requiresConfirmation: false,
    category: 'jira-read',
  },
  {
    name: 'jira_get_transitions',
    description: 'Get available workflow transitions for an issue (e.g., To Do → In Progress → Done).',
    schema: jiraGetTransitionsSchema,
    requiresConfirmation: false,
    category: 'jira-read',
  },
  {
    name: 'jira_lookup_user',
    description: 'Find a Jira user by name or email to get their account ID for assignments.',
    schema: jiraLookupUserSchema,
    requiresConfirmation: false,
    category: 'jira-read',
  },

  // Jira Write Operations - require user confirmation
  {
    name: 'jira_batch_create_issues',
    description: 'Create MULTIPLE Jira issues in one go with a single user approval. Use this whenever you need to create 2 or more issues from the same request — never call jira_create_issue in a loop. Pass all issues in the "issues" array. The user sees and approves the full list at once.',
    schema: jiraBatchCreateIssuesSchema,
    requiresConfirmation: true,
    category: 'jira-write',
  },
  {
    name: 'jira_create_issue',
    description: 'Create a single new Jira issue. Use only when creating exactly one issue. For 2+ issues use jira_batch_create_issues instead.',
    schema: jiraCreateIssueSchema,
    requiresConfirmation: true,
    category: 'jira-write',
  },
  {
    name: 'jira_update_issue',
    description: 'Update fields on an existing Jira issue. REQUIRES USER CONFIRMATION before execution.',
    schema: jiraEditIssueSchema,
    requiresConfirmation: true,
    category: 'jira-write',
  },
  {
    name: 'jira_add_comment',
    description: 'Add a comment to a Jira issue. REQUIRES USER CONFIRMATION before execution.',
    schema: jiraAddCommentSchema,
    requiresConfirmation: true,
    category: 'jira-write',
  },
  {
    name: 'jira_transition_issue',
    description: 'Transition a Jira issue to a new workflow status. REQUIRES USER CONFIRMATION before execution.',
    schema: jiraTransitionIssueSchema,
    requiresConfirmation: true,
    category: 'jira-write',
  },

  // Jira Attachment Operation - requires user confirmation
  {
    name: 'jira_upload_attachment',
    description: 'Upload a file from the workspace as an attachment to a Jira issue. Max file size: 10MB. REQUIRES USER CONFIRMATION before execution.',
    schema: jiraUploadAttachmentSchema,
    requiresConfirmation: true,
    category: 'jira-attachment',
  },

  // File Operations
  {
    name: 'file_list',
    description: 'List files and folders in the workspace directory.',
    schema: fileListSchema,
    requiresConfirmation: false,
    category: 'file-read',
  },
  {
    name: 'file_read',
    description: 'Read the contents of a file from the workspace. Supports plain text, markdown, CSV, HTML, JSON, PDF, and Word (.docx) files. PDFs and Word documents are automatically parsed and their text extracted.',
    schema: fileReadSchema,
    requiresConfirmation: false,
    category: 'file-read',
  },
  {
    name: 'file_write',
    description: 'Write content to a file in the workspace. Automatically creates parent directories if they do not exist — you do NOT need to create them first.',
    schema: fileWriteSchema,
    requiresConfirmation: false,
    category: 'file-write',
  },
  {
    name: 'file_mkdir',
    description: 'Create a directory (and all parent directories) in the workspace. Use this when you need to create a folder structure before writing files, or when explicitly asked to create a folder.',
    schema: fileMkdirSchema,
    requiresConfirmation: false,
    category: 'file-manage',
  },
  {
    name: 'file_search',
    description: 'Search for files by name or pattern in the workspace. Searches recursively through all folders.',
    schema: fileSearchSchema,
    requiresConfirmation: false,
    category: 'file-read',
  },

  // Memory Tools
  {
    name: 'memory_read',
    description: 'Read User Memory and Learned Notes. Use only when you need exact entries before deleting, deduplicating, or resolving a memory conflict.',
    schema: memoryReadSchema,
    requiresConfirmation: false,
    category: 'memory',
  },
  {
    name: 'memory_update',
    description: 'Save a new Learned Note. Use proactively when: (1) the user explicitly says to remember something, (2) you notice a clear reusable preference, (3) the user corrects you on something they always want done differently.',
    schema: memoryUpdateSchema,
    requiresConfirmation: false,
    category: 'memory',
  },
  {
    name: 'memory_delete',
    description: 'Delete User Memory lines or Learned Notes matching a query. Use when the user asks to forget, erase, remove, cancel, or replace old memory/instructions. After deleting obsolete memory, call memory_update if the user provided a replacement preference.',
    schema: memoryDeleteSchema,
    requiresConfirmation: false,
    category: 'memory',
  },

  // Scratchpad
  {
    name: 'scratchpad_write',
    description: 'Add a note to your session scratchpad — a private, always-visible notepad that persists for the entire conversation turn. Use this to record key facts (e.g. what a document contains, which project/issue-type to use, how many tasks to create) so you can refer back to them without re-reading files or re-running searches.',
    schema: scratchpadWriteSchema,
    requiresConfirmation: false,
    category: 'scratchpad',
  },
]

/**
 * Get a tool definition by name
 */
export function getToolDefinition(name: string): ToolDefinition | undefined {
  return toolDefinitions.find(t => t.name === name)
}

/**
 * Check if a tool requires user confirmation
 */
export function requiresConfirmation(toolName: string): boolean {
  const tool = getToolDefinition(toolName)
  return tool?.requiresConfirmation ?? false
}

/**
 * Get tools formatted for AI provider
 * This converts our tool definitions to the OpenAI function calling format
 */
export function getToolsForAI(): Array<{
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}> {
  return toolDefinitions.map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      // Convert Zod schema to JSON Schema
      parameters: zodToJsonSchema(tool.schema),
    },
  }))
}

/**
 * Convert a Zod schema to JSON Schema format
 * This is a simplified converter for our use case
 */
function zodToJsonSchema(schema: z.ZodObject<z.ZodRawShape>): Record<string, unknown> {
  const shape = schema.shape
  const properties: Record<string, unknown> = {}
  const required: string[] = []

  for (const [key, value] of Object.entries(shape)) {
    const zodType = value as z.ZodTypeAny
    const typeDef = zodType._def

    // Handle optional types
    const isOptional = zodType.isOptional()
    const innerType = isOptional ? (typeDef as { innerType?: z.ZodTypeAny }).innerType || zodType : zodType

    // Get the base type
    const baseTypeDef = innerType._def
    let jsonType: Record<string, unknown> = {}

    // Determine the JSON Schema type
    if (baseTypeDef.typeName === 'ZodString') {
      jsonType = { type: 'string' }
    } else if (baseTypeDef.typeName === 'ZodNumber') {
      jsonType = { type: 'number' }
    } else if (baseTypeDef.typeName === 'ZodBoolean') {
      jsonType = { type: 'boolean' }
    } else if (baseTypeDef.typeName === 'ZodArray') {
      jsonType = {
        type: 'array',
        items: { type: 'string' }, // Simplified - assumes string arrays
      }
    } else if (baseTypeDef.typeName === 'ZodDefault') {
      // Handle default values
      const defaultInner = (baseTypeDef as { innerType?: z.ZodTypeAny }).innerType
      if (defaultInner?._def.typeName === 'ZodString') {
        jsonType = { type: 'string' }
      } else if (defaultInner?._def.typeName === 'ZodNumber') {
        jsonType = { type: 'number' }
      }
    } else {
      // Default to string for unknown types
      jsonType = { type: 'string' }
    }

    // Add description if available
    if (typeDef.description) {
      jsonType.description = typeDef.description
    } else if (baseTypeDef.description) {
      jsonType.description = baseTypeDef.description
    }

    properties[key] = jsonType

    // Track required fields
    if (!isOptional && baseTypeDef.typeName !== 'ZodDefault') {
      required.push(key)
    }
  }

  return {
    type: 'object',
    properties,
    required: required.length > 0 ? required : undefined,
  }
}
