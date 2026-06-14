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

- Connector tool schemas, prompts, or runtime logic (author under `<workspace>/.smile/connectors/<id>/`)
- Domain-specific business rules inside reusable modules (pass them as props instead)

## Connector setup UI

Workspace connectors use **`GenericConnectorSettingsView`**, which composes **`ConnectorSettingsModules`** (UI kit internally). Catalog routing: `ConnectorsView.tsx`.

For custom fork-level settings pages, reuse the same modules. See `src/components/connectors/README.md` and `docs/creating-a-connector.md`.
