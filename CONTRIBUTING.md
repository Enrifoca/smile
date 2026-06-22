# Contributing

Thanks for helping improve smile:D.

## Before you open a PR

1. Read [AGENTS.md](AGENTS.md) for architecture boundaries (connector-neutral core, no domain logic in the agent loop).
2. Run `npm run typecheck` — it must pass.
3. UI changes should follow [docs/ui-guidelines.md](docs/ui-guidelines.md).
4. New connector behavior belongs in workspace packages or `bundled/connectors/`, not hard-coded in `src/agent`.

## Where to change things

| Goal | Start here |
| --- | --- |
| Shell / navigation / tabs | [src/components/shell/README.md](src/components/shell/README.md) |
| Agent loop | [src/agent/README.md](src/agent/README.md) |
| Core prompts | [src/prompts/core/](src/prompts/core/) |
| New connector | [docs/creating-a-connector.md](docs/creating-a-connector.md) |
| Connector transport (OAuth/MCP) | [electron/services/README.md](electron/services/README.md) |

## Commits and scope

Keep PRs focused. Prefer updating the relevant folder README or `docs/` when you change a public contract.

## Security

Do not commit API keys, `.env` files, or workspace credentials. Report security issues privately to the repository maintainer rather than opening a public issue with exploit details.
