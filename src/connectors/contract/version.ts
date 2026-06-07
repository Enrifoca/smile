/**
 * Connector contract versioning.
 *
 * The connector contract (manifest shape + host API) is versioned with a
 * "major.minor" string. Policy (strict):
 * - Additive changes bump the minor and never break existing connectors.
 * - Breaking changes bump the major and MUST ship a migration shim
 *   (see `migration.ts`) so older connectors keep working without a re-fork.
 *
 * This module is intentionally free of any Electron/Node types so the contract
 * stays language/runtime neutral.
 */

/** Current connector contract version implemented by this host. */
export const CURRENT_API_VERSION = '1.0'

/** A "major.minor" contract version string, e.g. "1.0". */
export type ApiVersion = string

export interface ParsedApiVersion {
  major: number
  minor: number
}

export function parseApiVersion(version: ApiVersion): ParsedApiVersion | null {
  const match = /^(\d+)\.(\d+)$/.exec(version.trim())
  if (!match) return null
  return { major: Number(match[1]), minor: Number(match[2]) }
}

/**
 * Whether a connector declaring `manifestVersion` can run against `hostVersion`.
 * Same-or-older major is supported (older majors via migration shims); a newer
 * major than the host is not supported.
 */
export function isApiVersionSupported(
  manifestVersion: ApiVersion,
  hostVersion: ApiVersion = CURRENT_API_VERSION,
): boolean {
  const manifest = parseApiVersion(manifestVersion)
  const host = parseApiVersion(hostVersion)
  if (!manifest || !host) return false
  return manifest.major <= host.major
}
