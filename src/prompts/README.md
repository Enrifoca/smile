# Prompt Editing

Core prompts are Markdown files.

## Files

- `core/system.md`: connector-neutral agent behavior.
- `index.ts`: prompt assembly.
- `loader.ts`: simple template rendering helpers.

## Rules

- Put reusable framework behavior in `core`.
- Put domain behavior in connector `prompt.md` files.
- Keep TypeScript interpolation small and explicit.
- Do not add connector names or product-specific examples to core prompts.
