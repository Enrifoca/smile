# Electron Layer

The Electron layer owns desktop capabilities and IPC.

## Responsibilities

- Window lifecycle (custom icon via `appIcon.ts`). On Windows dev, Vite launches `bin/smile-dev.exe` (see `scripts/brand-electron.mjs` + `scripts/smile-electron.mjs`), not stock `node_modules/electron/dist/electron.exe`.
- Secure preload bridge.
- Local storage and encryption.
- Workspace file access.
- AI provider calls.
- OCR service calls.
- Connector transport services (OAuth, MCP, REST): `electron/services/` — [electron/services/README.md](../electron/services/README.md). Example: `atlassian-mcp.ts` registers MCP server id `atlassian` for sandbox broker calls.

## Rules

- Keep business logic out of `main.ts` when possible.
- Prefer focused services under `electron/services`.
- Connector-specific transport should be isolated in `electron/services/` and brokered through the connector sandbox (`host.mcp`, `host.http`, `host.call`). See [electron/services/README.md](services/README.md).
- Renderer code should not need to know service implementation details.

## Future Direction

Move toward generic connector IPC so new connectors do not require first-class APIs in `preload.ts`, `useElectron.ts`, and `main.ts`.
