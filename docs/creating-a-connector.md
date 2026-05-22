# Creating a Connector

A connector is a module that gives the agent domain-specific tools, prompt instructions, UI metadata, and runtime execution.

Use `src/connectors/jira` as the reference implementation.

## Folder Template

```text
src/connectors/my-connector/
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
    MyConnectorIcon.tsx
    MyConnectorSettingsView.tsx
    index.ts
    README.md
```

## Steps

1. Copy the Jira connector folder.
2. Update `manifest.ts` with the connector id, name, description, auth type, and UI labels.
3. Replace `tools.ts` with your connector's Zod schemas and tool definitions.
4. Write domain behavior in `prompt.md`.
5. Implement `runtime.ts` to call Electron IPC, an SDK, MCP, or another local service.
6. Implement `formatters.ts` for action previews, approval copy, result compaction, cache invalidation, and special approval flows.
7. Register the runtime in `src/connectors/registry.ts`.
8. Add connector-specific setup UI only if needed. Copy `src/connectors/jira/ui/`, compose modules from `src/components/connectors/ConnectorSettingsModules.tsx`, and register the catalog entry + detail route in `ConnectorsView.tsx`. Guides: `src/connectors/jira/ui/README.md`, `src/components/connectors/README.md`.

## Connector Rules

- Do not edit `src/agent` to add connector-specific behavior.
- Do not add connector-specific instructions to `src/prompts/core`.
- Keep tool schemas precise and short.
- Keep `prompt.md` focused on domain heuristics the model needs to use tools correctly.
- Format large API results before they enter model context.

## Setup UI Modules

Most connectors need one or more standard setup blocks. The modules are white-label shells: you pass titles, descriptions, fields, and handlers; they provide consistent layout.

| Module | Typical use |
| --- | --- |
| `McpConnectionModule` | MCP or OAuth connection flows |
| `ApiConnectionModule` | API key/token credentials and REST-only features |
| `CustomSettingsModule` | Scopes, projects, domains, labels, folders, or other provider-specific controls |

**Reference:** Jira in `src/connectors/jira/ui/JiraSettingsView.tsx` — MCP block, API block, and monitored projects (with Load in the header row and Save below the list).

**How-to:** `src/components/connectors/README.md` (props, copy-paste example, file ownership table).

### Custom settings layout

`CustomSettingsModule` supports:

- `action` — header control on the same row as the title (e.g. Load projects)
- `footer` — primary action below the bordered panel (e.g. Save selected projects)
- `children` — the settings content inside the panel

Use connector-specific descriptions in user-facing UI. Framework docs may mention other example connectors (Semrush, Google) to illustrate patterns; do not copy those names into your connector's settings copy.

## Authentication And Token Refresh

Use MCP/OAuth when available. Store API credentials with secure storage (`storage.setSecure`) and keep tokens out of prompts, logs, docs, connector manifests, and plain-text workspace files.

Token refresh is not universal. If the provider gives refresh tokens or expiring access tokens, the connector runtime should explicitly implement refresh behavior in the Electron/service layer. If the provider uses static API keys, provide reconnect/remove UI and surface invalid-key errors clearly.

Current attachment limits are 10MB per file in the framework's file and Jira attachment services. Raise that limit deliberately across `ChatView`, `FileService`, and the connector upload service if a connector should support larger files.

## Semrush Example Shape

A Semrush connector would likely expose tools such as:

- `semrush_domain_overview`
- `semrush_keyword_gap`
- `semrush_backlink_audit`
- `semrush_create_report`

Its `prompt.md` would explain SEO workflow rules, default report formats, and when to ask for domain, country, database, or competitor inputs.
