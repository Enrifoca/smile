import { resolveCompressionRule } from './rules'
import { CompressToolResultInput, CompressToolResultOutput, CompressionRule } from './types'

function collapseBlankLines(text: string): string {
  return text.replace(/\n{3,}/g, '\n\n').trimEnd()
}

function truncateLines(text: string, maxLines: number): { text: string; truncated: boolean } {
  const lines = text.split('\n')
  if (lines.length <= maxLines) return { text, truncated: false }
  const kept = lines.slice(0, maxLines)
  const omitted = lines.length - maxLines
  return {
    text: `${kept.join('\n')}\n… (${omitted} more line${omitted === 1 ? '' : 's'} omitted)`,
    truncated: true,
  }
}

function truncateChars(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false }

  const head = Math.floor(maxChars * 0.72)
  const tail = Math.max(200, maxChars - head - 40)
  const omitted = text.length - head - tail
  return {
    text: `${text.slice(0, head)}\n… (${omitted} characters omitted) …\n${text.slice(-tail)}`,
    truncated: true,
  }
}

function applyRule(text: string, rule: CompressionRule): string {
  if (rule.skip) return text

  let output = collapseBlankLines(text)

  if (rule.maxLines && output.split('\n').length > rule.maxLines) {
    output = truncateLines(output, rule.maxLines).text
  }

  const maxChars = rule.maxChars
  if (maxChars && output.length > maxChars) {
    if (rule.headChars && rule.tailChars) {
      output = `${output.slice(0, rule.headChars)}\n…\n${output.slice(-rule.tailChars)}`
    } else {
      output = truncateChars(output, maxChars).text
    }
  }

  return output
}

export function compressToolResult(input: CompressToolResultInput): CompressToolResultOutput {
  const originalChars = input.text.length
  const rule = resolveCompressionRule(input.category, input.connectorId)
  const text = applyRule(input.text, rule)

  return {
    text,
    compressed: text.length !== originalChars,
    originalChars,
    finalChars: text.length,
  }
}
