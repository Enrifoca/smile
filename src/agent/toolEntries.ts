import { ToolEntry } from './types'

const str = (value: unknown) => (value as string) || ''

export function getCoreToolEntry(name: string, args: Record<string, unknown>): ToolEntry {
  switch (name) {
    case 'file_read': {
      const fname = str(args.path).split(/[\\/]/).pop() || str(args.path)
      const fnLower = fname.toLowerCase()
      const verb = fnLower.endsWith('.pdf') ? 'Parsed PDF' : fnLower.endsWith('.docx') ? 'Read Word doc' : 'Read'
      return { tool: name, label: `${verb} ${fname}`, group: 'file' }
    }
    case 'file_read_ocr': {
      const fname = str(args.path).split(/[\\/]/).pop() || str(args.path)
      return { tool: name, label: `OCR read ${fname}`, group: 'file' }
    }
    case 'file_list': {
      const path = str(args.path) || '.'
      const label = path === '.' ? 'workspace' : `${path.split(/[\\/]/).pop() || path}/`
      return { tool: name, label: `Browsed ${label}`, group: 'file' }
    }
    case 'file_write': {
      const fname = str(args.path).split(/[\\/]/).pop() || str(args.path)
      const ext = fname.split('.').pop()?.toLowerCase()
      const verb = ext === 'html' ? 'Generated' : ext === 'csv' ? 'Exported' : 'Wrote'
      return { tool: name, label: `${verb} ${fname}`, group: 'file' }
    }
    case 'file_search':
      return { tool: name, label: `Searched for "${str(args.pattern)}"`, group: 'file' }
    case 'file_mkdir':
      return { tool: name, label: `Created folder ${str(args.path).split(/[\\/]/).pop() || str(args.path)}/`, group: 'file' }
    case 'memory_read':
      return { tool: name, label: 'Checked memory', group: 'memory' }
    case 'memory_update':
      return { tool: name, label: 'Saved to learned memory', group: 'memory' }
    case 'memory_delete':
      return { tool: name, label: `Deleted memory matching "${str(args.query)}"`, group: 'memory' }
    case 'scratchpad_write':
      return { tool: name, label: 'Updated scratchpad', group: 'memory' }
    default:
      return { tool: name, label: name, group: 'file' }
  }
}
