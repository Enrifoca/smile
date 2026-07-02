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
| `StatusBar.tsx` | Configured models + workspace path; refreshes on `smile:model-config-changed` |
| `PanelCollapseIcon.tsx` | Sidebar layout open/close icon |

## Cross-component events

Custom DOM events used by the shell:

- `workspace:changed` — workspace folder changed.
- `smile:chat-history-changed` — chat history mutated (trim, clear, etc.).
- `smile:model-config-changed` — AI/reasoning/OCR model config saved or cleared. Dispatched from `SettingsView`, listened to by `StatusBar`.

## Palette

Black and white with a simplified grey scale — see `src/theme/tokens.css` and `docs/ui-guidelines.md`.
