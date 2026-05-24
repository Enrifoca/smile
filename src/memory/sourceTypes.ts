export type SourceMemoryKind = 'write_outcome' | 'scope_sync' | 'user_pin'

export type SourceAdmissionReason = SourceMemoryKind | 'scheduled_sync'

export interface SourceMemoryScopeRef {
  connectorId: string
  scopeId: string
}

export interface SourceMemoryLeaf {
  id: string
  connectorId: string
  scopeId: string
  kind: SourceMemoryKind
  toolName: string
  summary: string
  createdAt: string
}

export interface SourceMemoryLeafInput {
  connectorId: string
  scopeId: string
  kind: SourceMemoryKind
  toolName: string
  summary: string
}

export interface SourceMemoryReadResult {
  connectorId: string
  scopeId: string
  buffer: SourceMemoryLeaf[]
  summaries: Array<{ id: string; createdAt: string; content: string }>
}

export interface SourceMemoryScopeListing {
  connectorId: string
  scopeId: string
  leafCount: number
  summaryCount: number
  latestSummaryPreview: string | null
}
