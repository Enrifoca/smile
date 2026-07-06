# Agent Runtime

This folder contains the connector-neutral runtime.

## Files

| File | Role |
| --- | --- |
| `index.ts` | `Agent` class — conversation loop, tools, pending actions, streaming |
| `config.ts` | Runtime configuration and AI response contracts |
| `types.ts` | Messages, pending actions, tool entries, user profile |
| `tools.ts` | Core tool definitions (file, memory, context, `report_write`) |
| `toolEntries.ts` | UI labels for core tool calls (summary + activity phases) |
| `connectorToolEntries.ts` | Default connector tool labels from manifest metadata |
| `activityStatus.ts` | Composer status resolver (`AgentPhase` → label) — [activityStatus.md](./activityStatus.md) |
| `toolSummary.ts` | Collapsed tool-summary labels (aligned with `ToolEntry`) |
| `toolResults.ts` | Format core tool results for model context |
| `toolErrors.ts` | Detect failed tool results for retry / error loops |
| `capabilities.ts` | Dynamic **Core capabilities** and **Connector context** prompt sections from the tool registry |
| `promptTiers.ts` | Foundation / Scope / Turn prompt assembly |
| `historyCompression.ts` | Conversation history compression when context window is tight |
| `taskContinuity.ts` | Structural read→write nudges, report grounding — [taskContinuity.md](./taskContinuity.md) |
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

## Tool Results

Tool results are persisted as private `type: 'tool_result'` messages. They are hidden from the chat UI but remain model-visible when a chat is reloaded, so the agent can continue from prior reads/searches without relying only on visible prose.

The runtime also keeps a per-turn `toolResultCache` to avoid re-executing identical tool calls in the same loop. That cache is not durable; the private tool-result messages are the durable transcript record.

Each executed tool batch also emits a UI-only `tool_summary` message (grouped icon bar) so the user can see what ran without reading raw tool output.

## Pending actions

Write tools with `requiresConfirmation: true` pause the loop and surface a `PendingAction`. The UI renders an Accept / Refuse bar.

- `approveAction(actionId)` records the approval as a visible `role: 'system'` message (`User approved the <tool> write tool call.`) and then runs the tool.
- `rejectAction(actionId, { silent?: boolean })` cancels the pending action. A non-silent refusal emits a `role: 'system'` message (`User refused the <tool> write tool call.`) so the model and the user both see the outcome. A silent refusal is used when the user starts typing a new message instead, which implicitly means they want to respond rather than approve.

## Context inspector snapshot

`emitContextSnapshot` captures the prompt sections and history sent to the model on each turn. The snapshot is consumed by `ContextSummaryModal` for debugging.

- `userMessage` is the original user message for the turn, stored separately because runtime nudges are also pushed with `role: 'user'`.
- `sections` lists the non-overlapping prompt sections in order: System prompt, User context, Environment context, Memory, Core capabilities, Active context, Connector context, Recent conversation history.
- `totalTokens` is the sum of section tokens; it does not double-count content that appears in multiple sections or tool results that are shown separately.
