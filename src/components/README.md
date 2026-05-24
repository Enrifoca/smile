# Components

Generic React UI for the desktop app.

## UI kit (start here)

All shell UI goes through **`src/components/ui/`** — buttons, forms, panels, alerts, badges, loading, and action feedback. Chat-specific modules (`WriteActionConfirmModule`, `ChatBanner`, …) live in **`src/components/chat/`** and are documented in both `src/components/ui/README.md` and `src/components/chat/README.md`. See `src/components/ui/README.md`.

Async feedback (save, refresh, connect): **`useActionFeedback`** in `src/hooks/useActionFeedback.ts`.

Theme tokens: **`src/theme/tokens.css`**. Semantic styles: **`src/styles/globals.css`** (`.ui-*` block).

## Belongs here

- Chat UI (`chat/` — write action bar, banner, empty state)
- Write action bar above composer (`ActionConfirm.tsx` re-exports `WriteActionConfirmModule`)
- Settings shell
- Connector catalog and connected connector list
- Reusable connector setup layout modules (`connectors/ConnectorSettingsModules.tsx`)
- Memory editing UI
- Navigation and layout

## Does not belong here

- Connector tool schemas, prompts, or runtime logic (use `src/connectors/<id>/`)
- Domain-specific business rules inside reusable modules (pass them as props instead)

## Connector setup UI

Connector settings pages compose **`ConnectorSettingsModules`** (which uses the UI kit internally). Example: `src/connectors/jira/ui/JiraSettingsView.tsx`. Catalog routing: `ConnectorsView.tsx`.

When adding a connector, copy `src/connectors/jira/ui/` and register the catalog entry + detail route in `ConnectorsView.tsx`. See `src/components/connectors/README.md`.
