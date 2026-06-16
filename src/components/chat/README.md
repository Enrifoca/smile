# Chat modules

Chat-specific UI built on the shared kit in `src/components/ui/`.

## Write action bar

When the agent calls a write tool, it explains the action in the chat transcript. Approval is a compact **Accept / Refuse** bar pinned above the message composer (`WriteActionConfirmModule` in `WriteActionConfirmModule.tsx`).

- The agent speaks in chat; the bar is only for approval.
- To iterate, the user types changes in the chat (same as before).
- Button copy defaults live in `writeActionConfirmDefaults.ts`.
- Primary label can come from the connector's `getActionConfirmation` → `approveLabel`.

### Connector hooks

| Hook | Purpose |
| --- | --- |
| `getActionConfirmation` | `approveLabel` for the Accept button; optional fields for fallback chat copy |
| `getActionConfirmationPrompt` | Structured fallback when the model does not explain the action in prose |

Styles: `.ui-write-action-bar` in `src/styles/globals.css` — white content box, grey border (same family as Settings / connector panels).

## Activity status (agent loop)

The agent loop alternates **model calls** and **tool runs**. Labels are resolved centrally in `src/agent/activityStatus.ts` from tool metadata in `toolEntries.ts` / `connectorToolEntries.ts`.

Full mapping (phases, preamble order, tool summary): [src/agent/activityStatus.md](../../agent/activityStatus.md).

| Status | Meaning |
| --- | --- |
| `Working on your request…` | First model call for this message (fallback when status is unset) |
| `Reasoning about next step…` | Reasoning model **after** a tool already ran this turn |
| `{afterLabel}` from last tool | Model call after a tool — e.g. analyzing file, connector, or report results |
| `Thinking…` | Model reasoning block streaming |
| `Writing response…` | Model answer streaming (intro prose before tools uses this too when streamed) |
| `{preparingLabel}` | Model is streaming a tool call (any tool — file, connector, report, …) |
| `{runningLabel}` | Tool executing |
| `Waiting for your approval: …` | Write action paused for Accept/Refuse |
| `Reasoning model busy — using chat model…` | Reasoning model fallback |
| `(Ns)` suffix | Elapsed seconds on steps longer than 3s — not frozen |

**Preamble order:** if the model returns chat prose + tool calls in one response, prose is emitted to the transcript (`emitAssistantPreamble`) **before** tool status / execution — for any tool, not only `report_write`.

Tool-summary rows use the same `ToolEntry` labels — see `src/agent/toolSummary.ts`.

After a tool summary row (e.g. “Explored 1 file”), the next step is always a **model round**, not another tool yet.

## Markdown report artifacts

When the agent calls `report_write`, a **report card** appears in chat (Manus-style). Click to open the full markdown in a modal. The same report is also pinned above the composer as an **active report pill** (dismiss with × to ask unrelated questions). Modules live in `src/components/chat/artifacts/`. See `src/components/chat/artifacts/README.md`.

## Other chat modules

| Module | Use |
| --- | --- |
| `ChatBanner` | Connector connection status above the transcript |
| `ChatActivityIndicator` | Live status while the agent is working — wired from `src/agent/index.ts` via `onAgentStatus` |
| `ChatEmptyState` | Empty transcript placeholder |
| `ActiveReportPill` | Latest report chip above composer — see artifacts README |

Agent-side status labels and task continuity: [src/agent/activityStatus.md](../../agent/activityStatus.md), [src/agent/taskContinuity.md](../../agent/taskContinuity.md).
