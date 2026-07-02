# Prompts

Prompts are Markdown files so developers and coding agents can edit behavior without digging through TypeScript strings.

## Core Prompts

- `src/prompts/core/system.md` is the connector-neutral system prompt (identity, tools, capability boundary, response style).
- `src/prompts/index.ts` assembles Markdown with memory, user profile, and connector context.

## Prompt tiers

Each model call assembles three layers (`src/agent/promptTiers.ts`):

| Tier | Source | Stability |
| --- | --- | --- |
| **Foundation** | `system.md` (core rules) | Stable |
| **Scope** | User profile (communication preferences), connector `prompt.md` sections | Semi-stable per session |
| **Turn** | Environment context (current date/time/timezone), memory, core capabilities, active context, current plan | Changes every iteration |

### Core capabilities and Connector context (dynamic)

`src/agent/capabilities.ts` builds two non-overlapping turn-tier sections:

- **Core capabilities** lists the built-in (non-connector) tools currently available.
- **Connector context** lives in the Scope tier and merges each enabled connector's own `prompt.md` instructions with the list of tools it provides.

Both are injected each turn so the model does not rely on static deny-lists in `system.md`.

Connectors may declare optional `agentCapabilities` tokens in `manifest.json` (e.g. `"email"`, `"web-search"`) for human-readable capability labels — see [creating-a-connector.md](./creating-a-connector.md).

## Connector Prompts

Each connector should own its prompt section in the workspace package:

- `<workspace>/.smile/connectors/<id>/prompt.md`

Connector prompts should include:

- Domain-specific tool usage rules.
- Read-before-write gates, especially when duplicate detection, existence checks, or external state can change whether a write is needed.
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

Keep interpolation simple. If logic becomes complex, compute the text in TypeScript and inject it as one variable (as with core capabilities, connector context, and user communication preferences).

## User communication preferences

Settings → Behavior → Communication preferences (technical/conversational, concise/detailed, formal/casual) are rendered into the **User Context** scope block via `src/agent/communicationPreferences.ts`. They affect the main agent's visible replies.

## Tool Results In History

Tool results are execution records, not visible assistant prose. The agent stores them as private model-visible messages so later loop iterations and reloaded chats can use the facts gathered by tools.

Prompts should refer to `[tool_result: ...]` entries as internal evidence only. The model must not reproduce those markers in user-facing replies.

When a requested write depends on a read/search/list result, the prompt should tell the model to run the reads first and inspect their tool results before proposing a write.
