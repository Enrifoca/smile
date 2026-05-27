import { ToolCategory } from '../connectors/types'

export type TurnIntentKind =
  | 'update_report'
  | 'update_file'
  | 'draft_report'
  | 'general'

export interface TurnIntent {
  kind: TurnIntentKind
  targetPath?: string
  summary: string
}

export interface ToolRunRecord {
  name: string
  category?: ToolCategory
}

const CORE_READ_TOOLS = new Set([
  'file_read',
  'file_read_ocr',
  'file_list',
  'file_search',
  'memory_read',
])

export function inferTurnIntent(userMessage: string): TurnIntent {
  const lower = userMessage.toLowerCase().trim()
  const pathMatch =
    userMessage.match(/`([^`]+\.md)`/i)
    || userMessage.match(/(\.smile\/reports\/[^\s,`]+)/i)
    || userMessage.match(/\b([\w./\\-]+\.md)\b/i)
  const targetPath = pathMatch?.[1]?.replace(/\\/g, '/')

  const wantsEdit = /\b(update|overwrite|revise|edit|fix|change|amend|correct|adjust|iterate|modify)\b/.test(lower)
  const wantsDraft = /\b(create|draft|write|save|generate|prepare)\b/.test(lower)
  const mentionsReport = /\b(report|markdown|\.md)\b/.test(lower) || targetPath?.includes('.smile/reports/')

  if (wantsEdit && mentionsReport) {
    return {
      kind: 'update_report',
      targetPath,
      summary: targetPath
        ? `Update the markdown report at ${targetPath} (overwrite same path after editing).`
        : 'Update an existing markdown report (read it, edit, then report_write to the same path).',
    }
  }

  if (wantsEdit && targetPath) {
    return {
      kind: 'update_file',
      targetPath,
      summary: `Update the file at ${targetPath} (read, edit, then file_write to the same path).`,
    }
  }

  if (wantsDraft && mentionsReport) {
    return {
      kind: 'draft_report',
      targetPath,
      summary: 'Draft or save a markdown report. Ground content in files you read or what the user said — do not invent facts.',
    }
  }

  return { kind: 'general', summary: '' }
}

export function formatTurnIntentForScratchpad(intent: TurnIntent): string {
  if (intent.kind === 'general' || !intent.summary) return ''
  return `Goal this turn: ${intent.summary}`
}

export function isReadOnlyTool(tool: ToolRunRecord): boolean {
  if (CORE_READ_TOOLS.has(tool.name)) return true
  if (tool.category === 'connector-read' || tool.category === 'file-read') return true
  return false
}

export function isWriteTool(tool: ToolRunRecord): boolean {
  if (tool.name === 'scratchpad_write') return false
  if (tool.category === 'connector-write' || tool.category === 'connector-attachment') return true
  if (tool.category === 'file-write') return true
  if (tool.name === 'file_write' || tool.name === 'report_write' || tool.name === 'file_mkdir') return true
  return false
}

export function shouldNudgeIncompleteWorkflow(
  intent: TurnIntent,
  toolsRunThisTurn: ToolRunRecord[],
  responseText: string,
): boolean {
  if (intent.kind !== 'update_report' && intent.kind !== 'update_file') return false

  const hadRead = toolsRunThisTurn.some(isReadOnlyTool)
  const hadWrite = toolsRunThisTurn.some(isWriteTool)
  if (!hadRead || hadWrite) return false

  const text = responseText.trim()
  if (!text) return true

  // Prose after a read-only step on an edit task usually means the agent stopped early.
  if (text.length > 120) return true

  return false
}

export function buildIncompleteWorkflowNudge(intent: TurnIntent): string {
  if (intent.kind === 'update_report') {
    const pathHint = intent.targetPath ? ` Use path: ${intent.targetPath}.` : ' Use the same path you read.'
    return `[SYSTEM] Task not complete. The user asked to update a markdown report. You read the file but did not save changes. Call report_write with the full updated markdown${pathHint} Content must be grounded in what you read — apply only the user's requested edits. Do not invent tasks, counts, or details. Do not stop until the write succeeds.`
  }

  const pathHint = intent.targetPath ? ` Use path: ${intent.targetPath}.` : ' Use the same path you read.'
  return `[SYSTEM] Task not complete. The user asked to update a file. You read it but did not write back. Call file_write with the updated content${pathHint} Ground changes in what you read. Do not stop until the write succeeds.`
}

export function buildReportGroundingHint(path: string): string {
  if (!path.includes('.smile/reports/') && !path.endsWith('.md')) return ''
  return ' Next: if updating this report, call report_write with the same path. Preserve existing facts; only apply requested edits. Do not invent content.'
}
