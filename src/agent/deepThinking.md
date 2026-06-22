# Deep thinking

Extended reasoning mode activated via the `deep_thinking` tool — **not** a separate agent or API call.

## Flow

```text
Main loop (iter N)
  → model calls deep_thinking(question, context?)
  → activateDeepThinking() sets pendingDeepThinking, returns ack

Main loop (iter N+1)
  → callAI uses reasoning model (even if iter > 1)
  → Turn tier includes ## Deep thinking (ACTIVE — this call only)
  → model analyzes in <think>, updates scratchpad plan if needed, continues with tools
  → pendingDeepThinking cleared after call completes
```

## Why this design

- **One agent, one prompt pipeline** — enabled capabilities, active context, scratchpad, connector prompts, and user preferences are already in the system prompt.
- **No mini-agent** — the model does not formulate a sub-request for another pass; it switches mode and reasons on the next iteration.
- **Two use cases** — sharper scratchpad plan *or* genuine heavy analysis (synthesis, trade-offs, large data).

## Code

| Piece | Location |
| --- | --- |
| Mode activation | `activateDeepThinking()` in `index.ts` |
| Turn-tier section | `buildDeepThinkingTurnSection()` in `deepThinking.ts` |
| Reasoning model gate | `useReasoning = hasReasoningModel && (firstIter \|\| pendingDeepThinking)` in `callAI()` |
| Composer label | `isDeepThinkingIteration` in `activityStatus.ts` |

## Requirements

- Reasoning model configured in Settings (same as first-loop light reasoning).
- Without it, `deep_thinking` returns an error.

See also: [promptTiers.ts](./promptTiers.ts), [activityStatus.md](./activityStatus.md).
