import { v4 as uuidv4 } from 'uuid'
import { Message, PendingAction, UserProfile, ToolEntry } from './types'
import { getSystemPrompt, getActionConfirmationPrompt } from './prompts'
import { toolDefinitions, requiresConfirmation } from './tools'
import { JiraMetadataStore } from '../types/jira'
import { MemoryStore } from '../types/memory'

// Re-export types and utilities
export * from './types'
export * from './tools'
export * from './prompts'

// ─── Zod → JSON Schema ────────────────────────────────────────────────────────
// Recursive converter that correctly handles ZodObject, ZodArray<ZodObject>,
// ZodOptional, ZodDefault, ZodEnum, and primitive types.
// The previous inline version hardcoded `items: { type: 'string' }` for every
// array, which broke the jira_batch_create_issues schema (array of objects).

type ZodDef = {
  typeName?: string
  description?: string
  innerType?: { _def?: ZodDef; shape?: Record<string, unknown> }
  type?: { _def?: ZodDef; shape?: Record<string, unknown> }
  shape?: Record<string, unknown>
  values?: Record<string, unknown>
  checks?: Array<{ kind: string }>
}

function zodFieldToJsonSchema(field: unknown): Record<string, unknown> {
  const f = field as { _def?: ZodDef; shape?: Record<string, unknown>; isOptional?: () => boolean }
  let def: ZodDef = f._def || {}
  let typeName = def.typeName || 'ZodString'
  let description = def.description || ''
  let isOptionalField = false

  // Unwrap ZodOptional / ZodDefault / ZodNullable wrappers
  while (
    typeName === 'ZodOptional' ||
    typeName === 'ZodDefault' ||
    typeName === 'ZodNullable'
  ) {
    isOptionalField = true
    const inner = def.innerType
    if (!inner) break
    def = inner._def || {}
    typeName = def.typeName || 'ZodString'
    if (!description && def.description) description = def.description
  }

  const result: Record<string, unknown> = {}
  if (description) result.description = description

  if (typeName === 'ZodString') {
    result.type = 'string'
  } else if (typeName === 'ZodNumber') {
    result.type = 'number'
  } else if (typeName === 'ZodBoolean') {
    result.type = 'boolean'
  } else if (typeName === 'ZodEnum') {
    result.type = 'string'
    result.enum = Object.values(def.values || {})
  } else if (typeName === 'ZodArray') {
    result.type = 'array'
    const itemDef = def.type?._def
    const itemTypeName = itemDef?.typeName || 'ZodString'
    if (itemTypeName === 'ZodObject') {
      // Array of objects — recursively build the items schema
      result.items = zodObjectToJsonSchema(def.type as { _def?: ZodDef; shape?: Record<string, unknown> })
    } else if (itemTypeName === 'ZodNumber') {
      result.items = { type: 'number' }
    } else {
      result.items = { type: 'string' }
    }
  } else if (typeName === 'ZodObject') {
    return zodObjectToJsonSchema(f as { _def?: ZodDef; shape?: Record<string, unknown> })
  } else {
    result.type = 'string'
  }

  void isOptionalField // tracked by the caller
  return result
}

function zodObjectToJsonSchema(obj: { _def?: ZodDef; shape?: Record<string, unknown> }): Record<string, unknown> {
  const shape: Record<string, unknown> = obj.shape || (obj._def as { shape?: () => Record<string, unknown> })?.shape?.() || {}
  const properties: Record<string, unknown> = {}
  const required: string[] = []

  for (const [key, value] of Object.entries(shape)) {
    const fieldDef = value as { _def?: ZodDef; isOptional?: () => boolean }
    const typeName = fieldDef._def?.typeName || 'ZodString'
    const isOpt = typeName === 'ZodOptional' || typeName === 'ZodDefault' || typeName === 'ZodNullable'
    properties[key] = zodFieldToJsonSchema(value)
    if (!isOpt) required.push(key)
  }

  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
  }
}
// ──────────────────────────────────────────────────────────────────────────────

/** Map a tool call to a human-readable ToolEntry for the summary block */
function getToolEntry(name: string, args: Record<string, unknown>): ToolEntry {
  const str = (v: unknown) => (v as string) || ''
  switch (name) {
    case 'jira_search_issues': {
      const jql = str(args.jql).toLowerCase()
      let label = 'Searched Jira'
      if (jql.includes('reporter = currentuser()')) label = 'Searched your created issues'
      else if (jql.includes('assignee = currentuser()')) label = 'Searched your assigned issues'
      else {
        const m = str(args.jql).match(/project\s*(?:=|in)\s*["']?([A-Z][A-Z0-9_-]+)["']?/i)
        if (m) label = `Searched ${m[1].toUpperCase()}`
      }
      if (args.maxResults) label += ` · top ${args.maxResults}`
      return { tool: name, label, group: 'jira' }
    }
    case 'jira_get_issue':
      return { tool: name, label: `Read ${str(args.issueIdOrKey || args.issueKey) || 'issue'}`, group: 'jira' }
    case 'jira_get_projects':
      return { tool: name, label: 'Loaded projects', group: 'jira' }
    case 'jira_get_issue_types':
      return { tool: name, label: `Loaded issue types for ${str(args.projectIdOrKey || args.projectKey)}`, group: 'jira' }
    case 'jira_get_transitions':
      return { tool: name, label: `Checked transitions for ${str(args.issueIdOrKey || args.issueKey)}`, group: 'jira' }
    case 'jira_lookup_user':
      return { tool: name, label: `Looked up "${str(args.searchString || args.query)}"`, group: 'jira' }
    case 'jira_create_issue': {
      const s = str(args.summary).slice(0, 45)
      return { tool: name, label: `Created ${str(args.issueTypeName || args.issueType)}: ${s}`, group: 'jira' }
    }
    case 'jira_update_issue':
      return { tool: name, label: `Updated ${str(args.issueIdOrKey || args.issueKey)}`, group: 'jira' }
    case 'jira_add_comment':
      return { tool: name, label: `Commented on ${str(args.issueIdOrKey || args.issueKey)}`, group: 'jira' }
    case 'jira_transition_issue':
      return { tool: name, label: `Moved ${str(args.issueIdOrKey || args.issueKey)} to new status`, group: 'jira' }
    case 'jira_upload_attachment':
      return { tool: name, label: `Attached file to ${str(args.issueIdOrKey || args.issueKey)}`, group: 'jira' }
    case 'file_read': {
      const fname = str(args.path).split(/[\\/]/).pop() || str(args.path)
      const fnLower = fname.toLowerCase()
      const verb = fnLower.endsWith('.pdf') ? 'Parsed PDF' : fnLower.endsWith('.docx') ? 'Read Word doc' : 'Read'
      return { tool: name, label: `${verb} ${fname}`, group: 'file' }
    }
    case 'file_read_ocr': {
      const fname = str(args.path).split(/[\\/]/).pop() || str(args.path)
      return { tool: name, label: `OCR read ${fname}`, group: 'file' }
    }
    case 'file_list': {
      const p = str(args.path) || '.'
      return { tool: name, label: `Browsed ${p === '.' ? 'workspace' : (p.split(/[\\/]/).pop() || p) + '/'}`, group: 'file' }
    }
    case 'file_write': {
      const fname = str(args.path).split(/[\\/]/).pop() || str(args.path)
      const ext = fname.split('.').pop()?.toLowerCase()
      const verb = ext === 'html' ? 'Generated' : ext === 'csv' ? 'Exported' : 'Wrote'
      return { tool: name, label: `${verb} ${fname}`, group: 'file' }
    }
    case 'file_search':
      return { tool: name, label: `Searched for "${str(args.pattern)}"`, group: 'file' }
    case 'file_mkdir':
      return { tool: name, label: `Created folder ${str(args.path).split(/[\\/]/).pop() || str(args.path)}/`, group: 'file' }
    case 'memory_read':
      return { tool: name, label: 'Checked memory', group: 'memory' }
    case 'memory_update':
      return { tool: name, label: 'Saved to learned memory', group: 'memory' }
    case 'memory_delete':
      return { tool: name, label: `Deleted memory matching "${str(args.query)}"`, group: 'memory' }
    case 'scratchpad_write':
      return { tool: name, label: 'Updated scratchpad', group: 'memory' }
    case 'jira_batch_create_issues': {
      const issues = (args.issues as Array<Record<string, unknown>>) || []
      return { tool: name, label: `Creating ${issues.length} Jira issue${issues.length !== 1 ? 's' : ''}`, group: 'jira' }
    }
    default:
      return { tool: name, label: name, group: 'file' }
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

interface AgentConfig {
  userProfile: UserProfile | null
  jiraMetadata?: JiraMetadataStore | null
  memory?: MemoryStore | null
  loadMemory?: () => Promise<MemoryStore | null>
  maxIterations?: number // 0 = no limit, default 10
  onMessage: (message: Message) => void
  /** Called to update the content of an existing message (used for streaming) */
  onUpdateMessage?: (id: string, content: string, isStreaming: boolean) => void
  onPendingAction: (action: PendingAction) => void
  executeJiraTool: (name: string, args: Record<string, unknown>) => Promise<unknown>
  executeFileTool: (name: string, args: Record<string, unknown>) => Promise<unknown>
  executeMemoryTool: (name: string, args: Record<string, unknown>) => Promise<unknown>
  callAI: (messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>, tools?: unknown[]) => Promise<{
    success: boolean
    data?: AIResponse
    error?: string
  }>
  /** Optional streaming version of callAI — if provided, used for better UX */
  callAIStream?: (
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    tools: unknown[] | undefined,
    onToken: (token: string) => void
  ) => Promise<{ success: boolean; data?: AIResponse; error?: string }>
  /**
   * Optional reasoning model — used for complex tasks (scratchpad written, multi-step).
   * Falls back to callAI when not configured.
   */
  callAIReasoning?: (messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>, tools?: unknown[]) => Promise<{ success: boolean; data?: AIResponse; error?: string }>
  callAIReasoningStream?: (
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    tools: unknown[] | undefined,
    onToken: (token: string) => void
  ) => Promise<{ success: boolean; data?: AIResponse; error?: string }>
}

/**
 * Mirai Agent - AI Project Management Assistant
 * 
 * Handles conversation flow, tool execution, and response formatting.
 * All Jira tool results are JSON - we send them back to AI for formatting.
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

  constructor(config: AgentConfig) {
    this.config = config
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
    const userMsg: Message = {
      id: uuidv4(),
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString(),
    }
    this.conversationHistory.push(userMsg)
    this.config.onMessage(userMsg)

    try {
      await this.runAgentLoop()
    } catch (error) {
      const errorMsg: Message = {
        id: uuidv4(),
        role: 'assistant',
        content: `I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}. Please check your API configuration in Settings.`,
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

    while (!hasLimit || iterations < maxIterations) {
      // Check abort flag at the top of every iteration
      if (this.abortFlag) {
        this.abortFlag = false
        console.log('[Agent] Aborted by user.')
        break
      }

      iterations++
      console.log(`[Agent] Loop iteration ${iterations}${hasLimit ? `/${maxIterations}` : ''}`)

      const { response, wasStreamed } = await this.callAI()
      if (!response) throw new Error('No response from AI')

      if (response.toolCalls && response.toolCalls.length > 0) {
        let hadError = false
        const toolEntries: ToolEntry[] = []

        for (const toolCall of response.toolCalls) {
          console.log('[Agent] Tool call:', toolCall.name, toolCall.arguments)

          // ── Planning note ──────────────────────────────────────────────────
          // Batch issue creation benefits from a traceable plan, but forcing the
          // model to make an extra scratchpad_write call can create loops. Instead,
          // derive a compact local note from the proposed issues and continue.
          if (
            toolCall.name === 'jira_batch_create_issues' &&
            !this.scratchpadWrittenThisTurn
          ) {
            this.recordBatchCreationScratchpad(toolCall.arguments)
          }
          // ── End planning note ──────────────────────────────────────────────

          if (requiresConfirmation(toolCall.name)) {
            const pendingAction: PendingAction = {
              id: toolCall.id,
              type: toolCall.name as PendingAction['type'],
              description: getActionConfirmationPrompt(toolCall.name, toolCall.arguments),
              data: toolCall.arguments,
              preview: this.getActionPreview(toolCall.name, toolCall.arguments),
            }
            this.pendingActions.set(toolCall.id, pendingAction)
            this.config.onPendingAction(pendingAction)
            this.config.onMessage({
              id: uuidv4(),
              role: 'assistant',
              content: pendingAction.description,
              timestamp: new Date().toISOString(),
              pendingAction,
            })
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
            formattedResult = this.formatToolResultForAI(toolCall.name, result)

            const resultData = result as { success?: boolean; error?: string }
            const isError = resultData.success === false || formattedResult.startsWith('Error:') || formattedResult.includes('MCP error')
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
            }
          }

          // Record tool entry for the summary block (UI only — not in history)
          toolEntries.push(getToolEntry(toolCall.name, toolCall.arguments))

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
      const strippedContent = rawContent.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()

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
  }

  /**
   * Call the AI.
   * Handles streaming with a live <think>...</think> parser:
   *  - content inside <think>...</think> → emitted as a type:'thinking' message with elapsed time
   *  - content outside → streamed normally to the response bubble
   * Returns wasStreamed=true when the response was already pushed to UI and history.
   */
  private async callAI(): Promise<{ response: AIResponse | null; wasStreamed: boolean }> {
    // Append the live session scratchpad to the system prompt so the agent
    // always knows what it has already done this turn — even if old tool result
    // messages have been pushed out of the 40-message context window.
    const scratchpadSection = this.sessionScratchpad
      ? `\n\n## Session Scratchpad — What You've Done This Turn\n${this.sessionScratchpad}\n\nDo NOT re-read files or re-run searches that are already listed above. Use their results from context.`
      : ''
    if (this.config.loadMemory) {
      try {
        this.config.memory = await this.config.loadMemory()
      } catch (error) {
        console.warn('[Agent] Failed to refresh memory before prompt:', error)
      }
    }
    const systemPrompt = getSystemPrompt(this.config.userProfile, this.config.jiraMetadata, this.config.memory) + scratchpadSection

    // Simple chronological window — last 40 messages in order.
    // tool_summary messages are UI-only artifacts (grouped icons bar) and carry
    // no reasoning value, so they are excluded from what the model sees.
    const relevantHistory = this.conversationHistory
      .filter(m => m.type !== 'tool_summary')
      .slice(-40)

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
      ...relevantHistory.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ]

    const tools = toolDefinitions.map(tool => ({
      type: 'function' as const,
      function: { name: tool.name, description: tool.description, parameters: this.zodToJsonSchema(tool.schema) },
    }))

    // ── Choose model ──────────────────────────────────────────────────────────
    // Use the reasoning model for the INITIAL analysis phase — before the agent
    // has committed a plan to the scratchpad. Once planning is done and the
    // scratchpad has content, switch back to the main model for execution
    // (tool calls, Jira writes, etc.) so we don't add latency to routine steps.
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

    // ── Streaming path ────────────────────────────────────────────────────────
    if (effectiveCallAIStream && this.config.onUpdateMessage) {
      const THINK_OPEN = '<think>'
      const THINK_CLOSE = '</think>'

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
          if (trimmed.startsWith(THINK_OPEN)) {
            // Confirmed: this response opens with <think>
            phase = 'in_think'
            thinkTimerStart = Date.now()
            // The content so far (after <think>) goes into the think buffer
            buffer = trimmed.slice(THINK_OPEN.length)
            return
          }
          // If the trimmed buffer is longer than THINK_OPEN and doesn't start with it
          // → this is a direct response, switch to streaming mode
          if (trimmed.length > THINK_OPEN.length && !THINK_OPEN.startsWith(trimmed.slice(0, THINK_OPEN.length))) {
            phase = 'response'
            flushToResponse(buffer)
            buffer = ''
            return
          }
          // Might still be a prefix of <think> or just whitespace — keep scanning
          return
        }

        if (phase === 'in_think') {
          if (buffer.includes(THINK_CLOSE)) {
            const closeIdx = buffer.indexOf(THINK_CLOSE)
            const thinkContent = buffer.slice(0, closeIdx)
            const afterThink = buffer.slice(closeIdx + THINK_CLOSE.length)
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

      const result = await effectiveCallAIStream(messages, tools, onToken)
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
          // Tool-call round — remove streaming placeholder if one was started
          if (responseStarted) this.config.onUpdateMessage!(responseMsgId, '', false)
          return { response, wasStreamed: false }
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
    const result = await effectiveCallAI(messages, tools)
    if (!result.success) throw new Error(result.error || 'AI request failed')
    const response = result.data || null

    // Extract all <think>...</think> blocks from non-streaming responses,
    // emit each as a collapsible thinking message, and strip them from content.
    if (response?.content) {
      const thinkRegex = /<think>([\s\S]*?)<\/think>/gi
      let match: RegExpExecArray | null
      while ((match = thinkRegex.exec(response.content)) !== null) {
        const thinkContent = match[1].trim()
        if (thinkContent) {
          this.config.onMessage({ id: uuidv4(), role: 'assistant', content: thinkContent, timestamp: new Date().toISOString(), type: 'thinking', thinkingMs: 0 })
        }
      }
      response.content = response.content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
    }

    return { response, wasStreamed: false }
  }

  /**
   * Execute a tool
   */
  /**
   * After a successful write tool, invalidate stale read-cache entries so that
   * the next read call fetches fresh data rather than returning a cached snapshot.
   */
  private invalidateCacheAfterWrite(toolName: string, args: Record<string, unknown>): void {
    // Jira writes → drop all cached Jira read results for that project/issue
    const jiraWriteTools = ['jira_create_issue', 'jira_update_issue', 'jira_add_comment', 'jira_transition_issue', 'jira_upload_attachment']
    if (jiraWriteTools.includes(toolName)) {
      for (const key of this.toolResultCache.keys()) {
        if (key.startsWith('jira_search_issues:') || key.startsWith('jira_get_issue:')) {
          this.toolResultCache.delete(key)
        }
      }
    }
    // file_write → drop cached read for that exact path
    if (toolName === 'file_write') {
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
    const str = (v: unknown) => (v as string) || ''
    let note = ''
    if (toolName === 'file_read' || toolName === 'file_read_ocr') {
      const fname = str(args.path).split(/[\\/]/).pop() || str(args.path)
      const lines = formattedResult.split('\n').length
      note = toolName === 'file_read_ocr'
        ? `✓ OCR read: ${fname} (${lines} lines of content available in context)`
        : `✓ Read: ${fname} (${lines} lines of content available in context)`
    } else if (toolName === 'file_search') {
      const pattern = str(args.pattern || args.name)
      const matchCount = (formattedResult.match(/\n/g) || []).length + 1
      note = `✓ Searched for "${pattern}" → ${formattedResult.startsWith('No') ? 'no results' : `${matchCount} match(es)`}`
    } else if (toolName === 'file_list') {
      note = `✓ Listed workspace files`
    } else if (toolName === 'jira_create_issue') {
      // Try to extract the new issue key from the result
      const keyMatch = formattedResult.match(/[A-Z]+-\d+/)
      note = `✓ Created Jira issue${keyMatch ? ': ' + keyMatch[0] : ''}`
    } else if (toolName === 'jira_update_issue') {
      note = `✓ Updated Jira issue: ${str(args.issueIdOrKey)}`
    } else if (toolName === 'jira_transition_issue') {
      note = `✓ Transitioned issue: ${str(args.issueIdOrKey)}`
    }
    if (note) {
      this.sessionScratchpad += (this.sessionScratchpad ? '\n' : '') + note
    }
  }

  private recordBatchCreationScratchpad(args: Record<string, unknown>): void {
    const issues = (args.issues as Array<Record<string, unknown>>) || []
    if (issues.length === 0) return

    const project = (issues[0]?.projectKey as string) || 'Jira'
    const preview = issues
      .slice(0, 12)
      .map((issue, index) => {
        const type = issue.issueTypeName || issue.issueType || 'Task'
        const summary = issue.summary || '(untitled)'
        return `${index + 1}. ${type} — ${summary}`
      })
      .join('\n')

    this.sessionScratchpad += `${this.sessionScratchpad ? '\n' : ''}Planned Jira batch creation: ${issues.length} issue(s) in ${project}\n${preview}${issues.length > 12 ? `\n...and ${issues.length - 12} more` : ''}`
    this.scratchpadWrittenThisTurn = true
  }

  private shouldNudgeActionFirst(responseText: string): boolean {
    const latestUser = [...this.conversationHistory]
      .reverse()
      .find(m => m.role === 'user' && !m.content.startsWith('[SYSTEM]'))?.content
      ?.toLowerCase() || ''

    const looksActionable = /\b(create|add|update|change|transition|move|attach|upload|schedule|automate|make)\b/.test(latestUser)
      && /\b(jira|issue|issues|task|tasks|ticket|tickets|comment|attachment|report|automation)\b/.test(latestUser)

    if (!looksActionable) return false

    // Clarifying questions are allowed. The guard targets prose plans/results
    // where the model should have called a tool instead.
    const isClarification = responseText.includes('?') && responseText.length < 500
    if (isClarification) return false

    const looksLikeWallText = responseText.length > 700
      || /^\s*(?:[-*]|\d+\.)\s+/m.test(responseText)
      || /\b(I would|I will|I'll|I can)\b/i.test(responseText)

    return looksLikeWallText
  }

  private async executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    console.log('[Agent] Executing tool:', name, 'with args:', args)
    
    if (name.startsWith('jira_')) {
      return this.config.executeJiraTool(name, args)
    } else if (name.startsWith('file_')) {
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
   * Converts MCP/Jira JSON into compact readable text to minimise tokens per loop.
   */
  private formatToolResultForAI(toolName: string, result: unknown): string {
    const data = result as { success?: boolean; data?: unknown; error?: string }

    if (data.success === false) return `Error: ${data.error || 'Unknown error'}`

    // Unwrap MCP envelope: { data: { content: [{ text }] } }
    const mcpData = data.data as { content?: Array<{ text?: string }> }
    let raw = ''
    if (mcpData?.content?.[0]?.text) {
      raw = mcpData.content[0].text
    } else if (data.data) {
      raw = typeof data.data === 'string' ? data.data : JSON.stringify(data.data)
    } else {
      return 'Done.'
    }

    // --- Jira search: compact bullet list ---
    if (toolName === 'jira_search_issues') {
      try {
        const parsed = JSON.parse(raw)
        const issues: unknown[] = parsed.values ?? parsed.issues ?? (Array.isArray(parsed) ? parsed : [])
        if (issues.length === 0) return 'No issues found.'
        const lines = (issues as Array<Record<string, unknown>>).map(i => {
          const fields = (i.fields ?? i) as Record<string, unknown>
          const status = (fields.status as Record<string, unknown>)?.name ?? fields.status ?? ''
          const assignee = (fields.assignee as Record<string, unknown>)?.displayName ?? ''
          const created = fields.created ? (fields.created as string).slice(0, 10) : ''
          return `- ${i.key}: ${fields.summary ?? ''}  [${status}]${assignee ? ` — ${assignee}` : ''}${created ? ` (${created})` : ''}`
        })
        return `${issues.length} issue(s):\n${lines.join('\n')}`
      } catch { /* fall through */ }
    }

    // --- Single issue: compact key fields ---
    if (toolName === 'jira_get_issue') {
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>
        const fields = (parsed.fields ?? parsed) as Record<string, unknown>
        const status = (fields.status as Record<string, unknown>)?.name ?? ''
        const assignee = (fields.assignee as Record<string, unknown>)?.displayName ?? 'Unassigned'
        const extractAdf = (node: unknown): string => {
          const n = node as Record<string, unknown>
          if (!n) return ''
          if (n.type === 'text') return n.text as string ?? ''
          return ((n.content as unknown[]) ?? []).map(extractAdf).join(' ')
        }
        const description = typeof fields.description === 'string'
          ? fields.description.slice(0, 300)
          : extractAdf(fields.description).slice(0, 300)
        const comments = ((fields.comment as Record<string, unknown>)?.comments as Array<Record<string, unknown>> ?? [])
          .slice(-3).map(c => `  • [${(c.author as Record<string, unknown>)?.displayName ?? ''}] ${typeof c.body === 'string' ? c.body.slice(0, 100) : ''}`)
        return [
          `${parsed.key}: ${fields.summary}`,
          `Status: ${status} | Assignee: ${assignee}`,
          description ? `Description: ${description}` : '',
          comments.length ? `Recent comments:\n${comments.join('\n')}` : '',
        ].filter(Boolean).join('\n')
      } catch { /* fall through */ }
    }

    // --- Transitions: id + name list ---
    if (toolName === 'jira_get_transitions') {
      try {
        const parsed = JSON.parse(raw)
        const transitions: Array<Record<string, unknown>> = parsed.transitions ?? (Array.isArray(parsed) ? parsed : [])
        return transitions.map(t => `- ${t.id}: ${t.name}`).join('\n') || 'No transitions available.'
      } catch { /* fall through */ }
    }

    // --- Projects: key + name list ---
    if (toolName === 'jira_get_projects') {
      try {
        const parsed = JSON.parse(raw)
        const projects: Array<Record<string, unknown>> = parsed.values ?? (Array.isArray(parsed) ? parsed : [])
        return projects.map(p => `- ${p.key}: ${p.name}`).join('\n') || 'No projects found.'
      } catch { /* fall through */ }
    }

    // --- Files: compact, explicit search/list results ---
    if (toolName === 'file_search' || toolName === 'file_list') {
      try {
        const parsed = JSON.parse(raw)
        const files: Array<Record<string, unknown>> = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed.files)
            ? parsed.files
            : []

        if (files.length === 0) {
          return toolName === 'file_search'
            ? 'No files found for this search.'
            : 'No files found in this folder.'
        }

        const lines = files.slice(0, 80).map(file => {
          const name = String(file.name || file.path || '(unnamed)')
          const filePath = String(file.path || name)
          const suffix = file.isDirectory ? '/' : ''
          return `- ${filePath}${suffix}`
        })

        const shown = files.length > lines.length
          ? `\n...and ${files.length - lines.length} more`
          : ''

        return `${files.length} file(s):\n${lines.join('\n')}${shown}`
      } catch { /* fall through */ }
    }

    // Pass everything else verbatim — no artificial caps.
    // If the model's context window is exceeded it will error naturally.
    return raw
  }

  private getToolFailureMessage(result: unknown, formattedResult: string): string | null {
    const data = result as { success?: boolean; data?: unknown; error?: string }
    if (data.success === false) return data.error || formattedResult || 'Unknown error'
    if (formattedResult.startsWith('Error:') || formattedResult.includes('MCP error')) return formattedResult

    const mcpData = data.data as { isError?: boolean; content?: Array<{ text?: string }> }
    const rawText = mcpData?.content?.[0]?.text
    if (mcpData?.isError || rawText?.includes('"error":true')) {
      if (!rawText) return formattedResult || 'Unknown Jira error'
      try {
        const parsed = JSON.parse(rawText) as { message?: string; error?: unknown }
        return parsed.message || String(parsed.error || formattedResult || rawText)
      } catch {
        return rawText
      }
    }

    return null
  }

  private isSystemicJiraFailure(message: string): boolean {
    return /(?:\b403\b|forbidden|unauthorized|permission|tenant is restricted|suspended-inactivity|authentication|not authorized)/i.test(message)
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

    // ── Batch issue creation ───────────────────────────────────────────────
    if (action.type === 'jira_batch_create_issues') {
      const issues = (action.data.issues as Array<Record<string, unknown>>) || []
      const created: string[] = []
      const failed: string[] = []

      for (const issue of issues) {
        const result = await this.executeTool('jira_create_issue', issue)
        const fmt = this.formatToolResultForAI('jira_create_issue', result)
        const failureMessage = this.getToolFailureMessage(result, fmt)
        // Try to extract the issue key from the result
        const keyMatch = fmt.match(/[A-Z]+-\d+/)
        const label = keyMatch ? keyMatch[0] : issue.summary as string
        if (failureMessage) {
          failed.push(`${issue.summary}: ${failureMessage}`)
          if (this.isSystemicJiraFailure(failureMessage)) {
            console.log('[Agent] Stopping batch creation after systemic Jira failure:', failureMessage)
            break
          }
        } else {
          created.push(label)
          this.updateScratchpadAfterTool('jira_create_issue', issue, fmt)
        }
        // Cache the individual create result
        this.toolResultCache.set(`jira_create_issue:${JSON.stringify(issue)}`, fmt)
        this.invalidateCacheAfterWrite('jira_create_issue', issue)
      }

      const summary = created.length > 0
        ? `Created ${created.length} issue(s): ${created.join(', ')}.`
        : ''
      const errors = failed.length > 0
        ? ` ${created.length > 0 ? 'Stopped after an error' : 'Action blocked'}: ${failed[0]}${failed.length > 1 ? ` (${failed.length} total failures)` : ''}.`
        : ''
      const completionMsg: Message = {
        id: uuidv4(),
        role: 'assistant',
        content: summary + errors || 'No issues were created.',
        timestamp: new Date().toISOString(),
      }
      this.conversationHistory.push(completionMsg)
      this.config.onMessage(completionMsg)
      return
    }

    // ── Single-tool approval (create, update, comment, transition, etc.) ──
    const result = await this.executeTool(action.type, action.data)
    const formattedResult = this.formatToolResultForAI(action.type, result)

    // Persist the result in history so the agent has full context when it resumes
    this.conversationHistory.push({
      id: uuidv4(),
      role: 'assistant',
      content: `[tool_result: ${action.type}]\n${formattedResult}`,
      timestamp: new Date().toISOString(),
    })
    this.updateScratchpadAfterTool(action.type, action.data, formattedResult)
    this.invalidateCacheAfterWrite(action.type, action.data)

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
    switch (toolName) {
      case 'jira_create_issue':
        return `Create: ${args.summary}`
      case 'jira_update_issue':
        return `Update: ${args.issueIdOrKey || args.issueKey}`
      case 'jira_add_comment':
        return `Comment on: ${args.issueIdOrKey || args.issueKey}`
      case 'jira_transition_issue':
        return `Transition: ${args.issueIdOrKey || args.issueKey}`
      case 'file_write':
        return `Write to: ${args.path}`
      default:
        return toolName
    }
  }


  /**
   * Convert Zod schema to JSON Schema (simplified)
   */
  /**
   * Convert a Zod schema to JSON Schema format understood by LLM tool-calling APIs.
   * Handles: string, number, boolean, arrays of primitives, arrays of objects
   * (nested ZodObject), optional/default wrappers, and enum types.
   */
  private zodToJsonSchema(schema: unknown): Record<string, unknown> {
    return zodFieldToJsonSchema(schema)
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
