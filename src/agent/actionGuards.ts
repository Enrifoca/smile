export interface ActionFirstContext {
  /** Set after report_write succeeds this user turn. Post-report bullet summaries are not treated as planning. */
  reportWriteSucceededThisTurn?: boolean
}

/**
 * Detect when the model answered with a plan in chat instead of calling tools
 * for an actionable user request.
 */
export function shouldNudgeActionFirst(
  latestUserMessage: string,
  responseText: string,
  context: ActionFirstContext = {},
): boolean {
  const latestUser = latestUserMessage.toLowerCase()
  const looksActionable = /\b(create|add|update|change|transition|move|attach|upload|schedule|automate|make|write|save|generate)\b/.test(latestUser)
    && /\b(record|records|task|tasks|ticket|tickets|comment|attachment|report|file|document|automation|connector)\b/.test(latestUser)

  if (!looksActionable) return false

  const isClarification = responseText.includes('?') && responseText.length < 500
  if (isClarification) return false

  const hasListMarkers = /^\s*(?:[-*]|\d+\.)\s+/m.test(responseText)
  const looksLikeDeferredAction = /\b(I would|I will|I'll|I can)\b/i.test(responseText)
  const isLongPlan = responseText.length > 700

  // After report_write, the model may summarize with bullets that match the report — not a plan to replace the tool.
  const listCountsAsPlanning = hasListMarkers && !context.reportWriteSucceededThisTurn

  return isLongPlan || listCountsAsPlanning || looksLikeDeferredAction
}
