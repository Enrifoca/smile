/**
 * Memory System Types
 *
 * The memory system stores user-specific knowledge to help the agent
 * replicate the user's writing style and preferences.
 */

import { selectLearnedNotesForPrompt } from '../memory/learnedBudget'
import { formatActiveScopesForPrompt } from '../memory/promptSections'
import { ConnectorScope } from '../connectors/registry'

// Memory entry source
export type MemorySource = 'learned' | 'user'

// Base memory entry
export interface MemoryEntry {
  id: string
  content: string
  createdAt: string
  updatedAt: string
  source: MemorySource
}

// General memory - preferences, behaviors, connector conventions
export interface GeneralMemory {
  entries: MemoryEntry[]
}

// Lexicon memory - vocabulary, phrases, tone
export interface LexiconMemory {
  entries: MemoryEntry[]
  // Common phrases extracted from user's issues
  commonPhrases: string[]
  // Vocabulary patterns
  vocabularyNotes: string[]
}

// Issue example stored for style learning
export interface IssueExample {
  issueKey: string
  summary: string
  description?: string
  createdAt: string
  // Custom field values (to learn which fields user fills)
  customFields?: Record<string, unknown>
}

// Issue type memory - examples and patterns for a specific issue type
export interface IssueTypeMemory {
  issueTypeName: string
  issueTypeId: string
  // Real examples from user (max 10, rotating)
  examples: IssueExample[]
  // Extracted patterns (optional, for display)
  patterns?: {
    avgSummaryLength?: number
    avgDescriptionLength?: number
    commonWords?: string[]
    structureNotes?: string[]
  }
  updatedAt: string
}

// Complete memory store
export interface MemoryStore {
  // Highest-priority, user-owned instructions. Stored as plain Markdown in
  // .smile/memories/user.md and injected before every agent response.
  userMarkdown: string
  /** Condensed older learned notes for prompt budget (full entries remain on disk). */
  learnedRollup: string
  general: GeneralMemory
  lexicon: LexiconMemory
  issueTypes: Record<string, IssueTypeMemory> // keyed by issue type name
  lastSyncedAt: string | null
  version: number // for future migrations
}

export const defaultUserMemoryMarkdown = ''

/**
 * Format memory for the AI system prompt
 */
export function formatMemoryForPrompt(memory: MemoryStore, monitoredScopes: ConnectorScope[] = []): string {
  if (!memory) return ''

  const lines: string[] = [
    '## smile:D Memory (Always Loaded)',
    '',
    'Memory is already loaded for this response. Do not call memory_read just to check it.',
    'Priority: current user message > User Memory > connector context > Learned Notes > defaults.',
    'If User Memory conflicts with Learned Notes, follow User Memory.',
    '',
  ]

  const userMarkdown = memory.userMarkdown?.trim()
  if (userMarkdown) {
    lines.push('### User Memory (Highest Priority)')
    lines.push(userMarkdown)
    lines.push('')
  }

  const learned = selectLearnedNotesForPrompt(memory)
  if (learned.recentLines.length > 0 || learned.rollup) {
    lines.push('### Learned Notes (Lower Priority)')
    lines.push('Store habits and preferences only — not tool output or connector data.')
    if (learned.rollup) {
      lines.push('')
      lines.push('**Archived summary (older notes):**')
      lines.push(learned.rollup)
    }
    if (learned.recentLines.length > 0) {
      lines.push('')
      lines.push('**Recent:**')
      lines.push(...learned.recentLines)
    }
    if (learned.omittedCount > 0 || learned.truncatedRecent) {
      lines.push('')
      lines.push(`_${learned.omittedCount > 0 ? `${learned.omittedCount} older note(s)` : 'Additional notes'} available via memory_read._`)
    }
    lines.push('')
  }

  const scopeSection = formatActiveScopesForPrompt(monitoredScopes)
  if (scopeSection) {
    lines.push(scopeSection)
    lines.push('')
  }

  // If no memories yet
  if (lines.length <= 4 && !scopeSection) {
    return ''
  }

  lines.push('---')
  lines.push('**IMPORTANT**: User Memory is authoritative. Learned Notes are hints only.')

  return lines.join('\n')
}
