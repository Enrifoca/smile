const str = (value: unknown) => (value as string) || ''

const MAX_LINES = 30

export class SessionScratchpad {
  private lines: string[] = []

  appendGoal(text: string): void {
    const line = text.startsWith('→') ? text : `→ ${text}`
    if (this.lines.length === 0) {
      this.lines.push(line)
      return
    }
    if (this.lines[0].startsWith('→')) {
      this.lines[0] = line
      return
    }
    this.lines.unshift(line)
    this.trim()
  }

  appendDone(note: string): void {
    if (!note.trim()) return
    const line = note.startsWith('✓') ? note : `✓ ${note}`
    this.lines.push(line)
    this.trim()
  }

  appendNote(note: string): void {
    if (!note.trim()) return
    const line = note.startsWith('•') ? note : `• ${note}`
    this.lines.push(line)
    this.trim()
  }

  serialize(): string {
    return this.lines.join('\n')
  }

  isEmpty(): boolean {
    return this.lines.length === 0
  }

  private trim(): void {
    if (this.lines.length <= MAX_LINES) return
    const goal = this.lines[0]?.startsWith('→') ? this.lines[0] : null
    const rest = goal ? this.lines.slice(1) : this.lines
    const kept = rest.slice(-(MAX_LINES - (goal ? 1 : 0)))
    this.lines = goal ? [goal, ...kept] : kept
  }
}

export function getCoreScratchpadNote(
  toolName: string,
  args: Record<string, unknown>,
  formattedResult: string,
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

  if (toolName === 'deep_thinking') {
    const firstLine = formattedResult.split('\n').find(l => l.trim())?.trim() || 'analysis complete'
    const summary = firstLine.length > 120 ? `${firstLine.slice(0, 117)}…` : firstLine
    return `Deep thinking: ${summary}`
  }

  return ''
}

