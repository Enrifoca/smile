import systemPrompt from './core/system.md?raw'
import plannerPrompt from './core/planner.md?raw'
import { UserProfile } from '../agent/types'
import { MemoryStore, formatMemoryForPrompt } from '../types/memory'
import { renderPrompt, section } from './loader'

function buildUserContext(profile: UserProfile | null): string {
  if (!profile) return ''

  return [
    'Communication preferences:',
    `- Style: ${profile.style || 'balanced (technical and accessible)'}`,
    `- Response length: ${profile.verbosity || 'balanced'}`,
    profile.focusProjects?.length ? `- Focus scopes: ${profile.focusProjects.join(', ')}` : '',
  ].filter(Boolean).join('\n')
}

function buildWriteConfirmationMode(mode?: 'chat' | 'headless'): string {
  if (mode === 'headless') {
    return 'Automated mode: execute pre-approved work directly without asking for permission. Do not output approval requests. Call the tools and complete the task.'
  }

  return [
    'For write operations:',
    '- Call the tool directly with accurate, complete arguments.',
    '- The UI automatically shows a confirmation card.',
    '- Do not ask "Shall I proceed?" in chat. The confirmation button handles that.',
  ].join('\n')
}

export function getSystemPrompt(
  profile: UserProfile | null,
  connectorSections: string[] = [],
  memory?: MemoryStore | null,
  mode?: 'chat' | 'headless'
): string {
  const connectorContext = connectorSections.filter(Boolean).join('\n\n')
  const memoryText = memory ? formatMemoryForPrompt(memory) : ''

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
