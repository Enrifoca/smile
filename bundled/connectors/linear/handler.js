// Linear connector handler — GraphQL API via host.http.fetch.
// Runs in a constrained node:vm sandbox; no require, fetch, or filesystem access.

function str(value) {
  return value == null ? '' : String(value)
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str(value))
}

function extractTeamKey(identifier) {
  const match = str(identifier).trim().match(/^([A-Z][A-Z0-9]*)-\d+$/i)
  return match ? match[1].toUpperCase() : null
}

function normalizeTeamKey(key) {
  return str(key).trim().toUpperCase()
}

function normalizePriority(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return undefined
  const clamped = Math.max(0, Math.min(4, Math.round(num)))
  return clamped === 0 ? undefined : clamped
}

async function loadTeamScope(host) {
  const ctx = await host.context.get()
  if (!ctx) return { allowedKeys: null }

  const raw = ctx.teamKeys
  if (!Array.isArray(raw) || raw.length === 0) {
    return {
      error: 'No Linear teams are enabled for this context. Open Context settings and select at least one team.',
    }
  }

  const allowedKeys = raw.map(normalizeTeamKey).filter(Boolean)
  if (!allowedKeys.length) {
    return {
      error: 'No Linear teams are enabled for this context. Open Context settings and select at least one team.',
    }
  }

  return { allowedKeys }
}

function isTeamAllowed(teamKey, allowedKeys) {
  if (!allowedKeys) return true
  const normalized = normalizeTeamKey(teamKey)
  return normalized ? allowedKeys.includes(normalized) : false
}

function validateIssueScope(identifier, allowedKeys) {
  if (!allowedKeys) return null
  const teamKey = extractTeamKey(identifier)
  if (!teamKey) return `Invalid Linear issue identifier: ${identifier}`
  if (!allowedKeys.includes(teamKey)) {
    return `Issue ${identifier} belongs to team ${teamKey}, which is not enabled for this context. Allowed: ${allowedKeys.join(', ')}.`
  }
  return null
}

async function linearGraphql(host, query, variables) {
  return host.call('linear.api', { query, variables: variables || {} })
}

async function fetchTeams(host) {
  const result = await linearGraphql(host, `
    query {
      teams {
        nodes {
          id
          name
          key
        }
      }
    }
  `)
  if (!result.success) return result
  const teams = (result.data.teams?.nodes || []).map(t => ({ id: t.id, name: t.name, key: str(t.key).toUpperCase() }))
  return { success: true, data: teams }
}

async function resolveTeamIds(host, allowedKeys) {
  const teamsResult = await fetchTeams(host)
  if (!teamsResult.success) return teamsResult

  const ids = []
  for (const key of allowedKeys) {
    const team = teamsResult.data.find(t => t.key === key)
    if (team) ids.push(team.id)
  }

  if (ids.length === 0) {
    return { success: false, error: `None of the scoped teams exist in Linear: ${allowedKeys.join(', ')}.` }
  }

  return { success: true, data: ids }
}

async function resolveTeamIdByKey(host, teamKey) {
  const teamsResult = await fetchTeams(host)
  if (!teamsResult.success) return teamsResult
  const normalized = normalizeTeamKey(teamKey)
  const team = teamsResult.data.find(t => t.key === normalized)
  if (!team) return { success: false, error: `Team "${teamKey}" not found in Linear.` }
  return { success: true, data: team.id }
}

async function resolveStateId(host, teamId, stateName) {
  const result = await linearGraphql(host, `
    query($teamId: ID!) {
      workflowStates(filter: { team: { id: { eq: $teamId } } }) {
        nodes {
          id
          name
        }
      }
    }
  `, { teamId })
  if (!result.success) return result
  const states = result.data.workflowStates?.nodes || []
  const target = str(stateName).trim().toLowerCase()
  const state = states.find(s => str(s.name).toLowerCase() === target)
  if (!state) {
    const names = states.map(s => s.name).join(', ')
    return { success: false, error: `State "${stateName}" not found. Available: ${names || 'none'}.` }
  }
  return { success: true, data: state.id }
}

async function resolveProjectId(host, projectName) {
  const result = await linearGraphql(host, `
    query {
      projects {
        nodes {
          id
          name
        }
      }
    }
  `)
  if (!result.success) return result
  const projects = result.data.projects?.nodes || []
  const target = str(projectName).trim().toLowerCase()
  const project = projects.find(p => str(p.name).toLowerCase() === target)
  if (!project) {
    const names = projects.map(p => p.name).join(', ')
    return { success: false, error: `Project "${projectName}" not found. Available: ${names || 'none'}.` }
  }
  return { success: true, data: project.id }
}

async function resolveUserId(host, userNameOrEmail) {
  const value = str(userNameOrEmail).trim()
  if (!value) return { success: true, data: null }

  const escaped = value.replace(/"/g, '\\"')
  const filter = value.includes('@')
    ? `{ email: { eq: "${escaped}" } }`
    : `{ name: { contains: "${escaped}" } }`

  const result = await linearGraphql(host, `
    query {
      users(filter: ${filter}) {
        nodes {
          id
          name
          email
        }
      }
    }
  `)
  if (!result.success) return result
  const users = result.data.users?.nodes || []
  if (users.length === 0) return { success: false, error: `User "${userNameOrEmail}" not found.` }
  return { success: true, data: users[0].id }
}

async function buildIssueCreateInput(host, issue, allowedKeys) {
  let teamKey = str(issue.teamKey)
  if (!teamKey && allowedKeys?.length === 1) teamKey = allowedKeys[0]
  const title = str(issue.title)
  if (!teamKey || !title) return { success: false, error: 'Team key and title are required for each issue.' }
  const scopeError = validateIssueScope(`${teamKey}-1`, allowedKeys)
  if (scopeError) return { success: false, error: scopeError }

  const teamIdResult = await resolveTeamIdByKey(host, teamKey)
  if (!teamIdResult.success) return teamIdResult
  const teamId = teamIdResult.data

  const input = { teamId, title }
  const description = str(issue.description)
  if (description) input.description = description

  const priority = normalizePriority(issue.priority)
  if (priority !== undefined) input.priority = priority

  if (issue.state) {
    const stateResult = await resolveStateId(host, teamId, issue.state)
    if (!stateResult.success) return stateResult
    input.stateId = stateResult.data
  }

  if (issue.project) {
    const projectResult = await resolveProjectId(host, issue.project)
    if (!projectResult.success) return projectResult
    input.projectId = projectResult.data
  }

  if (issue.assignee) {
    const userResult = await resolveUserId(host, issue.assignee)
    if (!userResult.success) return userResult
    input.assigneeId = userResult.data
  }

  return { success: true, data: { teamId, input } }
}

async function fetchIssueByIdentifier(host, identifier) {
  const isIdLookup = isUuid(identifier)
  const result = await linearGraphql(host, `
    query($identifier: String!) {
      issue(identifier: $identifier) {
        id
        identifier
        title
        description
        priority
        state { name }
        team { id key name }
        project { name }
        assignee { name email }
        createdAt
        updatedAt
        comments {
          nodes {
            id
            body
            createdAt
            user { name }
          }
        }
      }
    }
  `, { identifier: isIdLookup ? undefined : identifier })
  // Linear's issue query takes an identifier string; UUID identifiers are not directly supported by the identifier arg.
  // For UUIDs, we fall back to a direct id query below.
  if (!isIdLookup && result.success && result.data.issue) return result

  if (isIdLookup) {
    return await linearGraphql(host, `
      query($id: ID!) {
        issue(id: $id) {
          id
          identifier
          title
          description
          priority
          state { name }
          team { id key name }
          project { name }
          assignee { name email }
          createdAt
          updatedAt
          comments {
            nodes {
              id
              body
              createdAt
              user { name }
            }
          }
        }
      }
    `, { id: identifier })
  }

  return result
}

function formatIssue(issue) {
  const fields = issue || {}
  return {
    id: fields.id,
    identifier: fields.identifier,
    title: fields.title,
    description: fields.description,
    priority: fields.priority,
    state: fields.state?.name,
    team: fields.team ? { key: fields.team.key, name: fields.team.name } : undefined,
    project: fields.project?.name,
    assignee: fields.assignee ? { name: fields.assignee.name, email: fields.assignee.email } : undefined,
    createdAt: fields.createdAt,
    updatedAt: fields.updatedAt,
  }
}

function formatSearchIssues(data) {
  const issues = data.issues?.nodes || []
  if (!issues.length) return 'No issues found.'
  const lines = issues.map(issue => {
    const status = issue.state?.name ?? ''
    const assignee = issue.assignee?.name ?? ''
    return `- ${issue.identifier}: ${issue.title}${status ? ` [${status}]` : ''}${assignee ? ` — ${assignee}` : ''}`
  })
  return `${issues.length} issue(s):\n${lines.join('\n')}`
}

function formatGetIssue(data) {
  const issue = formatIssue(data.issue)
  if (!issue.identifier) return 'Issue not found.'
  const comments = data.issue?.comments?.nodes || []
  const commentLines = comments.map(c => `> ${c.user?.name || 'Unknown'} (${c.createdAt?.slice(0, 10)}): ${c.body}`)
  return [
    `${issue.identifier}: ${issue.title}`,
    `Status: ${issue.state || ''} | Team: ${issue.team?.key || ''} | Assignee: ${issue.assignee?.name || 'Unassigned'}`,
    issue.project ? `Project: ${issue.project}` : '',
    issue.description ? `Description: ${issue.description.slice(0, 500)}${issue.description.length > 500 ? '…' : ''}` : '',
    commentLines.length ? `Comments:\n${commentLines.join('\n')}` : '',
  ].filter(Boolean).join('\n')
}

function formatTeams(data, allowedKeys) {
  let teams = (data.teams?.nodes || []).map(t => ({ key: str(t.key).toUpperCase(), name: t.name }))
  if (allowedKeys) {
    const allowed = new Set(allowedKeys)
    teams = teams.filter(t => allowed.has(t.key))
  }
  const lines = teams.map(t => `- ${t.key}: ${t.name}`)
  return lines.length ? lines.join('\n') : 'No teams found.'
}

function formatProjects(data) {
  const projects = data.projects?.nodes || []
  const lines = projects.map(p => `- ${p.name}${p.state ? ` [${p.state}]` : ''}`)
  return lines.length ? lines.join('\n') : 'No projects found.'
}

function formatStates(data) {
  const states = data.workflowStates?.nodes || []
  const lines = states.map(s => `- ${s.name}`)
  return lines.length ? lines.join('\n') : 'No workflow states found.'
}

function shapeToolResult(name, result) {
  if (!result.success) return result
  const data = result.data

  try {
    if (name === 'linear_search_issues') return { success: true, data: formatSearchIssues(data) }
    if (name === 'linear_get_issue') return { success: true, data: formatGetIssue(data) }
    if (name === 'linear_get_teams') return { success: true, data: formatTeams(data) }
    if (name === 'linear_get_projects') return { success: true, data: formatProjects(data) }
    if (name === 'linear_get_states') return { success: true, data: formatStates(data) }
    if (name === 'linear_create_issue' || name === 'linear_update_issue') {
      const issue = data.issueCreate?.issue || data.issueUpdate?.issue
      if (issue?.identifier) return { success: true, data: `Updated ${issue.identifier}` }
    }
    if (name === 'linear_add_comment') {
      const comment = data.commentCreate?.comment
      if (comment?.id) return { success: true, data: 'Comment added.' }
    }
  } catch {
    // fall through to raw JSON
  }

  if (typeof data === 'string') return { success: true, data }
  return { success: true, data: JSON.stringify(data) }
}

async function executeTool(name, args, host) {
  const scope = await loadTeamScope(host)
  if (scope.error) return { success: false, error: scope.error }
  const allowedKeys = scope.allowedKeys

  switch (name) {
    case 'linear_search_issues': {
      const query = str(args.query).trim()
      const stateFilter = str(args.state).trim()
      const maxResults = Math.min(Math.max(1, Number(args.maxResults) || 20), 100)

      let teamIdFilter = ''
      if (allowedKeys) {
        const idsResult = await resolveTeamIds(host, allowedKeys)
        if (!idsResult.success) return idsResult
        const ids = idsResult.data
        teamIdFilter = `team: { id: { in: [${ids.map(id => `"${id}"`).join(', ')}] } }`
      }

      let titleFilter = ''
      if (query) {
        titleFilter = `title: { contains: "${query.replace(/"/g, '\\"')}" }`
      }

      let stateIdFilter = ''
      if (stateFilter && allowedKeys?.length === 1) {
        const teamIdResult = await resolveTeamIdByKey(host, allowedKeys[0])
        if (!teamIdResult.success) return teamIdResult
        const stateResult = await resolveStateId(host, teamIdResult.data, stateFilter)
        if (!stateResult.success) return stateResult
        stateIdFilter = `state: { id: { eq: "${stateResult.data}" } }`
      }

      const filters = [teamIdFilter, titleFilter, stateIdFilter].filter(Boolean).join(', ')
      const args = [`first: ${maxResults}`]
      if (filters) args.unshift(`filter: { ${filters} }`)
      const argsString = args.length ? `(${args.join(', ')})` : ''

      return shapeToolResult(name, await linearGraphql(host, `
        query {
          issues${argsString} {
            nodes {
              id
              identifier
              title
              state { name }
              assignee { name }
              priority
              createdAt
            }
          }
        }
      `))
    }

    case 'linear_get_issue': {
      const identifier = str(args.identifier || args.issueIdOrKey)
      if (!identifier) return { success: false, error: 'Issue identifier is required.' }
      const scopeError = validateIssueScope(identifier, allowedKeys)
      if (scopeError) return { success: false, error: scopeError }
      return shapeToolResult(name, await fetchIssueByIdentifier(host, identifier))
    }

    case 'linear_get_teams': {
      // Always list every team visible to the connected account, ignoring
      // context scoping, so the user/agent can see what is available.
      const result = await linearGraphql(host, `
        query {
          teams {
            nodes {
              id
              name
              key
            }
          }
        }
      `)
      if (!result.success) return shapeToolResult(name, result)
      return { success: true, data: formatTeams(result.data, null) }
    }

    case 'linear_get_projects': {
      return shapeToolResult(name, await linearGraphql(host, `
        query {
          projects {
            nodes {
              id
              name
              state
            }
          }
        }
      `))
    }

    case 'linear_get_states': {
      const teamKey = str(args.teamKey)
      if (!teamKey) return { success: false, error: 'Team key is required.' }
      const scopeError = validateIssueScope(`${teamKey}-1`, allowedKeys)
      if (scopeError) return { success: false, error: scopeError }
      const teamIdResult = await resolveTeamIdByKey(host, teamKey)
      if (!teamIdResult.success) return teamIdResult
      return shapeToolResult(name, await linearGraphql(host, `
        query($teamId: ID!) {
          workflowStates(filter: { team: { id: { eq: $teamId } } }) {
            nodes {
              id
              name
            }
          }
        }
      `, { teamId: teamIdResult.data }))
    }

    case 'linear_create_issue': {
      const built = await buildIssueCreateInput(host, args, allowedKeys)
      if (!built.success) return built
      return shapeToolResult(name, await linearGraphql(host, `
        mutation($input: IssueCreateInput!) {
          issueCreate(input: $input) {
            success
            issue {
              id
              identifier
              title
            }
          }
        }
      `, { input: built.data.input }))
    }

    case 'linear_create_issues': {
      const issues = args.issues
      if (!Array.isArray(issues) || issues.length === 0) {
        return { success: false, error: 'An array of issues is required.' }
      }

      const built = []
      for (const issue of issues) {
        const result = await buildIssueCreateInput(host, issue, allowedKeys)
        if (!result.success) return result
        built.push(result.data)
      }

      const varNames = []
      const mutationFields = []
      const variables = {}
      for (let i = 0; i < built.length; i++) {
        const varName = `input${i}`
        varNames.push(`$${varName}: IssueCreateInput!`)
        mutationFields.push(`issue${i}: issueCreate(input: $${varName}) { success issue { id identifier title } }`)
        variables[varName] = built[i].input
      }

      const query = `mutation(${varNames.join(', ')}) { ${mutationFields.join(' ')} }`
      const result = await linearGraphql(host, query, variables)
      if (!result.success) return shapeToolResult(name, result)

      const created = []
      const failed = []
      for (let i = 0; i < built.length; i++) {
        const entry = result.data[`issue${i}`]
        if (entry?.success && entry.issue) {
          created.push(entry.issue)
        } else {
          failed.push({ index: i, title: built[i].input.title })
        }
      }

      const lines = []
      if (created.length) lines.push(`Created ${created.length} issue(s):`)
      for (const issue of created) {
        lines.push(`- ${issue.identifier}: ${issue.title}`)
      }
      if (failed.length) {
        lines.push(`Failed to create ${failed.length} issue(s):`)
        for (const f of failed) {
          lines.push(`- ${f.title}`)
        }
      }
      return { success: true, data: lines.join('\n') }
    }

    case 'linear_update_issue': {
      const identifier = str(args.identifier || args.issueIdOrKey)
      if (!identifier) return { success: false, error: 'Issue identifier is required.' }
      const scopeError = validateIssueScope(identifier, allowedKeys)
      if (scopeError) return { success: false, error: scopeError }

      const issueResult = await fetchIssueByIdentifier(host, identifier)
      if (!issueResult.success) return issueResult
      const issueId = issueResult.data.issue?.id
      if (!issueId) return { success: false, error: `Issue ${identifier} not found.` }

      const input = {}
      if (args.title !== undefined) input.title = str(args.title)
      if (args.description !== undefined) input.description = str(args.description)

      const priority = normalizePriority(args.priority)
      if (priority !== undefined) input.priority = priority

      if (args.state) {
        const teamId = issueResult.data.issue?.team?.id
        if (!teamId) return { success: false, error: 'Cannot resolve workflow state without team.' }
        const stateResult = await resolveStateId(host, teamId, args.state)
        if (!stateResult.success) return stateResult
        input.stateId = stateResult.data
      }

      if (args.assignee !== undefined) {
        const userResult = await resolveUserId(host, args.assignee)
        if (!userResult.success) return userResult
        input.assigneeId = userResult.data
      }

      if (Object.keys(input).length === 0) {
        return { success: false, error: 'No fields provided to update.' }
      }

      return shapeToolResult(name, await linearGraphql(host, `
        mutation($id: ID!, $input: IssueUpdateInput!) {
          issueUpdate(id: $id, input: $input) {
            success
            issue {
              id
              identifier
              title
            }
          }
        }
      `, { id: issueId, input }))
    }

    case 'linear_add_comment': {
      const identifier = str(args.identifier || args.issueIdOrKey)
      const body = str(args.body)
      if (!identifier || !body) return { success: false, error: 'Issue identifier and body are required.' }
      const scopeError = validateIssueScope(identifier, allowedKeys)
      if (scopeError) return { success: false, error: scopeError }

      const issueResult = await fetchIssueByIdentifier(host, identifier)
      if (!issueResult.success) return issueResult
      const issueId = issueResult.data.issue?.id
      if (!issueId) return { success: false, error: `Issue ${identifier} not found.` }

      return shapeToolResult(name, await linearGraphql(host, `
        mutation($input: CommentCreateInput!) {
          commentCreate(input: $input) {
            success
            comment {
              id
              body
              createdAt
            }
          }
        }
      `, { input: { issueId, body } }))
    }

    default:
      return { success: false, error: `Unknown tool: ${name}` }
  }
}

module.exports = { executeTool }
