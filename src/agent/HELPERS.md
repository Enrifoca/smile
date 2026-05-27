# Agent runtime helpers

Brief reference for supporting modules in `src/agent/`. The main loop lives in `index.ts` — see [README.md](./README.md).

## Error handling

| Module | Role |
| --- | --- |
| `toolErrors.ts` | `isFailedToolResult()` — detects MCP JSON errors, `success: false`, etc. so the loop can retry |
| `../shared/aiErrors.ts` | Provider overload/rate-limit detection, retry backoff, user-facing error copy |

Connector `approveAction` can set `resumeAgent: true` (see `src/connectors/types.ts`) so recoverable write failures re-enter the loop.

## Reports & artifacts

| Module | Role |
| --- | --- |
| `artifacts.ts` | `MarkdownArtifact` type, `buildReportPath()`, `buildReportToolResult()` |
| `../components/chat/artifacts/` | Report card + modal UI |

Agent emits `Message.type: 'artifact'` after successful `report_write`.

## Task continuity

See [taskContinuity.md](./taskContinuity.md) — read→write nudges, turn intent, report grounding.

## Other guards

| Module | Role |
| --- | --- |
| `actionGuards.ts` | Nudge model away from long plans when user asked for action |
| `scratchpad.ts` | Auto notes after tools; visible in system prompt all turn |

## Streaming

| Module | Role |
| --- | --- |
| `../shared/streamProgress.ts` | Tool-call draft progress during model streaming (`Drafting report…`) |

Wired in `electron/services/ai.ts` → agent `onAgentStatus`.
