import { ToolCategory } from '../connectors/types'
import { ToolEntry } from './types'

const str = (value: unknown) => (value as string) || ''

export function ensureToolEntryActivity(entry: ToolEntry, category?: ToolCategory): ToolEntry {
  return {
    ...entry,
    category: entry.category ?? category,
    preparingLabel: entry.preparingLabel || `Preparing: ${entry.label}…`,
    runningLabel: entry.runningLabel || `Running: ${entry.label}…`,
    afterLabel: entry.afterLabel || 'Analyzing results…',
  }
}

export function getCoreToolEntry(name: string, args: Record<string, unknown>): ToolEntry {
  switch (name) {
    case 'file_read': {
      const fname = str(args.path).split(/[\\/]/).pop() || str(args.path)
      const fnLower = fname.toLowerCase()
      const verb = fnLower.endsWith('.pdf') ? 'Parsed PDF' : fnLower.endsWith('.docx') ? 'Read Word doc' : 'Read'
      const label = `${verb} ${fname}`
      const active = `Reading ${fname}…`
      return {
        tool: name,
        label,
        group: 'file',
        category: 'file-read',
        preparingLabel: active,
        runningLabel: active,
        afterLabel: 'Analyzing file contents…',
      }
    }
    case 'file_read_ocr': {
      const fname = str(args.path).split(/[\\/]/).pop() || str(args.path)
      const active = `OCR reading ${fname}…`
      return {
        tool: name,
        label: `OCR read ${fname}`,
        group: 'file',
        category: 'file-read',
        preparingLabel: active,
        runningLabel: active,
        afterLabel: 'Analyzing file contents…',
      }
    }
    case 'file_list': {
      const path = str(args.path) || '.'
      const label = path === '.' ? 'workspace' : `${path.split(/[\\/]/).pop() || path}/`
      const active = `Browsing ${label}…`
      return {
        tool: name,
        label: `Browsed ${label}`,
        group: 'file',
        category: 'file-read',
        preparingLabel: active,
        runningLabel: active,
        afterLabel: 'Analyzing workspace results…',
      }
    }
    case 'file_write': {
      const fname = str(args.path).split(/[\\/]/).pop() || str(args.path)
      const ext = fname.split('.').pop()?.toLowerCase()
      const verb = ext === 'html' ? 'Generated' : ext === 'csv' ? 'Exported' : 'Wrote'
      const label = `${verb} ${fname}`
      const active = `Writing ${fname}…`
      return {
        tool: name,
        label,
        group: 'file',
        category: 'file-write',
        preparingLabel: active,
        runningLabel: active,
        afterLabel: 'Analyzing workspace results…',
      }
    }
    case 'report_write': {
      const title = str(args.title).trim()
      const titleSuffix = title ? `: ${title}` : ''
      return {
        tool: name,
        label: `Report${titleSuffix || ': untitled'}`,
        group: 'file',
        category: 'file-write',
        preparingLabel: title ? `Drafting report${titleSuffix}…` : 'Drafting markdown report…',
        runningLabel: title ? `Saving report${titleSuffix}…` : 'Saving report…',
        afterLabel: 'Summarizing report…',
      }
    }
    case 'file_search': {
      const pattern = str(args.pattern)
      const active = `Searching for "${pattern}"…`
      return {
        tool: name,
        label: `Searched for "${pattern}"`,
        group: 'file',
        category: 'file-read',
        preparingLabel: active,
        runningLabel: active,
        afterLabel: 'Analyzing workspace results…',
      }
    }
    case 'file_mkdir': {
      const folder = str(args.path).split(/[\\/]/).pop() || str(args.path)
      const active = `Creating folder ${folder}/…`
      return {
        tool: name,
        label: `Created folder ${folder}/`,
        group: 'file',
        category: 'file-manage',
        preparingLabel: active,
        runningLabel: active,
        afterLabel: 'Analyzing workspace results…',
      }
    }
    case 'memory_update':
      return {
        tool: name,
        label: 'Saved to learned memory',
        group: 'memory',
        category: 'memory',
        preparingLabel: 'Saving to memory…',
        runningLabel: 'Saving to memory…',
        afterLabel: 'Analyzing memory…',
      }
    case 'memory_delete':
      return {
        tool: name,
        label: `Deleted memory matching "${str(args.query)}"`,
        group: 'memory',
        category: 'memory',
        preparingLabel: 'Cleaning memory…',
        runningLabel: 'Cleaning memory…',
        afterLabel: 'Analyzing memory…',
      }
    case 'scratchpad_write':
      return {
        tool: name,
        label: 'Updated working notes',
        group: 'memory',
        category: 'scratchpad',
        preparingLabel: 'Updating working notes…',
        runningLabel: 'Updating working notes…',
        afterLabel: 'Continuing…',
      }
    case 'deep_thinking':
      return {
        tool: name,
        label: 'Deep thinking',
        group: 'memory',
        category: 'analysis',
        preparingLabel: 'Deep thinking…',
        runningLabel: 'Deep thinking…',
        afterLabel: 'Continuing…',
      }
    case 'context_read':
      return {
        tool: name,
        label: 'Read project context',
        group: 'memory',
        category: 'context',
        preparingLabel: 'Reading project context…',
        runningLabel: 'Reading project context…',
        afterLabel: 'Analyzing context…',
      }
    case 'context_append':
      return {
        tool: name,
        label: `Added to context: ${str(args.section)}`,
        group: 'memory',
        category: 'context',
        preparingLabel: 'Updating project context…',
        runningLabel: 'Updating project context…',
        afterLabel: 'Analyzing context…',
      }
    case 'context_replace_section':
      return {
        tool: name,
        label: `Updated context: ${str(args.heading)}`,
        group: 'memory',
        category: 'context',
        preparingLabel: 'Updating project context…',
        runningLabel: 'Updating project context…',
        afterLabel: 'Analyzing context…',
      }
    default:
      return {
        tool: name,
        label: name,
        group: 'file',
        preparingLabel: `Preparing: ${name}…`,
        runningLabel: `Running: ${name}…`,
        afterLabel: 'Analyzing results…',
      }
  }
}
