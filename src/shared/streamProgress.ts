/** Fired while the model streams tool-call arguments (before execution). */
export interface AIStreamProgressEvent {
  toolName: string
  title?: string
}

export function extractPartialToolTitle(raw: string): string | undefined {
  const match = raw.match(/"title"\s*:\s*"((?:[^"\\]|\\.)*)/)
  if (!match) return undefined
  const title = match[1].replace(/\\"/g, '"').replace(/\\n/g, ' ').trim()
  return title ? title.slice(0, 120) : undefined
}

export function notifyToolDraftProgress(
  toolCalls: Array<{ name: string; arguments: string }>,
  onProgress: ((event: AIStreamProgressEvent) => void) | undefined,
  lastNotified: Map<number, string>,
): void {
  if (!onProgress) return

  toolCalls.forEach((toolCall, index) => {
    if (!toolCall.name) return
    const title = toolCall.name === 'report_write'
      ? extractPartialToolTitle(toolCall.arguments)
      : undefined
    const signature = `${toolCall.name}:${title || ''}`
    if (lastNotified.get(index) === signature) return
    lastNotified.set(index, signature)
    onProgress({ toolName: toolCall.name, title })
  })
}
