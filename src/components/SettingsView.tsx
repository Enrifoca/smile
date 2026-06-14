import { useState, useEffect } from 'react'
import { useElectron } from '../hooks/useElectron'
import { useActionFeedback } from '../hooks/useActionFeedback'
import {
  ActionRow,
  Badge,
  Button,
  Callout,
  ConfirmModal,
  Field,
  Input,
  RangeSlider,
  Select,
  StatusText,
  Toggle,
} from './ui'
import { UserProfile } from '../agent/types'
import { normalizeUserProfile } from '../agent/communicationPreferences'
import { ModelRecommendationText } from '../settings/ModelRecommendationText'
import { useAppUpdates } from '../context/UpdateContext'
import {
  AIConfig,
  AIProvider,
  AI_PROVIDER_LABELS,
  CHAT_PROVIDERS,
  ModelCatalog,
  ModelProvider,
  ModelRole,
  OCRConfig,
  OCRProvider,
  OCR_PROVIDER_LABELS,
  OCR_PROVIDERS,
  REASONING_PROVIDERS,
  getBundledProviderRole,
} from '../shared/modelCatalog'

const FolderIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
  </svg>
)

const RefreshIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
)

type ClearTarget = 'general' | 'reasoning' | 'ocr' | null

export default function SettingsView() {
  const [aiConfig, setAIConfig] = useState<AIConfig | null>(null)
  const [workspace, setWorkspace] = useState<string | null>(null)
  const aiSave = useActionFeedback()

  const [maxIterations, setMaxIterations] = useState<number>(10)
  const maxIterSave = useActionFeedback()
  const [agentProfile, setAgentProfile] = useState<UserProfile>(() => normalizeUserProfile(null))
  const agentProfileSave = useActionFeedback({ resetMs: 2000 })

  const [reasoningForm, setReasoningForm] = useState({
    provider: 'anthropic' as AIProvider,
    apiKey: '',
    model: '',
    useSameKey: true,
  })
  const [reasoningConfigured, setReasoningConfigured] = useState(false)
  const reasoningSave = useActionFeedback()

  const [ocrForm, setOcrForm] = useState({
    provider: 'mistral' as OCRProvider,
    apiKey: '',
    model: '',
  })
  const [ocrConfigured, setOcrConfigured] = useState(false)
  const ocrSave = useActionFeedback()

  const [aiForm, setAIForm] = useState({
    provider: 'openai' as AIProvider,
    apiKey: '',
    model: '',
  })

  const [modelCatalog, setModelCatalog] = useState<ModelCatalog | null>(null)
  const [refreshingModels, setRefreshingModels] = useState(false)
  const [modelRefreshStatus, setModelRefreshStatus] = useState<'idle' | 'success' | 'error'>('idle')

  const [clearTarget, setClearTarget] = useState<ClearTarget>(null)
  const [showConnectorWarning, setShowConnectorWarning] = useState(false)
  const [keepRecentChats, setKeepRecentChats] = useState(5)
  const [showTrimHistoryModal, setShowTrimHistoryModal] = useState(false)
  const [showClearDataModal, setShowClearDataModal] = useState(false)
  const { state: updateState, appVersion, checkForUpdates } = useAppUpdates()
  const updateCheck = useActionFeedback()

  const { storage, models: modelCatalogAPI, file } = useElectron()
  const canUseSameReasoningKey = !!aiConfig && aiConfig.provider === reasoningForm.provider

  useEffect(() => {
    void loadSettings()
  }, [])

  const loadModelCatalog = async (refresh = false) => {
    setRefreshingModels(refresh)
    try {
      const result = refresh
        ? await modelCatalogAPI.refresh()
        : await modelCatalogAPI.getCatalog()

      if (result.success && result.data) {
        setModelCatalog(result.data)
        setModelRefreshStatus(refresh ? 'success' : 'idle')
        if (refresh) setTimeout(() => setModelRefreshStatus('idle'), 3000)
      } else if (refresh) {
        setModelRefreshStatus('error')
        setTimeout(() => setModelRefreshStatus('idle'), 3000)
      }
    } catch (error) {
      console.error('Failed to load model catalog:', error)
      if (refresh) {
        setModelRefreshStatus('error')
        setTimeout(() => setModelRefreshStatus('idle'), 3000)
      }
    } finally {
      setRefreshingModels(false)
    }
  }

  const loadSettings = async () => {
    try {
      await loadModelCatalog()

      const aiConfigStr = await storage.getSecure('aiConfig')
      if (aiConfigStr) {
        const config = JSON.parse(aiConfigStr) as AIConfig
        setAIConfig(config)
        setAIForm({
          provider: config.provider,
          apiKey: '••••••••',
          model: config.model || '',
        })
      }

      const workspacePath = await file.getWorkspace()
      setWorkspace(workspacePath)

      const savedMaxIter = await storage.get('agentMaxIterations') as number | null
      if (savedMaxIter !== null && savedMaxIter !== undefined) setMaxIterations(savedMaxIter)

      const savedProfile = await storage.get('userProfile') as Partial<UserProfile> | null
      setAgentProfile(normalizeUserProfile(savedProfile))

      const reasoningConfigStr = await storage.getSecure('reasoningConfig')
        || await storage.getSecure('plannerConfig')
      if (reasoningConfigStr) {
        const rc = JSON.parse(reasoningConfigStr)
        setReasoningConfigured(true)
        setReasoningForm({
          provider: rc.provider || 'anthropic',
          apiKey: '••••••••',
          model: rc.model || '',
          useSameKey: false,
        })
      }

      const ocrConfigStr = await storage.getSecure('ocrConfig')
      if (ocrConfigStr) {
        const oc = JSON.parse(ocrConfigStr) as OCRConfig
        setOcrConfigured(true)
        setOcrForm({
          provider: oc.provider || 'mistral',
          apiKey: '••••••••',
          model: oc.model || '',
        })
      }
    } catch (error) {
      console.error('Failed to load settings:', error)
    }
  }

  const saveAIConfig = () => {
    if (!aiForm.provider || !aiForm.apiKey) {
      aiSave.markError()
      return
    }
    void aiSave.run(async () => {
      const config: AIConfig = {
        provider: aiForm.provider,
        apiKey: aiForm.apiKey === '••••••••'
          ? aiConfig?.apiKey || ''
          : aiForm.apiKey,
        model: aiForm.model || undefined,
      }
      await storage.setSecure('aiConfig', JSON.stringify(config))
      setAIConfig(config)
      const catalogResult = await modelCatalogAPI.refreshProvider(config.provider)
      if (catalogResult.success && catalogResult.data) setModelCatalog(catalogResult.data)
    })
  }

  const saveReasoningConfig = () => {
    void reasoningSave.run(async () => {
      let apiKey = reasoningForm.apiKey
      if (canUseSameReasoningKey && reasoningForm.useSameKey) {
        const chatConfigStr = await storage.getSecure('aiConfig')
        if (chatConfigStr) apiKey = JSON.parse(chatConfigStr).apiKey
      } else if (apiKey === '••••••••') {
        const existing = await storage.getSecure('reasoningConfig')
          || await storage.getSecure('plannerConfig')
        if (existing) apiKey = JSON.parse(existing).apiKey
      }
      if (!apiKey) {
        reasoningSave.markError()
        throw new Error('Missing API key')
      }
      const config = { provider: reasoningForm.provider, apiKey, model: reasoningForm.model || undefined }
      await storage.setSecure('reasoningConfig', JSON.stringify(config))
      const catalogResult = await modelCatalogAPI.refreshProvider(config.provider)
      if (catalogResult.success && catalogResult.data) setModelCatalog(catalogResult.data)
      setReasoningConfigured(true)
    })
  }

  const saveOcrConfig = () => {
    void ocrSave.run(async () => {
      let apiKey = ocrForm.apiKey
      if (apiKey === '••••••••') {
        const existing = await storage.getSecure('ocrConfig')
        if (existing) apiKey = (JSON.parse(existing) as OCRConfig).apiKey
      }
      if (!apiKey) {
        ocrSave.markError()
        throw new Error('Missing API key')
      }
      const config: OCRConfig = {
        provider: ocrForm.provider,
        apiKey,
        model: ocrForm.model || undefined,
      }
      await storage.setSecure('ocrConfig', JSON.stringify(config))
      const catalogResult = await modelCatalogAPI.refreshProvider(config.provider)
      if (catalogResult.success && catalogResult.data) setModelCatalog(catalogResult.data)
      setOcrConfigured(true)
      setOcrForm(prev => ({ ...prev, apiKey: '••••••••' }))
    })
  }

  const clearModelConfig = async (target: ClearTarget) => {
    if (!target) return
    if (target === 'general') {
      await storage.setSecure('aiConfig', '')
      setAIConfig(null)
      setAIForm({ provider: 'openai', apiKey: '', model: '' })
    }
    if (target === 'reasoning') {
      await storage.setSecure('reasoningConfig', '')
      await storage.setSecure('plannerConfig', '')
      setReasoningConfigured(false)
      setReasoningForm({ provider: 'anthropic', apiKey: '', model: '', useSameKey: true })
    }
    if (target === 'ocr') {
      await storage.setSecure('ocrConfig', '')
      setOcrConfigured(false)
      setOcrForm({ provider: 'mistral', apiKey: '', model: '' })
    }
    setClearTarget(null)
  }

  const saveMaxIterations = (value: number) => {
    void maxIterSave.run(async () => {
      await storage.set('agentMaxIterations', value)
    })
  }

  const saveAgentProfile = async (nextProfile: UserProfile) => {
    await agentProfileSave.run(async () => {
      await storage.set('userProfile', nextProfile)
      setAgentProfile(nextProfile)
    })
  }

  const updateAgentProfile = (updates: Partial<UserProfile>) => {
    const nextProfile = { ...agentProfile, ...updates }
    setAgentProfile(nextProfile)
    void saveAgentProfile(nextProfile)
  }

  const handleConnectorToggle = (checked: boolean) => {
    if (!checked && agentProfile.confirmAllConnectorActions) {
      setShowConnectorWarning(true)
      return
    }
    updateAgentProfile({ confirmAllConnectorActions: checked })
  }

  const selectWorkspace = async () => {
    try {
      const result = await file.selectWorkspace()
      if (result.success && result.path) {
        setWorkspace(result.path)
      }
    } catch (error) {
      console.error('Failed to select workspace:', error)
    }
  }

  const trimChatHistory = async () => {
    const history = await storage.get('chatHistory') as Array<{ id: string }> | null
    const all = history || []
    await storage.set('chatHistory', all.slice(0, keepRecentChats))
    setShowTrimHistoryModal(false)
  }

  const clearAllData = async () => {
    await storage.set('chatHistory', [])
    await storage.set('userProfile', null)
    await storage.setSecure('aiConfig', '')
    await storage.setSecure('reasoningConfig', '')
    await storage.setSecure('ocrConfig', '')
    await storage.set('activeContextId', null)
    setShowClearDataModal(false)
    await loadSettings()
  }

  const getCatalogModels = (provider: ModelProvider, role: ModelRole, selectedModel?: string) => {
    const roleCatalog = modelCatalog?.[provider]?.[role] || getBundledProviderRole(provider, role)
    const ids = roleCatalog.models.map(model => model.id)
    if (selectedModel && !ids.includes(selectedModel)) return [selectedModel, ...ids]
    return ids
  }

  const getCatalogStatus = (provider: ModelProvider, role: ModelRole) => {
    const roleCatalog = modelCatalog?.[provider]?.[role]
    if (!roleCatalog) return 'Using bundled defaults'
    if (roleCatalog.error) return 'Refresh failed, using cached/default models'
    if (roleCatalog.lastFetchedAt) return `Updated ${new Date(roleCatalog.lastFetchedAt).toLocaleString()}`
    return 'Using bundled defaults'
  }

  const clearLabels: Record<Exclude<ClearTarget, null>, string> = {
    general: 'General Model',
    reasoning: 'Reasoning Model',
    ocr: 'OCR Model',
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="content-shell page-shell">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-medium text-neutral-950">Settings</h1>
            <p className="text-sm text-neutral-500 mt-1">
              Configure framework-level model, workspace, and runtime preferences.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <StatusText
              status={modelRefreshStatus}
              successMessage="Models refreshed"
              errorMessage="Refresh failed"
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => loadModelCatalog(true)}
              disabled={refreshingModels}
              loading={refreshingModels}
              loadingLabel="Updating..."
            >
              <RefreshIcon />
              Update model lists
            </Button>
          </div>
        </div>

        <div className="space-y-6">
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Workspace Folder</h2>
            <p className="text-sm text-gray-600 mb-4">
              This is the folder where the agent can read documents and create outputs.
            </p>
            <div className="flex items-center gap-4">
              <div className="ui-field ui-field--readonly flex flex-1 items-center gap-3 min-w-0">
                <FolderIcon />
                <span className="text-sm truncate">
                  {workspace || 'No folder selected'}
                </span>
              </div>
              <Button variant="secondary" size="sm" onClick={selectWorkspace}>
                {workspace ? 'Change' : 'Select Folder'}
              </Button>
            </div>
          </section>

          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4 gap-3">
              <h2 className="text-lg font-semibold text-gray-800">General Model</h2>
              {aiConfig && <Badge tone="success">Active</Badge>}
            </div>
            <Callout className="mb-5">
              <p className="text-xs font-normal">
                <ModelRecommendationText section="general" />
              </p>
            </Callout>
            <div className="space-y-4">
              <Field label="Provider">
                <Select
                  value={aiForm.provider}
                  onChange={(e) => setAIForm({ ...aiForm, provider: e.target.value as AIProvider, model: '' })}
                >
                  {CHAT_PROVIDERS.map(provider => (
                    <option key={provider} value={provider}>{AI_PROVIDER_LABELS[provider]}</option>
                  ))}
                </Select>
              </Field>
              <Field label="API Key">
                <Input
                  type="password"
                  value={aiForm.apiKey}
                  onChange={(e) => setAIForm({ ...aiForm, apiKey: e.target.value })}
                  onFocus={() => aiForm.apiKey === '••••••••' && setAIForm({ ...aiForm, apiKey: '' })}
                  placeholder={`Your ${aiForm.provider} API key`}
                />
              </Field>
              <Field label="Model" hint={getCatalogStatus(aiForm.provider, 'chat')}>
                <Select
                  value={aiForm.model}
                  onChange={(e) => setAIForm({ ...aiForm, model: e.target.value })}
                >
                  <option value="">Default</option>
                  {getCatalogModels(aiForm.provider, 'chat', aiForm.model).map(model => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                </Select>
              </Field>
              <ActionRow
                label="Save"
                busy={aiSave.busy}
                status={aiSave.status}
                onAction={saveAIConfig}
                size="sm"
                successMessage="Saved!"
                errorMessage="Failed — check API key."
                extraActions={
                  <Button variant="secondary" size="sm" onClick={() => setClearTarget('general')}>
                    Clear
                  </Button>
                }
              />
            </div>
          </section>

          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-1 gap-3">
              <div className="flex items-center gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-gray-800">Reasoning Model</h2>
                  <p className="text-xs text-gray-400 font-normal mt-0.5">Optional</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {reasoningConfigured && <Badge tone="success">Active</Badge>}
              </div>
            </div>
            <p className="text-sm text-gray-500 mb-2">
              A dedicated model for complex, multi-step tasks. When configured, it takes over automatically whenever the agent needs to plan deeply.
            </p>
            <Callout className="mb-5">
              <p className="text-xs font-normal">
                <ModelRecommendationText section="reasoning" />
              </p>
            </Callout>
            <div className="space-y-4">
              <Field label="Provider">
                <Select
                  value={reasoningForm.provider}
                  onChange={e => {
                    const provider = e.target.value as AIProvider
                    setReasoningForm({
                      ...reasoningForm,
                      provider,
                      model: '',
                      useSameKey: aiConfig?.provider === provider ? reasoningForm.useSameKey : false,
                    })
                  }}
                >
                  {REASONING_PROVIDERS.map(provider => (
                    <option key={provider} value={provider}>{AI_PROVIDER_LABELS[provider]}</option>
                  ))}
                </Select>
              </Field>
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={canUseSameReasoningKey && reasoningForm.useSameKey}
                    disabled={!canUseSameReasoningKey}
                    onChange={e => setReasoningForm({ ...reasoningForm, useSameKey: e.target.checked, apiKey: '' })}
                    className="rounded"
                  />
                  Use same API key as general model
                </label>
                {(!canUseSameReasoningKey || !reasoningForm.useSameKey) && (
                  <Input
                    type="password"
                    value={reasoningForm.apiKey}
                    onChange={e => setReasoningForm({ ...reasoningForm, apiKey: e.target.value })}
                    onFocus={() => reasoningForm.apiKey === '••••••••' && setReasoningForm({ ...reasoningForm, apiKey: '' })}
                    placeholder={`Your ${reasoningForm.provider} API key`}
                  />
                )}
              </div>
              <Field label="Model" hint={getCatalogStatus(reasoningForm.provider, 'reasoning')}>
                <Select
                  value={reasoningForm.model}
                  onChange={e => setReasoningForm({ ...reasoningForm, model: e.target.value })}
                >
                  <option value="">Default for provider</option>
                  {getCatalogModels(reasoningForm.provider, 'reasoning', reasoningForm.model).map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </Select>
              </Field>
              <ActionRow
                label="Save"
                busy={reasoningSave.busy}
                status={reasoningSave.status}
                disabled={(!canUseSameReasoningKey || !reasoningForm.useSameKey) && !reasoningForm.apiKey}
                onAction={saveReasoningConfig}
                size="sm"
                successMessage="Saved!"
                errorMessage="Failed — check API key."
                extraActions={
                  <Button variant="secondary" size="sm" onClick={() => setClearTarget('reasoning')}>
                    Clear
                  </Button>
                }
              />
            </div>
          </section>

          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-1 gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">OCR Model</h2>
                <p className="text-xs text-gray-400 font-normal mt-0.5">Optional</p>
              </div>
              <div className="flex items-center gap-3">
                {ocrConfigured && <Badge tone="success">Active</Badge>}
              </div>
            </div>
            <p className="text-sm text-gray-500 mb-5">
              A specialist model for scanned PDFs and image-based documents.
            </p>
            <Callout className="mb-5">
              <p className="text-xs font-normal">
                <ModelRecommendationText section="ocr" />
              </p>
            </Callout>
            <div className="space-y-4">
              <Field label="Provider">
                <Select
                  value={ocrForm.provider}
                  onChange={e => setOcrForm({ ...ocrForm, provider: e.target.value as OCRProvider, model: '' })}
                >
                  {OCR_PROVIDERS.map(provider => (
                    <option key={provider} value={provider}>{OCR_PROVIDER_LABELS[provider]}</option>
                  ))}
                </Select>
              </Field>
              <Field label="API Key">
                <Input
                  type="password"
                  value={ocrForm.apiKey}
                  onChange={e => setOcrForm({ ...ocrForm, apiKey: e.target.value })}
                  onFocus={() => ocrForm.apiKey === '••••••••' && setOcrForm({ ...ocrForm, apiKey: '' })}
                  placeholder={ocrForm.provider === 'mistral' ? 'Your Mistral API key' : 'Your DeepInfra API token'}
                />
              </Field>
              <Field label="Model" hint={getCatalogStatus(ocrForm.provider, 'ocr')}>
                <Select
                  value={ocrForm.model}
                  onChange={e => setOcrForm({ ...ocrForm, model: e.target.value })}
                >
                  <option value="">Default for provider</option>
                  {getCatalogModels(ocrForm.provider, 'ocr', ocrForm.model).map(model => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                </Select>
              </Field>
              <ActionRow
                label="Save"
                busy={ocrSave.busy}
                status={ocrSave.status}
                disabled={!ocrForm.apiKey}
                onAction={saveOcrConfig}
                size="sm"
                successMessage="Saved!"
                errorMessage="Failed — check API key."
                extraActions={
                  <Button variant="secondary" size="sm" onClick={() => setClearTarget('ocr')}>
                    Clear
                  </Button>
                }
              />
            </div>
          </section>

          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-1">Agent Behavior</h2>
            <p className="text-sm text-gray-500 mb-5">Control how the agent processes your requests.</p>

            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-gray-800">Max iterations per request</h3>
                  <p className="text-sm text-gray-500 mt-0.5">
                    How many tool-call loops the agent can run before stopping.
                  </p>
                </div>
                <div className="flex items-center gap-3 ml-6">
                  <Select
                    value={maxIterations}
                    onChange={e => {
                      const val = Number(e.target.value)
                      setMaxIterations(val)
                      saveMaxIterations(val)
                    }}
                    disabled={maxIterSave.busy}
                    className="w-auto min-w-[8.5rem]"
                  >
                    <option value={5}>5</option>
                    <option value={10}>10 (default)</option>
                    <option value={15}>15</option>
                    <option value={20}>20</option>
                    <option value={0}>No limit</option>
                  </Select>
                  <StatusText
                    busy={maxIterSave.busy}
                    status={maxIterSave.status}
                    busyMessage="Saving…"
                    successMessage="Saved"
                    size="sm"
                  />
                </div>
              </div>

              <div className="border-t border-gray-200 pt-5 space-y-5">
                <div>
                  <h3 className="font-medium text-gray-800">Communication preferences</h3>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Adjust how the agent balances technical depth, detail, and tone.
                  </p>
                </div>

                <RangeSlider
                  minLabel="Technical"
                  maxLabel="Conversational"
                  value={agentProfile.styleSpectrum}
                  disabled={agentProfileSave.busy}
                  onChange={value => updateAgentProfile({ styleSpectrum: value })}
                />
                <RangeSlider
                  minLabel="Concise"
                  maxLabel="Detailed"
                  value={agentProfile.detailSpectrum}
                  disabled={agentProfileSave.busy}
                  onChange={value => updateAgentProfile({ detailSpectrum: value })}
                />
                <RangeSlider
                  minLabel="Formal"
                  maxLabel="Casual"
                  value={agentProfile.toneSpectrum}
                  disabled={agentProfileSave.busy}
                  onChange={value => updateAgentProfile({ toneSpectrum: value })}
                />

                <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 p-4">
                  <div>
                    <span className="font-medium text-gray-800">Confirm connector write actions</span>
                    <p className="text-sm text-gray-500 mt-0.5">
                      Ask before the agent creates, edits, sends, uploads, or otherwise writes through a connector.
                    </p>
                  </div>
                  <Toggle
                    checked={agentProfile.confirmAllConnectorActions}
                    onChange={event => handleConnectorToggle(event.target.checked)}
                    disabled={agentProfileSave.busy}
                    label="Confirm connector write actions"
                    className="shrink-0"
                  />
                </div>

                <div className="h-5">
                  <StatusText
                    busy={agentProfileSave.busy}
                    status={agentProfileSave.status}
                    busyMessage="Saving behavior settings…"
                    successMessage="Behavior settings saved"
                    errorMessage="Could not save behavior settings"
                    size="sm"
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-1">App updates</h2>
            <p className="text-sm text-gray-500 mb-4">
              Installed releases check GitHub automatically on startup. Download installers from your website or GitHub Releases.
            </p>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium text-gray-800">Version {appVersion}</p>
                <p className="text-sm text-gray-500 mt-1">
                  {updateState.status === 'checking' || updateCheck.busy
                    ? 'Checking for updates…'
                    : updateState.status === 'ready'
                      ? `Update ${updateState.version} downloaded — restart from the notification.`
                      : updateState.status === 'downloading'
                        ? `Downloading ${updateState.version ?? 'update'}${updateState.percent != null ? ` (${Math.round(updateState.percent)}%)` : '…'}`
                        : updateState.status === 'available'
                          ? `Update ${updateState.version} available — downloading…`
                          : updateState.status === 'dev-skipped'
                            ? updateState.message
                            : updateState.status === 'error'
                              ? updateState.message || 'Could not check for updates.'
                              : updateState.message || 'You are on the latest version.'}
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="shrink-0"
                disabled={updateCheck.busy}
                onClick={() => {
                  updateCheck.run(async () => {
                    await checkForUpdates()
                  })
                }}
              >
                Check for updates
              </Button>
            </div>
            <div className="h-5 mt-3">
              <StatusText
                busy={updateCheck.busy}
                status={updateCheck.status}
                busyMessage="Checking for updates…"
                successMessage="Update check finished"
                errorMessage="Update check failed"
                size="sm"
              />
            </div>
          </section>

          <section className="bg-white rounded-xl shadow-sm border border-red-200 p-6">
            <h2 className="text-lg font-semibold text-red-700 mb-4">Danger Zone</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="font-medium text-gray-800">Trim chat history</h3>
                  <p className="text-sm text-gray-500">
                    Delete older conversations and keep only the most recent ones.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Select
                    value={keepRecentChats}
                    onChange={event => setKeepRecentChats(Number(event.target.value))}
                    className="w-auto min-w-[7rem]"
                  >
                    {Array.from({ length: 16 }, (_, index) => (
                      <option key={index} value={index}>
                        Keep {index}
                      </option>
                    ))}
                  </Select>
                  <Button variant="secondary" size="sm" onClick={() => setShowTrimHistoryModal(true)}>
                    Trim
                  </Button>
                </div>
              </div>

              <hr className="border-gray-200" />

              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-gray-800">Clear All Data</h3>
                  <p className="text-sm text-gray-500">
                    Delete all stored data including credentials and chat history
                  </p>
                </div>
                <Button variant="danger" size="sm" onClick={() => setShowClearDataModal(true)}>
                  Clear Data
                </Button>
              </div>
            </div>
          </section>

          <section className="text-center py-4">
            <p className="text-sm text-gray-500">smile:D v{appVersion} — White-label desktop agent framework</p>
            <p className="text-xs text-gray-400 mt-1">All data is stored locally on your machine</p>
          </section>
        </div>
      </div>

      {clearTarget && (
        <ConfirmModal
          title={`Clear ${clearLabels[clearTarget]}?`}
          description="This removes saved credentials and model selection for this module. You can configure it again later."
          confirmLabel="Clear"
          confirmVariant="danger"
          onConfirm={() => void clearModelConfig(clearTarget)}
          onCancel={() => setClearTarget(null)}
        />
      )}

      {showConnectorWarning && (
        <ConfirmModal
          title="Disable write confirmations?"
          description="The agent will be able to create, edit, send, and upload through connectors without asking for approval first."
          confirmLabel="Disable confirmations"
          confirmVariant="danger"
          onConfirm={() => {
            updateAgentProfile({ confirmAllConnectorActions: false })
            setShowConnectorWarning(false)
          }}
          onCancel={() => setShowConnectorWarning(false)}
        />
      )}

      {showTrimHistoryModal && (
        <ConfirmModal
          title="Trim chat history?"
          description={`Delete all conversations except the ${keepRecentChats} most recent? This cannot be undone.`}
          confirmLabel="Trim history"
          confirmVariant="danger"
          onConfirm={() => void trimChatHistory()}
          onCancel={() => setShowTrimHistoryModal(false)}
        />
      )}

      {showClearDataModal && (
        <ConfirmModal
          title="Clear all data?"
          description="This deletes credentials, chat history, and saved preferences. This cannot be undone."
          confirmLabel="Clear everything"
          confirmVariant="danger"
          onConfirm={() => void clearAllData()}
          onCancel={() => setShowClearDataModal(false)}
        />
      )}
    </div>
  )
}
