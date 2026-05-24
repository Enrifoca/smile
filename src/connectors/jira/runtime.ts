import { ConnectorRuntime } from '../types'
import { ElectronAPI } from '../../types/electron'
import { JiraField, JiraMetadataStore, JiraProjectMetadata, JiraUser } from '../../types/jira'
import { jiraConnector } from './connector'
import { normalizeJiraIssueFields } from './fields'

export function normalizeJiraMetadata(raw: Awaited<ReturnType<ElectronAPI['jiraMetadata']['get']>>): JiraMetadataStore {
  return {
    monitoredProjects: raw?.monitoredProjects || [],
    projectMetadata: (raw?.projectMetadata || {}) as Record<string, JiraProjectMetadata>,
    standardFields: (raw?.standardFields || []) as JiraField[],
    users: (raw?.users || []) as JiraUser[],
    lastSynced: raw?.lastSynced || null,
    syncedProjects: raw?.syncedProjects || [],
  }
}

export function createJiraRuntime(electron: ElectronAPI, context: JiraMetadataStore): ConnectorRuntime<JiraMetadataStore> {
  return {
    definition: jiraConnector,
    context: context.monitoredProjects.length > 0 ? context : null,
    async executeTool(name, args) {
      switch (name) {
        case 'jira_search_issues': {
          const jql = args.jql as string
          const maxResults = (args.maxResults as number) || 20
          let fields: string[] | undefined
          if (Array.isArray(args.fields)) fields = args.fields as string[]
          else if (typeof args.fields === 'string') fields = args.fields.split(',').map(field => field.trim()).filter(Boolean)
          if (!jql) return { success: false, error: 'JQL query is required.' }
          return await electron.mcp.searchIssues(jql, maxResults, fields)
        }
        case 'jira_get_issue': {
          const issueKey = (args.issueIdOrKey || args.issueKey) as string
          if (!issueKey) return { success: false, error: 'Issue key is required.' }
          return await electron.mcp.getIssue(issueKey)
        }
        case 'jira_get_projects':
          return await electron.mcp.getProjects()
        case 'jira_get_issue_types': {
          const projectKey = (args.projectIdOrKey || args.projectKey) as string
          if (!projectKey) return { success: false, error: 'Project key is required.' }
          return await electron.mcp.getProjectIssueTypes(projectKey)
        }
        case 'jira_get_transitions': {
          const issueKey = (args.issueIdOrKey || args.issueKey) as string
          if (!issueKey) return { success: false, error: 'Issue key is required.' }
          return await electron.mcp.getTransitions(issueKey)
        }
        case 'jira_lookup_user': {
          const searchString = (args.searchString || args.query) as string
          if (!searchString) return { success: false, error: 'Search string is required.' }
          return await electron.mcp.lookupUser(searchString)
        }
        case 'jira_create_issue': {
          const projectKey = (args.projectKey || args.project) as string
          const issueTypeName = (args.issueTypeName || args.issueType) as string
          const summary = args.summary as string
          const description = args.description as string | undefined
          if (!projectKey || !issueTypeName || !summary) return { success: false, error: 'Project key, issue type, and summary are required.' }
          const extra = normalizeJiraIssueFields(Object.fromEntries(
            Object.entries(args).filter(([key]) =>
              !['projectKey', 'project', 'issueTypeName', 'issueType', 'summary', 'description'].includes(key)
            )
          ))
          return await electron.mcp.createIssue(projectKey, issueTypeName, summary, description, Object.keys(extra).length > 0 ? extra : undefined)
        }
        case 'jira_update_issue': {
          const issueKey = (args.issueIdOrKey || args.issueKey) as string
          if (!issueKey) return { success: false, error: 'Issue key is required.' }
          return await electron.mcp.editIssue(issueKey, args)
        }
        case 'jira_add_comment': {
          const issueKey = (args.issueIdOrKey || args.issueKey) as string
          const body = (args.body || args.comment || args.commentBody) as string
          if (!issueKey || !body) return { success: false, error: 'Issue key and body are required.' }
          return await electron.mcp.addComment(issueKey, body)
        }
        case 'jira_transition_issue': {
          const issueKey = (args.issueIdOrKey || args.issueKey) as string
          const transitionId = args.transitionId as string
          if (!issueKey || !transitionId) return { success: false, error: 'Issue key and transition ID are required.' }
          return await electron.mcp.transitionIssue(issueKey, transitionId)
        }
        case 'jira_upload_attachment': {
          const issueKey = (args.issueIdOrKey || args.issueKey) as string
          const filePath = args.filePath as string
          if (!issueKey || !filePath) return { success: false, error: 'Issue key and file path are required.' }
          return await electron.jiraAttachment.upload(issueKey, filePath)
        }
        default:
          return { success: false, error: `Unknown connector tool: ${name}` }
      }
    },
  }
}
