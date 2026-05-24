# Electron Layer

The Electron layer owns desktop capabilities and IPC.

## Responsibilities

- Window lifecycle.
- Secure preload bridge.
- Local storage and encryption.
- Workspace file access.
- AI provider calls.
- OCR service calls.
- Connector transport services (OAuth, MCP, REST): `electron/services/` — [electron/services/README.md](../electron/services/README.md). Example: `atlassian-mcp.ts` for Jira via Atlassian MCP.

## Rules

- Keep business logic out of `main.ts` when possible.
- Prefer focused services under `electron/services`.
- Connector-specific transport should be isolated in `electron/services/` and called through connector `runtime.ts`. See [electron/services/README.md](services/README.md).
- Renderer code should not need to know service implementation details.

## Future Direction

Move toward generic connector IPC so new connectors do not require first-class APIs in `preload.ts`, `useElectron.ts`, and `main.ts`.
