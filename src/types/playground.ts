/** A single line streamed from a connector sandbox to the Studio Playground. */
export interface PlaygroundLogEntry {
  connectorId: string
  level: string
  args: unknown[]
  timestamp: string
}
