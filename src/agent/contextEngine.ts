// Smart context engine for inference-time history compression.
//
// Inspired by Hermes (NousResearch) and OpenClaw:
//  1. Cheap pre-pass: shrink old tool results, strip base64 images, dedupe, cap length.
//  2. Head + tail protection: keep the first few turns and the most recent turns.
//  3. Middle summarization: use an LLM to compress the middle band when the budget
//     is still exceeded.
//  4. Last-resort guard: drop oldest middle messages if even the summary won't fit.
//
// This module is intentionally non-mutating: it returns the messages that should be
// sent to the model without touching the stored conversation history.

import type { AIResponse } from './config'

const CHARS_PER_TOKEN = 4
const DEFAULT_CONTEXT_WINDOW = 128_000
const DEFAULT_OUTPUT_RESERVE = 12_000
const MIN_INPUT_BUDGET = 8_000

/** A message the model can see during inference. */
export interface HistoryMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface SmartCompressOptions {
  /** Full system prompt (will never be LLM-summarized; only truncated as last resort). */
  systemPrompt: string
  /** Model-visible conversation messages, oldest first. */
  messages: HistoryMessage[]
  /** Caller used to summarize the middle band when necessary. */
  callAI: (messages: HistoryMessage[]) => Promise<{ success: boolean; data?: AIResponse; error?: string }>
  /** Model context window in tokens. */
  contextWindowTokens?: number
  /** Tokens reserved for the model's response. */
  outputTokenReserve?: number
  /** Additional tokens consumed by tool/function definitions that must fit in the same context window. */
  toolOverheadTokens?: number
  /** Number of initial user/assistant turns to keep verbatim. */
  headTurns?: number
  /** Tokens to reserve for the recent tail. */
  tailTokenBudget?: number
}

export interface SmartCompressResult {
  messages: HistoryMessage[]
  systemPrompt: string
  wasCompressed: boolean
  summary?: string
  metadata: {
    originalMessages: number
    finalMessages: number
    originalTokens: number
    finalTokens: number
    cheapCompressedCount: number
    summarizedCount: number
    droppedCount: number
  }
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

function totalTokenEstimate(messages: HistoryMessage[], systemPrompt: string): number {
  return estimateTokens(systemPrompt) + messages.reduce((sum, m) => sum + estimateTokens(m.content), 0)
}

function inputBudget(contextWindowTokens?: number, outputTokenReserve?: number, toolOverheadTokens?: number): number {
  const window = contextWindowTokens ?? DEFAULT_CONTEXT_WINDOW
  const reserve = (outputTokenReserve ?? DEFAULT_OUTPUT_RESERVE) + (toolOverheadTokens ?? 0)
  return Math.max(window - reserve, MIN_INPUT_BUDGET)
}

// -----------------------------------------------------------------------------
// Cheap pre-pass (no LLM)
// -----------------------------------------------------------------------------

const DATA_URI_REGEX = /data:[a-zA-Z0-9!#$%&'*+\-.^_{|}~]+\/[a-zA-Z0-9!#$%&'*+\-.^_{|}~]+;base64,[A-Za-z0-9+/=]+/g
const TOOL_RESULT_PREFIX_REGEX = /^\[tool_result:\s*([^\]]+)\]\s*/

function stripDataUris(content: string): string {
  return content.replace(DATA_URI_REGEX, match => `[binary: ${Math.ceil(match.length / 1024)} KB]`)
}

function oneLineToolResult(content: string): string {
  const match = TOOL_RESULT_PREFIX_REGEX.exec(content)
  if (!match) return content
  const toolName = match[1]
  const body = content.slice(match[0].length).trim()
  const firstLine = body.split('\n').find(line => line.trim())?.trim() ?? ''
  const summary = firstLine.length > 160 ? `${firstLine.slice(0, 160)}…` : firstLine
  return `[tool_result: ${toolName}] ${summary || '[result compressed]'}`
}

function capMessage(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content
  const head = Math.floor(maxChars * 0.72)
  const tail = Math.max(200, maxChars - head - 60)
  return `${content.slice(0, head)}\n… (${content.length - head - tail} characters omitted) …\n${content.slice(-tail)}`
}

interface CheapCompressOptions {
  /** Messages older than this index are heavily compressed. */
  oldAgeThreshold: number
  /** Max characters for any single message after cheap compression. */
  maxCharsPerMessage: number
}

function cheapCompressMessages(
  messages: HistoryMessage[],
  options: CheapCompressOptions,
): { messages: HistoryMessage[]; compressedCount: number } {
  const { oldAgeThreshold, maxCharsPerMessage } = options
  const out: HistoryMessage[] = []
  let compressedCount = 0
  let lastToolResultSignature = ''

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i]
    const isOld = i < messages.length - oldAgeThreshold - 1

    let content = stripDataUris(message.content)

    // Deduplicate identical consecutive tool_result outputs.
    if (content.startsWith('[tool_result:')) {
      const sig = content.slice(0, 240)
      if (sig === lastToolResultSignature) {
        out.push({ ...message, content: '[tool_result: same as above]' })
        compressedCount++
        continue
      }
      lastToolResultSignature = sig
    } else {
      lastToolResultSignature = ''
    }

    if (isOld && content.startsWith('[tool_result:')) {
      content = oneLineToolResult(content)
      compressedCount++
    }

    content = capMessage(content, maxCharsPerMessage)

    if (content !== message.content) {
      compressedCount++
    }

    out.push({ ...message, content })
  }

  return { messages: out, compressedCount }
}

// -----------------------------------------------------------------------------
// Middle summarization
// -----------------------------------------------------------------------------

const MIDDLE_SUMMARY_PROMPT = `You are a context-compression assistant for an AI agent.
Summarize the conversation excerpt below into a dense, structured briefing.
The agent must be able to continue the task using only this briefing.

Preserve:
- The user's explicit goals and instructions
- File paths, URLs, and identifiers
- Key decisions and their rationale
- Tool outcomes that matter for the next step (especially errors or missing data)
- Values, names, or facts the user asked to remember
- Pending tasks or open questions

Omit:
- Greetings, pleasantries, and apologies
- Repeated or redundant tool output
- Thinking blocks and meta-commentary

Format as concise bullet points. Max 600 words.`

async function summarizeMiddle(
  middle: HistoryMessage[],
  callAI: SmartCompressOptions['callAI'],
): Promise<string | undefined> {
  if (middle.length === 0) return undefined

  const transcript = middle
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n---\n\n')

  const result = await callAI([
    { role: 'system', content: MIDDLE_SUMMARY_PROMPT },
    { role: 'user', content: transcript },
  ])

  if (result.success && result.data?.content?.trim()) {
    return result.data.content.trim()
  }

  return undefined
}

// -----------------------------------------------------------------------------
// Head/tail assembly
// -----------------------------------------------------------------------------

function buildProtectedMessages(
  messages: HistoryMessage[],
  headTurns: number,
  tailTokenBudget: number,
): {
  head: HistoryMessage[]
  middle: HistoryMessage[]
  tail: HistoryMessage[]
} {
  // Head: first N user turns (establish goals and key decisions).
  const head: HistoryMessage[] = []
  let headUserCount = 0
  for (const message of messages) {
    if (message.role === 'user') headUserCount++
    head.push(message)
    if (headUserCount >= headTurns) break
  }

  // Tail anchor: the last user message plus every message that follows it.
  // This pair is non-negotiable — it contains the current request and any
  // tool results the model needs to reason about.
  const reversedUserIndex = [...messages].reverse().findIndex(m => m.role === 'user')
  const anchorStart = reversedUserIndex >= 0 ? messages.length - 1 - reversedUserIndex : messages.length
  const anchor = messages.slice(anchorStart)

  // Fill the rest of the tail budget with recent messages before the anchor.
  const tail: HistoryMessage[] = []
  let tailTokens = 0
  for (let i = anchorStart - 1; i >= head.length; i--) {
    const message = messages[i]
    const messageTokens = estimateTokens(message.content)
    if (tailTokens + messageTokens > tailTokenBudget && tail.length > 0) {
      break
    }
    tail.unshift(message)
    tailTokens += messageTokens
  }
  tail.push(...anchor)

  const headEndIndex = head.length
  const tailStartIndex = messages.length - tail.length
  const middle = messages.slice(headEndIndex, tailStartIndex)

  return { head, middle, tail }
}

// -----------------------------------------------------------------------------
// Public compressor
// -----------------------------------------------------------------------------

/**
 * Smart context compression for a single inference call.
 *
 * Never mutates the input arrays. Returns the messages that should be sent to the
 * model, along with a summary message if middle-band summarization was required.
 */
export async function smartCompressForInference(options: SmartCompressOptions): Promise<SmartCompressResult> {
  const {
    systemPrompt: rawSystemPrompt,
    messages: rawMessages,
    callAI,
    contextWindowTokens,
    outputTokenReserve,
    toolOverheadTokens,
    headTurns = 3,
    tailTokenBudget = 18_000,
  } = options

  const budget = inputBudget(contextWindowTokens, outputTokenReserve, toolOverheadTokens)

  // 1. Cheap pre-pass on the full visible history.
  const { messages: cheapMessages, compressedCount: cheapCompressedCount } = cheapCompressMessages(rawMessages, {
    oldAgeThreshold: Math.max(headTurns * 2, 8),
    maxCharsPerMessage: 12_000,
  })

  const originalTokens = totalTokenEstimate(rawMessages, rawSystemPrompt)
  const cheapTokens = totalTokenEstimate(cheapMessages, rawSystemPrompt)

  if (cheapTokens <= budget) {
    return {
      messages: cheapMessages,
      systemPrompt: rawSystemPrompt,
      wasCompressed: cheapCompressedCount > 0,
      metadata: {
        originalMessages: rawMessages.length,
        finalMessages: cheapMessages.length,
        originalTokens,
        finalTokens: cheapTokens,
        cheapCompressedCount,
        summarizedCount: 0,
        droppedCount: 0,
      },
    }
  }

  // 2. Protect head + tail, gather middle band.
  const { head, middle, tail } = buildProtectedMessages(cheapMessages, headTurns, tailTokenBudget)
  const originalMiddleLength = middle.length

  // 3. Summarize the middle band with an LLM (once).
  let summary = await summarizeMiddle(middle, callAI)
  let summaryMessage: HistoryMessage | undefined
  if (summary) {
    // Cap summary length so it cannot dominate the prompt.
    const cappedSummary = capMessage(summary, 6_000)
    summaryMessage = {
      role: 'system',
      content: `[Earlier conversation summary]\n${cappedSummary}`,
    }
  }

  let candidateMessages: HistoryMessage[] = summaryMessage
    ? [...head, summaryMessage, ...tail]
    : [...head, ...tail]

  let candidateTokens = totalTokenEstimate(candidateMessages, rawSystemPrompt)

  // 4. Last-resort guard: drop oldest middle messages until we fit.
  // We do not re-summarize on every iteration; the single summary already covers
  // the middle band. Dropping here only removes already-summarized history.
  let droppedCount = 0
  while (candidateTokens > budget && middle.length > 0) {
    const removed = middle.shift()
    if (!removed) break
    droppedCount++
    // If the summary itself is eating too much budget, truncate it.
    if (summaryMessage && estimateTokens(summaryMessage.content) > budget * 0.15) {
      summaryMessage.content = capMessage(summaryMessage.content, 3_000)
    }

    candidateMessages = summaryMessage
      ? [...head, summaryMessage, ...tail]
      : [...head, ...tail]
    candidateTokens = totalTokenEstimate(candidateMessages, rawSystemPrompt)
  }

  // If the system prompt alone is over budget, truncate it as an absolute last resort.
  let systemPrompt = rawSystemPrompt
  if (candidateTokens > budget) {
    const systemTokens = estimateTokens(systemPrompt)
    const allowedSystemTokens = Math.max(budget * 0.5, MIN_INPUT_BUDGET)
    if (systemTokens > allowedSystemTokens) {
      const allowedChars = Math.floor(allowedSystemTokens * CHARS_PER_TOKEN)
      systemPrompt = `${systemPrompt.slice(0, allowedChars)}\n\n[System prompt truncated due to context length]`
      candidateTokens = totalTokenEstimate(candidateMessages, systemPrompt)
    }
  }

  // Final hard guard: if still over budget, drop oldest remaining messages one by one.
  while (candidateTokens > budget && candidateMessages.length > 1) {
    const removed = candidateMessages.shift()
    if (!removed) break
    droppedCount++
    candidateTokens = totalTokenEstimate(candidateMessages, systemPrompt)
  }

  const finalMessages = candidateMessages
  const finalTokens = totalTokenEstimate(finalMessages, systemPrompt)

  if (finalTokens > budget) {
    console.warn(
      `[Agent] Context still over budget after smart compression: estimated ${finalTokens} > ${budget}. ` +
      `Dropped ${droppedCount} messages; keeping ${finalMessages.length} messages.`,
    )
  } else if (droppedCount > 0 || summaryMessage) {
    console.log(
      `[Agent] Smart context compression: ${rawMessages.length} → ${finalMessages.length} messages, ` +
      `${originalTokens} → ${finalTokens} tokens (dropped ${droppedCount}, summarized ${originalMiddleLength}).`,
    )
  }

  return {
    messages: finalMessages,
    systemPrompt,
    wasCompressed: true,
    summary,
    metadata: {
      originalMessages: rawMessages.length,
      finalMessages: finalMessages.length,
      originalTokens,
      finalTokens,
      cheapCompressedCount,
      summarizedCount: summaryMessage ? originalMiddleLength : 0,
      droppedCount,
    },
  }
}
