# smile:D Agent Instructions

smile:D is a framework for building vertical AI agents in a desktop app.

## Product Direction

- Keep the core framework connector-neutral — no connector tool logic in the agent loop; workspace packages under `.smile/connectors/` plus optional `bundled/connectors/` catalog sources.
- Prefer module boundaries where connectors provide tools, Markdown prompt sections, auth UI, action previews, result formatting, and cache invalidation.
- Keep the default UI black and white so downstream agents can rebrand it — see `docs/ui-guidelines.md`.
- Preserve human approval for write actions.

## Architecture Notes

- Architecture overview: `docs/architecture.md`
- Connector guide: `docs/creating-a-connector.md`
- Prompt guide: `docs/prompts.md`
- Memory taxonomy and admission rules: `docs/memory.md`
- Repository map: `docs/repository-map.md`
- Agent loop: `src/agent/index.ts`
- Runtime helpers and loop guards: [HELPERS.md](src/agent/HELPERS.md) — task continuity: [taskContinuity.md](src/agent/taskContinuity.md)
- Prompt assembly: `src/prompts/index.ts`
- Core prompts: `src/prompts/core/*.md`
- Tool definitions: `src/agent/tools.ts`
- Connector modules: workspace packages under `<workspace>/.smile/connectors/<id>/`; catalog install from `bundled/connectors/`
- Desktop services: `electron/services` — [electron/services/README.md](../electron/services/README.md) (connector transport, OAuth, MCP)
- Connectors UI: `src/components/ConnectorsView.tsx`
- Connector settings UI: `src/components/connectors/GenericConnectorSettingsView.tsx` + `ConnectorSettingsModules.tsx`
- Memory: `.smile/memories` in the selected workspace

## Coding Guidelines

- Use TypeScript types for connector contracts instead of stringly typed branches where possible.
- Keep user-facing copy generic unless it lives inside an example connector.
- Keep core prompt behavior in Markdown under `src/prompts/core`.
- Keep connector prompt behavior in each workspace package's `prompt.md`.
- Read tools should not require confirmation; write tools should pause through `PendingAction`.
- Do not add new connector-specific logic directly to the core agent loop unless it is part of an extraction step with a clear follow-up.
- Update folder-level docs when changing a folder's contract or responsibility.

## Documentation index

Full map of every README and guide: [README.md § Documentation](README.md#documentation).
