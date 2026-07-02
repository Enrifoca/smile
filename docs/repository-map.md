# Repository Map

## Top Level

- `src` contains the renderer app, agent runtime, prompts, connectors, UI, and shared types.
- `electron` contains desktop services and IPC wiring.
- `bundled` contains shipped connector packages installable from the in-app catalog (`bundled/connectors/<id>/`).
- `examples` contains SDK demos (`examples/connectors/example/`).
- `docs` contains architecture and contributor documentation.
- `AGENTS.md` is the quick-start instruction file for coding agents.

## `src`

- `src/agent`: connector-neutral agent runtime — [README](../src/agent/README.md), [HELPERS](../src/agent/HELPERS.md) (loop guards, errors), [taskContinuity](../src/agent/taskContinuity.md).
- `src/prompts`: Markdown prompts and prompt assembly.
- `src/connectors`: connector contract, catalog, registry, plugin loader (host-side only).
- `src/components`: generic React UI.
- `src/components/shell`: desktop workspace chrome (titlebar, chat history, tabs, inspector).
- `src/shell`: workspace tab types and `useWorkspaceTabs` hook.
- `src/components/ui`: shared UI kit (buttons, forms, panels, feedback).
- `src/components/connectors`: reusable connector setup UI shells (`ConnectorSettingsModules.tsx`).
- `src/hooks`: renderer hooks for desktop APIs.
- `src/types`: shared TypeScript types.
- `src/utils`: migration or cross-cutting utilities.
- `src/shared`: shared static data and cross-layer helpers (`aiErrors.ts`, `streamProgress.ts`, model catalog).

## `electron`

- `electron/main.ts`: IPC registration and service composition.
- `electron/preload.ts`: safe bridge exposed to the renderer.
- `electron/services`: desktop services for AI, files, memory, storage, OCR, and **connector transport** (OAuth, MCP, REST). See [electron/services/README.md](../electron/services/README.md).

## Where To Add Things

See also the full documentation index in [README.md](../README.md#documentation).

- New model/provider behavior: `electron/services/ai.ts` and relevant settings UI.
- New connector package: `<workspace>/.smile/connectors/<id>/` — see [creating-a-connector.md](creating-a-connector.md). Shipped sources: `bundled/connectors/<id>/`.
- New connector tools / prompt / handler: edit `manifest.json`, `prompt.md`, `handler.js` in that folder.
- New transport (OAuth, MCP, REST): `electron/services/` ([guide](../electron/services/README.md)) + broker registration in `main.ts`.
- Generic agent loop behavior: `src/agent`.
- Generic prompt behavior: `src/prompts/core`.
- UI presentation: `src/components`.
- Connector settings UI: `GenericConnectorSettingsView` + `ConnectorSettingsModules.tsx` (see `src/components/connectors/README.md`).
