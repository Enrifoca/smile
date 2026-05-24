import { ConnectorScope } from '../connectors/registry'
import { SourceMemoryReadResult, SourceMemoryScopeListing } from './sourceTypes'

export function formatActiveScopesForPrompt(scopes: ConnectorScope[]): string {
  if (scopes.length === 0) return ''

  const lines = scopes.map(
    scope => `- ${scope.connectorId}/${scope.scopeId} (${scope.name})`,
  )

  return [
    '### Monitored connector scopes',
    'Source memory is stored per scope below. Use memory_read with section "source" to retrieve sealed summaries.',
    'Ad-hoc connector reads are not saved — only write outcomes in monitored scopes.',
    ...lines,
  ].join('\n')
}

export function formatSourceMemoryRead(data: SourceMemoryReadResult): string {
  const parts = [`## Source memory: ${data.connectorId}/${data.scopeId}`]

  if (data.summaries.length > 0) {
    parts.push('\n### Sealed summaries (newest first)')
    for (const summary of data.summaries) {
      parts.push(summary.content.trim())
    }
  }

  if (data.buffer.length > 0) {
    parts.push('\n### Recent buffer (not yet sealed)')
    for (const leaf of data.buffer) {
      parts.push(`- ${leaf.createdAt.slice(0, 16)} · ${leaf.toolName}: ${leaf.summary}`)
    }
  }

  if (data.summaries.length === 0 && data.buffer.length === 0) {
    parts.push('(no source memory for this scope yet)')
  }

  return parts.join('\n')
}

export function formatSourceMemoryListing(listings: SourceMemoryScopeListing[]): string {
  if (listings.length === 0) return 'No connector source memory stored yet.'

  const lines = ['## Connector source memory scopes', '']
  for (const listing of listings) {
    const preview = listing.latestSummaryPreview ? ` — ${listing.latestSummaryPreview}` : ''
    lines.push(
      `- ${listing.connectorId}/${listing.scopeId}: ${listing.leafCount} buffered, ${listing.summaryCount} sealed${preview}`,
    )
  }
  lines.push('', 'Use memory_read with section "source", connectorId, and scopeId to read a scope.')
  return lines.join('\n')
}
