# Agent runtime helpers

Supporting modules used by the agent loop in `index.ts`. Module index: [README.md](./README.md). Architecture overview: [docs/architecture.md](../../docs/architecture.md).

## Loop guards

Core nudges that keep the model on track during a user turn. Wired in `index.ts`.

| Guard | Module | Detail |
| --- | --- | --- |
| **Action-first** | `actionGuards.ts` | Below |
| **Task continuity** | `taskContinuity.ts` | [taskContinuity.md](./taskContinuity.md) |
| **Tool errors** | `toolErrors.ts` | [Error handling](#error-handling) |
| **Think-only stop** | `index.ts` | Nudge when the model emits thinking with no tools or answer |

### Action-first (`actionGuards.ts`)

`shouldNudgeActionFirst()` — detects when the user asked for an actionable operation and the model replied with a plan in chat instead of calling tools.

**Triggers** (user message looks actionable + model reply matches):

| Signal | Nudge? |
| --- | --- |
| Response **> 700 chars** | Yes |
| **Bullet / numbered list** | Yes — **unless** `report_write` succeeded this turn |
| **“I will / I can / I'll …”** | Yes |

**`report_write` exception:** After a successful `report_write`, bullet summaries in the follow-up are expected (per `system.md` Reports section). List markers alone do not count as planning. Long replies and deferred-action phrasing still nudge — e.g. the user asked for report **and** connector writes in one message.

**Context:** `index.ts` sets `reportWriteSucceededThisTurn` on successful `report_write` and passes it as `ActionFirstContext`.

**Scratchpad** (`scratchpad.ts`): auto notes after tools; injected into the system prompt each turn. No separate guard — supports intent and continuity.

## Error handling

| Module | Role |
| --- | --- |
| `toolErrors.ts` | `isFailedToolResult()` — MCP JSON errors, `success: false`, etc. |
| `../shared/aiErrors.ts` | Provider overload/rate-limit detection, retry backoff, user-facing copy |

Connector `approveAction` can set `resumeAgent: true` (see `src/connectors/types.ts`) so recoverable write failures re-enter the loop.

## Reports & artifacts

| Module | Role |
| --- | --- |
| `artifacts.ts` | `MarkdownArtifact`, `buildReportPath()`, `buildReportToolResult()` |
| `../components/chat/artifacts/` | Report card, active pill, modal — [artifacts README](../components/chat/artifacts/README.md) |

Agent emits `Message.type: 'artifact'` after successful `report_write` (and `file_write` under `.smile/reports/*.md` as fallback).

## Streaming

| Module | Role |
| --- | --- |
| `../shared/streamProgress.ts` | Draft progress during tool-call streaming (`Drafting report…`) |

Wired in `electron/services/ai.ts` → agent `onAgentStatus`.
