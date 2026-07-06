import { useEffect, useMemo, useState } from 'react'

import { useElectron } from '../../hooks/useElectron'
import { useActionFeedback } from '../../hooks/useActionFeedback'
import { ConnectorAuthField, ConnectorManifest, ConnectorPermissions } from '../../connectors/contract'
import { INTEGRATION_TYPE_LABELS } from '../../connectors/catalog'
import { Alert, Button, ConfirmModal, Field, Input, Panel, SectionHeader } from '../ui'
import { ApiConnectionModule, McpConnectionModule, OAuthConnectionModule } from './ConnectorSettingsModules'
import { ConnectorPageHeader } from './ConnectorPageHeader'

interface GenericConnectorSettingsViewProps {
  manifest: ConnectorManifest
  onBack: () => void
  onConnectionChange?: (connected: boolean) => void
}

function describePermissions(permissions: ConnectorPermissions): string {
  const parts: string[] = []
  if (permissions.http?.length) parts.push(`HTTP (${permissions.http.length} hosts)`)
  if (permissions.mcp?.length) parts.push(`MCP (${permissions.mcp.join(', ')})`)
  if (permissions.cli?.length) parts.push(`CLI (${permissions.cli.length})`)
  if (permissions.file?.read || permissions.file?.write) {
    parts.push(`File ${[permissions.file?.read && 'read', permissions.file?.write && 'write'].filter(Boolean).join('/')}`)
  }
  if (permissions.secrets?.length) parts.push(`Secrets (${permissions.secrets.length})`)
  if (permissions.host?.length) parts.push(`Host (${permissions.host.join(', ')})`)
  return parts.length ? parts.join(' · ') : 'None declared'
}

function connectorSecretKey(connectorId: string, fieldKey: string): string {
  return `connector:${connectorId}:${fieldKey}`
}

function oauthClientKey(serviceId: string): string {
  return `connector:${serviceId}:client`
}

interface OAuthClientCredentials {
  clientId?: string
  clientSecret?: string
}

type OAuthServiceApi = {
  connect: (options?: { forceReauth?: boolean }) => Promise<{ success: boolean; error?: string }>
  disconnect: () => Promise<unknown>
  status: () => Promise<{ connected: boolean }>
  getConnectionState: () => Promise<{ state: string; connected: boolean }>
  getRedirectUri: () => Promise<string>
  onConnectionStateChange: (callback: (state: { state: string; error?: string }) => void) => (() => void)
}

export function GenericConnectorSettingsView({
  manifest,
  onBack,
  onConnectionChange,
}: GenericConnectorSettingsViewProps) {
  const { storage, mcp, linear, google, connectors } = useElectron()
  const saveFeedback = useActionFeedback()
  const authFields = manifest.auth?.fields ?? []
  const secretFields = authFields.filter(field => field.secret !== false)
  const requiredFields = authFields.filter(field => !field.optional)

  const [form, setForm] = useState<Record<string, string>>({})
  const [configured, setConfigured] = useState(false)
  const [mcpConnected, setMcpConnected] = useState(false)
  const [mcpConnecting, setMcpConnecting] = useState(false)
  const [mcpError, setMcpError] = useState<string | null>(null)
  const [oauthConnected, setOauthConnected] = useState(false)
  const [oauthConnecting, setOauthConnecting] = useState(false)
  const [oauthError, setOauthError] = useState<string | null>(null)
  const [oauthRedirectUri, setOauthRedirectUri] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [showRemoveModal, setShowRemoveModal] = useState(false)

  const integrationLabel = manifest.integrationType
    ? INTEGRATION_TYPE_LABELS[manifest.integrationType]
    : null

  const needsMcp = (manifest.permissions?.mcp?.length ?? 0) > 0
  const isOAuth = manifest.auth?.type === 'oauth'
  const optionalSecrets = manifest.auth?.type === 'oauth-with-rest-token'
  const restApiTitle = optionalSecrets ? `${manifest.name} REST API` : isOAuth ? 'OAuth app credentials' : 'Connection'

  const oauthServiceId = useMemo(() => {
    const host = manifest.permissions?.host?.find(h => h.endsWith('.api'))
    return host ? host.split('.')[0] : null
  }, [manifest.permissions?.host])

  const oauth: OAuthServiceApi | null = useMemo(() => {
    if (oauthServiceId === 'google') return google
    if (oauthServiceId === 'linear') return linear
    return null
  }, [oauthServiceId, google, linear])

  useEffect(() => {
    if (!oauth) {
      setOauthRedirectUri(null)
      return
    }
    let active = true
    oauth.getRedirectUri().then(uri => {
      if (active) setOauthRedirectUri(uri)
    })
    return () => {
      active = false
    }
  }, [oauth])

  const refreshConfigured = async () => {
    try {
      const nextForm: Record<string, string> = {}

      if (isOAuth && oauthServiceId) {
        const clientRaw = await storage.getSecure(oauthClientKey(oauthServiceId))
        const client = clientRaw ? (JSON.parse(clientRaw) as OAuthClientCredentials) : {}
        for (const field of authFields) {
          const value = client[field.key as keyof OAuthClientCredentials] || ''
          nextForm[field.key] = field.secret !== false && value ? '••••••••' : value
        }
      } else {
        for (const field of authFields) {
          const stored = await storage.getSecure(connectorSecretKey(manifest.id, field.key))
          nextForm[field.key] = field.secret !== false && stored ? '••••••••' : (stored || '')
        }
      }
      if (authFields.length > 0) {
        setForm(nextForm)
      }

      if (needsMcp) {
        const [status, connectionState] = await Promise.all([mcp.status(), mcp.getConnectionState()])
        const connected = status.connected || connectionState.connected
        setMcpConnected(connected)
        setConfigured(connected)
        onConnectionChange?.(connected)
        return
      }

      if (isOAuth && oauth) {
        const status = await oauth.status()
        setOauthConnected(status.connected)
        setConfigured(status.connected)
        onConnectionChange?.(status.connected)
        return
      }

      if (requiredFields.length > 0 && !optionalSecrets) {
        const allSet = requiredFields.every(field => {
          const value = nextForm[field.key]
          return !!value?.trim() && value !== '••••••••'
        })
        setConfigured(allSet)
        onConnectionChange?.(allSet)
        return
      }

      setConfigured(true)
      onConnectionChange?.(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load connector settings')
    }
  }

  useEffect(() => {
    void refreshConfigured()
  }, [manifest.id])

  useEffect(() => {
    const cleanupMcp = mcp.onConnectionStateChange(state => {
      const connected = state.state === 'connected'
      setMcpConnected(connected)
      if (needsMcp) {
        setConfigured(connected)
        onConnectionChange?.(connected)
      }
    })

    const cleanupOauth = oauth?.onConnectionStateChange(state => {
      const connected = state.state === 'connected'
      setOauthConnected(connected)
      if (isOAuth) {
        setConfigured(connected)
        onConnectionChange?.(connected)
      }
    })

    return () => {
      cleanupMcp()
      cleanupOauth?.()
    }
  }, [oauth, isOAuth, needsMcp, onConnectionChange])

  const restCredentialsSaved = useMemo(
    () => authFields.some(field => !!form[field.key]?.trim()),
    [authFields, form],
  )

  const saveDisabled = useMemo(() => {
    if (authFields.length === 0) return true
    if (optionalSecrets) return false
    return requiredFields.some(field => !form[field.key]?.trim() || form[field.key] === '••••••••')
  }, [authFields.length, form, optionalSecrets, requiredFields])

  const oAuthCredentialsSaved = useMemo(
    () => authFields.some(field => field.key === 'clientId' && !!form[field.key]?.trim()),
    [authFields, form],
  )

  async function handleSave() {
    await saveFeedback.run(async () => {
      if (isOAuth && oauthServiceId) {
        const existingRaw = await storage.getSecure(oauthClientKey(oauthServiceId))
        const existing = existingRaw ? (JSON.parse(existingRaw) as OAuthClientCredentials) : {}
        const client: OAuthClientCredentials = { ...existing }
        for (const field of authFields) {
          const value = form[field.key]?.trim()
          if (!value) {
            if (field.optional) {
              delete client[field.key as keyof OAuthClientCredentials]
              continue
            }
            throw new Error('Missing credential')
          }
          if (value === '••••••••') {
            if (!field.optional && !existing[field.key as keyof OAuthClientCredentials]?.trim()) {
              throw new Error('Missing credential')
            }
            continue
          }
          client[field.key as keyof OAuthClientCredentials] = value
        }
        await storage.setSecure(oauthClientKey(oauthServiceId), JSON.stringify(client))
      } else {
        for (const field of authFields) {
          const value = form[field.key]?.trim()
          if (!value) {
            if (optionalSecrets || field.optional) continue
            throw new Error('Missing credential')
          }
          if (value === '••••••••') {
            continue
          }
          await storage.setSecure(connectorSecretKey(manifest.id, field.key), value)
        }
      }
      await refreshConfigured()
    })
  }

  async function handleMcpConnect(forceReauth = false) {
    setMcpConnecting(true)
    setMcpError(null)
    try {
      const result = await mcp.connect(forceReauth ? { forceReauth: true } : undefined)
      if (!result.success) throw new Error(result.error || 'MCP connection failed')
      await refreshConfigured()
    } catch (err) {
      setMcpError(err instanceof Error ? err.message : 'MCP connection failed')
    } finally {
      setMcpConnecting(false)
    }
  }

  async function handleMcpDisconnect() {
    setMcpConnecting(true)
    setMcpError(null)
    try {
      await mcp.disconnect()
      setMcpConnected(false)
      if (needsMcp && secretFields.length === 0) {
        setConfigured(false)
        onConnectionChange?.(false)
      }
    } catch (err) {
      setMcpError(err instanceof Error ? err.message : 'Failed to disconnect MCP')
    } finally {
      setMcpConnecting(false)
    }
  }

  async function handleOAuthConnect(forceReauth = false) {
    if (!oauth) return
    setOauthConnecting(true)
    setOauthError(null)
    try {
      const result = await oauth.connect(forceReauth ? { forceReauth: true } : undefined)
      if (!result.success) throw new Error(result.error || `${manifest.name} OAuth failed`)
      await refreshConfigured()
    } catch (err) {
      setOauthError(err instanceof Error ? err.message : `${manifest.name} OAuth failed`)
    } finally {
      setOauthConnecting(false)
    }
  }

  async function handleOAuthDisconnect() {
    if (!oauth) return
    setOauthConnecting(true)
    setOauthError(null)
    try {
      await oauth.disconnect()
      setOauthConnected(false)
      if (isOAuth) {
        setConfigured(false)
        onConnectionChange?.(false)
      }
    } catch (err) {
      setOauthError(err instanceof Error ? err.message : `Failed to disconnect ${manifest.name}`)
    } finally {
      setOauthConnecting(false)
    }
  }

  async function handleRemove() {
    if (isOAuth && oauthServiceId) {
      await storage.setSecure(oauthClientKey(oauthServiceId), '')
    } else {
      for (const field of authFields) {
        await storage.setSecure(connectorSecretKey(manifest.id, field.key), '')
      }
    }
    setForm(Object.fromEntries(authFields.map(field => [field.key, ''])))
    if (isOAuth) {
      await handleOAuthDisconnect()
    }
    if (!needsMcp) {
      setConfigured(false)
      onConnectionChange?.(false)
    }
  }

  async function handleDeleteConnector() {
    setDeleting(true)
    setError(null)
    try {
      const result = await connectors.deletePackage(manifest.id)
      if (!result.success) throw new Error(result.error || 'Delete failed')
      setShowRemoveModal(false)
      onBack()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete connector')
    } finally {
      setDeleting(false)
    }
  }

  function updateField(field: ConnectorAuthField, value: string) {
    setForm(prev => ({ ...prev, [field.key]: value }))
  }

  const oAuthRedirectUri = oauthRedirectUri || ''

  return (
    <div className="ui-page-frame">
      <div className="content-shell page-shell space-y-6">
        <ConnectorPageHeader
          name={manifest.name}
          description={manifest.description}
          integrationLabel={integrationLabel}
          configured={configured}
          version={manifest.version}
          apiVersion={manifest.apiVersion}
          onBack={onBack}
        />

        {error && <Alert>{error}</Alert>}

        {needsMcp && (
          <McpConnectionModule
            title="MCP connection"
            description={`Required servers: ${manifest.permissions?.mcp?.join(', ')}. Tool calls are brokered through the connector sandbox.`}
            connected={mcpConnected}
            connecting={mcpConnecting}
            onConnect={() => void handleMcpConnect(mcpConnected)}
            onDisconnect={mcpConnected ? () => void handleMcpDisconnect() : undefined}
            connectLabel="Connect MCP"
            reconnectLabel="Reconnect MCP"
            error={mcpError}
          />
        )}

        {authFields.length > 0 && (
          <ApiConnectionModule
            title={restApiTitle}
            description={
              optionalSecrets
                ? `Optional REST credentials for ${manifest.name} attachments. MCP handles reads and writes.`
                : isOAuth
                  ? `Client credentials from your ${manifest.name} OAuth app. Redirect URI must be ${oAuthRedirectUri}.`
                  : `Credentials for ${manifest.name}. Stored encrypted on this device.`
            }
            configured={optionalSecrets ? restCredentialsSaved : isOAuth ? oAuthCredentialsSaved : configured}
            saving={saveFeedback.busy}
            saveDisabled={saveDisabled}
            saveStatus={saveFeedback.status}
            onSave={() => void handleSave()}
            onRemove={
              (optionalSecrets ? restCredentialsSaved : isOAuth ? oAuthCredentialsSaved : configured)
                ? () => void handleRemove()
                : undefined
            }
          >
            {authFields.map(field => (
              <Field key={field.key} label={field.label}>
                <Input
                  type={field.secret !== false ? 'password' : 'text'}
                  value={form[field.key] ?? ''}
                  onChange={event => updateField(field, event.target.value)}
                  autoComplete="off"
                />
              </Field>
            ))}
          </ApiConnectionModule>
        )}

        {isOAuth && oauth && (
          <OAuthConnectionModule
            title={`${manifest.name} OAuth`}
            description={`Authorize smile:D to access your ${manifest.name} account.`}
            connected={oauthConnected}
            connecting={oauthConnecting}
            onConnect={() => void handleOAuthConnect(oauthConnected)}
            onDisconnect={oauthConnected ? () => void handleOAuthDisconnect() : undefined}
            connectLabel={`Connect ${manifest.name}`}
            reconnectLabel={`Reconnect ${manifest.name}`}
            error={oauthError}
          />
        )}

        <Panel variant="soft">
          <SectionHeader title="Tools" description="Actions exposed to the agent." />
          <ul className="space-y-2">
            {manifest.tools.map(tool => (
              <li key={tool.name} className="connector-tool-item">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="ui-text-strong">{tool.name}</span>
                  <span className="ui-text-meta">{tool.category}</span>
                </div>
                <p className="mt-1 ui-type-ui">{tool.description}</p>
              </li>
            ))}
          </ul>
        </Panel>

        {manifest.permissions && (
          <Panel variant="soft">
            <SectionHeader title="Permissions" description="Capabilities declared in the manifest." />
            <p className="ui-type-ui">{describePermissions(manifest.permissions)}</p>
          </Panel>
        )}

        <Panel variant="soft">
          <SectionHeader title="Developer docs" description="This connector is a code package in your workspace." />
          <p className="ui-type-ui">
            Source files live in <code className="ui-inline-code">.smile/connectors/{manifest.id}/</code> (manifest.json, prompt.md, handler.js).
            To author or update connectors, follow <code className="ui-inline-code">docs/creating-a-connector.md</code> in the smile repository
            and validate with <code className="ui-inline-code">npm run validate:connector</code> / <code className="ui-inline-code">npm run test:connector</code>.
          </p>
        </Panel>

        <Panel variant="danger">
          <SectionHeader
            title="Remove"
            description="Delete this connector package from the workspace. This cannot be undone."
          />
          <Button
            variant="danger"
            size="sm"
            className="w-fit"
            disabled={deleting}
            onClick={() => setShowRemoveModal(true)}
          >
            {deleting ? 'Removing…' : 'Remove connector'}
          </Button>
        </Panel>
      </div>

      {showRemoveModal && (
        <ConfirmModal
          title="Remove connector"
          description={`Remove "${manifest.name}" from this workspace? Its package folder and local settings will be deleted.`}
          confirmLabel="Remove"
          cancelLabel="Cancel"
          confirmVariant="danger"
          onCancel={() => setShowRemoveModal(false)}
          onConfirm={() => void handleDeleteConnector()}
        />
      )}
    </div>
  )
}
