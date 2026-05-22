# Connector setup UI modules

Reusable layout shells for connector settings pages live in `ConnectorSettingsModules.tsx`.

These modules are **editable and intended for external agents and developers**. They own spacing, borders, and header layout only. You pass connector-specific copy, form fields, state, and handlers as props.

Full connector workflow (tools, prompts, runtime, and UI): `docs/creating-a-connector.md`.

## Modules

| Module | Use when |
| --- | --- |
| `McpConnectionModule` | MCP or OAuth connection (Connect / Reconnect / Disconnect) |
| `ApiConnectionModule` | API key or token credentials with Save / Remove |
| `CustomSettingsModule` | Provider-specific scopes: projects, domains, labels, folders, presets |
| `ConnectorSettingsModule` | Low-level shell if none of the above fit |

### `McpConnectionModule`

Props: `title`, `description`, `connected`, `connecting`, `onConnect`, optional `onDisconnect`, optional button labels.

### `ApiConnectionModule`

Props: `title`, `description`, `configured`, `saving`, `saveDisabled`, `saveStatus`, `onSave`, optional `onRemove`, `children` (form fields), optional labels.

### `CustomSettingsModule`

Props: `title`, `description`, `children` (settings panel content), optional `action` (header button on the same row as the title, e.g. Load projects), optional `footer` (primary action below the panel, e.g. Save selection).

## Reference implementation: Jira

The Jira settings page lives in `src/connectors/jira/ui/JiraSettingsView.tsx`:

- **Atlassian MCP connection** → `McpConnectionModule`
- **Jira API connection** → `ApiConnectionModule` (attachment uploads)
- **Monitored projects** → `CustomSettingsModule` with `action` (Load projects) and `footer` (Save selected projects)

`ConnectorsView.tsx` only handles catalog, routing, and the connected strip. Connector runtime and tools stay in `src/connectors/jira/`.

## Add a connector settings page

1. **Backend first** — implement `manifest.ts`, `tools.ts`, `prompt.md`, `runtime.ts`, and register in `src/connectors/registry.ts` (see `docs/creating-a-connector.md`).

2. **Catalog entry** — add `<id>CatalogEntry` from `src/connectors/<id>/ui/catalog.ts` to the catalog array in `ConnectorsView.tsx`.

3. **Detail view** — add a case in `ConnectorDetailView` inside `ConnectorsView.tsx` that renders your `<Id>SettingsView`. Copy `src/connectors/jira/ui/` as the template.

```tsx
import {
  McpConnectionModule,
  ApiConnectionModule,
  CustomSettingsModule,
} from './connectors/ConnectorSettingsModules'

// Inside your connector detail view:
<McpConnectionModule
  title="Acme MCP connection"
  description="Sign in so the agent can read and write through Acme."
  connected={mcpConnected}
  connecting={connecting}
  onConnect={connect}
  onDisconnect={disconnect}
  connectLabel="Connect to Acme"
/>

<ApiConnectionModule
  title="Acme API connection"
  description="Optional REST credentials for features MCP does not cover."
  configured={hasApiToken}
  saving={saving}
  saveDisabled={!formValid}
  saveStatus={saveStatus}
  onSave={saveApiConfig}
  onRemove={clearApiConfig}
>
  {/* Your input fields */}
</ApiConnectionModule>

<CustomSettingsModule
  title="Monitored workspaces"
  description="Limit which workspaces the agent can access."
  action={<button onClick={loadWorkspaces}>Load workspaces</button>}
  footer={<button onClick={saveSelection}>Save selection</button>}
>
  {/* Checkboxes, lists, or other controls */}
</CustomSettingsModule>
```

4. **Wire IPC** — call Electron APIs through `useElectron` or connector-specific hooks. Keep secrets in secure storage (`storage.setSecure`), not in React state beyond masked placeholders.

5. **User-facing copy** — write descriptions for your connector only. Do not paste framework doc examples (other product names) into production UI strings.

## What stays where

| Concern | Location |
| --- | --- |
| Reusable layout shells | `src/components/connectors/ConnectorSettingsModules.tsx` |
| Catalog + routing | `src/components/ConnectorsView.tsx` |
| Connector settings page | `src/connectors/<id>/ui/<Id>SettingsView.tsx` |
| Tools, prompts, formatters, runtime | `src/connectors/<id>/` |
| Secure token storage | `electron/services` + IPC |

## Editing these modules

Safe to change: spacing, borders, header alignment, shared button styles, new optional props.

Avoid: hardcoding connector ids, provider names, or domain logic inside this file. Add props instead.

If you add a new module variant, document its props here and add a one-line entry to `docs/creating-a-connector.md` under **Setup UI modules**.
