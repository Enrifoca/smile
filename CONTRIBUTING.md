# Contributing to smile:D

Thanks for helping improve smile:D. This document explains how to set up the project, propose changes, and get them merged.

## Reporting issues

Before opening an issue, please search [existing issues](https://github.com/enrifoca/smile/issues) to avoid duplicates.

When filing a bug report, include:

- The smile:D version (`package.json` or the app's about dialog) and your OS / architecture.
- The exact steps to reproduce, including the active context and connector if relevant.
- The full error message or output from **View → Toggle Developer Tools** when possible.
- A minimal reproduction when you can provide one.

For feature requests, describe the use case first and the proposed behavior second — it helps decide whether the feature fits the framework's scope.

## Development setup

### Prerequisites

- **Node.js 18+**
- **npm**
- macOS, Windows, or Linux (some platform-specific paths are tested by the maintainer when needed)

### Install and run

```bash
npm install
npm run electron:dev
```

This starts the Vite renderer dev server and the Electron main process.

## Build & test

Run the type checker before committing:

```bash
npm run typecheck
```

For non-trivial changes, run a full build to catch packaging issues:

```bash
npm run build
```

If you change a bundled connector, validate it with the connector SDK:

```bash
npm run validate:connector -- bundled/connectors/<id>
```

## Where to change things

| Goal | Start here |
| --- | --- |
| Agent loop | [src/agent/README.md](src/agent/README.md) |
| Core prompts | [src/prompts/core/](src/prompts/core/) |
| Shell / navigation / tabs | [src/components/shell/README.md](src/components/shell/README.md) |
| New connector | [docs/creating-a-connector.md](docs/creating-a-connector.md) |
| Connector transport (OAuth / MCP) | [electron/services/README.md](electron/services/README.md) |
| UI conventions | [docs/ui-guidelines.md](docs/ui-guidelines.md) |

Read [AGENTS.md](AGENTS.md) and [docs/repository-map.md](docs/repository-map.md) first — they define the architecture boundaries.

## Pull request workflow

1. Fork the repository and create a topic branch from `main`.
2. Keep changes focused — one logical change per PR. Refactors, features, and formatting changes belong in separate PRs.
3. Run `npm run typecheck` before pushing. It must pass.
4. Run `npm run build` for changes that touch Electron main, preload, or the build pipeline.
5. Add or update tests when the project already has coverage for the area you changed.
6. Update the relevant folder `README.md`, `docs/`, or `AGENTS.md` when you change a public contract or responsibility.
7. Open a PR against `main` with a clear title and a description that explains the *why*, not only the *what*.

### Commit messages

- Use present-tense, imperative subjects ("Add OpenRouter provider", not "Added").
- Keep the subject under ~70 characters; put details in the body.
- Reference issues with `Fixes #123` / `Refs #123` where applicable.

### Code style

- TypeScript is the target. Prefer explicit types for connector contracts over stringly typed branches.
- Match the surrounding style — indentation, naming, and file layout. Do not reformat unrelated code in your PR.
- Make minimal changes. Prefer small, focused edits over large refactors.
- Keep user-facing copy generic unless it lives inside an example connector.

### Connector-specific guidance

- Keep the core framework connector-neutral — no connector tool logic in the agent loop.
- New connector behavior belongs in workspace packages or `bundled/connectors/`, not hard-coded in `src/agent`.
- Connector handlers run inside a sandbox. If you need a host capability, declare it in the connector `manifest.json` and implement it in the main-process broker.
- Core prompt behavior stays in Markdown under `src/prompts/core`; connector-specific behavior stays in each connector's `prompt.md`.

## Security

Do not commit API keys, `.env` files, or workspace credentials. Report security issues privately to the repository maintainer rather than opening a public issue with exploit details.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
