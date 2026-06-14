import { ToolEntry } from './types'

export type AgentPhase =
  | { kind: 'awaiting_model'; useReasoning: boolean; lastEntry?: ToolEntry | null }
  | { kind: 'streaming_thinking' }
  | { kind: 'streaming_text' }
  | { kind: 'streaming_tool_draft'; entry: ToolEntry }
  | { kind: 'preparing_tools'; entries: ToolEntry[] }
  | { kind: 'running_tool'; entry: ToolEntry }
  | { kind: 'awaiting_approval'; entry: ToolEntry }
  | { kind: 'reasoning_fallback' }

/** Single resolver for composer activity labels during an agent turn. */
export function resolveActivityLabel(phase: AgentPhase): string {
  switch (phase.kind) {
    case 'awaiting_model':
      // First model call of the turn: neutral label until tokens or tools arrive.
      // "Reasoning about next step" only after a tool ran — mid-workflow planning.
      if (phase.useReasoning && phase.lastEntry) return 'Reasoning about next step…'
      if (phase.lastEntry?.afterLabel) return phase.lastEntry.afterLabel
      return 'Working on your request…'

    case 'streaming_thinking':
      return 'Thinking…'

    case 'streaming_text':
      return 'Writing response…'

    case 'streaming_tool_draft':
      return phase.entry.preparingLabel

    case 'preparing_tools': {
      const { entries } = phase
      if (entries.length === 0) return 'Preparing actions…'
      if (entries.length === 1) return entries[0].preparingLabel
      return `Preparing ${entries.length} actions…`
    }

    case 'running_tool':
      return phase.entry.runningLabel

    case 'awaiting_approval':
      return `Waiting for your approval: ${phase.entry.label}`

    case 'reasoning_fallback':
      return 'Reasoning model busy — using chat model…'

    default:
      return 'Working on your request…'
  }
}
