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
| `deepThinking.ts` | `deep_thinking` mode switch + Turn-tier section — [deepThinking.md](./deepThinking.md) |
| `capabilities.ts` | Dynamic **Enabled capabilities** prompt section from the tool registry |
| `promptTiers.ts` | Foundation / Scope / Turn prompt assembly |
| `historyCompression.ts` | Conversation history compression when context window is tight |
| `taskContinuity.ts` | Structural read→write nudges, report grounding — [taskContinuity.md](./taskContinuity.md) |
| `artifacts.ts` | Markdown report paths and tool result copy |
| `jsonSchema.ts` | Zod → JSON Schema for tool calling |
| `compression/` | Tool result size caps — [compression/README.md](./compression/README.md) |

More detail: [HELPERS.md](./HELPERS.md) (guards, errors, artifacts, streaming). Task continuity: [taskContinuity.md](./taskContinuity.md). Deep thinking: [deepThinking.md](./deepThinking.md). Activity status & tool UX: [activityStatus.md](./activityStatus.md).

## Rules

- Do not add connector-specific branches here.
- Do not add product-specific prompt text here.
- Connector-specific formatting belongs in the connector package (`handler.js` return values, manifest confirmation/preview templates).
- Connector-specific execution belongs in `<workspace>/.smile/connectors/<id>/handler.js` (sandbox) or declarative MCP mappings in the manifest.
- Task continuity uses tool **categories**, not connector tool names — see [taskContinuity.md](./taskContinuity.md).

## Tool Results

Tool results are persisted as private `type: 'tool_result'` messages. They are hidden from the chat UI but remain model-visible when a chat is reloaded, so the agent can continue from prior reads/searches without relying only on visible prose.

The runtime also keeps a per-turn `toolResultCache` to avoid re-executing identical tool calls in the same loop. That cache is not durable; the private tool-result messages are the durable transcript record.

Each executed tool batch also emits a UI-only `tool_summary` message (grouped icon bar) so the user can see what ran without reading raw tool output.
