# Electron Layer

The Electron layer owns desktop capabilities and IPC.

## Responsibilities

- Window lifecycle.
- Secure preload bridge.
- Local storage and encryption.
- Workspace file access.
- AI provider calls.
- OCR service calls.
- Connector transport services when a connector needs desktop-side execution.

## Rules

- Keep business logic out of `main.ts` when possible.
- Prefer focused services under `electron/services`.
- Connector-specific transport should be isolated and called through connector runtimes.
- Renderer code should not need to know service implementation details.

## Future Direction

Move toward generic connector IPC so new connectors do not require first-class APIs in `preload.ts`, `useElectron.ts`, and `main.ts`.
