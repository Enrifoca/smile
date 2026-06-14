/** Chat artifact attached when the agent writes a markdown report. */
export interface MarkdownArtifact {
  path: string
  title: string
}

/** Latest report artifact in a chat transcript (for composer context pill). */
export interface ActiveReportRef {
  artifact: MarkdownArtifact
  messageId: string
}

export function getActiveReportFromMessages(
  messages: Array<{ id: string; type?: string; artifact?: MarkdownArtifact }>,
): ActiveReportRef | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message.type === 'artifact' && message.artifact) {
      return { artifact: message.artifact, messageId: message.id }
    }
  }
  return null
}

export function slugifyReportTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'report'
}

export function titleFromReportPath(reportPath: string): string {
  const fileName = reportPath.split('/').pop()?.replace(/\.md$/i, '') || 'Report'
  const withoutDate = fileName.replace(/^\d{4}-\d{2}-\d{2}_/, '')
  const words = withoutDate.replace(/_/g, ' ').trim()
  return words ? words.replace(/\b\w/g, char => char.toUpperCase()) : 'Report'
}

export function isReportArtifactPath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/')
  return normalized.includes('.smile/reports/') && normalized.endsWith('.md')
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
    'The user sees this report as a card in chat. Opening the card shows a Download menu where they can export the same content as PDF or Word (.doc) without you generating those files.',
    '',
    'Your next message MUST:',
    '- Match the report exactly: same item count and same titles (no extras, no omissions, no renames)',
    '- Stay short — one paragraph pointing to the report; do not restate tables or duplicate the spec in chat',
    '- Use file_read on this path when the user wants to revise the report',
    '- When revising, call report_write with the **same path** to overwrite',
    '- Content must be grounded in file_read results or user input — never invent details',
    '- If the user asks for PDF or Word, point them to the report card Download menu rather than creating duplicate files',
  ].join('\n')
}
