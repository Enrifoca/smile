# smile:D

Open Source AI Workspace.

[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](LICENSE)
[![GitHub release](https://img.shields.io/github/v/release/enrifoca/smile?color=black&label=release)](https://github.com/enrifoca/smile/releases/latest)
[![Built by Enrico Focaccia](https://img.shields.io/badge/Built%20by-Enrico%20Focaccia-black?logo=linkedin)](https://www.linkedin.com/in/enrico-focaccia/)

smile:D is a desktop AI workspace: a local chat interface that can read, write, search, remember, and use connector modules to work with external services. It keeps files in a workspace folder, maintains project contexts, and asks for approval before destructive actions.

[![Download latest release](https://img.shields.io/badge/Download-latest%20release-black?style=for-the-badge)](https://github.com/enrifoca/smile/releases/latest)

## Demo

A short demo video will be added here.

<!-- Replace the line below with a video link or an HTML `<video>` tag pointing to the demo file. -->
<!-- [Watch demo](https://www.youtube.com/watch?v=REPLACE_ME) -->

## Features

| Feature | What it means |
| --- | --- |
| **Multimodal** | Choose your chat model, switch to a reasoning model, and use the OCR model for scanned or image-based documents. |
| **Human in the loop** | Read tools run freely; write tools pause for your approval before they execute. |
| **Editable memory** | User memory and learned notes live in Markdown under `.smile/memories`. |
| **Project contexts** | Switch between project scopes; each context keeps its own knowledge, connectors, and output folders. |
| **Workspace tools** | List, read, search, write, patch files, and generate markdown reports in a local folder. |
| **Visual tools** | Generate charts, diagrams, and images and embed them directly in reports. |
| **Connector modules** | Extend the workspace with connectors under `.smile/connectors/<id>/` or install from the bundled catalog. |
| **Compression** | Verbose tool output is shrunk before it re-enters the model context. |
| **Minimal UI** | Black-and-white interface, no unnecessary chrome. |

## Installation

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
4. **Connectors** — install packages under `<workspace>/.smile/connectors/<id>/` (see `docs/creating-a-connector.md`).

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

## Roadmap

- [x] Multi-model chat and reasoning support
- [x] Workspace file tools and markdown reports
- [x] Editable memory and project contexts
- [x] Connector system for external services
- [x] Image generation and chart/diagram rendering
- [ ] More bundled connectors
- [ ] Improved context compression for very long conversations
- [ ] Optional cloud-sync / team workspace support

## Documentation

| Doc | Purpose |
| --- | --- |
| [README.md](README.md) | Project overview, setup, and this index |
| [AGENTS.md](AGENTS.md) | Instructions for coding agents (boundaries, where to edit) |
| [docs/architecture.md](docs/architecture.md) | Layers, data flow, connector vs core rules |
| [docs/repository-map.md](docs/repository-map.md) | Where to add features by area |
| [docs/creating-a-connector.md](docs/creating-a-connector.md) | End-to-end connector authoring |
| [docs/prompts.md](docs/prompts.md) | Core vs connector prompts, assembly rules |
| [docs/memory.md](docs/memory.md) | User memory, learned notes, source memory, admission |
| [docs/ui-guidelines.md](docs/ui-guidelines.md) | UI design rules |
| [docs/distribution.md](docs/distribution.md) | Release builds, installers, and auto-updater |
| [docs/macos-install.md](docs/macos-install.md) | Installing the unsigned macOS `.dmg`/`.zip` release |

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

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — see [LICENSE](LICENSE).
