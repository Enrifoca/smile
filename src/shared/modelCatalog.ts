export type ModelRole = 'chat' | 'reasoning' | 'ocr'

export type AIProvider = 'openai' | 'anthropic' | 'mistral' | 'groq' | 'moonshot' | 'deepseek' | 'openrouter' | 'xai' | 'minimax' | 'qwen'
export type OCRProvider = 'mistral' | 'deepseek'
export type ModelProvider = AIProvider | OCRProvider

export interface AIConfig {
  provider: AIProvider
  apiKey: string
  model?: string
}

export interface OCRConfig {
  provider: OCRProvider
  apiKey: string
  model?: string
}

export interface ModelCatalogEntry {
  id: string
  roles: ModelRole[]
  source: 'bundled' | 'provider' | 'cached' | 'custom'
}

export interface ProviderRoleCatalog {
  provider: ModelProvider
  role: ModelRole
  models: ModelCatalogEntry[]
  lastFetchedAt?: string
  source: 'bundled' | 'provider' | 'cached'
  error?: string
}

export type ModelCatalog = Partial<Record<ModelProvider, Partial<Record<ModelRole, ProviderRoleCatalog>>>>

export const AI_PROVIDER_LABELS: Record<AIProvider, string> = {
  openai: 'ChatGPT / OpenAI',
  anthropic: 'Claude / Anthropic',
  mistral: 'Mistral',
  groq: 'Groq',
  moonshot: 'Kimi / Moonshot',
  deepseek: 'DeepSeek',
  openrouter: 'OpenRouter',
  xai: 'Grok / xAI',
  minimax: 'MiniMax',
  qwen: 'Qwen / Alibaba',
}

export const OCR_PROVIDER_LABELS: Record<OCRProvider, string> = {
  mistral: 'Mistral OCR',
  deepseek: 'DeepSeek OCR',
}

export const CHAT_PROVIDERS: AIProvider[] = ['openai', 'anthropic', 'mistral', 'groq', 'moonshot', 'openrouter', 'xai', 'minimax', 'qwen']
export const REASONING_PROVIDERS: AIProvider[] = ['openai', 'anthropic', 'mistral', 'moonshot', 'deepseek', 'groq', 'openrouter', 'xai', 'minimax', 'qwen']
export const OCR_PROVIDERS: OCRProvider[] = ['mistral', 'deepseek']

export const DEFAULT_MODEL_IDS: Record<ModelRole, Partial<Record<ModelProvider, string>>> = {
  chat: {
    openai: 'gpt-4o',
    anthropic: 'claude-3-5-sonnet-20241022',
    mistral: 'mistral-large-latest',
    groq: 'llama-3.1-70b-versatile',
    moonshot: 'kimi-k2.5',
    openrouter: 'openai/gpt-4o',
    xai: 'grok-2-1212',
    minimax: 'MiniMax-Text-01',
    qwen: 'qwen-plus',
  },
  reasoning: {
    openai: 'o4-mini',
    anthropic: 'claude-3-7-sonnet-20250219',
    mistral: 'magistral-medium-latest',
    moonshot: 'kimi-k2-thinking',
    deepseek: 'deepseek-reasoner',
    groq: 'deepseek-r1-distill-llama-70b',
    openrouter: 'openai/o4-mini',
    xai: 'grok-3',
    minimax: 'MiniMax-Text-01',
    qwen: 'qwq-32b',
  },
  ocr: {
    mistral: 'mistral-ocr-latest',
    deepseek: 'deepseek-ai/DeepSeek-OCR',
  },
}

const bundled = (provider: ModelProvider, role: ModelRole, ids: string[]): ProviderRoleCatalog => ({
  provider,
  role,
  models: ids.map(id => ({ id, roles: [role], source: 'bundled' })),
  source: 'bundled',
})

export const BUNDLED_MODEL_CATALOG: ModelCatalog = {
  openai: {
    chat: bundled('openai', 'chat', [
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-4-turbo',
      'gpt-3.5-turbo',
    ]),
    reasoning: bundled('openai', 'reasoning', [
      'o4-mini',
      'o3',
      'o3-mini',
      'o1',
      'gpt-4o',
    ]),
  },
  anthropic: {
    chat: bundled('anthropic', 'chat', [
      'claude-opus-4-5',
      'claude-sonnet-4-5',
      'claude-3-7-sonnet-20250219',
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229',
      'claude-3-haiku-20240307',
    ]),
    reasoning: bundled('anthropic', 'reasoning', [
      'claude-3-7-sonnet-20250219',
      'claude-opus-4-5',
      'claude-sonnet-4-5',
      'claude-3-5-sonnet-20241022',
    ]),
  },
  mistral: {
    chat: bundled('mistral', 'chat', [
      'mistral-large-latest',
      'mistral-medium-latest',
      'mistral-small-latest',
      'open-mistral-nemo',
    ]),
    reasoning: bundled('mistral', 'reasoning', [
      'magistral-medium-latest',
      'magistral-small-latest',
    ]),
    ocr: bundled('mistral', 'ocr', [
      'mistral-ocr-latest',
      'mistral-ocr-2512',
    ]),
  },
  groq: {
    chat: bundled('groq', 'chat', [
      'openai/gpt-oss-120b',
      'openai/gpt-oss-20b',
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
      'groq/compound',
      'groq/compound-mini',
      'moonshotai/kimi-k2-instruct-0905',
      'qwen/qwen3-32b',
      'meta-llama/llama-4-scout-17b-16e-instruct',
      'openai/gpt-oss-safeguard-20b',
    ]),
    reasoning: bundled('groq', 'reasoning', [
      'qwen/qwen3-32b',
      'moonshotai/kimi-k2-instruct-0905',
      'deepseek-r1-distill-llama-70b',
      'llama-3.3-70b-versatile',
    ]),
  },
  moonshot: {
    chat: bundled('moonshot', 'chat', [
      'kimi-k2.5',
      'kimi-k2.6',
      'kimi-k2-0905-preview',
      'moonshot-v1-128k',
      'moonshot-v1-32k',
      'moonshot-v1-8k',
    ]),
    reasoning: bundled('moonshot', 'reasoning', [
      'kimi-k2-thinking',
      'kimi-k2-thinking-turbo',
      'kimi-k2.6',
      'kimi-k2.5',
    ]),
  },
  deepseek: {
    reasoning: bundled('deepseek', 'reasoning', [
      'deepseek-reasoner',
      'deepseek-v4-pro',
      'deepseek-v4-flash',
    ]),
    ocr: bundled('deepseek', 'ocr', [
      'deepseek-ai/DeepSeek-OCR',
    ]),
  },
  openrouter: {
    chat: bundled('openrouter', 'chat', [
      'openai/gpt-4o',
      'openai/gpt-4o-mini',
      'anthropic/claude-3-5-sonnet',
      'anthropic/claude-3-7-sonnet',
      'google/gemini-2.0-flash-001',
      'meta-llama/llama-3.3-70b-instruct',
    ]),
    reasoning: bundled('openrouter', 'reasoning', [
      'openai/o4-mini',
      'openai/o3-mini',
      'anthropic/claude-3-7-sonnet:thinking',
      'deepseek/deepseek-r1',
      'qwen/qwq-32b',
    ]),
  },
  xai: {
    chat: bundled('xai', 'chat', [
      'grok-3',
      'grok-3-mini',
      'grok-2-1212',
      'grok-2-vision-1212',
      'grok-beta',
    ]),
    reasoning: bundled('xai', 'reasoning', [
      'grok-3',
      'grok-3-mini',
      'grok-2-1212',
    ]),
  },
  minimax: {
    chat: bundled('minimax', 'chat', [
      'MiniMax-Text-01',
      'abab6.5s-chat',
      'abab6-chat',
    ]),
    reasoning: bundled('minimax', 'reasoning', [
      'MiniMax-Text-01',
    ]),
  },
  qwen: {
    chat: bundled('qwen', 'chat', [
      'qwen-plus',
      'qwen-turbo',
      'qwen-max',
      'qwen-coder-plus',
    ]),
    reasoning: bundled('qwen', 'reasoning', [
      'qwq-32b',
      'qwen3-32b',
      'qwen-max',
    ]),
  },
}

export function getBundledProviderRole(provider: ModelProvider, role: ModelRole): ProviderRoleCatalog {
  return BUNDLED_MODEL_CATALOG[provider]?.[role] ?? bundled(provider, role, [])
}

export function getDefaultModelId(provider: ModelProvider, role: ModelRole): string {
  return DEFAULT_MODEL_IDS[role][provider] || getBundledProviderRole(provider, role).models[0]?.id || ''
}

function isReasoningLikeModelId(model: string): boolean {
  const m = model.toLowerCase()
  if (m.startsWith('o1') || m.startsWith('o3') || m.startsWith('o4')) return true
  if (m.includes('claude-3-7') || m.includes('claude-4') || m.includes('claude-opus-4')) return true
  if (m.includes('magistral') || m.includes('reason')) return true
  if (m.includes('thinking')) return true
  if (m.includes('k2.5') || m.includes('k2.6')) return true
  if (m.includes('deepseek-r1') || m.includes('qwq') || m.includes('qwen3')) return true
  if (m.includes('reasoner') || m.includes('r1') || m.includes('v4')) return true
  return false
}

export function isReasoningModelId(provider: ModelProvider, model: string): boolean {
  const m = model.toLowerCase()

  if (provider === 'openrouter') {
    const slashIndex = m.indexOf('/')
    const suffix = slashIndex >= 0 ? m.slice(slashIndex + 1) : m
    return isReasoningLikeModelId(suffix)
  }

  if (provider === 'xai') return m.includes('grok-3') || m.includes('reason')
  if (provider === 'minimax') return m.includes('reason')
  if (provider === 'qwen') return m.includes('qwq') || m.includes('qwen3') || m.includes('reason')

  if (provider === 'openai') return m.startsWith('o1') || m.startsWith('o3') || m.startsWith('o4')
  if (provider === 'anthropic') return m.includes('claude-3-7') || m.includes('claude-4') || m.includes('claude-opus-4')
  if (provider === 'groq') return m.includes('deepseek-r1') || m.includes('qwq') || m.includes('qwen3') || m.includes('kimi')
  if (provider === 'moonshot') return m.includes('thinking') || m.includes('k2.5') || m.includes('k2.6')
  if (provider === 'deepseek') return m.includes('reasoner') || m.includes('r1') || m.includes('v4')
  if (provider === 'mistral') return m.includes('magistral') || m.includes('reason')
  return false
}

export function isOcrModelId(provider: ModelProvider, model: string): boolean {
  const m = model.toLowerCase()
  if (provider === 'mistral') return m.includes('ocr')
  if (provider === 'deepseek') return m.includes('ocr')
  return false
}
