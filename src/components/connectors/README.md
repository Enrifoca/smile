# Connector setup UI modules

Reusable layout shells for connector settings pages live in `ConnectorSettingsModules.tsx`.

All modules are built on the framework **UI kit** (`src/components/ui/`). Async feedback uses **`useActionFeedback`**. See `src/components/ui/README.md`.

These modules are **editable and intended for external agents and developers**. They own spacing, borders, and header layout only. You pass connector-specific copy, form fields, state, and handlers as props.

Full connector workflow (tools, prompts, runtime, and UI): `docs/creating-a-connector.md`.

## Modules

| Module | Use when |
| --- | --- |
| `McpConnectionModule` | MCP or OAuth connection (Connect / Reconnect / Disconnect) |
| `ApiConnectionModule` | API key or token credentials with Save / Remove |
| `CustomSettingsModule` | Provider-specific scopes: projects, domains, labels, folders, presets |
| `ModuleSection` | Low-level shell if none of the above fit |

### `McpConnectionModule`

Props: `title`, `description`, `connected`, `connecting`, `onConnect`, optional `onDisconnect`, optional button labels.

### `ApiConnectionModule`

Props: `title`, `description`, `configured`, `saving`, `saveDisabled`, `saveStatus`, `onSave`, optional `onRemove`, `children` (form fields), optional labels.

### `CustomSettingsModule`

Props: `title`, `description`, `children`, optional `action` (header button), optional `save` (ActionRow props), optional `footer`.

## Reference implementation: Jira

The Jira settings page lives in `src/connectors/jira/ui/JiraSettingsView.tsx`:

- **Atlassian MCP connection** → `McpConnectionModule`
- **Jira API connection** → `ApiConnectionModule`
- **Monitored projects** → `CustomSettingsModule`

## Add a connector settings page

```tsx
import { useActionFeedback } from '../hooks/useActionFeedback'
import {
  McpConnectionModule,
  ApiConnectionModule,
  CustomSettingsModule,
} from './connectors/ConnectorSettingsModules'

const scopeSave = useActionFeedback()

<CustomSettingsModule
  title="Monitored workspaces"
  description="Limit which workspaces the agent can access."
  action={<Button variant="outline" size="sm" onClick={loadWorkspaces}>Load workspaces</Button>}
  save={{
    label: 'Save selection',
    saving: scopeSave.busy,
    saveStatus: scopeSave.status,
    onSave: () => void saveSelection(),
  }}
>
  {/* Checkboxes, lists, or other controls */}
</CustomSettingsModule>
```

See `src/components/ui/README.md` for the full component list.
