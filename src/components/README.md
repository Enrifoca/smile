# Components

This folder contains generic React UI for the desktop app.

## Belongs Here

- Chat UI.
- Generic action confirmation cards.
- Generic settings shell.
- Connector catalog and connected connector list.
- Memory editing UI.
- Navigation and layout.

## Does Not Belong Here

- Connector-specific auth flows.
- Connector-specific project/scope pickers.
- Domain-specific setup forms.
- Connector-specific prompt or tool logic.

Those should live under `src/connectors/<id>/ui` or be contributed through a connector UI registry.

## Current Migration Note

Some Jira-specific setup UI still exists in generic components while the framework extraction continues. New connector UI should not follow that pattern.
