# Agent Runtime

This folder contains the connector-neutral runtime.

## Files

| File | Role |
| --- | --- |
| `index.ts` | `Agent` class — conversation loop, tools, pending actions, streaming |
| `config.ts` | Runtime configuration and AI response contracts |
| `types.ts` | Messages, pending actions, tool entries, user profile |
| `tools.ts` | Core tool definitions (file, memory, scratchpad, `report_write`) |
| `toolEntries.ts` | UI labels for core tool calls |
| `toolResults.ts` | Format core tool results for model context |
| `toolErrors.ts` | Detect failed tool results for retry / error loops |
| `scratchpad.ts` | Auto scratchpad notes after tools |
| `actionGuards.ts` | Nudge model toward tools on actionable requests |
| `taskContinuity.ts` | Turn intent, read→write nudges, report grounding — [taskContinuity.md](./taskContinuity.md) |
| `artifacts.ts` | Markdown report paths and tool result copy |
| `jsonSchema.ts` | Zod → JSON Schema for tool calling |
| `compression/` | Tool result size caps — [compression/README.md](./compression/README.md) |

More detail on helpers: [HELPERS.md](./HELPERS.md).

## Rules

- Do not add connector-specific branches here.
- Do not add product-specific prompt text here.
- Connector-specific formatting belongs in `src/connectors/<id>/formatters.ts`.
- Connector-specific execution belongs in `src/connectors/<id>/runtime.ts`.
- Task continuity uses tool **categories**, not connector tool names — see [taskContinuity.md](./taskContinuity.md).
