import { ConnectorScope } from '../connectors/registry'

export function formatActiveScopesForPrompt(scopes: ConnectorScope[]): string {
  if (scopes.length === 0) return ''

  const lines = scopes.map(
    scope => `- ${scope.connectorId}/${scope.scopeId} (${scope.name})`,
  )

  return [
    '### Monitored connector scopes',
    'Source memory is stored per scope below and is already loaded when relevant.',
    'Ad-hoc connector reads are not saved — only write outcomes in monitored scopes.',
    ...lines,
  ].join('\n')
}
