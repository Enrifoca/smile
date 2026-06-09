import type { ComponentType } from 'react'

import { ConnectorManifest } from '../../connectors/contract'

export function GenericConnectorIcon({ label }: { label: string }) {
  const letter = label.trim().charAt(0).toUpperCase() || '?'
  return (
    <div
      className="connector-card-icon flex items-center justify-center rounded-md bg-neutral-100 text-sm font-medium text-neutral-700"
      aria-hidden="true"
    >
      {letter}
    </div>
  )
}

export function createWorkspaceIconComponent(manifest: ConnectorManifest): ComponentType {
  const label = manifest.name || manifest.id
  return function WorkspaceConnectorIcon() {
    return <GenericConnectorIcon label={label} />
  }
}
