import systemPrompt from './core/system.md?raw'

import { UserProfile } from '../agent/types'

import { buildCommunicationPreferencesPrompt } from '../agent/communicationPreferences'

import { renderPrompt, section } from './loader'

function buildUserContext(profile: UserProfile | null): string {
  return buildCommunicationPreferencesPrompt(profile)
}

/** Build a short environment context block (current date, time, timezone). */
export function buildEnvironmentContextSection(): string {
  const now = new Date()
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const date = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const time = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  })

  return [
    '## Environment Context',
    `- Current date: ${date}`,
    `- Current time: ${time}`,
    `- User timezone: ${timeZone}`,
  ].join('\n')
}

const WRITE_CONFIRMATION_MODE = [
  'For write operations:',
  '- In the same turn, write a short chat message listing exactly what you will create or change (titles, targets, counts), then call the write tool.',
  '- Do not call a write tool in the same tool-call batch as read/search/list tools that could change whether the write is needed. Run the reads first, inspect their tool results, then decide.',
  '- Keep that proposal concise; tool progress appears in the activity stream, not as repeated chat narration.',
  '- Accept/Refuse buttons appear above the composer. Do not ask "Shall I proceed?" or similar questions — the user approves with those buttons or by typing changes in chat.',
].join('\n')

/** Foundation tier — core agent rules (stable, cache-friendly). */
export function getSystemPromptFoundation(): string {
  return renderPrompt(systemPrompt, {
    writeConfirmationMode: WRITE_CONFIRMATION_MODE,
  })
}

/** Scope tier blocks — user profile and connector domain (semi-stable). */
export function getSystemPromptScopeBlocks(
  profile: UserProfile | null,
  connectorSections: string[] = [],
): string[] {
  const connectorContext = connectorSections.filter(Boolean).join('\n\n')
  const blocks: string[] = []
  const userBlock = section('User Context', buildUserContext(profile))
  if (userBlock.trim()) blocks.push(userBlock)
  const connectorBlock = section('Connector Context', connectorContext)
  if (connectorBlock.trim()) blocks.push(connectorBlock)
  return blocks
}
