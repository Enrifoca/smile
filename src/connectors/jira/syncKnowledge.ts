import { ElectronAPI } from '../../types/electron'
import { formatJiraMetadataForPrompt } from '../../types/jira'
import { WORKSPACE_KNOWLEDGE_CONTEXT_ID } from '../../context/types'
import { normalizeJiraMetadata } from './runtime'

/** Persist Jira metadata as workspace-level connector knowledge for the agent prompt. */
export async function syncJiraWorkspaceKnowledge(
  electron: Pick<ElectronAPI, 'jiraMetadata' | 'connectors'>,
): Promise<void> {
  const metadata = normalizeJiraMetadata(await electron.jiraMetadata.get())
  const knowledge = formatJiraMetadataForPrompt(metadata)
  await electron.connectors.saveKnowledge(WORKSPACE_KNOWLEDGE_CONTEXT_ID, 'jira', knowledge)
}
