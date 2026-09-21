# Task continuity

Framework guards that keep explicit multi-step **read -> write** workflows from stopping early or drifting from source material, and catch cases where the model promises a retry/fix but emits no tool call.

Used by `index.ts` on every user turn. Connector-neutral — uses tool **categories** (`connector-read`, `file-write`, etc.) and **tool run records**, plus a small safety regex for retry/fix promises without a matching tool call.

## Problem it solves

| Failure | Example |
| --- | --- |
| **Early stop** | Agent reads an existing report artifact for revision, then produces no usable response or write |
| **Invented output** | Agent reads a report then `report_write`s with made-up content |
| **Stalled retry** | Agent says "Let me fix the data and retry" but emits no tool call |

## How it works

```text
User message (in conversation history)
  → agent loop (tools + model)
      -> shouldNudgeIncompleteWorkflow(toolsRunThisTurn, responseText)
       signals:
         - retry/fix promise without a tool call
         - framework-visible pending write from a tool result
         - read-only tools used this turn with no follow-up write
       -> [SYSTEM] nudge from buildIncompleteWorkflowNudge(responseText, toolsRunThisTurn)
```

## Module API (`taskContinuity.ts`)

| Export | Role |
| --- | --- |
| `ToolRunRecord` | Tool name, category, optional path from args |
| `isReadOnlyTool` / `isWriteTool` | Classify tools via `ToolCategory` + core tool names |
| `shouldNudgeIncompleteWorkflow` | Detect incomplete workflows from tool state + retry/fix prose |
| `buildIncompleteWorkflowNudge` | System message injected to continue the loop |
| `buildReportGroundingHint(path)` | Appended to `file_read` results for report paths |

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
- Keep keyword matching minimal and action-oriented (retry/fix promises); the user's message is already in history for the model.
- Do not put user-facing copy in this file; nudges are `[SYSTEM]` messages for the model.
- Prompt-level behavior belongs in `src/prompts/core/system.md`.
