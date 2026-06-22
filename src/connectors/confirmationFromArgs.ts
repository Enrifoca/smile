import type { ConfirmationItem } from '../agent/types'

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function pickTitle(row: Record<string, unknown>, index: number): string {
  for (const key of ['summary', 'title', 'name', 'label']) {
    const value = row[key]
    if (value != null && String(value).trim()) return String(value).trim()
  }
  return `Item ${index + 1}`
}

function pickSubtitle(row: Record<string, unknown>): string | undefined {
  const parts = ['projectKey', 'issueTypeName', 'issueIdOrKey', 'path', 'id']
    .map(key => row[key])
    .filter(value => value != null && String(value).trim())
    .map(String)
  return parts.length > 0 ? parts.join(' · ') : undefined
}

/** Build confirmation rows from the first non-empty array in tool args (e.g. issues[]). */
export function buildConfirmationItemsFromArgs(args: Record<string, unknown>): ConfirmationItem[] | undefined {
  for (const value of Object.values(args)) {
    if (!Array.isArray(value) || value.length === 0) continue
    const items = value.map((entry, index) => {
      const row = asRecord(entry)
      if (!row) return { title: `Item ${index + 1}` }
      return {
        title: pickTitle(row, index),
        subtitle: pickSubtitle(row),
        badge: row.priority != null ? String(row.priority) : undefined,
      }
    })
    if (items.length > 0) return items
  }
  return undefined
}

export function buildBatchPreviewLabel(items: ConfirmationItem[]): string {
  const count = items.length
  const sample = items.slice(0, 3).map(item => item.title).join(', ')
  const suffix = count > 3 ? ` (+${count - 3} more)` : ''
  return `${count} item${count === 1 ? '' : 's'}: ${sample}${suffix}`
}
