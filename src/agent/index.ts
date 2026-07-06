import { v4 as uuidv4 } from 'uuid'
import { AgentActivity, Message, PendingAction, ToolEntry, UserProfile, type AgentContextSnapshot } from './types'
import { AIResponse, AgentConfig } from './config'
import { shouldAdmitSourceLeaf } from '../memory/sourceAdmission'
import { buildDefaultWriteSourceLeaf } from '../memory/sourceLeaf'

import { assemblePromptTiers } from './promptTiers'
import { buildCoreCapabilitiesSection, buildConnectorContextSection } from './capabilities'
import { buildCommunicationPreferencesPrompt } from './communicationPreferences'
import { buildEnvironmentContextSection } from '../prompts'
import { maybeCompressConversationHistory, estimateTokens } from './historyCompression'
import { selectLearnedNotesForPrompt } from '../memory/learnedBudget'
import { formatActiveScopesForPrompt } from '../memory/promptSections'
import { toolDefinitions } from './tools'
import { ConnectorRuntime, ownsTool, ToolDefinition } from '../connectors/types'
import type { ContextEnvelope } from '../connectors/contract'
import type { ProjectContext } from '../context/types'
import {
  getConnectorScopeConfig,
  getEnabledConnectorIds,
  getContextFolderPath,
  getContextFilesPath,
} from '../context/types'
import type { ContextPromptBody } from '../context/promptInjection'
import { zodToJsonSchema } from './jsonSchema'
import { getCoreToolEntry, ensureToolEntryActivity } from './toolEntries'
import { getConnectorToolEntry } from './connectorToolEntries'
import { resolveActivityLabel, type AgentPhase } from './activityStatus'
import { formatCoreToolResultForAI } from './toolResults'
import { isFailedToolResult } from './toolErrors'
import {
  buildIncompleteWorkflowNudge,
  shouldNudgeIncompleteWorkflow,
  type ToolRunRecord,
} from './taskContinuity'
import { compressToolResult } from './compression'
import type { MarkdownArtifact } from './artifacts'
import { isReportArtifactPath, titleFromReportPath } from './artifacts'
import type { AIStreamProgressEvent } from '../shared/streamProgress'
import { formatAgentErrorMessage } from '../shared/aiErrors'

const THINK_OPEN = '<think>'
const THINK_CLOSE = '</think>'
const THINK_BLOCK_REGEX = new RegExp(`${THINK_OPEN}[\\s\\S]*?${THINK_CLOSE.replace('/', '\\/')}`, 'gi')

// Re-export types
export * from './types'

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
  // Active project context (sticky for the conversation); null = no context.
  private activeContext: ProjectContext | null = null
  private activeContextBody: ContextPromptBody | null = null
  // Deduplication cache: maps "toolName:JSON(args)" -> formatted result string.
  // Cleared at the start of each processMessage call. Write operations trigger
  // targeted invalidation so read-after-write always returns fresh data.
  private toolResultCache = new Map<string, string>()
  // Tracks tool signatures already shown in a tool_summary this turn, so the UI
  // does not repeat identical operations across iterations.
  private summarizedToolSignatures = new Set<string>()
  // Results from tool calls in the current turn, surfaced in the context inspector.
  private latestToolResultsThisTurn: NonNullable<AgentContextSnapshot['latestToolResults']> = []
  private agentLoopIteration = 0
  private abortFlag = false
  private thinkOnlyNudgedThisTurn = false
  private reportWriteSucceededThisTurn = false
  private taskContinuationNudgedThisTurn = false
  private toolsRunThisTurn: ToolRunRecord[] = []
  private lastToolEntryThisTurn: ToolEntry | null = null
  private useReasoningThisTurn = false
  // The original user message for the current turn, stored separately because
  // runtime nudges are also pushed with role: 'user'.
  private currentUserMessage = ''
  // Tracks the assistant message currently being streamed so we can force-finalize
  // it if the loop moves to a non-streaming phase (e.g. tool execution/approval).
  private streamingMessageId: string | null = null
  private streamingMessageContent = ''

  private setAgentStatus(status: string | null): void {
    this.config.onAgentStatus?.(status)
  }

  private toolRunRecordForCall(toolCall: NonNullable<AIResponse['toolCalls']>[number]): ToolRunRecord {
    const toolPath = typeof toolCall.arguments.path === 'string' ? toolCall.arguments.path : undefined
    const reportReadPendingWrite = (
      (toolCall.name === 'file_read' || toolCall.name === 'file_read_ocr')
      && toolPath
      && isReportArtifactPath(toolPath)
    )
    return {
      name: toolCall.name,
      category: this.getToolDefinition(toolCall.name)?.category,
      path: toolPath,
      pendingWriteTool: reportReadPendingWrite ? 'report_write' : undefined,
      pendingWritePath: reportReadPendingWrite ? toolPath : undefined,
    }
  }

  private persistToolResultMessage(toolName: string, formattedResult: string, isFromCache: boolean): void {
    const msg: Message = {
      id: uuidv4(),
      role: 'assistant',
      type: 'tool_result',
      content: `[tool_result: ${toolName}]${isFromCache ? ' [cached]' : ''}\n${formattedResult}`,
      timestamp: new Date().toISOString(),
    }
    this.conversationHistory.push(msg)
    this.config.onMessage(msg)
  }

  private setActivityPhase(phase: AgentPhase): void {
    this.setAgentStatus(resolveActivityLabel(phase))

    const streamingKinds = new Set<AgentPhase['kind']>([
      'streaming_text',
      'streaming_thinking',
      'streaming_tool_draft',
    ])
    if (!streamingKinds.has(phase.kind) && this.streamingMessageId && this.config.onUpdateMessage) {
      this.config.onUpdateMessage(this.streamingMessageId, this.streamingMessageContent, false)
      this.streamingMessageId = null
      this.streamingMessageContent = ''
    }
  }

  private emitActivityMessage(id: string, activity: AgentActivity): void {
    this.config.onMessage({
      id,
      role: 'assistant',
      content: activity.label,
      timestamp: activity.startedAt || new Date().toISOString(),
      type: 'activity',
      activity,
    })
  }

  private activityMessageIdForToolCall(toolCallId: string): string {
    return `activity:${toolCallId}`
  }

  private handleStreamProgress(event: AIStreamProgressEvent): void {
    const entry = this.getToolEntry(
      event.toolName,
      event.title ? { title: event.title } : {},
    )
    this.setActivityPhase({ kind: 'streaming_tool_draft', entry })
  }

  /** Push assistant prose to chat before tool execution (streamed or batched at end of stream). */
  private emitAssistantPreamble(content: string, existingMessageId?: string): string {
    const trimmed = content.trim()
    const messageId = existingMessageId || uuidv4()
    if (!trimmed) {
      if (existingMessageId && this.config.onUpdateMessage) {
        this.config.onUpdateMessage(existingMessageId, '', false)
      }
      return messageId
    }

    const message: Message = {
      id: messageId,
      role: 'assistant',
      content: trimmed,
      timestamp: new Date().toISOString(),
    }

    if (existingMessageId && this.config.onUpdateMessage) {
      this.config.onUpdateMessage(existingMessageId, trimmed, false)
    } else {
      this.config.onMessage(message)
    }

    const historyIndex = this.conversationHistory.findIndex(entry => entry.id === messageId)
    if (historyIndex >= 0) {
      this.conversationHistory[historyIndex] = message
    } else {
      this.conversationHistory.push(message)
    }

    return messageId
  }

  /**
   * Generate a brief fallback preamble when the model returns tool calls without
   * any visible prose. This keeps the UI from silently launching into tools.
   */
  private fallbackPreambleForToolCalls(toolCalls: NonNullable<AIResponse['toolCalls']>): string {
    const entries = toolCalls.map(tc => this.getToolEntry(tc.name, tc.arguments))
    const hasWrite = entries.some(e =>
      e.category === 'connector-write'
      || e.category === 'connector-attachment'
      || e.category === 'file-write'
    )
    const hasRead = entries.some(e =>
      e.category === 'connector-read'
      || e.category === 'file-read'
      || e.category === 'file-manage'
      || e.category === 'context'
      || e.category === 'memory'
    )
    if (hasWrite) return "I'll make the requested change."
    if (hasRead) return "I'll look into that for you."
    return "I'll handle that."
  }

  constructor(config: AgentConfig) {
    this.config = config
  }

  updateUserProfile(profile: UserProfile | null): void {
    this.config.userProfile = profile
  }

  /**
   * Set the active project context (sticky for the conversation). Propagates a
   * per-connector {@link ContextEnvelope} so connector tools run scoped to it and
   * inject the context's knowledge into the prompt. Pass null to clear.
   */
  setActiveContext(context: ProjectContext | null): void {
    this.activeContext = context
    this.activeContextBody = null
    for (const connector of this.config.connectors || []) {
      const connectorId = connector.definition.id
      const config = context ? getConnectorScopeConfig(context, connectorId) : null
      const envelope = context && config !== null
        ? { contextId: context.id, config, contextFolderPath: getContextFolderPath(context) }
        : null
      void connector.setActiveContext?.(envelope)
    }
  }

  /** Build the context envelope for a connector from the active project context. */
  private async buildConnectorContextEnvelope(connectorId: string): Promise<ContextEnvelope | undefined> {
    await this.syncActiveContextFromSource()
    const context = this.activeContext
    if (!context) return undefined
    const config = getConnectorScopeConfig(context, connectorId)
    if (config === null) return undefined
    return {
      contextId: context.id,
      config,
      contextFolderPath: getContextFolderPath(context),
    }
  }

  /** Reload active context from storage so connector scope config is never stale. */
  private async syncActiveContextFromSource(): Promise<void> {
    const contextId = this.activeContext?.id
    if (!contextId || !this.config.refreshActiveContext) return
    try {
      const fresh = await this.config.refreshActiveContext(contextId)
      if (!fresh || fresh.id !== contextId) return
      this.activeContext = fresh
      this.activeContextBody = null
      this.setActiveContext(fresh)
    } catch (error) {
      console.warn('[Agent] Failed to refresh active context:', error)
    }
  }

  /** The active project context, or null. */
  getActiveContext(): ProjectContext | null {
    return this.activeContext
  }

  /**
   * Prompt section announcing the active context: its name and a soft working-dir
   * hint (file tools stay workspace-wide; this just biases default paths).
   */
  private async buildActiveContextSection(): Promise<string> {
    const context = this.activeContext
    if (!context) return ''

    let body = this.activeContextBody
    if (this.config.loadContextPromptBody) {
      try {
        body = await this.config.loadContextPromptBody(context.id)
        this.activeContextBody = body
      } catch {
        // Keep previous body or fall through to tool-only instructions.
      }
    }

    const lines = [`\n\n## Active Context: ${context.name}`]
    lines.push(`The user scoped this conversation to the "${context.name}" project. Only connectors enabled for this context are available; their tools and instructions are listed in the Connector context section.`)
    lines.push(`Context folder: \`${getContextFolderPath(context)}\` (portable - share this folder with teammates).`)
    lines.push(`When creating outputs, prefer this context folder: save reports directly in \`${getContextFolderPath(context)}\` and other files to \`${getContextFilesPath(context)}\`.`)
    lines.push(`When reading files, look in the context folder first, then fall back to the wider workspace.`)

    if (body?.injectFull && body.markdown) {
      lines.push(`\n### Context knowledge (full)\n${body.markdown}`)
      lines.push(`\nUpdate this file with \`context_append\` or \`context_replace_section\` - never file_write on the context markdown.`)
    } else if (body && !body.injectFull && body.length > 0) {
      lines.push(
        `\nThe context file is ${body.length.toLocaleString()} characters - too large to inject verbatim.`,
      )
      lines.push(`Call \`context_read\` before starting work on this project so you have the full picture.`)
      lines.push(`Update it with \`context_append\` or \`context_replace_section\` - never file_write on the context markdown.`)
    } else {
      lines.push(`\nUse \`context_read\` when you need project knowledge. Update with \`context_append\` or \`context_replace_section\`.`)
    }
    return lines.join('\n')
  }

  private getCoreToolDefinitions(): ToolDefinition[] {
    const contextToolNames = new Set(['context_read', 'context_append', 'context_replace_section'])
    return toolDefinitions.filter(tool => {
      if (contextToolNames.has(tool.name) && !this.activeContext) return false
      return true
    })
  }

  private getEnabledConnectors(): ConnectorRuntime[] {
    const connectors = this.config.connectors || []
    if (!this.activeContext) return connectors
    const enabled = new Set(getEnabledConnectorIds(this.activeContext))
    return connectors.filter(connector => enabled.has(connector.definition.id))
  }

  private getConnectorForTool(toolName: string): ConnectorRuntime | undefined {
    return this.config.connectors?.find(connector => ownsTool(connector.definition, toolName))
  }

  private getAllToolDefinitions(): ToolDefinition[] {
    return [
      ...this.getCoreToolDefinitions(),
      ...this.getEnabledConnectors().flatMap(connector => connector.definition.tools),
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
    const connector = this.getConnectorForTool(name)
    const custom = connector?.definition.getToolEntry?.(name, args)
    let entry: ToolEntry
    if (custom) {
      entry = ensureToolEntryActivity(custom, this.getToolDefinition(name)?.category)
    } else if (connector) {
      const tool = this.getToolDefinition(name)
      entry = getConnectorToolEntry(
        connector.definition.id,
        connector.definition.name,
        name,
        tool?.category ?? 'connector-read',
        args,
      )
    } else {
      entry = getCoreToolEntry(name, args)
    }
    return { ...entry, args }
  }

  private getConnectorPromptSections(): string[] {
    return this.getEnabledConnectors()
      .map(connector => buildConnectorContextSection(connector))
      .filter(Boolean)
  }

  private buildCoreCapabilitiesSectionString(): string {
    const coreTools = this.getCoreToolDefinitions()
    const body = buildCoreCapabilitiesSection(coreTools)
    return body.trim() ? `## Core capabilities\n\n${body}` : ''
  }

  /** Stop the agent and cancel any in-flight AI stream. */
  abort(): void {
    this.abortFlag = true
    this.config.abortAIStream?.()
    this.setAgentStatus(null)
  }

  async processMessage(userMessage: string, options?: { useReasoning?: boolean }): Promise<void> {
    this.currentUserMessage = userMessage
    this.useReasoningThisTurn = options?.useReasoning ?? false
    await this.syncActiveContextFromSource()
    this.abortFlag = false
    this.toolResultCache.clear()
    this.summarizedToolSignatures.clear()
    this.latestToolResultsThisTurn = []
    this.agentLoopIteration = 0
    this.thinkOnlyNudgedThisTurn = false
    this.reportWriteSucceededThisTurn = false
    this.taskContinuationNudgedThisTurn = false
    this.toolsRunThisTurn = []
    this.lastToolEntryThisTurn = null
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
      await this.maybeCompressHistoryOnce()
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
    } finally {
      this.useReasoningThisTurn = false
    }
  }

  private async runAgentLoop(): Promise<void> {
    let iterations = 0
    const maxIterations = this.config.maxIterations ?? 10
    const hasLimit = maxIterations > 0
    let consecutiveErrors = 0
    const maxConsecutiveErrors = 4

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
      this.agentLoopIteration = iterations

      const { response, wasStreamed, assistantPreamble, preambleMessageId, aborted } = await this.callAI()

      if (aborted) {
        console.log('[Agent] Aborted by user.')
        break
      }
      if (!response) throw new Error('No response from AI')

      if (response.toolCalls && response.toolCalls.length > 0) {
        let hadError = false
        let abortedDuringTools = false
        const toolEntries = response.toolCalls.map(toolCall =>
          this.getToolEntry(toolCall.name, toolCall.arguments),
        )
        const toolSummaryEntries: ToolEntry[] = []

        if (assistantPreamble?.trim() && !preambleMessageId) {
          this.emitAssistantPreamble(assistantPreamble.trim())
        }

        for (let i = 0; i < response.toolCalls.length; i++) {
          const toolCall = response.toolCalls[i]
          if (this.abortFlag) {
            this.abortFlag = false
            abortedDuringTools = true
            console.log('[Agent] Aborted by user during tool execution.')
            break
          }

          console.log('[Agent] Tool call:', toolCall.name, toolCall.arguments)
          this.toolsRunThisTurn.push(this.toolRunRecordForCall(toolCall))
          const toolEntry = toolEntries[i]
          this.lastToolEntryThisTurn = toolEntry
          const activityMessageId = this.activityMessageIdForToolCall(toolCall.id)
          const activityStartedAt = new Date().toISOString()
          this.emitActivityMessage(activityMessageId, {
            kind: 'tool',
            status: 'running',
            label: toolEntry.runningLabel,
            toolEntry,
            startedAt: activityStartedAt,
          })
          this.setActivityPhase({ kind: 'running_tool', entry: toolEntry })

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
              preambleMessageId,
            )
            this.emitActivityMessage(activityMessageId, {
              kind: 'approval',
              status: 'waiting',
              label: `Waiting for approval: ${toolEntry.label}`,
              detail: pendingAction.description,
              toolEntry,
              startedAt: activityStartedAt,
            })
            this.setActivityPhase({ kind: 'awaiting_approval', entry: toolEntry })
            return
          }

          // Deduplication: if the exact same tool+args was called earlier this
          // turn, return the cached result instead of re-executing. This prevents
          // the agent from reading the same file or running the same search twice.
          const cacheKey = `${toolCall.name}:${JSON.stringify(toolCall.arguments)}`
          const cached = this.toolResultCache.get(cacheKey)
          let formattedResult: string
          let isFromCache = false
          let toolIsError = false

          if (cached !== undefined) {
            formattedResult = cached
            isFromCache = true
            console.log(`[Agent] Cache hit - skipping re-execution of ${toolCall.name}`)
            this.emitActivityMessage(activityMessageId, {
              kind: 'tool',
              status: 'completed',
              label: toolEntry.label,
              detail: 'Used cached result from this turn.',
              toolEntry,
              startedAt: activityStartedAt,
              completedAt: new Date().toISOString(),
            })
          } else {
            const result = await this.executeTool(toolCall.name, toolCall.arguments)
            if (this.abortFlag) {
              this.abortFlag = false
              abortedDuringTools = true
              console.log('[Agent] Aborted by user during tool execution.')
              break
            }
            formattedResult = this.formatToolResultForAI(toolCall.name, result, toolCall.arguments)

            const isError = isFailedToolResult(result, formattedResult)
            if (isError) {
              hadError = true
              toolIsError = true
              console.log('[Agent] Tool error:', formattedResult.substring(0, 200))
              this.emitActivityMessage(activityMessageId, {
                kind: 'tool',
                status: 'error',
                label: `${toolEntry.label} failed`,
                detail: formattedResult.substring(0, 500),
                toolEntry,
                startedAt: activityStartedAt,
                completedAt: new Date().toISOString(),
              })
            } else {
              if (toolCall.name === 'report_write') {
                this.reportWriteSucceededThisTurn = true
              }
              // Only cache and post-process successful results
              this.toolResultCache.set(cacheKey, formattedResult)
              // Invalidate stale reads after write operations
              this.invalidateCacheAfterWrite(toolCall.name, toolCall.arguments)
              void this.persistSourceMemoryAfterWrite(toolCall.name, toolCall.arguments, formattedResult)
              if (!isFromCache) {
                this.emitArtifactMessageFromResult(toolCall.name, toolCall.arguments, result)
              }
              this.emitActivityMessage(activityMessageId, {
                kind: 'tool',
                status: 'completed',
                label: toolEntry.label,
                toolEntry,
                startedAt: activityStartedAt,
                completedAt: new Date().toISOString(),
              })
            }
          }

          // Record tool entry + result for the summary block (UI only — not in history)
          toolSummaryEntries.push({
            ...toolEntry,
            result: formattedResult,
            isError: toolIsError,
          })

          const maxResultPreview = 4000
          this.latestToolResultsThisTurn.push({
            tool: toolCall.name,
            args: toolCall.arguments,
            result: formattedResult.length > maxResultPreview ? `${formattedResult.slice(0, maxResultPreview)}\n…` : formattedResult,
            isError: toolIsError,
          })

          // Add result to history so AI has the data next iteration.
          this.persistToolResultMessage(toolCall.name, formattedResult, isFromCache)
        }

        if (abortedDuringTools) break

        // Emit a persistent tool-summary block (UI only — not in history).
        // Skip tool signatures already summarized this turn to avoid duplicate rows
        // when the model re-calls the same read across iterations.
        const newSummaryEntries = toolSummaryEntries.filter(entry => {
          const sig = `${entry.tool}:${JSON.stringify(entry.args)}:${entry.result?.slice(0, 120) ?? ''}`
          if (this.summarizedToolSignatures.has(sig)) return false
          this.summarizedToolSignatures.add(sig)
          return true
        })
        if (newSummaryEntries.length > 0) {
          this.config.onMessage({
            id: uuidv4(),
            role: 'assistant',
            content: '',
            timestamp: new Date().toISOString(),
            type: 'tool_summary',
            toolEntries: newSummaryEntries,
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
              const lastError = this.latestToolResultsThisTurn
                .slice()
                .reverse()
                .find(r => r.isError)
              const errorDetail = lastError
                ? lastError.result.replace(/^Error:\s*/, '').slice(0, 200)
                : null
              const fallback = errorDetail
                ? `I encountered repeated errors. Last error: ${errorDetail}. Please check the configuration or rephrase your request.`
                : 'I encountered repeated errors. Please check the configuration or rephrase your request.'
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

      // No tool calls - check for a meaningful final response.
      // Strip any <think>...</think> blocks that were already shown as
      // collapsible thinking messages; they should not appear as regular text.
      const rawContent = response.content?.trim() || ''
      const strippedContent = rawContent.replace(THINK_BLOCK_REGEX, '').trim()

      if (
        !wasStreamed &&
        /^\[tool_result:/i.test(strippedContent) &&
        iterations < (hasLimit ? maxIterations : iterations + 1)
      ) {
        console.log('[Agent] Raw tool result echoed - nudging model to use the result')
        this.conversationHistory.push({
          id: uuidv4(),
          role: 'user',
          content: '[SYSTEM] You repeated a raw tool result. Do not show tool_result blocks to the user. Use the tool result as source material and complete the user request. If the user asked for an action and the required information is present, call the appropriate tool now.',
          timestamp: new Date().toISOString(),
        })
        continue
      }

      if (this.maybeNudgeTaskContinuation(strippedContent || rawContent)) {
        continue
      }

      if (!wasStreamed && strippedContent) {
        const assistantMsg: Message = { id: uuidv4(), role: 'assistant', content: strippedContent, timestamp: new Date().toISOString() }
        this.conversationHistory.push(assistantMsg)
        this.config.onMessage(assistantMsg)
      } else if (wasStreamed) {
        if (this.maybeNudgeTaskContinuation(strippedContent || rawContent)) {
          continue
        }
        break
      } else if (
        !strippedContent
        && !this.thinkOnlyNudgedThisTurn
        && iterations < (hasLimit ? maxIterations : iterations + 1)
      ) {
        console.log('[Agent] Think-only response - nudging model to continue')
        this.thinkOnlyNudgedThisTurn = true
        this.conversationHistory.push({
          id: uuidv4(),
          role: 'user',
          content: '[System: Your thinking was shown to the user. Now proceed with the next step - call the appropriate tool or give your final answer.]',
          timestamp: new Date().toISOString(),
        })
        continue
      }
      break
    }

    if (hasLimit && iterations >= maxIterations) {
      const timeoutMsg: Message = {
        id: uuidv4(), role: 'assistant',
        content: `I've reached the iteration limit (${maxIterations}). You can increase this in Settings -> Agent Behavior.`,
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
   *  - content inside <think>...</think> -> emitted as a type:'thinking' message with elapsed time
   *  - content outside -> streamed normally to the response bubble
   * Returns wasStreamed=true when the response was already pushed to UI and history.
   */
  private finalizeAbortedStream(
    responseMsgId: string,
    responseStarted: boolean,
    responseContent: string,
  ): { response: null; wasStreamed: boolean; aborted: true } {
    this.abortFlag = false
    this.streamingMessageId = null
    this.streamingMessageContent = ''
    if (responseStarted && this.config.onUpdateMessage) {
      const finalContent = responseContent.trim()
      if (finalContent) {
        this.config.onUpdateMessage(responseMsgId, finalContent, false)
        this.conversationHistory.push({
          id: responseMsgId,
          role: 'assistant',
          content: finalContent,
          timestamp: new Date().toISOString(),
        })
        return { response: null, wasStreamed: true, aborted: true }
      }
      this.config.onUpdateMessage(responseMsgId, '', false)
    }
    return { response: null, wasStreamed: false, aborted: true }
  }

  private emitContextSnapshot(params: {
    systemPrompt: string
    foundation: string
    relevantHistory: Message[]
    connectorSections: string[]
    capabilitiesSection: string
    contextSection: string
  }): void {
    if (!this.config.onContextSnapshot) return

    const lastUserMessage = this.currentUserMessage

    const recentHistory = params.relevantHistory
      .filter(m => m.role !== 'system' && m.type !== 'summary')
      .map(m => ({
        role: m.role,
        content: m.content.length > 2000 ? `${m.content.slice(0, 2000)}…` : m.content,
      }))

    const historySummary = recentHistory
      .map(m => `**${m.role}:** ${m.content}`)
      .join('\n\n')

    const section = (name: string, content: string | undefined): AgentContextSnapshot['sections'][number] => ({
      name,
      present: content !== undefined && content.length > 0,
      content,
      tokens: content ? estimateTokens(content) : 0,
    })

    let memoryContent = ''
    if (this.config.memory) {
      const userMarkdown = this.config.memory.userMarkdown?.trim() ?? ''
      const learned = selectLearnedNotesForPrompt(this.config.memory)
      const learnedLines = [
        ...learned.recentLines,
        ...(learned.rollup ? [`Archived summary:\n${learned.rollup}`] : []),
      ]
      const scopeSection = formatActiveScopesForPrompt(this.config.monitoredScopes || [])
      const parts: string[] = []
      if (userMarkdown) parts.push(`### User Memory\n${userMarkdown}`)
      if (learnedLines.length > 0) parts.push(`### Learned Notes\n${learnedLines.join('\n')}`)
      if (scopeSection) parts.push(scopeSection)
      memoryContent = parts.join('\n\n')
    }

    const userContext = buildCommunicationPreferencesPrompt(this.config.userProfile)
    const environmentContext = buildEnvironmentContextSection()

    const sections: AgentContextSnapshot['sections'] = [
      section('System prompt', params.foundation),
      section('User context', userContext),
      section('Environment context', environmentContext),
      section('Memory', memoryContent),
      section('Core capabilities', params.capabilitiesSection),
      section('Active context', params.contextSection),
      section('Connector context', params.connectorSections.join('\n\n')),
      section('Recent conversation history', historySummary),
    ]

    const totalTokens = sections.reduce((sum, s) => sum + (s.tokens ?? 0), 0)

    const snapshot: AgentContextSnapshot = {
      userMessage: lastUserMessage,
      systemPrompt: params.systemPrompt,
      memoryContent,
      recentHistory,
      latestToolResults: this.latestToolResultsThisTurn,
      totalTokens,
      metadata: {
        timestamp: new Date().toISOString(),
        iteration: this.agentLoopIteration,
      },
      sections,
    }

    this.config.onContextSnapshot(snapshot)
  }

  private async maybeCompressHistoryOnce(): Promise<void> {
    const tiers = assemblePromptTiers(
      this.config.userProfile,
      this.getConnectorPromptSections(),
      this.config.memory,
      this.config.monitoredScopes || [],
      {
        contextSection: '',
        capabilitiesSection: '',
      },
    )
    await maybeCompressConversationHistory({
      conversationHistory: this.conversationHistory,
      systemPrompt: tiers.combined,
      callAI: this.config.callAI,
      contextWindowTokens: this.config.contextWindowTokens,
    })
  }

  private async callAI(): Promise<{
    response: AIResponse | null
    wasStreamed: boolean
    assistantPreamble?: string
    preambleMessageId?: string
    aborted?: boolean
  }> {
    const contextSection = await this.buildActiveContextSection()
    const connectorSections = this.getConnectorPromptSections()
    const capabilitiesSection = this.buildCoreCapabilitiesSectionString()

    const tiers = assemblePromptTiers(
      this.config.userProfile,
      connectorSections,
      this.config.memory,
      this.config.monitoredScopes || [],
      {
        contextSection,
        capabilitiesSection,
      },
    )
    const systemPrompt = tiers.combined

    const relevantHistory = this.conversationHistory
      .filter(m => m.type !== 'tool_summary' && m.type !== 'activity' && m.type !== 'artifact')
      .slice(-40)

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
      // Render system notices (approval/refusal feedback, etc.) as user messages
      // to the model so they are not dropped by providers that only honor a
      // single system message or ignore interleaved system roles.
      ...relevantHistory.map(m => ({
        role: m.role === 'system' ? 'user' : (m.role as 'user' | 'assistant'),
        content: m.content,
      })),
    ]

    this.emitContextSnapshot({
      systemPrompt,
      foundation: tiers.foundation,
      relevantHistory,
      connectorSections,
      capabilitiesSection,
      contextSection,
    })

    const tools = this.getAllToolDefinitions().map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.jsonSchema ?? (tool.schema ? zodToJsonSchema(tool.schema) : { type: 'object', properties: {} }),
      },
    }))

    console.log('[Agent] Available tools:', tools.map(t => t.function.name).join(', '))
    console.log('[Agent] Connector context sections:', connectorSections.length)

    const useReasoningStream = this.useReasoningThisTurn && !!this.config.callAIReasoningStream
    const useReasoningNonStream = this.useReasoningThisTurn && !!this.config.callAIReasoning
    const effectiveCallAIStream = useReasoningStream ? this.config.callAIReasoningStream : this.config.callAIStream
    const effectiveCallAI = useReasoningNonStream ? this.config.callAIReasoning : this.config.callAI

    this.setActivityPhase({
      kind: 'awaiting_model',
      useReasoning: useReasoningStream || useReasoningNonStream,
      isFirstReasoningIteration: useReasoningStream || useReasoningNonStream,
      lastEntry: this.lastToolEntryThisTurn,
    })

    try {
    // Streaming path
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

      const flushToResponse = (chunk: string) => {
        if (!chunk) return
        responseContent += chunk
        this.streamingMessageContent = responseContent
        const snapshot = responseContent
        if (!responseStarted) {
          this.setActivityPhase({ kind: 'streaming_text' })
          responseStarted = true
          this.streamingMessageId = responseMsgId
          this.config.onMessage({
            id: responseMsgId,
            role: 'assistant',
            content: snapshot,
            timestamp: new Date().toISOString(),
            isStreaming: true,
          })
        } else if (this.config.onUpdateMessage) {
          this.config.onUpdateMessage(responseMsgId, snapshot, true)
        }
      }

      const finalizeStreamedResponse = (content: string) => {
        this.streamingMessageId = null
        this.streamingMessageContent = ''
        if (!responseStarted || !this.config.onUpdateMessage) return
        const finalContent = content.trim()
        if (finalContent) {
          this.config.onUpdateMessage(responseMsgId, finalContent, false)
        } else {
          this.config.onUpdateMessage(responseMsgId, '', false)
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
            this.setActivityPhase({ kind: 'streaming_thinking' })
            // The content so far (after <think>) goes into the think buffer
            buffer = trimmed.slice(THINK_OPEN_TAG.length)
            return
          }
          // If the trimmed buffer is longer than THINK_OPEN and doesn't start with it
          // -> this is a direct response, switch to streaming mode
          if (trimmed.length > THINK_OPEN_TAG.length && !THINK_OPEN_TAG.startsWith(trimmed.slice(0, THINK_OPEN_TAG.length))) {
            phase = 'response'
            flushToResponse(trimmed)
            buffer = ''
            return
          }
          // Might still be a prefix of <think> or just whitespace - keep scanning
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

        // response phase - stream normally
        flushToResponse(token)
        buffer = ''
      }

      let result = await effectiveCallAIStream(messages, tools, onToken, event => this.handleStreamProgress(event))
      if (this.abortFlag) {
        return this.finalizeAbortedStream(responseMsgId, responseStarted, responseContent)
      }
      if (this.abortFlag) {
        return this.finalizeAbortedStream(responseMsgId, responseStarted, responseContent)
      }
      if (!result.success) throw new Error(result.error || 'AI request failed')
      const response = result.data || null

      // Flush anything remaining in the buffer
      const endPhase: string = phase
      if (buffer.trim()) {
        if (endPhase === 'in_think') {
          emitThinkingBlock(buffer, Date.now() - thinkTimerStart)
        } else {
          flushToResponse(buffer.trim())
        }
      }

      if (response) {
        if (response.toolCalls && response.toolCalls.length > 0) {
          let rawPreamble = (responseStarted ? responseContent.trim() : '') || response.content?.trim() || ''
          rawPreamble = rawPreamble.replace(THINK_BLOCK_REGEX, '').trim()
          const preambleText = rawPreamble || this.fallbackPreambleForToolCalls(response.toolCalls)
          if (responseStarted) {
            finalizeStreamedResponse(preambleText)
            if (preambleText) {
              this.conversationHistory.push({
                id: responseMsgId,
                role: 'assistant',
                content: preambleText,
                timestamp: new Date().toISOString(),
              })
            }
          }

          const toolEntries = response.toolCalls.map(toolCall =>
            this.getToolEntry(toolCall.name, toolCall.arguments),
          )
          this.setActivityPhase({ kind: 'preparing_tools', entries: toolEntries })

          return {
            response,
            wasStreamed: false,
            assistantPreamble: preambleText || undefined,
            preambleMessageId: preambleText ? responseMsgId : undefined,
          }
        } else if (responseStarted) {
          const finalContent = (responseContent.trim() || response.content?.trim() || '').replace(THINK_BLOCK_REGEX, '').trim()
          if (finalContent) {
            if (/^\[tool_result:/i.test(finalContent)) {
              finalizeStreamedResponse('')
              response.content = finalContent
              return { response, wasStreamed: false }
            }
            finalizeStreamedResponse(finalContent)
            this.conversationHistory.push({
              id: responseMsgId,
              role: 'assistant',
              content: finalContent,
              timestamp: new Date().toISOString(),
            })
            return { response, wasStreamed: true }
          }
          finalizeStreamedResponse('')
        }
      } else if (responseStarted) {
        const finalContent = responseContent.replace(THINK_BLOCK_REGEX, '').trim()
        finalizeStreamedResponse(finalContent)
        if (finalContent) {
          this.conversationHistory.push({
            id: responseMsgId,
            role: 'assistant',
            content: finalContent,
            timestamp: new Date().toISOString(),
          })
          return { response: { content: finalContent }, wasStreamed: true }
        }
      }
      return { response, wasStreamed: false }
    }

    // Fallback: non-streaming
    if (!effectiveCallAI) {
      throw new Error('No AI caller available')
    }
    let result = await effectiveCallAI(messages, tools)
    if (this.abortFlag) {
      this.abortFlag = false
      return { response: null, wasStreamed: false, aborted: true }
    }
    if (this.abortFlag) {
      this.abortFlag = false
      return { response: null, wasStreamed: false, aborted: true }
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

    let preambleText = response?.content?.trim() || ''
    preambleText = preambleText.replace(THINK_BLOCK_REGEX, '').trim()
    if (response?.toolCalls?.length) {
      preambleText = preambleText || this.fallbackPreambleForToolCalls(response.toolCalls)
      return {
        response,
        wasStreamed: false,
        assistantPreamble: preambleText,
      }
    }

    return { response, wasStreamed: false, assistantPreamble: preambleText || undefined }
    } catch (error) {
      throw error
    }
  }

  private emitPendingActionChatMessage(
    pendingAction: PendingAction,
    assistantPreamble?: string,
    responseContent?: string,
    preambleMessageId?: string,
  ): void {
    const content = this.composePendingActionChatContent(pendingAction, assistantPreamble, responseContent)

    if (preambleMessageId && this.config.onUpdateMessage) {
      this.config.onUpdateMessage(preambleMessageId, content, false)
      const historyIndex = this.conversationHistory.findIndex(message => message.id === preambleMessageId)
      if (historyIndex >= 0) {
        this.conversationHistory[historyIndex] = {
          ...this.conversationHistory[historyIndex],
          content,
          isStreaming: false,
        }
      } else {
        this.conversationHistory.push({
          id: preambleMessageId,
          role: 'assistant',
          content,
          timestamp: new Date().toISOString(),
        })
      }
      return
    }

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
    if (!structured || modelText.trim() === structured.trim()) return modelText

    const modelAlreadyHasStructured = structured
      .split('\n')
      .map(line => line.replace(/\*\*/g, '').trim())
      .filter(Boolean)
      .every(line => modelText.includes(line))

    if (modelAlreadyHasStructured) return modelText
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
    const skipPromptList = Boolean(confirmation?.items?.length)
    const descriptionText = confirmation?.description?.trim()
    const previewText = confirmation?.preview?.trim()
    if (prompt && prompt !== `Action: ${pendingAction.type}` && !skipPromptList) {
      const promptText = prompt.trim()
      if (promptText !== descriptionText && promptText !== previewText) {
        parts.push(prompt)
      }
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
    args: Record<string, unknown>,
    result: unknown,
  ): void {
    const data = result as { success?: boolean; path?: string; title?: string; error?: string }

    if (toolName === 'report_write') {
      if (!data.success || !data.path || !data.title) return
      this.emitArtifactMessage({ path: data.path, title: data.title })
      return
    }

    if (toolName === 'file_write' && data.success !== false) {
      const path = String(data.path || args.path || '').replace(/\\/g, '/')
      if (!isReportArtifactPath(path)) return
      this.emitArtifactMessage({ path, title: titleFromReportPath(path) })
    }
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
    // file_write -> drop cached read for that exact path
    if (toolName === 'file_write' || toolName === 'report_write') {
      const writtenPath = (args.path as string) || ''
      for (const key of this.toolResultCache.keys()) {
        if (key.startsWith('file_read:') && key.includes(writtenPath)) {
          this.toolResultCache.delete(key)
        }
      }
    }
  }

  private maybeNudgeTaskContinuation(responseText: string): boolean {
    if (this.taskContinuationNudgedThisTurn) return false
    if (!shouldNudgeIncompleteWorkflow(this.toolsRunThisTurn, responseText, {
      reportWriteSucceededThisTurn: this.reportWriteSucceededThisTurn,
    })) return false

    console.log('[Agent] Incomplete workflow - nudging model to continue')
    this.taskContinuationNudgedThisTurn = true
    this.conversationHistory.push({
      id: uuidv4(),
      role: 'user',
      content: buildIncompleteWorkflowNudge(this.toolsRunThisTurn),
      timestamp: new Date().toISOString(),
    })
    return true
  }

  private async executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    console.log('[Agent] Executing tool:', name, 'with args:', args)
    
    const connector = this.getConnectorForTool(name)
    if (connector) {
      const envelope = await this.buildConnectorContextEnvelope(connector.definition.id)
      if (this.activeContext && getEnabledConnectorIds(this.activeContext).includes(connector.definition.id)) {
        if (!envelope) {
          return {
            success: false,
            error: 'Active context is missing scope configuration for this connector.',
          }
        }
      }
      return connector.executeTool(name, args, envelope)
    } else if (name === 'report_write' || name.startsWith('file_')) {
      return this.config.executeFileTool(name, args)
    } else if (name.startsWith('memory_')) {
      return this.config.executeMemoryTool(name, args)
    } else if (name.startsWith('context_')) {
      return this.config.executeContextTool(name, args)
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

    // Record the user's explicit approval in the transcript so the model
    // cannot mistake a successful write for an unsanctioned action.
    const approvalMsg: Message = {
      id: uuidv4(),
      role: 'system',
      content: `User approved the ${action.type} write tool call.`,
      timestamp: new Date().toISOString(),
    }
    this.conversationHistory.push(approvalMsg)
    this.config.onMessage(approvalMsg)

    const activityMessageId = this.activityMessageIdForToolCall(actionId)
    const toolEntry = this.getToolEntry(action.type, action.data)
    const activityStartedAt = new Date().toISOString()
    this.emitActivityMessage(activityMessageId, {
      kind: 'tool',
      status: 'running',
      label: toolEntry.runningLabel,
      toolEntry,
      startedAt: activityStartedAt,
    })

    await this.syncActiveContextFromSource()

    const connector = this.getConnectorForTool(action.type)
    const contextEnvelope = connector
      ? await this.buildConnectorContextEnvelope(connector.definition.id)
      : undefined

    const connectorApproval = await connector?.definition.approveAction?.({
      actionType: action.type,
      data: action.data,
      contextEnvelope,
      executeTool: (name, args) => this.executeTool(name, args),
      formatToolResultForAI: (name, result) => this.formatToolResultForAI(name, result),
      invalidateCacheAfterWrite: (name, args) => this.invalidateCacheAfterWrite(name, args),
      cacheToolResult: (name, args, formattedResult) => {
        this.toolResultCache.set(`${name}:${JSON.stringify(args)}`, formattedResult)
      },
    })
    if (connectorApproval?.handled) {
      this.emitActivityMessage(activityMessageId, {
        kind: 'tool',
        status: 'completed',
        label: connectorApproval.message || toolEntry.label,
        toolEntry,
        startedAt: activityStartedAt,
        completedAt: new Date().toISOString(),
      })
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

    // Single-tool approval (create, update, comment, transition, etc.)
    const result = await this.executeTool(action.type, action.data)
    const formattedResult = this.formatToolResultForAI(action.type, result, action.data)
    const isError = isFailedToolResult(result, formattedResult)
    this.emitActivityMessage(activityMessageId, {
      kind: 'tool',
      status: isError ? 'error' : 'completed',
      label: isError ? `${toolEntry.label} failed` : toolEntry.label,
      detail: isError ? formattedResult.substring(0, 500) : undefined,
      toolEntry,
      startedAt: activityStartedAt,
      completedAt: new Date().toISOString(),
    })

    // Persist the result in history so the agent has full context when it resumes
    this.conversationHistory.push({
      id: uuidv4(),
      role: 'assistant',
      content: `[tool_result: ${action.type}]\n${formattedResult}`,
      timestamp: new Date().toISOString(),
    })
    this.invalidateCacheAfterWrite(action.type, action.data)
    void this.persistSourceMemoryAfterWrite(action.type, action.data, formattedResult)

    // Resume the agent loop - it will decide what to do next (more tasks,
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
    const toolEntry = this.getToolEntry(action.type, action.data)
    this.emitActivityMessage(this.activityMessageIdForToolCall(actionId), {
      kind: 'approval',
      status: 'completed',
      label: `Cancelled: ${toolEntry.label}`,
      toolEntry,
      completedAt: new Date().toISOString(),
    })

    const rejectionMsg: Message = {
      id: uuidv4(),
      role: 'system',
      content: `User refused the ${action.type} write tool call.`,
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
    this.conversationHistory = messages.filter(message =>
      message.type !== 'tool_summary'
      && message.type !== 'activity'
      && message.type !== 'artifact',
    )
  }
}
