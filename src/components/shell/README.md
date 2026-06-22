# App shell

Desktop workspace layout for smile:D.

## Layout

```
┌ titlebar: smile:D · Context Memories Connectors Settings · window controls ─┐
│ chat history │ workspace tabs (+) │ inspector (collapsible)                   │
│   sidebar    │ toolbar + page content                                      │
├──────────────┴──────────────────────────────────────────────────────────────┤
│ status bar (models · workspace path)                                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Navigation

- **Titlebar** (`AppTitleBar`): Context, Memories, Connectors, Settings. Chat is not here — history is always in `ChatHistorySidebar`.
- **Tabs** (`WorkspaceTabBar`): open documents (chats, context detail, settings, etc.). State in `src/shell/useWorkspaceTabs.ts`.
- **Toolbar** (`WorkspaceToolbar`): breadcrumb / page title under tabs.
- **Panel toggles** (`PanelCollapseIcon`): layout sidebar icons in each panel header — chat history toggle on the **right** of “Chat History”; inspector toggle on the **right** of “Inspector”.

## Components

| File | Role |
|------|------|
| `AppShell.tsx` | Composes layout; sidebar/inspector collapse; pinned report path |
| `AppTitleBar.tsx` | Brand + section nav + window controls |
| `ChatHistorySidebar.tsx` | Chat history list + New chat |
| `WorkspaceTabBar.tsx` | Document tabs + new tab |
| `WorkspaceToolbar.tsx` | Breadcrumb under tabs |
| `WorkspaceContent.tsx` | Routes to views (`ChatView`, `ContextHomeView`, etc.) |
| `InspectorPanel.tsx` | Reports (list, modal, pin toggle) + Context (read-only) |
| `StatusBar.tsx` | Configured models + workspace path |
| `PanelCollapseIcon.tsx` | Sidebar layout open/close icon |

## Legacy (unused in current shell)

These files remain from an earlier layout and are **not** mounted by `AppShell`:

- `ActivityBar.tsx`
- `SecondarySidebar.tsx`

The old monolithic `src/components/Sidebar.tsx` is likewise unused. Prefer extending `AppShell` and the components above.

## Palette

Black and white with a simplified grey scale — see `src/theme/tokens.css` and `docs/ui-guidelines.md`.
