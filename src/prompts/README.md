# Prompt Editing

Core prompts are Markdown files.

## Files

- `core/system.md`: connector-neutral agent behavior (includes capability boundary; dynamic tool list is injected at runtime).
- `index.ts`: foundation and scope assembly.
- `loader.ts`: simple template rendering helpers.

Runtime turn-tier blocks (enabled capabilities, scratchpad, plan, deep thinking) are built in `src/agent/promptTiers.ts` and `src/agent/capabilities.ts`. See [docs/prompts.md](../../docs/prompts.md).

## Rules

- Put reusable framework behavior in `core`.
- Put domain behavior in connector `prompt.md` files.
- Keep TypeScript interpolation small and explicit.
- Do not add connector names or product-specific examples to core prompts.
- Do not use static deny-lists for integrations — declare tools in connectors and let **Enabled capabilities** reflect what is available.
