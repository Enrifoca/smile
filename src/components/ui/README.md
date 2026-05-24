# UI kit

Single source for smile:D shell UI. **Do not hand-roll buttons, alerts, form fields, or feedback text in feature views** — compose these primitives and edit look-and-feel in one place.

## Layers (one logic for editing UI)

| Layer | Location | What to edit |
| --- | --- | --- |
| **Tokens** | `src/theme/tokens.css` | Colors, spacing, typography, feedback timing |
| **Styles** | `src/styles/globals.css` (`.ui-*` section) | Semantic classes consumed by components |
| **Components** | `src/components/ui/` | React wrappers — props, not copy |
| **Feedback hook** | `src/hooks/useActionFeedback.ts` | Async action state (`busy`, `status`, `run()`) |

Rebrand the app: change tokens + `.ui-*` rules first. Components pick up changes automatically.

## Components

| Component | Use for |
| --- | --- |
| `Button` | All clickable actions (`variant`, `size`, `loading`) |
| `ActionRow` | Primary action + success/error feedback (save, submit) |
| `ActionFeedback` / `StatusText` | Feedback only (auto-save, refresh status) |
| `Badge` | Connected / configured / active labels |
| `Alert` | Inline error or blocking messages |
| `Callout` | Helper snippets (tips, best picks) |
| `Toggle` | Boolean settings |
| `Field`, `Input`, `Textarea`, `Select` | Form controls |
| `Panel` | Settings page sections (`soft`, `emphasis`, `danger`) |
| `PanelBody` | Bordered inner panel (connector forms) |
| `ModuleSection` | Connector module title + content |
| `Page`, `PageStack` | Page shell + vertical spacing |
| `Spinner` | Loading indicators |

## Chat extensions (built on the kit)

Chat-specific compositions live in **`src/components/chat/`** — they use kit primitives and `.ui-*` styles from `globals.css`, but are not exported from this folder.

| Module | Use for |
| --- | --- |
| `WriteActionConfirmModule` | Accept / Refuse bar above the composer during pending write actions |
| `ChatBanner` | Connector connection status |
| `ChatEmptyState` | New-chat suggestion chips |

Styles: `.ui-write-action-bar`, `.ui-chat-*`. Defaults: `src/components/chat/writeActionConfirmDefaults.ts`. Guide: `src/components/chat/README.md`.

Legacy aliases (`SaveActionRow`, `SaveFeedback`, `useSaveAction`) remain for older imports but new code should use `ActionRow`, `ActionFeedback`, `useActionFeedback`.

## Feedback hook

Any async user action (save, refresh, connect) uses the same hook:

```tsx
import { ActionRow } from '../components/ui'
import { useActionFeedback } from '../hooks/useActionFeedback'

const save = useActionFeedback()

async function handleSave() {
  if (!valid) {
    save.markError()
    return
  }
  await save.run(async () => {
    await persist(data)
  })
}

<ActionRow
  label="Save"
  busy={save.busy}
  status={save.status}
  onAction={() => void handleSave()}
/>
```

Auto-save (toggle, select):

```tsx
<StatusText
  busy={save.busy}
  status={save.status}
  busyMessage="Saving…"
  successMessage="Saved"
  size="sm"
/>
```

## Button variants

- `primary` — main action (black default)
- `secondary` — low emphasis (workspace picker, refresh)
- `outline` — bordered (disconnect, remove)
- `danger` — destructive
- `ghost` — minimal

Sizes: `sm` (settings cards), `md` (default), `lg` (connector connect).

## Connector modules

`ConnectorSettingsModules.tsx` is built entirely on the UI kit. New connector pages should not add custom button classes.

## What not to do

- Do not add one-off button classes or green/red text spans in views.
- Do not duplicate `setTimeout` feedback timers — use `useActionFeedback`.
- Do not use raw `snippet-info` / `settings-toggle` in new code — use `Callout` / `Toggle`.
