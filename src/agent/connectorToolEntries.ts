import { ToolCategory } from '../connectors/types'
import { ToolEntry } from './types'

const str = (value: unknown) => (value as string) || ''

function detailFromArgs(args: Record<string, unknown>): string {
  for (const key of ['issueIdOrKey', 'jql', 'summary', 'title', 'path', 'pattern', 'projectKey']) {
    const value = str(args[key]).trim()
    if (!value) continue
    return value.length > 60 ? `${value.slice(0, 57)}…` : value
  }
  return ''
}

function actionFromToolName(toolName: string, connectorId: string): string {
  const prefix = `${connectorId}_`
  const rest = toolName.startsWith(prefix) ? toolName.slice(prefix.length) : toolName
  return rest.replace(/_/g, ' ')
}

function presentParticiple(action: string): string {
  const first = action.split(' ')[0] || action
  if (first.endsWith('ch')) return `${first}ing ${action.slice(first.length).trim()}`.trim()
  if (first.endsWith('e')) return `${first.slice(0, -1)}ing${action.slice(first.length)}`
  return `${first}ing${action.slice(first.length)}`
}

function pastParticiple(action: string): string {
  const first = action.split(' ')[0] || action
  if (first.endsWith('ch')) return `${first}ed ${action.slice(first.length).trim()}`.trim()
  if (first.endsWith('e')) return `${first}d${action.slice(first.length)}`
  if (first.endsWith('y')) return `${first.slice(0, -1)}ied${action.slice(first.length)}`
  return `${first}ed${action.slice(first.length)}`
}

/** Connector-neutral labels derived from manifest metadata and tool category. */
export function getConnectorToolEntry(
  connectorId: string,
  connectorName: string,
  toolName: string,
  category: ToolCategory,
  args: Record<string, unknown>,
): ToolEntry {
  const action = actionFromToolName(toolName, connectorId)
  const detail = detailFromArgs(args)
  const detailSuffix = detail ? `: ${detail}` : ''

  if (category === 'connector-write' || category === 'connector-attachment') {
    const past = `${pastParticiple(action)} on ${connectorName}${detailSuffix}`
    const running = `${presentParticiple(action)} on ${connectorName}${detailSuffix}…`
    return {
      tool: toolName,
      group: connectorId,
      connectorName,
      category,
      label: past,
      preparingLabel: running,
      runningLabel: running,
      afterLabel: `Analyzing ${connectorName} results…`,
    }
  }

  const past = `Checked ${connectorName}${detailSuffix || `: ${action}`}`
  const running = `Checking ${connectorName}${detailSuffix || `: ${action}`}…`
  return {
    tool: toolName,
    group: connectorId,
    connectorName,
    category,
    label: past,
    preparingLabel: running,
    runningLabel: running,
    afterLabel: `Analyzing ${connectorName} data…`,
  }
}
