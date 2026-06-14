import fs from 'fs'
import path from 'path'

import { validateManifest } from '../../../src/connectors/contract/validate'
import type { ConnectorManifest } from '../../../src/connectors/contract/manifest'

export interface ConnectorPackageValidation {
  ok: boolean
  id?: string
  manifest?: ConnectorManifest
  errors: string[]
  warnings: string[]
}

/** Validate a connector package directory (manifest + required files). */
export function validateConnectorPackage(connectorDir: string): ConnectorPackageValidation {
  const errors: string[] = []
  const warnings: string[] = []
  const resolved = path.resolve(connectorDir)

  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    return { ok: false, errors: [`Not a directory: ${resolved}`], warnings }
  }

  const manifestPath = path.join(resolved, 'manifest.json')
  if (!fs.existsSync(manifestPath)) {
    return { ok: false, errors: ['manifest.json not found'], warnings }
  }

  let raw: unknown
  try {
    raw = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
  } catch (error) {
    return {
      ok: false,
      errors: [`manifest.json is invalid JSON: ${error instanceof Error ? error.message : String(error)}`],
      warnings,
    }
  }

  const validation = validateManifest(raw)
  if (!validation.ok) {
    return { ok: false, errors: validation.errors, warnings }
  }

  const manifest = validation.manifest
  const handlerKind = manifest.handlerKind ?? 'code'

  if (handlerKind === 'code' && !fs.existsSync(path.join(resolved, 'handler.js'))) {
    errors.push('handler.js is required when handlerKind is "code" (default)')
  }

  if (handlerKind === 'mcp') {
    for (const tool of manifest.tools) {
      if (!tool.mcp?.serverId || !tool.mcp?.toolName) {
        errors.push(`tool "${tool.name}" is missing mcp.serverId or mcp.toolName`)
      }
    }
  }

  if (!fs.existsSync(path.join(resolved, 'prompt.md'))) {
    warnings.push('prompt.md is missing (recommended for agent prompt injection)')
  }

  if (manifest.id !== path.basename(resolved)) {
    warnings.push(
      `Folder name "${path.basename(resolved)}" differs from manifest id "${manifest.id}" (host uses manifest id)`,
    )
  }

  return {
    ok: errors.length === 0,
    id: manifest.id,
    manifest,
    errors,
    warnings,
  }
}
