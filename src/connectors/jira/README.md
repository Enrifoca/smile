# Jira Connector

This folder is the reference connector module for smile:D. Treat it as an example of how a vertical integration should be packaged.

## Files

- `manifest.ts` defines connector identity, auth metadata, and UI labels.
- `tools.ts` defines Zod schemas and tool definitions exposed to the model.
- `prompt.md` contains Jira-specific agent instructions appended to the core system prompt.
- `connector.ts` composes the connector definition from manifest, tools, prompt, and formatters.
- `formatters.ts` owns tool summaries, approval copy, result compression, scratchpad notes, cache invalidation, and special approval flows.
- `runtime.ts` bridges connector tools to the current Electron API.
- `index.ts` is the public export surface.

## Editing Rules

- Put Jira behavior in `prompt.md`, not in core prompts.
- Put model-callable tool schemas in `tools.ts`.
- Put user-facing approval copy and result formatting in `formatters.ts`.
- Put desktop/API transport in `runtime.ts` (IPC calls). Heavy transport (OAuth, MCP, REST clients) belongs in `electron/services/` — see [electron/services/README.md](../../electron/services/README.md).
- Do not add Jira branches to `src/agent`.

## Setup UI

Jira settings live in `src/connectors/jira/ui/`:

- `catalog.ts` — catalog card for ConnectorsView
- `JiraSettingsView.tsx` — MCP, API, and monitored projects modules
- `JiraIcon.tsx` — catalog icon

UI guide: `src/connectors/jira/ui/README.md`. Shared layout modules: `src/components/connectors/README.md`.

## Creating Another Connector

Copy this folder, rename the manifest, replace tools, write a new `prompt.md`, register the runtime from `src/connectors/registry.ts`, then add a settings page using the UI modules (see `src/components/connectors/README.md`).
