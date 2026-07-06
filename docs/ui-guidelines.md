# UI guidelines

Design rules for smile:D. **Authoritative for product and connector UI.** When implementing or reviewing screens, follow this document first.

Implementation lives in `src/theme/tokens.css`, `src/styles/globals.css` (`.ui-*`), and `src/components/ui/`. Those files should reflect these rules; where they diverge, treat this doc as the target and fix the code in a follow-up.

Shell layout code: `src/components/shell/` — see [shell README](../src/components/shell/README.md).

---

## Principles

- **Black and white first.** The app is white-label; avoid brand colors beyond the palette below.
- **Grey for structure and secondary emphasis** — borders, muted text, informational surfaces.
- **Red only for danger** — errors, destructive actions, danger zones. Not for decoration.
- **Green only for “active” chips and catalog dots** — see [Chips](#chips) and [Active indicators](#active-indicators). Inspector list dots use **black**.
- **No emoji.** Use SVG icons only (inline or small components).
- **Icons:** simple stroke icons, neutral grey or inherit text color; no filled emoji-style glyphs.

---

## Desktop shell layout

```
┌ titlebar: smile:D · Context Memories Connectors Settings · window controls ─┐
│ chat history │ workspace tab bar (+) │ inspector (collapsible)                │
│   sidebar    │ toolbar breadcrumb    │                                      │
│              │ page content          │                                      │
├──────────────┴───────────────────────┴──────────────────────────────────────┤
│ status bar (models · workspace path)                                          │
└───────────────────────────────────────────────────────────────────────────────┘
```

| Area | Component | Notes |
| --- | --- | --- |
| Titlebar | `AppTitleBar` | Section nav only — **no Chat** (history is always in the left sidebar) |
| Chat history | `ChatHistorySidebar` | Fixed left column; collapses to a narrow rail |
| Tabs | `WorkspaceTabBar` | One tab per open chat / context / settings view |
| Breadcrumb | `WorkspaceToolbar` | Page title row under tabs (e.g. `Chat / …`, `Settings`) |
| Content | `WorkspaceContent` | Routes to `ChatView`, `ContextHomeView`, `SettingsView`, etc. |
| Inspector | `InspectorPanel` | Right column: **Reports** + **Context** tabs |
| Footer | `StatusBar` | Model names + **workspace folder path** (path is not in the titlebar) |

Panel toggles use **`PanelCollapseIcon`** (layout sidebar icons, not chevrons):

- **Chat History:** toggle on the **right** of the panel header, flush with the tab row.
- **Inspector:** toggle on the **right** of the Inspector header.
- When the chat sidebar is **collapsed**, the header has **no bottom border** (icon must not look “boxed in”).

Tab state: `src/shell/useWorkspaceTabs.ts`.

### Workspace tabs

- Every tab is **fixed width**: `--workspace-tab-width` (`8.4rem`, 20% narrower than the initial shell) — short and long titles share the same tab size; overflow ellipsizes.
- Tab label + **×** are separate hit targets (`ui-workspace-tab__select` / `ui-workspace-tab__close`).
- Closing the last tab opens a new chat automatically.

---

## Border radius

Corners stay **sharp** — no pill cards or heavy rounding.

| Token | Value | Use |
| --- | --- | --- |
| `--radius-control` | `0.25rem` (4px) | `Panel`, Settings sections (`section.rounded-xl` in page shell), buttons, inputs |

Legacy Tailwind `rounded-xl` on Settings sections is normalized to `--radius-control` via `.content-shell.page-shell section.rounded-xl` in `globals.css`. Prefer `Panel` / `ui-panel--*` for new UI.

---

## App icon

- Source: `public/icon.svg` — **subtle rounded corners** (`rx="48"` on 512px canvas, ~9%).
- Regenerate platform assets after SVG changes: `npm run icons` (also re-runs `brand-electron` on Windows).
- macOS uses `public/icon.icns`; Windows uses `public/icon-windows.ico` with a larger `:D` mark and extra sizes for Start-menu / .exe shell icons.
- Dev taskbar on Windows uses `bin/smile-dev.exe` with embedded `public/icon-windows.ico`.

---

## Color palette

Defined in `src/theme/tokens.css`.

| Role | Token / value | Use |
| --- | --- | --- |
| Primary (CTA) | `--color-primary` (`#000000`) | Primary buttons, toggles on, send actions |
| Primary hover | `--color-primary-hover` | Hover on **primary** buttons only |
| On primary | `--color-on-primary` (`#ffffff`) | Text on primary buttons |
| Ink / strong text | `--color-ink` (`#0a0a0a`) | Headings, emphasis borders, brand wordmark |
| User bubble | `--color-user-bubble` (`#f3f4f6`) | User chat bubble background |
| Surface | `--color-surface` (`#ffffff`) | Page background, cards |
| Surface alt | `--color-surface-alt` (`#f6f6f6`) | Tab bar strip, subtle chrome |
| Border | `--color-border` (`#e5e5e5`) | Standard borders |
| Muted text | `--color-muted-text` (`#4b5563`) | Helper copy, panel headers, descriptions |
| Meta text | `--color-meta-text` (`#9ca3af`) | Date groups, paths, inspector hints |
| Hover surface | `--color-hover-surface` (`#ececec`) | **Single** light grey hover fill app-wide |
| Chrome control hover | `--color-chrome-control-hover` (`#d1d5db`) | Tab **×** and **+** button hover |
| Success (active chip) | `--color-success` (`#16a34a`) | Chip border/text when **active** |
| Error / danger | `--color-error` (`#dc2626`) | Alerts, destructive actions, danger panels |
| Structural emphasis | `--color-accent` (= `--color-primary`) | Tab underline, focus ring |
| Selected row fill | `--color-accent-soft` (= hover surface) | Chat history / inspector row selection |

The app is **black and white** with grey structure. Do not introduce a second brand hue.

---

## Typography

**One font family app-wide:** `--font-app` (system UI stack).

**Three sizes:**

| Token | px | Use |
| --- | --- | --- |
| `--font-size-meta` | 11 | Uppercase group labels, status bar meta, paths |
| `--font-size-base` | 13 | Body, lists, hints, inputs, chat, toolbar breadcrumb, panel headers |
| `--font-size-heading` | 15 | Empty chat title (“How can I help you today?”) |

**Hierarchy = weight + color, not extra font families.**

| Class / element | Use |
| --- | --- |
| `ui-workspace-toolbar__strong` | Current segment of breadcrumb (base size, semibold) |
| `ui-chat-empty-title` | New-chat heading (heading size) |
| `ui-chat-history-sidebar__title`, `ui-inspector__title` | Panel headers (base size, muted text) |
| `ui-page-subtitle` | Page description under toolbar (replaces removed page `h1`) |
| `ui-type-hint` | Inspector / sidebar helper lines (base size) |
| `ui-text-meta` | Secondary labels (meta color) |

Do not use ad-hoc Tailwind `text-xs` / `text-sm` / `text-xl` in shell components — use tokens and `.ui-*` classes.

**Chrome row heights** (aligned across columns):

- `--shell-chrome-row-height` (36px): chat history head · tab bar · inspector head
- `--shell-chrome-subrow-height` (32px): workspace toolbar · inspector sub-tabs

---

## Hover

One light grey for interactive hover backgrounds — `--color-hover-surface` (`#ececec`).

| Applies to | Examples |
| --- | --- |
| Titlebar | `ui-shell-titlebar__nav-item` |
| Chat history | `ui-sidebar-subitem`, New chat row |
| Tabs | Tab row background (not × / + controls) |
| Tab **×** and **+** | `ui-chrome-icon-btn` → `--color-chrome-control-hover` |
| Inspector | `ui-inspector-item`, tab buttons |
| Buttons | `Button variant="ghost"`, secondary hover |
| Composer | Active report pill |

Rules:

- Use `background-color: var(--color-hover-surface)` on `:hover` for interactive rows and controls.
- **Current chat row:** `ui-sidebar-subitem--current` (same fill as hover, **no bold**).
- Utility class: `.ui-hover-surface` for one-off targets.
- **Do not** use raw `gray-100` / `neutral-100` for hover — use the token.

---

## Chat history sidebar

- **New chat:** text row with `+` at top of scroll area (not a bordered button).
- **History rows:** `ui-sidebar-subitem` — ellipsis on long titles; date groups via `ui-sidebar-subitem-group-label`.
- **Collapse:** narrow rail; toggle aligned right; **no** header bottom border when collapsed.

Main section navigation (Context, Memories, Connectors, Settings) lives in the **titlebar**, not in this sidebar.

---

## Inspector

Two tabs: **Reports** and **Context**.

### Reports

- Lists `.md` files across the whole workspace, excluding internal smile files (context knowledge, history, generic `files/`, memories, connectors). Refreshes when the tab is shown or the window regains focus.
- Markdown reports created by the agent are saved directly in the active context folder (`.smile/contexts/<slug>/`) or, when no context is active, in `.smile/`.
- Uses a recursive `*.md` search and surfaces read/validation errors in place of the empty state.
- **Click row** → opens `MarkdownArtifactModal` (full report reader).
- **Toggle** → pins report in chat composer (`ActiveReportPill`); black dot + bold title when pinned.
- Tab label shows black dot when any report is pinned.

### Context

- Read-only list of workspace contexts in the inspector; activation toggles live on **Context** page (`ContextHomeView`).
- Context names can be renamed from the context detail view (the on-disk folder slug stays the same).
- Black dot + bold name when that context is the active one.
- Tab label shows black dot when a valid active context exists.

### Active indicators

| Location | Class | Color |
| --- | --- | --- |
| Inspector row / tab (report or context) | `ui-active-dot` | Black (`neutral-950`) |
| Connectors catalog tile (configured) | `connector-card-active-dot` | Green |
| Legacy sidebar Context menu (if used) | `ui-context-active-dot` | Green |

---

## Page content

- **No duplicate page `h1`** — the toolbar breadcrumb is the page title.
- **Subtitle** at top of page body where needed (`ui-page-subtitle`): Settings, Memory, Context home, etc.
- Page shell: `ui-page-frame` + `content-shell page-shell`.
- Settings sections: white cards with `border border-gray-200`; radius normalized to `--radius-control` (see [Border radius](#border-radius)).

---

## Buttons (CTA)

| Variant | When | Implementation |
| --- | --- | --- |
| **Primary** | Main action (Save, Connect, Send, Accept) | `Button variant="primary"` |
| **Secondary** | Cancel, Back | `Button variant="secondary"` |
| **Outline** | Alternative emphasis | `Button variant="outline"` |
| **Ghost** | Tertiary actions | `Button variant="ghost"` |
| **Danger** | Destructive confirm | `Button variant="danger"` |

One primary CTA per logical block. Never use red for a non-destructive primary CTA. Never use green on buttons.

---

## Chips

**Purpose:** show that something is **on / active / connected**, or tag an **integration type** (connector REST/MCP/etc.).

| State | Appearance |
| --- | --- |
| **Active** | Green text + green border (`Badge tone="success"`) |
| **Inactive** | **No chip.** Absence = off. |
| **Integration type** | White fill, black border, black label (`Badge tone="primary"`) — used for connector MCP/REST/etc. labels. |

Do not use chips for versions or categories.

---

## Snippet informativo (developer tips)

Grey box for optional guidance — `Callout` / `.ui-callout`.

- Background: `--color-muted-surface`; border: `--color-border`
- Below section title, above form fields
- Errors use **`Alert`**, not callouts

---

## Chat composer

- Default input: white shell, grey border.
- **Active report pinned:** grey composer background (`ui-chat-composer--with-report`); pill above input — white, black border, hover surface.
- **Write approval:** `WriteActionConfirmModule` — Accept (primary) / Refuse (secondary).
- **Empty chat:** `ChatEmptyState` — heading only; **no suggestion chips** by default.

Range sliders (`RangeSlider` in Communication preferences): **mouse wheel scrolls the page**, not the slider. Change value via click, drag, or keyboard.

---

## Alerts and confirm dialogs

- Errors: `Alert`, `ChatBanner` error variant — red only for danger.
- Success after save: `StatusText` green text (not a chip).
- Destructive actions: `ConfirmModal` with Cancel + danger confirm.

---

## Connector and catalog UI

- Catalog tiles: `connector-card` — `1px` border, `--radius-control`, base typography; hover `--color-hover-surface`.
- Catalog connector icons must be the correct brand SVG in its brand colors (not generic letter placeholders); register the icon component in `src/connectors/catalog.ts` as `CatalogGraphic`.
- Green dot top-right when configured (`connector-card-active-dot`).
- Integration type labels (REST, MCP, etc.) are **white chips with a black border and black label** (`Badge tone="primary"`).
- Detail/settings: `ui-page-frame` + `Panel variant="soft"` (sharp corners via `--radius-control`).
- Tool rows in settings: `connector-tool-item`.
- Inline paths/commands: `ui-inline-code`.
- Catalog search: `Input` with `ui-field--emphasis` (same `1px` border and `--radius-control` as panels).
- Connector detail: `ConnectorPageHeader` + connection modules in `Panel`.
- Install: primary black; Remove: danger in danger zone panel.

---

## Implementation map

| Guideline | Component / class |
| --- | --- |
| Shell layout | `src/components/shell/AppShell.tsx` |
| Titlebar nav | `AppTitleBar` |
| Chat history | `ChatHistorySidebar`, `ui-sidebar-subitem` |
| Workspace tabs | `WorkspaceTabBar`, `WorkspaceToolbar` |
| Inspector | `InspectorPanel`, `ui-inspector-item` |
| Panel toggle icons | `PanelCollapseIcon` |
| Primary CTA | `Button variant="primary"` |
| Active chip | `Badge tone="success"` |
| Inspector / pinned dot | `ui-active-dot` |
| Catalog configured dot | `connector-card-active-dot` |
| Snippet | `Callout` |
| Content box | `Panel`, Settings `section` with border |
| Tab width | `--workspace-tab-width`, `.ui-workspace-tab` |
| Corner radius | `--radius-control`, `.ui-panel--*` |
| App icon | `public/icon.svg`, `npm run icons` |
| Page layout | `content-shell`, `page-shell`, `ui-page-subtitle` |
| Hover | `--color-hover-surface`, `.ui-hover-surface` |
| Meta labels | `ui-text-meta`, `ui-sidebar-subitem-group-label` |
| Report modal | `MarkdownArtifactModal` |
| Tokens | `src/theme/tokens.css` |

Edit look-and-feel globally via tokens and `.ui-*` in `src/styles/globals.css`.

Further component API detail: [`src/components/ui/README.md`](../src/components/ui/README.md).

---

## Related docs

- [Shell components](../src/components/shell/README.md)
- [Theme tokens](../src/theme/README.md)
- [Components overview](../src/components/README.md)
- [Chat UI](../src/components/chat/README.md)
- [Report artifacts](../src/components/chat/artifacts/README.md)
- [Connector settings modules](../src/components/connectors/README.md)
