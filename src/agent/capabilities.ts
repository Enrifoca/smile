import type { ToolDefinition } from '../connectors/types'

/** Human-readable labels for manifest `agentCapabilities` tokens. */
export const AGENT_CAPABILITY_LABELS: Record<string, string> = {
  email: 'send, read, and manage email',
  'web-search': 'search and fetch web content',
  calendar: 'read and manage calendar events',
  messaging: 'send messages through connected channels',
  notifications: 'send notifications through connected channels',
  database: 'read from or write to connected databases',
  'cloud-storage': 'read from or write to connected cloud storage',
}

export interface ConnectorCapabilitySummary {
  name: string
  /** Optional manifest tokens, e.g. `["email"]`. */
  agentCapabilities?: string[]
  tools: ToolDefinition[]
}

const CORE_CATEGORY_LINES: Record<string, string> = {
  'file-read': 'read workspace files (including OCR when needed)',
  'file-write': 'write workspace files and markdown reports',
  'file-manage': 'list and search workspace files',
  memory: 'read and update persistent memory',
  scratchpad: 'working notes and plan updates for this turn',
  analysis: 'deep_thinking for structured analysis',
  context: 'read and update active project context',
  web: 'search and fetch web content',
}

function summarizeCoreTools(tools: ToolDefinition[]): string[] {
  const categories = new Set(tools.map(tool => tool.category))
  const lines: string[] = []
  for (const [category, line] of Object.entries(CORE_CATEGORY_LINES)) {
    if (categories.has(category as ToolDefinition['category'])) {
      lines.push(`- ${line}`)
    }
  }
  return lines
}

function summarizeConnectorTools(connector: ConnectorCapabilitySummary): string[] {
  const lines: string[] = []
  const declared = (connector.agentCapabilities ?? [])
    .map(token => AGENT_CAPABILITY_LABELS[token] ?? token.replace(/-/g, ' '))
    .filter(Boolean)

  if (declared.length > 0) {
    lines.push(`- Declared: ${declared.join('; ')}`)
  }

  const readTools = connector.tools.filter(tool => tool.category === 'connector-read')
  const writeTools = connector.tools.filter(tool => tool.category === 'connector-write')
  const attachmentTools = connector.tools.filter(tool => tool.category === 'connector-attachment')

  if (readTools.length > 0) {
    lines.push(`- Read tools: ${readTools.map(tool => tool.name).join(', ')}`)
  }
  if (writeTools.length > 0) {
    lines.push(`- Write tools (may require confirmation): ${writeTools.map(tool => tool.name).join(', ')}`)
  }
  if (attachmentTools.length > 0) {
    lines.push(`- Attachment tools: ${attachmentTools.map(tool => tool.name).join(', ')}`)
  }

  return lines
}

/**
 * Dynamic capability summary injected each turn from the tool registry.
 * Replaces static deny-lists in the system prompt.
 */
export function buildEnabledCapabilitiesSection(
  allTools: ToolDefinition[],
  connectors: ConnectorCapabilitySummary[],
): string {
  const coreTools = allTools.filter(tool => !tool.category.startsWith('connector-'))
  const coreLines = summarizeCoreTools(coreTools)

  const connectorBlocks = connectors
    .map(connector => {
      const toolLines = summarizeConnectorTools(connector)
      if (toolLines.length === 0) return ''
      return [`**${connector.name}**`, ...toolLines].join('\n')
    })
    .filter(Boolean)

  const parts = [
    'Your abilities this session are **exactly** the tools listed below. Do not suggest or attempt actions outside this set.',
    '',
    '### Core',
    ...(coreLines.length > 0 ? coreLines : ['- AI reasoning only (no workspace or connector tools enabled)']),
  ]

  if (connectorBlocks.length > 0) {
    parts.push('', '### Connectors', ...connectorBlocks)
  }

  parts.push(
    '',
    'If the user asks for something no tool covers, say so plainly and offer what you can do with the tools above.',
  )

  return parts.join('\n')
}
