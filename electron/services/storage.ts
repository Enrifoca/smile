import Store from 'electron-store'
import { EncryptionService } from './encryption'

interface JiraConfig {
  baseUrl: string
  email: string
  apiToken: string
}

interface AIConfig {
  provider: 'openai' | 'anthropic' | 'groq'
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
  
  // Encrypted data (stored as encrypted strings)
  'encrypted:jiraConfig': string
  'encrypted:aiConfig': string
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

export class StorageService {
  private store: Store<StorageSchema>
  private encryption: EncryptionService

  constructor(encryption: EncryptionService) {
    this.encryption = encryption
    this.store = new Store<StorageSchema>({
      name: 'mirai-data',
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
        'encrypted:jiraConfig': '',
        'encrypted:aiConfig': ''
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

  // Jira config
  async getJiraConfig(): Promise<JiraConfig | null> {
    const encrypted = this.store.get('encrypted:jiraConfig')
    if (!encrypted) return null
    try {
      const decrypted = this.encryption.decrypt(encrypted)
      return JSON.parse(decrypted) as JiraConfig
    } catch {
      return null
    }
  }

  async setJiraConfig(config: JiraConfig): Promise<void> {
    const encrypted = this.encryption.encrypt(JSON.stringify(config))
    this.store.set('encrypted:jiraConfig', encrypted)
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
