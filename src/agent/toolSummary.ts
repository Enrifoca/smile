import { ToolEntry } from './types'

const FILE_READ_TOOLS = new Set(['file_read', 'file_read_ocr', 'file_list', 'file_search'])
const FILE_WRITE_TOOLS = new Set(['file_write', 'report_write', 'file_mkdir'])
const MEMORY_TOOLS = new Set(['memory_update', 'memory_delete', 'scratchpad_write', 'deep_thinking', 'context_read', 'context_append', 'context_replace_section'])

function countConnectorOps(entries: ToolEntry[], kind: 'read' | 'write'): { count: number; name?: string } {
  const filtered = entries.filter(entry => {
    if (kind === 'read') return entry.category === 'connector-read'
    return entry.category === 'connector-write' || entry.category === 'connector-attachment'
  })
  if (filtered.length === 0) return { count: 0 }
  return { count: filtered.length, name: filtered[0].connectorName }
}

/** Collapsed label for a tool-summary row — aligned with activity status vocabulary. */
export function summariseToolEntries(entries: ToolEntry[]): string {
  if (entries.length === 0) return ''

  const fileReads = entries.filter(entry => FILE_READ_TOOLS.has(entry.tool)).length
  const fileWrites = entries.filter(entry => FILE_WRITE_TOOLS.has(entry.tool)).length
  const memoryWrites = entries.filter(entry => MEMORY_TOOLS.has(entry.tool)).length
  const connectorReads = countConnectorOps(entries, 'read')
  const connectorWrites = countConnectorOps(entries, 'write')

  const parts: string[] = []

  if (fileReads > 0) {
    parts.push(`Explored ${fileReads} file${fileReads > 1 ? 's' : ''}`)
  }
  if (connectorReads.count > 0) {
    const name = connectorReads.name || 'connector'
    parts.push(`Checked ${name} (${connectorReads.count})`)
  }
  if (connectorWrites.count > 0) {
    const name = connectorWrites.name || 'connector'
    parts.push(`Updated ${name} (${connectorWrites.count})`)
  }
  if (fileWrites > 0) {
    parts.push(`Wrote ${fileWrites} file${fileWrites > 1 ? 's' : ''}`)
  }
  if (memoryWrites > 0) {
    parts.push(memoryWrites === 1 ? 'Updated memory' : `Updated memory (${memoryWrites})`)
  }

  return parts.join(' · ') || `${entries.length} action${entries.length !== 1 ? 's' : ''}`
}
