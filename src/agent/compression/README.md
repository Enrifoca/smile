# Tool result compression

Framework step inspired by [TokenJuice](https://github.com/vincentkoc/tokenjuice): shrink verbose tool output **before it re-enters the model**.

## What this is not

- Does not compress the system prompt, user messages, or memory blocks.
- Does not decide what to store in Learned Notes or connector source memory.

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
| `file-read`, `memory`, `scratchpad` | Skip compression |
| `connector-read` | Cap ~8000 chars / 120 lines |
| `connector-write`, `connector-attachment` | Cap ~1500–2000 chars |
| `file-search`, `file-manage` | Moderate caps |

Adjust in `rules.ts`. Future: workspace rules under `.smile/compression/rules/`.

## Connector overrides

Future: optional compression profile in connector manifest. Connectors keep `formatToolResultForAI` for semantic shaping; the framework layer applies uniform caps.
