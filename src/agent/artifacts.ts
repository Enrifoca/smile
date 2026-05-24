/** Chat artifact attached when the agent writes a markdown report. */
export interface MarkdownArtifact {
  path: string
  title: string
}

export function slugifyReportTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'report'
}

export function buildReportPath(title: string, explicitPath?: string): string {
  const trimmed = explicitPath?.trim()
  if (trimmed) return trimmed.endsWith('.md') ? trimmed : `${trimmed}.md`

  const stamp = new Date().toISOString().slice(0, 10)
  return `.smile/reports/${stamp}_${slugifyReportTitle(title)}.md`
}

export function buildReportToolResult(path: string, title: string): string {
  return [
    `Report saved: ${path}`,
    `Title: ${title}`,
    '',
    'The user sees this report as a card in chat. Your next message MUST:',
    '- Match the report exactly: same item count and same titles (no extras, no omissions, no renames)',
    '- Stay short — one paragraph pointing to the report; do not restate tables or duplicate the spec in chat',
    '- Use file_read on this path when the user wants to revise the report',
  ].join('\n')
}
