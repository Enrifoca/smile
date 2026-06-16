import { buildBatchPreviewLabel, buildConfirmationItemsFromArgs } from './confirmationFromArgs'
import type { ConnectorDefinition, ConnectorRuntime, ToolDefinition } from './types'
import { ConnectorManifest, ContextEnvelope, ToolManifest } from './contract'
import { ConfirmationViewModel } from '../agent/types'
import { ElectronAPI } from '../types/electron'
import { WORKSPACE_KNOWLEDGE_CONTEXT_ID } from '../context/types'

/**
 * Builds a renderer-side {@link ConnectorRuntime} from a discovered declarative
 * connector manifest. Execution (`executeTool`/`approveAction`) is routed over
 * IPC to the sandboxed handler in the main process; everything else (prompt,
 * confirmation, preview) is derived declaratively from the manifest + prompt.md.
 *
 * The active project context (if any) is threaded into execution as a
 * {@link ContextEnvelope} and used to inject cached connector "knowledge" into
 * the prompt section.
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

  // Active context envelope + cached knowledge, refreshed via setActiveContext.
  let activeEnvelope: ContextEnvelope | null = null
  let knowledge = ''
  let workspaceKnowledge = ''

  void electron.connectors.getKnowledge(WORKSPACE_KNOWLEDGE_CONTEXT_ID, manifest.id).then(result => {
    if (result.success && result.data) workspaceKnowledge = result.data
  }).catch(() => { /* optional */ })

  const definition: ConnectorDefinition<ConnectorManifest> = {
    id: manifest.id,
    name: manifest.name,
    description: manifest.description || manifest.name,
    tools: manifest.tools.map(toToolDefinition),
    getPromptSection: () => {
      const parts = [promptMarkdown, workspaceKnowledge, knowledge].filter(Boolean)
      return parts.join('\n\n')
    },
    getActionConfirmation: (name, args) => {
      const tool = toolByName.get(name)
      if (!tool?.confirmation) return null
      const items = buildConfirmationItemsFromArgs(args)
      const title = tool.confirmation.title ? renderTemplate(tool.confirmation.title, args) : tool.name
      const description = tool.confirmation.summary ? renderTemplate(tool.confirmation.summary, args) : undefined
      const preview = items?.length
        ? buildBatchPreviewLabel(items)
        : tool.preview
          ? renderTemplate(tool.preview, args)
          : undefined
      const confirmation: ConfirmationViewModel = {
        title,
        description,
        preview,
        items,
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
      const outcome = await electron.connectors.approve(
        manifest.id,
        input.actionType,
        input.data,
        input.contextEnvelope ?? activeEnvelope ?? undefined,
      )
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
    executeTool: (name, args, context) =>
      electron.connectors.execute(manifest.id, name, args, context ?? activeEnvelope ?? undefined),
    setActiveContext: envelope => {
      activeEnvelope = envelope
      if (!envelope) {
        knowledge = ''
        return
      }
      void electron.connectors.getKnowledge(envelope.contextId, manifest.id).then(result => {
        knowledge = result.success && result.data ? result.data : ''
      }).catch(() => {
        knowledge = ''
      })
    },
  }
}
