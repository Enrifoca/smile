import systemPrompt from './core/system.md?raw'
import plannerPrompt from './core/planner.md?raw'
import { UserProfile } from '../agent/types'
import { buildCommunicationPreferencesPrompt } from '../agent/communicationPreferences'
import { ConnectorScope } from '../connectors/registry'
import { MemoryStore, formatMemoryForPrompt } from '../types/memory'
import { renderPrompt, section } from './loader'

function buildUserContext(profile: UserProfile | null): string {
  return buildCommunicationPreferencesPrompt(profile)
}

function buildWriteConfirmationMode(mode?: 'chat' | 'headless'): string {
  if (mode === 'headless') {
    return 'Automated mode: execute pre-approved work directly without asking for permission. Do not output approval requests. Call the tools and complete the task.'
  }

  return [
    'For write operations:',
    '- In the same turn, write a short chat message listing exactly what you will create or change (titles, targets, counts), then call the write tool.',
    '- Accept/Refuse buttons appear above the composer. Do not ask "Shall I proceed?" — the user approves with those buttons or by typing changes in chat.',
  ].join('\n')
}

export function getSystemPrompt(
  profile: UserProfile | null,
  connectorSections: string[] = [],
  memory?: MemoryStore | null,
  mode?: 'chat' | 'headless',
  monitoredScopes: ConnectorScope[] = [],
): string {
  const connectorContext = connectorSections.filter(Boolean).join('\n\n')
  const memoryText = memory ? formatMemoryForPrompt(memory, monitoredScopes) : ''

  return renderPrompt(systemPrompt, {
    writeConfirmationMode: buildWriteConfirmationMode(mode),
    userContext: section('User Context', buildUserContext(profile)),
    connectorContext: section('Connector Context', connectorContext),
    memoryContext: memoryText,
  })
}

export function getPlannerSystemPrompt(connectorSections: string[] = []): string {
  const connectorContext = connectorSections.filter(Boolean).join('\n\n')
  return renderPrompt(plannerPrompt, {
    connectorContext: section('Connector Environment', connectorContext),
  })
}

export function buildPlannerMessages(
  userMessage: string,
  recentHistory?: Array<{ role: 'user' | 'assistant'; content: string }>,
  connectorSections: string[] = []
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const cleanHistory = (recentHistory || [])
    .filter(message => !message.content.startsWith('[Tool:'))
    .slice(-10)

  return [
    { role: 'system', content: getPlannerSystemPrompt(connectorSections) },
    ...cleanHistory,
    { role: 'user', content: userMessage },
  ]
}

export function getActionConfirmationPrompt(actionType: string): string {
  return `Action: ${actionType}`
}
