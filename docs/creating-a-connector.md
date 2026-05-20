# Creating a Connector

A connector is a module that gives the agent domain-specific tools, prompt instructions, UI metadata, and runtime execution.

Use `src/connectors/jira` as the reference implementation.

## Folder Template

```text
src/connectors/my-connector/
  connector.ts
  formatters.ts
  index.ts
  manifest.ts
  prompt.md
  runtime.ts
  tools.ts
  README.md
```

## Steps

1. Copy the Jira connector folder.
2. Update `manifest.ts` with the connector id, name, description, auth type, and UI labels.
3. Replace `tools.ts` with your connector's Zod schemas and tool definitions.
4. Write domain behavior in `prompt.md`.
5. Implement `runtime.ts` to call Electron IPC, an SDK, MCP, or another local service.
6. Implement `formatters.ts` for action previews, approval copy, result compaction, cache invalidation, and special approval flows.
7. Register the runtime in `src/connectors/registry.ts`.
8. Add connector-specific setup UI only if needed.

## Connector Rules

- Do not edit `src/agent` to add connector-specific behavior.
- Do not add connector-specific instructions to `src/prompts/core`.
- Keep tool schemas precise and short.
- Keep `prompt.md` focused on domain heuristics the model needs to use tools correctly.
- Format large API results before they enter model context.

## Semrush Example Shape

A Semrush connector would likely expose tools such as:

- `semrush_domain_overview`
- `semrush_keyword_gap`
- `semrush_backlink_audit`
- `semrush_create_report`

Its `prompt.md` would explain SEO workflow rules, default report formats, and when to ask for domain, country, database, or competitor inputs.
