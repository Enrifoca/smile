import { ToolCategory } from '../connectors/types'
import { SourceAdmissionReason } from './sourceTypes'

/** Max characters stored in one source leaf summary. */
export const SOURCE_LEAF_MAX_CHARS = 500

/** Buffer char total before sealing into a summary file. */
export const SOURCE_BUFFER_SEAL_THRESHOLD = 3000

export function shouldAdmitSourceLeaf(input: {
  reason: SourceAdmissionReason
  toolCategory?: ToolCategory
}): boolean {
  switch (input.reason) {
    case 'write_outcome':
      return input.toolCategory === 'connector-write' || input.toolCategory === 'connector-attachment'
    case 'scope_sync':
    case 'scheduled_sync':
    case 'user_pin':
      return true
    default:
      return false
  }
}

export function normalizeSourceSummary(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim()
  if (collapsed.length <= SOURCE_LEAF_MAX_CHARS) return collapsed
  return `${collapsed.slice(0, SOURCE_LEAF_MAX_CHARS - 1)}…`
}
