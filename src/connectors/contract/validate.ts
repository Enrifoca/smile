import { ConnectorHandlerKind, ConnectorManifest, PluginToolCategory, ToolManifest } from './manifest'
import { isApiVersionSupported } from './version'

/**
 * Pure, dependency-free validation of a parsed `manifest.json`. Used by the host
 * during connector discovery before a connector is loaded/enabled.
 */

export type ManifestValidation =
  | { ok: true; manifest: ConnectorManifest }
  | { ok: false; errors: string[] }

const PLUGIN_TOOL_CATEGORIES: PluginToolCategory[] = [
  'connector-read',
  'connector-write',
  'connector-attachment',
]

const HANDLER_KINDS: ConnectorHandlerKind[] = ['code', 'mcp']

const ID_PATTERN = /^[a-z][a-z0-9_-]*$/

const INTEGRATION_TYPES = [
  'sop',
  'rest',
  'graphql',
  'ftp',
  'sftp',
  'mcp',
  'cli',
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const MCP_TRANSPORTS = ['http', 'sse'] as const

function validateMcpServers(raw: Record<string, unknown>, errors: string[]): void {
  if (raw.mcpServers === undefined) return
  if (!isRecord(raw.mcpServers)) {
    errors.push('mcpServers must be an object')
    return
  }

  const allowedMcp = ((raw.permissions as { mcp?: string[] } | undefined)?.mcp) || []
  const authFields = ((raw.auth as { fields?: Array<{ key?: string }> } | undefined)?.fields) || []
  const authFieldKeys = new Set(authFields.map(f => f.key).filter((k): k is string => typeof k === 'string'))

  for (const [serverId, config] of Object.entries(raw.mcpServers)) {
    if (!ID_PATTERN.test(serverId)) {
      errors.push(`mcpServers key "${serverId}" must match /^[a-z][a-z0-9_-]*$/`)
    }
    if (!allowedMcp.includes(serverId)) {
      errors.push(`mcpServers server "${serverId}" is not listed in permissions.mcp`)
    }
    if (!isRecord(config)) {
      errors.push(`mcpServers.${serverId} must be an object`)
      continue
    }
    if (typeof config.baseUrl !== 'string' || !config.baseUrl.startsWith('https://')) {
      errors.push(`mcpServers.${serverId}.baseUrl must be an https URL`)
    }
    if (config.transport !== undefined && !MCP_TRANSPORTS.includes(config.transport as typeof MCP_TRANSPORTS[number])) {
      errors.push(`mcpServers.${serverId}.transport must be one of ${MCP_TRANSPORTS.join(', ')}`)
    }
    if (typeof config.authSecretField !== 'string' || !config.authSecretField.trim()) {
      errors.push(`mcpServers.${serverId}.authSecretField is required`)
    } else if (!authFieldKeys.has(config.authSecretField)) {
      errors.push(`mcpServers.${serverId}.authSecretField "${config.authSecretField}" must match an auth.fields key`)
    }
    if (config.authHeader !== undefined && typeof config.authHeader !== 'string') {
      errors.push(`mcpServers.${serverId}.authHeader must be a string`)
    }
    if (config.authHeaderPrefix !== undefined && typeof config.authHeaderPrefix !== 'string') {
      errors.push(`mcpServers.${serverId}.authHeaderPrefix must be a string`)
    }
  }
}

function validateTool(tool: unknown, index: number, handlerKind: ConnectorHandlerKind, errors: string[]): void {
  const where = `tools[${index}]`
  if (!isRecord(tool)) {
    errors.push(`${where} must be an object`)
    return
  }
  if (typeof tool.name !== 'string' || !tool.name.trim()) errors.push(`${where}.name is required`)
  if (typeof tool.description !== 'string' || !tool.description.trim()) {
    errors.push(`${where}.description is required`)
  }
  if (!PLUGIN_TOOL_CATEGORIES.includes(tool.category as PluginToolCategory)) {
    errors.push(`${where}.category must be one of ${PLUGIN_TOOL_CATEGORIES.join(', ')}`)
  }
  if (typeof tool.requiresConfirmation !== 'boolean') {
    errors.push(`${where}.requiresConfirmation must be a boolean`)
  }
  if (!isRecord(tool.inputSchema)) errors.push(`${where}.inputSchema must be a JSON Schema object`)

  if (handlerKind === 'mcp') {
    if (!isRecord(tool.mcp)) {
      errors.push(`${where}.mcp is required when handlerKind is "mcp"`)
      return
    }
    if (typeof tool.mcp.serverId !== 'string' || !tool.mcp.serverId.trim()) {
      errors.push(`${where}.mcp.serverId is required`)
    }
    if (typeof tool.mcp.toolName !== 'string' || !tool.mcp.toolName.trim()) {
      errors.push(`${where}.mcp.toolName is required`)
    }
  }
}

export function validateManifest(raw: unknown): ManifestValidation {
  const errors: string[] = []

  if (!isRecord(raw)) {
    return { ok: false, errors: ['manifest must be a JSON object'] }
  }

  const handlerKind = (raw.handlerKind ?? 'code') as ConnectorHandlerKind
  if (!HANDLER_KINDS.includes(handlerKind)) {
    errors.push(`handlerKind must be one of ${HANDLER_KINDS.join(', ')}`)
  }

  if (typeof raw.apiVersion !== 'string' || !isApiVersionSupported(raw.apiVersion)) {
    errors.push('apiVersion is missing or newer than this host supports')
  }
  if (typeof raw.id !== 'string' || !ID_PATTERN.test(raw.id)) {
    errors.push('id must match /^[a-z][a-z0-9_-]*$/')
  }
  if (typeof raw.name !== 'string' || !raw.name.trim()) errors.push('name is required')
  if (typeof raw.version !== 'string' || !raw.version.trim()) errors.push('version is required')

  if (raw.integrationType !== undefined) {
    if (
      typeof raw.integrationType !== 'string'
      || !INTEGRATION_TYPES.includes(raw.integrationType as (typeof INTEGRATION_TYPES)[number])
    ) {
      errors.push(`integrationType must be one of ${INTEGRATION_TYPES.join(', ')}`)
    }
  }

  if (raw.catalog !== undefined) {
    if (!isRecord(raw.catalog)) {
      errors.push('catalog must be an object')
    } else {
      if (raw.catalog.icon !== undefined && typeof raw.catalog.icon !== 'string') {
        errors.push('catalog.icon must be a string')
      }
      if (raw.catalog.tagline !== undefined && typeof raw.catalog.tagline !== 'string') {
        errors.push('catalog.tagline must be a string')
      }
    }
  }

  validateMcpServers(raw, errors)

  if (!Array.isArray(raw.tools) || raw.tools.length === 0) {
    errors.push('tools must be a non-empty array')
  } else {
    raw.tools.forEach((tool, index) => validateTool(tool, index, handlerKind, errors))
    const names = (raw.tools as ToolManifest[]).map(tool => tool?.name).filter(Boolean)
    if (new Set(names).size !== names.length) errors.push('tool names must be unique')

    if (handlerKind === 'mcp') {
      const allowedMcp = (raw.permissions as { mcp?: string[] } | undefined)?.mcp || []
      for (const tool of raw.tools as ToolManifest[]) {
        const serverId = tool.mcp?.serverId
        if (serverId && !allowedMcp.includes(serverId)) {
          errors.push(`tool "${tool.name}" uses mcp server "${serverId}" not listed in permissions.mcp`)
        }
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, manifest: { ...(raw as object), handlerKind } as unknown as ConnectorManifest }
}
