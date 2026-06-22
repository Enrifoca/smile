# Markdown report artifacts

Manus-style **report cards** in chat when the agent calls `report_write`.

## Agent tool

`report_write` saves markdown to the workspace (default: `.smile/reports/<date>_<slug>.md`) and emits a chat **artifact** message.

| Field | Purpose |
| --- | --- |
| `title` | Card + modal heading |
| `content` | Full markdown (tables, lists, record specs) |
| `path` | Optional override path |

The tool result tells the model the path — use `file_read` on that path when the user iterates. After saving, the agent must summarize with the **same count and titles** as in the report.

## UI modules

| Module | Role |
| --- | --- |
| `MarkdownArtifactCard` | Inline preview in the transcript; click to open |
| `MarkdownArtifactModal` | Full-screen reader |
| `ActiveReportPill` | Composer chip for the latest report — open or dismiss |
| `MarkdownRenderer` | Shared markdown → HTML (headings, lists, tables) |

Styles: `.ui-artifact-*`, `.ui-md-*`, `.ui-chat-report-pill*` in `src/styles/globals.css`.

## Active report pill

After `report_write`, the **latest** report appears above the composer with an **Active report** heading and a clickable pill (`ActiveReportPill`). White bordered styling (vs gray file attachment pills).

| Control | Behavior |
| --- | --- |
| **Active report** heading | Labels the pinned report context (independent of the input placeholder) |
| Click pill (except ×) | Opens the full report in `MarkdownArtifactModal` |
| **×** (dismiss) | Hides the chip for that report message |
| Hover | Full pill gets a gray background |
| New `report_write` | A new artifact message brings the pill back automatically |

Dismiss is per artifact message id, not per file path — revising the same path emits a new artifact and the pill returns.

## report_write vs file_write

| | `report_write` | `file_write` |
| --- | --- | --- |
| Purpose | Chat-visible markdown reports | General workspace files |
| Default path | `.smile/reports/<date>_<slug>.md` | Any path you pass |
| UI | Report card + composer pill + tool result copy for the model | No report UI (unless path is under `.smile/reports/` — then card/pill still appear as a fallback) |
| When revising | Same path + `title` for the card | Same path only |

Prefer **`report_write`** only for explicit reports, substantial plans/specs, batch lists, or lengthy/tabular structured documents. If the model uses `file_write` under `.smile/reports/`, the UI still activates so features are not lost.

## Customization

- Edit rendering: `MarkdownRenderer.tsx`
- Edit card/modal layout: `MarkdownArtifactCard.tsx`, `MarkdownArtifactModal.tsx`
- Change default folder: `buildReportPath()` in `src/agent/artifacts.ts`
- Prompt guidance: `src/prompts/core/system.md` (Reports section)
- Read→write behavior: [src/agent/taskContinuity.md](../../agent/taskContinuity.md)

## Grounding rules

When the user revises a report:

1. Agent calls `file_read` on the report path.
2. Agent calls `report_write` with the **same path** and content derived from the read — not invented.
3. Task continuity nudges the loop if the agent stops after read without write.

Future artifact types can live alongside this folder and use `Message.type: 'artifact'` with a discriminated union.
