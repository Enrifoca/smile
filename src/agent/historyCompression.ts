import type { Message } from './types'
import type { AIResponse } from './config'

const CHARS_PER_TOKEN = 4
const DEFAULT_CONTEXT_WINDOW = 128_000
const COMPRESS_THRESHOLD_RATIO = 0.5
const PROTECT_LAST_N = 14

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

type HistoryMessage = { role: 'user' | 'assistant'; content: string }

function isModelVisibleMessage(message: Message): boolean {
  return message.type !== 'tool_summary' && message.type !== 'artifact'
}

export function filterModelHistory(messages: Message[]): HistoryMessage[] {
  return messages
    .filter(isModelVisibleMessage)
    .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))
}

const SUMMARY_PROMPT = `Summarize the following conversation excerpt for the AI agent continuing the work.
Preserve: user goals, file paths, key decisions, tool outcomes, errors, and facts needed for pending tasks.
Omit: pleasantries, repeated tool output, thinking blocks.
Use concise bullet points. Max 800 words.`

export async function maybeCompressConversationHistory(options: {
  conversationHistory: Message[]
  systemPrompt: string
  callAI: (messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>) => Promise<{
    success: boolean
    data?: AIResponse
    error?: string
  }>
  contextWindowTokens?: number
}): Promise<{ compressed: boolean; summary?: string }> {
  const contextWindow = options.contextWindowTokens ?? DEFAULT_CONTEXT_WINDOW
  const visible = filterModelHistory(options.conversationHistory)
  const historyText = visible.map(m => m.content).join('\n')
  const totalTokens = estimateTokens(options.systemPrompt + historyText)

  if (totalTokens < contextWindow * COMPRESS_THRESHOLD_RATIO) {
    return { compressed: false }
  }

  if (visible.length <= PROTECT_LAST_N + 4) {
    return { compressed: false }
  }

  const toSummarize = visible.slice(0, -PROTECT_LAST_N)
  const transcript = toSummarize
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n')

  const result = await options.callAI([
    { role: 'system', content: SUMMARY_PROMPT },
    { role: 'user', content: transcript },
  ])

  if (!result.success || !result.data?.content?.trim()) {
    console.warn('[Agent] History compression failed:', result.error)
    return { compressed: false }
  }

  const summary = result.data.content.trim()
  const summaryContent = `[CONVERSATION SUMMARY — earlier messages in this chat]\n${summary}`

  const protectedIds = new Set(
    options.conversationHistory
      .filter(isModelVisibleMessage)
      .slice(-PROTECT_LAST_N)
      .map(m => m.id),
  )

  const summaryMessage: Message = {
    id: `compression-${Date.now()}`,
    role: 'user',
    content: summaryContent,
    timestamp: new Date().toISOString(),
  }

  const kept = options.conversationHistory.filter(
    m => !isModelVisibleMessage(m) || protectedIds.has(m.id),
  )

  const insertAt = kept.findIndex(m => isModelVisibleMessage(m) && protectedIds.has(m.id))
  if (insertAt >= 0) {
    kept.splice(insertAt, 0, summaryMessage)
  } else {
    kept.unshift(summaryMessage)
  }

  options.conversationHistory.length = 0
  options.conversationHistory.push(...kept)

  console.log(`[Agent] Compressed ${toSummarize.length} messages into summary (${estimateTokens(summary)} est. tokens)`)
  return { compressed: true, summary: summaryContent }
}
