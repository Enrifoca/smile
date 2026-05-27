import { v4 as uuidv4 } from 'uuid'
import { Message, PendingAction, ToolEntry, UserProfile } from './types'
import { AIResponse, AgentConfig } from './config'
import { shouldAdmitSourceLeaf } from '../memory/sourceAdmission'
import { buildDefaultWriteSourceLeaf } from '../memory/sourceLeaf'
import { getSystemPrompt } from './prompts'
import { toolDefinitions } from './tools'
import { ConnectorRuntime, ownsTool, ToolDefinition } from '../connectors/types'
import { shouldNudgeActionFirst } from './actionGuards'
import { zodToJsonSchema } from './jsonSchema'
import { formatScratchpadNote, getCoreScratchpadNote } from './scratchpad'
import { getCoreToolEntry } from './toolEntries'
import { formatCoreToolResultForAI } from './toolResults'
import { isFailedToolResult } from './toolErrors'
import {
  buildIncompleteWorkflowNudge,
  formatTurnIntentForScratchpad,
  inferTurnIntent,
  shouldNudgeIncompleteWorkflow,
  type TurnIntent,
  type ToolRunRecord,
} from './taskContinuity'
import { compressToolResult } from './compression'
import type { MarkdownArtifact } from './artifacts'
import type { AIStreamProgressEvent } from '../shared/streamProgress'
import { formatAgentErrorMessage, isRetryableAIError } from '../shared/aiErrors'

const THINK_OPEN = '<think>'
const THINK_CLOSE = '</think>'
const THINK_BLOCK_REGEX = new RegExp(`${THINK_OPEN}[\\s\\S]*?${THINK_CLOSE.replace('/', '\\/')}`, 'gi')

// Re-export types and utilities
export * from './types'
export * from './tools'
export * from './prompts'

/**
 * smile:D Agent Runtime
 * 
 * Handles conversation flow, tool execution, and response formatting.
 * Connector tool results are sent back to AI for formatting.
 */
export class Agent {
  private config: AgentConfig
  private conversationHistory: Message[] = []
  private pendingActions: Map<string, PendingAction> = new Map()
  // Deduplication cache: maps "toolName:JSON(args)" → formatted result string.
  // Cleared at the start of each processMessage call. Write operations trigger
  // targeted invalidation so read-after-write always returns fresh data.
  private toolResultCache = new Map<string, string>()
  // Manus-style session scratchpad: a running text note block injected into
  // every system prompt. Auto-populated after file/search tool calls; also
  // writable by the agent via the scratchpad_write tool. Cleared each turn.
  private sessionScratchpad = ''
  // Set to true by abort() to stop the agent loop after the current iteration.
  private abortFlag = false
  // Planning gate: tracks whether the agent has written at least one
  // scratchpad entry this turn before calling a write/create tool.
  // Reset each processMessage call.
  private scratchpadWrittenThisTurn = false
  private scratchpadToolWrittenThisTurn = false
  // Prevents action requests from turning into long prose instead of tool calls.
  // Reset each processMessage call; used at most once to avoid loops.
  private actionFirstNudgedThisTurn = false
  private taskContinuationNudgedThisTurn = false
  private turnIntent: TurnIntent = { kind: 'general', summary: '' }
  private toolsRunThisTurn: ToolRunRecord[] = []

  private setAgentStatus(status: string | null): void {
    this.config.onAgentStatus?.(status)
  }

  private handleStreamProgress(event: AIStreamProgressEvent): void {
    if (event.toolName === 'report_write') {
      this.setAgentStatus(
        event.title ? `Drafting report: ${event.title}…` : 'Drafting markdown report…',
      )
      return
    }

    const entry = this.getToolEntry(event.toolName, event.title ? { title: event.title } : {})
    this.setAgentStatus(`Preparing: ${entry.label}…`)
  }

  private getLikelyReportDraftStatus(): string | null {
    const lastUser = [...this.conversationHistory]
      .reverse()
      .find(message => message.role === 'user' && !message.content.startsWith('[SYSTEM]'))

    if (!lastUser) return null

    const text = lastUser.content.toLowerCase()
    if (/\b(report|markdown|\.md|plan|spec|batch|summary|piano|rapporto)\b/.test(text)) {
      return 'Drafting markdown report…'
    }

    return null
  }

  /** What to show while waiting for the model between loop steps (not during tool execution). */
  private getStatusBeforeModelCall(useReasoning: boolean): string {
    const reportHint = this.getLikelyReportDraftStatus()
    if (reportHint) return reportHint

    if (useReasoning) return 'Reasoning about next step…'

    const lastToolResult = [...this.conversationHistory]
      .reverse()
      .find(message => message.content.startsWith('[tool_result:'))

    if (!lastToolResult) return 'Working on your request…'

    const toolName = lastToolResult.content.match(/\[tool_result:\s*([^\]\s]+)/i)?.[1] || ''
    if (toolName === 'report_write') return 'Summarizing report…'
    if (toolName.startsWith('file_read') || toolName === 'file_read_ocr') {
      return 'Analyzing file contents…'
    }
    if (toolName.startsWith('file_')) return 'Analyzing workspace results…'
    if (toolName.startsWith('memory_')) return 'Analyzing memory…'
    if (this.getConnectorForTool(toolName)) {
      return 'Analyzing connector data…'
    }
    return 'Analyzing results…'
  }

  constructor(config: AgentConfig) {
    this.config = config
  }

  updateUserProfile(profile: UserProfile | null): void {
    this.config.userProfile = profile
  }

  private getConnectorForTool(toolName: string): ConnectorRuntime | undefined {
    return this.config.connectors?.find(connector => ownsTool(connector.definition, toolName))
  }

  private getAllToolDefinitions(): ToolDefinition[] {
    return [
      ...toolDefinitions,
      ...(this.config.connectors || []).flatMap(connector => connector.definition.tools),
    ]
  }

  private getToolDefinition(toolName: string): ToolDefinition | undefined {
    return this.getAllToolDefinitions().find(tool => tool.name === toolName)
  }

  private requiresConfirmation(toolName: string): boolean {
    const tool = this.getToolDefinition(toolName)
    if (!tool?.requiresConfirmation) return false

    const isConnectorWrite = tool.category === 'connector-write' || tool.category === 'connector-attachment'
    if (isConnectorWrite && this.config.userProfile?.confirmAllConnectorActions === false) {
      return false
    }

    return true
  }

  private getToolEntry(name: string, args: Record<string, unknown>): ToolEntry {
    const connectorEntry = this.getConnectorForTool(name)?.definition.getToolEntry?.(name, args)
    return connectorEntry || getCoreToolEntry(name, args)
  }

  private getConnectorPromptSections(): string[] {
    return (this.config.connectors || [])
      .map(connector => connector.definition.getPromptSection?.(connector.context) || '')
      .filter(Boolean)
  }

  /** Stop the agent after the current iteration completes. */
  abort(): void {
    this.abortFlag = true
  }

  async processMessage(userMessage: string): Promise<void> {
    this.abortFlag = false
    this.toolResultCache.clear()
    this.sessionScratchpad = ''
    this.scratchpadWrittenThisTurn = false
    this.scratchpadToolWrittenThisTurn = false
    this.actionFirstNudgedThisTurn = false
    this.taskContinuationNudgedThisTurn = false
    this.toolsRunThisTurn = []
    this.turnIntent = inferTurnIntent(userMessage)
    const intentNote = formatTurnIntentForScratchpad(this.turnIntent)
    if (intentNote) {
      this.sessionScratchpad = formatScratchpadNote(intentNote)
      this.scratchpadWrittenThisTurn = true
    }
    const userMsg: Message = {
      id: uuidv4(),
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString(),
    }
    this.conversationHistory.push(userMsg)
    this.config.onMessage(userMsg)

    if (this.config.loadMemory) {
      try {
        this.config.memory = await this.config.loadMemory()
      } catch (error) {
        console.warn('[Agent] Failed to refresh memory before turn:', error)
      }
    }

    try {
      await this.runAgentLoop()
    } catch (error) {
      const errorMsg: Message = {
        id: uuidv4(),
        role: 'assistant',
        content: formatAgentErrorMessage(error),
        timestamp: new Date().toISOString(),
      }
      this.conversationHistory.push(errorMsg)
      this.config.onMessage(errorMsg)
    }
  }

  private async runAgentLoop(): Promise<void> {
    let iterations = 0
    const maxIterations = this.config.maxIterations ?? 10
    const hasLimit = maxIterations > 0
    let consecutiveErrors = 0
    const maxConsecutiveErrors = 2

    try {
    while (!hasLimit || iterations < maxIterations) {
      // Check abort flag at the top of every iteration
      if (this.abortFlag) {
        this.abortFlag = false
        console.log('[Agent] Aborted by user.')
        break
      }

      iterations++
      console.log(`[Agent] Loop iteration ${iterations}${hasLimit ? `/${maxIterations}` : ''}`)

      const { response, wasStreamed, assistantPreamble } = await this.callAI()
      if (!response) throw new Error('No response from AI')

      if (response.toolCalls && response.toolCalls.length > 0) {
        let hadError = false
        const toolEntries: ToolEntry[] = []

        for (const toolCall of response.toolCalls) {
          console.log('[Agent] Tool call:', toolCall.name, toolCall.arguments)
          this.toolsRunThisTurn.push({
            name: toolCall.name,
            category: this.getToolDefinition(toolCall.name)?.category,
          })
          const toolEntry = this.getToolEntry(toolCall.name, toolCall.arguments)
          if (toolCall.name === 'report_write') {
            const title = String(toolCall.arguments.title || '').trim()
            this.setAgentStatus(title ? `Saving report: ${title}…` : 'Saving report…')
          } else {
            this.setAgentStatus(`Running: ${toolEntry.label}…`)
          }

          if (!this.scratchpadWrittenThisTurn) {
            const plannedNote = this.getConnectorForTool(toolCall.name)?.definition.getScratchpadNote?.(toolCall.name, toolCall.arguments, '')
            if (plannedNote) {
              this.sessionScratchpad += (this.sessionScratchpad ? '\n' : '') + plannedNote
              this.scratchpadWrittenThisTurn = true
            }
          }

          if (this.requiresConfirmation(toolCall.name)) {
            const confirmation = this.getActionConfirmation(toolCall.name, toolCall.arguments)
            const pendingAction: PendingAction = {
              id: toolCall.id,
              type: toolCall.name as PendingAction['type'],
              description: confirmation?.description || this.getActionConfirmationPrompt(toolCall.name, toolCall.arguments),
              data: toolCall.arguments,
              preview: confirmation?.preview || this.getActionPreview(toolCall.name, toolCall.arguments),
              confirmation,
            }
            this.pendingActions.set(toolCall.id, pendingAction)
            this.config.onPendingAction(pendingAction)
            this.emitPendingActionChatMessage(
              pendingAction,
              assistantPreamble,
              response.content,
            )
            this.setAgentStatus(null)
            return
          }

          // Deduplication: if the exact same tool+args was called earlier this
          // turn, return the cached result instead of re-executing. This prevents
          // the agent from reading the same file or running the same search twice.
          const cacheKey = `${toolCall.name}:${JSON.stringify(toolCall.arguments)}`
          const cached = this.toolResultCache.get(cacheKey)
          let formattedResult: string
          let isFromCache = false

          if (cached !== undefined) {
            formattedResult = cached
            isFromCache = true
            console.log(`[Agent] Cache hit — skipping re-execution of ${toolCall.name}`)
          } else {
            const result = await this.executeTool(toolCall.name, toolCall.arguments)
            formattedResult = this.formatToolResultForAI(toolCall.name, result, toolCall.arguments)

            const isError = isFailedToolResult(result, formattedResult)
            if (isError) {
              hadError = true
              console.log('[Agent] Tool error:', formattedResult.substring(0, 200))
            } else {
              // Only cache and post-process successful results
              this.toolResultCache.set(cacheKey, formattedResult)
              // Invalidate stale reads after write operations
              this.invalidateCacheAfterWrite(toolCall.name, toolCall.arguments)
              // Auto-populate scratchpad with a note about what was done
              this.updateScratchpadAfterTool(toolCall.name, toolCall.arguments, formattedResult)
              void this.persistSourceMemoryAfterWrite(toolCall.name, toolCall.arguments, formattedResult)
              if (toolCall.name === 'report_write' && !isFromCache) {
                this.emitArtifactMessageFromResult(toolCall.name, toolCall.arguments, result)
              }
            }
          }

          // Record tool entry for the summary block (UI only — not in history)
          toolEntries.push(toolEntry)

          // Add result to history so AI has the data next iteration.
          // Prefix with [tool_result:] (lowercase, colon) so the AI sees it as
          // structured system data, not an example of its own response format.
          this.conversationHistory.push({
            id: uuidv4(),
            role: 'assistant',
            content: `[tool_result: ${toolCall.name}]${isFromCache ? ' [cached]' : ''}\n${formattedResult}`,
            timestamp: new Date().toISOString(),
          })
        }

        // Emit a persistent tool-summary block (UI only — not in history)
        if (toolEntries.length > 0) {
          this.config.onMessage({
            id: uuidv4(),
            role: 'assistant',
            content: '',
            timestamp: new Date().toISOString(),
            type: 'tool_summary',
            toolEntries,
          })
        }

        if (hadError) {
          consecutiveErrors++
          if (consecutiveErrors >= maxConsecutiveErrors) {
            const { response: errResp, wasStreamed: errStreamed } = await this.callAI()
            if (errResp?.content && !errStreamed) {
              this.conversationHistory.push({ id: uuidv4(), role: 'assistant', content: errResp.content, timestamp: new Date().toISOString() })
              this.config.onMessage({ id: uuidv4(), role: 'assistant', content: errResp.content, timestamp: new Date().toISOString() })
            } else if (!errStreamed) {
              const fallback = 'I encountered repeated errors. Please check the configuration or rephrase your request.'
              this.conversationHistory.push({ id: uuidv4(), role: 'assistant', content: fallback, timestamp: new Date().toISOString() })
              this.config.onMessage({ id: uuidv4(), role: 'assistant', content: fallback, timestamp: new Date().toISOString() })
            }
            return
          }
        } else {
          consecutiveErrors = 0
        }
        continue
      }

      // No tool calls — check for a meaningful final response.
      // Strip any <think>...</think> blocks that were already shown as
      // collapsible thinking messages; they should not appear as regular text.
      const rawContent = response.content?.trim() || ''
      const strippedContent = rawContent.replace(THINK_BLOCK_REGEX, '').trim()

      if (
        !wasStreamed &&
        /^\[tool_result:/i.test(strippedContent) &&
        iterations < (hasLimit ? maxIterations : iterations + 1)
      ) {
        console.log('[Agent] Raw tool result echoed — nudging model to use the result')
        this.conversationHistory.push({
          id: uuidv4(),
          role: 'user',
          content: '[SYSTEM] You repeated a raw tool result. Do not show tool_result blocks to the user. Use the tool result as source material and complete the user request. If the user asked for an action and the required information is present, call the appropriate tool now.',
          timestamp: new Date().toISOString(),
        })
        continue
      }

      if (
        !wasStreamed &&
        strippedContent &&
        !this.actionFirstNudgedThisTurn &&
        this.shouldNudgeActionFirst(strippedContent)
      ) {
        console.log('[Agent] Action-first guard triggered — nudging model to use tools')
        this.actionFirstNudgedThisTurn = true
        this.conversationHistory.push({
          id: uuidv4(),
          role: 'user',
          content: '[SYSTEM] Action-first guard: The user asked for an actionable operation. Do not answer with a long plan or task list. If required information is present, call the appropriate tool now. If exactly one critical detail is missing, ask one focused question only.',
          timestamp: new Date().toISOString(),
        })
        continue
      }

      if (
        !this.taskContinuationNudgedThisTurn &&
        shouldNudgeIncompleteWorkflow(this.turnIntent, this.toolsRunThisTurn, strippedContent || rawContent)
      ) {
        console.log('[Agent] Incomplete workflow — nudging model to finish read→write task')
        this.taskContinuationNudgedThisTurn = true
        this.conversationHistory.push({
          id: uuidv4(),
          role: 'user',
          content: buildIncompleteWorkflowNudge(this.turnIntent),
          timestamp: new Date().toISOString(),
        })
        continue
      }

      if (!wasStreamed && strippedContent) {
        const assistantMsg: Message = { id: uuidv4(), role: 'assistant', content: strippedContent, timestamp: new Date().toISOString() }
        this.conversationHistory.push(assistantMsg)
        this.config.onMessage(assistantMsg)
      } else if (wasStreamed) {
        // Already displayed via streaming — nothing to do
      } else if (!strippedContent && iterations < (hasLimit ? maxIterations : iterations + 1)) {
        // The model only produced thinking content and no actual response or
        // tool calls. Nudge it to continue so the agent doesn't silently stop.
        console.log('[Agent] Think-only response — nudging model to continue')
        this.conversationHistory.push({
          id: uuidv4(),
          role: 'user',
          content: '[System: Your thinking was shown to the user. Now proceed with the next step — call the appropriate tool or give your final answer.]',
          timestamp: new Date().toISOString(),
        })
        continue
      }
      break
    }

    if (hasLimit && iterations >= maxIterations) {
      const timeoutMsg: Message = {
        id: uuidv4(), role: 'assistant',
        content: `I've reached the iteration limit (${maxIterations}). You can increase this in Settings → Agent Behavior.`,
        timestamp: new Date().toISOString(),
      }
      this.conversationHistory.push(timeoutMsg)
      this.config.onMessage(timeoutMsg)
    }
    } finally {
      this.setAgentStatus(null)
    }
  }

  /**
   * Call the AI.
   * Handles streaming with a live <think>...</think> parser:
   *  - content inside <think>...</think> → emitted as a type:'thinking' message with elapsed time
   *  - content outside → streamed normally to the response bubble
   * Returns wasStreamed=true when the response was already pushed to UI and history.
   */
  private async callAI(): Promise<{ response: AIResponse | null; wasStreamed: boolean; assistantPreamble?: string }> {
    // Append the live session scratchpad to the system prompt so the agent
    // always knows what it has already done this turn — even if old tool result
    // messages have been pushed out of the 40-message context window.
    const intentSection = this.turnIntent.kind !== 'general' && this.turnIntent.summary
      ? `\n\n## User Goal This Turn\n${this.turnIntent.summary}\n\nDo not stop after read-only steps if a write is still required.`
      : ''
    const scratchpadSection = this.sessionScratchpad
      ? `\n\n## Session Scratchpad — What You've Done This Turn\n${this.sessionScratchpad}\n\nDo NOT re-read files or re-run searches that are already listed above. Use their results from context.`
      : ''
    const systemPrompt = getSystemPrompt(
      this.config.userProfile,
      this.getConnectorPromptSections(),
      this.config.memory,
      undefined,
      this.config.monitoredScopes || [],
    ) + intentSection + scratchpadSection

    // Simple chronological window — last 40 messages in order.
    // tool_summary messages are UI-only artifacts (grouped icons bar) and carry
    // no reasoning value, so they are excluded from what the model sees.
    const relevantHistory = this.conversationHistory
      .filter(m => m.type !== 'tool_summary' && m.type !== 'artifact')
      .slice(-40)

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
      ...relevantHistory.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ]

    const tools = this.getAllToolDefinitions().map(tool => ({
      type: 'function' as const,
      function: { name: tool.name, description: tool.description, parameters: zodToJsonSchema(tool.schema) },
    }))

    // ── Choose model ──────────────────────────────────────────────────────────
    // Use the reasoning model for the INITIAL analysis phase — before the agent
    // has committed a plan to the scratchpad. Once planning is done and the
    // scratchpad has content, switch back to the main model for execution
    // (tool calls, connector writes, etc.) so we don't add latency to routine steps.
    // If no reasoning model is configured, the main model handles everything.
    const useReasoning = !this.scratchpadWrittenThisTurn && (
      !!this.config.callAIReasoningStream || !!this.config.callAIReasoning
    )
    const effectiveCallAIStream = (useReasoning && this.config.callAIReasoningStream)
      ? this.config.callAIReasoningStream
      : this.config.callAIStream
    const effectiveCallAI = (useReasoning && this.config.callAIReasoning)
      ? this.config.callAIReasoning
      : this.config.callAI

    this.setAgentStatus(this.getStatusBeforeModelCall(useReasoning))

    // ── Streaming path ────────────────────────────────────────────────────────
    if (effectiveCallAIStream && this.config.onUpdateMessage) {
      const THINK_OPEN_TAG = THINK_OPEN
      const THINK_CLOSE_TAG = THINK_CLOSE

      // Robust parser: buffer until we either confirm a <think> block or rule it out.
      // Handles leading whitespace (e.g. "\n<think>") correctly.
      // Thinking content is shown all-at-once when </think> arrives (not streamed char by char).
      let buffer = ''                    // raw accumulated text
      type Phase = 'scan' | 'in_think' | 'response'
      let phase: Phase = 'scan'
      let thinkTimerStart = 0
      const responseMsgId = uuidv4()
      let responseStarted = false
      let responseContent = ''

      const emitThinkingBlock = (content: string, ms: number) => {
        this.config.onMessage({
          id: uuidv4(),
          role: 'assistant',
          content: content.trim(),
          timestamp: new Date().toISOString(),
          type: 'thinking',
          thinkingMs: ms,
          isStreaming: false,
        })
      }

      const flushToResponse = (text: string) => {
        if (!text) return
        if (!responseStarted) {
          this.setAgentStatus('Writing response…')
        }
        responseContent += text
        if (!responseStarted) {
          responseStarted = true
          this.config.onMessage({ id: responseMsgId, role: 'assistant', content: text, timestamp: new Date().toISOString(), isStreaming: true })
        } else {
          this.config.onUpdateMessage!(responseMsgId, text, true)
        }
      }

      const onToken = (token: string) => {
        buffer += token

        if (phase === 'scan') {
          // Strip leading whitespace to find out if this starts with <think>
          const trimmed = buffer.trimStart()
          if (trimmed.startsWith(THINK_OPEN_TAG)) {
            // Confirmed: this response opens with <think>
            phase = 'in_think'
            thinkTimerStart = Date.now()
            this.setAgentStatus('Thinking…')
            // The content so far (after <think>) goes into the think buffer
            buffer = trimmed.slice(THINK_OPEN_TAG.length)
            return
          }
          // If the trimmed buffer is longer than THINK_OPEN and doesn't start with it
          // → this is a direct response, switch to streaming mode
          if (trimmed.length > THINK_OPEN_TAG.length && !THINK_OPEN_TAG.startsWith(trimmed.slice(0, THINK_OPEN_TAG.length))) {
            phase = 'response'
            flushToResponse(buffer)
            buffer = ''
            return
          }
          // Might still be a prefix of <think> or just whitespace — keep scanning
          return
        }

        if (phase === 'in_think') {
          if (buffer.includes(THINK_CLOSE_TAG)) {
            const closeIdx = buffer.indexOf(THINK_CLOSE_TAG)
            const thinkContent = buffer.slice(0, closeIdx)
            const afterThink = buffer.slice(closeIdx + THINK_CLOSE_TAG.length)
            emitThinkingBlock(thinkContent, Date.now() - thinkTimerStart)
            phase = 'response'
            buffer = ''
            if (afterThink.trim()) flushToResponse(afterThink)
          }
          // else: keep buffering thinking content
          return
        }

        // response phase — stream normally
        flushToResponse(token)
        buffer = ''
      }

      let result = await effectiveCallAIStream(messages, tools, onToken, event => this.handleStreamProgress(event))
      if (
        !result.success
        && useReasoning
        && this.config.callAIStream
        && isRetryableAIError(result.error || '')
      ) {
        console.warn('[Agent] Reasoning model unavailable, falling back to chat model:', result.error)
        this.setAgentStatus('Reasoning model busy — using chat model…')
        result = await this.config.callAIStream(messages, tools, onToken, event => this.handleStreamProgress(event))
      }
      if (!result.success) throw new Error(result.error || 'AI request failed')
      const response = result.data || null

      // Flush anything remaining in the buffer
      const endPhase: string = phase
      if (buffer.trim()) {
        if (endPhase === 'in_think') {
          // Stream ended mid-think — emit what we have as a thinking block
          emitThinkingBlock(buffer, Date.now() - thinkTimerStart)
        } else {
          flushToResponse(buffer)
        }
      }

      if (response) {
        if (response.toolCalls && response.toolCalls.length > 0) {
          const firstTool = response.toolCalls[0]
          const firstEntry = this.getToolEntry(firstTool.name, firstTool.arguments)
          if (firstTool.name === 'report_write') {
            const title = String(firstTool.arguments.title || '').trim()
            this.setAgentStatus(title ? `Saving report: ${title}…` : 'Saving report…')
          } else {
            this.setAgentStatus(
              response.toolCalls.length > 1
                ? `Preparing ${response.toolCalls.length} actions…`
                : `Preparing: ${firstEntry.label}…`,
            )
          }

          let assistantPreamble: string | undefined
          if (responseStarted && responseContent.trim()) {
            const finalContent = responseContent.trim()
            this.config.onUpdateMessage!(responseMsgId, finalContent, false)
            const preambleMsg: Message = {
              id: responseMsgId,
              role: 'assistant',
              content: finalContent,
              timestamp: new Date().toISOString(),
            }
            this.conversationHistory.push(preambleMsg)
            assistantPreamble = finalContent
          } else if (responseStarted) {
            this.config.onUpdateMessage!(responseMsgId, '', false)
          } else if (response.content?.trim()) {
            assistantPreamble = response.content.trim()
          }
          return { response, wasStreamed: false, assistantPreamble }
        } else {
          // Final text response — set the clean final content and push to history
          if (responseStarted) {
            const finalContent = responseContent.trim() || response.content?.trim() || ''
            if (finalContent) {
              if (/^\[tool_result:/i.test(finalContent)) {
                this.config.onUpdateMessage!(responseMsgId, '', false)
                response.content = finalContent
                return { response, wasStreamed: false }
              }
              this.config.onUpdateMessage!(responseMsgId, finalContent, false)
              this.conversationHistory.push({ id: responseMsgId, role: 'assistant', content: finalContent, timestamp: new Date().toISOString() })
              return { response, wasStreamed: true }
            } else {
              // Empty response — remove the placeholder
              this.config.onUpdateMessage!(responseMsgId, '', false)
            }
          }
        }
      }
      return { response, wasStreamed: false }
    }

    // ── Fallback: non-streaming ───────────────────────────────────────────────
    let result = await effectiveCallAI(messages, tools)
    if (
      !result.success
      && useReasoning
      && isRetryableAIError(result.error || '')
    ) {
      console.warn('[Agent] Reasoning model unavailable, falling back to chat model:', result.error)
      this.setAgentStatus('Reasoning model busy — using chat model…')
      result = await this.config.callAI(messages, tools)
    }
    if (!result.success) throw new Error(result.error || 'AI request failed')
    const response = result.data || null

    // Extract all <think>...</think> blocks from non-streaming responses,
    // emit each as a collapsible thinking message, and strip them from content.
    if (response?.content) {
      let match: RegExpExecArray | null
      const thinkRegex = new RegExp(`${THINK_OPEN}([\\s\\S]*?)${THINK_CLOSE.replace('/', '\\/')}`, 'gi')
      while ((match = thinkRegex.exec(response.content)) !== null) {
        const thinkContent = match[1].trim()
        if (thinkContent) {
          this.config.onMessage({ id: uuidv4(), role: 'assistant', content: thinkContent, timestamp: new Date().toISOString(), type: 'thinking', thinkingMs: 0 })
        }
      }
      response.content = response.content.replace(THINK_BLOCK_REGEX, '').trim()
    }

    return { response, wasStreamed: false, assistantPreamble: response?.content?.trim() || undefined }
  }

  private emitPendingActionChatMessage(
    pendingAction: PendingAction,
    assistantPreamble?: string,
    responseContent?: string,
  ): void {
    const content = this.composePendingActionChatContent(pendingAction, assistantPreamble, responseContent)
    const lastMsg = this.conversationHistory[this.conversationHistory.length - 1]
    if (lastMsg?.role === 'assistant' && lastMsg.content === content) return

    const msg: Message = {
      id: uuidv4(),
      role: 'assistant',
      content,
      timestamp: new Date().toISOString(),
    }
    this.conversationHistory.push(msg)
    this.config.onMessage(msg)
  }

  private composePendingActionChatContent(
    pendingAction: PendingAction,
    assistantPreamble?: string,
    responseContent?: string,
  ): string {
    const structured = this.buildPendingActionChatFallback(pendingAction)
    const modelText = (assistantPreamble || responseContent || '').trim()

    if (!modelText) return structured

    const title = pendingAction.confirmation?.title
    const preview = pendingAction.confirmation?.preview || pendingAction.preview
    const itemCount = pendingAction.confirmation?.items?.length || 0
    const numberedLines = modelText.match(/^\d+\./gm)
    if (itemCount > 0 && numberedLines && numberedLines.length >= Math.min(itemCount, 2)) {
      return modelText
    }

    const includesStructured =
      (title && modelText.includes(title))
      || (preview && modelText.includes(preview))
      || modelText.includes(structured.split('\n')[0])

    if (includesStructured && modelText.length >= 60) return modelText

    return `${modelText}\n\n${structured}`
  }

  private buildPendingActionChatFallback(pendingAction: PendingAction): string {
    const confirmation = pendingAction.confirmation
    const parts: string[] = []

    if (confirmation?.title) {
      parts.push(`**${confirmation.title}**`)
    }
    if (confirmation?.preview) {
      parts.push(confirmation.preview)
    }
    if (confirmation?.description) {
      parts.push(confirmation.description)
    }

    const prompt = this.getActionConfirmationPrompt(pendingAction.type, pendingAction.data)
    const skipPromptList = confirmation?.items?.length
      && pendingAction.type === 'jira_batch_create_issues'
    if (prompt && prompt !== `Action: ${pendingAction.type}` && !skipPromptList) {
      parts.push(prompt)
    }

    if (confirmation?.fields?.length) {
      parts.push(
        confirmation.fields.map(field => `- **${field.label}:** ${field.value}`).join('\n'),
      )
    }

    if (confirmation?.items?.length) {
      parts.push(
        confirmation.items.map((item, index) => {
          const badge = item.badge ? `[${item.badge}] ` : ''
          const subtitle = item.subtitle ? ` (${item.subtitle})` : ''
          return `${index + 1}. ${badge}${item.title}${subtitle}`
        }).join('\n'),
      )
    }

    const criteria = confirmation?.acceptanceCriteria
    if (criteria?.length) {
      parts.push(criteria.map(item => `- ${item}`).join('\n'))
    }

    return parts.filter(Boolean).join('\n\n').trim() || pendingAction.description
  }

  private emitArtifactMessageFromResult(
    toolName: string,
    _args: Record<string, unknown>,
    result: unknown,
  ): void {
    if (toolName !== 'report_write') return
    const data = result as { success?: boolean; path?: string; title?: string; error?: string }
    if (!data.success || !data.path || !data.title) return

    this.emitArtifactMessage({ path: data.path, title: data.title })
  }

  private emitArtifactMessage(artifact: MarkdownArtifact): void {
    this.config.onMessage({
      id: uuidv4(),
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      type: 'artifact',
      artifact,
    })
  }

  /**
   * Execute a tool
   */
  /**
   * After a successful write tool, invalidate stale read-cache entries so that
   * the next read call fetches fresh data rather than returning a cached snapshot.
   */
  private invalidateCacheAfterWrite(toolName: string, args: Record<string, unknown>): void {
    const connector = this.getConnectorForTool(toolName)
    const keysToDelete = connector?.definition.invalidateCacheAfterWrite?.(
      toolName,
      args,
      [...this.toolResultCache.keys()]
    ) || []
    for (const key of keysToDelete) {
      this.toolResultCache.delete(key)
    }
    // file_write → drop cached read for that exact path
    if (toolName === 'file_write' || toolName === 'report_write') {
      const writtenPath = (args.path as string) || ''
      for (const key of this.toolResultCache.keys()) {
        if (key.startsWith('file_read:') && key.includes(writtenPath)) {
          this.toolResultCache.delete(key)
        }
      }
    }
  }

  /**
   * Auto-append a one-liner to the session scratchpad after key tool results.
   * This ensures the agent always "knows" what it has already done even when
   * old tool result messages are pushed out of the 40-message context window.
   */
  private updateScratchpadAfterTool(toolName: string, args: Record<string, unknown>, formattedResult: string): void {
    let note = getCoreScratchpadNote(toolName, args, formattedResult)
    note = note || this.getConnectorForTool(toolName)?.definition.getScratchpadNote?.(toolName, args, formattedResult) || ''
    if (note) {
      let line = formatScratchpadNote(note)
      if (
        (toolName === 'file_read' || toolName === 'file_read_ocr')
        && (this.turnIntent.kind === 'update_report' || this.turnIntent.kind === 'update_file')
      ) {
        const path = String(args.path || '')
        line += `\n✓ Pending: ${this.turnIntent.kind === 'update_report' ? 'report_write' : 'file_write'} to ${path || 'same path'} with user's edits (grounded in file content)`
      }
      this.sessionScratchpad += (this.sessionScratchpad ? '\n' : '') + line
    }
  }

  private shouldNudgeActionFirst(responseText: string): boolean {
    const latestUser = [...this.conversationHistory]
      .reverse()
      .find(m => m.role === 'user' && !m.content.startsWith('[SYSTEM]'))?.content
      ?.toLowerCase() || ''

    return shouldNudgeActionFirst(latestUser, responseText)
  }

  private async executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    console.log('[Agent] Executing tool:', name, 'with args:', args)
    
    const connector = this.getConnectorForTool(name)
    if (connector) {
      return connector.executeTool(name, args)
    } else if (name === 'report_write' || name.startsWith('file_')) {
      return this.config.executeFileTool(name, args)
    } else if (name.startsWith('memory_')) {
      return this.config.executeMemoryTool(name, args)
    } else if (name === 'scratchpad_write') {
      // Handled locally — append to session scratchpad
      if (this.scratchpadToolWrittenThisTurn) {
        return { success: true, data: 'Scratchpad already written this turn. Proceed with the next tool call or final answer.' }
      }
      const note = (args.note as string) || ''
      if (note.trim()) {
        this.sessionScratchpad += (this.sessionScratchpad ? '\n' : '') + note.trim()
        this.scratchpadWrittenThisTurn = true
        this.scratchpadToolWrittenThisTurn = true
      }
      return { success: true, data: 'Note saved to session scratchpad.' }
    }
    
    throw new Error(`Unknown tool: ${name}`)
  }

  /**
   * Format tool result for AI context.
   * Converts tool JSON into compact readable text to minimise tokens per loop.
   */
  private formatToolResultForAI(toolName: string, result: unknown, args?: Record<string, unknown>): string {
    const data = result as { success?: boolean; data?: unknown; error?: string }

    if (data.success === false) return `Error: ${data.error || 'Unknown error'}`

    const connector = this.getConnectorForTool(toolName)
    const connectorFormatted = connector?.definition.formatToolResultForAI?.(toolName, result)
    const formatted = connectorFormatted !== null && connectorFormatted !== undefined
      ? connectorFormatted
      : formatCoreToolResultForAI(toolName, result, args)

    const tool = this.getToolDefinition(toolName)
    return compressToolResult({
      toolName,
      category: tool?.category,
      connectorId: connector?.definition.id,
      text: formatted,
    }).text
  }

  /**
   * Approve a pending action
   */
  async approveAction(actionId: string): Promise<void> {
    const action = this.pendingActions.get(actionId)
    if (!action) {
      throw new Error('Action not found')
    }
    this.pendingActions.delete(actionId)

    const connectorApproval = await this.getConnectorForTool(action.type)?.definition.approveAction?.({
      actionType: action.type,
      data: action.data,
      executeTool: (name, args) => this.executeTool(name, args),
      formatToolResultForAI: (name, result) => this.formatToolResultForAI(name, result),
      updateScratchpadAfterTool: (name, args, formattedResult) => this.updateScratchpadAfterTool(name, args, formattedResult),
      invalidateCacheAfterWrite: (name, args) => this.invalidateCacheAfterWrite(name, args),
      cacheToolResult: (name, args, formattedResult) => {
        this.toolResultCache.set(`${name}:${JSON.stringify(args)}`, formattedResult)
      },
    })
    if (connectorApproval?.handled) {
      const completionMsg: Message = {
        id: uuidv4(),
        role: 'assistant',
        content: connectorApproval.message || 'Action completed.',
        timestamp: new Date().toISOString(),
      }
      this.conversationHistory.push(completionMsg)
      this.config.onMessage(completionMsg)

      if (connectorApproval.resumeAgent) {
        this.conversationHistory.push({
          id: uuidv4(),
          role: 'user',
          content: '[SYSTEM] The write action returned recoverable errors. Read the message above, fix the arguments (field formats, required values), and retry the write tool. Do not ask the user to fix API formatting unless the error is auth or permission related.',
          timestamp: new Date().toISOString(),
        })
        await this.runAgentLoop()
      }
      return
    }

    // ── Single-tool approval (create, update, comment, transition, etc.) ──
    const result = await this.executeTool(action.type, action.data)
    const formattedResult = this.formatToolResultForAI(action.type, result, action.data)

    // Persist the result in history so the agent has full context when it resumes
    this.conversationHistory.push({
      id: uuidv4(),
      role: 'assistant',
      content: `[tool_result: ${action.type}]\n${formattedResult}`,
      timestamp: new Date().toISOString(),
    })
    this.updateScratchpadAfterTool(action.type, action.data, formattedResult)
    this.invalidateCacheAfterWrite(action.type, action.data)
    void this.persistSourceMemoryAfterWrite(action.type, action.data, formattedResult)

    // Resume the agent loop — it will decide what to do next (more tasks,
    // a follow-up, or simply confirm done if there's nothing left).
    await this.runAgentLoop()
  }

  /**
   * Reject a pending action
   */
  rejectAction(actionId: string, options?: { silent?: boolean }): void {
    const action = this.pendingActions.get(actionId)
    if (!action) return

    this.pendingActions.delete(actionId)
    if (options?.silent) return

    const rejectionMsg: Message = {
      id: uuidv4(),
      role: 'assistant',
      content: 'No problem, I\'ve cancelled that action.',
      timestamp: new Date().toISOString(),
    }
    this.conversationHistory.push(rejectionMsg)
    this.config.onMessage(rejectionMsg)
  }

  /**
   * Get preview text for an action
   */
  private getActionPreview(toolName: string, args: Record<string, unknown>): string {
    const connectorPreview = this.getConnectorForTool(toolName)?.definition.getActionPreview?.(toolName, args)
    if (connectorPreview) return connectorPreview
    switch (toolName) {
      case 'file_write':
        return `Write to: ${args.path}`
      default:
        return toolName
    }
  }

  private getActionConfirmation(toolName: string, args: Record<string, unknown>): PendingAction['confirmation'] {
    return this.getConnectorForTool(toolName)?.definition.getActionConfirmation?.(toolName, args) || undefined
  }

  private getActionConfirmationPrompt(toolName: string, args: Record<string, unknown>): string {
    return this.getConnectorForTool(toolName)?.definition.getActionConfirmationPrompt?.(toolName, args)
      || `Action: ${toolName}`
  }

  private async persistSourceMemoryAfterWrite(
    toolName: string,
    args: Record<string, unknown>,
    formattedResult: string,
  ): Promise<void> {
    if (!this.config.appendSourceMemory) return

    const tool = this.getToolDefinition(toolName)
    if (!tool || !shouldAdmitSourceLeaf({ reason: 'write_outcome', toolCategory: tool.category })) {
      return
    }

    const connector = this.getConnectorForTool(toolName)
    const scope = connector?.definition.getScopeForSourceMemory?.(toolName, args)
    if (!connector || !scope) return

    const isMonitored = (this.config.monitoredScopes || []).some(
      monitored => monitored.connectorId === scope.connectorId && monitored.scopeId === scope.scopeId,
    )
    if (!isMonitored) return

    const draft = connector.definition.buildSourceMemoryLeaf?.(toolName, args, formattedResult)
      ?? buildDefaultWriteSourceLeaf({
        connectorId: scope.connectorId,
        scopeId: scope.scopeId,
        toolName,
        formattedResult,
      })

    await this.config.appendSourceMemory({
      connectorId: scope.connectorId,
      scopeId: scope.scopeId,
      kind: draft.kind,
      toolName: draft.toolName,
      summary: draft.summary,
    })
  }


  /**
   * Clear conversation history
   */
  clearHistory(): void {
    this.conversationHistory = []
    this.pendingActions.clear()
  }

  getHistory(): Message[] {
    return [...this.conversationHistory]
  }

  /**
   * Load conversation history
   */
  loadHistory(messages: Message[]): void {
    this.conversationHistory = [...messages]
  }
}
