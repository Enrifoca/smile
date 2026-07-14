# smile:D

A desktop framework for building vertical AI agents for work.

[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](LICENSE)
[![GitHub release](https://img.shields.io/github/v/release/enrifoca/smile?color=black&label=release)](https://github.com/enrifoca/smile/releases/latest)
[![Built by Enrico Focaccia](https://img.shields.io/badge/Built%20by-Enrico%20Focaccia-black?logo=linkedin)](https://www.linkedin.com/in/enrico-focaccia/)

smile:D gives you the reusable structure: a local desktop shell, multi-model agent loop, human-in-the-loop tool approvals, editable memory, workspace file access, and a connector system. Bring a use case, add connector modules, tune the prompts, and ship a focused agent for that domain.

[![Download latest release](https://img.shields.io/badge/Download-latest%20release-black?style=for-the-badge)](https://github.com/enrifoca/smile/releases/latest)

## Features

| Feature | What it means |
| --- | --- |
| **Multimodal** | Choose your chat model, switch to a reasoning model, and use the OCR model for scanned or image-based documents. |
| **Human in the loop** | Read tools run freely; write tools pause for your approval before they execute. |
| **Editable memory** | User memory and learned notes live in Markdown under `.smile/memories`. |
| **Compression** | Verbose tool output is shrunk before it re-enters the model context. |
| **Context management** | Switch easily between project contexts to keep work scoped. |
| **Connector modules** | Create and install your own connector packages under `.smile/connectors/<id>/`. |
| **Clean white-label UI** | Minimal black-and-white interface, ready to adapt to a vertical use case. |

## Getting started

### End users

Download the latest installer for your platform from [GitHub Releases](https://github.com/enrifoca/smile/releases/latest).

| Platform | Installer |
| --- | --- |
| macOS Apple Silicon | `.dmg` / `.zip` |
| Windows | `.exe` (NSIS installer) |
| Linux | `.deb` (Debian / Ubuntu) or `.AppImage` (portable) |

> On Linux the `.deb` is the recommended install: it sets up a working Chromium sandbox and integrates with the desktop. The `.AppImage` is portable and self-updating, but it cannot ship a setuid `chrome-sandbox`, so it runs with `--no-sandbox`. Make it executable before the first launch (`chmod +x smileD-*.AppImage`); it also needs FUSE, available on Ubuntu 24.04 via `sudo apt install libfuse2t64`.

> Unsigned installers will show platform warnings. On macOS, see [docs/macos-install.md](docs/macos-install.md) for step-by-step workarounds. **macOS 26 (Tahoe) users:** the unsigned Mac build may still show “app is damaged” or crash on launch even after the workarounds — we’re working on Apple notarization to resolve this. On Windows you may see SmartScreen / Defender warnings; click "More info" → "Run anyway".

### Developers

```bash
# Install dependencies
npm install

# Run in development mode (starts Vite + Electron)
npm run electron:dev
# same as: npm run dev
```

If the window is blank after launch, your shell may have `ELECTRON_RUN_AS_NODE` set (common in Electron-based editors). The dev scripts clear it automatically; you can also run `unset ELECTRON_RUN_AS_NODE` before starting.

### Building

```bash
# Build for current platform
npm run build

# Build for Windows
npm run build:win

# Build for macOS
npm run build:mac

# Build for Linux (.deb + .AppImage)
npm run build:linux
```

Published releases (installers + auto-update): see [docs/distribution.md](docs/distribution.md).

## Configuration

There is no first-launch onboarding wizard. After the app opens, configure everything from **Settings** in the title bar:

1. **AI Provider** — choose and configure your chat, reasoning, and OCR providers.
2. **Workspace** — select a folder for document access and generated outputs.
3. **Memory** — edit durable user instructions in Markdown.
4. **Connectors** — install packages under `<workspace>/.smile/connectors/<id>/` (see the Connectors section and `docs/creating-a-connector.md`).

## Supported AI providers

Chat, reasoning, and OCR models can be configured independently.

| Provider | Chat | Reasoning | OCR | Notes |
| --- | :---: | :---: | :---: | --- |
| **OpenAI** | ✅ | ✅ | — | GPT models; reasoning via `o1`/`o3`/`o4` |
| **Anthropic** | ✅ | ✅ | — | Claude models; reasoning via Claude 3.7 Sonnet / Claude 4 |
| **Mistral** | ✅ | ✅ | ✅ | `mistral-large-latest`, `magistral-*`, `mistral-ocr-latest` |
| **Groq** | ✅ | ✅ | — | Mixture of hosted open-weight and reasoning models |
| **Moonshot / Kimi** | ✅ | ✅ | — | Kimi K2 family, including thinking variants |
| **DeepSeek** | — | ✅ | ✅ | `deepseek-reasoner`, DeepSeek OCR |
| **OpenRouter** | ✅ | ✅ | — | Aggregator; access many models with one key |
| **Grok / xAI** | ✅ | ✅ | — | Grok family via xAI API |
| **MiniMax** | ✅ | ✅ | — | `MiniMax-Text-01` and chat models |
| **Qwen / Alibaba** | ✅ | ✅ | — | `qwen-plus`, `qwq-32b`, Qwen3 reasoning |

## Framework Pillars

- **Multimodal by default** — chat, reasoning, and OCR models are configured independently.
- **Human in the loop** — connector write actions show Accept/Refuse above the composer before execution.
- **Craftable modules** — connectors contribute tools, prompt sections, auth, preview labels, and approval copy.
- **Editable memory & contexts** — user memory is authoritative; project contexts keep work scoped.

## Connector Contract

A connector should be able to provide:

- Tool definitions, split by read and write safety.
- A prompt section describing domain capabilities and heuristics.
- A human-readable tool summary entry.
- A write-action confirmation message and preview.
- Auth or OAuth setup UI.
- Cache invalidation rules after writes.

The host app ships no connector runtime inside the agent loop. Authors install packages in the active workspace (manually or from **Connectors → Catalog**); the core stays connector-neutral. Optional transport services and host capability handlers live in `electron/`.

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

## Repository direction

smile:D is an open-source desktop framework for vertical AI agents: connector-neutral core, workspace-scoped packages, Markdown prompts, and a white-label shell. Fork it for a domain, add connectors under `.smile/connectors/`, and tune prompts for your use case.

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
| [docs/ui-guidelines.md](docs/ui-guidelines.md) | **UI design rules** — colors, chips, snippets, content boxes, CTAs |
| [docs/distribution.md](docs/distribution.md) | Release builds, installers, and auto-updater |
| [docs/macos-install.md](docs/macos-install.md) | Installing the unsigned macOS `.dmg`/`.zip` release |

### Electron (desktop shell)

| Doc | Purpose |
| --- | --- |
| [electron/README.md](electron/README.md) | Main process, preload, IPC responsibilities |
| [electron/services/README.md](electron/services/README.md) | **Connector transport services** (OAuth, MCP, REST) — when to add a file like `atlassian-mcp.ts`, wiring checklist |

### Agent runtime (`src/agent/`)

| Doc | Purpose |
| --- | --- |
| [src/agent/README.md](src/agent/README.md) | Connector-neutral agent loop, core tools, file map |
| [src/agent/HELPERS.md](src/agent/HELPERS.md) | Loop guards (action-first), errors, artifacts, streaming |
| [src/agent/taskContinuity.md](src/agent/taskContinuity.md) | Read→write nudges, turn intent, report grounding |
| [src/agent/compression/README.md](src/agent/compression/README.md) | Tool result compression before model context |

### Prompts (`src/prompts/`)

| Doc | Purpose |
| --- | --- |
| [src/prompts/README.md](src/prompts/README.md) | Editing `core/system.md`, assembly, prompt tiers |
| `src/prompts/core/system.md` | Live core system prompt (Markdown) |

### Connectors

| Doc | Purpose |
| --- | --- |
| [docs/creating-a-connector.md](docs/creating-a-connector.md) | End-to-end connector authoring (manifest, handler, permissions) |
| [src/connectors/README.md](src/connectors/README.md) | Host contract, discovery, catalog |
| [src/connectors/contract/README.md](src/connectors/contract/README.md) | Manifest and sandbox API reference |
| [packages/connector-sdk/README.md](packages/connector-sdk/README.md) | Validate / test CLI for connector packages |

### UI (`src/components/` + theme)

| Doc | Purpose |
| --- | --- |
| [src/components/shell/README.md](src/components/shell/README.md) | **Desktop shell** — titlebar, chat history, tabs, inspector |
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

### Project governance

| Doc | Purpose |
| --- | --- |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to contribute code, report issues, and open pull requests |
| [SECURITY.md](SECURITY.md) | Reporting security vulnerabilities and supported versions |
| [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) | Community standards and expected behavior |
| [.github/CODEOWNERS](.github/CODEOWNERS) | Default reviewers for each area of the codebase |
| [.github/dependabot.yml](.github/dependabot.yml) | Automated dependency update configuration |
| [.github/rulesets/main.json](.github/rulesets/main.json) | `main` branch protection ruleset |

### Quick paths by task

| I want to… | Read |
| --- | --- |
| Add a new connector | [docs/creating-a-connector.md](docs/creating-a-connector.md) → [src/connectors/README.md](src/connectors/README.md) |
| Add OAuth / MCP / REST for a provider | [electron/services/README.md](electron/services/README.md) |
| Change agent behavior (core) | [src/prompts/core/system.md](src/prompts/core/system.md), [docs/prompts.md](docs/prompts.md) |
| Change connector agent behavior | `<workspace>/.smile/connectors/<id>/prompt.md` |
| Customize write approval UI | [src/components/chat/README.md](src/components/chat/README.md) + manifest `confirmation` / `preview` |
| Add markdown report cards | [src/components/chat/artifacts/README.md](src/components/chat/artifacts/README.md) |
| Rebrand the UI | [docs/ui-guidelines.md](docs/ui-guidelines.md) → [src/components/shell/README.md](src/components/shell/README.md) → [src/theme/README.md](src/theme/README.md) |
| Understand memory rules | [docs/memory.md](docs/memory.md) → [src/memory/README.md](src/memory/README.md) |
| Fix agent stopping after file read | [src/agent/taskContinuity.md](src/agent/taskContinuity.md) |
| Fix model planning in chat instead of tools | [src/agent/HELPERS.md § Loop guards](src/agent/HELPERS.md#loop-guards) |
| Handle provider overload / retries | [src/agent/HELPERS.md](src/agent/HELPERS.md) → `src/shared/aiErrors.ts` |
| Work as a coding agent | [AGENTS.md](AGENTS.md) |

## License

MIT — see [LICENSE](LICENSE).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
