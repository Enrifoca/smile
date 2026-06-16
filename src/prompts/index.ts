import systemPrompt from './core/system.md?raw'

import { UserProfile } from '../agent/types'

import { buildCommunicationPreferencesPrompt } from '../agent/communicationPreferences'

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



/** Foundation tier — core agent rules (stable, cache-friendly). */

export function getSystemPromptFoundation(mode?: 'chat' | 'headless'): string {

  return renderPrompt(systemPrompt, {

    writeConfirmationMode: buildWriteConfirmationMode(mode),

    userContext: '',

    connectorContext: '',

    memoryContext: '',

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

