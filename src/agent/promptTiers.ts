import { UserProfile } from './types'
import { ConnectorScope } from '../connectors/registry'
import { MemoryStore, formatMemoryForPrompt } from '../types/memory'
import { getSystemPromptFoundation, getSystemPromptScopeBlocks } from '../prompts'

export interface PromptTierTurnContext {
  scratchpadSection: string
  contextSection: string
  planSection: string
  reasoningLightSection: string
  deepThinkingSection: string
  capabilitiesSection: string
}

export interface AssembledPromptTiers {
  foundation: string
  scope: string
  turn: string
  /** Single system string for providers without tier support */
  combined: string
}

export function assemblePromptTiers(
  profile: UserProfile | null,
  connectorSections: string[],
  memory: MemoryStore | null | undefined,
  monitoredScopes: ConnectorScope[],
  turn: PromptTierTurnContext,
): AssembledPromptTiers {
  const foundation = getSystemPromptFoundation()
  const scopeBlocks = getSystemPromptScopeBlocks(profile, connectorSections)
  const scope = scopeBlocks.join('\n\n').trim()

  const turnParts = [
    memory ? formatMemoryForPrompt(memory, monitoredScopes) : '',
    turn.capabilitiesSection,
    turn.deepThinkingSection,
    turn.planSection,
    turn.scratchpadSection,
    turn.contextSection,
    turn.reasoningLightSection,
  ].filter(Boolean)

  const turnBlock = turnParts.join('\n\n').trim()
  const combined = [foundation, scope, turnBlock].filter(Boolean).join('\n\n')

  return { foundation, scope, turn: turnBlock, combined }
}

export function buildReasoningLightSection(
  isFirstIteration: boolean,
  hasReasoningModel: boolean,
  deepThinkingPending: boolean,
): string {
  if (!isFirstIteration || !hasReasoningModel || deepThinkingPending) return ''
  return [
    '## Reasoning (this call only — light mode)',
    'Keep `<think>` to 2–4 short sentences.',
    'For actionable requests: call the required tools directly — never stop at "I will…" without tools.',
    'Before any write tool, verify target, scope, fields, and whether the write is actually needed. If more read/search/list tools could change the write, call them first.',
    'Do not narrate tool progress in chat; the activity stream shows running/completed tool states. You may include one brief operational prologue only when the same response also calls tools; if there are no tool calls, visible prose is the final answer and should be sent once.',
    'Put durable plans in scratchpad / Current plan (`scratchpad_write` with `update_plan: true`), not chat-only prose.',
    'Call `deep_thinking` when you need extended reasoning or deep analysis — not for simple single-step tasks.',
  ].join('\n')
}

export function buildScratchpadSection(scratchpadText: string): string {
  if (!scratchpadText.trim()) return ''
  return [
    '## Working notes (this turn)',
    scratchpadText.trim(),
    '',
    'Do NOT re-read files or re-run searches already marked above. File content lives in conversation history.',
  ].join('\n')
}

export function buildPlanSection(plan: string): string {
  if (!plan.trim()) return ''
  return `## Current plan\n${plan.trim()}`
}
