export interface DeepThinkingRequest {
  question: string
  context?: string
}

/**
 * Turn-tier section injected on the next model call after `deep_thinking` is invoked.
 * Active only when the reasoning model runs that call.
 */
export function buildDeepThinkingTurnSection(request: DeepThinkingRequest): string {
  const lines = [
    '## Deep thinking (ACTIVE — this call only)',
    '',
    'You invoked `deep_thinking` because this task needs structured reasoning before the next tools, or deep analysis when light thinking is insufficient (trade-offs, synthesis, multi-source comparison, long-form conclusions).',
    '',
    'In this response:',
    '1. Use `<think>` for the full analysis — take the space you need.',
    '2. When planning is part of the goal: call `scratchpad_write` with `update_plan: true` and keep the plan concise and actionable.',
    '3. When the goal is analysis: deliver conclusions in visible prose unless the user explicitly asked for a report or artifact — do not leave the analysis only inside thinking tags.',
    '4. Then continue with the required tool calls; never stop at analysis alone when execution is still owed.',
    '',
    `**Focus:** ${request.question.trim()}`,
  ]

  if (request.context?.trim()) {
    lines.push('', `**Additional context:** ${request.context.trim()}`)
  }

  return lines.join('\n')
}

/** Tool result after activating deep thinking mode (no separate model call). */
export function formatDeepThinkingToolAck(): string {
  return [
    'Deep thinking mode active for your next step.',
    'Your next model call uses the reasoning model with the Deep thinking section above in the system prompt.',
    'Perform the analysis, update the scratchpad plan if planning is part of the goal, then continue with tools.',
  ].join(' ')
}
