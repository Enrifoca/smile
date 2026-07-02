import { UserProfile } from './types'
import { ConnectorScope } from '../connectors/registry'
import { MemoryStore, formatMemoryForPrompt } from '../types/memory'
import { getSystemPromptFoundation, getSystemPromptScopeBlocks, buildEnvironmentContextSection } from '../prompts'

export interface PromptTierTurnContext {
  contextSection: string
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
    buildEnvironmentContextSection(),
    memory ? formatMemoryForPrompt(memory, monitoredScopes) : '',
    turn.capabilitiesSection,
    turn.contextSection,
  ].filter(Boolean)

  const turnBlock = turnParts.join('\n\n').trim()
  const combined = [foundation, scope, turnBlock].filter(Boolean).join('\n\n')

  return { foundation, scope, turn: turnBlock, combined }
}
