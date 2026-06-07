import { ConnectorDefinition, ConnectorRuntime, ToolDefinition } from './types'
import { ConnectorManifest, ToolManifest } from './contract'
import { ConfirmationViewModel } from '../agent/types'
import { ElectronAPI } from '../types/electron'

/**
 * Builds a renderer-side {@link ConnectorRuntime} from a discovered declarative
 * connector manifest. Execution (`executeTool`/`approveAction`) is routed over
 * IPC to the sandboxed handler in the main process; everything else (prompt,
 * confirmation, preview) is derived declaratively from the manifest + prompt.md.
 */

/** Replace `{{key}}` placeholders with the matching tool argument. */
function renderTemplate(template: string, args: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, key: string) => {
    const value = args[key]
    return value === undefined || value === null ? '' : String(value)
  })
}

function toToolDefinition(tool: ToolManifest): ToolDefinition {
  return {
    name: tool.name,
    description: tool.description,
    jsonSchema: tool.inputSchema as Record<string, unknown>,
    requiresConfirmation: tool.requiresConfirmation,
    category: tool.category,
  }
}

export function createPluginConnectorRuntime(
  electron: ElectronAPI,
  manifest: ConnectorManifest,
  promptMarkdown: string,
): ConnectorRuntime<ConnectorManifest> {
  const toolByName = new Map(manifest.tools.map(tool => [tool.name, tool]))

  const definition: ConnectorDefinition<ConnectorManifest> = {
    id: manifest.id,
    name: manifest.name,
    description: manifest.description || manifest.name,
    tools: manifest.tools.map(toToolDefinition),
    getPromptSection: () => promptMarkdown,
    getActionConfirmation: (name, args) => {
      const tool = toolByName.get(name)
      if (!tool?.confirmation) return null
      const confirmation: ConfirmationViewModel = {
        title: tool.confirmation.title ? renderTemplate(tool.confirmation.title, args) : tool.name,
        description: tool.confirmation.summary ? renderTemplate(tool.confirmation.summary, args) : undefined,
        preview: tool.preview ? renderTemplate(tool.preview, args) : undefined,
      }
      return confirmation
    },
    getActionPreview: (name, args) => {
      const tool = toolByName.get(name)
      return tool?.preview ? renderTemplate(tool.preview, args) : null
    },
    getActionConfirmationPrompt: (name, args) => {
      const tool = toolByName.get(name)
      return tool?.confirmation?.summary ? renderTemplate(tool.confirmation.summary, args) : null
    },
    approveAction: async input => {
      const outcome = await electron.connectors.approve(manifest.id, input.actionType, input.data)
      if (!outcome.handled) return { handled: false }
      for (const write of outcome.writes || []) {
        const formatted = input.formatToolResultForAI(write.name, write.result)
        input.cacheToolResult(write.name, write.args, formatted)
        input.updateScratchpadAfterTool(write.name, write.args, formatted)
        input.invalidateCacheAfterWrite(write.name, write.args)
      }
      return { handled: true, message: outcome.message, resumeAgent: outcome.resumeAgent }
    },
  }

  return {
    definition,
    context: manifest,
    executeTool: (name, args) => electron.connectors.execute(manifest.id, name, args),
  }
}
