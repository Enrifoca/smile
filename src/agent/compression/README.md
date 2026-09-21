# Tool result compression

Shrink verbose tool output **before it re-enters the model**.

This is the first, cheapest layer of compression. For the second layer — deciding which conversation history to send to the model — see [`src/agent/contextEngine.ts`](../contextEngine.ts) and [`src/agent/historyCompression.ts`](../historyCompression.ts).

## What this is not

- Does not compress the system prompt, user messages, or memory blocks.
- Does not decide what to store in Learned Notes or connector source memory.
- Does not decide which old turns to keep, drop, or summarize (that is the context engine).

## Pipeline

```text
tool executes
  → connector formatToolResultForAI (optional, structured JSON → lines)
  → compressToolResult (category defaults: max chars/lines)
  → agent conversation history
```

## Category defaults

| Category | Behavior |
| --- | --- |
| `file-read`, `memory` | Skip compression |
| `connector-read` | Cap ~8000 chars / 120 lines |
| `connector-write`, `connector-attachment` | Cap ~1500–2000 chars |
| `file-search`, `file-manage` | Moderate caps |

Adjust in `rules.ts`. Future: workspace rules under `.smile/compression/rules/`.

## Connector overrides

Future: optional compression profile in connector manifest. Connectors keep `formatToolResultForAI` for semantic shaping; the framework layer applies uniform caps.
