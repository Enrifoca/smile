import fs from 'fs'
import path from 'path'

import type { ConnectorManifest } from '../../../src/connectors/contract/manifest'
import { validateConnectorPackage } from './validatePackage'

export interface LoadedConnectorPackage {
  dir: string
  manifest: ConnectorManifest
  promptMarkdown: string
  handlerSource?: string
}

/** Load and validate a connector package from disk. Throws if validation fails. */
export function loadConnectorPackage(connectorDir: string): LoadedConnectorPackage {
  const validation = validateConnectorPackage(connectorDir)
  if (!validation.ok || !validation.manifest) {
    throw new Error(validation.errors.join('; ') || 'Invalid connector package')
  }

  const dir = path.resolve(connectorDir)
  const handlerKind = validation.manifest.handlerKind ?? 'code'
  const promptPath = path.join(dir, 'prompt.md')

  return {
    dir,
    manifest: validation.manifest,
    promptMarkdown: fs.existsSync(promptPath) ? fs.readFileSync(promptPath, 'utf-8') : '',
    handlerSource:
      handlerKind === 'code' ? fs.readFileSync(path.join(dir, 'handler.js'), 'utf-8') : undefined,
  }
}
