export interface ContextAdmissionResult {
  ok: boolean
  reason?: string
}

const CONTEXT_ENTRY_MAX_CHARS = 4000

/**
 * Context notes store project knowledge — not raw tool payloads or API dumps.
 */
export function validateContextContent(content: string): ContextAdmissionResult {
  const trimmed = content.trim()
  if (!trimmed) {
    return { ok: false, reason: 'content is empty' }
  }

  if (trimmed.length > CONTEXT_ENTRY_MAX_CHARS) {
    return {
      ok: false,
      reason: `Context entries must stay focused (max ${CONTEXT_ENTRY_MAX_CHARS} characters). Split into smaller updates or use context_replace_section for large sections.`,
    }
  }

  if (looksLikeStructuredPayload(trimmed)) {
    return {
      ok: false,
      reason: 'Context must not store raw JSON or API results. Summarize the insight in prose instead.',
    }
  }

  return { ok: true }
}

function looksLikeStructuredPayload(text: string): boolean {
  if ((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'))) {
    try {
      JSON.parse(text)
      return true
    } catch {
      return text.length > 200
    }
  }

  if (/^```/m.test(text)) return true
  if (/"issues"\s*:/.test(text) || /"values"\s*:/.test(text)) return true

  return false
}
