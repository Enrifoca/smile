# Connectors

Connectors are copyable modules that add domain-specific capabilities to the framework.

## Contract

The shared contract lives in `types.ts`.

A connector can provide:

- Tool definitions.
- A Markdown prompt section.
- Tool summary labels.
- Write-action confirmation copy.
- Action previews.
- Tool result formatting.
- Cache invalidation rules.
- Special approval flows.
- Runtime execution.

## Folder Shape

Each connector should look like:

```text
connectors/<id>/
  connector.ts
  formatters.ts
  index.ts
  manifest.ts
  prompt.md
  runtime.ts
  tools.ts
  README.md
  ui/
    catalog.ts
    <Id>SettingsView.tsx
    index.ts
    README.md
```

## Rules

- Keep connector behavior inside connector folders.
- Keep connector prompts in `prompt.md`.
- Keep connector APIs out of `src/agent`.
- Register enabled connectors through `registry.ts`.

## Desktop services (optional)

Connector modules live in `src/connectors/<id>/`. If the provider needs OAuth, MCP, secure API keys, or main-process HTTP, add a transport service under `electron/services/` and call it from `runtime.ts`.

**When to create one, what it should do, and how to wire IPC:** [electron/services/README.md](../../electron/services/README.md)

Jira example: `src/connectors/jira/runtime.ts` → `electron.mcp.*` → `electron/services/atlassian-mcp.ts`.

## Setup UI Modules

Connector setup screens should reuse the modules in `src/components/connectors/ConnectorSettingsModules.tsx`:

- `McpConnectionModule` for MCP/OAuth connection flows.
- `ApiConnectionModule` for API key or token flows.
- `CustomSettingsModule` for provider-specific settings like projects, domains, labels, folders, or scopes.

These modules are white-label shells. Connector authors pass provider-specific titles, descriptions, labels, fields, and handlers.

Step-by-step UI setup: `src/components/connectors/README.md`.

## Auth Guidance

- Prefer MCP/OAuth when a provider supports it because it avoids long-lived raw tokens in the renderer.
- Store API tokens only through secure storage APIs such as `storage.setSecure`.
- Do not place tokens in prompts, connector manifests, logs, docs, or local plain-text files.
- Refresh behavior is provider-specific. If a connector receives refresh tokens or expiring access tokens, implement explicit refresh logic in its Electron/service runtime and keep the renderer UI unaware of raw refresh secrets.
- For API keys that do not refresh, expose a clear reconnect/remove flow and handle invalid-token errors by asking the user to update the connection.
