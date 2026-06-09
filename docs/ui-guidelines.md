# UI guidelines

Design rules for smile:D. **Authoritative for product and connector UI.** When implementing or reviewing screens, follow this document first.

Implementation lives in `src/theme/tokens.css`, `src/styles/globals.css` (`.ui-*`), and `src/components/ui/`. Those files should reflect these rules; where they diverge, treat this doc as the target and fix the code in a follow-up.

---

## Principles

- **Black and white first.** The app is white-label; avoid brand colors beyond the palette below.
- **Grey for structure and secondary emphasis** — borders, muted text, informational surfaces.
- **Red only for danger** — errors, destructive actions, danger zones. Not for decoration.
- **Green only for “active” chips** — see [Chips](#chips). Not for general labels or categories.
- **No emoji.** Use SVG icons only (inline or small components).
- **Icons:** simple stroke icons, neutral grey or inherit text color; no filled emoji-style glyphs.

---

## Color palette

Defined in `src/theme/tokens.css`.

| Role | Token / value | Use |
| --- | --- | --- |
| Primary (CTA) | `--color-primary` (`#000000`) | Primary buttons, toggles on, user chat bubble |
| Primary hover | `--color-primary-hover` | Hover on **primary** buttons only |
| On primary | `--color-on-primary` (`#ffffff`) | Text on black buttons |
| Surface | `--color-surface` (`#ffffff`) | Page background, cards |
| Strong text / borders | `--color-border-strong` (`#0a0a0a`) | Headings, emphasis panel borders, outline buttons |
| Muted surface | `--color-muted-surface` (`#f3f4f6`) | Snippets, secondary button fill |
| Muted border | `--color-muted-border` (`#d1d5db`) | Snippet borders, soft dividers |
| Muted text | `--color-muted-text` (`#4b5563`) | Helper copy, descriptions |
| Meta text | `--color-meta-text` (`#9ca3af`) | Tool summaries, chat date groups, thinking headers |
| Hover surface | `--color-hover-surface` (`#f5f5f5`) | **Single** light grey hover fill app-wide |
| Success (active chip) | `--color-success` (`#16a34a`) | Chip border/text when **active** |
| Error / danger | `--color-error` (`#dc2626`) | Alerts, destructive actions, danger panels |

**Do not** introduce extra accent colors (blue links as buttons, purple badges, etc.) without updating this doc.

---

## Hover

One light grey for **all** interactive hover backgrounds — `--color-hover-surface` (`#f5f5f5`, Tailwind `neutral-100`).

| Applies to | Examples |
| --- | --- |
| Sidebar | `sidebar-item`, `ui-sidebar-subitem`, context rows |
| Buttons | `Button variant="ghost"`, legacy `.btn-ghost` |
| Lists & cards | Chat suggestions, artifact headers, download menu items, connector tiles |
| Composer | Active report pill, scope chips |
| Chrome | Window controls (`.ui-hover-surface`), sidebar collapse |

Rules:

- Use `background-color: var(--color-hover-surface)` on `:hover` for interactive rows and controls.
- **Persistent open row:** sidebar chat/context sub-items use `ui-sidebar-subitem--current` when that page is open (same fill as hover). This is the only allowed non-hover use of the hover surface token.
- Utility class: `.ui-hover-surface` for one-off targets.

**Do not use** `neutral-100`, `gray-100`, `gray-200`, or `gray-50` directly for hover — use the token.

---

## Meta text

Secondary labels that annotate content, not body copy.

| Token | Value | Use |
| --- | --- | --- |
| `--color-meta-text` | `#9ca3af` (`gray-400`) | Same color everywhere for this role |

Examples:

- Chat History groups: **Today**, **Yesterday**, **This Week**, **Older** → `ui-sidebar-subitem-group-label`
- Tool summary rows: “Explored 2 files · 1 connector read” → `ui-chat-tool-summary`, `ui-text-meta`
- Thinking block headers and collapsed tool detail lines

Class: **`ui-text-meta`** or component-specific wrappers that set `color: var(--color-meta-text)`.

---

## Sidebar lists

### Chat History

- Sub-items: `ui-sidebar-subitem` — hover uses `--color-hover-surface`.
- **Open chat:** the chat you are viewing gets `ui-sidebar-subitem--current` (persistent hover background). **No bold.**
- Accordion chevron on the **Context** / **Chat History** header: same icon as sidebar (`ChevronIcon`), aligned **right** (`flex-1` on label).
- Date groups: `ui-sidebar-subitem-group-label` (meta text color).

### Context

- Same padding as chat history: `ui-sidebar-subitem-group`, `px-3 py-1.5`.
- Row hover covers label **and** toggle (full row).
- **Open page:** **New context** or the context detail you are viewing gets `ui-sidebar-subitem--current` (persistent hover background), same as chat history. Context rows must not use `bg-transparent` on the row wrapper or it hides this state.
- **Bold (`font-semibold`) only when the context toggle is ON** — `ui-sidebar-context-name--active`. Toggle off → normal weight even if that page is open.

---

## Buttons (CTA)

| Variant | When | Implementation |
| --- | --- | --- |
| **Primary** | Main action on a section (Save, Connect, Send, Accept) | `Button variant="primary"` — black background, white text |
| **Secondary** | Cancel, Back, low-commit actions | `Button variant="secondary"` — white fill, grey border; hover → `--color-hover-surface` |
| **Outline** | Alternative emphasis without filling (e.g. Remove credentials) | `Button variant="outline"` — black border; hover fills black |
| **Ghost** | Tertiary / icon-adjacent actions | `Button variant="ghost"` — transparent; hover → `--color-hover-surface` |
| **Danger** | Irreversible or destructive confirm (Delete connector, danger zone) | `Button variant="danger"` — red; **only** in alert/danger contexts |

Rules:

- One primary CTA per logical block (`ActionRow` or module footer).
- Never use red for a primary CTA unless the action is explicitly destructive.
- Never use green on buttons.

---

## Chips

**Purpose:** show that something is **on / active / connected** — nothing else.

Examples:

- Reasoning model **Active**
- Connector **Connected** / configured and working

| State | Appearance |
| --- | --- |
| **Active** | Green text + green border (`Badge tone="success"`, e.g. label “Active”, “Connected”) |
| **Inactive** | **No chip.** Do not show a grey “Inactive” chip. Absence = off. |

**Do not use chips for:**

- Integration type labels (REST, MCP, …)
- Version numbers, tags, or categories
- “Configured” vs “Not configured” when inactive (use section copy or empty state instead)

Component: `Badge` with `tone="success"` only for active states. Do not use `tone="warning"` or `tone="danger"` for chips — those are for alerts, not status chips.

---

## Snippet informativo (developer tips)

Grey box for **optional guidance from the product or connector author** — not errors, not primary content.

Examples:

- “Best picks” under Reasoning model
- “Provider notes” under OCR model
- Connector setup hints in settings

| Property | Value |
| --- | --- |
| Background | `--color-muted-surface` |
| Border | 1px `--color-muted-border` |
| Text | `--color-muted-text`, typically `text-xs` or `text-sm` |
| Radius | `0.5rem` |

Component: **`Callout`** (alias CSS `.ui-callout` / legacy `.snippet-info`).

Rules:

- Place **below** the section title/description, **above** the form fields.
- Keep copy short; **only** the lead-in label is bold — e.g. `<strong>Best pick:</strong>` or `<strong>Best picks:</strong>` via `ModelRecommendationText`. No other bold in callouts.
- Do not use callouts for validation errors — use **`Alert`**.

---

## Content boxes

Grouped settings and forms (AI provider blocks, model sections, connector credential panels) use a **content box**: white surface, **grey border**.

Reference pattern (Settings → AI / Reasoning / OCR):

```text
section: white bg, rounded-xl, shadow-sm, border border-gray-200, padding p-6
inner emphasis (optional): Panel variant="emphasis" — 2px strong border, rounded-2xl
```

Preferred components:

- **`Panel`** `variant="soft"` — light grey border (`#e5e7eb`), subtle shadow (catalog cards, outer sections)
- **`PanelBody`** `variant="emphasis"` — **2px black border** for nested forms inside a module (connector API connection)
- **`ModuleSection`** — title + description + content stack (Connectors settings)

Rules:

- All new settings modules must use bordered boxes; no borderless floating forms on white pages.
- Page shell: `content-shell page-shell` for max-width and horizontal padding.
- Danger zone: `Panel variant="danger"` — red-tinted border/background, only for destructive blocks.

---

## Chat composer

### Input shell

Default: white background, grey border (`ui-chat-input-shell`).

When an **active report** is pinned (user is continuing work on a report):

- The **composer area** (input shell or its wrapper) uses **grey background** (`--color-muted-surface` or `bg-gray-100`) to signal report context.
- The active report pill sits **above** the input (see `ActiveReportPill`).

### Active report pill

- White background, **black border** (`border-neutral-950`), compact width (`w-fit`).
- Document icon + title + path on one line; dismiss with ×.
- Hover: `--color-hover-surface` (not green).

When a report is active, the composer input shell also uses a grey background (`ui-chat-composer--with-report`).

### Attachments

- Grey pill (`ui-chat-attachment`, `bg-gray-100`) for files attached to the message.

### Write approval

- `WriteActionConfirmModule` above composer: Accept (primary black) / Refuse (secondary grey). No emoji.

---

## Alerts and errors

| Type | Component | Color |
| --- | --- | --- |
| Inline error | `Alert` | Red border/background (`ui-alert--error`) |
| Blocking banner | `ChatBanner` error variant | Red tint |
| Success feedback after save | `StatusText` / `ActionRow` | Green text (`--color-success`) — **feedback text, not a chip** |

Red is **only** for errors, warnings, and danger zones — not for navigation or highlights.

---

## Confirm dialogs

Destructive or irreversible actions use **`ConfirmModal`** — not `window.confirm`.

| Element | Rule |
| --- | --- |
| Backdrop | Dimmed overlay; click outside cancels |
| Title | Short, specific (`Remove connector`) |
| Body | Plain sentence explaining impact |
| Actions | Cancel (`secondary`) left, confirm (`danger` for destructive) right |
| Button size | `md` in modal footer |

Examples: remove connector, trim chat history, clear data.

---

## Typography and layout

- **Page title:** `ui-page-title` — `text-xl`, medium weight, near-black.
- **Section title:** `ui-section-title` — `text-lg`, medium.
- **Description:** `ui-section-description` — `text-sm`, muted grey.
- **Body:** system font stack (`--font-app`).
- **Max content width:** `--content-max-width` (64rem) via `content-shell`.

---

## Icons

- SVG only, `stroke="currentColor"`, consistent 1.5–2 stroke width.
- Size: `w-4 h-4` inline with text, `w-5 h-5` in buttons/sidebar.
- No emoji, no icon fonts, no colored decorative icons except red for error/dismiss when appropriate.

---

## Connector and catalog UI (preview)

When building Connectors catalog/settings (Install flow, Hermes-style):

- **Available / Installed / Configured** — use typography and layout, not rainbow badges.
- **Active connector** — green dot (`connector-card-active-dot`) on catalog tiles when configured; green chip in settings when connected per [Chips](#chips).
- **Active context** — green dot (`ui-context-active-dot`) beside the sidebar **Context** label when any context is toggled on. Bold name in submenu **only** when that context’s toggle is on.
- **Install** — primary black button; **Remove** — danger in a danger zone panel (`Panel variant="danger"`), left-aligned `Button size="sm" w-fit`.
- **Catalog tile** — `connector-card`: icon, name, type badge with balanced padding (`connector-card-type-badge` pinned to bottom); green active dot top-right when configured.
- **Connector detail** — shared `ConnectorPageHeader` (ghost back + title); each block in `Panel variant="soft"` like Settings sections.

---

## Implementation map

| Guideline | Component / class |
| --- | --- |
| Primary CTA | `Button variant="primary"` |
| Secondary CTA | `Button variant="secondary"` |
| Danger | `Button variant="danger"`, `Panel variant="danger"` |
| Active chip | `Badge tone="success"` |
| Active connector (catalog tile) | `connector-card-active-dot` |
| Active context indicator | `ui-context-active-dot` on sidebar Context label |
| Context name active (toggle on) | `ui-sidebar-context-name--active` |
| Snippet | `Callout` |
| Content box | `Panel`, `PanelBody`, `ModuleSection`, Settings `section` with `border border-gray-200` |
| Form fields | `Field`, `Input`, `Select`, `Textarea` |
| Save + feedback | `ActionRow` + `useActionFeedback` |
| Page layout | `content-shell`, `page-shell` |
| Hover (global) | `--color-hover-surface`, `.ui-hover-surface` |
| Meta labels | `--color-meta-text`, `ui-text-meta`, `ui-sidebar-subitem-group-label` |
| Sidebar sub-item | `ui-sidebar-subitem` |
| Sidebar open row (chat/context page) | `ui-sidebar-subitem--current` |
| Sidebar sub-menu indent | `ui-sidebar-subitem-group` |
| Settings `<select>` chevron | `Select` + `ChevronIcon` (`ui-field-select-chevron`, smaller, right-padded) |
| Field / button height | `--control-height` on `ui-field`, `ui-btn--sm` |

Edit look-and-feel globally via `src/theme/tokens.css` and `.ui-*` in `src/styles/globals.css`.

Further component API detail: [`src/components/ui/README.md`](../src/components/ui/README.md).

---

## Related docs

- [Theme tokens](../src/theme/README.md)
- [Components overview](../src/components/README.md)
- [Connector settings modules](../src/components/connectors/README.md)
