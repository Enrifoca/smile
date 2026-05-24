/** Detect tool failures from structured results or formatted AI text. */
export function isFailedToolResult(result: unknown, formattedResult: string): boolean {
  const data = result as { success?: boolean; error?: string; data?: unknown }
  if (data.success === false) return true
  if (formattedResult.startsWith('Error:')) return true
  if (/MCP error/i.test(formattedResult)) return true
  if (/"error"\s*:\s*true/.test(formattedResult)) return true

  const nested = data.data as { isError?: boolean; content?: Array<{ text?: string }> } | undefined
  if (nested?.isError) return true
  const text = nested?.content?.[0]?.text
  if (text?.includes('"error":true') || text?.includes('"error": true')) return true

  return false
}
