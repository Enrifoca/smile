# Connectors

Connectors extend smile:D with domain-specific tools, prompt sections, auth, and sandboxed runtime execution.

The host app is **connector-neutral**: it discovers packages from the active workspace. Shipped catalog entries (`bundled/connectors/`) are installed into the workspace via **Connectors → Catalog**; they are not loaded directly from the repo at runtime.

## Contract

The stable contract lives in [`contract/`](contract/README.md) (`manifest.json`, `handler.js`, `host.*` bridge, `apiVersion`).

A workspace connector package provides:

- Tool definitions in `manifest.json`
- Domain instructions in `prompt.md`
- Sandboxed execution in `handler.js` (or declarative MCP tool mappings)
- Optional auth fields collected in **Connectors → settings**

## Package layout (authoring)

Install connectors under the selected workspace:

```text
<workspace>/.smile/connectors/<id>/
  manifest.json    # required — identity, permissions, tools, auth
  handler.js       # required when handlerKind is "code" (default)
  prompt.md        # strongly recommended
  icon.png         # optional catalog image
```

Validate and smoke-test from the smile repo root:

```bash
npm run validate:connector -- packages/connector-sdk/fixtures/minimal
npm run test:connector -- packages/connector-sdk/fixtures/minimal --tool fixture_search_records --args '{"query":"hello"}'
```

Full author guide: [`docs/creating-a-connector.md`](../../docs/creating-a-connector.md).

## Host code in this folder

| Path | Role |
| --- | --- |
| `contract/` | Manifest types, validation, host bridge, MCP normalization |
| `catalog.ts` | Merges workspace discovery with `BUNDLED_CATALOG` (shipped install targets + optional `CatalogGraphic` icons) |
| `registry.ts` | Loads plugins for the agent loop |
| `pluginLoader.ts` | Renderer-side discovery via IPC |
| `types.ts` | Shared connector types |

## Desktop services (optional)

If a provider needs OAuth, MCP proxying, or main-process HTTP beyond the sandbox broker, add a transport service under `electron/services/` and expose it through `host.call` or `host.mcp.call` — not by editing the agent loop.

**When to create one and how to wire it:** [electron/services/README.md](../../electron/services/README.md)

Example in this repo: `electron/services/atlassian-mcp.ts` registers as MCP server id `atlassian` for connectors that declare `"mcp": ["atlassian"]` in their manifest. Host-specific capabilities (e.g. attachment upload) are registered in `electron/main.ts` via the connector broker — not in the agent loop.

Shipped connector packages: `bundled/connectors/` — see [`bundled/connectors/README.md`](../../bundled/connectors/README.md).

## Settings UI

All workspace connectors use **`GenericConnectorSettingsView`** (`src/components/connectors/GenericConnectorSettingsView.tsx`):

- `ApiConnectionModule` when the manifest declares `auth.fields`
- `McpConnectionModule` when the manifest declares `permissions.mcp`

Reusable layout shells: [`src/components/connectors/ConnectorSettingsModules.tsx`](../components/connectors/ConnectorSettingsModules.tsx) — see [`src/components/connectors/README.md`](../components/connectors/README.md).

## Auth guidance

- Prefer MCP/OAuth when a provider supports it.
- Store secrets only through secure storage (`storage.setSecure` / manifest `auth.fields`).
- Do not place tokens in prompts, manifests, logs, or plain-text workspace files.
- Implement token refresh in main-process services; keep the renderer unaware of raw refresh secrets.
