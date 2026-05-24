# UI Theme

Edit `tokens.css` to change framework-wide UI defaults without hunting through components.

Common tokens:

- `--color-primary`: primary button and high-emphasis action color.
- `--color-primary-hover`: hover color for primary buttons.
- `--color-muted-surface`: grey surface used for helper snippets and informational notes.
- `--color-muted-text`: text color used inside helper snippets.
- `--color-success` / `--color-error`: user feedback (save, refresh, errors).
- `--action-feedback-reset-ms`: how long success/error messages stay visible.
- `--page-padding-x` / `--page-padding-y`: standard page padding.
- `--sidebar-expanded-width` / `--sidebar-collapsed-width`: sidebar widths.
- `--sidebar-collapsed-icon-size`: icon size when the sidebar is collapsed.
- `--sidebar-collapse-icon-size`: fixed size for the expand/collapse control.
- `--sidebar-collapse-button-size` / `--sidebar-collapse-button-offset`: hitbox size and distance from the sidebar divider.
- `--sidebar-collapse-button-color`: grey color for the expand/collapse control.

Prefer adding new design decisions here first, then consuming them through **`src/components/ui/`** and `.ui-*` classes in `src/styles/globals.css`.
