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
6. Implement `formatters.ts` for action previews, approval copy, result compaction, cache invalidation, and special approval flows. Return `acceptanceCriteria` in `getActionConfirmation` when the user should verify specific items before approving a write.
7. Register the runtime in `src/connectors/registry.ts`.
8. Add connector-specific setup UI only if needed. Copy `src/connectors/jira/ui/`, compose modules from `src/components/connectors/ConnectorSettingsModules.tsx`, and register the catalog entry + detail route in `ConnectorsView.tsx`. Guides: `src/connectors/jira/ui/README.md`, `src/components/connectors/README.md`.
9. **If the integration needs main-process transport** (OAuth, MCP, secure API keys, CORS-free HTTP): add or extend a desktop service under `electron/services/` and wire IPC. See [Electron desktop services](../electron/services/README.md).

## Connector module vs desktop service

Every connector needs a folder under `src/connectors/<id>/`. That is what the agent and UI import.

You **may also** need a file under `electron/services/` when the provider cannot be called safely or reliably from the renderer alone. Examples in this repo:

| Service | Why it exists |
| --- | --- |
| `electron/services/atlassian-mcp.ts` | OAuth, MCP proxy process, Jira tool calls, payload normalization |
| `electron/services/jira.ts` | Direct REST API (alternate/legacy paths) |
| `electron/services/jira-attachment.ts` | Binary uploads MCP does not cover |

The connector's `runtime.ts` calls these through IPC (`electron.mcp.*`, etc.). It does **not** reimplement OAuth or MCP.

**Full guide:** [electron/services/README.md](../electron/services/README.md) — when to create a service, what it should do, MCP vs REST patterns, and the IPC wiring checklist.

Do **not** copy `atlassian-mcp.ts` for every connector. Copy the **pattern**: high-level methods, auth in main, normalize payloads, return `{ success, error }`, keep agent logic in `src/connectors/`.

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

## Write action confirmation

Write tools pause for human approval. The agent explains the action in chat; **Accept / Refuse** buttons appear above the composer (`WriteActionConfirmModule`).

Shape approval via connector formatters:

| Hook / field | Purpose |
| --- | --- |
| `getActionConfirmation` → `approveLabel` | Primary Accept button (e.g. "Create issue") |
| `getActionConfirmationPrompt` | Fallback chat copy when the model does not explain in prose |
| `getActionConfirmation` → `acceptanceCriteria` | Optional checklist appended to fallback chat copy |

See `src/components/chat/README.md` and Jira `formatters.ts`.

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
