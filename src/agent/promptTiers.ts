import { UserProfile } from './types'
import { ConnectorScope } from '../connectors/registry'
import { MemoryStore, formatMemoryForPrompt } from '../types/memory'
import { getSystemPromptFoundation, getSystemPromptScopeBlocks } from '../prompts'

export interface PromptTierTurnContext {
  intentSection: string
  scratchpadSection: string
  contextSection: string
  analysisSection: string
  planSection: string
  reasoningLightSection: string
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
    turn.intentSection,
    turn.planSection,
    turn.analysisSection,
    turn.scratchpadSection,
    turn.contextSection,
    turn.reasoningLightSection,
  ].filter(Boolean)

  const turnBlock = turnParts.join('\n\n').trim()
  const combined = [foundation, scope, turnBlock].filter(Boolean).join('\n\n')

  return { foundation, scope, turn: turnBlock, combined }
}

export function buildReasoningLightSection(isFirstIteration: boolean, hasReasoningModel: boolean): string {
  if (!isFirstIteration || !hasReasoningModel) return ''
  return [
    '## Reasoning (this call only — light mode)',
    'Keep `<think>` to 2–4 short sentences.',
    'For actionable requests: one short acknowledgment in visible prose is OK, but you must call the required tools in the same response — never stop at "I will…" without tools.',
    'Put durable plans in scratchpad / Current plan (`scratchpad_write` with `update_plan: true`), not chat-only prose.',
    'Call `deep_thinking` only when analysis is ambiguous after reads; it is not required for simple tasks.',
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

export function buildAnalysisSection(analysis: string): string {
  if (!analysis.trim()) return ''
  const capped = analysis.length > 1200 ? `${analysis.slice(0, 1197)}…` : analysis
  return `## Analysis (this turn)\n${capped}`
}
