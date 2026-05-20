export function shouldNudgeActionFirst(latestUserMessage: string, responseText: string): boolean {
  const latestUser = latestUserMessage.toLowerCase()
  const looksActionable = /\b(create|add|update|change|transition|move|attach|upload|schedule|automate|make|write|save|generate)\b/.test(latestUser)
    && /\b(record|records|task|tasks|ticket|tickets|comment|attachment|report|file|document|automation|connector)\b/.test(latestUser)

  if (!looksActionable) return false

  const isClarification = responseText.includes('?') && responseText.length < 500
  if (isClarification) return false

  return responseText.length > 700
    || /^\s*(?:[-*]|\d+\.)\s+/m.test(responseText)
    || /\b(I would|I will|I'll|I can)\b/i.test(responseText)
}
