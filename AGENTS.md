# smile:D Agent Instructions

smile:D is a framework for building vertical AI agents in a desktop app.

## Product Direction

- Keep the core framework connector-neutral.
- Treat Jira as an example connector, not as the product identity.
- Prefer module boundaries where connectors provide tools, Markdown prompt sections, auth UI, action previews, result formatting, and cache invalidation.
- Keep the default UI black and white so downstream agents can rebrand it.
- Preserve human approval for write actions.

## Architecture Notes

- Architecture overview: `docs/architecture.md`
- Connector guide: `docs/creating-a-connector.md`
- Prompt guide: `docs/prompts.md`
- Repository map: `docs/repository-map.md`
- Agent loop: `src/agent/index.ts`
- Runtime helpers: `src/agent/*.ts`
- Prompt assembly: `src/prompts/index.ts`
- Core prompts: `src/prompts/core/*.md`
- Tool definitions: `src/agent/tools.ts`
- Connector modules: `src/connectors/<id>`
- Desktop services: `electron/services`
- Connectors UI: `src/components/ConnectorsView.tsx`
- Memory: `.smile/memories` in the selected workspace

## Coding Guidelines

- Use TypeScript types for connector contracts instead of stringly typed branches where possible.
- Keep user-facing copy generic unless it lives inside an example connector.
- Keep core prompt behavior in Markdown under `src/prompts/core`.
- Keep connector prompt behavior in `src/connectors/<id>/prompt.md`.
- Read tools should not require confirmation; write tools should pause through `PendingAction`.
- Do not add new connector-specific logic directly to the core agent loop unless it is part of an extraction step with a clear follow-up.
- Update folder-level docs when changing a folder's contract or responsibility.
