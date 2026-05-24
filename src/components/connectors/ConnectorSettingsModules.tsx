import { ReactNode } from 'react'
import {
  ActionRow,
  Alert,
  Badge,
  Button,
  ModuleSection,
  PanelBody,
  type ActionStatus,
} from '../ui'

export type { ActionStatus as SaveStatus }

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
  saveLabel = 'Save API connection',
  removeLabel = 'Remove',
  configuredLabel = 'Configured',
  successMessage = 'Saved',
  errorMessage = 'Check all fields',
}: ApiConnectionModuleProps) {
  return (
    <ModuleSection
      title={title}
      description={description}
      aside={configured ? <Badge>{configuredLabel}</Badge> : undefined}
    >
      <PanelBody variant="emphasis" className="space-y-4">
        {children}

        <ActionRow
          label={saveLabel}
          busy={saving}
          status={saveStatus}
          disabled={saveDisabled}
          onAction={onSave}
          successMessage={successMessage}
          errorMessage={errorMessage}
          extraActions={configured && onRemove ? (
            <Button variant="outline" size="md" onClick={onRemove}>
              {removeLabel}
            </Button>
          ) : undefined}
        />
      </PanelBody>
    </ModuleSection>
  )
}

interface CustomSettingsModuleProps {
  title: string
  description: string
  children: ReactNode
  action?: ReactNode
  save?: {
    label: string
    saving: boolean
    saveStatus: ActionStatus
    saveDisabled?: boolean
    onSave: () => void
    successMessage?: string
    errorMessage?: string
  }
  footer?: ReactNode
}

export function CustomSettingsModule({
  title,
  description,
  children,
  action,
  save,
  footer,
}: CustomSettingsModuleProps) {
  return (
    <ModuleSection title={title} description={description} aside={action}>
      <PanelBody variant="emphasisCompact">{children}</PanelBody>
      {save ? (
        <ActionRow
          label={save.label}
          busy={save.saving}
          status={save.saveStatus}
          disabled={save.saveDisabled}
          onAction={save.onSave}
          successMessage={save.successMessage}
          errorMessage={save.errorMessage}
        />
      ) : footer ? (
        <div className="ui-action-row">{footer}</div>
      ) : null}
    </ModuleSection>
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
    <ModuleSection
      title={title}
      description={description}
      aside={connected ? <Badge tone="success">Connected</Badge> : undefined}
    >
      <div className="ui-action-row">
        <Button
          variant="primary"
          size="lg"
          loading={connecting}
          loadingLabel={connectingLabel}
          onClick={onConnect}
        >
          {connected ? reconnectLabel : connectLabel}
        </Button>
        {connected && onDisconnect && (
          <Button variant="outline" size="lg" onClick={onDisconnect}>
            {disconnectLabel}
          </Button>
        )}
      </div>
      {error && <Alert>{error}</Alert>}
    </ModuleSection>
  )
}

/** @deprecated Use ModuleSection directly for new modules */
export const ConnectorSettingsModule = ModuleSection
