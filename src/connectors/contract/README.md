# Connector contract

The stable, **language-neutral** boundary that connectors are written against. Nothing here imports Electron/Node, so a future non-Electron host (e.g. Tauri/Rust) can implement the same contract without breaking existing connectors.

## Modules

| Module | Responsibility |
| --- | --- |
| `version.ts` | `CURRENT_API_VERSION`, parse/compat helpers |
| `jsonSchema.ts` | Minimal JSON Schema type for tool inputs |
| `manifest.ts` | `ConnectorManifest`, `ToolManifest`, permissions, auth, UI |
| `result.ts` | `ToolResult` envelope (`{ success, data?, error? }`) |
| `host.ts` | `HostBridge` capability API (http, mcp, file, secrets, log) |
| `handler.ts` | `ConnectorHandlerModule` (`executeTool`, `approveAction`) |
| `rpc.ts` | Host <-> sandbox message protocol |
| `migration.ts` | Migration shims registry (strict compat policy) |
| `validate.ts` | Pure `validateManifest` used during discovery |
| `contractChecks.ts` | Framework-agnostic contract checks + fixtures |

## Package layout (`.smile/connectors/<id>/`)

- `manifest.json` — validated by `validateManifest`
- `prompt.md` — domain prompt section
- `handler.js` — sandboxed module matching `ConnectorHandlerModule` (**required when `handlerKind` is `code`**, the default)

### handlerKind

| Kind | Needs `handler.js` | Execution |
| --- | --- | --- |
| `code` (default) | yes | Custom logic in sandbox via `host.*` |
| `mcp` | no | Declarative 1:1 mapping: each tool declares `mcp: { serverId, toolName }`; host calls MCP and normalizes the result |

MCP results are normalized generically by `normalizeMcpResult()` (`structuredContent` → JSON in `content` → text). Connectors never parse raw MCP envelopes.

## Versioning policy (strict)

- `apiVersion` is `"major.minor"`.
- Additive changes bump minor and never break connectors.
- Breaking changes bump major and MUST ship a migration shim in `migration.ts`; connectors never need a re-fork.
- `contractChecks.ts` runs reference fixtures against the current host to catch regressions.

## What crosses the sandbox boundary

Only `executeTool` / `approveAction` run as sandboxed code. Declarative concerns (prompt, confirmations, previews, formatting) live in the manifest/prompt and are read by the host directly, keeping the agent loop synchronous.
