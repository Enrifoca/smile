/** Max characters of recent learned notes injected verbatim into the system prompt. */
export const LEARNED_NOTES_RECENT_PROMPT_BUDGET = 2000

/** When total learned note text exceeds this, older notes roll into the archived summary. */
export const LEARNED_NOTES_ROLLUP_THRESHOLD = 3200

/** Max characters for the deterministic archived rollup block in the prompt. */
export const LEARNED_NOTES_ROLLUP_MAX_CHARS = 900

/** Learned notes must be preferences, not API dumps. */
export const LEARNED_NOTE_MAX_ENTRY_CHARS = 600
