import Store from 'electron-store'
import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { EncryptionService } from './encryption'
import { ModelCatalog } from '../../src/shared/modelCatalog'
import { ProjectContext } from '../../src/context/types'

interface AIConfig {
  provider: 'openai' | 'anthropic' | 'mistral' | 'groq' | 'moonshot' | 'deepseek'
  apiKey: string
  model?: string
}

interface OCRConfig {
  provider: 'mistral' | 'deepseek'
  apiKey: string
  model?: string
}

interface UserProfileStore {
  styleSpectrum?: number
  detailSpectrum?: number
  toneSpectrum?: number
  focusProjects?: string[]
  confirmAllConnectorActions?: boolean
}

interface StorageSchema {
  // Non-sensitive data
  workspacePath: string | null
  userProfile: UserProfile | null
  chatHistory: Array<{
    id: string
    title: string
    date: string
    messages: Array<{
      role: 'user' | 'assistant'
      content: string
      timestamp: string
    }>
  }>
  // Cached provider model lists
  modelCatalog: ModelCatalog | null

  // User-defined project contexts (Context management).
  contexts: ProjectContext[]

  /** Globally active project context id, or null. */
  activeContextId: string | null

  /** When false, skip Atlassian MCP auto-connect until the user connects again manually. */
  atlassianMcpAutoConnect: boolean | null

  // Prompt-ready connector knowledge cached per context+connector.
  // Key: `${contextId}:${connectorId}` → Markdown.
  connectorKnowledge: Record<string, string>

  // Agent loop settings
  agentLightThinking: boolean
  agentAutoMemoryReview: boolean
  agentParallelReads: boolean
  agentContextWindow: number
  agentMemoryReviewModel: AIConfig | null

  // Encrypted data (stored as encrypted strings)
  'encrypted:aiConfig': string
  'encrypted:ocrConfig': string
}

const defaultUserProfile: UserProfile = {
  styleSpectrum: 50,
  detailSpectrum: 50,
  toneSpectrum: 50,
  focusProjects: [],
  confirmAllConnectorActions: true,
}

/**
 * One-time migration of the persisted store file from the legacy project name
 * ('mirai-data.json') to the current one ('smile-data.json'). Best-effort: on any
 * failure we fall back to a fresh store rather than blocking startup.
 */
function migrateLegacyStoreFile(): void {
  try {
    const userData = app.getPath('userData')
    const currentPath = path.join(userData, 'smile-data.json')
    const legacyPath = path.join(userData, 'mirai-data.json')
    if (!fs.existsSync(currentPath) && fs.existsSync(legacyPath)) {
      fs.copyFileSync(legacyPath, currentPath)
    }
  } catch {
    // ignore — a fresh store will be created
  }
}

export class StorageService {
  private store: Store<StorageSchema>
  private encryption: EncryptionService

  constructor(encryption: EncryptionService) {
    this.encryption = encryption
    migrateLegacyStoreFile()
    this.store = new Store<StorageSchema>({
      name: 'smile-data',
      defaults: {
        workspacePath: null,
        userProfile: null,
        chatHistory: [],
        modelCatalog: null,
        contexts: [],
        activeContextId: null,
        atlassianMcpAutoConnect: null,
        connectorKnowledge: {},
        agentLightThinking: true,
        agentAutoMemoryReview: false,
        agentParallelReads: true,
        agentContextWindow: 128000,
        agentMemoryReviewModel: null,
        'encrypted:aiConfig': '',
        'encrypted:ocrConfig': ''
      }
    })
  }

  // Generic get/set
  get<K extends keyof StorageSchema>(key: K): StorageSchema[K] {
    return this.store.get(key)
  }

  set<K extends keyof StorageSchema>(key: K, value: StorageSchema[K]): void {
    this.store.set(key, value)
  }

  // Project contexts (Context management)
  getContexts(): ProjectContext[] {
    return this.store.get('contexts') || []
  }

  saveContext(context: ProjectContext): ProjectContext[] {
    const all = this.getContexts()
    const index = all.findIndex(item => item.id === context.id)
    if (index >= 0) all[index] = context
    else all.push(context)
    this.store.set('contexts', all)
    return all
  }

  deleteContext(contextId: string): ProjectContext[] {
    const all = this.getContexts().filter(item => item.id !== contextId)
    this.store.set('contexts', all)
    return all
  }

  // Connector knowledge cache (per context+connector)
  getConnectorKnowledge(contextId: string, connectorId: string): string | null {
    const all = this.store.get('connectorKnowledge')
    return all?.[`${contextId}:${connectorId}`] ?? null
  }

  setConnectorKnowledge(contextId: string, connectorId: string, markdown: string): void {
    const all = { ...this.store.get('connectorKnowledge') }
    all[`${contextId}:${connectorId}`] = markdown
    this.store.set('connectorKnowledge', all)
  }

  // Secure get/set (encrypted)
  getSecure(key: string): string | null {
    const encryptedKey = `encrypted:${key}` as keyof StorageSchema
    const encrypted = this.store.get(encryptedKey) as string
    if (!encrypted) return null
    try {
      return this.encryption.decrypt(encrypted)
    } catch {
      return null
    }
  }

  setSecure(key: string, value: string): void {
    const encryptedKey = `encrypted:${key}` as keyof StorageSchema
    const encrypted = this.encryption.encrypt(value)
    this.store.set(encryptedKey, encrypted)
  }

  // AI config
  async getAIConfig(): Promise<AIConfig | null> {
    const encrypted = this.store.get('encrypted:aiConfig')
    if (!encrypted) return null
    try {
      const decrypted = this.encryption.decrypt(encrypted)
      return JSON.parse(decrypted) as AIConfig
    } catch {
      return null
    }
  }

  async setAIConfig(config: AIConfig): Promise<void> {
    const encrypted = this.encryption.encrypt(JSON.stringify(config))
    this.store.set('encrypted:aiConfig', encrypted)
  }

  getModelCatalog(): ModelCatalog | null {
    return this.store.get('modelCatalog') || null
  }

  setModelCatalog(catalog: ModelCatalog): void {
    this.store.set('modelCatalog', catalog)
  }

  async getOCRConfig(): Promise<OCRConfig | null> {
    const encrypted = this.store.get('encrypted:ocrConfig')
    if (!encrypted) return null
    try {
      const decrypted = this.encryption.decrypt(encrypted)
      return JSON.parse(decrypted) as OCRConfig
    } catch {
      return null
    }
  }

  // Workspace
  getWorkspacePath(): string | null {
    return this.store.get('workspacePath')
  }

  setWorkspacePath(path: string): void {
    this.store.set('workspacePath', path)
  }

  // User Profile
  getUserProfile(): UserProfile {
    return this.store.get('userProfile') || defaultUserProfile
  }

  setUserProfile(profile: Partial<UserProfile>): void {
    const current = this.getUserProfile()
    this.store.set('userProfile', { ...current, ...profile })
  }

  // Chat History
  getChatHistory() {
    return this.store.get('chatHistory')
  }

  addChat(chat: StorageSchema['chatHistory'][0]): void {
    const history = this.getChatHistory()
    history.unshift(chat)
    // Keep only last 100 chats
    if (history.length > 100) {
      history.pop()
    }
    this.store.set('chatHistory', history)
  }

  updateChat(chatId: string, messages: StorageSchema['chatHistory'][0]['messages']): void {
    const history = this.getChatHistory()
    const index = history.findIndex(c => c.id === chatId)
    if (index !== -1) {
      history[index].messages = messages
      this.store.set('chatHistory', history)
    }
  }

  deleteChat(chatId: string): void {
    const history = this.getChatHistory()
    this.store.set('chatHistory', history.filter(c => c.id !== chatId))
  }

  // Clear all data
  clearAll(): void {
    this.store.clear()
  }
}
