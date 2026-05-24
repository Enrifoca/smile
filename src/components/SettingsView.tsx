import { useState, useEffect } from 'react'
import { useElectron } from '../hooks/useElectron'
import { useActionFeedback } from '../hooks/useActionFeedback'
import {
  ActionRow,
  Badge,
  Button,
  Callout,
  StatusText,
  Toggle,
} from './ui'
import { UserProfile } from '../agent/types'
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

interface SettingsViewProps {
  onResetOnboarding: () => void
}

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

const defaultUserProfile: UserProfile = {
  style: 'balanced',
  verbosity: 'balanced',
  tone: 'balanced',
  writingPatterns: {
    commonPhrases: [],
    taskFormat: '',
    commentStyle: '',
  },
  focusProjects: [],
  confirmAllConnectorActions: true,
  onboardingCompleted: true,
}

export default function SettingsView({ onResetOnboarding }: SettingsViewProps) {
  const [aiConfig, setAIConfig] = useState<AIConfig | null>(null)
  const [workspace, setWorkspace] = useState<string | null>(null)
  const aiSave = useActionFeedback()
  
  // Agent behavior
  const [maxIterations, setMaxIterations] = useState<number>(10)
  const maxIterSave = useActionFeedback()
  const [agentProfile, setAgentProfile] = useState<UserProfile>(defaultUserProfile)
  const agentProfileSave = useActionFeedback({ resetMs: 2000 })

  // Reasoning model
  const [reasoningForm, setReasoningForm] = useState({
    provider: 'anthropic' as AIProvider,
    apiKey: '',
    model: '',
    useSameKey: true,
  })
  const [reasoningConfigured, setReasoningConfigured] = useState(false)
  const reasoningSave = useActionFeedback()

  // OCR model
  const [ocrForm, setOcrForm] = useState({
    provider: 'mistral' as OCRProvider,
    apiKey: '',
    model: '',
  })
  const [ocrConfigured, setOcrConfigured] = useState(false)
  const ocrSave = useActionFeedback()

  // Form state
  const [aiForm, setAIForm] = useState({
    provider: 'openai' as AIProvider,
    apiKey: '',
    model: '',
  })
  
  const [modelCatalog, setModelCatalog] = useState<ModelCatalog | null>(null)
  const [refreshingModels, setRefreshingModels] = useState(false)
  const [modelRefreshStatus, setModelRefreshStatus] = useState<'idle' | 'success' | 'error'>('idle')

  const { storage, models: modelCatalogAPI, file } = useElectron()
  const canUseSameReasoningKey = !!aiConfig && aiConfig.provider === reasoningForm.provider

  useEffect(() => {
    loadSettings()
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

      // Load AI config
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

      // Load workspace
      const workspacePath = await file.getWorkspace()
      setWorkspace(workspacePath)
      
      // Load agent behavior settings
      const savedMaxIter = await storage.get('agentMaxIterations') as number | null
      if (savedMaxIter !== null && savedMaxIter !== undefined) setMaxIterations(savedMaxIter)

      const savedProfile = await storage.get('userProfile') as Partial<UserProfile> | null
      if (savedProfile) {
        setAgentProfile({
          ...defaultUserProfile,
          ...savedProfile,
          writingPatterns: {
            ...defaultUserProfile.writingPatterns,
            ...savedProfile.writingPatterns,
          },
        })
      }

      // Load reasoning model config (migrates legacy plannerConfig)
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

      // Load OCR model config
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
    const nextProfile = {
      ...agentProfile,
      ...updates,
    }
    setAgentProfile(nextProfile)
    void saveAgentProfile(nextProfile)
  }

  const updateWritingSample = (sample: string) => {
    setAgentProfile(prev => ({
      ...prev,
      writingPatterns: {
        ...prev.writingPatterns,
        taskFormat: sample,
        commentStyle: sample,
      },
    }))
    agentProfileSave.reset()
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

  return (
    <div className="h-full overflow-y-auto">
      <div className="content-shell page-shell">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-medium text-neutral-950">Settings</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Configure framework-level model, workspace, and runtime preferences.
          </p>
        </div>

        <div className="space-y-6">
          {/* AI Configuration */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800">AI Provider</h2>
              <div className="flex items-center gap-3">
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
                  loadingLabel="Refreshing..."
                >
                  <RefreshIcon />
                  Refresh Models
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Provider
                </label>
                <select
                  value={aiForm.provider}
                  onChange={(e) => setAIForm({ 
                    ...aiForm, 
                    provider: e.target.value as AIProvider,
                    model: '' 
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  {CHAT_PROVIDERS.map(provider => (
                    <option key={provider} value={provider}>{AI_PROVIDER_LABELS[provider]}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  API Key
                </label>
                <input
                  type="password"
                  value={aiForm.apiKey}
                  onChange={(e) => setAIForm({ ...aiForm, apiKey: e.target.value })}
                  onFocus={() => aiForm.apiKey === '••••••••' && setAIForm({ ...aiForm, apiKey: '' })}
                  placeholder={`Your ${aiForm.provider} API key`}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Model
                </label>
                <select
                  value={aiForm.model}
                  onChange={(e) => setAIForm({ ...aiForm, model: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">Default</option>
                  {getCatalogModels(aiForm.provider, 'chat', aiForm.model).map(model => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">{getCatalogStatus(aiForm.provider, 'chat')}</p>
              </div>

              <ActionRow
                label="Save"
                busy={aiSave.busy}
                status={aiSave.status}
                onAction={saveAIConfig}
                size="sm"
                successMessage="Saved!"
                errorMessage="Failed — check API key."
              />
            </div>
          </section>

          {/* Reasoning Model */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-gray-800">Reasoning Model</h2>
                  <p className="text-xs text-gray-400 font-normal mt-0.5">Optional</p>
                </div>
              </div>
              {reasoningConfigured && <Badge tone="success">Active</Badge>}
            </div>
            <p className="text-sm text-gray-500 mb-2">
              A dedicated model for complex, multi-step tasks. When configured, it takes over automatically whenever the agent needs to plan deeply, such as analyzing documents, creating multiple connector records, or reasoning through ambiguous requests.
            </p>
            <Callout className="mb-5">
              <p className="text-xs">
                <strong>Best picks:</strong> Claude 3.7 Sonnet (extended thinking), o4-mini / o3-mini (OpenAI reasoning), or DeepSeek-R1 on Groq (free, native chain-of-thought). If you leave this empty, the main model handles everything.
              </p>
            </Callout>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Provider</label>
                <select
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  {REASONING_PROVIDERS.map(provider => (
                    <option key={provider} value={provider}>{AI_PROVIDER_LABELS[provider]}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={canUseSameReasoningKey && reasoningForm.useSameKey}
                    disabled={!canUseSameReasoningKey}
                    onChange={e => setReasoningForm({ ...reasoningForm, useSameKey: e.target.checked, apiKey: '' })}
                    className="rounded"
                  />
                  Use same API key as main model
                </label>
                {!canUseSameReasoningKey && (
                  <p className="text-xs text-gray-500 mb-2">
                    Choose the same provider as your main model to reuse its key.
                  </p>
                )}
                {(!canUseSameReasoningKey || !reasoningForm.useSameKey) && (
                  <input
                    type="password"
                    value={reasoningForm.apiKey}
                    onChange={e => setReasoningForm({ ...reasoningForm, apiKey: e.target.value })}
                    onFocus={() => reasoningForm.apiKey === '••••••••' && setReasoningForm({ ...reasoningForm, apiKey: '' })}
                    placeholder={`Your ${reasoningForm.provider} API key`}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
                <select
                  value={reasoningForm.model}
                  onChange={e => setReasoningForm({ ...reasoningForm, model: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">Default for provider</option>
                  {getCatalogModels(reasoningForm.provider, 'reasoning', reasoningForm.model).map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">{getCatalogStatus(reasoningForm.provider, 'reasoning')}</p>
              </div>

              <ActionRow
                label="Save Reasoning Model"
                busy={reasoningSave.busy}
                status={reasoningSave.status}
                disabled={(!canUseSameReasoningKey || !reasoningForm.useSameKey) && !reasoningForm.apiKey}
                onAction={saveReasoningConfig}
                size="sm"
                successMessage="Saved!"
                errorMessage="Failed — check API key."
              />
            </div>
          </section>

          {/* OCR Model */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-1">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">OCR Model</h2>
                <p className="text-xs text-gray-400 font-normal mt-0.5">Optional</p>
              </div>
              {ocrConfigured && <Badge tone="success">Active</Badge>}
            </div>
            <p className="text-sm text-gray-500 mb-5">
              A specialist model for scanned PDFs and image-based documents. When configured, the agent will automatically use OCR if normal PDF text extraction returns nothing or unreadable text.
            </p>

            <Callout className="mb-5">
              <p className="text-xs">
                <strong>Provider notes:</strong> Mistral uses the official OCR API. DeepSeek uses the DeepSeek-OCR model through DeepInfra, so use a DeepInfra API token for that option.
              </p>
            </Callout>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Provider</label>
                <select
                  value={ocrForm.provider}
                  onChange={e => setOcrForm({ ...ocrForm, provider: e.target.value as OCRProvider, model: '' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  {OCR_PROVIDERS.map(provider => (
                    <option key={provider} value={provider}>{OCR_PROVIDER_LABELS[provider]}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
                <input
                  type="password"
                  value={ocrForm.apiKey}
                  onChange={e => setOcrForm({ ...ocrForm, apiKey: e.target.value })}
                  onFocus={() => ocrForm.apiKey === '••••••••' && setOcrForm({ ...ocrForm, apiKey: '' })}
                  placeholder={ocrForm.provider === 'mistral' ? 'Your Mistral API key' : 'Your DeepInfra API token'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
                <select
                  value={ocrForm.model}
                  onChange={e => setOcrForm({ ...ocrForm, model: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">Default for provider</option>
                  {getCatalogModels(ocrForm.provider, 'ocr', ocrForm.model).map(model => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">{getCatalogStatus(ocrForm.provider, 'ocr')}</p>
              </div>

              <ActionRow
                label="Save OCR Model"
                busy={ocrSave.busy}
                status={ocrSave.status}
                disabled={!ocrForm.apiKey}
                onAction={saveOcrConfig}
                size="sm"
                successMessage="Saved!"
                errorMessage="Failed — check API key."
              />
            </div>
          </section>

          {/* Workspace */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Workspace Folder</h2>
            
            <p className="text-sm text-gray-600 mb-4">
              This is the folder where the agent can read documents and create outputs.
            </p>

            <div className="flex items-center gap-4">
              <div className="flex-1 flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-lg">
                <FolderIcon />
                <span className="text-sm text-gray-700 truncate">
                  {workspace || 'No folder selected'}
                </span>
              </div>
              <Button variant="secondary" size="sm" onClick={selectWorkspace}>
                {workspace ? 'Change' : 'Select Folder'}
              </Button>
            </div>
          </section>

          {/* Agent Behavior */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-1">Agent Behavior</h2>
            <p className="text-sm text-gray-500 mb-5">Control how the agent processes your requests.</p>

            <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-gray-800">Max iterations per request</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  How many tool-call loops the agent can run before stopping. Higher values allow more complex tasks.
                </p>
              </div>
              <div className="flex items-center gap-3 ml-6">
                <select
                  value={maxIterations}
                  onChange={e => {
                    const val = Number(e.target.value)
                    setMaxIterations(val)
                    saveMaxIterations(val)
                  }}
                  disabled={maxIterSave.busy}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-neutral-300"
                >
                  <option value={5}>5</option>
                  <option value={10}>10 (default)</option>
                  <option value={15}>15</option>
                  <option value={20}>20</option>
                  <option value={0}>No limit</option>
                </select>
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
                  These are the same behavior settings collected during onboarding.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Communication Style
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {(['technical', 'balanced', 'conversational'] as const).map((style) => (
                    <button
                      key={style}
                      onClick={() => updateAgentProfile({ style })}
                      disabled={agentProfileSave.busy}
                      className={`px-4 py-3 rounded-xl border-2 transition-colors capitalize ${
                        agentProfile.style === style
                          ? 'border-neutral-500 bg-neutral-50 text-neutral-700'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {style}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Response Length
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {(['concise', 'balanced', 'detailed'] as const).map((verbosity) => (
                    <button
                      key={verbosity}
                      onClick={() => updateAgentProfile({ verbosity })}
                      disabled={agentProfileSave.busy}
                      className={`px-4 py-3 rounded-xl border-2 transition-colors capitalize ${
                        agentProfile.verbosity === verbosity
                          ? 'border-neutral-500 bg-neutral-50 text-neutral-700'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {verbosity}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tone
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {(['formal', 'balanced', 'casual'] as const).map((tone) => (
                    <button
                      key={tone}
                      onClick={() => updateAgentProfile({ tone })}
                      disabled={agentProfileSave.busy}
                      className={`px-4 py-3 rounded-xl border-2 transition-colors capitalize ${
                        agentProfile.tone === tone
                          ? 'border-neutral-500 bg-neutral-50 text-neutral-700'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {tone}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-start justify-between gap-4 rounded-xl border border-gray-200 p-4">
                <div>
                  <span className="font-medium text-gray-800">Confirm connector write actions</span>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Ask before the agent creates, edits, sends, uploads, or otherwise writes through a connector.
                  </p>
                </div>
                <Toggle
                  checked={agentProfile.confirmAllConnectorActions}
                  onChange={event => updateAgentProfile({ confirmAllConnectorActions: event.target.checked })}
                  disabled={agentProfileSave.busy}
                  label="Confirm connector write actions"
                />
              </label>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Writing Sample
                </label>
                <textarea
                  value={agentProfile.writingPatterns.taskFormat}
                  onChange={event => updateWritingSample(event.target.value)}
                  onBlur={() => saveAgentProfile(agentProfile)}
                  placeholder="Paste a sample of how you typically write tasks, comments, emails, or other work output..."
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-neutral-500 focus:border-transparent h-24 resize-none"
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

          {/* Danger Zone */}
          <section className="bg-white rounded-xl shadow-sm border border-red-200 p-6">
            <h2 className="text-lg font-semibold text-red-700 mb-4">Danger Zone</h2>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-gray-800">Reset Onboarding</h3>
                  <p className="text-sm text-gray-500">
                    Go through the setup process again
                  </p>
                </div>
                <Button variant="secondary" size="sm" onClick={onResetOnboarding}>
                  Reset
                </Button>
              </div>

              <hr className="border-gray-200" />

              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-gray-800">Clear All Data</h3>
                  <p className="text-sm text-gray-500">
                    Delete all stored data including credentials and chat history
                  </p>
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={async () => {
                    if (confirm('Are you sure? This will delete all your data including credentials and chat history.')) {
                      await storage.set('chatHistory', [])
                      await storage.set('userProfile', null)
                      await storage.setSecure('aiConfig', '')
                      onResetOnboarding()
                    }
                  }}
                >
                  Clear Data
                </Button>
              </div>
            </div>
          </section>

          {/* About */}
          <section className="text-center py-4">
            <p className="text-sm text-gray-500">
              smile:D v0.1.0 - White-label desktop agent framework
            </p>
            <p className="text-xs text-gray-400 mt-1">
              All data is stored locally on your machine
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
