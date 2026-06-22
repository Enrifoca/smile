import { ToolCategory } from '../connectors/types'

export interface ToolRunRecord {
  name: string
  category?: ToolCategory
  /** Workspace path when the tool args included one (file_read, file_write, etc.). */
  path?: string
  /** Framework-visible write that may be pending because of this tool result. */
  pendingWriteTool?: string
  pendingWritePath?: string
}

const CORE_READ_TOOLS = new Set([
  'file_read',
  'file_read_ocr',
  'file_list',
  'file_search',
  'memory_read',
])

export function isReadOnlyTool(tool: ToolRunRecord): boolean {
  if (CORE_READ_TOOLS.has(tool.name)) return true
  if (tool.category === 'connector-read' || tool.category === 'file-read') return true
  return false
}

export function isWriteTool(tool: ToolRunRecord): boolean {
  if (tool.name === 'scratchpad_write' || tool.name === 'deep_thinking') return false
  if (tool.category === 'connector-write' || tool.category === 'connector-attachment') return true
  if (tool.category === 'file-write') return true
  if (tool.name === 'file_write' || tool.name === 'report_write' || tool.name === 'file_mkdir') return true
  return false
}

function isReportPath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/')
  return normalized.includes('.smile/reports/') && normalized.endsWith('.md')
}

function lastReportReadPath(toolsRunThisTurn: ToolRunRecord[]): string | undefined {
  for (let i = toolsRunThisTurn.length - 1; i >= 0; i -= 1) {
    const tool = toolsRunThisTurn[i]
    if ((tool.name === 'file_read' || tool.name === 'file_read_ocr') && tool.path && isReportPath(tool.path)) {
      return tool.path.replace(/\\/g, '/')
    }
  }
  return undefined
}

function lastFileReadPath(toolsRunThisTurn: ToolRunRecord[]): string | undefined {
  for (let i = toolsRunThisTurn.length - 1; i >= 0; i -= 1) {
    const tool = toolsRunThisTurn[i]
    if ((tool.name === 'file_read' || tool.name === 'file_read_ocr') && tool.path) {
      return tool.path.replace(/\\/g, '/')
    }
  }
  return undefined
}

function lastPendingWrite(toolsRunThisTurn: ToolRunRecord[]): ToolRunRecord | undefined {
  for (let i = toolsRunThisTurn.length - 1; i >= 0; i -= 1) {
    const tool = toolsRunThisTurn[i]
    if (tool.pendingWriteTool) return tool
  }
  return undefined
}

/**
 * Detect incomplete workflows from framework-visible tool state only.
 *
 * Nudge when:
 * - A framework-visible write is pending but the model produced no usable response.
 *
 * Does not nudge after a successful write, or when the model produced no prose and no tools
 * (think-only / empty - handled elsewhere in the loop).
 */
export function shouldNudgeIncompleteWorkflow(
  toolsRunThisTurn: ToolRunRecord[],
  responseText: string,
  context: { reportWriteSucceededThisTurn?: boolean } = {},
): boolean {
  if (context.reportWriteSucceededThisTurn) return false
  if (toolsRunThisTurn.some(isWriteTool)) return false

  const text = responseText.trim()
  if (lastPendingWrite(toolsRunThisTurn)) return text.length === 0

  return false
}

export function buildIncompleteWorkflowNudge(toolsRunThisTurn: ToolRunRecord[]): string {
  const pending = lastPendingWrite(toolsRunThisTurn)
  if (pending?.pendingWriteTool && pending.pendingWritePath) {
    return `[SYSTEM] Task not complete. A write appears pending from the last tool result. Call ${pending.pendingWriteTool} with path: ${pending.pendingWritePath.replace(/\\/g, '/')}. Ground content in what you read.`
  }

  const reportPath = lastReportReadPath(toolsRunThisTurn)
  if (reportPath) {
    return `[SYSTEM] Task not complete. You read a markdown report but did not save changes. Call report_write with the full updated markdown. Use path: ${reportPath}. Do not stop at chat prose. Ground content in what you read.`
  }

  const filePath = lastFileReadPath(toolsRunThisTurn)
  if (filePath) {
    return `[SYSTEM] Task not complete. You read a file but did not write back. Call file_write with the updated content. Use path: ${filePath}. Ground changes in what you read.`
  }

  if (toolsRunThisTurn.some(isReadOnlyTool)) {
    return '[SYSTEM] Task not complete. You gathered information but did not perform the required write action. Call the appropriate write tool now.'
  }

  return '[SYSTEM] You responded in chat without calling tools. If the user request requires action, call the appropriate tools now - do not stop at acknowledgments or promises.'
}

export function buildReportGroundingHint(path: string): string {
  if (!isReportPath(path)) return ''
  return ' Next: if updating this report, call report_write with the same path. Preserve existing facts; only apply requested edits. Do not invent content.'
}

export function buildPendingWriteScratchpadSuffix(toolName: string, path: string): string {
  if (!path) return ''
  if ((toolName === 'file_read' || toolName === 'file_read_ocr') && isReportPath(path)) {
    return ` - pending: report_write to ${path.replace(/\\/g, '/')}`
  }
  return ''
}
