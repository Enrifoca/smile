# Prompts

Prompts are Markdown files so developers and coding agents can edit behavior without digging through TypeScript strings.

## Core Prompts

- `src/prompts/core/system.md` is the connector-neutral system prompt.
- `src/prompts/core/planner.md` is the optional planner prompt.
- `src/prompts/index.ts` assembles Markdown with memory, user profile, mode, and connector context.

## Connector Prompts

Each connector should own its prompt section:

- `src/connectors/jira/prompt.md`
- `src/connectors/<id>/prompt.md`

Connector prompts should include:

- Domain-specific tool usage rules.
- Default heuristics.
- When to ask a clarifying question.
- How to interpret connector metadata.

Connector prompts should not include:

- Core agent identity.
- Generic file rules.
- Generic memory rules.
- UI implementation details.

## Variables

Prompt templates use simple `{{variable}}` placeholders rendered by `src/prompts/loader.ts`.

Keep interpolation simple. If logic becomes complex, compute the text in TypeScript and inject it as one variable.
