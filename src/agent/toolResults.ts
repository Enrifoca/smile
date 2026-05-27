import { buildReportGroundingHint } from './taskContinuity'

export function unwrapToolResult(result: unknown): string {
  const data = result as { success?: boolean; data?: unknown; error?: string }
  if (data.success === false) return `Error: ${data.error || 'Unknown error'}`

  const mcpData = data.data as { content?: Array<{ text?: string }> }
  if (mcpData?.content?.[0]?.text) return mcpData.content[0].text
  if (data.data) return typeof data.data === 'string' ? data.data : JSON.stringify(data.data)
  return 'Done.'
}

export function formatCoreToolResultForAI(
  toolName: string,
  result: unknown,
  args?: Record<string, unknown>,
): string {
  const data = result as { success?: boolean; data?: unknown; error?: string; path?: string; title?: string }
  if (data.success === false) {
    const error = data.error || 'Unknown error'
    if (toolName === 'file_read' && /pdf|file_read_ocr|ocr/i.test(error)) {
      return `Error: ${error} Next step: call file_read_ocr with the same path.`
    }
    return `Error: ${error}`
  }

  if (toolName === 'report_write' && typeof data.data === 'string') {
    return data.data
  }

  const raw = unwrapToolResult(result)

  if (toolName === 'file_read' || toolName === 'file_read_ocr') {
    const path = String(args?.path || '')
    const hint = buildReportGroundingHint(path)
    return hint ? `${raw}${hint}` : raw
  }

  if (toolName === 'file_search' || toolName === 'file_list') {
    try {
      const parsed = JSON.parse(raw)
      const files: Array<Record<string, unknown>> = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.files)
          ? parsed.files
          : []

      if (files.length === 0) {
        return toolName === 'file_search'
          ? 'No files found for this search.'
          : 'No files found in this folder.'
      }

      const lines = files.slice(0, 80).map(file => {
        const name = String(file.name || file.path || '(unnamed)')
        const filePath = String(file.path || name)
        const suffix = file.isDirectory ? '/' : ''
        return `- ${filePath}${suffix}`
      })

      const shown = files.length > lines.length
        ? `\n...and ${files.length - lines.length} more`
        : ''

      return `${files.length} file(s):\n${lines.join('\n')}${shown}`
    } catch {
      return raw
    }
  }

  return raw
}
