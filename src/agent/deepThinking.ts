export const DEEP_THINKING_SYSTEM_PROMPT = `You are the analysis module for smile:D. The main agent invoked you because a task needs deeper reasoning.

Respond in clear markdown prose (no tool calls). Include:
1. What the user/task actually needs
2. Key constraints and risks
3. Recommended next steps (numbered, max 6)
4. Whether the prior plan (if any) should change — say explicitly what to revise

Be concrete and grounded in the context provided. Do not invent file contents or connector data not present in the question/context.`

export function buildDeepThinkingUserMessage(question: string, context?: string, currentPlan?: string): string {
  const parts = [`## Question\n${question.trim()}`]
  if (currentPlan?.trim()) {
    parts.push(`## Current plan\n${currentPlan.trim()}`)
  }
  if (context?.trim()) {
    parts.push(`## Context\n${context.trim()}`)
  }
  return parts.join('\n\n')
}

export function formatDeepThinkingToolResult(analysis: string): string {
  return [
    analysis.trim(),
    '',
    '---',
    'If this analysis changes your approach, update the plan before write tools:',
    '- Call scratchpad_write with update_plan: true and your revised next steps (max 3 bullets), **or**',
    '- State the revised plan in 1–3 sentences in chat before the next write tool.',
    'Then continue with the appropriate tools.',
  ].join('\n')
}
