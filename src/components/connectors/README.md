# Connector setup UI modules

Reusable layout shells for connector settings pages live in `ConnectorSettingsModules.tsx`.

All modules are built on the framework **UI kit** (`src/components/ui/`). Async feedback uses **`useActionFeedback`**. See `src/components/ui/README.md`.

These modules are **editable and intended for external agents and developers**. They own spacing, borders, and header layout only. You pass connector-specific copy, form fields, state, and handlers as props.

Full connector workflow (manifest, handler, prompts, permissions): `docs/creating-a-connector.md`.

## Default settings page

Workspace connectors open **`GenericConnectorSettingsView`** from `ConnectorsView.tsx`. It composes:

| Manifest need | Module |
| --- | --- |
| `auth.fields` | `ApiConnectionModule` |
| `permissions.mcp` | `McpConnectionModule` |

Fork-level custom settings pages are optional; most packages only need manifest-driven auth + MCP connect.

## Modules

| Module | Use when |
| --- | --- |
| `McpConnectionModule` | MCP or OAuth connection (Connect / Reconnect / Disconnect) |
| `ApiConnectionModule` | API key or token credentials with Save / Remove |

For provider-specific scopes (projects, domains, labels), compose `Panel` + `SectionHeader` + `ActionRow` from the UI kit.

### `McpConnectionModule`

Props: `title`, `description`, `connected`, `connecting`, `onConnect`, optional `onDisconnect`, optional button labels.

### `ApiConnectionModule`

Props: `title`, `description`, `configured`, `saving`, `saveDisabled`, `saveStatus`, `onSave`, optional `onRemove`, `children` (form fields), optional labels.

## Example composition

```tsx
import { useActionFeedback } from '../hooks/useActionFeedback'
import { McpConnectionModule, ApiConnectionModule } from './connectors/ConnectorSettingsModules'
import { Panel, SectionHeader, ActionRow, Button } from '../components/ui'

const scopeSave = useActionFeedback()

<Panel variant="soft">
  <SectionHeader
    title="Monitored workspaces"
    description="Limit which workspaces the agent can access."
    aside={<Button variant="outline" size="sm" onClick={loadWorkspaces}>Load workspaces</Button>}
  />
  {/* Checkboxes, lists, or other controls */}
  <ActionRow
    label="Save selection"
    busy={scopeSave.busy}
    status={scopeSave.status}
    onAction={() => void saveSelection()}
    size="sm"
  />
</Panel>
```

See `src/components/ui/README.md` for the full component list.
