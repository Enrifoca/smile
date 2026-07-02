# Bundled connectors

Shipped connector packages installed from **Connectors → Catalog → Install**.
These are first-class product connectors — not SDK examples.

Each folder matches the workspace plugin layout:

```
bundled/connectors/<id>/
  manifest.json
  prompt.md
  handler.js
  icon.svg | icon.png   # optional catalog artwork
  README.md             # optional documentation for users
```

Install copies the folder into `<workspace>/.smile/connectors/<id>/`.

For SDK demos and contract tests, see `examples/connectors/example` and
`packages/connector-sdk/fixtures/minimal/`.
