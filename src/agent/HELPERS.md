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

Agent emits `Message.type: 'artifact'` after successful `report_write` (and `file_write` under the active context folder or `.smile/*.md` as fallback).

## Visual generation tools

Core tools for creating report visuals. Implemented in `ChatView` and routed through `AgentConfig.executeVisualTool`.

| Tool | Backend | Notes |
| --- | --- | --- |
| `generate_chart` | Apache ECharts (renderer) | Data-driven PNG; supports `bar`, `line`, `pie`, `doughnut`, and ECharts option overrides. |
| `generate_image` | Connector → native model fallback | Uses the `image-generation` connector if installed; otherwise falls back to the active chat model's native image capability (e.g., OpenAI gpt-4o). If neither is available, returns a guidance error. |

Both tools save PNGs to the workspace via `file.writeBinary` and return `{ success: true, path }` for report references.

## Streaming

| Module | Role |
| --- | --- |
| `../shared/streamProgress.ts` | Draft progress during tool-call streaming (`Drafting report…`) |

Wired in `electron/services/ai.ts` → agent `onAgentStatus`.
