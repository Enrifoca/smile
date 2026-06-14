# Activity status & tool-call UX

How the composer status line, chat transcript, and tool-summary rows stay aligned during an agent turn.

## Scope

These mechanisms apply to **every tool call** (file, memory, context, connector, `report_write`). There is no report-only branch in the status pipeline — `report_write` is just one core tool with richer labels in `toolEntries.ts`.

Recent fixes (preamble before tools, first-turn status label) also apply **generally** whenever the model returns prose + tool calls in the same response.

## Architecture

```text
Agent (index.ts)
  setActivityPhase(AgentPhase)
    → resolveActivityLabel()     [activityStatus.ts]
    → setAgentStatus(string)
      → onAgentStatus            [ChatView]
        → ChatActivityIndicator  (composer, + elapsed seconds after 3s)

  getToolEntry(name, args)
    → connector getToolEntry?    [optional, manifest/handler]
    → getConnectorToolEntry()    [connectorToolEntries.ts]
    → getCoreToolEntry()         [toolEntries.ts]

  after tool batch
    → onMessage(type: tool_summary, toolEntries)
      → summariseToolEntries()   [toolSummary.ts]
        → ToolSummaryBlock       [ChatMessage.tsx]
```

## Two UI channels

| Channel | Where | When updated | Source |
| --- | --- | --- | --- |
| **Activity status** | Above composer (`ChatActivityIndicator`) | Live during the turn | `AgentPhase` → `resolveActivityLabel` |
| **Tool summary** | In transcript (`type: 'tool_summary'`) | After each tool batch completes | `ToolEntry.label` (past tense), collapsed via `summariseToolEntries` |
| **Assistant prose** | Normal chat bubble | Streamed or emitted before tools | `emitAssistantPreamble` / streaming `onUpdateMessage` |
| **Thinking block** | Collapsible row (`type: 'thinking'`) | When `</think>` closes | Stream parser in `callAI` |
| **Report artifact** | Report card (`type: 'artifact'`) | After successful `report_write` | `emitArtifactMessageFromResult` |

Status and tool summary share the same `ToolEntry` builder; they differ in **tense** (running vs past) and **timing** (live vs post-batch).

## ToolEntry shape

Defined in `types.ts`. Built once per tool invocation:

| Field | Used for |
| --- | --- |
| `label` | Expanded tool-summary row (past tense) |
| `preparingLabel` | Model streaming tool args; `preparing_tools` phase |
| `runningLabel` | Tool execution |
| `afterLabel` | Next model call after this tool (`awaiting_model`) |
| `group` | `file`, `memory`, or connector id — summary aggregation |
| `category` | `ToolDefinition.category` — summary aggregation |
| `connectorName` | Human name from manifest — summary text |

Core tools: `toolEntries.ts`. Connectors: `getConnectorToolEntry()` from manifest `name` + tool `category` (connector-neutral). Optional override: `ConnectorDefinition.getToolEntry`.

## AgentPhase → composer label

| Phase | Set when | Label |
| --- | --- | --- |
| `awaiting_model` | Start of each `callAI` | `Working on your request…`, or `Reasoning about next step…` if reasoning model **and** a tool already ran this turn, or `{lastEntry.afterLabel}` |
| `streaming_thinking` | Stream opens `<think>` | `Thinking…` |
| `streaming_text` | First visible answer token | `Writing response…` |
| `streaming_tool_draft` | `handleStreamProgress` (tool name/args streaming) | `{entry.preparingLabel}` |
| `preparing_tools` | Stream ended with tool calls | First entry's `preparingLabel`, or `Preparing N actions…` |
| `running_tool` | Before `executeTool` | `{entry.runningLabel}` |
| `awaiting_approval` | Write tool needs confirmation | `Waiting for your approval: {entry.label}` |
| `reasoning_fallback` | Reasoning model retry on chat model | `Reasoning model busy — using chat model…` |

Status is cleared to `null` only at end of `processMessage` (or `abort()`).

Fallback when status is null: `Working on your request…` in `ChatActivityIndicator`.

## Turn flow (one user message)

```text
processMessage(userMessage)
  inferTurnIntent → scratchpad note (nudges only, NOT status)
  runAgentLoop:
    loop:
      callAI()
        [awaiting_model]
        stream tokens → thinking / text / tool-draft progress
        if toolCalls:
          emitAssistantPreamble(prose)   ← prose in chat BEFORE tools
          [preparing_tools]
        return response

      if toolCalls:
        for each tool:
          [running_tool]
          if requiresConfirmation → [awaiting_approval] → return
          executeTool
          push [tool_result: …] to history (model context)
          optional artifact (report_write)
        emit tool_summary message (UI only, not in model history)
        continue loop

      else final text → break
```

## Model selection per iteration

| Condition | Model |
| --- | --- |
| Scratchpad empty this turn + reasoning configured | Reasoning model (`callAIReasoningStream`) |
| Scratchpad has content | Main chat model |

Reasoning is for initial analysis; execution steps use the faster chat model once the scratchpad is populated.

## Stream progress (tool args)

`electron/services/ai.ts` accumulates tool-call JSON deltas and calls `notifyToolDraftProgress` (`src/shared/streamProgress.ts`).

- Fires as soon as the tool **name** appears (not only when `report_write` title is parseable).
- Agent maps event → `getToolEntry` → `streaming_tool_draft`.

## Tool summary aggregation

`summariseToolEntries` groups by `category` / `group`:

| Pattern | Collapsed label |
| --- | --- |
| File reads (`file_read`, `file_list`, …) | `Explored N files` |
| Connector reads | `Checked {ConnectorName} (N)` |
| Connector writes | `Updated {ConnectorName} (N)` |
| File writes incl. `report_write` | `Wrote N files` |
| Memory / context ops | `Checked memory` / `Updated memory` |

Expanded row always shows each `ToolEntry.label`.

## Report-specific product pieces (not status logic)

These are separate from the status pipeline:

- `artifacts.ts` — path, tool result copy, export hint in tool result
- `emitArtifactMessageFromResult` — report card in chat
- `ActiveReportPill` — composer chip
- Prompt/tool description — default markdown via `report_write`

## Related docs

- Chat UI: [src/components/chat/README.md](../components/chat/README.md)
- Report artifacts: [src/components/chat/artifacts/README.md](../components/chat/artifacts/README.md)
- Task continuity nudges: [taskContinuity.md](./taskContinuity.md)
- Agent loop guards: [HELPERS.md](./HELPERS.md)
