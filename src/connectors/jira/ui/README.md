# Jira connector UI

Connector-specific setup UI for Jira. Copy this folder shape when adding another connector.

## Files

- `catalog.ts` — catalog card metadata and icon for `ConnectorsView`.
- `JiraIcon.tsx` — connector icon shown in the catalog.
- `JiraSettingsView.tsx` — full settings page; composes shared modules from `src/components/connectors/ConnectorSettingsModules.tsx`.
- `index.ts` — public exports.

## Wiring a new connector

1. Copy `src/connectors/jira/ui/` to `src/connectors/<id>/ui/`.
2. Replace manifest imports, IPC calls, form fields, and scope picker content.
3. Export a `<Id>SettingsView` and `<id>CatalogEntry` from `ui/index.ts`.
4. Register the catalog entry and detail route in `src/components/ConnectorsView.tsx`.

Shared layout modules: `src/components/connectors/README.md`.
