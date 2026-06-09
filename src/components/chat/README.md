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

The agent loop alternates **model calls** and **tool runs**. There is often no second tool happening during a long wait — the model is deciding what to do next.

| Status | Meaning |
| --- | --- |
| `Working on your request…` | First model call for this message |
| `Reasoning about next step…` | Reasoning model is working (before tools hit scratchpad) |
| `Analyzing file contents…` | Model call after a file read — interpreting the document |
| `Analyzing connector data…` | Model call after a connector read |
| `Thinking…` | Model reasoning block streaming |
| `Writing response…` | Model answer streaming |
| `Drafting markdown report…` / `Drafting report: …` | Model is streaming a `report_write` tool call (can take 20–30s for large specs) |
| `Saving report…` | Report file is being written to disk |
| `Summarizing report…` | Model is writing the short follow-up after a report was saved |
| `Preparing: …` / `Running: …` | Model chose tool(s); about to execute or executing |
| `(Ns)` suffix | Elapsed seconds on steps longer than 3s — not frozen |

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

Agent-side status labels and task continuity: [src/agent/taskContinuity.md](../../agent/taskContinuity.md).

Legacy import: `./ActionConfirm` re-exports `WriteActionConfirmModule`.
