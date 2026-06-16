import { ReactNode } from 'react'
import {
  ActionRow,
  Alert,
  Badge,
  Button,
  Panel,
  SectionHeader,
  type ActionStatus,
} from '../ui'

interface ApiConnectionModuleProps {
  title: string
  description: string
  configured: boolean
  saving: boolean
  saveDisabled: boolean
  saveStatus: ActionStatus
  onSave: () => void
  onRemove?: () => void
  children: ReactNode
  saveLabel?: string
  removeLabel?: string
  configuredLabel?: string
  successMessage?: string
  errorMessage?: string
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
  saveLabel = 'Save',
  removeLabel = 'Clear',
  configuredLabel = 'Configured',
  successMessage = 'Saved',
  errorMessage = 'Check all fields',
}: ApiConnectionModuleProps) {
  return (
    <Panel variant="soft">
      <SectionHeader
        title={title}
        description={description}
        aside={configured ? <Badge tone="success">{configuredLabel}</Badge> : undefined}
      />
      <div className="space-y-4">
        {children}

        <ActionRow
          label={saveLabel}
          busy={saving}
          status={saveStatus}
          disabled={saveDisabled}
          onAction={onSave}
          size="sm"
          successMessage={successMessage}
          errorMessage={errorMessage}
          extraActions={configured && onRemove ? (
            <Button variant="secondary" size="sm" onClick={onRemove}>
              {removeLabel}
            </Button>
          ) : undefined}
        />
      </div>
    </Panel>
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
  error?: string | null
  connectingLabel?: string
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
  error = null,
  connectingLabel = 'Connecting...',
}: McpConnectionModuleProps) {
  return (
    <Panel variant="soft">
      <SectionHeader
        title={title}
        description={description}
        aside={connected ? <Badge tone="success">Connected</Badge> : undefined}
      />
      <div className="ui-action-row">
        <Button
          variant="primary"
          size="sm"
          loading={connecting}
          loadingLabel={connectingLabel}
          onClick={onConnect}
        >
          {connected ? reconnectLabel : connectLabel}
        </Button>
        {connected && onDisconnect && (
          <Button variant="secondary" size="sm" onClick={onDisconnect}>
            {disconnectLabel}
          </Button>
        )}
      </div>
      {error && <Alert className="mt-4">{error}</Alert>}
    </Panel>
  )
}
