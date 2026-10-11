import { useCallback, useEffect, useMemo, useState } from 'react'

import { useElectron } from '../../hooks/useElectron'
import { useActionFeedback } from '../../hooks/useActionFeedback'
import { ConnectorManifest } from '../../connectors/contract'
import { INTEGRATION_TYPE_LABELS } from '../../connectors/catalog'
import { Alert, Button, Field, Input, Panel, SectionHeader, Select } from '../ui'
import { ApiConnectionModule } from './ConnectorSettingsModules'
import { ConnectorPageHeader } from './ConnectorPageHeader'

interface ImageGenerationSettingsViewProps {
  manifest: ConnectorManifest
  onBack: () => void
  onConnectionChange?: (connected: boolean) => void
}

const PROVIDER_OPTIONS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'replicate', label: 'Replicate' },
  { value: 'qwen', label: 'Qwen / QwenCloud' },
]

function connectorSecretKey(connectorId: string, fieldKey: string): string {
  return `connector:${connectorId}:${fieldKey}`
}

const MASK = '••••••••'

interface ModelOption {
  id: string
  name: string
}

export function ImageGenerationSettingsView({
  manifest,
  onBack,
  onConnectionChange,
}: ImageGenerationSettingsViewProps) {
  const { storage, connectors } = useElectron()
  const saveFeedback = useActionFeedback()
  const integrationLabel = manifest.integrationType
    ? INTEGRATION_TYPE_LABELS[manifest.integrationType]
    : null

  const [provider, setProvider] = useState('')
  const [model, setModel] = useState('')
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [savedApiKey, setSavedApiKey] = useState('')
  const [apiKeyMasked, setApiKeyMasked] = useState(false)

  const [models, setModels] = useState<ModelOption[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)

  const effectiveApiKey = apiKeyMasked ? savedApiKey : apiKeyInput.trim()

  const configured = useMemo(
    () => !!(provider.trim() && model.trim() && effectiveApiKey),
    [provider, model, effectiveApiKey],
  )

  const loadSettings = useCallback(async () => {
    const [savedProvider, savedModel, storedApiKey] = await Promise.all([
      storage.getSecure(connectorSecretKey(manifest.id, 'provider')),
      storage.getSecure(connectorSecretKey(manifest.id, 'model')),
      storage.getSecure(connectorSecretKey(manifest.id, 'apiKey')),
    ])
    if (savedProvider) setProvider(savedProvider)
    if (savedModel) setModel(savedModel)
    if (storedApiKey) {
      setSavedApiKey(storedApiKey)
      setApiKeyInput(MASK)
      setApiKeyMasked(true)
    } else {
      setSavedApiKey('')
      setApiKeyInput('')
      setApiKeyMasked(false)
    }
  }, [manifest.id, storage])

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  useEffect(() => {
    onConnectionChange?.(configured)
  }, [configured, onConnectionChange])

  const fetchModels = useCallback(async () => {
    if (!provider || !effectiveApiKey) {
      setModelsError('Select a provider and enter an API key first.')
      return
    }
    setLoadingModels(true)
    setModelsError(null)
    try {
      const result = await connectors.execute('image-generation', 'image_generation_list_models', {
        provider,
        apiKey: effectiveApiKey,
      })
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch models')
      }
      const data = result.data as { models?: ModelOption[] } | undefined
      const fetched = data?.models ?? []
      setModels(fetched)
      // Preserve the previously selected/saved model if it is still available.
      // Otherwise default to the first model returned by the provider.
      if (fetched.length > 0) {
        const savedModelStillAvailable = model && fetched.some(m => m.id === model)
        if (!savedModelStillAvailable) {
          setModel(fetched[0].id)
        }
      }
    } catch (err) {
      setModelsError(err instanceof Error ? err.message : 'Failed to fetch models')
      setModels([])
    } finally {
      setLoadingModels(false)
    }
  }, [provider, effectiveApiKey, model, connectors])

  // Auto-fetch models when provider or effective API key changes and both are present.
  useEffect(() => {
    if (provider && effectiveApiKey) {
      const timer = setTimeout(() => void fetchModels(), 300)
      return () => clearTimeout(timer)
    }
  }, [provider, effectiveApiKey, fetchModels])

  async function handleSave() {
    await saveFeedback.run(async () => {
      if (!provider.trim()) throw new Error('Provider is required')
      if (!model.trim()) throw new Error('Model is required')
      if (!effectiveApiKey) throw new Error('API key is required')

      await storage.setSecure(connectorSecretKey(manifest.id, 'provider'), provider.trim())
      await storage.setSecure(connectorSecretKey(manifest.id, 'model'), model.trim())
      if (!apiKeyMasked && apiKeyInput.trim()) {
        await storage.setSecure(connectorSecretKey(manifest.id, 'apiKey'), apiKeyInput.trim())
        setSavedApiKey(apiKeyInput.trim())
        setApiKeyInput(MASK)
        setApiKeyMasked(true)
      }
    })
  }

  async function handleRemove() {
    await Promise.all([
      storage.setSecure(connectorSecretKey(manifest.id, 'provider'), ''),
      storage.setSecure(connectorSecretKey(manifest.id, 'model'), ''),
      storage.setSecure(connectorSecretKey(manifest.id, 'apiKey'), ''),
    ])
    setProvider('')
    setModel('')
    setApiKeyInput('')
    setSavedApiKey('')
    setApiKeyMasked(false)
    setModels([])
  }

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

        <ApiConnectionModule
          title="Connection"
          description={`Credentials for ${manifest.name}. Models are fetched live from the provider. Stored encrypted on this device.`}
          configured={configured}
          saving={saveFeedback.busy}
          saveDisabled={!provider || !model}
          saveStatus={saveFeedback.status}
          onSave={() => void handleSave()}
          onRemove={configured ? () => void handleRemove() : undefined}
        >
          <Field label="Provider">
            <Select
              value={provider}
              onChange={event => {
                setProvider(event.target.value)
                setModel('')
                setModels([])
              }}
            >
              <option value="">Select…</option>
              {PROVIDER_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="API key">
            <Input
              type="password"
              value={apiKeyInput}
              onChange={event => {
                if (apiKeyMasked) {
                  setApiKeyInput(event.target.value.replace(MASK, ''))
                  setApiKeyMasked(false)
                } else {
                  setApiKeyInput(event.target.value)
                }
              }}
              autoComplete="off"
              placeholder="Enter API key"
            />
          </Field>

          {modelsError && <Alert>{modelsError}</Alert>}

          <Field label="Model">
            <Select
              value={model}
              onChange={event => setModel(event.target.value)}
              disabled={models.length === 0 || loadingModels}
            >
              <option value="">
                {loadingModels ? 'Loading models…' : models.length === 0 ? 'Enter API key to load models' : 'Select…'}
              </option>
              {models.map(option => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </Select>
          </Field>

          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={!provider || !effectiveApiKey || loadingModels}
              onClick={() => void fetchModels()}
            >
              {loadingModels ? 'Loading…' : 'Refresh models'}
            </Button>
          </div>
        </ApiConnectionModule>

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
      </div>
    </div>
  )
}

function describePermissions(permissions: ConnectorManifest['permissions']): string {
  if (!permissions) return 'None declared'
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
