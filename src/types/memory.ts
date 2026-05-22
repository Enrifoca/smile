/**
 * Memory System Types
 * 
 * The memory system stores user-specific knowledge to help the agent
 * replicate the user's writing style and preferences.
 */

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
  general: GeneralMemory
  lexicon: LexiconMemory
  issueTypes: Record<string, IssueTypeMemory> // keyed by issue type name
  lastSyncedAt: string | null
  version: number // for future migrations
}

export const defaultUserMemoryMarkdown = ''

// Default empty memory store
export const defaultMemoryStore: MemoryStore = {
  userMarkdown: defaultUserMemoryMarkdown,
  general: { entries: [] },
  lexicon: { entries: [], commonPhrases: [], vocabularyNotes: [] },
  issueTypes: {},
  lastSyncedAt: null,
  version: 2,
}

/**
 * Format memory for the AI system prompt
 */
export function formatMemoryForPrompt(memory: MemoryStore): string {
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

  const generalEntries = (memory.general?.entries ?? []).filter(entry => entry.source === 'learned')
  const lexiconEntries = (memory.lexicon?.entries ?? []).filter(entry => entry.source === 'learned')
  const commonPhrases = memory.lexicon?.commonPhrases ?? []
  const learnedNotes = [...generalEntries, ...lexiconEntries]
  if (learnedNotes.length > 0 || commonPhrases.length > 0) {
    lines.push('### Learned Notes (Lower Priority)')
    for (const entry of learnedNotes) {
      lines.push(`- ${entry.content}`)
    }
    if (commonPhrases.length > 0) {
      for (const phrase of commonPhrases.slice(0, 10)) {
        lines.push(`- Preferred phrase: "${phrase}"`)
      }
    }
    lines.push('')
  }

  // If no memories yet
  if (lines.length <= 4) {
    return ''
  }

  lines.push('---')
  lines.push('**IMPORTANT**: User Memory is authoritative. Learned Notes are hints only.')

  return lines.join('\n')
}

/**
 * Convert memory store to markdown files content
 */
export function memoryToMarkdown(memory: MemoryStore): {
  user: string
  general: string
  lexicon: string
  issueTypes: Record<string, string>
} {
  // General.md
  const generalLines = ['# General Memory', '']
  if (memory.general.entries.length > 0) {
    for (const entry of memory.general.entries) {
      generalLines.push(`- ${entry.content}`)
    }
  } else {
    generalLines.push('_No memories yet. The agent will learn your preferences over time._')
  }

  // Lexicon.md
  const lexiconLines = ['# Lexicon & Writing Style', '']
  
  if (memory.lexicon.entries.length > 0) {
    lexiconLines.push('## Style Notes')
    for (const entry of memory.lexicon.entries) {
      lexiconLines.push(`- ${entry.content}`)
    }
    lexiconLines.push('')
  }
  
  if (memory.lexicon.commonPhrases.length > 0) {
    lexiconLines.push('## Common Phrases')
    for (const phrase of memory.lexicon.commonPhrases) {
      lexiconLines.push(`- "${phrase}"`)
    }
    lexiconLines.push('')
  }
  
  if (memory.lexicon.vocabularyNotes.length > 0) {
    lexiconLines.push('## Vocabulary')
    for (const note of memory.lexicon.vocabularyNotes) {
      lexiconLines.push(`- ${note}`)
    }
  }
  
  if (lexiconLines.length === 2) {
    lexiconLines.push('_No lexicon learned yet. The agent will analyze your writing style._')
  }

  // Issue type files
  const issueTypeFiles: Record<string, string> = {}
  
  for (const [name, issueType] of Object.entries(memory.issueTypes)) {
    const lines = [`# ${issueType.issueTypeName} - Writing Examples`, '']
    
    if (issueType.examples.length > 0) {
      lines.push(`_${issueType.examples.length} example(s) • Last updated: ${issueType.updatedAt}_`)
      lines.push('')
      
      for (let i = 0; i < issueType.examples.length; i++) {
        const ex = issueType.examples[i]
        lines.push(`## Example ${i + 1}: ${ex.issueKey}`)
        lines.push('')
        lines.push(`**Summary:** ${ex.summary}`)
        lines.push('')
        if (ex.description) {
          lines.push('**Description:**')
          lines.push('```')
          lines.push(ex.description)
          lines.push('```')
          lines.push('')
        }
        if (ex.customFields && Object.keys(ex.customFields).length > 0) {
          lines.push('**Custom Fields:**')
          for (const [field, value] of Object.entries(ex.customFields)) {
            lines.push(`- ${field}: ${JSON.stringify(value)}`)
          }
          lines.push('')
        }
      }
    } else {
      lines.push('_No examples yet._')
    }
    
    issueTypeFiles[name] = lines.join('\n')
  }

  return {
    user: memory.userMarkdown || defaultUserMemoryMarkdown,
    general: generalLines.join('\n'),
    lexicon: lexiconLines.join('\n'),
    issueTypes: issueTypeFiles,
  }
}

/**
 * Parse markdown file back to memory entries
 */
export function parseMarkdownToEntries(markdown: string): MemoryEntry[] {
  const entries: MemoryEntry[] = []
  const lines = markdown.split('\n')
  
  for (const line of lines) {
    const trimmed = line.trim()
    // Parse bullet points as entries
    if (trimmed.startsWith('- ') && !trimmed.startsWith('- _')) {
      const content = trimmed.substring(2).trim()
      // Skip quotes (common phrases)
      if (!content.startsWith('"')) {
        entries.push({
          id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
          content,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          source: 'user', // Assume user if parsed from file
        })
      }
    }
  }
  
  return entries
}
