import { ToolCategory } from '../connectors/types'
import { getToolDefinition } from './tools'

const PARALLEL_SAFE_CATEGORIES: ToolCategory[] = [
  'file-read',
  'context',
  'memory',
  'analysis',
  'scratchpad',
  'web',
]

export interface ToolCallRef {
  id: string
  name: string
  arguments: Record<string, unknown>
}

/**
 * Determine whether a batch of tool calls can safely be executed in parallel.
 *
 * A batch is parallel-safe only if:
 *  - every tool is in a read-only/side-effect-free category, and
 *  - no two calls share the same `path` argument (to avoid read-after-write races).
 */
export function isParallelSafeBatch(toolCalls: ToolCallRef[]): boolean {
  if (toolCalls.length <= 1) return false

  const seenPaths = new Set<string>()

  for (const call of toolCalls) {
    const def = getToolDefinition(call.name)
    if (!def) return false
    if (!PARALLEL_SAFE_CATEGORIES.includes(def.category)) return false

    const pathArg = typeof call.arguments.path === 'string' ? call.arguments.path : null
    if (pathArg !== null) {
      if (seenPaths.has(pathArg)) return false
      seenPaths.add(pathArg)
    }
  }

  return true
}
