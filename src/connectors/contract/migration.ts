import { ConnectorManifest } from './manifest'
import { HostBridge } from './host'
import { ApiVersion, CURRENT_API_VERSION, parseApiVersion } from './version'

/**
 * Migration shims for the strict compatibility policy: when the host bumps the
 * contract major, a connector built against an older major MUST keep working via
 * an automatic shim, never a re-fork.
 *
 * A migration adapts both directions of the boundary:
 * - `migrateManifest`: normalize an old manifest to the current shape.
 * - `wrapHost`: present the host bridge in the shape the older handler expects.
 *
 * Migrations are registered per source major and composed in order up to the
 * current version. This module ships empty until the first breaking change.
 */
export interface ContractMigration {
  /** Source contract major this migration upgrades FROM. */
  fromMajor: number
  /** Target contract major this migration upgrades TO. */
  toMajor: number
  migrateManifest?(manifest: ConnectorManifest): ConnectorManifest
  wrapHost?(host: HostBridge): HostBridge
}

/** Ordered registry of known migrations. Empty at apiVersion 1.0. */
export const contractMigrations: ContractMigration[] = []

/**
 * Resolve the chain of migrations needed to bring a manifest's apiVersion up to
 * the host's current version. Returns null if unsupported (newer major than host).
 */
export function resolveMigrations(
  manifestVersion: ApiVersion,
  hostVersion: ApiVersion = CURRENT_API_VERSION,
): ContractMigration[] | null {
  const manifest = parseApiVersion(manifestVersion)
  const host = parseApiVersion(hostVersion)
  if (!manifest || !host) return null
  if (manifest.major > host.major) return null

  const chain: ContractMigration[] = []
  let current = manifest.major
  while (current < host.major) {
    const step = contractMigrations.find(migration => migration.fromMajor === current)
    if (!step) return null
    chain.push(step)
    current = step.toMajor
  }
  return chain
}

export function applyManifestMigrations(
  manifest: ConnectorManifest,
  chain: ContractMigration[],
): ConnectorManifest {
  return chain.reduce(
    (acc, migration) => (migration.migrateManifest ? migration.migrateManifest(acc) : acc),
    manifest,
  )
}

export function applyHostMigrations(host: HostBridge, chain: ContractMigration[]): HostBridge {
  return chain.reduce(
    (acc, migration) => (migration.wrapHost ? migration.wrapHost(acc) : acc),
    host,
  )
}
