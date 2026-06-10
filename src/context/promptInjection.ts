/**
 * How active context markdown is injected into the agent system prompt.
 *
 * All-or-nothing: inject the full file when it fits the budget, otherwise
 * omit body content and require context_read (no partial truncation).
 */

/** Max characters of context markdown injected verbatim into the system prompt. */
export const CONTEXT_PROMPT_FULL_INJECT_BUDGET = 12_000

export interface ContextPromptBody {
  /** Character length of the context markdown file (trimmed). */
  length: number
  /** Full markdown when injectFull is true; otherwise empty. */
  markdown: string
  /** When false the agent must call context_read — partial injection is never used. */
  injectFull: boolean
}

export function resolveContextPromptBody(
  markdown: string,
  budget = CONTEXT_PROMPT_FULL_INJECT_BUDGET,
): ContextPromptBody {
  const trimmed = markdown.trim()
  const length = trimmed.length

  if (!length) {
    return { length: 0, markdown: '', injectFull: true }
  }

  if (length <= budget) {
    return { length, markdown: trimmed, injectFull: true }
  }

  return { length, markdown: '', injectFull: false }
}
