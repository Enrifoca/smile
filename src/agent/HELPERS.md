# Agent runtime helpers

Supporting modules used by the agent loop in `index.ts`. Module index: [README.md](./README.md). Architecture overview: [docs/architecture.md](../../docs/architecture.md).

## Loop guards

Core nudges that keep the model on track during a user turn. Wired in `index.ts`.

| Guard | Module | Detail |
| --- | --- | --- |
| **Task continuity** | `taskContinuity.ts` | [taskContinuity.md](./taskContinuity.md) |
| **Tool errors** | `toolErrors.ts` | [Error handling](#error-handling) |
| **Think-only stop** | `index.ts` | Nudge when the model emits thinking with no tools or answer |

Task continuity covers early stops (read without write, chat prose without tools). Signals are **structural** — tool runs and response shape — not user-message keywords.

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

## Deep thinking

| Module | Role |
| --- | --- |
| `deepThinking.ts` | Reasoning-model pass for `deep_thinking` tool |
| `capabilities.ts` | Tool-registry summary shared with main agent and deep thinking |

The reasoning pass receives enabled tools, active context, connector prompt excerpts, working notes, and current plan — see [deepThinking.md](./deepThinking.md).

Mode switch: `deep_thinking` activates extended reasoning on the **next** loop iteration via a Turn-tier prompt section — no separate API call.

## Streaming

| Module | Role |
| --- | --- |
| `../shared/streamProgress.ts` | Draft progress during tool-call streaming (`Drafting report…`) |

Wired in `electron/services/ai.ts` → agent `onAgentStatus`.
