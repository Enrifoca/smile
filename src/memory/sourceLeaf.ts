import { normalizeSourceSummary } from './sourceAdmission'
import { SourceMemoryLeafInput } from './sourceTypes'

export function buildDefaultWriteSourceLeaf(input: {
  connectorId: string
  scopeId: string
  toolName: string
  formattedResult: string
}): SourceMemoryLeafInput {
  const firstLine = input.formattedResult.split('\n').find(line => line.trim()) || input.formattedResult
  return {
    connectorId: input.connectorId,
    scopeId: input.scopeId,
    kind: 'write_outcome',
    toolName: input.toolName,
    summary: normalizeSourceSummary(firstLine),
  }
}
