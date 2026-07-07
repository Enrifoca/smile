import {
  AIProvider,
  BUNDLED_MODEL_CATALOG,
  ModelCatalog,
  ModelCatalogEntry,
  ModelProvider,
  ModelRole,
  OCRProvider,
  ProviderRoleCatalog,
  getBundledProviderRole,
  isOcrModelId,
  isReasoningModelId,
} from '../../src/shared/modelCatalog'
import { StorageService } from './storage'

type ApiConfig = { provider: AIProvider | OCRProvider; apiKey: string }
type RawModel = Record<string, unknown> & { id?: string }
type ConfiguredProvider = { provider: ModelProvider; apiKey: string; roles: ModelRole[] }

const ROLE_ORDER: ModelRole[] = ['chat', 'reasoning', 'ocr']

export class ModelCatalogService {
  constructor(private storage: StorageService) {}

  getCatalog(): ModelCatalog {
    return mergeCatalogs(BUNDLED_MODEL_CATALOG, this.storage.getModelCatalog())
  }

  async refreshAll(): Promise<ModelCatalog> {
    const configs = this.getConfiguredProviders()

    const tasks = configs.map(async ({ provider, apiKey, roles }) => {
      const updates = await this.refreshProvider(provider, apiKey, roles)
      return { provider, updates }
    })

    let catalog = this.getCatalog()
    const results = await Promise.allSettled(tasks)

    for (const result of results) {
      if (result.status === 'fulfilled') {
        catalog = mergeCatalogs(catalog, result.value.updates)
      }
    }

    this.storage.setModelCatalog(catalog)
    return this.getCatalog()
  }

  async refreshProviderFromStorage(provider: ModelProvider): Promise<ModelCatalog> {
    const configs = this.getConfiguredProviders().filter(config => config.provider === provider)
    if (configs.length === 0) return this.getCatalog()

    let catalog = this.getCatalog()
    for (const config of configs) {
      catalog = mergeCatalogs(catalog, await this.refreshProvider(config.provider, config.apiKey, config.roles))
    }
    this.storage.setModelCatalog(catalog)
    return this.getCatalog()
  }

  private getConfiguredProviders(): ConfiguredProvider[] {
    const configs: ConfiguredProvider[] = []

    for (const key of ['aiConfig', 'reasoningConfig']) {
      const raw = this.storage.getSecure(key)
      if (!raw) continue

      try {
        const config = JSON.parse(raw) as ApiConfig
        if (!config.provider || !config.apiKey) continue
        configs.push({
          provider: config.provider as ModelProvider,
          apiKey: config.apiKey,
          roles: key === 'aiConfig' ? ['chat', 'reasoning'] : ['reasoning'],
        })
      } catch {
        // Ignore invalid legacy config; regular app flows will overwrite it.
      }
    }

    const ocrRaw = this.storage.getSecure('ocrConfig')
    if (ocrRaw) {
      try {
        const config = JSON.parse(ocrRaw) as ApiConfig
        if (config.provider && config.apiKey) {
          configs.push({ provider: config.provider as ModelProvider, apiKey: config.apiKey, roles: ['ocr'] })
        }
      } catch {
        // Ignore invalid legacy config; regular app flows will overwrite it.
      }
    }

    return configs
  }

  private async refreshProvider(provider: ModelProvider, apiKey: string, requestedRoles: ModelRole[]): Promise<ModelCatalog> {
    try {
      if (provider === 'deepseek' && requestedRoles.length === 1 && requestedRoles[0] === 'ocr') {
        return this.modelsToCatalog(provider, await fetchOpenAICompatibleModels('https://api.deepinfra.com/v1/openai/models', apiKey), requestedRoles)
      }

      switch (provider) {
        case 'openai':
          return this.modelsToCatalog(provider, await fetchOpenAICompatibleModels('https://api.openai.com/v1/models', apiKey), requestedRoles)
        case 'anthropic':
          return this.modelsToCatalog(provider, await fetchAnthropicModels(apiKey), requestedRoles)
        case 'mistral':
          return this.modelsToCatalog(provider, await fetchOpenAICompatibleModels('https://api.mistral.ai/v1/models', apiKey), requestedRoles)
        case 'groq':
          return this.modelsToCatalog(provider, await fetchOpenAICompatibleModels('https://api.groq.com/openai/v1/models', apiKey), requestedRoles)
        case 'moonshot':
          return this.modelsToCatalog(provider, await fetchOpenAICompatibleModels('https://api.moonshot.ai/v1/models', apiKey), requestedRoles)
        case 'deepseek':
          return this.modelsToCatalog(provider, await fetchDeepSeekModels(apiKey), requestedRoles)
        case 'openrouter':
          return this.modelsToCatalog(provider, await fetchOpenAICompatibleModels('https://openrouter.ai/api/v1/models', apiKey), requestedRoles)
        case 'xai':
          return this.modelsToCatalog(provider, await fetchOpenAICompatibleModels('https://api.x.ai/v1/models', apiKey), requestedRoles)
        case 'minimax':
          return this.modelsToCatalog(provider, await fetchOpenAICompatibleModels('https://api.minimaxi.chat/v1/models', apiKey), requestedRoles)
        case 'qwen':
          return this.modelsToCatalog(provider, await fetchOpenAICompatibleModels('https://dashscope-intl.aliyuncs.com/compatible-mode/v1/models', apiKey), requestedRoles)
        default:
          return {}
      }
    } catch (error) {
      return this.errorCatalog(provider, error instanceof Error ? error.message : 'Failed to refresh models')
    }
  }

  private modelsToCatalog(provider: ModelProvider, rawModels: RawModel[], requestedRoles: ModelRole[]): ModelCatalog {
    const now = new Date().toISOString()
    const byRole: Partial<Record<ModelRole, ModelCatalogEntry[]>> = {}
    const requested = new Set(requestedRoles)

    for (const rawModel of rawModels) {
      const id = rawModel.id
      if (!id || shouldIgnoreModel(provider, id)) continue

      for (const role of classifyModel(provider, rawModel)) {
        if (!requested.has(role)) continue
        if (!byRole[role]) byRole[role] = []
        byRole[role]!.push({ id, roles: [role], source: 'provider' })
      }
    }

    const providerCatalog: Partial<Record<ModelRole, ProviderRoleCatalog>> = {}
    for (const role of ROLE_ORDER) {
      const models = dedupeModels(byRole[role] || [])
      if (models.length === 0) continue
      providerCatalog[role] = {
        provider,
        role,
        models,
        lastFetchedAt: now,
        source: 'provider',
      }
    }

    return { [provider]: providerCatalog } as ModelCatalog
  }

  private errorCatalog(provider: ModelProvider, message: string): ModelCatalog {
    const existing = this.getCatalog()[provider] || {}
    const fallback = BUNDLED_MODEL_CATALOG[provider] || {}
    const providerCatalog: Partial<Record<ModelRole, ProviderRoleCatalog>> = {}

    for (const role of ROLE_ORDER) {
      const roleCatalog = existing[role] || fallback[role]
      if (!roleCatalog) continue
      providerCatalog[role] = { ...roleCatalog, error: message }
    }

    return { [provider]: providerCatalog } as ModelCatalog
  }
}

async function fetchOpenAICompatibleModels(url: string, apiKey: string): Promise<RawModel[]> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!response.ok) throw new Error(await readApiError(response, `Model list API error: ${response.status}`))

  const data = await response.json() as { data?: RawModel[] }
  return data.data || []
}

async function fetchAnthropicModels(apiKey: string): Promise<RawModel[]> {
  const response = await fetch('https://api.anthropic.com/v1/models?limit=1000', {
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
  })
  if (!response.ok) throw new Error(await readApiError(response, `Anthropic models API error: ${response.status}`))

  const data = await response.json() as { data?: RawModel[] }
  return data.data || []
}

async function fetchDeepSeekModels(apiKey: string): Promise<RawModel[]> {
  const response = await fetch('https://api.deepseek.com/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!response.ok) throw new Error(await readApiError(response, `DeepSeek models API error: ${response.status}`))

  const data = await response.json() as { data?: RawModel[] }
  return data.data || []
}

async function readApiError(response: Response, fallback: string): Promise<string> {
  const error = await response.json().catch(() => ({})) as { error?: { message?: string }; message?: string }
  return error.error?.message || error.message || fallback
}

function classifyModel(provider: ModelProvider, model: RawModel): ModelRole[] {
  const id = model.id || ''
  const roles = new Set<ModelRole>()

  if (isOcrModelId(provider, id)) roles.add('ocr')

  if (provider === 'deepseek') {
    if (isOcrModelId(provider, id)) roles.add('ocr')
    else roles.add('reasoning')
    return Array.from(roles)
  }

  if (provider === 'mistral') {
    const capabilities = model.capabilities as { completion_chat?: boolean; vision?: boolean } | undefined
    if (capabilities?.completion_chat || !isOcrModelId(provider, id)) roles.add('chat')
    if (isReasoningModelId(provider, id)) roles.add('reasoning')
    return Array.from(roles)
  }

  if (provider === 'moonshot') {
    roles.add('chat')
    if ((model as { supports_reasoning?: boolean }).supports_reasoning || isReasoningModelId(provider, id)) {
      roles.add('reasoning')
    }
    return Array.from(roles)
  }

  if (provider === 'openai') {
    if (isReasoningModelId(provider, id)) roles.add('reasoning')
    else roles.add('chat')
    return Array.from(roles)
  }

  if (provider === 'anthropic') {
    roles.add('chat')
    if (isReasoningModelId(provider, id) || hasAnthropicReasoningCapability(model)) roles.add('reasoning')
    return Array.from(roles)
  }

  if (provider === 'groq') {
    roles.add('chat')
    if (isReasoningModelId(provider, id)) roles.add('reasoning')
    return Array.from(roles)
  }

  if (provider === 'openrouter') {
    roles.add('chat')
    if (isReasoningModelId(provider, id)) roles.add('reasoning')
    return Array.from(roles)
  }

  if (provider === 'xai') {
    roles.add('chat')
    if (isReasoningModelId(provider, id)) roles.add('reasoning')
    return Array.from(roles)
  }

  if (provider === 'minimax') {
    roles.add('chat')
    if (isReasoningModelId(provider, id)) roles.add('reasoning')
    return Array.from(roles)
  }

  if (provider === 'qwen') {
    roles.add('chat')
    if (isReasoningModelId(provider, id)) roles.add('reasoning')
    return Array.from(roles)
  }

  return Array.from(roles)
}

function hasAnthropicReasoningCapability(model: RawModel): boolean {
  const capabilities = model.capabilities as { effort?: unknown } | undefined
  return Array.isArray(capabilities?.effort) && capabilities.effort.length > 0
}

function shouldIgnoreModel(provider: ModelProvider, id: string): boolean {
  const m = id.toLowerCase()
  if (provider === 'openai') {
    return m.includes('embedding') || m.includes('tts') || m.includes('whisper') || m.includes('dall-e') || m.includes('moderation')
  }
  if (provider === 'groq') {
    return m.includes('whisper') || m.includes('tts') || m.includes('embedding')
  }
  if (provider === 'openrouter') {
    return m.includes('embedding') || m.includes('tts') || m.includes('whisper') || m.includes('moderation')
  }
  if (provider === 'xai') {
    return m.includes('embedding')
  }
  if (provider === 'minimax') {
    return m.includes('embedding') || m.includes('tts')
  }
  if (provider === 'qwen') {
    return m.includes('embedding') || m.includes('tts') || m.includes('whisper')
  }
  return false
}

function mergeCatalogs(...catalogs: Array<ModelCatalog | null | undefined>): ModelCatalog {
  const merged: ModelCatalog = {}

  for (const catalog of catalogs) {
    if (!catalog) continue
    for (const [provider, providerCatalog] of Object.entries(catalog) as Array<[ModelProvider, Partial<Record<ModelRole, ProviderRoleCatalog>>]>) {
      if (!merged[provider]) merged[provider] = {}
      for (const role of ROLE_ORDER) {
        const roleCatalog = providerCatalog[role]
        if (!roleCatalog) continue
        merged[provider]![role] = {
          ...roleCatalog,
          models: dedupeModels(roleCatalog.models),
          source: roleCatalog.source === 'provider' ? 'cached' : roleCatalog.source,
        }
      }
    }
  }

  for (const [provider, providerCatalog] of Object.entries(BUNDLED_MODEL_CATALOG) as Array<[ModelProvider, Partial<Record<ModelRole, ProviderRoleCatalog>>]>) {
    if (!merged[provider]) merged[provider] = {}
    for (const role of ROLE_ORDER) {
      if (!merged[provider]![role] && providerCatalog[role]) {
        merged[provider]![role] = getBundledProviderRole(provider, role)
      }
    }
  }

  return merged
}

function dedupeModels(models: ModelCatalogEntry[]): ModelCatalogEntry[] {
  const seen = new Set<string>()
  const deduped: ModelCatalogEntry[] = []

  for (const model of models) {
    if (seen.has(model.id)) continue
    seen.add(model.id)
    deduped.push(model)
  }

  return deduped
}
