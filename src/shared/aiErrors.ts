/** Transient provider errors worth retrying or falling back to another model. */
export function isRetryableAIError(message: string): boolean {
  const lower = message.toLowerCase()
  return lower.includes('rate limit')
    || lower.includes('overloaded')
    || lower.includes('too many requests')
    || lower.includes('503')
    || lower.includes('502')
    || lower.includes('504')
    || lower.includes('temporarily unavailable')
    || lower.includes('service unavailable')
    || lower.includes('high demand')
}

export function getRetryWaitMs(errorMessage: string, attempt: number): number {
  const match = errorMessage.match(/try again in ([\d.]+)ms/i)
  if (match) return Math.ceil(parseFloat(match[1]))

  const lower = errorMessage.toLowerCase()
  if (lower.includes('rate limit')) return 1000 * (attempt + 1)
  if (isRetryableAIError(errorMessage)) return 2000 * (attempt + 1)
  return 0
}

export function formatAgentErrorMessage(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error)
  const lower = msg.toLowerCase()

  if (isRetryableAIError(msg)) {
    return `The AI provider is temporarily busy (${msg}). Your connector and API keys are likely fine — wait a moment and try again.`
  }

  if (
    lower.includes('not configured')
    || lower.includes('api key')
    || lower.includes('invalid api')
    || lower.includes('401')
    || lower.includes('403')
    || lower.includes('authentication')
  ) {
    return `I encountered an error: ${msg}. Please check your API configuration in Settings.`
  }

  return `I encountered an error: ${msg}. If this keeps happening, check your API configuration in Settings.`
}
