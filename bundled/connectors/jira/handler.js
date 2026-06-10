// Jira connector handler — MCP-backed tools with result shaping, batch approval,
// and per-context project scoping via host.context.get().

const MCP_SERVER = 'atlassian'

function str(value) {
  return value == null ? '' : String(value)
}

function isSystemicFailure(message) {
  return /(?:\b403\b|forbidden|unauthorized|permission|tenant is restricted|suspended-inactivity|authentication|not authorized)/i.test(message)
}

function normalizeAdditionalFields(fields) {
  const normalized = { ...fields }
  if (typeof normalized.priority === 'string') normalized.priority = { name: normalized.priority }
  if (typeof normalized.assignee === 'string') {
    const assignee = normalized.assignee
    if (/^[a-f0-9]{24}$/i.test(assignee)) normalized.assignee = { accountId: assignee }
  }
  return normalized
}

function extractIssueKey(data) {
  const text = typeof data === 'string' ? data : JSON.stringify(data || '')
  const match = text.match(/[A-Z][A-Z0-9]+-\d+/)
  return match ? match[0] : null
}

function extractProjectKeyFromIssueKey(issueKey) {
  const match = str(issueKey).trim().match(/^([A-Z][A-Z0-9]+)-\d+$/)
  return match ? match[1].toUpperCase() : null
}

function normalizeProjectKey(projectKey) {
  return str(projectKey).trim().toUpperCase()
}

/** Load allowed project keys from the active context envelope (null = no scoping). */
async function loadProjectScope(host) {
  const ctx = await host.context.get()
  if (!ctx) return { allowedKeys: null }

  const raw = ctx.projectKeys
  if (!Array.isArray(raw) || raw.length === 0) {
    return {
      error: 'No Jira projects are enabled for this context. Open Context settings and select at least one project.',
    }
  }

  const allowedKeys = raw.map(normalizeProjectKey).filter(Boolean)
  if (!allowedKeys.length) {
    return {
      error: 'No Jira projects are enabled for this context. Open Context settings and select at least one project.',
    }
  }

  return { allowedKeys }
}

function isProjectAllowed(projectKey, allowedKeys) {
  if (!allowedKeys) return true
  const normalized = normalizeProjectKey(projectKey)
  return normalized ? allowedKeys.includes(normalized) : false
}

/** Resolve or reject a project key against the active context scope. */
function resolveProjectKey(requestedKey, allowedKeys) {
  const normalized = normalizeProjectKey(requestedKey)

  if (!allowedKeys) {
    if (!normalized) return { error: 'Project key is required.' }
    return { key: normalized }
  }

  if (normalized && isProjectAllowed(normalized, allowedKeys)) {
    return { key: normalized }
  }

  if (normalized && !isProjectAllowed(normalized, allowedKeys)) {
    return {
      error: `Project "${normalized}" is not enabled for this context. Allowed: ${allowedKeys.join(', ')}.`,
    }
  }

  if (allowedKeys.length === 1) {
    return { key: allowedKeys[0] }
  }

  return {
    error: `Project key is required. Allowed projects for this context: ${allowedKeys.join(', ')}.`,
  }
}

function validateIssueKeyScope(issueKey, allowedKeys) {
  if (!allowedKeys) return null
  const projectKey = extractProjectKeyFromIssueKey(issueKey)
  if (!projectKey) return `Invalid issue key: ${issueKey}`
  if (!allowedKeys.includes(projectKey)) {
    return `Issue ${issueKey} belongs to project ${projectKey}, which is not enabled for this context. Allowed: ${allowedKeys.join(', ')}.`
  }
  return null
}

function constrainJql(jql, allowedKeys) {
  if (!allowedKeys || allowedKeys.length === 0) return jql
  return `(${jql}) AND project in (${allowedKeys.join(', ')})`
}

function formatSearchIssues(data) {
  const parsed = typeof data === 'string' ? JSON.parse(data) : data
  const issues = parsed.values ?? parsed.issues ?? (Array.isArray(parsed) ? parsed : [])
  if (!issues.length) return 'No issues found.'
  const lines = issues.map(issue => {
    const fields = issue.fields ?? issue
    const status = fields.status?.name ?? fields.status ?? ''
    const assignee = fields.assignee?.displayName ?? ''
    const created = fields.created ? String(fields.created).slice(0, 10) : ''
    return `- ${issue.key}: ${fields.summary ?? ''}  [${status}]${assignee ? ` - ${assignee}` : ''}${created ? ` (${created})` : ''}`
  })
  return `${issues.length} issue(s):\n${lines.join('\n')}`
}

function formatGetIssue(data) {
  const parsed = typeof data === 'string' ? JSON.parse(data) : data
  const fields = parsed.fields ?? parsed
  const status = fields.status?.name ?? ''
  const assignee = fields.assignee?.displayName ?? 'Unassigned'
  const extractAdf = node => {
    if (!node) return ''
    if (node.type === 'text') return node.text ?? ''
    return (node.content ?? []).map(extractAdf).join(' ')
  }
  const description = typeof fields.description === 'string'
    ? fields.description.slice(0, 300)
    : extractAdf(fields.description).slice(0, 300)
  return [
    `${parsed.key}: ${fields.summary}`,
    `Status: ${status} | Assignee: ${assignee}`,
    description ? `Description: ${description}` : '',
  ].filter(Boolean).join('\n')
}

function formatTransitions(data) {
  const parsed = typeof data === 'string' ? JSON.parse(data) : data
  const transitions = parsed.transitions ?? (Array.isArray(parsed) ? parsed : [])
  const lines = transitions.map(t => `- ${t.id}: ${t.name}`)
  return lines.length ? lines.join('\n') : 'No transitions available.'
}

function formatProjects(data, allowedKeys) {
  const parsed = typeof data === 'string' ? JSON.parse(data) : data
  let projects = parsed.values ?? (Array.isArray(parsed) ? parsed : [])
  if (allowedKeys) {
    const allowed = new Set(allowedKeys)
    projects = projects.filter(p => allowed.has(normalizeProjectKey(p.key)))
  }
  const lines = projects.map(p => `- ${p.key}: ${p.name}`)
  return lines.length ? lines.join('\n') : 'No projects found.'
}

function shapeToolResult(name, result) {
  if (!result.success) {
    const hint = /priority/i.test(result.error || '') ? ' Pass priority as a name string (e.g. "Low").' : ''
    return { success: false, error: `${result.error || 'Unknown error'}${hint}` }
  }

  const data = result.data

  if (name === 'jira_create_issue' || name === 'jira_batch_create_issues') {
    const key = extractIssueKey(data)
    if (key) return { success: true, data: `Created ${key}` }
  }

  if (name === 'jira_search_issues') {
    try { return { success: true, data: formatSearchIssues(data) } } catch { /* fall through */ }
  }
  if (name === 'jira_get_issue') {
    try { return { success: true, data: formatGetIssue(data) } } catch { /* fall through */ }
  }
  if (name === 'jira_get_transitions') {
    try { return { success: true, data: formatTransitions(data) } } catch { /* fall through */ }
  }
  if (name === 'jira_get_projects') {
    try { return { success: true, data: result.formattedProjects ?? formatProjects(data) } } catch { /* fall through */ }
  }

  if (typeof data === 'string') return { success: true, data }
  if (data != null) return { success: true, data: JSON.stringify(data) }
  return { success: true, data: 'Done.' }
}

async function mcp(host, toolName, args) {
  return host.mcp.call(MCP_SERVER, toolName, args)
}

async function createIssue(host, args, allowedKeys) {
  const resolution = resolveProjectKey(args.projectKey || args.project, allowedKeys)
  if (resolution.error) return { success: false, error: resolution.error }

  const projectKey = resolution.key
  const issueTypeName = str(args.issueTypeName || args.issueType)
  const summary = str(args.summary)
  const description = args.description ? str(args.description) : undefined
  if (!issueTypeName || !summary) {
    return { success: false, error: 'Issue type and summary are required.' }
  }

  const reserved = new Set(['projectKey', 'project', 'issueTypeName', 'issueType', 'summary', 'description'])
  const extraEntries = Object.entries(args).filter(([key]) => !reserved.has(key))
  const additional = extraEntries.length ? normalizeAdditionalFields(Object.fromEntries(extraEntries)) : undefined

  const mcpArgs = { projectKey, issueTypeName, summary }
  if (description) mcpArgs.description = description
  if (additional && Object.keys(additional).length) mcpArgs.additional_fields = additional

  return mcp(host, 'createJiraIssue', mcpArgs)
}

async function executeTool(name, args, host) {
  const scope = await loadProjectScope(host)
  if (scope.error) return { success: false, error: scope.error }
  const allowedKeys = scope.allowedKeys

  switch (name) {
    case 'jira_search_issues': {
      const jql = str(args.jql)
      if (!jql) return { success: false, error: 'JQL query is required.' }
      const scopedJql = constrainJql(jql, allowedKeys)
      const mcpArgs = { jql: scopedJql, maxResults: Number(args.maxResults) || 20 }
      if (Array.isArray(args.fields)) mcpArgs.fields = args.fields
      else if (typeof args.fields === 'string' && args.fields.trim()) {
        mcpArgs.fields = args.fields.split(',').map(f => f.trim()).filter(Boolean)
      }
      return shapeToolResult(name, await mcp(host, 'searchJiraIssuesUsingJql', mcpArgs))
    }
    case 'jira_get_issue': {
      const issueIdOrKey = str(args.issueIdOrKey || args.issueKey)
      if (!issueIdOrKey) return { success: false, error: 'Issue key is required.' }
      const issueScopeError = validateIssueKeyScope(issueIdOrKey, allowedKeys)
      if (issueScopeError) return { success: false, error: issueScopeError }
      return shapeToolResult(name, await mcp(host, 'getJiraIssue', { issueIdOrKey }))
    }
    case 'jira_get_projects': {
      const raw = await mcp(host, 'getVisibleJiraProjects', {})
      if (!raw.success) return shapeToolResult(name, raw)
      const formattedProjects = formatProjects(raw.data, allowedKeys)
      return shapeToolResult(name, { ...raw, formattedProjects })
    }
    case 'jira_get_issue_types': {
      const resolution = resolveProjectKey(args.projectIdOrKey || args.projectKey, allowedKeys)
      if (resolution.error) return { success: false, error: resolution.error }
      return shapeToolResult(name, await mcp(host, 'getJiraProjectIssueTypesMetadata', { projectIdOrKey: resolution.key }))
    }
    case 'jira_get_transitions': {
      const issueIdOrKey = str(args.issueIdOrKey || args.issueKey)
      if (!issueIdOrKey) return { success: false, error: 'Issue key is required.' }
      const issueScopeError = validateIssueKeyScope(issueIdOrKey, allowedKeys)
      if (issueScopeError) return { success: false, error: issueScopeError }
      return shapeToolResult(name, await mcp(host, 'getTransitionsForJiraIssue', { issueIdOrKey }))
    }
    case 'jira_lookup_user': {
      const searchString = str(args.searchString || args.query)
      if (!searchString) return { success: false, error: 'Search string is required.' }
      return shapeToolResult(name, await mcp(host, 'lookupJiraAccountId', { searchString }))
    }
    case 'jira_create_issue':
      return shapeToolResult(name, await createIssue(host, args, allowedKeys))
    case 'jira_update_issue': {
      const issueIdOrKey = str(args.issueIdOrKey || args.issueKey)
      if (!issueIdOrKey) return { success: false, error: 'Issue key is required.' }
      const issueScopeError = validateIssueKeyScope(issueIdOrKey, allowedKeys)
      if (issueScopeError) return { success: false, error: issueScopeError }
      const { issueKey: _ik, issueIdOrKey: _iok, ...rest } = args
      return shapeToolResult(name, await mcp(host, 'editJiraIssue', { issueIdOrKey, ...rest }))
    }
    case 'jira_add_comment': {
      const issueIdOrKey = str(args.issueIdOrKey || args.issueKey)
      const commentBody = str(args.body || args.comment || args.commentBody)
      if (!issueIdOrKey || !commentBody) return { success: false, error: 'Issue key and body are required.' }
      const issueScopeError = validateIssueKeyScope(issueIdOrKey, allowedKeys)
      if (issueScopeError) return { success: false, error: issueScopeError }
      return shapeToolResult(name, await mcp(host, 'addCommentToJiraIssue', { issueIdOrKey, commentBody }))
    }
    case 'jira_transition_issue': {
      const issueIdOrKey = str(args.issueIdOrKey || args.issueKey)
      const transitionId = str(args.transitionId)
      if (!issueIdOrKey || !transitionId) return { success: false, error: 'Issue key and transition ID are required.' }
      const issueScopeError = validateIssueKeyScope(issueIdOrKey, allowedKeys)
      if (issueScopeError) return { success: false, error: issueScopeError }
      return shapeToolResult(name, await mcp(host, 'transitionJiraIssue', { issueIdOrKey, transitionId }))
    }
    case 'jira_upload_attachment': {
      const issueIdOrKey = str(args.issueIdOrKey || args.issueKey)
      const filePath = str(args.filePath)
      if (!issueIdOrKey || !filePath) return { success: false, error: 'Issue key and file path are required.' }
      const issueScopeError = validateIssueKeyScope(issueIdOrKey, allowedKeys)
      if (issueScopeError) return { success: false, error: issueScopeError }
      const result = await host.call('jira.uploadAttachment', { issueKey: issueIdOrKey, filePath })
      return shapeToolResult(name, result)
    }
    default:
      return { success: false, error: `Unknown tool: ${name}` }
  }
}

async function approveAction(actionType, data, host) {
  if (actionType !== 'jira_batch_create_issues') return { handled: false }

  const scope = await loadProjectScope(host)
  if (scope.error) {
    return { handled: true, message: scope.error, resumeAgent: false, writes: [] }
  }

  const issues = data.issues || []
  const writes = []
  const created = []
  const failed = []

  for (const issue of issues) {
    const raw = await createIssue(host, issue, scope.allowedKeys)
    const shaped = shapeToolResult('jira_create_issue', raw)
    writes.push({ name: 'jira_create_issue', args: issue, result: shaped })

    if (!shaped.success) {
      failed.push(`${issue.summary}: ${shaped.error}`)
      if (isSystemicFailure(shaped.error || '')) break
      continue
    }

    const key = extractIssueKey(shaped.data) || shaped.data
    created.push(key)
  }

  const summary = created.length > 0 ? `Created ${created.length} issue(s): ${created.join(', ')}.` : ''
  const errors = failed.length > 0
    ? ` ${created.length > 0 ? 'Stopped after an error' : 'Action blocked'}: ${failed[0]}${failed.length > 1 ? ` (${failed.length} total failures)` : ''}.`
    : ''
  const recoverable = failed.length > 0 && !isSystemicFailure(failed[0])

  return {
    handled: true,
    message: (summary + errors).trim() || 'No issues were created.',
    resumeAgent: recoverable,
    writes,
  }
}

module.exports = { executeTool, approveAction }
