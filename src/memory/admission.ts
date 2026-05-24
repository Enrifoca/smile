import { LEARNED_NOTE_MAX_ENTRY_CHARS } from './constants'

export interface LearnedAdmissionResult {
  ok: boolean
  reason?: string
}

/**
 * Learned Notes store habits and preferences only — never tool payloads or connector evidence.
 */
export function validateLearnedNoteContent(content: string): LearnedAdmissionResult {
  const trimmed = content.trim()
  if (!trimmed) {
    return { ok: false, reason: 'content is empty' }
  }

  if (trimmed.length > LEARNED_NOTE_MAX_ENTRY_CHARS) {
    return {
      ok: false,
      reason: `Learned notes must be short preferences (max ${LEARNED_NOTE_MAX_ENTRY_CHARS} characters), not data dumps. Summarize the habit in one sentence.`,
    }
  }

  if (looksLikeStructuredPayload(trimmed)) {
    return {
      ok: false,
      reason: 'Learned notes must not store raw JSON or API results. Save a reusable preference instead.',
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
      return text.length > 120
    }
  }

  if (/^```/m.test(text)) return true
  if (/"issues"\s*:/.test(text) || /"values"\s*:/.test(text)) return true

  return false
}
