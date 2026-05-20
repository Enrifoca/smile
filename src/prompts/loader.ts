export type PromptVariables = Record<string, string | undefined | null>

export function renderPrompt(template: string, variables: PromptVariables = {}): string {
  return template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_match, key: string) => {
    return variables[key]?.toString() || ''
  }).trim()
}

export function section(title: string, content?: string | null): string {
  const body = content?.trim()
  return body ? `## ${title}\n\n${body}` : ''
}
