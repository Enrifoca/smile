import { ToolCategory } from '../../connectors/types'
import { CompressionRule } from './types'

const CATEGORY_DEFAULTS: Partial<Record<ToolCategory, CompressionRule>> = {
  'file-read': { skip: true },
  'memory': { skip: true },
  'connector-read': { maxChars: 8000, maxLines: 120 },
  'connector-write': { maxChars: 2000, maxLines: 40 },
  'connector-attachment': { maxChars: 1500, maxLines: 30 },
  'file-write': { maxChars: 1500, maxLines: 30 },
  'file-manage': { maxChars: 4000, maxLines: 80 },
}

const FALLBACK_RULE: CompressionRule = {
  maxChars: 6000,
  maxLines: 100,
}

export function resolveCompressionRule(
  category?: ToolCategory,
  _connectorId?: string,
): CompressionRule {
  if (!category) return FALLBACK_RULE
  return CATEGORY_DEFAULTS[category] ?? FALLBACK_RULE
}
