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

## Connector source memory (phase 2)

Storage: `.smile/memories/sources/<connectorId>/<scopeId>/`

- `buffer.jsonl` — recent write-outcome leaves (not yet sealed)
- `summaries/L1-*.md` — sealed batches when the buffer exceeds ~3000 characters
- `meta.json` — buffer size and last seal timestamp

### Admission

Leaves are appended only when:

- The connector write tool succeeds (`connector-write` or `connector-attachment` category), **and**
- The scope is in the user's monitored scopes list, **and**
- The connector can resolve `connectorId` + `scopeId` from tool args (Jira: project key)

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
