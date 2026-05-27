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
| `MarkdownRenderer` | Shared markdown → HTML (headings, lists, tables) |

Styles: `.ui-artifact-*`, `.ui-md-*` in `src/styles/globals.css`.

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
