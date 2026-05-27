# smile:D

smile:D is a white-label desktop framework for building vertical AI agents for work.

It gives you the reusable structure: a local desktop shell, multi-model agent loop, human-in-the-loop tool approvals, editable memory, workspace file access, and a connector system. Bring a use case, add connector modules, tune the prompts, and ship a focused agent for that domain.

## Features

- **Desktop agent shell** - Electron, React, TypeScript, Vite, and Tailwind.
- **Multi-model runtime** - Configure chat, reasoning, and OCR-capable models.
- **Human-in-the-loop writes** - Read tools can run freely; write tools pause for user approval.
- **Editable memory** - User memory lives in Markdown under `.smile/memories`.
- **Workspace access** - Agents can read, search, OCR, and write inside a selected local folder.
- **Connector modules** - Third-party capabilities are intended to live outside the core agent loop.
- **Clean white-label UI** - Minimal black and white interface ready to adapt to a vertical use case.

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- An API key from one supported model provider

### Installation

```bash
# Install dependencies
npm install

# Run in development mode (starts Vite + Electron)
npm run electron:dev
# same as: npm run dev
```

If the window is blank after launch, your shell may have `ELECTRON_RUN_AS_NODE` set (common in Electron-based editors). The dev scripts clear it automatically; you can also run `unset ELECTRON_RUN_AS_NODE` before starting.
```

### Building

```bash
# Build for current platform
npm run build

# Build for Windows
npm run build:win

# Build for macOS
npm run build:mac
```

## Configuration

On first launch, the app will guide you through:

1. **AI Provider** - Choose and configure your preferred AI provider.
2. **Workspace** - Select a folder for document access and generated outputs.
3. **Memory** - Edit durable user instructions in Markdown.
4. **Connectors** - Add third-party modules such as Jira from the Connectors section.

## Framework Pillars

- **Multi models** - Main model, reasoning model, and OCR model are configured independently.
- **Human in the loop** - Connector write actions show Accept/Refuse above the composer before execution.
- **Craftable modules** - Connectors contribute tools, prompt sections, auth, preview labels, and approval copy.
- **Memory management** - User memory is authoritative; learned notes are lower priority; scratchpad is per-turn.

## Connector Contract

A connector should be able to provide:

- Tool definitions, split by read and write safety.
- A prompt section describing domain capabilities and heuristics.
- A human-readable tool summary entry.
- A write-action confirmation message and preview.
- Auth or OAuth setup UI.
- Cache invalidation rules after writes.

The bundled Jira code is being kept as the first example connector while the framework core becomes connector-neutral.

## Security

- All credentials encrypted with AES-256-GCM
- Data stored locally using electron-store
- No telemetry or data sent to external services (except your chosen AI provider)
- File access sandboxed to your selected workspace folder

## Tech Stack

- **Electron** - Cross-platform desktop framework
- **React** - UI framework
- **TypeScript** - Type-safe development
- **Vite** - Fast build tooling
- **TailwindCSS** - Styling
- **Vercel AI SDK concepts** - AI agent architecture

## Repository Direction

The project is being refactored from a project-management assistant into a reusable framework. The target structure is inspired by agent-first open-source repos: clear docs, explicit agent instructions, connector boundaries, and simple setup for contributors and downstream users.

## Documentation

All framework docs live in the repo as Markdown. Use this map to find the right guide.

### Start here

| Doc | Purpose |
| --- | --- |
| [README.md](README.md) | Project overview, setup, and this index |
| [AGENTS.md](AGENTS.md) | Instructions for coding agents (boundaries, where to edit) |
| [docs/repository-map.md](docs/repository-map.md) | Where to add features by area |
| [docs/architecture.md](docs/architecture.md) | Layers, data flow, connector vs core rules |

### Guides (`docs/`)

| Doc | Purpose |
| --- | --- |
| [docs/creating-a-connector.md](docs/creating-a-connector.md) | End-to-end connector authoring (tools, runtime, UI, auth) |
| [docs/prompts.md](docs/prompts.md) | Core vs connector prompts, assembly rules |
| [docs/memory.md](docs/memory.md) | User memory, learned notes, source memory, admission |

### Electron (desktop shell)

| Doc | Purpose |
| --- | --- |
| [electron/README.md](electron/README.md) | Main process, preload, IPC responsibilities |
| [electron/services/README.md](electron/services/README.md) | **Connector transport services** (OAuth, MCP, REST) — when to add a file like `atlassian-mcp.ts`, wiring checklist |

### Agent runtime (`src/agent/`)

| Doc | Purpose |
| --- | --- |
| [src/agent/README.md](src/agent/README.md) | Connector-neutral agent loop, core tools, file map |
| [src/agent/HELPERS.md](src/agent/HELPERS.md) | Error handling, artifacts, streaming, cross-links |
| [src/agent/taskContinuity.md](src/agent/taskContinuity.md) | Read→write nudges, turn intent, report grounding |
| [src/agent/compression/README.md](src/agent/compression/README.md) | Tool result compression before model context |

### Prompts (`src/prompts/`)

| Doc | Purpose |
| --- | --- |
| [src/prompts/README.md](src/prompts/README.md) | Editing `core/system.md`, planner, assembly |
| `src/prompts/core/system.md` | Live core system prompt (Markdown) |
| `src/prompts/core/planner.md` | Live planner prompt (Markdown) |

### Connectors (`src/connectors/`)

| Doc | Purpose |
| --- | --- |
| [src/connectors/README.md](src/connectors/README.md) | Connector contract, folder shape, auth guidance |
| [src/connectors/jira/README.md](src/connectors/jira/README.md) | **Reference connector** — tools, formatters, runtime |
| [src/connectors/jira/ui/README.md](src/connectors/jira/ui/README.md) | Reference connector settings UI wiring |

### UI (`src/components/` + theme)

| Doc | Purpose |
| --- | --- |
| [src/components/README.md](src/components/README.md) | Generic React UI overview, what belongs where |
| [src/components/ui/README.md](src/components/ui/README.md) | **UI kit** — buttons, forms, panels, tokens |
| [src/components/chat/README.md](src/components/chat/README.md) | Write bar, activity status, chat modules |
| [src/components/chat/artifacts/README.md](src/components/chat/artifacts/README.md) | Markdown report cards (`report_write`) |
| [src/components/connectors/README.md](src/components/connectors/README.md) | Reusable connector setup modules (MCP, API, scopes) |
| [src/theme/README.md](src/theme/README.md) | Design tokens (`tokens.css`) |

### Memory (`src/memory/`)

| Doc | Purpose |
| --- | --- |
| [src/memory/README.md](src/memory/README.md) | Memory layers, learned-note budget (framework code) |

### Quick paths by task

| I want to… | Read |
| --- | --- |
| Add a new connector | [docs/creating-a-connector.md](docs/creating-a-connector.md) → [src/connectors/README.md](src/connectors/README.md) |
| Add OAuth / MCP / REST for a provider | [electron/services/README.md](electron/services/README.md) |
| Change agent behavior (core) | [src/prompts/core/system.md](src/prompts/core/system.md), [docs/prompts.md](docs/prompts.md) |
| Change connector agent behavior | `src/connectors/<id>/prompt.md` |
| Customize write approval UI | [src/components/chat/README.md](src/components/chat/README.md) + connector `formatters.ts` |
| Add markdown report cards | [src/components/chat/artifacts/README.md](src/components/chat/artifacts/README.md) |
| Rebrand the UI | [src/theme/README.md](src/theme/README.md) → [src/components/ui/README.md](src/components/ui/README.md) |
| Understand memory rules | [docs/memory.md](docs/memory.md) → [src/memory/README.md](src/memory/README.md) |
| Fix agent stopping after file read | [src/agent/taskContinuity.md](src/agent/taskContinuity.md) |
| Handle provider overload / retries | [src/agent/HELPERS.md](src/agent/HELPERS.md) → `src/shared/aiErrors.ts` |
| Work as a coding agent | [AGENTS.md](AGENTS.md) |

## License

MIT
