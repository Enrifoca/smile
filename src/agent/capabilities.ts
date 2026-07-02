import type { ToolDefinition, ConnectorRuntime } from '../connectors/types'

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
  context: 'read and update active project context',
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
 * Dynamic core capability summary injected each turn from the tool registry.
 * Lists only built-in (non-connector) tools that are currently enabled.
 */
export function buildCoreCapabilitiesSection(coreTools: ToolDefinition[]): string {
  const coreLines = summarizeCoreTools(coreTools)

  const parts = [
    'Your core abilities this session are **exactly** the built-in tools listed below. Do not suggest or attempt actions outside this set plus the connector tools in Connector context.',
    '',
    ...(coreLines.length > 0 ? coreLines : ['- AI reasoning only (no workspace tools enabled)']),
    '',
    'If the user asks for something no tool covers, say so plainly and offer what you can do with the tools above.',
  ]

  return parts.join('\n')
}

/**
 * Build a unified Connector context block for a single connector.
 * Combines the connector's own prompt section (instructions, scope, examples)
 * with the list of tools it provides, so the model sees one coherent block
 * per connector instead of split instructions and capability lists.
 */
export function buildConnectorContextSection(connector: ConnectorRuntime): string {
  const definition = connector.definition
  const promptSection = definition.getPromptSection?.(connector.context) ?? ''
  const summary: ConnectorCapabilitySummary = {
    name: definition.name,
    agentCapabilities: definition.agentCapabilities,
    tools: definition.tools,
  }
  const toolLines = summarizeConnectorTools(summary)

  const parts: string[] = []
  if (promptSection.trim()) {
    parts.push(promptSection.trim())
  }
  if (toolLines.length > 0) {
    parts.push('**Available tools**', ...toolLines)
  }

  return parts.length > 0 ? parts.join('\n\n') : ''
}
