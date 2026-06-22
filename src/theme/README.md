# UI Theme

Edit `tokens.css` to change framework-wide UI defaults without hunting through components.

## Colors

- `--color-primary` / `--color-primary-hover`: primary buttons and high-emphasis actions.
- `--color-ink`: strong text and emphasis borders.
- `--color-muted-text`: descriptions, panel headers.
- `--color-meta-text`: captions, date groups, secondary paths.
- `--color-hover-surface` (`#ececec`): unified hover fill (sidebar, lists, titlebar nav, tabs).
- `--color-muted-surface`: helper snippets (`Callout`).
- `--color-success` / `--color-error`: feedback and danger.

## Typography

- `--font-app`: system UI stack (single family app-wide).
- `--font-size-meta` (11px), `--font-size-base` (13px), `--font-size-heading` (15px).
- Shell aliases: `--font-size-shell-ui`, `--font-size-shell-caption`, etc.

## Shell layout

- `--secondary-sidebar-width`: chat history column.
- `--inspector-width`: right inspector column.
- `--shell-chrome-row-height`: aligned header row (sidebar head, tab bar, inspector head).
- `--shell-chrome-subrow-height`: toolbar and inspector sub-tabs.
- `--shell-statusbar-height`: footer status bar.

## Page layout

- `--page-padding-x` / `--page-padding-y`: standard page padding.
- `--content-max-width`: max width for centered content (`content-shell`).

## Legacy sidebar tokens

`--sidebar-expanded-width`, `--sidebar-collapse-button-size`, etc. apply to the old `Sidebar.tsx` layout. New shell code uses `--secondary-sidebar-width` and panel toggle classes instead.

Prefer adding new design decisions here first, then consuming them through **`src/components/ui/`** and `.ui-*` classes in `src/styles/globals.css`.

See also [`docs/ui-guidelines.md`](../../docs/ui-guidelines.md).
