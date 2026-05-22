# Components

This folder contains generic React UI for the desktop app.

## Belongs Here

- Chat UI.
- Generic action confirmation cards.
- Generic settings shell.
- Connector catalog and connected connector list.
- Reusable connector setup layout modules (`connectors/ConnectorSettingsModules.tsx`).
- Memory editing UI.
- Navigation and layout.

## Does Not Belong Here

- Connector tool schemas, prompts, or runtime logic (use `src/connectors/<id>/`).
- Domain-specific business rules inside reusable modules (pass them as props instead).

## Connector setup UI

Connector settings pages compose modules from `src/components/connectors/`. The Jira example lives in `src/connectors/jira/ui/JiraSettingsView.tsx`; `ConnectorsView.tsx` handles catalog and routing only.

- MCP connection → `McpConnectionModule`
- API credentials → `ApiConnectionModule`
- Project scope picker → `CustomSettingsModule`

See `src/components/connectors/README.md` for props and a copy-paste template.

When adding a second connector, copy `src/connectors/jira/ui/` and register the catalog entry + detail route in `ConnectorsView.tsx`.
