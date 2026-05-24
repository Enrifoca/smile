# Repository Map

## Top Level

- `src` contains the renderer app, agent runtime, prompts, connectors, UI, and shared types.
- `electron` contains desktop services and IPC wiring.
- `docs` contains architecture and contributor documentation.
- `AGENTS.md` is the quick-start instruction file for coding agents.

## `src`

- `src/agent`: connector-neutral agent runtime.
- `src/prompts`: Markdown prompts and prompt assembly.
- `src/connectors`: connector contract, registry, and connector modules.
- `src/components`: generic React UI.
- `src/components/ui`: shared UI kit (buttons, forms, panels, feedback).
- `src/components/connectors`: reusable connector setup UI shells (`ConnectorSettingsModules.tsx`).
- `src/hooks`: renderer hooks for desktop APIs.
- `src/types`: shared TypeScript types.
- `src/utils`: migration or cross-cutting utilities.
- `src/shared`: shared static data.

## `electron`

- `electron/main.ts`: IPC registration and service composition.
- `electron/preload.ts`: safe bridge exposed to the renderer.
- `electron/services`: desktop services for AI, files, memory, storage, OCR, and **connector transport** (OAuth, MCP, REST). See [electron/services/README.md](../electron/services/README.md).

## Where To Add Things

See also the full documentation index in [README.md](../README.md#documentation).

- New model/provider behavior: `electron/services/ai.ts` and relevant settings UI.
- New connector tools: `src/connectors/<id>/tools.ts`.
- New connector prompt rules: `src/connectors/<id>/prompt.md`.
- New connector execution: `src/connectors/<id>/runtime.ts` and, if needed, a transport service in `electron/services/` ([guide](../electron/services/README.md)).
- Generic agent loop behavior: `src/agent`.
- Generic prompt behavior: `src/prompts/core`.
- UI presentation: `src/components`.
- Connector setup UI shells: `src/components/connectors/ConnectorSettingsModules.tsx` (see `src/components/connectors/README.md`).
- Connector settings pages: compose modules in `src/connectors/<id>/ui/` (see `src/connectors/jira/ui/`).
