# Architecture

smile:D is a desktop framework for building vertical AI agents. The core should stay connector-neutral; domain behavior belongs in workspace connector packages.

## Layers

```mermaid
flowchart TD
  renderer["React Renderer"] --> agent["Agent Runtime"]
  agent --> prompts["Markdown Prompts"]
  agent --> coreTools["Core Tools"]
  agent --> connectors["Connector Registry"]
  connectors --> plugin["Workspace package handler.js"]
  plugin --> broker["ConnectorsService broker"]
  broker --> electron["Electron Services"]
```

## Responsibilities

- `src/agent` owns the conversation loop, tool execution flow, pending action lifecycle, scratchpad, streaming, and result handling.
- `src/prompts` owns core Markdown prompts and prompt assembly.
- `src/connectors` owns the connector contract, catalog metadata, registry, and plugin loading — runtime packages live in the workspace; shipped sources in `bundled/connectors/`.
- `src/components` owns generic UI. Connector settings use `GenericConnectorSettingsView` driven by manifest auth/MCP fields.
- `electron` owns desktop services and IPC boundaries. The sandbox broker calls optional **transport services** under `electron/services/` when OAuth, MCP, or secure API access is required. See [electron/services/README.md](../electron/services/README.md).

## Connector package vs transport service

| Location | Purpose |
| --- | --- |
| `<workspace>/.smile/connectors/<id>/` | Manifest, prompt, sandboxed handler (required for every connector at runtime) |
| `bundled/connectors/<id>/` | Shipped catalog source copied on **Install** (optional; framework maintainers) |
| `electron/services/<name>.ts` | Main-process auth and API/MCP transport (optional; e.g. `atlassian-mcp.ts` for MCP server id `atlassian`) |

The agent never imports desktop services directly. Only the main-process sandbox broker talks to them on behalf of `handler.js`.

## Data Flow

1. The user sends a chat message in the renderer.
2. `ChatView` creates or reuses an `Agent`.
3. The agent assembles the system prompt from core Markdown, memory, and connector prompt sections.
4. The model calls core tools or connector tools.
5. Core tools execute through generic handlers; connector tools execute via IPC → sandbox → broker.
6. Write tools create pending actions and wait for user approval.
7. Tool results are compressed before being returned to the model.
8. **Task continuity** (`taskContinuity.ts`) keeps read→write workflows from stopping early. Detail: [taskContinuity.md](../src/agent/taskContinuity.md).

## Agent loop guards (core)

All guards are documented in [src/agent/HELPERS.md § Loop guards](../src/agent/HELPERS.md#loop-guards).

| Guard | Module | One-line |
| --- | --- | --- |
| Task continuity | `taskContinuity.ts` | Read without write; chat prose without tools |
| Tool errors | `toolErrors.ts` + `shared/aiErrors.ts` | Failed tools and provider overload |
| Think-only | `index.ts` | Thinking block with no follow-up |

## Core Rule

If a behavior mentions a specific external product, it does not belong in `src/agent` or `src/prompts/core`.
