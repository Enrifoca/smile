# Example connectors (SDK / demos)

Reference packages for learning and validating the connector contract — **not**
the same as bundled catalog connectors in `bundled/connectors/`.

A connector folder contains:

- `manifest.json` — identity, permissions, auth fields, tools
- `prompt.md` — domain prompt section
- `handler.js` — sandboxed tool implementation

## `example`

Exercises the full path end to end:

- `example_get_post` (read) — `host.http.fetch` to jsonplaceholder
- `example_echo` (write) — confirmation card from manifest templates

Validate:

```bash
npm run validate:connector -- examples/connectors/example
```

Install manually by copying into `<workspace>/.smile/connectors/example/`.
