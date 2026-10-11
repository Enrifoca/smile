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
])

export function isReadOnlyTool(tool: ToolRunRecord): boolean {
  if (CORE_READ_TOOLS.has(tool.name)) return true
  if (tool.category === 'connector-read' || tool.category === 'file-read') return true
  return false
}

export function isWriteTool(tool: ToolRunRecord): boolean {
  if (tool.category === 'connector-write' || tool.category === 'connector-attachment') return true
  if (tool.category === 'file-write') return true
  if (tool.name === 'file_write' || tool.name === 'report_write' || tool.name === 'file_mkdir') return true
  return false
}

function isReportPath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/')
  if (!normalized.endsWith('.md')) return false
  // Visible workspace reports.
  if (normalized.startsWith('reports/')) return true
  // Context-scoped reports.
  if (/^contexts\/[^/]+\/reports\//.test(normalized)) return true
  // Legacy paths.
  if (normalized.includes('.smile/reports/')) return true
  if (/^\.smile\/\d{4}-\d{2}-\d{2}_/.test(normalized)) return true
  if (/\.smile\/contexts\/[^/]+\/\d{4}-\d{2}-\d{2}_/.test(normalized)) return true
  return false
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

// Action-intent phrases across languages. If the model describes an action but
// emits no tool call, we nudge it to actually call the tool.
const ACTION_INTENT_PHRASES = [
  // English
  'let me',
  "I'll",
  'I will',
  'try to',
  'retry',
  'fix',
  'correct',
  'update',
  'regenerate',
  'redraw',
  // Italian
  'creo',
  'scrivo',
  'faccio',
  'genero',
  'procedo',
  'aggiorno',
  'correggo',
  'rivedo',
  'cerco',
  'calcolo',
  'preparo',
  'creerò',
  'scriverò',
  'farò',
  'genererò',
  'proverò',
  'sistemerò',
  'vado a',
  'sto per',
  'sto cercando',
  'sto creando',
  'sto scrivendo',
  // French
  'créer',
  'écrire',
  'faire',
  'générer',
  'mettre à jour',
  'corriger',
  // Spanish
  'crear',
  'escribir',
  'hacer',
  'generar',
  'actualizar',
  'corregir',
]

function hasActionIntent(text: string): boolean {
  const lower = text.toLowerCase()
  return ACTION_INTENT_PHRASES.some(phrase => lower.includes(phrase.toLowerCase()))
}

/**
 * Detect incomplete workflows from framework-visible tool state only.
 *
 * Nudge when:
 * - The model described an action it planned to take but emitted no tool call.
 * - A framework-visible write is pending but the model produced no usable response.
 * - The model read a report/file and produced prose but no write tool.
 * - The model used read-only tools and produced prose but no write tool.
 *
 * Does not nudge after a successful write, or when the model produced no prose and no tools
 * (think-only / empty - handled elsewhere in the loop).
 */
export interface LastToolResultSnapshot {
  tool: string
  isError: boolean
}

export interface TaskContinuityContext {
  reportWriteSucceededThisTurn?: boolean
  /** Path of the report pinned in the chat composer, if any. */
  activeReportPath?: string
  /** Last tool result produced this turn, so we can recover from errors. */
  lastToolResult?: LastToolResultSnapshot
}

function activeReportToolUsedThisTurn(
  toolsRunThisTurn: ToolRunRecord[],
  activeReportPath: string,
): boolean {
  const normalized = activeReportPath.replace(/\\/g, '/')
  return toolsRunThisTurn.some(tool => {
    if (!tool.path) return false
    if (tool.name !== 'report_write' && tool.name !== 'file_read' && tool.name !== 'file_read_ocr') return false
    return tool.path.replace(/\\/g, '/') === normalized
  })
}

// Detect when the model asks the user to clarify which report/project/file
// even though an active report is already pinned in the composer.
function agentAsksWhichReport(text: string): boolean {
  const lower = text.toLowerCase()
  const phrases = [
    'which report',
    'quale report',
    'which project',
    'quale progetto',
    'which file',
    'quale file',
    'what report',
    'che report',
    'a quale report',
    'a quale progetto',
    'a quale file',
  ]
  return phrases.some(phrase => lower.includes(phrase))
}

export function shouldNudgeIncompleteWorkflow(
  toolsRunThisTurn: ToolRunRecord[],
  responseText: string,
  context: TaskContinuityContext = {},
): boolean {
  const text = responseText.trim()
  if (!text) return false

  // If the last tool failed, the model must try to fix or retry instead of stopping.
  if (context.lastToolResult?.isError) return true

  if (context.reportWriteSucceededThisTurn) return false
  if (toolsRunThisTurn.some(isWriteTool)) return false

  // If an active report is pinned and the model asks "which report", nudge it
  // to use the pinned report instead of asking the user.
  if (context.activeReportPath && !activeReportToolUsedThisTurn(toolsRunThisTurn, context.activeReportPath) && agentAsksWhichReport(text)) {
    return true
  }

  // The model described an action it plans to take but didn't actually call a tool.
  if (hasActionIntent(text)) return true

  if (lastPendingWrite(toolsRunThisTurn)) return true
  if (lastReportReadPath(toolsRunThisTurn)) return true
  if (lastFileReadPath(toolsRunThisTurn)) return true
  if (toolsRunThisTurn.some(isReadOnlyTool)) return true

  return false
}

export function buildIncompleteWorkflowNudge(
  responseText: string,
  toolsRunThisTurn: ToolRunRecord[],
  context: TaskContinuityContext = {},
): string {
  if (context.lastToolResult?.isError) {
    return `[SYSTEM] The last tool (${context.lastToolResult.tool}) failed. Read the error in the tool_result above, fix the issue, and call the appropriate tool again. Do not stop at the error message.`
  }

  if (context.activeReportPath && agentAsksWhichReport(responseText.trim())) {
    return `[SYSTEM] The active report is \`${context.activeReportPath.replace(/\\/g, '/')}\`. The user is asking about this report. Read it with file_read if needed, then update it with report_write. Do not ask the user which report they mean.`
  }

  if (hasActionIntent(responseText.trim())) {
    return '[SYSTEM] You described a planned action but did not call a tool. Call the appropriate tool now to actually perform the action. Do not stop at acknowledgments or promises.'
  }

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


