# Example connectors

Reference declarative connectors for the smile:D framework. A connector is a
folder with three files:

- `manifest.json` — identity, permissions, auth fields, UI labels, and tools
  (each tool declares its input as JSON Schema). Validated against the contract
  in `src/connectors/contract`.
- `prompt.md` — the domain prompt section injected into the agent system prompt.
- `handler.js` — a CommonJS module (`module.exports = { executeTool, approveAction? }`)
  run in a sandboxed `node:vm` inside a utilityProcess. It has no
  `require`/`process`/`fetch`/`fs`; it reaches the outside world only through the
  injected `host` bridge (`host.http`, `host.mcp`, `host.file`, `host.secrets`,
  `host.log`), gated by the manifest `permissions`.

## Install into a workspace

Copy a connector folder into your workspace:

```
<workspace>/.smile/connectors/<id>/
  manifest.json
  prompt.md
  handler.js
```

On the next load, smile:D discovers and validates it, then exposes its tools to
the agent. Tools marked `requiresConfirmation` pause for human approval before
running.

## `example`

Exercises the full path end to end:

- `example_get_post` (read) — fetches a demo post via `host.http.fetch`
  (allowlisted to `https://jsonplaceholder.typicode.com`).
- `example_echo` (write) — echoes a message, demonstrating the confirmation card
  rendered from the manifest `confirmation`/`preview` templates.
