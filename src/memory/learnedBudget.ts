import { MemoryEntry, MemoryStore } from '../types/memory'
import {
  LEARNED_NOTES_RECENT_PROMPT_BUDGET,
  LEARNED_NOTES_ROLLUP_MAX_CHARS,
  LEARNED_NOTES_ROLLUP_THRESHOLD,
} from './constants'

export interface LearnedPromptSlice {
  recentLines: string[]
  rollup: string | null
  omittedCount: number
  truncatedRecent: boolean
}

function learnedEntries(memory: MemoryStore): MemoryEntry[] {
  const general = (memory.general?.entries ?? []).filter(entry => entry.source === 'learned')
  const lexicon = (memory.lexicon?.entries ?? []).filter(entry => entry.source === 'learned')
  return [...general, ...lexicon].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )
}

function totalLearnedChars(entries: MemoryEntry[]): number {
  return entries.reduce((sum, entry) => sum + entry.content.length, 0)
}

export function buildDeterministicLearnedRollup(entries: MemoryEntry[]): string {
  if (entries.length === 0) return ''

  const parts = [...entries]
    .sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime())
    .map(entry => entry.content.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  let rollup = parts.join(' · ')
  if (rollup.length <= LEARNED_NOTES_ROLLUP_MAX_CHARS) return rollup

  rollup = rollup.slice(0, LEARNED_NOTES_ROLLUP_MAX_CHARS - 1).trimEnd() + '…'
  return rollup
}

export function selectLearnedNotesForPrompt(memory: MemoryStore): LearnedPromptSlice {
  const entries = learnedEntries(memory)
  const phrases = memory.lexicon?.commonPhrases ?? []

  const recentLines: string[] = []
  let used = 0
  let truncatedRecent = false

  for (const entry of entries) {
    const line = `- ${entry.content}`
    if (used + line.length + 1 > LEARNED_NOTES_RECENT_PROMPT_BUDGET) {
      truncatedRecent = entries.indexOf(entry) < entries.length - 1
      break
    }
    recentLines.push(line)
    used += line.length + 1
  }

  for (const phrase of phrases.slice(0, 10)) {
    const line = `- Preferred phrase: "${phrase}"`
    if (used + line.length + 1 > LEARNED_NOTES_RECENT_PROMPT_BUDGET) break
    recentLines.push(line)
    used += line.length + 1
  }

  const recentEntryCount = recentLines.filter(
    line => line.startsWith('- ') && !line.includes('Preferred phrase')
  ).length
  const omittedCount = Math.max(0, entries.length - recentEntryCount)
  const rollup = memory.learnedRollup?.trim() || null

  return { recentLines, rollup, omittedCount, truncatedRecent }
}

/**
 * When learned notes grow past the rollup threshold, condense older entries into learnedRollup.
 * Full entries remain on disk for memory_read.
 */
export function reconcileLearnedMemoryBudget(memory: MemoryStore): MemoryStore {
  const entries = learnedEntries(memory)
  if (totalLearnedChars(entries) <= LEARNED_NOTES_ROLLUP_THRESHOLD) {
    return { ...memory, learnedRollup: memory.learnedRollup ?? '' }
  }

  const recent: MemoryEntry[] = []
  let used = 0
  for (const entry of entries) {
    const next = entry.content.length + 2
    if (used + next > LEARNED_NOTES_RECENT_PROMPT_BUDGET) break
    recent.push(entry)
    used += next
  }

  const archived = entries.filter(entry => !recent.some(r => r.id === entry.id))
  const rollup = buildDeterministicLearnedRollup(archived)

  return {
    ...memory,
    learnedRollup: rollup,
  }
}
