import { useState, useEffect } from 'react'
import { useElectron } from '../hooks/useElectron'
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

const CheckIcon = () => (
  <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
)

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
  const [isSaving, setIsSaving] = useState(false)
  
  // Agent behavior
  const [maxIterations, setMaxIterations] = useState<number>(10)
  const [savingMaxIter, setSavingMaxIter] = useState(false)
  const [agentProfile, setAgentProfile] = useState<UserProfile>(defaultUserProfile)
  const [savingAgentProfile, setSavingAgentProfile] = useState(false)
  const [agentProfileSaveStatus, setAgentProfileSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')

  // Reasoning model
  const [reasoningForm, setReasoningForm] = useState({
    provider: 'anthropic' as AIProvider,
    apiKey: '',
    model: '',
    useSameKey: true,
  })
  const [reasoningConfigured, setReasoningConfigured] = useState(false)
  const [savingReasoning, setSavingReasoning] = useState(false)
  const [reasoningSaveStatus, setReasoningSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')

  // OCR model
  const [ocrForm, setOcrForm] = useState({
    provider: 'mistral' as OCRProvider,
    apiKey: '',
    model: '',
  })
  const [ocrConfigured, setOcrConfigured] = useState(false)
  const [savingOcr, setSavingOcr] = useState(false)
  const [ocrSaveStatus, setOcrSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')

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

  const saveAIConfig = async () => {
    if (!aiForm.provider || !aiForm.apiKey) return

    setIsSaving(true)
    try {
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
    } catch (error) {
      console.error('Failed to save AI config:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const saveReasoningConfig = async () => {
    setSavingReasoning(true)
    try {
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
        setReasoningSaveStatus('error')
        setTimeout(() => setReasoningSaveStatus('idle'), 3000)
        return
      }

      const config = { provider: reasoningForm.provider, apiKey, model: reasoningForm.model || undefined }
      await storage.setSecure('reasoningConfig', JSON.stringify(config))
      const catalogResult = await modelCatalogAPI.refreshProvider(config.provider)
      if (catalogResult.success && catalogResult.data) setModelCatalog(catalogResult.data)
      setReasoningConfigured(true)
      setReasoningSaveStatus('success')
      setTimeout(() => setReasoningSaveStatus('idle'), 3000)
    } catch {
      setReasoningSaveStatus('error')
      setTimeout(() => setReasoningSaveStatus('idle'), 3000)
    } finally {
      setSavingReasoning(false)
    }
  }

  const saveOcrConfig = async () => {
    setSavingOcr(true)
    setOcrSaveStatus('idle')

    try {
      let apiKey = ocrForm.apiKey

      if (apiKey === '••••••••') {
        const existing = await storage.getSecure('ocrConfig')
        if (existing) apiKey = (JSON.parse(existing) as OCRConfig).apiKey
      }

      if (!apiKey) {
        setOcrSaveStatus('error')
        setTimeout(() => setOcrSaveStatus('idle'), 3000)
        return
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
      setOcrSaveStatus('success')
      setTimeout(() => setOcrSaveStatus('idle'), 3000)
    } catch (error) {
      console.error('Failed to save OCR config:', error)
      setOcrSaveStatus('error')
      setTimeout(() => setOcrSaveStatus('idle'), 3000)
    } finally {
      setSavingOcr(false)
    }
  }

  const saveMaxIterations = async (value: number) => {
    setSavingMaxIter(true)
    try {
      await storage.set('agentMaxIterations', value)
    } finally {
      setSavingMaxIter(false)
    }
  }

  const saveAgentProfile = async (nextProfile: UserProfile) => {
    setSavingAgentProfile(true)
    setAgentProfileSaveStatus('idle')
    try {
      await storage.set('userProfile', nextProfile)
      setAgentProfile(nextProfile)
      setAgentProfileSaveStatus('success')
      setTimeout(() => setAgentProfileSaveStatus('idle'), 2000)
    } catch (error) {
      console.error('Failed to save agent profile:', error)
      setAgentProfileSaveStatus('error')
      setTimeout(() => setAgentProfileSaveStatus('idle'), 3000)
    } finally {
      setSavingAgentProfile(false)
    }
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
    setAgentProfileSaveStatus('idle')
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

  const canUseSameReasoningKey = !!aiConfig && aiConfig.provider === reasoningForm.provider

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
                {modelRefreshStatus === 'success' && <span className="text-sm text-green-600">Models refreshed</span>}
                {modelRefreshStatus === 'error' && <span className="text-sm text-red-600">Refresh failed</span>}
                <button
                  onClick={() => loadModelCatalog(true)}
                  disabled={refreshingModels}
                  className="btn btn-secondary flex items-center gap-2"
                >
                  {refreshingModels ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-600 border-t-transparent"></div>
                      Refreshing...
                    </>
                  ) : (
                    <>
                      <RefreshIcon />
                      Refresh Models
                    </>
                  )}
                </button>
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

              <button
                onClick={saveAIConfig}
                disabled={isSaving}
                className="btn btn-primary"
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
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
              {reasoningConfigured && (
                <span className="flex items-center gap-1.5 text-sm font-medium text-green-600">
                  <CheckIcon /> Active
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 mb-2">
              A dedicated model for complex, multi-step tasks. When configured, it takes over automatically whenever the agent needs to plan deeply, such as analyzing documents, creating multiple connector records, or reasoning through ambiguous requests.
            </p>
            <div className="snippet-info mb-5">
              <p className="text-xs">
                <strong>Best picks:</strong> Claude 3.7 Sonnet (extended thinking), o4-mini / o3-mini (OpenAI reasoning), or DeepSeek-R1 on Groq (free, native chain-of-thought). If you leave this empty, the main model handles everything.
              </p>
            </div>

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

              <div className="flex items-center gap-3">
                <button
                  onClick={saveReasoningConfig}
                  disabled={savingReasoning || ((!canUseSameReasoningKey || !reasoningForm.useSameKey) && !reasoningForm.apiKey)}
                  className="btn btn-primary"
                >
                  {savingReasoning ? 'Saving…' : 'Save Reasoning Model'}
                </button>
                {reasoningSaveStatus === 'success' && <span className="text-sm text-green-600">Saved!</span>}
                {reasoningSaveStatus === 'error' && <span className="text-sm text-red-600">Failed — check API key.</span>}
              </div>
            </div>
          </section>

          {/* OCR Model */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-1">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">OCR Model</h2>
                <p className="text-xs text-gray-400 font-normal mt-0.5">Optional</p>
              </div>
              {ocrConfigured && (
                <span className="flex items-center gap-1.5 text-sm font-medium text-green-600">
                  <CheckIcon /> Active
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 mb-5">
              A specialist model for scanned PDFs and image-based documents. When configured, the agent will automatically use OCR if normal PDF text extraction returns nothing or unreadable text.
            </p>

            <div className="snippet-info mb-5">
              <p className="text-xs">
                <strong>Provider notes:</strong> Mistral uses the official OCR API. DeepSeek uses the DeepSeek-OCR model through DeepInfra, so use a DeepInfra API token for that option.
              </p>
            </div>

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

              <div className="flex items-center gap-3">
                <button
                  onClick={saveOcrConfig}
                  disabled={savingOcr || !ocrForm.apiKey}
                  className="btn btn-primary"
                >
                  {savingOcr ? 'Saving…' : 'Save OCR Model'}
                </button>
                {ocrSaveStatus === 'success' && <span className="text-sm text-green-600">Saved!</span>}
                {ocrSaveStatus === 'error' && <span className="text-sm text-red-600">Failed — check API key.</span>}
              </div>
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
              <button
                onClick={selectWorkspace}
                className="btn btn-secondary"
              >
                {workspace ? 'Change' : 'Select Folder'}
              </button>
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
                  disabled={savingMaxIter}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-neutral-300"
                >
                  <option value={5}>5</option>
                  <option value={10}>10 (default)</option>
                  <option value={15}>15</option>
                  <option value={20}>20</option>
                  <option value={0}>No limit</option>
                </select>
                {savingMaxIter && <span className="text-xs text-gray-400">Saving…</span>}
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
                      disabled={savingAgentProfile}
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
                      disabled={savingAgentProfile}
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
                      disabled={savingAgentProfile}
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
                <input
                  type="checkbox"
                  checked={agentProfile.confirmAllConnectorActions}
                  onChange={event => updateAgentProfile({ confirmAllConnectorActions: event.target.checked })}
                  disabled={savingAgentProfile}
                  className="mt-1"
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
                {savingAgentProfile && <span className="text-xs text-gray-400">Saving behavior settings…</span>}
                {agentProfileSaveStatus === 'success' && <span className="text-xs text-green-600">Behavior settings saved</span>}
                {agentProfileSaveStatus === 'error' && <span className="text-xs text-red-600">Could not save behavior settings</span>}
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
                <button
                  onClick={onResetOnboarding}
                  className="btn btn-secondary"
                >
                  Reset
                </button>
              </div>

              <hr className="border-gray-200" />

              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-gray-800">Clear All Data</h3>
                  <p className="text-sm text-gray-500">
                    Delete all stored data including credentials and chat history
                  </p>
                </div>
                <button
                  onClick={async () => {
                    if (confirm('Are you sure? This will delete all your data including credentials and chat history.')) {
                      await storage.set('chatHistory', [])
                      await storage.set('userProfile', null)
                      await storage.setSecure('aiConfig', '')
                      onResetOnboarding()
                    }
                  }}
                  className="btn btn-danger"
                >
                  Clear Data
                </button>
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
