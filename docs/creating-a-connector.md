# Creating a connector

Connectors extend smile:D with domain-specific tools, prompt instructions, auth, and runtime execution. **Connectors are authored in code** — there is no in-app generator. You create a folder under the workspace, validate it with the SDK, and the desktop app discovers it automatically.

This guide is the single source of truth for connector authors. The stable runtime contract lives in [`src/connectors/contract/`](../src/connectors/contract/README.md). For SDK smoke tests, see [`packages/connector-sdk/fixtures/minimal`](../packages/connector-sdk/fixtures/minimal/).

---

## Quick start

1. Create a folder in your workspace:

   ```text
   <workspace>/.smile/connectors/my-api/
     manifest.json
     prompt.md
     handler.js
     icon.png          # optional
   ```

2. Edit the three files for your integration.

3. From the smile repo root (after `npm install`):

   ```bash
   npm run validate:connector -- <path-to-connector-dir>
   npm run test:connector -- <path-to-connector-dir> --tool my_read_tool --args '{"id":1}'
   ```

4. Restart or reload the app with that workspace selected. The connector appears under **Connectors → Catalog**. Configure credentials on its settings page if the manifest declares `auth`.

5. Use the agent chat — read tools run immediately; write tools pause for human approval.

---

## Architecture (what you are building)

```text
┌─────────────────────────────────────────────────────────────┐
│  Agent loop (renderer)                                      │
│  - loads tool defs + prompt sections from discovered pkgs   │
│  - calls IPC execute / approve for connector tools          │
└───────────────────────────┬─────────────────────────────────┘
                            │ IPC
┌───────────────────────────▼─────────────────────────────────┐
│  ConnectorsService (main process)                             │
│  - discovers .smile/connectors/<id>/                        │
│  - validates manifest.json                                  │
│  - forks sandbox per connector (handler.js in node:vm)      │
│  - brokers host.* capabilities (http, mcp, secrets, …)      │
└───────────────────────────┬─────────────────────────────────┘
                            │ RPC
┌───────────────────────────▼─────────────────────────────────┐
│  handler.js (sandbox)                                       │
│  - executeTool(name, args, host)                            │
│  - optional approveAction(...) for orchestrated writes        │
│  - NO require / process / fetch / fs — only host bridge       │
└─────────────────────────────────────────────────────────────┘
```

**Contract stability:** Connectors depend on `apiVersion` in `manifest.json`, not on smile app version. Additive contract changes bump the minor version; breaking changes bump major and ship migration shims in the host. Your packages in `.smile/connectors/` keep working across app updates as long as they declare a supported `apiVersion`.

---

## Package layout

| File | Required | Purpose |
| --- | --- | --- |
| `manifest.json` | yes | Identity, permissions, auth fields, tools, UI labels |
| `handler.js` | yes when `handlerKind` is `code` (default) | Sandboxed tool implementation |
| `prompt.md` | strongly recommended | Domain instructions injected into the agent system prompt |
| `icon.png` (or path in `catalog.icon`) | no | Catalog card image |

There are no built-in connector packages inside the agent loop. Workspace connectors are discovered from `<workspace>/.smile/connectors/<id>/`. The app also ships **catalog entries** under `bundled/connectors/<id>/` (installable from **Connectors → Catalog**) and optional catalog artwork in `src/connectors/catalog.ts` — see [Bundled catalog](#bundled-catalog) below.

## manifest.json — field reference

### Top-level

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `apiVersion` | `"major.minor"` | yes | Use `"1.0"` for current connectors |
| `id` | string | yes | Lowercase slug; must match folder name `<workspace>/.smile/connectors/<id>/` |
| `name` | string | yes | Human name shown in Connectors UI |
| `version` | string | yes | Semver string for your package (informational) |
| `description` | string | no | Shown in catalog tooltip / settings |
| `handlerKind` | `"code"` \| `"mcp"` | no | Default `"code"`. See [Handler kinds](#handler-kinds) |
| `integrationType` | string | no | Catalog label: `rest`, `mcp`, `cli`, `graphql`, `sop`, `ftp`, `sftp` |
| `auth` | object | no | Credential fields collected in settings UI |
| `permissions` | object | no | Host capabilities the handler may use (enforced at runtime) |
| `ui` | object | no | Labels for catalog / connected states |
| `catalog` | object | no | `icon` path (relative), optional `tagline` |
| `contextSchema` | JSON Schema | no | Per-project scope config; exposed via `host.context.get()` |
| `agentCapabilities` | string[] | no | High-level capability tokens for agent prompt injection (e.g. `["email"]`, `["web-search"]`). Labels in `src/agent/capabilities.ts` |
| `tools` | array | yes | At least one tool |

### Tool entry (`tools[]`)

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `name` | string | yes | Stable tool id; use snake_case with connector prefix |
| `description` | string | yes | Shown to the model in tool definitions |
| `category` | string | yes | `connector-read`, `connector-write`, or `connector-attachment` |
| `requiresConfirmation` | boolean | yes | `true` for writes — agent pauses for Accept/Refuse |
| `inputSchema` | JSON Schema | yes | Tool arguments (object type recommended) |
| `mcp` | object | when `handlerKind` is `mcp` | `{ "serverId": "...", "toolName": "..." }` |
| `confirmation` | object | recommended for writes | `{ "title", "summary" }` with `{{arg}}` placeholders |
| `preview` | string | no | One-line action preview in chat |

**Read vs write:** `connector-read` tools run without confirmation. `connector-write` and `connector-attachment` tools with `requiresConfirmation: true` show an approval card before execution.

### agentCapabilities

Optional tokens that describe what the connector enables in plain language for the agent prompt (in addition to listing individual tools). Example:

```json
"agentCapabilities": ["email"]
```

Known tokens are mapped to readable labels in `AGENT_CAPABILITY_LABELS` (`src/agent/capabilities.ts`). Use a custom string for novel domains; it is shown as-is. Declare tokens that match what your tools actually do — the runtime still lists every tool name in **Enabled capabilities**.

### permissions

The host **denies** any capability not declared here. Declare the minimum needed.

| Key | Shape | Enables |
| --- | --- | --- |
| `http` | `string[]` | `host.http.fetch` — origin prefixes, e.g. `"https://api.example.com"` |
| `mcp` | `string[]` | `host.mcp.call` — server ids, e.g. `"atlassian"` |
| `file.read` / `file.write` | boolean | `host.file.read` (workspace-relative paths) |
| `secrets` | `string[]` | `host.secrets.get` — keys matching `auth.fields[].key` |
| `host` | `string[]` | `host.call` — host integrations (id + params defined by your connector) |
| `cli` | `string[]` | `host.cli.run` — allowlisted executables, e.g. `"git"` |

### auth

```json
"auth": {
  "type": "api-key",
  "fields": [
    { "key": "apiKey", "label": "API key", "secret": true },
    { "key": "baseUrl", "label": "Base URL", "secret": false }
  ]
}
```

- Values with `"secret": true` are stored encrypted (`connector:<id>:<key>`) and readable only via `host.secrets.get('apiKey')`.
- Generic settings UI in the app renders these fields automatically; no custom React page required for simple API-key connectors.

### ui and catalog

```json
"ui": {
  "catalogLabel": "My API",
  "connectedLabel": "Connected",
  "scopeLabel": "Projects"
},
"catalog": {
  "icon": "icon.png",
  "tagline": "Tickets & tasks"
}
```

---

## handler.js

CommonJS module exported from the sandbox:

```javascript
async function executeTool(name, args, host) {
  switch (name) {
    case 'myapi_get_item': {
      const apiKey = await host.secrets.get('apiKey')
      if (!apiKey) return { success: false, error: 'Not configured' }
      const res = await host.http.fetch({
        url: `https://api.example.com/items/${args.id}`,
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      if (!res.ok) return { success: false, error: `HTTP ${res.status}` }
      return { success: true, data: res.json }
    }
    default:
      return { success: false, error: `Unknown tool: ${name}` }
  }
}

module.exports = { executeTool }
```

Optional orchestrated writes:

```javascript
async function approveAction(actionType, data, host) {
  if (actionType === 'my_batch_create') {
    // run multiple host calls after user approved once
    return { handled: true, message: 'Created 3 items', writes: [...] }
  }
  return { handled: false }
}

module.exports = { executeTool, approveAction }
```

### host bridge API

| API | Permission | Returns |
| --- | --- | --- |
| `host.http.fetch({ url, method?, headers?, body? })` | `permissions.http` | `{ ok, status, headers, text, json? }` |
| `host.mcp.call(serverId, toolName, args)` | `permissions.mcp` | `{ success, data?, error? }` |
| `host.file.read(relativePath)` | `file.read` | `{ success, data?, error? }` |
| `host.cli.run({ command, args?, cwd?, env? })` | `permissions.cli` | `{ success, exitCode, stdout, stderr, error? }` |
| `host.secrets.get(key)` | `secrets` includes key | `string \| null` |
| `host.call(capability, params)` | `permissions.host` | `{ success, data?, error? }` |
| `host.context.get()` | active context | connector scope config or `null` |
| `host.context.saveKnowledge(markdown)` | — | caches markdown for prompt injection |
| `host.log(level, ...args)` | — | diagnostic only |

**Tool results:** Always return `{ success: true, data: ... }` or `{ success: false, error: '...' }`. Keep `data` compact — large payloads bloat the agent context.

**Sandbox rules:** No `require`, `import`, `process`, `fetch`, or direct filesystem access. The host enforces permissions; exceeding them throws at runtime.

Full TypeScript definitions: [`src/connectors/contract/host.ts`](../src/connectors/contract/host.ts), [`handler.ts`](../src/connectors/contract/handler.ts).

---

## prompt.md

Markdown section merged into the agent system prompt when the connector is enabled. Focus on:

- When to use each tool (read before write).
- Which read/search/list checks are required before create/update tools when external state can make the write unnecessary.
- Required arguments and sane defaults.
- Domain heuristics the model cannot infer from JSON Schema alone.
- Error recovery (e.g. "if 401, ask user to reconnect in Connectors").

Do **not** duplicate core agent rules from `src/prompts/core/`. Do **not** embed secrets or user-specific config — reference tools and settings instead.

Example structure:

```markdown
## My API connector

Use `myapi_search` before creating records. Prefer narrow filters.

- `myapi_get_item` — fetch one record by id.
- `myapi_create_item` — requires title and projectId; always confirm with the user first.

If the API returns rate limits, wait and retry once with a smaller page size.
```

---

## Handler kinds

### `code` (default)

You implement logic in `handler.js`. Full flexibility; permissions gate every host call.

### `mcp`

No `handler.js`. Each tool maps 1:1 to an MCP tool:

```json
{
  "handlerKind": "mcp",
  "permissions": { "mcp": ["atlassian"] },
  "tools": [{
    "name": "my_search_items",
    "category": "connector-read",
    "requiresConfirmation": false,
    "mcp": { "serverId": "atlassian", "toolName": "searchItems" },
    "inputSchema": { "type": "object", "properties": { "jql": { "type": "string" } } }
  }]
}
```

The host calls MCP and normalizes results. Test MCP connectors in the live app after connecting the MCP server — the SDK `test` command only supports `handlerKind: code`.

---

## Write actions and human approval

Write tools with `requiresConfirmation: true` pause the agent until the user clicks Accept or Refuse.

Declarative UI copy comes from the manifest:

```json
"confirmation": {
  "title": "Create item",
  "summary": "Create \"{{title}}\" in project {{projectId}}"
},
"preview": "Create: {{title}}"
```

Placeholders use `{{propertyName}}` from the tool args JSON.

For complex multi-step writes, implement `approveAction` in `handler.js` and return `{ handled: true, writes: [...] }` so the core can replay cache invalidation.

---

## Context and knowledge

When a connector needs per-project configuration (e.g. which scopes to monitor):

1. Declare `contextSchema` in the manifest (JSON Schema object).
2. Users configure scopes in **Context** management UI.
3. In `handler.js`, read `await host.context.get()` during tool execution.
4. Sync structured metadata into prompt-ready markdown with `host.context.saveKnowledge(markdown)` from a dedicated sync tool — not on every turn.

---

## Installation workflow

### Workspace install (any connector)

1. **Author** the package locally (repo subfolder or template).
2. **Validate** with SDK (see below).
3. **Copy** into `<workspace>/.smile/connectors/<id>/`, or use **Connectors → Catalog → Install** for shipped packages in `bundled/connectors/`.
4. **Reload** connectors in the app (restart dev server or re-open Connectors view).
5. **Configure** auth on the connector settings page if needed.
6. **Verify** a read tool in chat before relying on write tools.

To remove a workspace connector: **Connectors → [connector] → Remove**, or delete the folder manually.

### Bundled catalog (framework maintainers)

Shipped first-party connectors live in `bundled/connectors/<id>/` (same layout as a workspace package). To add one to the in-app catalog:

1. Add the folder under `bundled/connectors/<id>/` with `manifest.json`, `handler.js`, `prompt.md`, and optional `icon.svg`.
2. Register metadata in `src/connectors/catalog.ts` (`BUNDLED_CATALOG` — id, name, description, optional `CatalogGraphic` React icon).
3. Ensure `package.json` `build.files` includes `bundled/**/*`.
4. Run `npm run validate:connector -- bundled/connectors/<id>`.

Install copies the folder into `<workspace>/.smile/connectors/<id>/`. SDK demos stay under `examples/connectors/example/`.

---

## SDK — validate and test

From the smile repository root:

```bash
# Structure + manifest validation (no Electron)
npm run validate:connector -- packages/connector-sdk/fixtures/minimal

# Host contract regression (framework maintainers)
npm run validate:contract

# Sandbox smoke test (requires built sandbox: npm run build or dev once)
npm run test:connector -- packages/connector-sdk/fixtures/minimal --tool fixture_search_records --args '{"query":"hello"}'

# Headless sandbox RPC harness
npm run validate:sandbox
```

Programmatic API: [`packages/connector-sdk/README.md`](../packages/connector-sdk/README.md).

**Development loop:**

1. Edit files under `.smile/connectors/<id>/`.
2. Run `validate:connector` after manifest changes.
3. Run `test:connector` after handler changes.
4. Reload the app to pick up filesystem changes.

---

## Advanced: custom settings UI (optional)

All workspace connectors use **GenericConnectorSettingsView** by default (auth fields + MCP connect when declared in the manifest).

For highly custom setup flows, you can extend the host app with a dedicated React settings page — that is a fork-level choice, not required for most packages. Reuse `src/components/connectors/ConnectorSettingsModules.tsx` for consistent layout.

---

## Advanced: main-process services (optional)

When an integration needs OAuth, MCP proxying, or CORS-free HTTP beyond what the sandbox broker provides, add a service under `electron/services/` and expose it via `host.call` or MCP — not by editing the agent loop.

See [electron/services/README.md](../electron/services/README.md).

---

## Checklist before shipping

- [ ] `id` matches folder name and tool name prefix
- [ ] `apiVersion` is `"1.0"`
- [ ] Every `permissions.*` entry is used; nothing extra declared
- [ ] Read tools are `connector-read` with `requiresConfirmation: false`
- [ ] Write tools have `confirmation` / `preview` templates
- [ ] `prompt.md` explains when/how to call each tool, including required read-before-write checks
- [ ] `npm run validate:connector` passes
- [ ] `npm run test:connector` passes for at least one read tool
- [ ] Secrets never appear in logs, prompts, or error messages returned to the model
- [ ] Large API responses are trimmed in the handler before returning `data`

---

## Common mistakes

| Symptom | Likely cause |
| --- | --- |
| Connector missing from catalog | Invalid manifest — check discovery errors on Connectors page; run `validate:connector` |
| `HTTP blocked` / permission error | URL not covered by `permissions.http` prefix |
| Tool unknown | Tool `name` in handler switch does not match manifest |
| Write runs without approval | `requiresConfirmation: false` or wrong category |
| Settings page empty | No `auth.fields` and no MCP requirement — connector may need no user config |
| Handler changes ignored | Restart sandbox: reload app or toggle workspace |
| MCP tool fails | Server not connected; `serverId` mismatch; tool not in MCP allowlist |

---

## Legacy built-in TypeScript modules

The host app no longer ships connector logic under `src/connectors/<id>/`. **All connectors use the plugin package format** (`.smile/connectors/<id>/`). Catalog metadata and install sources may reference `bundled/connectors/`; runtime execution always loads from the workspace copy.

---

## Related docs

- [Connector contract](../src/connectors/contract/README.md)
- [@smile/connector-sdk](../packages/connector-sdk/README.md)
- [Architecture](architecture.md)
- [Prompts](prompts.md)
- [Electron services](../electron/services/README.md)
