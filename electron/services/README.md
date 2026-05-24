# Electron Desktop Services

Desktop services live in the **Electron main process**. They exist because some work cannot (or should not) run in the renderer: OAuth callbacks, long-lived MCP proxy processes, secret storage, CORS-free HTTP, filesystem access, and provider SDKs that assume Node.js.

**Connectors do not live here.** Connector modules live under `src/connectors/<id>/`. A desktop service is **optional transport infrastructure** that a connector's `runtime.ts` calls through IPC when the integration needs main-process capabilities.

## Two layers (do not confuse them)

```text
src/connectors/<id>/          ← Agent-facing module (always create this)
  tools.ts                    ← Tool schemas the model sees
  prompt.md                   ← Domain instructions
  formatters.ts               ← Approval copy, result shaping
  runtime.ts                  ← Calls Electron IPC (thin bridge)

electron/services/<name>.ts   ← Optional transport (create only if needed)
  auth, HTTP/MCP, normalization, errors
```

```mermaid
flowchart LR
  agent["Agent loop"] --> runtime["connectors/&lt;id&gt;/runtime.ts"]
  runtime --> preload["preload.ts bridge"]
  preload --> service["electron/services/&lt;name&gt;.ts"]
  service --> provider["External API / MCP server"]
```

| Layer | Owns | Example (Jira) |
| --- | --- | --- |
| Connector module | What the agent knows and how results read in chat | `src/connectors/jira/` |
| Desktop service | How the desktop app reaches the provider securely | `electron/services/atlassian-mcp.ts` |

See also: [Creating a connector](../../docs/creating-a-connector.md), [Architecture](../../docs/architecture.md).

---

## When do you need a new file in `electron/services/`?

Create a dedicated service when **any** of these apply:

| Need | Why main process |
| --- | --- |
| **OAuth / browser login** | Local callback port, token exchange, secure persistence |
| **Hosted or local MCP** | Spawn/manage proxy process, JSON-RPC over stdio/HTTP |
| **API keys that must not touch the renderer** | Read/write via `storage.setSecure` in main only |
| **CORS-blocked REST from the app** | `fetch` from main process (same pattern as `ai.ts`) |
| **Long-lived connections** | Keep-alive, reconnect, background token refresh |
| **Provider SDK requires Node** | Official clients that don't run in Chromium |
| **Payload normalization** | Translate agent-friendly args into provider API shapes before send |
| **Structured error parsing** | Map provider/MCP errors into `{ success, error }` the connector expects |

You often **do not** need a new service when:

- The provider offers a simple REST API and you are comfortable invoking it from main via a **small generic helper** (still prefer main over renderer for secrets).
- The connector is read-only and uses credentials already stored by an existing service.
- All logic fits in a few IPC handlers — but keep handlers in a named service file, not bloated into `main.ts`.

**Rule of thumb:** start with `src/connectors/<id>/runtime.ts`. If runtime needs capabilities the preload bridge does not expose yet, add `electron/services/<id>-<transport>.ts` and wire IPC.

---

## What a connector transport service should do

A file like `atlassian-mcp.ts` is a **connector transport service**, not a second connector. It should:

### 1. Connection lifecycle

- Connect / disconnect / reconnect
- Expose connection state (connecting, oauth_pending, connected, error)
- Optional keep-alive for MCP or websocket transports
- Clear errors when auth expires or the user switches accounts

### 2. Authentication

- Run OAuth flows (open browser, listen on callback port, store tokens)
- Or load API keys from secure storage
- Never log tokens; never pass secrets to the renderer except “configured: yes/no”

### 3. Operation methods (high-level API)

- One method per **capability** the connector runtime needs, not necessarily one per MCP tool name
- Example: `createIssue(...)`, `searchIssues(...)`, not raw `callTool` exposed to the UI
- Accept **agent-friendly** arguments (plain strings where possible); normalize inside the service

### 4. Provider payload normalization

External APIs often expect nested objects. The model sends simple values. Normalize in the service **before** the provider call.

Example (Jira priority):

```typescript
// Agent / runtime passes:  { priority: "Low" }
// Jira REST expects:         { priority: { name: "Low" } }
```

Keep normalization in the service or connector `fields.ts`, not in `src/agent`.

### 5. Error handling

- Parse provider/MCP responses into a consistent shape:
  - `{ success: true, data }` on success
  - `{ success: false, error: "human-readable message" }` on failure
- Do **not** return `success: true` when the provider returned `isError: true` (common MCP pitfall)
- Preserve enough detail in `error` for the agent to self-correct (field name, validation message)

### 6. No agent or prompt logic

- No tool schemas, no Markdown prompts, no approval UI copy
- No imports from `src/agent` or `src/prompts`
- The connector's `formatters.ts` turns service results into chat-friendly text

---

## Reference implementations in this repo

| File | Role | Used by |
| --- | --- | --- |
| `atlassian-mcp.ts` | Atlassian Rovo MCP: OAuth via `mcp-remote`, proxy process, Jira tool calls, field normalization, workspace validation | Jira connector `runtime.ts` → `electron.mcp.*` |
| `jira.ts` | Direct Jira REST API (legacy/alternate path) | Settings, some read/write flows |
| `jira-attachment.ts` | Attachment upload via REST (MCP gap: binary uploads) | Jira connector attachment tool |
| `ai.ts` | LLM providers (streaming, tools, retries) | Core agent |
| `files.ts` | Workspace read/write/search | Core file tools |
| `memory.ts` | `.smile/memories` persistence | Core memory tools |
| `storage.ts` / `encryption.ts` | Settings and secure credentials | App-wide |
| `ocr.ts` | OCR provider calls | `file_read_ocr` |

**Jira uses two transports on purpose:** MCP for most issue operations, REST for attachments and metadata sync. A new connector might also combine MCP + REST if the provider splits features.

---

## Wiring checklist (new service → connector runtime)

When you add `electron/services/my-provider.ts`:

1. **Service class** — focused methods, no IPC inside the class
2. **`electron/main.ts`** — `ipcMain.handle('myprovider:action', ...)` delegates to the service
3. **`electron/preload.ts`** — expose a typed `myprovider` object on `window.electron`
4. **`src/types/electron.d.ts`** — TypeScript types for the preload API
5. **`src/hooks/useElectron.ts`** — optional `useCallback` wrappers for React
6. **`src/connectors/<id>/runtime.ts`** — `executeTool` calls `electron.myprovider.*`
7. **Connector settings UI** — connect/disconnect buttons call the same IPC

Keep `main.ts` thin: register handlers, compose services, forward events.

### Naming

Prefer descriptive transport names:

- `atlassian-mcp.ts` — provider + mechanism
- `semrush-api.ts` — REST client
- `acme-mcp.ts` — another MCP integration

Avoid generic names like `connector-service.ts` unless shared by multiple connectors.

---

## MCP vs REST service patterns

### MCP pattern (like `atlassian-mcp.ts`)

Use when the vendor ships a hosted MCP server or you run a local MCP server.

The service typically:

1. Spawns or connects to an MCP proxy (e.g. `mcp-remote`)
2. Implements OAuth if the MCP server requires it
3. Maps high-level methods → `tools/call` with tool names and arguments
4. Parses MCP content blocks and `isError` flags
5. Caches cloud/site IDs needed on every call

The connector `runtime.ts` stays thin:

```typescript
return await electron.mcp.createIssue(projectKey, issueTypeName, summary, description, extraFields)
```

### REST pattern (like `jira.ts`, `jira-attachment.ts`)

Use when you call HTTP APIs directly with API tokens or bearer tokens.

The service typically:

1. Loads credentials from secure storage
2. Builds request URLs and headers
3. Normalizes request/response JSON
4. Returns `{ success, data | error }`

Good for uploads, webhooks, or APIs without MCP coverage.

---

## Relationship to `src/connectors/<id>/runtime.ts`

| Concern | Belongs in |
| --- | --- |
| Tool name → IPC method mapping | `runtime.ts` |
| Argument renaming (`issueKey` vs `issueIdOrKey`) | `runtime.ts` |
| Provider field normalization (priority, assignee) | Service or `connectors/<id>/fields.ts` |
| OAuth browser flow | Service |
| MCP process management | Service |
| Formatting results for the model | `formatters.ts` |
| Write approval copy | `formatters.ts` |

`runtime.ts` should read like a **switchboard**, not a 500-line HTTP client.

---

## Future direction

`electron/README.md` notes a goal: **generic connector IPC** so every new connector does not require hand-editing `preload.ts`, `useElectron.ts`, and `main.ts`. Until that exists, follow the wiring checklist above.

When adding a connector, always ask:

1. Does `src/connectors/<id>/` exist with tools, prompt, formatters, runtime? **(required)**
2. Does the provider need main-process transport? **(if yes → new or reuse service)**
3. Are IPC types and settings UI wired? **(if exposed to user)**

---

## Quick decision tree

```text
Adding a connector?
│
├─ Tools + prompts + formatters only, mock runtime for tests
│    └─ src/connectors/<id>/ only
│
├─ REST API + API key in secure storage
│    └─ src/connectors/<id>/ + electron/services/<id>-api.ts + IPC wiring
│
├─ Vendor MCP + OAuth
│    └─ src/connectors/<id>/ + electron/services/<vendor>-mcp.ts + IPC wiring
│       (use atlassian-mcp.ts as reference, do not copy blindly)
│
└─ Reuse existing transport (e.g. generic HTTP helper)
     └─ src/connectors/<id>/runtime.ts calls existing IPC
```
