# Memory framework

Shared memory rules for the smile:D framework (connector-neutral).

## Layers

| Layer | File / store | Purpose |
| --- | --- | --- |
| User Memory | `user.md` | Explicit user rules (highest priority) |
| Learned Notes | `learned.md` | Agent-discovered habits via `memory_update` |
| Archived rollup | section in `learned.md` | Condensed older learned notes for prompt budget |
| Connector source memory | `sources/<connector>/<scope>/` | Write outcomes in monitored scopes; retrieve via `memory_read(section: "source")` |

## Learned note budget

Recent learned notes load verbatim into the prompt (newest first, char budget in `constants.ts`). When total learned text exceeds the rollup threshold, older notes are condensed into **Archived Rollup** — still kept in full on disk for `memory_read`.

## Admission

Use `validateLearnedNoteContent()` before saving learned notes. Tool payloads and JSON dumps are rejected.

See `docs/memory.md` for the full taxonomy.
