import { z } from 'zod'
import { ToolDefinition } from '../types'

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

export const jiraBatchCreateIssuesSchema = z.object({
  issues: z.array(z.object({
    projectKey: z.string().describe('Project key (e.g., SCOP)'),
    issueTypeName: z.string().describe('Issue type name (e.g., Task, Bug, Story)'),
    summary: z.string().describe('Issue summary / title'),
    description: z.string().optional().describe('Detailed description'),
    priority: z.string().optional().describe('Priority (e.g., High, Medium, Low)'),
  })).min(1).describe('List of issues to create. All items are included in one write approval.'),
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

export const jiraUploadAttachmentSchema = z.object({
  issueIdOrKey: z.string().describe('The issue key (e.g., PROJ-123) to attach the file to'),
  filePath: z.string().describe('Path to the file in the workspace (relative to workspace root)'),
})

export const jiraTools: ToolDefinition[] = [
  {
    name: 'jira_search_issues',
    description: 'Search Jira issues using JQL. Use one query for lists instead of reading issues one by one.',
    schema: jiraSearchIssuesSchema,
    requiresConfirmation: false,
    category: 'connector-read',
  },
  {
    name: 'jira_get_issue',
    description: 'Get detailed information about one Jira issue including fields, comments, and history.',
    schema: jiraGetIssueSchema,
    requiresConfirmation: false,
    category: 'connector-read',
  },
  {
    name: 'jira_get_projects',
    description: 'List Jira projects visible to the connected account.',
    schema: jiraGetProjectsSchema,
    requiresConfirmation: false,
    category: 'connector-read',
  },
  {
    name: 'jira_get_issue_types',
    description: 'Get available issue types for a project.',
    schema: jiraGetIssueTypesSchema,
    requiresConfirmation: false,
    category: 'connector-read',
  },
  {
    name: 'jira_get_transitions',
    description: 'Get available workflow transitions for an issue.',
    schema: jiraGetTransitionsSchema,
    requiresConfirmation: false,
    category: 'connector-read',
  },
  {
    name: 'jira_lookup_user',
    description: 'Find a Jira user by name or email to get their account ID.',
    schema: jiraLookupUserSchema,
    requiresConfirmation: false,
    category: 'connector-read',
  },
  {
    name: 'jira_batch_create_issues',
    description: 'Create multiple Jira issues with one approval. Use this for 2+ issues instead of looping over jira_create_issue.',
    schema: jiraBatchCreateIssuesSchema,
    requiresConfirmation: true,
    category: 'connector-write',
  },
  {
    name: 'jira_create_issue',
    description: 'Create a single Jira issue. Use only for exactly one issue.',
    schema: jiraCreateIssueSchema,
    requiresConfirmation: true,
    category: 'connector-write',
  },
  {
    name: 'jira_update_issue',
    description: 'Update fields on an existing Jira issue. Requires user confirmation.',
    schema: jiraEditIssueSchema,
    requiresConfirmation: true,
    category: 'connector-write',
  },
  {
    name: 'jira_add_comment',
    description: 'Add a comment to a Jira issue. Requires user confirmation.',
    schema: jiraAddCommentSchema,
    requiresConfirmation: true,
    category: 'connector-write',
  },
  {
    name: 'jira_transition_issue',
    description: 'Transition a Jira issue to another workflow status. Requires user confirmation.',
    schema: jiraTransitionIssueSchema,
    requiresConfirmation: true,
    category: 'connector-write',
  },
  {
    name: 'jira_upload_attachment',
    description: 'Upload a workspace file as an attachment to a Jira issue. Requires user confirmation.',
    schema: jiraUploadAttachmentSchema,
    requiresConfirmation: true,
    category: 'connector-attachment',
  },
]
