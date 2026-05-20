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

# Run in development mode
npm run electron:dev
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
- **Human in the loop** - Connector write actions use confirmation cards before execution.
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

## License

MIT
