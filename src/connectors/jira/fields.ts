/** Normalize Jira create/update field values before sending to MCP/REST. */
export function normalizeJiraIssueFields(args: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...args }

  if (typeof normalized.priority === 'string') {
    normalized.priority = { name: normalized.priority }
  }

  if (typeof normalized.assignee === 'string') {
    const assignee = normalized.assignee
    if (/^[a-f0-9]{24}$/i.test(assignee)) {
      normalized.assignee = { accountId: assignee }
    }
  }

  return normalized
}
