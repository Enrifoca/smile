# Memory

Connector-neutral memory rules for the smile:D framework.

## Three buckets — do not mix them

| Bucket | What belongs here | Written by | In system prompt? |
| --- | --- | --- | --- |
| **User Memory** (`user.md`) | Explicit rules the user wants always applied | User / Memories UI | Yes (authoritative) |
| **Learned Notes** (`learned.md`) | Habits, corrections, workflow preferences | Agent via `memory_update` | Yes — **budgeted** (recent + archived rollup) |
| **Connector source memory** (`sources/`) | Write outcomes in monitored scopes | Framework after successful connector writes | No — list of scopes only; retrieve on demand |

### Hard rules

1. **Never** save tool output, JSON, search results, or metrics in Learned Notes.
2. **Never** save preferences in connector source memory.
3. **Default deny** for connector leaves: ad-hoc reads do not persist.
4. User Memory always wins over Learned Notes and connector summaries.

## Learned note budget

Implementation: `src/memory/learnedBudget.ts`, constants in `src/memory/constants.ts`.

- **Recent block** — newest learned entries injected verbatim up to ~2000 characters.
- **Archived rollup** — when total learned text exceeds ~3200 characters, older entries are condensed into one paragraph (`learnedRollup` in `learned.md`). Full entries remain on disk for `memory_read`.
- Rollup is **deterministic** today (join with ` · `, truncate). Optional LLM consolidation can be added later for richer summaries.

## Admission validation

`src/memory/admission.ts` rejects learned notes that look like API dumps (JSON blobs, code fences, oversized text).

Enforced in:

- Electron `memoryService.addGeneralMemory` / `addLexiconEntry`
- Chat `memory_update` handler (returns error to the agent)

## Tool result compression

Separate from memory storage. See `src/agent/compression/README.md`.

Compression shrinks tool output **for the current model turn**. It does not decide what to remember.

## Conversation context compression

Two modules work together to keep long chats inside the model's context window without silently dropping messages.

### Inference-time compression (`src/agent/contextEngine.ts`)

Runs before every model call. It is **non-mutating**: the stored transcript stays intact, but only a compressed view is sent to the model.

Pipeline:

1. **Cheap pre-pass** — strip base64 data URIs, collapse old `[tool_result: …]` blocks to one-line summaries, deduplicate identical consecutive results, and cap individual message length.
2. **Budget check** — if the cheap view fits inside `contextWindowTokens - outputReserve - toolOverhead`, use it. The compressor subtracts the estimated token cost of the available tool definitions so that enabling many connectors does not push the request past the model limit.
3. **Head + tail protection** — keep the first ~3 user turns verbatim and fill a recent tail budget, anchored on the last user message plus the assistant/tool response that follows it.
4. **Middle summarization** — send the middle band to a cheap summary call and insert the result as a system message.
5. **Last-resort guard** — if even head + summary + tail exceeds the budget, drop oldest middle messages, cap the summary, truncate the system prompt only if necessary, and finally drop the oldest remaining message. This guard preserves the newest turn at the cost of older context.

### Background history compression (`src/agent/historyCompression.ts`)

Runs once per user turn when stored visible history crosses 50% of the configured context window. It **mutates** `conversationHistory`, replacing old turns with tiered chunk summaries and a master summary so the renderer and long-term memory usage do not grow forever. The most recent 14 turns are always kept verbatim.

### Configuration

`contextWindowTokens` is read from Settings → Agent Behavior (stored as `agentContextWindow`). Set it to the actual context-window size of the model/provider you are using. If the value is larger than the real model limit, the provider will still reject the request.

## Connector source memory (phase 2)

Storage: `.smile/memories/sources/<connectorId>/<scopeId>/`

- `buffer.jsonl` — recent write-outcome leaves (not yet sealed)
- `summaries/L1-*.md` — sealed batches when the buffer exceeds ~3000 characters
- `meta.json` — buffer size and last seal timestamp

### Admission

Leaves are appended only when:

- The connector write tool succeeds (`connector-write` or `connector-attachment` category), **and**
- The scope is in the user's monitored scopes list, **and**
- The connector can resolve `connectorId` + `scopeId` from tool args (e.g. a project key or workspace id)

Not persisted:

- Ad-hoc connector reads (search, get issue, etc.)
- Writes in scopes the user does not monitor

### Retrieval

- System prompt lists monitored scopes with a pointer to `memory_read`.
- `memory_read(section: "source", connectorId, scopeId)` returns buffer + recent sealed summaries.
- `memory_read(section: "source")` without ids lists all scopes with stored evidence.

### Connector hooks

Implement on `ConnectorDefinition`:

- `getScopeForSourceMemory(toolName, args)` → `{ connectorId, scopeId } | null`
- `buildSourceMemoryLeaf(toolName, args, formattedResult)` → leaf draft (optional; framework default exists)

## Files

| Path | Role |
| --- | --- |
| `src/memory/` | Budget, admission, rollup, source memory helpers |
| `src/types/memory.ts` | Types + prompt formatting |
| `electron/services/memory.ts` | User + learned disk persistence |
| `electron/services/sourceMemory.ts` | Connector source disk persistence |
| `.smile/memories/user.md` | User Memory |
| `.smile/memories/learned.md` | Learned Notes + Archived Rollup section |
| `.smile/memories/sources/` | Per-scope connector evidence |

## For connector authors

Do not add connector-specific fields to `MemoryStore`. Use Learned Notes for cross-cutting preferences and source leaves for scoped external evidence from writes.
