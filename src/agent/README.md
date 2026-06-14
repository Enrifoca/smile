# Agent Runtime

This folder contains the connector-neutral runtime.

## Files

| File | Role |
| --- | --- |
| `index.ts` | `Agent` class — conversation loop, tools, pending actions, streaming |
| `config.ts` | Runtime configuration and AI response contracts |
| `types.ts` | Messages, pending actions, tool entries, user profile |
| `tools.ts` | Core tool definitions (file, memory, scratchpad, `report_write`) |
| `toolEntries.ts` | UI labels for core tool calls (summary + activity phases) |
| `connectorToolEntries.ts` | Default connector tool labels from manifest metadata |
| `activityStatus.ts` | Composer status resolver (`AgentPhase` → label) — [activityStatus.md](./activityStatus.md) |
| `toolSummary.ts` | Collapsed tool-summary labels (aligned with `ToolEntry`) |
| `toolResults.ts` | Format core tool results for model context |
| `toolErrors.ts` | Detect failed tool results for retry / error loops |
| `scratchpad.ts` | Auto scratchpad notes after tools |
| `actionGuards.ts` | Action-first guard — [HELPERS.md § Loop guards](./HELPERS.md#loop-guards) |
| `taskContinuity.ts` | Read→write nudges, report grounding — [taskContinuity.md](./taskContinuity.md) |
| `artifacts.ts` | Markdown report paths and tool result copy |
| `jsonSchema.ts` | Zod → JSON Schema for tool calling |
| `compression/` | Tool result size caps — [compression/README.md](./compression/README.md) |

More detail: [HELPERS.md](./HELPERS.md) (guards, errors, artifacts, streaming). Task continuity: [taskContinuity.md](./taskContinuity.md). Activity status & tool UX: [activityStatus.md](./activityStatus.md).

## Rules

- Do not add connector-specific branches here.
- Do not add product-specific prompt text here.
- Connector-specific formatting belongs in the connector package (`handler.js` return values, manifest confirmation/preview templates).
- Connector-specific execution belongs in `<workspace>/.smile/connectors/<id>/handler.js` (sandbox) or declarative MCP mappings in the manifest.
- Task continuity uses tool **categories**, not connector tool names — see [taskContinuity.md](./taskContinuity.md).
