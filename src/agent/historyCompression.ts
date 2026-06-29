import type { Message } from './types'
import type { AIResponse } from './config'

const CHARS_PER_TOKEN = 4
const DEFAULT_CONTEXT_WINDOW = 128_000
const COMPRESS_THRESHOLD_RATIO = 0.5
const RAW_TURNS_KEEP = 14
const CHUNK_SIZE = 10

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

type HistoryMessage = { role: 'user' | 'assistant' | 'system'; content: string }

/**
 * Messages visible to the model during summarization.
 * Drop UI-only rows, previous compression tiers, and activity rows.
 */
function isModelVisibleMessage(message: Message): boolean {
  return (
    message.type !== 'tool_summary'
    && message.type !== 'artifact'
    && message.type !== 'activity'
    && message.type !== 'summary'
  )
}

export function filterModelHistory(messages: Message[]): HistoryMessage[] {
  return messages
    .filter(isModelVisibleMessage)
    .map(m => ({ role: m.role as HistoryMessage['role'], content: m.content }))
}

const CHUNK_SUMMARY_PROMPT = `Summarize the following conversation excerpt for the AI agent continuing the work.
Preserve: user goals, file paths, key decisions, tool outcomes, errors, and facts needed for pending tasks.
Omit: pleasantries, repeated tool output, thinking blocks.
Use concise bullet points. Max 400 words.`

const MASTER_SUMMARY_PROMPT = `Condense the following conversation summaries into one dense master summary for the AI agent.
Preserve: user goals, file paths, key decisions, tool outcomes, errors, and pending tasks.
Omit: pleasantries and redundant details.
Use concise bullet points. Max 600 words.`

function createSummaryMessage(content: string): Message {
  return {
    id: `compression-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    role: 'system',
    type: 'summary',
    content,
    timestamp: new Date().toISOString(),
  }
}

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

  if (visible.length <= RAW_TURNS_KEEP + CHUNK_SIZE) {
    return { compressed: false }
  }

  // Tier 0: keep the most recent RAW_TURNS_KEEP turns in full.
  const olderTurns = visible.slice(0, -RAW_TURNS_KEEP)

  // Tier 1: summarize older turns in chunks.
  const chunkSummaries: string[] = []
  for (let i = 0; i < olderTurns.length; i += CHUNK_SIZE) {
    const chunk = olderTurns.slice(i, i + CHUNK_SIZE)
    const transcript = chunk
      .map(m => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n\n')

    const result = await options.callAI([
      { role: 'system', content: CHUNK_SUMMARY_PROMPT },
      { role: 'user', content: transcript },
    ])

    if (result.success && result.data?.content?.trim()) {
      chunkSummaries.push(result.data.content.trim())
    }
  }

  if (chunkSummaries.length === 0) {
    return { compressed: false }
  }

  // Tier 2: if chunk summaries exceed budget, roll them into a master summary.
  let masterSummary = ''
  const chunkTokens = chunkSummaries.reduce((sum, s) => sum + estimateTokens(s), 0)
  if (chunkTokens > contextWindow * 0.15 && chunkSummaries.length > 1) {
    const result = await options.callAI([
      { role: 'system', content: MASTER_SUMMARY_PROMPT },
      { role: 'user', content: chunkSummaries.join('\n\n---\n\n') },
    ])
    if (result.success && result.data?.content?.trim()) {
      masterSummary = result.data.content.trim()
    }
  }

  const summaryMessages: Message[] = []

  if (masterSummary) {
    summaryMessages.push(
      createSummaryMessage(`[MASTER SUMMARY — older conversation]\n${masterSummary}`),
    )
    // Keep only the most recent chunk summary alongside the master summary.
    const lastChunk = chunkSummaries[chunkSummaries.length - 1]
    summaryMessages.push(
      createSummaryMessage(`[RECENT CHUNK SUMMARY]\n${lastChunk}`),
    )
  } else {
    // No master summary yet — keep each chunk summary as its own system tier.
    for (const summary of chunkSummaries) {
      summaryMessages.push(createSummaryMessage(`[CHUNK SUMMARY]\n${summary}`))
    }
  }

  // Rebuild conversationHistory: keep non-visible messages, then summaries, then raw turns.
  const protectedIds = new Set(
    options.conversationHistory
      .filter(isModelVisibleMessage)
      .slice(-RAW_TURNS_KEEP)
      .map(m => m.id),
  )

  const kept = options.conversationHistory.filter(
    m => !isModelVisibleMessage(m) || protectedIds.has(m.id),
  )

  const insertAt = kept.findIndex(m => isModelVisibleMessage(m) && protectedIds.has(m.id))
  if (insertAt >= 0) {
    kept.splice(insertAt, 0, ...summaryMessages)
  } else {
    kept.unshift(...summaryMessages)
  }

  options.conversationHistory.length = 0
  options.conversationHistory.push(...kept)

  console.log(
    `[Agent] Compressed ${olderTurns.length} older messages into ${summaryMessages.length} summary tier(s)`,
  )
  return { compressed: true, summary: summaryMessages.map(m => m.content).join('\n\n') }
}
