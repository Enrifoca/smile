# Task continuity

Framework guards that keep multi-step **read → write** workflows from stopping early or drifting from source material.

Used by `index.ts` on every user turn. Connector-neutral — uses tool **categories** (`connector-read`, `file-write`, etc.) and **tool run records**, not user-message keyword lists.

## Problem it solves

| Failure | Example |
| --- | --- |
| **Early stop** | Agent `file_read`s → chat says “done” → no `report_write` |
| **Ack-only stop** | Agent streams a short acknowledgment → no tools called |
| **Invented output** | Agent reads a report then `report_write`s with made-up content |

## How it works

```text
User message (in conversation history — no keyword intent layer)
  → agent loop (tools + model)
  → shouldNudgeIncompleteWorkflow(toolsRunThisTurn, responseText)
       structural signals only:
         - read/gather without write this turn
         - chat prose with zero tools this turn
       → [SYSTEM] nudge from buildIncompleteWorkflowNudge(toolsRunThisTurn)
```

## Module API (`taskContinuity.ts`)

| Export | Role |
| --- | --- |
| `ToolRunRecord` | Tool name, category, optional path from args |
| `isReadOnlyTool` / `isWriteTool` | Classify tools via `ToolCategory` + core tool names |
| `shouldNudgeIncompleteWorkflow` | Detect incomplete workflows from tool runs (+ non-empty prose with zero tools) |
| `buildIncompleteWorkflowNudge` | System message injected to continue the loop |
| `buildReportGroundingHint(path)` | Appended to `file_read` results for report paths |
| `buildPendingWriteScratchpadSuffix` | Scratchpad hint after reads (path-based) |

## Related files

| File | Role |
| --- | --- |
| `index.ts` | Tracks `toolsRunThisTurn`, wires nudges into the agent loop |
| `toolResults.ts` | Appends grounding hints after `file_read` |
| `artifacts.ts` | Report tool result text (same-path revise rules) |
| `toolErrors.ts` | Detect failed tool results for retry loops |
| `../prompts/core/system.md` | Action-first contract — model-side, not keyword guards |
| `../components/chat/artifacts/README.md` | Report card UI |

## Rules

- Do not add connector-specific tool name lists here — use categories.
- Do not add user-message keyword or locale matching — the user's message is already in history for the model.
- Do not put user-facing copy in this file; nudges are `[SYSTEM]` messages for the model.
- Prompt-level behavior belongs in `src/prompts/core/system.md`.
