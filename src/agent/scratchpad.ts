const str = (value: unknown) => (value as string) || ''

export function getCoreScratchpadNote(
  toolName: string,
  args: Record<string, unknown>,
  formattedResult: string
): string {
  if (toolName === 'file_read' || toolName === 'file_read_ocr') {
    const fname = str(args.path).split(/[\\/]/).pop() || str(args.path)
    const lines = formattedResult.split('\n').length
    return toolName === 'file_read_ocr'
      ? `OCR read: ${fname} (${lines} lines of content available in context)`
      : `Read: ${fname} (${lines} lines of content available in context)`
  }

  if (toolName === 'file_search') {
    const pattern = str(args.pattern || args.name)
    const matchCount = (formattedResult.match(/\n/g) || []).length + 1
    return `Searched for "${pattern}" -> ${formattedResult.startsWith('No') ? 'no results' : `${matchCount} match(es)`}`
  }

  if (toolName === 'file_list') return 'Listed workspace files'

  if (toolName === 'report_write') {
    return `Report saved: ${str(args.title)} (${str(args.path) || '.smile/reports/'})`
  }

  return ''
}

export function formatScratchpadNote(note: string): string {
  if (!note) return ''
  return note.startsWith('✓') ? note : `✓ ${note}`
}
