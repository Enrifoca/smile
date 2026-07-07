# Markdown report artifacts

Manus-style **report cards** in chat when the agent calls `report_write`.

## Agent tool

`report_write` saves markdown to the workspace and emits a chat **artifact** message. With an active context the default path is `.smile/contexts/<slug>/<date>_<slug>.md`; with no active context the default is `.smile/<date>_<slug>.md`.

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
| `MarkdownRenderer` | Shared markdown → HTML via `react-markdown` + `remark-gfm` (headings, lists, tables, code blocks, blockquotes, task lists) |

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
| Default path | Context folder (or `.smile/` if no context) | Any path you pass |
| UI | Report card + composer pill + tool result copy for the model | No report UI (unless path looks like a report — under `.smile/` with a date prefix or under `.smile/reports/` legacy) |
| When revising | Same path + `title` for the card | Same path only |

Prefer **`report_write`** only for explicit reports, substantial plans/specs, batch lists, or lengthy/tabular structured documents. If the model uses `file_write` under the context folder or `.smile/`, the UI still activates so features are not lost.

## Download / export

The report viewer (`MarkdownArtifactModal`) offers a **Download** menu with two exports:

- **PDF** — renders the Markdown report to a multi-page PDF via `html2canvas` + `jsPDF`. Formatting (headings, lists, tables, code, blockquotes) is preserved and long reports no longer get cut off.
- **.docx** — converts the Markdown report to a real Word document via `docx` and `marked`.

Both exports happen client-side from the markdown source; the agent only needs to produce the `.md` report. The system prompt tells the agent not to generate binary files when the user asks for PDF/DOCX, but to point them to the download menu instead.

Implementation: `src/utils/exportReport.ts` and `src/utils/markdownToDocx.ts`.

## Customization

- Edit rendering: `MarkdownRenderer.tsx` (uses `react-markdown` + `remark-gfm`)
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
