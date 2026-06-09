# @smile/connector-sdk

Types, manifest validation, and test harness for [smile:D](https://github.com/) connector packages.

Connector authors use this package to validate `manifest.json`, run host contract checks, and smoke-test `handler.js` in the same Electron sandbox the desktop app uses.

## Install (monorepo)

From the smile repo root:

```bash
npm install
```

The SDK lives at `packages/connector-sdk` and imports the canonical contract from `src/connectors/contract`.

## CLI

```bash
# Validate manifest + required files (no Electron)
npm run validate:connector -- packages/connector-sdk/fixtures/minimal

# Host contract regression checks
npm run validate:contract

# Smoke-test handler in sandbox (requires dist-electron/connector-sandbox.js)
npm run test:connector -- packages/connector-sdk/fixtures/minimal --tool fixture_search_records --args '{"query":"hello"}'
```

Or via bin (after `npm install`):

```bash
npx smile-connector validate packages/connector-sdk/fixtures/minimal
```

## Programmatic API

```typescript
import {
  validateConnectorPackage,
  loadConnectorPackage,
  validateManifest,
  runContractChecks,
  type ConnectorManifest,
  type ToolResult,
} from '@smile/connector-sdk'

const result = validateConnectorPackage('.smile/connectors/my-api')
if (!result.ok) console.error(result.errors)
```

## Commands

| Command | Description |
| --- | --- |
| `validate <dir>` | Parse and validate `manifest.json`, check `handler.js` / `prompt.md` |
| `check-contract` | Run reference fixtures against the host contract |
| `test <dir>` | Fork sandbox, execute a tool (default: first read tool) with mock host |

### `test` options

- `--tool <name>` — tool to execute (default: first `connector-read` tool)
- `--args '<json>'` — tool arguments (default: `{}`)

## Package layout

A valid connector directory:

```
.smile/connectors/<id>/
  manifest.json   # required
  handler.js      # required when handlerKind is "code" (default)
  prompt.md       # recommended
```

See `docs/creating-a-connector.md` and `src/connectors/contract/README.md` in the host repo.
