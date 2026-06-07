import { ToolResult } from './result'

/**
 * Generic MCP `tools/call` result → {@link ToolResult} normalization.
 *
 * Connector-neutral: every MCP server returns the same envelope (`content`,
 * optional `structuredContent`, optional `isError`). Handlers and declarative
 * MCP connectors never parse raw MCP payloads themselves.
 *
 * Priority: `structuredContent` (machine-readable) → JSON in text `content` →
 * plain text `content` → raw value.
 */
export function normalizeMcpResult(raw: unknown): ToolResult {
  if (raw === null || raw === undefined) {
    return { success: true, data: raw }
  }

  if (typeof raw !== 'object') {
    return { success: true, data: raw }
  }

  const result = raw as {
    structuredContent?: unknown
    content?: Array<{ type?: string; text?: string }>
    isError?: boolean
  }

  if (result.structuredContent !== undefined && result.structuredContent !== null) {
    if (result.isError) {
      const message = extractErrorMessage(result.structuredContent)
      return { success: false, error: message || 'MCP tool returned an error', data: result.structuredContent }
    }
    return { success: true, data: result.structuredContent }
  }

  const textBlocks = (result.content || [])
    .filter(block => block?.type === 'text' || typeof block?.text === 'string')
    .map(block => block.text || '')
    .filter(Boolean)

  const combinedText = textBlocks.join('\n').trim()

  if (combinedText) {
    const parsed = tryParseJson(combinedText)
    if (parsed.ok) {
      if (result.isError || isErrorPayload(parsed.value)) {
        return {
          success: false,
          error: extractErrorMessage(parsed.value) || combinedText,
          data: parsed.value,
        }
      }
      return { success: true, data: parsed.value }
    }

    if (result.isError) {
      return { success: false, error: combinedText, data: combinedText }
    }
    return { success: true, data: combinedText }
  }

  if (result.isError) {
    return { success: false, error: 'MCP tool returned an error', data: raw }
  }

  return { success: true, data: raw }
}

function tryParseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch {
    return { ok: false }
  }
}

function isErrorPayload(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return record.error === true || record.success === false
}

function extractErrorMessage(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  for (const key of ['message', 'errorMessage', 'error']) {
    const candidate = record[key]
    if (typeof candidate === 'string' && candidate.trim()) return candidate
  }
  return undefined
}
