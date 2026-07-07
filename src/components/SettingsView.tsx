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
import { notifyChatHistoryChanged } from '../shell/chatHistoryEvents'
import { notifyModelConfigChanged } from '../shell/modelConfigEvents'
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

interface SettingsViewProps {
  onContextsChange?: (contexts: import('../context/types').ProjectContext[]) => void
}

export default function SettingsView({ onContextsChange }: SettingsViewProps) {
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

  const [agentParallelReads, setAgentParallelReads] = useState(true)
  const [agentContextWindow, setAgentContextWindow] = useState(128000)
  const loopSave = useActionFeedback({ resetMs: 1200 })

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

  const { storage, models: modelCatalogAPI, file, contexts: contextsAPI, chat } = useElectron()
  const canUseSameReasoningKey = !!aiConfig && aiConfig.provider === reasoningForm.provider

  useEffect(() => {
    void loadSettings()
  }, [])

  useEffect(() => {
    const handleWorkspaceChanged = () => {
      void file.getWorkspace().then(path => setWorkspace(path))
    }
    window.addEventListener('workspace:changed', handleWorkspaceChanged)
    return () => window.removeEventListener('workspace:changed', handleWorkspaceChanged)
  }, [file])

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

      const parallel = await storage.get('agentParallelReads') as boolean | null
      if (parallel !== null && parallel !== undefined) setAgentParallelReads(parallel)
      const windowSetting = await storage.get('agentContextWindow') as number | null
      if (windowSetting !== null && windowSetting !== undefined) setAgentContextWindow(windowSetting)
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
      notifyModelConfigChanged()
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
        if (existing) apiKey = JSON.parse(existing).apiKey
      }
      if (!apiKey) {
        reasoningSave.markError()
        throw new Error('Missing API key')
      }
      const config = { provider: reasoningForm.provider, apiKey, model: reasoningForm.model || undefined }
      await storage.setSecure('reasoningConfig', JSON.stringify(config))
      notifyModelConfigChanged()
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
      notifyModelConfigChanged()
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
      setReasoningConfigured(false)
      setReasoningForm({ provider: 'anthropic', apiKey: '', model: '', useSameKey: true })
    }
    if (target === 'ocr') {
      await storage.setSecure('ocrConfig', '')
      setOcrConfigured(false)
      setOcrForm({ provider: 'mistral', apiKey: '', model: '' })
    }
    notifyModelConfigChanged()
    setClearTarget(null)
  }

  const saveMaxIterations = (value: number) => {
    void maxIterSave.run(async () => {
      await storage.set('agentMaxIterations', value)
    })
  }

  const toggleParallelReads = (value: boolean) => {
    void loopSave.run(async () => {
      await storage.set('agentParallelReads', value)
    })
  }

  const saveContextWindow = (value: number) => {
    void loopSave.run(async () => {
      await storage.set('agentContextWindow', value)
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
      console.log('[Settings] Selecting workspace...')
      const result = await file.selectWorkspace()
      console.log('[Settings] selectWorkspace result:', result)
      if (result.success && result.path) {
        setWorkspace(result.path)
        window.dispatchEvent(new CustomEvent('workspace:changed', { detail: { path: result.path } }))
        const contextsResult = await contextsAPI.list()
        if (contextsResult.success && contextsResult.data) {
          onContextsChange?.(contextsResult.data)
        }
      } else {
        // Sync local state with the persisted workspace in case the handler
        // returned a different result shape.
        const persisted = await file.getWorkspace()
        console.log('[Settings] Persisted workspace:', persisted)
        setWorkspace(persisted)
      }
    } catch (error) {
      console.error('Failed to select workspace:', error)
    }
  }

  const trimChatHistory = async () => {
    // Prefer the SQLite-backed chat list as the source of truth so trimmed chats
    // are removed from the database and cannot be restored on the next launch.
    // Fall back to the electron-store cache when no workspace/database is ready.
    const recentResult = await chat.loadRecent(100)
    let all: Array<{ id: string; title: string; date: string }> = []

    if (recentResult.success && recentResult.data) {
      all = recentResult.data
    } else {
      console.warn('[Trim] Could not load from SQLite, falling back to local store:', recentResult.error)
      const history = await storage.get('chatHistory') as Array<{ id: string; title: string; date: string }> | null
      all = history || []
    }

    const keep = all.slice(0, keepRecentChats)
    const remove = all.slice(keepRecentChats)

    for (const chatItem of remove) {
      const result = await chat.deleteChat(chatItem.id)
      if (!result.success) {
        console.error(`[Trim] Failed to delete chat ${chatItem.id}:`, result.error)
      }
    }

    // Verify the deletes actually landed in SQLite.
    const verifyResult = await chat.loadRecent(100)
    if (verifyResult.success && verifyResult.data) {
      const remainingIds = new Set(verifyResult.data.map(c => c.id))
      for (const chatItem of remove) {
        if (remainingIds.has(chatItem.id)) {
          console.error(`[Trim] Chat ${chatItem.id} still exists after delete`)
        }
      }
    }

    // Preserve human-readable titles already stored in the cache.
    const existingHistory = await storage.get('chatHistory') as Array<{ id: string; title: string; date: string }> | null
    const titleById = new Map(existingHistory?.map(c => [c.id, c.title]) ?? [])

    const keptSummaries = keep.map(chatItem => ({
      id: chatItem.id,
      title: titleById.get(chatItem.id) || chatItem.title,
      date: chatItem.date,
    }))
    await storage.set('chatHistory', keptSummaries)
    notifyChatHistoryChanged()
    setShowTrimHistoryModal(false)
  }

  const clearAllData = async () => {
    // Delete every chat from the SQLite source of truth, not just the cache.
    const recentResult = await chat.loadRecent(100)
    if (recentResult.success && recentResult.data) {
      for (const chatItem of recentResult.data) {
        const result = await chat.deleteChat(chatItem.id)
        if (!result.success) {
          console.error(`[Clear all] Failed to delete chat ${chatItem.id}:`, result.error)
        }
      }
    }
    await storage.set('chatHistory', [])
    notifyChatHistoryChanged()
    await storage.set('userProfile', null)
    await storage.setSecure('aiConfig', '')
    await storage.setSecure('reasoningConfig', '')
    await storage.setSecure('ocrConfig', '')
    await storage.set('activeContextId', null)
    await storage.set('agentParallelReads', true)
    await storage.set('agentContextWindow', 128000)
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
    if (roleCatalog.error) {
      const error = roleCatalog.error.length > 80 ? `${roleCatalog.error.slice(0, 80)}…` : roleCatalog.error
      return `Refresh failed: ${error}`
    }
    if (roleCatalog.lastFetchedAt) return `Updated ${new Date(roleCatalog.lastFetchedAt).toLocaleString()}`
    return 'Using bundled defaults'
  }

  const clearLabels: Record<Exclude<ClearTarget, null>, string> = {
    general: 'General Model',
    reasoning: 'Reasoning Model',
    ocr: 'OCR Model',
  }

  return (
    <div className="ui-page-frame">
      <div className="content-shell page-shell">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="ui-page-subtitle">
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
            <h2 className="ui-section-title mb-4">Agent's folder</h2>
            <p className="text-sm text-gray-600 mb-4">
              Workspace folder where the agent reads documents and creates outputs.
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
            <div className="flex items-center justify-between mb-4">
              <h2 className="ui-section-title">Main model</h2>
              {aiConfig && <Badge tone="success">Active</Badge>}
            </div>
            <div className="mb-4">
              <p className="text-sm text-gray-600">The model used for the agent loop.</p>
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
            <div className="flex items-center justify-between mb-4">
              <h2 className="ui-section-title">Reasoning model</h2>
              {reasoningConfigured && <Badge tone="success">Active</Badge>}
            </div>
            <div className="mb-4">
              <p className="text-sm text-gray-600">Optional dedicated model for complex, multi-step tasks.</p>
            </div>
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
            <div className="flex items-center justify-between mb-4">
              <h2 className="ui-section-title">OCR Model</h2>
              {ocrConfigured && <Badge tone="success">Active</Badge>}
            </div>
            <div className="mb-4">
              <p className="text-sm text-gray-600">Optional specialist model for scanned PDFs and image-based documents.</p>
            </div>
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
            <h2 className="ui-section-title mb-4">User's preferences</h2>
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
                  <h3 className="font-medium text-gray-800">Loop settings</h3>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Tune parallel reads and context compression.
                  </p>
                </div>

                <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 p-4">
                  <div>
                    <span className="font-medium text-gray-800">Allow parallel independent reads</span>
                    <p className="text-sm text-gray-500 mt-0.5">
                      Run safe read-only tools concurrently when the model asks for several.
                    </p>
                  </div>
                  <Toggle
                    checked={agentParallelReads}
                    onChange={event => {
                      const checked = event.target.checked
                      setAgentParallelReads(checked)
                      toggleParallelReads(checked)
                    }}
                    label="Parallel reads"
                    className="shrink-0"
                  />
                </div>

                <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 p-4">
                  <div>
                    <span className="font-medium text-gray-800">Context window</span>
                    <p className="text-sm text-gray-500 mt-0.5">
                      Compress older history when it reaches 50% of this limit.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Select
                      value={agentContextWindow}
                      onChange={event => {
                        const val = Number(event.target.value)
                        setAgentContextWindow(val)
                        saveContextWindow(val)
                      }}
                      className="w-auto min-w-[7rem]"
                    >
                      <option value={64000}>64k</option>
                      <option value={128000}>128k</option>
                      <option value={200000}>200k</option>
                      <option value={256000}>256k</option>
                    </Select>
                  </div>
                </div>

                <div className="h-5">
                  <StatusText
                    busy={loopSave.busy}
                    status={loopSave.status}
                    busyMessage="Saving loop settings…"
                    successMessage="Loop settings saved"
                    errorMessage="Could not save loop settings"
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
            <h2 className="ui-section-title mb-4">Updates</h2>
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
            <h2 className="ui-section-title text-red-700 mb-4">Danger zone</h2>
            <p className="text-sm text-red-700 mb-4">Destructive actions that cannot be undone.</p>
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
