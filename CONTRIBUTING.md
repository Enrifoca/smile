# Contributing

Thanks for helping improve smile:D.

## Before you start

1. Read [AGENTS.md](AGENTS.md) for architecture boundaries (connector-neutral core, no domain logic in the agent loop).
2. Read [docs/repository-map.md](docs/repository-map.md) to find the right area for your change.

## Development setup

- Node.js 18+
- npm

```bash
npm install
npm run electron:dev
```

Run the type checker before committing:

```bash
npm run typecheck
```

## Where to change things

| Goal | Start here |
| --- | --- |
| Shell / navigation / tabs | [src/components/shell/README.md](src/components/shell/README.md) |
| Agent loop | [src/agent/README.md](src/agent/README.md) |
| Core prompts | [src/prompts/core/](src/prompts/core/) |
| New connector | [docs/creating-a-connector.md](docs/creating-a-connector.md) |
| Connector transport (OAuth/MCP) | [electron/services/README.md](electron/services/README.md) |

## Pull requests

- Keep PRs focused and small.
- Run `npm run typecheck` — it must pass.
- UI changes should follow [docs/ui-guidelines.md](docs/ui-guidelines.md).
- New connector behavior belongs in workspace packages or `bundled/connectors/`, not hard-coded in `src/agent`.
- Prefer updating the relevant folder README or `docs/` when you change a public contract.

## Security

Do not commit API keys, `.env` files, or workspace credentials. Report security issues privately to the repository maintainer rather than opening a public issue with exploit details.
