import { validateManifest } from './validate'
import { CURRENT_API_VERSION, isApiVersionSupported } from './version'
import { resolveMigrations } from './migration'
import { normalizeMcpResult } from './mcpNormalize'
import exampleManifest from './__fixtures__/example.manifest.json'

/**
 * Framework-agnostic contract checks. Runs reference fixtures against the current
 * host contract so a future change that would break existing connectors is caught.
 *
 * Intentionally free of any test framework: returns a structured result that can
 * be asserted by whatever runner we adopt, or invoked directly.
 */

export interface ContractCheckResult {
  passed: boolean
  failures: string[]
}

export function runContractChecks(): ContractCheckResult {
  const failures: string[] = []

  const validation = validateManifest(exampleManifest)
  if (!validation.ok) {
    failures.push(`reference manifest failed validation: ${validation.errors.join('; ')}`)
  }

  if (!isApiVersionSupported(exampleManifest.apiVersion)) {
    failures.push(`reference apiVersion ${exampleManifest.apiVersion} not supported by host ${CURRENT_API_VERSION}`)
  }

  const migrations = resolveMigrations(exampleManifest.apiVersion)
  if (migrations === null) {
    failures.push(`no migration path for apiVersion ${exampleManifest.apiVersion}`)
  }

  const structured = normalizeMcpResult({
    structuredContent: { ok: true },
    content: [{ type: 'text', text: '{"ok":true}' }],
  })
  if (!structured.success || structured.data === undefined) {
    failures.push('normalizeMcpResult failed on structuredContent sample')
  }

  return { passed: failures.length === 0, failures }
}
