import { ConnectorDefinition } from '../types'
import { formatJiraMetadataForPrompt, JiraMetadataStore } from '../../types/jira'
import promptTemplate from './prompt.md?raw'
import { renderPrompt } from '../../prompts/loader'
import { jiraManifest } from './manifest'
import { jiraTools } from './tools'
import {
  approveJiraAction,
  formatJiraToolResultForAI,
  getJiraActionConfirmation,
  getJiraActionConfirmationPrompt,
  getJiraActionPreview,
  getJiraScratchpadNote,
  getJiraToolEntry,
  invalidateJiraCacheAfterWrite,
  getJiraScopeForSourceMemory,
  buildJiraSourceMemoryLeaf,
} from './formatters'

export const jiraConnector: ConnectorDefinition<JiraMetadataStore> = {
  id: jiraManifest.id,
  name: jiraManifest.name,
  description: jiraManifest.description,
  tools: jiraTools,
  getPromptSection(context) {
    if (!context) return ''
    const formatted = formatJiraMetadataForPrompt(context)
    if (!formatted) return ''
    return renderPrompt(promptTemplate, { metadata: formatted })
  },
  getToolEntry: getJiraToolEntry,
  getActionConfirmation: getJiraActionConfirmation,
  getActionConfirmationPrompt: getJiraActionConfirmationPrompt,
  getActionPreview: getJiraActionPreview,
  formatToolResultForAI: formatJiraToolResultForAI,
  getScratchpadNote: getJiraScratchpadNote,
  invalidateCacheAfterWrite: invalidateJiraCacheAfterWrite,
  getScopeForSourceMemory: getJiraScopeForSourceMemory,
  buildSourceMemoryLeaf: buildJiraSourceMemoryLeaf,
  approveAction: approveJiraAction,
}
