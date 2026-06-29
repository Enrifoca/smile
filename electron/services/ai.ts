// AI Service - Runs in Electron main process to avoid CORS issues
import { AIConfig, AIProvider, getDefaultModelId, isReasoningModelId } from '../../src/shared/modelCatalog'
import { notifyToolDraftProgress, type AIStreamProgressEvent } from '../../src/shared/streamProgress'
import { getRetryWaitMs, isRetryableAIError } from '../../src/shared/aiErrors'

type StreamProgressCallback = (event: AIStreamProgressEvent) => void

/**
 * Robustly parse tool call arguments from a model response.
 * LLMs (especially Groq/LLaMA) sometimes return slightly malformed JSON —
 * unescaped newlines in string values, truncated output, trailing commas, etc.
 */
function safeParseToolArgs(raw: string): Record<string, unknown> {
  if (!raw || raw.trim() === '') return {}

  // 1. Try direct parse first
  try {
    return JSON.parse(raw)
  } catch { /* continue */ }

  // 2. Fix unescaped literal newlines/tabs inside string values
  try {
    const fixed = raw
      .replace(/:\s*"([\s\S]*?)(?<!\\)"(?=\s*[,}])/g, (_match, val: string) => {
        const escaped = val
          .replace(/\n/g, '\\n')
          .replace(/\r/g, '\\r')
          .replace(/\t/g, '\\t')
        return `: "${escaped}"`
      })
    return JSON.parse(fixed)
  } catch { /* continue */ }

  // 3. Remove trailing commas before } or ]
  try {
    const fixed = raw.replace(/,\s*([}\]])/g, '$1')
    return JSON.parse(fixed)
  } catch { /* continue */ }

  // 4. Extract the outermost JSON object with a greedy regex
  try {
    const match = raw.match(/\{[\s\S]*\}/)
    if (match) return JSON.parse(match[0])
  } catch { /* continue */ }

  // 5. Last resort — try to rescue key fields by extracting each value individually
  console.error('[AI] Could not parse tool args JSON. Raw (first 500):', raw.substring(0, 500))

  const rescued: Record<string, unknown> = {}

  // Generic field extractor for string values
  const extractField = (field: string): string | undefined => {
    const match = raw.match(new RegExp(`"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`))
    if (match) return match[1].replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"')
    return undefined
  }

  // Try to rescue common fields
  for (const field of ['path', 'content', 'title', 'name', 'executionPlan', 'prompt', 'cronExpression', 'cronLabel',
    'summary', 'description', 'projectKey', 'issueType', 'issueIdOrKey', 'jql']) {
    const val = extractField(field)
    if (val !== undefined) rescued[field] = val
  }

  if (Object.keys(rescued).length > 0) {
    console.warn('[AI] Rescued partial tool args:', Object.keys(rescued))
    return rescued
  }

  return {}
}

const MAX_RETRIES = 3

/**
 * Returns true for models that have native reasoning / chain-of-thought:
 *  - Anthropic claude-3-7-* and later  → extended thinking API
 *  - OpenAI o1 / o3 / o4 series        → reasoning_effort parameter
 *  - Groq deepseek-r1*                 → naturally emits <think> tags
 */
function isReasoningModel(provider: string, model: string): boolean {
  return isReasoningModelId(provider as AIProvider, model)
}

function parseRetryAfterMs(errorMessage: string, attempt = 0): number {
  return getRetryWaitMs(errorMessage, attempt)
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

interface AIResponse {
  content: string
  toolCalls?: Array<{
    id: string
    name: string
    arguments: Record<string, unknown>
  }>
}

export class AIService {
  private config: AIConfig
  private streamAbortController: AbortController | null = null

  constructor(config: AIConfig) {
    this.config = config
  }

  updateConfig(config: AIConfig) {
    this.config = config
  }

  /** Cancel an in-flight streaming chat request, if any. */
  abortStream(): void {
    this.streamAbortController?.abort()
  }

  private startStreamAbortScope(): AbortSignal {
    this.streamAbortController?.abort()
    this.streamAbortController = new AbortController()
    return this.streamAbortController.signal
  }

  private endStreamAbortScope(): void {
    this.streamAbortController = null
  }

  private isAbortError(error: unknown): boolean {
    return error instanceof Error && error.name === 'AbortError'
  }

  async chat(messages: Message[], tools?: ToolDefinition[]): Promise<AIResponse> {
    const { provider, apiKey, model } = this.config

    switch (provider) {
      case 'openai':
        return this.callOpenAI(apiKey, model || getDefaultModelId('openai', 'chat'), messages, tools)
      case 'anthropic':
        return this.callAnthropic(apiKey, model || getDefaultModelId('anthropic', 'chat'), messages, tools)
      case 'mistral':
        return this.callOpenAICompat(
          'https://api.mistral.ai/v1/chat/completions',
          apiKey,
          model || getDefaultModelId('mistral', 'chat'),
          messages,
          tools
        )
      case 'groq':
        return this.callGroq(apiKey, model || getDefaultModelId('groq', 'chat'), messages, tools)
      case 'moonshot':
        // Moonshot AI (Kimi) — OpenAI-compatible API
        return this.callOpenAICompat(
          'https://api.moonshot.ai/v1/chat/completions',
          apiKey,
          model || getDefaultModelId('moonshot', 'chat'),
          messages,
          tools
        )
      case 'deepseek':
        return this.callOpenAICompat(
          'https://api.deepseek.com/chat/completions',
          apiKey,
          model || getDefaultModelId('deepseek', 'reasoning'),
          messages,
          tools
        )
      default:
        throw new Error(`Unsupported AI provider: ${provider}`)
    }
  }

  /**
   * Streaming version of chat.
   * Calls onToken for each text delta as it arrives, then resolves with the full AIResponse.
   * Tool calls are accumulated from stream deltas and returned at the end.
   * If the response is tool calls only (no text), onToken is never called.
   */
  async chatStream(
    messages: Message[],
    tools: ToolDefinition[] | undefined,
    onToken: (token: string) => void,
    onProgress?: StreamProgressCallback,
  ): Promise<AIResponse> {
    const { provider, apiKey, model } = this.config
    switch (provider) {
      case 'openai':
        // o-series models don't support streaming tool calls well; use non-streaming
        if (isReasoningModel('openai', model || '')) {
          return this.callOpenAI(apiKey, model || getDefaultModelId('openai', 'reasoning'), messages, tools)
        }
        return this.streamOpenAI(apiKey, model || getDefaultModelId('openai', 'chat'), messages, tools, onToken, onProgress)
      case 'mistral':
        return this.streamOpenAICompat(
          'https://api.mistral.ai/v1/chat/completions',
          apiKey,
          model || getDefaultModelId('mistral', 'chat'),
          messages,
          tools,
          onToken,
          onProgress,
        )
      case 'groq':
        return this.streamGroq(apiKey, model || getDefaultModelId('groq', 'chat'), messages, tools, onToken, onProgress)
      case 'moonshot':
        return this.streamOpenAICompat(
          'https://api.moonshot.ai/v1/chat/completions',
          apiKey,
          model || getDefaultModelId('moonshot', 'chat'),
          messages,
          tools,
          onToken,
          onProgress,
        )
      case 'deepseek':
        return this.streamOpenAICompat(
          'https://api.deepseek.com/chat/completions',
          apiKey,
          model || getDefaultModelId('deepseek', 'reasoning'),
          messages,
          tools,
          onToken,
          onProgress,
        )
      case 'anthropic':
        return this.streamAnthropic(apiKey, model || getDefaultModelId('anthropic', 'chat'), messages, tools, onToken, onProgress)
      default:
        throw new Error(`Unsupported AI provider: ${provider}`)
    }
  }

  /** Shared SSE streaming logic for OpenAI-compatible APIs */
  private async streamOpenAICompat(
    url: string,
    apiKey: string,
    model: string,
    messages: Message[],
    tools: ToolDefinition[] | undefined,
    onToken: (token: string) => void,
    onProgress?: StreamProgressCallback,
  ): Promise<AIResponse> {
    const body: Record<string, unknown> = { model, messages, max_tokens: 8000, stream: true }
    if (tools && tools.length > 0) { body.tools = tools; body.tool_choice = 'auto' }

    let lastError: Error | null = null
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const signal = this.startStreamAbortScope()
      let contentAccum = ''
      const toolCallMap: Record<number, { id: string; name: string; arguments: string }> = {}
      const progressNotified = new Map<number, string>()

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal,
        })

        if (!response.ok) {
          let errMsg = `API error: ${response.status}`
          try {
            const errData = await response.json() as { error?: { message?: string } }
            errMsg = errData.error?.message || errMsg
          } catch { /* ignore */ }
          if (isRetryableAIError(errMsg) && attempt < MAX_RETRIES) {
            const waitMs = parseRetryAfterMs(errMsg, attempt) || (1000 * (attempt + 1))
            console.warn(`[AI/stream] Retryable error, retrying in ${waitMs}ms:`, errMsg)
            await sleep(waitMs); lastError = new Error(errMsg); continue
          }
          throw new Error(errMsg)
        }

        const reader = response.body!.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          if (signal.aborted) {
            await reader.cancel().catch(() => {})
            return { content: contentAccum, toolCalls: [] }
          }

          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? '' // keep incomplete last line

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const data = line.slice(6).trim()
            if (data === '[DONE]') break
            try {
              const chunk = JSON.parse(data)
              const delta = chunk.choices?.[0]?.delta
              if (!delta) continue

              // Text content
              if (delta.content) {
                contentAccum += delta.content
                onToken(delta.content)
              }

              // Tool call deltas
              if (delta.tool_calls) {
                for (const tc of delta.tool_calls) {
                  const idx = tc.index ?? 0
                  if (!toolCallMap[idx]) toolCallMap[idx] = { id: '', name: '', arguments: '' }
                  if (tc.id) toolCallMap[idx].id = tc.id
                  if (tc.function?.name) toolCallMap[idx].name += tc.function.name
                  if (tc.function?.arguments) toolCallMap[idx].arguments += tc.function.arguments
                }
                notifyToolDraftProgress(
                  Object.values(toolCallMap),
                  onProgress,
                  progressNotified,
                )
              }
            } catch { /* skip malformed chunk */ }
          }
        }

        const toolCalls = Object.values(toolCallMap)
          .filter(tc => tc.name)
          .map(tc => ({ id: tc.id || `tc-${Date.now()}`, name: tc.name, arguments: safeParseToolArgs(tc.arguments) }))

        return { content: contentAccum, toolCalls }
      } catch (e) {
        if (this.isAbortError(e) || signal.aborted) {
          return { content: contentAccum, toolCalls: [] }
        }
        lastError = e instanceof Error ? e : new Error(String(e))
        if (isRetryableAIError(lastError.message) && attempt < MAX_RETRIES) {
          const waitMs = parseRetryAfterMs(lastError.message, attempt) || (1000 * (attempt + 1))
          console.warn(`[AI/stream] Retryable error, retrying in ${waitMs}ms:`, lastError.message)
          await sleep(waitMs); continue
        }
        throw lastError
      } finally {
        this.endStreamAbortScope()
      }
    }
    throw lastError || new Error('Streaming failed after retries')
  }

  private streamOpenAI(
    apiKey: string,
    model: string,
    messages: Message[],
    tools: ToolDefinition[] | undefined,
    onToken: (t: string) => void,
    onProgress?: StreamProgressCallback,
  ) {
    return this.streamOpenAICompat('https://api.openai.com/v1/chat/completions', apiKey, model, messages, tools, onToken, onProgress)
  }

  private streamGroq(
    apiKey: string,
    model: string,
    messages: Message[],
    tools: ToolDefinition[] | undefined,
    onToken: (t: string) => void,
    onProgress?: StreamProgressCallback,
  ) {
    return this.streamOpenAICompat('https://api.groq.com/openai/v1/chat/completions', apiKey, model, messages, tools, onToken, onProgress)
  }

  /** Shared non-streaming logic for all OpenAI-compatible APIs */
  private async callOpenAICompat(
    url: string,
    apiKey: string,
    model: string,
    messages: Message[],
    tools?: ToolDefinition[]
  ): Promise<AIResponse> {
    const body: Record<string, unknown> = { model, messages, max_tokens: 8000 }
    if (tools && tools.length > 0) { body.tools = tools; body.tool_choice = 'auto' }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error((error as { error?: { message?: string } }).error?.message || `API error: ${response.status}`)
    }
    const data = await response.json()
    const choice = data.choices[0]
    if (choice.finish_reason === 'length') console.warn('[AI] Response truncated due to max_tokens')
    return {
      content: choice.message.content || '',
      toolCalls: choice.message.tool_calls?.map((tc: { id: string; function: { name: string; arguments: string } }) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: safeParseToolArgs(tc.function.arguments),
      })) || [],
    }
  }

  private async callOpenAI(
    apiKey: string,
    model: string,
    messages: Message[],
    tools?: ToolDefinition[]
  ): Promise<AIResponse> {
    if (!isReasoningModel('openai', model)) {
      return this.callOpenAICompat('https://api.openai.com/v1/chat/completions', apiKey, model, messages, tools)
    }

    // OpenAI o-series: reasoning_effort, max_completion_tokens, no temperature.
    // o1 doesn't support system messages — convert them to user messages.
    const isO1 = model.startsWith('o1')
    const preparedMessages = isO1
      ? messages.map(m => m.role === 'system' ? { ...m, role: 'user' as const } : m)
      : messages

    const body: Record<string, unknown> = {
      model,
      messages: preparedMessages,
      max_completion_tokens: 16000,
      reasoning_effort: 'high',
    }
    if (tools && tools.length > 0) { body.tools = tools; body.tool_choice = 'auto' }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error((error as { error?: { message?: string } }).error?.message || `OpenAI API error: ${response.status}`)
    }
    const data = await response.json()
    const choice = data.choices[0]
    return {
      content: choice.message.content || '',
      toolCalls: choice.message.tool_calls?.map((tc: { id: string; function: { name: string; arguments: string } }) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: safeParseToolArgs(tc.function.arguments),
      })) || [],
    }
  }

  private buildAnthropicBody(
    model: string,
    messages: Message[],
    tools?: ToolDefinition[],
    stream = false
  ): { body: Record<string, unknown>; headers: Record<string, string> } {
    const systemMessages = messages.filter(m => m.role === 'system')
    const systemMessage = systemMessages.map(m => m.content).join('\n\n')
    const chatMessages = messages.filter(m => m.role !== 'system')
    const useExtendedThinking = isReasoningModel('anthropic', model)

    const body: Record<string, unknown> = {
      model,
      // Extended thinking requires at least 16k max_tokens to give the model
      // room to reason; use 8k for regular models to keep costs reasonable.
      max_tokens: useExtendedThinking ? 16000 : 8000,
      system: systemMessage,
      messages: chatMessages,
    }

    if (stream) body.stream = true

    if (useExtendedThinking) {
      // budget_tokens: how many tokens the model may spend purely on reasoning
      // before composing its response. 10k is a good default for complex tasks.
      body.thinking = { type: 'enabled', budget_tokens: 10000 }
    }

    if (tools && tools.length > 0) {
      body.tools = tools.map(t => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters,
      }))
      body.tool_choice = { type: 'auto' }
    }

    const headers: Record<string, string> = {
      'x-api-key': '',          // filled by caller
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    }
    if (useExtendedThinking) {
      // Required beta header for interleaved thinking (thinking + tool_use mixed)
      headers['anthropic-beta'] = 'interleaved-thinking-2025-05-14'
    }

    return { body, headers }
  }

  private async callAnthropic(
    apiKey: string,
    model: string,
    messages: Message[],
    tools?: ToolDefinition[]
  ): Promise<AIResponse> {
    const { body, headers } = this.buildAnthropicBody(model, messages, tools)
    headers['x-api-key'] = apiKey

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error((error as { error?: { message?: string } }).error?.message || `Anthropic API error: ${response.status}`)
    }

    const data = await response.json()
    let content = ''
    const toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }> = []

    for (const block of (data.content as Array<{ type: string; text?: string; thinking?: string; id?: string; name?: string; input?: Record<string, unknown> }>)) {
      if (block.type === 'thinking' && block.thinking) {
        // Wrap native thinking tokens in <think> tags so the agent's streaming
        // parser renders them as a collapsible "Thought for Xs" block.
        content += `<think>${block.thinking}</think>`
      } else if (block.type === 'text' && block.text) {
        content += block.text
      } else if (block.type === 'tool_use') {
        toolCalls.push({ id: block.id!, name: block.name!, arguments: block.input! })
      }
    }

    return { content, toolCalls }
  }

  /**
   * Anthropic streaming using SSE.
   * Handles extended thinking blocks (type:'thinking') and regular text/tool_use.
   */
  private async streamAnthropic(
    apiKey: string,
    model: string,
    messages: Message[],
    tools: ToolDefinition[] | undefined,
    onToken: (token: string) => void,
    onProgress?: StreamProgressCallback,
  ): Promise<AIResponse> {
    const { body, headers } = this.buildAnthropicBody(model, messages, tools, true)
    headers['x-api-key'] = apiKey

    const signal = this.startStreamAbortScope()
    let contentAccum = ''

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal,
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error((error as { error?: { message?: string } }).error?.message || `Anthropic API error: ${response.status}`)
      }

      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      // Track current content block type so we know how to route deltas
      type BlockType = 'text' | 'thinking' | 'tool_use' | null
      let currentBlockType: BlockType = null
      const toolCallMap: Record<number, { id: string; name: string; input: string }> = {}
      const progressNotified = new Map<number, string>()
      let currentToolIdx = -1

      while (true) {
        if (signal.aborted) {
          await reader.cancel().catch(() => {})
          return { content: contentAccum, toolCalls: [] }
        }

        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (raw === '[DONE]') break
          let evt: Record<string, unknown>
          try { evt = JSON.parse(raw) } catch { continue }

          const type = evt.type as string

          if (type === 'content_block_start') {
            const blk = (evt.content_block as { type: string; id?: string; name?: string }) || {}
            currentBlockType = blk.type as BlockType
            if (blk.type === 'thinking') {
              onToken('<think>')
              contentAccum += '<think>'
            } else if (blk.type === 'tool_use') {
              currentToolIdx++
              toolCallMap[currentToolIdx] = { id: blk.id || '', name: blk.name || '', input: '' }
              notifyToolDraftProgress(
                Object.values(toolCallMap).map(tc => ({ name: tc.name, arguments: tc.input })),
                onProgress,
                progressNotified,
              )
            }
          } else if (type === 'content_block_delta') {
            const delta = (evt.delta as { type: string; text?: string; thinking?: string; partial_json?: string }) || {}
            if (currentBlockType === 'thinking' && delta.thinking) {
              onToken(delta.thinking)
              contentAccum += delta.thinking
            } else if (currentBlockType === 'text' && delta.text) {
              onToken(delta.text)
              contentAccum += delta.text
            } else if (currentBlockType === 'tool_use' && delta.partial_json) {
              if (toolCallMap[currentToolIdx]) toolCallMap[currentToolIdx].input += delta.partial_json
              notifyToolDraftProgress(
                Object.values(toolCallMap).map(tc => ({ name: tc.name, arguments: tc.input })),
                onProgress,
                progressNotified,
              )
            }
          } else if (type === 'content_block_stop') {
            if (currentBlockType === 'thinking') {
              onToken('</think>')
              contentAccum += '</think>'
            }
            currentBlockType = null
          }
        }
      }

      const toolCalls = Object.values(toolCallMap)
        .filter(tc => tc.name)
        .map(tc => ({
          id: tc.id || `tc-${Date.now()}`,
          name: tc.name,
          arguments: safeParseToolArgs(tc.input),
        }))

      return { content: contentAccum, toolCalls }
    } catch (error) {
      if (this.isAbortError(error) || signal.aborted) {
        return { content: contentAccum, toolCalls: [] }
      }
      throw error
    } finally {
      this.endStreamAbortScope()
    }
  }

  private async callGroq(
    apiKey: string,
    model: string,
    messages: Message[],
    tools?: ToolDefinition[]
  ): Promise<AIResponse> {
    const body: Record<string, unknown> = {
      model,
      messages,
      max_tokens: 8000,
    }

    if (tools && tools.length > 0) {
      body.tools = tools
      body.tool_choice = 'auto'
    }

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error?.message || `Groq API error: ${response.status}`)
    }

    const data = await response.json()
    const choice = data.choices[0]

    if (choice.finish_reason === 'length') {
      console.warn('[AI/Groq] Response truncated due to max_tokens limit')
    }

    return {
      content: choice.message.content || '',
      toolCalls: choice.message.tool_calls?.map((tc: { id: string; function: { name: string; arguments: string } }) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: safeParseToolArgs(tc.function.arguments),
      })) || [],
    }
  }
}
