/**
 * Standard tool result envelope returned by connector handlers.
 * Matches the existing core convention so host formatting/error detection work
 * unchanged.
 */
export interface ToolResult<TData = unknown> {
  success: boolean
  data?: TData
  error?: string
}
