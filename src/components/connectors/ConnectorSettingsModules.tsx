import { ReactNode } from 'react'

type SaveStatus = 'idle' | 'success' | 'error'

interface ConnectorSettingsModuleProps {
  title: string
  description: string
  aside?: ReactNode
  children: ReactNode
}

export function ConnectorSettingsModule({
  title,
  description,
  aside,
  children,
}: ConnectorSettingsModuleProps) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-medium text-neutral-950">{title}</h2>
          <p className="text-sm text-neutral-500">{description}</p>
        </div>
        {aside}
      </div>
      {children}
    </section>
  )
}

interface McpConnectionModuleProps {
  title: string
  description: string
  connected: boolean
  connecting: boolean
  onConnect: () => void
  onDisconnect?: () => void
  connectLabel?: string
  reconnectLabel?: string
  disconnectLabel?: string
}

export function McpConnectionModule({
  title,
  description,
  connected,
  connecting,
  onConnect,
  onDisconnect,
  connectLabel = 'Connect MCP',
  reconnectLabel = 'Reconnect MCP',
  disconnectLabel = 'Disconnect',
}: McpConnectionModuleProps) {
  return (
    <ConnectorSettingsModule
      title={title}
      description={description}
      aside={connected ? (
        <span className="rounded-full border border-neutral-950 px-3 py-1 text-xs font-medium">Connected</span>
      ) : undefined}
    >
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={onConnect}
          disabled={connecting}
          className="min-w-44 rounded-xl bg-neutral-950 px-6 py-3 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          {connecting ? 'Connecting...' : connected ? reconnectLabel : connectLabel}
        </button>
        {connected && onDisconnect && (
          <button
            onClick={onDisconnect}
            className="rounded-xl border-2 border-neutral-950 px-6 py-3 text-sm font-medium hover:bg-neutral-950 hover:text-white"
          >
            {disconnectLabel}
          </button>
        )}
      </div>
    </ConnectorSettingsModule>
  )
}

interface ApiConnectionModuleProps {
  title: string
  description: string
  configured: boolean
  saving: boolean
  saveDisabled: boolean
  saveStatus: SaveStatus
  onSave: () => void
  onRemove?: () => void
  children: ReactNode
  saveLabel?: string
  removeLabel?: string
  configuredLabel?: string
}

export function ApiConnectionModule({
  title,
  description,
  configured,
  saving,
  saveDisabled,
  saveStatus,
  onSave,
  onRemove,
  children,
  saveLabel = 'Save API connection',
  removeLabel = 'Remove',
  configuredLabel = 'Configured',
}: ApiConnectionModuleProps) {
  return (
    <ConnectorSettingsModule
      title={title}
      description={description}
      aside={configured ? (
        <span className="rounded-full border border-neutral-950 px-3 py-1 text-xs font-medium">{configuredLabel}</span>
      ) : undefined}
    >
      <div className="rounded-2xl border-2 border-neutral-950 p-5 space-y-4">
        {children}

        <div className="flex items-center gap-3">
          <button
            onClick={onSave}
            disabled={saving || saveDisabled}
            className="rounded-xl bg-neutral-950 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : saveLabel}
          </button>
          {configured && onRemove && (
            <button
              onClick={onRemove}
              className="rounded-xl border border-neutral-950 px-5 py-2.5 text-sm hover:bg-neutral-950 hover:text-white"
            >
              {removeLabel}
            </button>
          )}
          {saveStatus === 'success' && <span className="text-sm text-green-600">Saved</span>}
          {saveStatus === 'error' && <span className="text-sm text-red-600">Check all fields</span>}
        </div>
      </div>
    </ConnectorSettingsModule>
  )
}

interface CustomSettingsModuleProps {
  title: string
  description: string
  children: ReactNode
  /** Header action, e.g. Load or Refresh — rendered on the same row as the title. */
  action?: ReactNode
  /** Primary action below the settings panel, e.g. Save selection. */
  footer?: ReactNode
}

export function CustomSettingsModule({
  title,
  description,
  children,
  action,
  footer,
}: CustomSettingsModuleProps) {
  return (
    <ConnectorSettingsModule title={title} description={description} aside={action}>
      <div className="rounded-2xl border-2 border-neutral-950 p-3">
        {children}
      </div>
      {footer ? <div className="flex items-center gap-3 pt-1">{footer}</div> : null}
    </ConnectorSettingsModule>
  )
}
