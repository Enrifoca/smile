# Agent Runtime

This folder contains the connector-neutral runtime.

## Files

- `index.ts` exports the `Agent` class and public runtime APIs.
- `config.ts` defines runtime configuration and AI response contracts.
- `jsonSchema.ts` converts Zod tool schemas into JSON schema for model tool calling.
- `toolEntries.ts` formats core tool calls for UI summaries.
- `toolResults.ts` unwraps and compacts core tool results for model context.
- `scratchpad.ts` formats automatic scratchpad notes.
- `actionGuards.ts` contains generic guardrails that nudge the model toward tools.
- `tools.ts` defines core file, memory, and scratchpad tools.
- `types.ts` defines public message, action, and profile types.

## Rules

- Do not add connector-specific branches here.
- Do not add product-specific prompt text here.
- Connector-specific formatting belongs in `src/connectors/<id>/formatters.ts`.
- Connector-specific execution belongs in `src/connectors/<id>/runtime.ts`.
