# Task continuity

Framework guards that keep multi-step **read → write** workflows from stopping early or drifting from source material.

Used by `index.ts` on every user turn. Connector-neutral — uses tool **categories** (`connector-read`, `file-write`, etc.), not product-specific tool names.

## Problem it solves

| Failure | Example |
| --- | --- |
| **Early stop** | User asks to update a report → agent `file_read`s → chat says “done” → no `report_write` |
| **Invented output** | Agent reads a report then `report_write`s a new file with made-up tasks/counts |

## How it works

```text
User message
  → inferTurnIntent()           (update_report, update_file, draft_report, general)
  → scratchpad + system prompt  ("User goal this turn: …")
  → agent loop (tools + model)
  → shouldNudgeIncompleteWorkflow()
       if edit intent + read ran + no write + prose reply
       → [SYSTEM] nudge: call report_write / file_write, same path, grounded content
```

## Module API (`taskContinuity.ts`)

| Export | Role |
| --- | --- |
| `inferTurnIntent(userMessage)` | Classify the turn from user text (English keywords + `.md` paths) |
| `formatTurnIntentForScratchpad(intent)` | One-line goal for session scratchpad |
| `isReadOnlyTool` / `isWriteTool` | Classify tools via `ToolCategory` + core tool names |
| `shouldNudgeIncompleteWorkflow` | Detect read-without-write on edit tasks |
| `buildIncompleteWorkflowNudge` | System message injected to continue the loop |
| `buildReportGroundingHint(path)` | Appended to `file_read` results for report paths |

## Related files

| File | Role |
| --- | --- |
| `index.ts` | Wires intent, tracking, nudges into the agent loop |
| `toolResults.ts` | Appends grounding hints after `file_read` |
| `artifacts.ts` | Report tool result text (same-path revise rules) |
| `toolErrors.ts` | Detect failed tool results for retry loops |
| `actionGuards.ts` | Action-first guard — [HELPERS.md § Loop guards](./HELPERS.md#loop-guards) |
| `../prompts/core/system.md` | Reports section — grounding + same-path overwrite |
| `../components/chat/artifacts/README.md` | Report card UI |

## Customization

- **New workflow types:** add a `TurnIntentKind` + nudge in `buildIncompleteWorkflowNudge`.
- **Connector read/write detection:** uses `ToolDefinition.category` from `src/connectors/types.ts` — no connector ids in this module.

## Rules

- Do not add connector-specific tool name lists here — use categories.
- Do not put user-facing copy in this file; nudges are `[SYSTEM]` messages for the model.
- Prompt-level behavior belongs in `src/prompts/core/system.md`.
- Keep keyword lists **English only** — smile:D framework copy and intent heuristics are English; do not add locale-specific phrases to core code.
