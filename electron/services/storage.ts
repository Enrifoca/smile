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

interface UserProfile {
  style: 'technical' | 'conversational' | 'balanced'
  verbosity: 'concise' | 'detailed' | 'balanced'
  tone: 'formal' | 'casual' | 'balanced'
  writingPatterns: {
    commonPhrases: string[]
    taskFormat: string
    commentStyle: string
  }
  focusProjects: string[]
  confirmAllJiraActions: boolean
  onboardingCompleted: boolean
}

// Jira metadata types (mirrored from src/types/jira.ts for electron process)
interface JiraProject {
  id: string
  key: string
  name: string
  projectTypeKey: string
  avatarUrl?: string
  description?: string
}

interface JiraIssueType {
  id: string
  name: string
  description?: string
  subtask: boolean
  hierarchyLevel: number
  iconUrl?: string
}

interface JiraCustomField {
  id: string
  key: string
  name: string
  type: string
  custom: boolean
  required: boolean
  hasDefaultValue: boolean
  defaultValue?: unknown
  allowedValues?: Array<{ id: string; value: string; name?: string }>
  schema: {
    type: string
    items?: string
    custom?: string
    customId?: number
    system?: string
  }
}

interface JiraProjectMetadata {
  project: JiraProject
  issueTypes: JiraIssueType[]
  fieldsByIssueType: Record<string, JiraCustomField[]>
}

interface JiraMetadataStore {
  monitoredProjects: JiraProject[]
  projectMetadata: Record<string, JiraProjectMetadata>
  standardFields: JiraCustomField[]
  users?: Array<{ accountId: string; displayName: string; emailAddress?: string; avatarUrl?: string; active: boolean }>
  lastSynced: string | null
  syncedProjects: string[]
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
  // Jira metadata (pre-fetched for agent knowledge)
  jiraMetadata: JiraMetadataStore
  
  // Connection mode
  jiraConnectionMode: 'api' | 'mcp' | null

  // Cached provider model lists
  modelCatalog: ModelCatalog | null

  // User-defined project contexts (Context management).
  contexts: ProjectContext[]

  // Prompt-ready connector knowledge cached per context+connector.
  // Key: `${contextId}:${connectorId}` → Markdown.
  connectorKnowledge: Record<string, string>

  // Encrypted data (stored as encrypted strings)
  'encrypted:aiConfig': string
  'encrypted:ocrConfig': string
}

const defaultUserProfile: UserProfile = {
  style: 'balanced',
  verbosity: 'balanced',
  tone: 'balanced',
  writingPatterns: {
    commonPhrases: [],
    taskFormat: '',
    commentStyle: ''
  },
  focusProjects: [],
  confirmAllJiraActions: true,
  onboardingCompleted: false
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
        jiraMetadata: {
          monitoredProjects: [],
          projectMetadata: {},
          standardFields: [],
          users: [],
          lastSynced: null,
          syncedProjects: []
        },
        jiraConnectionMode: null,
        modelCatalog: null,
        contexts: [],
        connectorKnowledge: {},
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

  // Jira Metadata
  getJiraMetadata(): JiraMetadataStore {
    return this.store.get('jiraMetadata')
  }

  setJiraMetadata(metadata: JiraMetadataStore): void {
    this.store.set('jiraMetadata', metadata)
  }

  clearJiraMetadata(): void {
    this.store.set('jiraMetadata', {
      monitoredProjects: [],
      projectMetadata: {},
      standardFields: [],
      users: [],
      lastSynced: null,
      syncedProjects: []
    })
  }

  // Set monitored projects (user selection)
  setMonitoredProjects(projects: JiraProject[]): void {
    const current = this.getJiraMetadata()
    this.store.set('jiraMetadata', {
      ...current,
      monitoredProjects: projects
    })
  }

  // Update project metadata after sync
  updateProjectMetadata(projectKey: string, metadata: JiraProjectMetadata): void {
    const current = this.getJiraMetadata()
    this.store.set('jiraMetadata', {
      ...current,
      projectMetadata: {
        ...current.projectMetadata,
        [projectKey]: metadata
      },
      syncedProjects: [...new Set([...current.syncedProjects, projectKey])],
      lastSynced: new Date().toISOString()
    })
  }

  // Update users/team members
  setJiraUsers(users: Array<{ accountId: string; displayName: string; emailAddress?: string; avatarUrl?: string; active: boolean }>): void {
    const current = this.getJiraMetadata()
    this.store.set('jiraMetadata', {
      ...current,
      users,
      lastSynced: new Date().toISOString()
    })
  }

  // Get connection mode
  getJiraConnectionMode(): 'api' | 'mcp' | null {
    return this.store.get('jiraConnectionMode')
  }

  setJiraConnectionMode(mode: 'api' | 'mcp' | null): void {
    this.store.set('jiraConnectionMode', mode)
  }

  // Clear all data
  clearAll(): void {
    this.store.clear()
  }
}
