import { ConnectorDefinition } from '../types'
import { ConfirmationViewModel, ToolEntry } from '../../agent/types'

const str = (value: unknown) => (value as string) || ''

function unwrapToolResult(result: unknown): string {
  const data = result as { success?: boolean; data?: unknown; error?: string }
  if (data.success === false) return `Error: ${data.error || 'Unknown error'}`

  const mcpData = data.data as { content?: Array<{ text?: string }> }
  if (mcpData?.content?.[0]?.text) return mcpData.content[0].text
  if (data.data) return typeof data.data === 'string' ? data.data : JSON.stringify(data.data)
  return 'Done.'
}

function getFailureMessage(result: unknown, formattedResult: string): string | null {
  const data = result as { success?: boolean; data?: unknown; error?: string }
  if (data.success === false) return data.error || formattedResult || 'Unknown error'
  if (formattedResult.startsWith('Error:') || formattedResult.includes('MCP error')) return formattedResult

  const mcpData = data.data as { isError?: boolean; content?: Array<{ text?: string }> }
  const rawText = mcpData?.content?.[0]?.text
  if (mcpData?.isError || rawText?.includes('"error":true')) {
    if (!rawText) return formattedResult || 'Unknown connector error'
    try {
      const parsed = JSON.parse(rawText) as { message?: string; error?: unknown }
      return parsed.message || String(parsed.error || formattedResult || rawText)
    } catch {
      return rawText
    }
  }
  return null
}

function isSystemicFailure(message: string): boolean {
  return /(?:\b403\b|forbidden|unauthorized|permission|tenant is restricted|suspended-inactivity|authentication|not authorized)/i.test(message)
}

export function getJiraToolEntry(name: string, args: Record<string, unknown>): ToolEntry | null {
  switch (name) {
    case 'jira_search_issues': {
      const jql = str(args.jql).toLowerCase()
      let label = 'Searched Jira'
      if (jql.includes('reporter = currentuser()')) label = 'Searched your created issues'
      else if (jql.includes('assignee = currentuser()')) label = 'Searched your assigned issues'
      else {
        const match = str(args.jql).match(/project\s*(?:=|in)\s*["']?([A-Z][A-Z0-9_-]+)["']?/i)
        if (match) label = `Searched ${match[1].toUpperCase()}`
      }
      if (args.maxResults) label += ` · top ${args.maxResults}`
      return { tool: name, label, group: 'jira' }
    }
    case 'jira_get_issue':
      return { tool: name, label: `Read ${str(args.issueIdOrKey || args.issueKey) || 'issue'}`, group: 'jira' }
    case 'jira_get_projects':
      return { tool: name, label: 'Loaded Jira projects', group: 'jira' }
    case 'jira_get_issue_types':
      return { tool: name, label: `Loaded issue types for ${str(args.projectIdOrKey || args.projectKey)}`, group: 'jira' }
    case 'jira_get_transitions':
      return { tool: name, label: `Checked transitions for ${str(args.issueIdOrKey || args.issueKey)}`, group: 'jira' }
    case 'jira_lookup_user':
      return { tool: name, label: `Looked up "${str(args.searchString || args.query)}"`, group: 'jira' }
    case 'jira_create_issue':
      return { tool: name, label: `Created ${str(args.issueTypeName || args.issueType)}: ${str(args.summary).slice(0, 45)}`, group: 'jira' }
    case 'jira_update_issue':
      return { tool: name, label: `Updated ${str(args.issueIdOrKey || args.issueKey)}`, group: 'jira' }
    case 'jira_add_comment':
      return { tool: name, label: `Commented on ${str(args.issueIdOrKey || args.issueKey)}`, group: 'jira' }
    case 'jira_transition_issue':
      return { tool: name, label: `Moved ${str(args.issueIdOrKey || args.issueKey)}`, group: 'jira' }
    case 'jira_upload_attachment':
      return { tool: name, label: `Attached file to ${str(args.issueIdOrKey || args.issueKey)}`, group: 'jira' }
    case 'jira_batch_create_issues': {
      const issues = (args.issues as Array<Record<string, unknown>>) || []
      return { tool: name, label: `Creating ${issues.length} Jira issue${issues.length !== 1 ? 's' : ''}`, group: 'jira' }
    }
    default:
      return null
  }
}

export function getJiraActionConfirmationPrompt(actionType: string, details: Record<string, unknown>): string | null {
  switch (actionType) {
    case 'jira_batch_create_issues': {
      const issues = (details.issues as Array<Record<string, unknown>>) || []
      const lines = issues.map((issue, index) =>
        `${index + 1}. [${issue.issueTypeName || issue.issueType || 'Task'}] ${issue.summary}`
        + (issue.description ? `\n   ${String(issue.description).slice(0, 120)}${String(issue.description).length > 120 ? '...' : ''}` : '')
      )
      return `${issues.length} issue(s) in ${(issues[0]?.projectKey) || 'Jira'}:\n\n${lines.join('\n\n')}`
    }
    case 'jira_create_issue':
      return [
        `Project: ${details.projectKey}`,
        `Type: ${details.issueType || details.issueTypeName}`,
        `Summary: ${details.summary}`,
        details.description ? `Description: ${details.description}` : '',
        details.assignee ? `Assignee: ${details.assignee}` : '',
      ].filter(Boolean).join('\n')
    case 'jira_update_issue':
      return [
        `Issue: ${details.issueIdOrKey || details.issueKey}`,
        ...Object.entries(details)
          .filter(([key]) => !['issueIdOrKey', 'issueKey'].includes(key))
          .map(([key, value]) => `${key}: ${value}`),
      ].join('\n')
    case 'jira_add_comment':
      return `Issue: ${details.issueIdOrKey || details.issueKey}\n\n"${details.body || details.comment}"`
    case 'jira_transition_issue':
      return `Issue: ${details.issueIdOrKey || details.issueKey}\nNew status: ${details.transitionName || details.transitionId}`
    case 'jira_upload_attachment':
      return `Issue: ${details.issueIdOrKey || details.issueKey}\nFile: ${details.filePath}`
    default:
      return null
  }
}

export function getJiraActionConfirmation(actionType: string, details: Record<string, unknown>): ConfirmationViewModel | null {
  switch (actionType) {
    case 'jira_batch_create_issues': {
      const issues = (details.issues as Array<Record<string, unknown>>) || []
      const projectKeys = Array.from(new Set(issues.map(issue => issue.projectKey).filter(Boolean).map(String)))
      const typeNames = Array.from(new Set(issues.map(issue => issue.issueTypeName || issue.issueType).filter(Boolean).map(String)))
      return {
        title: `Create ${issues.length} Jira issue${issues.length !== 1 ? 's' : ''}`,
        preview: [
          projectKeys.length === 1 ? `Project ${projectKeys[0]}` : `${projectKeys.length || 0} projects`,
          typeNames.length === 1 ? String(typeNames[0]) : `${typeNames.length || 0} issue types`,
        ].join(' · '),
        description: 'Review the issues before they are created.',
        risk: 'medium',
        approveLabel: `Create all ${issues.length} issues`,
        acceptanceCriteria: [
          'Project and issue type are correct for each row',
          'Summaries match what you asked for',
          'No duplicate issues in the batch',
        ],
        items: issues.map(issue => ({
          title: String(issue.summary || '(untitled)'),
          subtitle: issue.projectKey ? String(issue.projectKey) : undefined,
          body: issue.description ? String(issue.description) : undefined,
          badge: String(issue.issueTypeName || issue.issueType || 'Task'),
        })),
      }
    }
    case 'jira_create_issue':
      return {
        title: 'Create Jira issue',
        preview: String(details.summary || ''),
        risk: 'medium',
        approveLabel: 'Create issue',
        acceptanceCriteria: [
          'Project and issue type are correct',
          'Summary matches your request',
          'Description does not expose secrets or credentials',
        ],
        fields: [
          { label: 'Project', value: String(details.projectKey || '') },
          { label: 'Type', value: String(details.issueType || details.issueTypeName || '') },
          { label: 'Summary', value: String(details.summary || '') },
          ...(details.description ? [{ label: 'Description', value: String(details.description) }] : []),
          ...(details.assignee ? [{ label: 'Assignee', value: String(details.assignee) }] : []),
        ],
      }
    case 'jira_update_issue':
      return {
        title: 'Update Jira issue',
        preview: String(details.issueIdOrKey || details.issueKey || ''),
        risk: 'medium',
        approveLabel: 'Update issue',
        fields: [
          { label: 'Issue', value: String(details.issueIdOrKey || details.issueKey || '') },
          ...Object.entries(details)
            .filter(([key]) => !['issueIdOrKey', 'issueKey'].includes(key))
            .map(([key, value]) => ({ label: key, value: String(value) })),
        ],
      }
    case 'jira_add_comment':
      return {
        title: 'Add Jira comment',
        preview: String(details.issueIdOrKey || details.issueKey || ''),
        risk: 'low',
        approveLabel: 'Add comment',
        fields: [
          { label: 'Issue', value: String(details.issueIdOrKey || details.issueKey || '') },
          { label: 'Comment', value: String(details.body || details.comment || '') },
        ],
      }
    case 'jira_transition_issue':
      return {
        title: 'Change Jira status',
        preview: String(details.issueIdOrKey || details.issueKey || ''),
        risk: 'medium',
        approveLabel: 'Change status',
        fields: [
          { label: 'Issue', value: String(details.issueIdOrKey || details.issueKey || '') },
          { label: 'New status', value: String(details.transitionName || details.transitionId || '') },
        ],
      }
    case 'jira_upload_attachment':
      return {
        title: 'Upload Jira attachment',
        preview: String(details.filePath || ''),
        risk: 'low',
        approveLabel: 'Upload attachment',
        fields: [
          { label: 'Issue', value: String(details.issueIdOrKey || details.issueKey || '') },
          { label: 'File', value: String(details.filePath || '') },
        ],
      }
    default:
      return null
  }
}

export function getJiraActionPreview(name: string, args: Record<string, unknown>): string | null {
  switch (name) {
    case 'jira_create_issue':
      return `Create: ${args.summary}`
    case 'jira_update_issue':
      return `Update: ${args.issueIdOrKey || args.issueKey}`
    case 'jira_add_comment':
      return `Comment on: ${args.issueIdOrKey || args.issueKey}`
    case 'jira_transition_issue':
      return `Transition: ${args.issueIdOrKey || args.issueKey}`
    case 'jira_batch_create_issues': {
      const issues = (args.issues as Array<Record<string, unknown>>) || []
      return `Create ${issues.length} issues`
    }
    case 'jira_upload_attachment':
      return `Attach: ${args.filePath}`
    default:
      return null
  }
}

export function formatJiraToolResultForAI(name: string, result: unknown): string {
  const raw = unwrapToolResult(result)
  const failure = getFailureMessage(result, raw)
  if (failure) {
    const hint = /priority/i.test(failure)
      ? ' Pass priority as a name string (e.g. "Low"); the connector converts it for Jira.'
      : ''
    return `Error: ${failure}${hint}`
  }

  if (name === 'jira_create_issue' || name === 'jira_batch_create_issues') {
    const keyMatch = raw.match(/[A-Z]+-\d+/)
    if (keyMatch) return `Created ${keyMatch[0]}`
  }

  if (name === 'jira_search_issues') {
    try {
      const parsed = JSON.parse(raw)
      const issues: unknown[] = parsed.values ?? parsed.issues ?? (Array.isArray(parsed) ? parsed : [])
      if (issues.length === 0) return 'No issues found.'
      const lines = (issues as Array<Record<string, unknown>>).map(issue => {
        const fields = (issue.fields ?? issue) as Record<string, unknown>
        const status = (fields.status as Record<string, unknown>)?.name ?? fields.status ?? ''
        const assignee = (fields.assignee as Record<string, unknown>)?.displayName ?? ''
        const created = fields.created ? (fields.created as string).slice(0, 10) : ''
        return `- ${issue.key}: ${fields.summary ?? ''}  [${status}]${assignee ? ` - ${assignee}` : ''}${created ? ` (${created})` : ''}`
      })
      return `${issues.length} issue(s):\n${lines.join('\n')}`
    } catch {
      return raw
    }
  }

  if (name === 'jira_get_issue') {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      const fields = (parsed.fields ?? parsed) as Record<string, unknown>
      const status = (fields.status as Record<string, unknown>)?.name ?? ''
      const assignee = (fields.assignee as Record<string, unknown>)?.displayName ?? 'Unassigned'
      const extractAdf = (node: unknown): string => {
        const item = node as Record<string, unknown>
        if (!item) return ''
        if (item.type === 'text') return item.text as string ?? ''
        return ((item.content as unknown[]) ?? []).map(extractAdf).join(' ')
      }
      const description = typeof fields.description === 'string'
        ? fields.description.slice(0, 300)
        : extractAdf(fields.description).slice(0, 300)
      return [
        `${parsed.key}: ${fields.summary}`,
        `Status: ${status} | Assignee: ${assignee}`,
        description ? `Description: ${description}` : '',
      ].filter(Boolean).join('\n')
    } catch {
      return raw
    }
  }

  if (name === 'jira_get_transitions') {
    try {
      const parsed = JSON.parse(raw)
      const transitions: Array<Record<string, unknown>> = parsed.transitions ?? (Array.isArray(parsed) ? parsed : [])
      return transitions.map(transition => `- ${transition.id}: ${transition.name}`).join('\n') || 'No transitions available.'
    } catch {
      return raw
    }
  }

  if (name === 'jira_get_projects') {
    try {
      const parsed = JSON.parse(raw)
      const projects: Array<Record<string, unknown>> = parsed.values ?? (Array.isArray(parsed) ? parsed : [])
      return projects.map(project => `- ${project.key}: ${project.name}`).join('\n') || 'No projects found.'
    } catch {
      return raw
    }
  }

  return raw
}

export function getJiraScratchpadNote(name: string, args: Record<string, unknown>, formattedResult: string): string | null {
  if (name === 'jira_create_issue') {
    const keyMatch = formattedResult.match(/[A-Z]+-\d+/)
    return `Created Jira issue${keyMatch ? ': ' + keyMatch[0] : ''}`
  }
  if (name === 'jira_update_issue') return `Updated Jira issue: ${str(args.issueIdOrKey)}`
  if (name === 'jira_transition_issue') return `Transitioned Jira issue: ${str(args.issueIdOrKey)}`
  if (name === 'jira_batch_create_issues') {
    const issues = (args.issues as Array<Record<string, unknown>>) || []
    if (issues.length === 0) return null
    const project = (issues[0]?.projectKey as string) || 'Jira'
    const preview = issues
      .slice(0, 12)
      .map((issue, index) => `${index + 1}. ${issue.issueTypeName || issue.issueType || 'Task'} - ${issue.summary || '(untitled)'}`)
      .join('\n')
    return `Planned Jira batch creation: ${issues.length} issue(s) in ${project}\n${preview}${issues.length > 12 ? `\n...and ${issues.length - 12} more` : ''}`
  }
  return null
}

export function invalidateJiraCacheAfterWrite(name: string, _args: Record<string, unknown>, cacheKeys: string[]): string[] {
  const writeTools = ['jira_create_issue', 'jira_update_issue', 'jira_add_comment', 'jira_transition_issue', 'jira_upload_attachment', 'jira_batch_create_issues']
  if (!writeTools.includes(name)) return []
  return cacheKeys.filter(key => key.startsWith('jira_search_issues:') || key.startsWith('jira_get_issue:'))
}

export const approveJiraAction: NonNullable<ConnectorDefinition['approveAction']> = async input => {
  if (input.actionType !== 'jira_batch_create_issues') return { handled: false }
  const issues = (input.data.issues as Array<Record<string, unknown>>) || []
  const created: string[] = []
  const failed: string[] = []

  for (const issue of issues) {
    const result = await input.executeTool('jira_create_issue', issue)
    const formatted = input.formatToolResultForAI('jira_create_issue', result)
    const failureMessage = getFailureMessage(result, formatted)
    const keyMatch = formatted.match(/[A-Z]+-\d+/)
    const label = keyMatch ? keyMatch[0] : issue.summary as string

    if (failureMessage) {
      failed.push(`${issue.summary}: ${failureMessage}`)
      if (isSystemicFailure(failureMessage)) break
    } else {
      created.push(label)
      input.updateScratchpadAfterTool('jira_create_issue', issue, formatted)
    }

    input.cacheToolResult('jira_create_issue', issue, formatted)
    input.invalidateCacheAfterWrite('jira_create_issue', issue)
  }

  const summary = created.length > 0 ? `Created ${created.length} issue(s): ${created.join(', ')}.` : ''
  const errors = failed.length > 0
    ? ` ${created.length > 0 ? 'Stopped after an error' : 'Action blocked'}: ${failed[0]}${failed.length > 1 ? ` (${failed.length} total failures)` : ''}.`
    : ''
  const recoverable = failed.length > 0 && !isSystemicFailure(failed[0])

  return {
    handled: true,
    message: summary + errors || 'No issues were created.',
    resumeAgent: recoverable,
  }
}

function extractJiraProjectKey(args: Record<string, unknown>): string | null {
  const direct = str(args.projectKey)
  if (direct) return direct.toUpperCase()

  const issueKey = str(args.issueIdOrKey || args.issueKey)
  const fromIssue = issueKey.match(/^([A-Z][A-Z0-9]+)-\d+$/)
  if (fromIssue) return fromIssue[1].toUpperCase()

  const batch = (args.issues as Array<Record<string, unknown>>) || []
  const batchKey = str(batch[0]?.projectKey)
  return batchKey ? batchKey.toUpperCase() : null
}

export function getJiraScopeForSourceMemory(
  name: string,
  args: Record<string, unknown>,
): { connectorId: string; scopeId: string } | null {
  void name
  const scopeId = extractJiraProjectKey(args)
  if (!scopeId) return null
  return { connectorId: 'jira', scopeId }
}

export function buildJiraSourceMemoryLeaf(
  name: string,
  args: Record<string, unknown>,
  formattedResult: string,
): { kind: 'write_outcome'; toolName: string; summary: string } {
  const projectKey = extractJiraProjectKey(args)
  const prefix = projectKey ? `[${projectKey}] ` : ''
  const firstLine = formattedResult.split('\n').find(line => line.trim()) || formattedResult
  return {
    kind: 'write_outcome',
    toolName: name,
    summary: `${prefix}${firstLine}`.slice(0, 500),
  }
}
