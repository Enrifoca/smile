# Connectors

Connectors are copyable modules that add domain-specific capabilities to the framework.

## Contract

The shared contract lives in `types.ts`.

A connector can provide:

- Tool definitions.
- A Markdown prompt section.
- Tool summary labels.
- Write-action confirmation copy.
- Action previews.
- Tool result formatting.
- Cache invalidation rules.
- Special approval flows.
- Runtime execution.

## Folder Shape

Each connector should look like:

```text
connectors/<id>/
  connector.ts
  formatters.ts
  index.ts
  manifest.ts
  prompt.md
  runtime.ts
  tools.ts
  README.md
```

## Rules

- Keep connector behavior inside connector folders.
- Keep connector prompts in `prompt.md`.
- Keep connector APIs out of `src/agent`.
- Register enabled connectors through `registry.ts`.
