/**
 * Context management: a user-defined "project" that circumscribes the agent.
 *
 * A context binds, for one project:
 * - an optional working folder (soft scoping: a suggested working dir within the
 *   workspace, not a hard chroot),
 * - the per-connector domain (shaped by each connector's `manifest.contextSchema`,
 *   e.g. Jira `{ projectKeys: ["ACME"] }`).
 *
 * The user activates a context in chat with `/` + name (sticky for the
 * conversation until changed). The active context drives connector scopes, the
 * prompt knowledge injected per connector, and the working-dir hint.
 */

/** Sentinel context id for workspace-wide connector knowledge (no active context). */
export const WORKSPACE_KNOWLEDGE_CONTEXT_ID = '__workspace__'

export interface ProjectContext {
  id: string
  name: string
  /** Optional working subdirectory relative to the workspace root. */
  folder?: string
  /** Per-connector configuration keyed by connector id, validated by contextSchema. */
  connectorScopes: Record<string, Record<string, unknown>>
}
