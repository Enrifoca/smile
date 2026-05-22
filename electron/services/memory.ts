/**
 * Memory Service
 * 
 * Handles reading/writing memory files (.md) in the user's workspace.
 * Memories are stored in .smile/memories/ folder.
 */

import * as fs from 'fs'
import * as path from 'path'

// Memory types (duplicated here to avoid import issues in main process)
interface MemoryEntry {
  id: string
  content: string
  createdAt: string
  updatedAt: string
  source: 'learned' | 'user'
}

interface IssueExample {
  issueKey: string
  summary: string
  description?: string
  createdAt: string
  customFields?: Record<string, unknown>
}

interface IssueTypeMemory {
  issueTypeName: string
  issueTypeId: string
  examples: IssueExample[]
  patterns?: {
    avgSummaryLength?: number
    avgDescriptionLength?: number
    commonWords?: string[]
    structureNotes?: string[]
  }
  updatedAt: string
}

interface MemoryStore {
  userMarkdown: string
  general: { entries: MemoryEntry[] }
  lexicon: { entries: MemoryEntry[]; commonPhrases: string[]; vocabularyNotes: string[] }
  issueTypes: Record<string, IssueTypeMemory>
  lastSyncedAt: string | null
  version: number
}

const DEFAULT_USER_MARKDOWN = ''

const DEFAULT_MEMORY: MemoryStore = {
  userMarkdown: DEFAULT_USER_MARKDOWN,
  general: { entries: [] },
  lexicon: { entries: [], commonPhrases: [], vocabularyNotes: [] },
  issueTypes: {},
  lastSyncedAt: null,
  version: 2,
}

export class MemoryService {
  private workspacePath: string | null = null
  private memoryCache: MemoryStore | null = null

  constructor() {}

  /**
   * Set the workspace path
   */
  setWorkspace(workspacePath: string): void {
    this.workspacePath = workspacePath
    this.memoryCache = null // Clear cache when workspace changes
  }

  /**
   * Get the memories directory path
   */
  private getMemoriesDir(): string | null {
    if (!this.workspacePath) return null
    return path.join(this.workspacePath, '.smile', 'memories')
  }

  /**
   * Ensure the memories directory exists
   */
  private ensureMemoriesDir(): boolean {
    const dir = this.getMemoriesDir()
    if (!dir) return false

    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      // Also create issue-types subdirectory
      const issueTypesDir = path.join(dir, 'issue-types')
      if (!fs.existsSync(issueTypesDir)) {
        fs.mkdirSync(issueTypesDir, { recursive: true })
      }
      return true
    } catch (error) {
      console.error('[Memory] Failed to create memories directory:', error)
      return false
    }
  }

  /**
   * Read a markdown file
   */
  private readMarkdownFile(filePath: string): string | null {
    try {
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, 'utf-8')
      }
      return null
    } catch (error) {
      console.error(`[Memory] Failed to read ${filePath}:`, error)
      return null
    }
  }

  /**
   * Write a markdown file
   */
  private writeMarkdownFile(filePath: string, content: string): boolean {
    try {
      const dir = path.dirname(filePath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      fs.writeFileSync(filePath, content, 'utf-8')
      return true
    } catch (error) {
      console.error(`[Memory] Failed to write ${filePath}:`, error)
      return false
    }
  }

  /**
   * Load all memories from disk
   */
  async loadMemories(): Promise<MemoryStore> {
    if (!this.ensureMemoriesDir()) {
      return { ...DEFAULT_MEMORY }
    }

    const dir = this.getMemoriesDir()!
    const memory: MemoryStore = {
      userMarkdown: DEFAULT_USER_MARKDOWN,
      general: { entries: [] },
      lexicon: { entries: [], commonPhrases: [], vocabularyNotes: [] },
      issueTypes: {},
      lastSyncedAt: null,
      version: 2,
    }

    // User-owned memory is plain Markdown and highest priority. If this file
    // does not exist yet, migrate old user-facing general/lexicon bullets into it.
    const userPath = path.join(dir, 'user.md')
    const userContent = this.readMarkdownFile(userPath)
    if (userContent) {
      memory.userMarkdown = userContent
    } else {
      memory.userMarkdown = this.buildUserMarkdownFromLegacyFiles(dir)
      this.writeMarkdownFile(userPath, memory.userMarkdown)
    }

    // Learned notes are lower priority and separate from user-owned Markdown.
    const learnedPath = path.join(dir, 'learned.md')
    const learnedContent = this.readMarkdownFile(learnedPath)
    if (learnedContent) {
      const learned = this.parseLearnedMarkdown(learnedContent)
      memory.general.entries = learned.general
      memory.lexicon.entries = learned.lexicon
      memory.lexicon.commonPhrases = learned.commonPhrases
      memory.lexicon.vocabularyNotes = learned.vocabularyNotes
    }

    // Load issue type files
    const issueTypesDir = path.join(dir, 'issue-types')
    if (fs.existsSync(issueTypesDir)) {
      const files = fs.readdirSync(issueTypesDir)
      for (const file of files) {
        if (file.endsWith('.md')) {
          const filePath = path.join(issueTypesDir, file)
          const content = this.readMarkdownFile(filePath)
          if (content) {
            const issueType = this.parseIssueTypeFromMarkdown(content, file.replace('.md', ''))
            if (issueType) {
              memory.issueTypes[issueType.issueTypeName] = issueType
            }
          }
        }
      }
    }

    // Load metadata (last synced, etc.)
    const metaPath = path.join(dir, '.meta.json')
    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
        memory.lastSyncedAt = meta.lastSyncedAt || null
        memory.version = meta.version || 1
      } catch {
        // Ignore meta parsing errors
      }
    }

    this.memoryCache = memory
    return memory
  }

  /**
   * Save all memories to disk
   */
  async saveMemories(memory: MemoryStore): Promise<boolean> {
    if (!this.ensureMemoriesDir()) {
      return false
    }

    const dir = this.getMemoriesDir()!
    const normalizedMemory: MemoryStore = {
      ...memory,
      userMarkdown: memory.userMarkdown || DEFAULT_USER_MARKDOWN,
      version: 2,
    }

    // Save user-owned Markdown and learned notes separately.
    this.writeMarkdownFile(path.join(dir, 'user.md'), normalizedMemory.userMarkdown)
    this.writeMarkdownFile(path.join(dir, 'learned.md'), this.memoryToLearnedMarkdown(normalizedMemory))

    // Save issue type files
    const issueTypesDir = path.join(dir, 'issue-types')
    for (const [name, issueType] of Object.entries(normalizedMemory.issueTypes)) {
      const fileName = this.sanitizeFileName(name) + '.md'
      const content = this.issueTypeToMarkdown(issueType)
      this.writeMarkdownFile(path.join(issueTypesDir, fileName), content)
    }

    // Save metadata
    const meta = {
      lastSyncedAt: normalizedMemory.lastSyncedAt,
      version: 2,
    }
    this.writeMarkdownFile(path.join(dir, '.meta.json'), JSON.stringify(meta, null, 2))

    this.memoryCache = normalizedMemory
    return true
  }

  /**
   * Get cached memories or load from disk
   */
  async getMemories(): Promise<MemoryStore> {
    // Memory is a context-control surface. Always load from disk so manual edits
    // in .smile/memories/user.md are reflected before the next agent response.
    return this.loadMemories()
  }

  async saveUserMemory(markdown: string): Promise<boolean> {
    const memory = await this.getMemories()
    memory.userMarkdown = markdown
    return this.saveMemories(memory)
  }

  /**
   * Add a general memory entry
   */
  async addGeneralMemory(content: string, source: 'learned' | 'user' = 'learned'): Promise<boolean> {
    const memory = await this.getMemories()
    
    // Check if similar memory already exists
    const exists = memory.general.entries.some(e => 
      e.content.toLowerCase() === content.toLowerCase()
    )
    if (exists) return true

    memory.general.entries.push({
      id: this.generateId(),
      content,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source,
    })

    return this.saveMemories(memory)
  }

  /**
   * Add a lexicon entry
   */
  async addLexiconEntry(content: string, source: 'learned' | 'user' = 'learned'): Promise<boolean> {
    const memory = await this.getMemories()
    
    const exists = memory.lexicon.entries.some(e => 
      e.content.toLowerCase() === content.toLowerCase()
    )
    if (exists) return true

    memory.lexicon.entries.push({
      id: this.generateId(),
      content,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source,
    })

    return this.saveMemories(memory)
  }

  /**
   * Add a common phrase to lexicon
   */
  async addCommonPhrase(phrase: string): Promise<boolean> {
    const memory = await this.getMemories()
    
    if (!memory.lexicon.commonPhrases.includes(phrase)) {
      memory.lexicon.commonPhrases.push(phrase)
      // Keep max 50 phrases
      if (memory.lexicon.commonPhrases.length > 50) {
        memory.lexicon.commonPhrases = memory.lexicon.commonPhrases.slice(-50)
      }
      return this.saveMemories(memory)
    }
    return true
  }

  /**
   * Add an issue example to an issue type memory
   */
  async addIssueExample(
    issueTypeName: string,
    issueTypeId: string,
    example: IssueExample
  ): Promise<boolean> {
    const memory = await this.getMemories()

    // Initialize issue type if not exists
    if (!memory.issueTypes[issueTypeName]) {
      memory.issueTypes[issueTypeName] = {
        issueTypeName,
        issueTypeId,
        examples: [],
        updatedAt: new Date().toISOString(),
      }
    }

    const issueType = memory.issueTypes[issueTypeName]

    // Check if this issue already exists
    const existingIndex = issueType.examples.findIndex(e => e.issueKey === example.issueKey)
    if (existingIndex >= 0) {
      // Update existing
      issueType.examples[existingIndex] = example
    } else {
      // Add new, keeping max 10
      issueType.examples.push(example)
      if (issueType.examples.length > 10) {
        // Remove oldest
        issueType.examples = issueType.examples.slice(-10)
      }
    }

    issueType.updatedAt = new Date().toISOString()
    return this.saveMemories(memory)
  }

  /**
   * Bulk add issue examples (for initial sync)
   */
  async syncIssueExamples(
    issueTypeName: string,
    issueTypeId: string,
    examples: IssueExample[]
  ): Promise<boolean> {
    const memory = await this.getMemories()

    memory.issueTypes[issueTypeName] = {
      issueTypeName,
      issueTypeId,
      examples: examples.slice(0, 10), // Max 10
      updatedAt: new Date().toISOString(),
    }

    return this.saveMemories(memory)
  }

  /**
   * Update last synced timestamp
   */
  async updateLastSynced(): Promise<boolean> {
    const memory = await this.getMemories()
    memory.lastSyncedAt = new Date().toISOString()
    return this.saveMemories(memory)
  }

  /**
   * Delete a general memory entry
   */
  async deleteGeneralMemory(id: string): Promise<boolean> {
    const memory = await this.getMemories()
    memory.general.entries = memory.general.entries.filter(e => e.id !== id)
    return this.saveMemories(memory)
  }

  /**
   * Delete a lexicon entry
   */
  async deleteLexiconEntry(id: string): Promise<boolean> {
    const memory = await this.getMemories()
    memory.lexicon.entries = memory.lexicon.entries.filter(e => e.id !== id)
    return this.saveMemories(memory)
  }

  /**
   * Update a memory entry
   */
  async updateMemoryEntry(
    category: 'general' | 'lexicon',
    id: string,
    content: string
  ): Promise<boolean> {
    const memory = await this.getMemories()
    
    const entries = category === 'general' ? memory.general.entries : memory.lexicon.entries
    const entry = entries.find(e => e.id === id)
    
    if (entry) {
      entry.content = content
      entry.updatedAt = new Date().toISOString()
      entry.source = 'user' // Mark as user-edited
      return this.saveMemories(memory)
    }
    return false
  }

  // ========== Parsing Helpers ==========

  private buildUserMarkdownFromLegacyFiles(dir: string): string {
    const seen = new Set<string>()
    const standing: string[] = []
    const lexicon: string[] = []

    const addUnique = (target: string[], value: string): void => {
      const normalized = value.trim().replace(/\s+/g, ' ').toLowerCase()
      if (!value.trim() || seen.has(normalized)) return
      seen.add(normalized)
      target.push(value.trim())
    }

    const generalContent = this.readMarkdownFile(path.join(dir, 'general.md'))
    if (generalContent) {
      for (const entry of this.parseEntriesFromMarkdown(generalContent, 'user')) {
        addUnique(standing, entry.content)
      }
    }

    const lexiconContent = this.readMarkdownFile(path.join(dir, 'lexicon.md'))
    if (lexiconContent) {
      const parsed = this.parseLexiconFromMarkdown(lexiconContent, 'user')
      for (const entry of parsed.entries) addUnique(lexicon, entry.content)
      for (const phrase of parsed.commonPhrases) addUnique(lexicon, `Preferred phrase: "${phrase}"`)
      for (const note of parsed.vocabularyNotes) addUnique(lexicon, note)
    }

    const lines: string[] = []
    if (standing.length > 0) {
      lines.push('## Standing Instructions')
      for (const item of standing) lines.push(`- ${item}`)
    }

    if (lexicon.length > 0) {
      if (lines.length > 0) lines.push('')
      lines.push('## Lexicon & Style')
      for (const item of lexicon) lines.push(`- ${item}`)
    }

    return lines.join('\n').trim()
  }

  private parseEntriesFromMarkdown(content: string, source: 'learned' | 'user' = 'user'): MemoryEntry[] {
    const entries: MemoryEntry[] = []
    const lines = content.split('\n')
    
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.startsWith('- ') && !trimmed.startsWith('- _')) {
        const entryContent = trimmed.substring(2).trim()
        if (entryContent && !entryContent.startsWith('"')) {
          entries.push({
            id: this.generateId(),
            content: entryContent,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            source,
          })
        }
      }
    }
    return entries
  }

  private parseLexiconFromMarkdown(content: string, source: 'learned' | 'user' = 'user'): {
    entries: MemoryEntry[]
    commonPhrases: string[]
    vocabularyNotes: string[]
  } {
    const result = {
      entries: [] as MemoryEntry[],
      commonPhrases: [] as string[],
      vocabularyNotes: [] as string[],
    }

    const lines = content.split('\n')
    let currentSection = ''

    for (const line of lines) {
      const trimmed = line.trim()
      
      if (trimmed.startsWith('## ')) {
        currentSection = trimmed.substring(3).toLowerCase()
      } else if (trimmed.startsWith('- ')) {
        const value = trimmed.substring(2).trim()
        
        if (currentSection.includes('phrase') && value.startsWith('"')) {
          result.commonPhrases.push(value.replace(/^"|"$/g, ''))
        } else if (currentSection.includes('vocabulary')) {
          result.vocabularyNotes.push(value)
        } else if (currentSection.includes('style') || currentSection === '') {
          result.entries.push({
            id: this.generateId(),
            content: value,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            source,
          })
        }
      }
    }

    return result
  }

  private parseLearnedMarkdown(content: string): {
    general: MemoryEntry[]
    lexicon: MemoryEntry[]
    commonPhrases: string[]
    vocabularyNotes: string[]
  } {
    const result = {
      general: [] as MemoryEntry[],
      lexicon: [] as MemoryEntry[],
      commonPhrases: [] as string[],
      vocabularyNotes: [] as string[],
    }
    const lines = content.split('\n')
    let currentSection = ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.startsWith('## ')) {
        currentSection = trimmed.substring(3).toLowerCase()
        continue
      }
      if (!trimmed.startsWith('- ')) continue

      const value = trimmed.substring(2).trim()
      if (!value || value.startsWith('_')) continue

      if (currentSection.includes('phrase')) {
        result.commonPhrases.push(value.replace(/^"|"$/g, ''))
      } else if (currentSection.includes('vocabulary')) {
        result.vocabularyNotes.push(value)
      } else {
        const entry: MemoryEntry = {
          id: this.generateId(),
          content: value,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          source: 'learned',
        }
        if (currentSection.includes('lexicon') || currentSection.includes('style')) {
          result.lexicon.push(entry)
        } else {
          result.general.push(entry)
        }
      }
    }

    return result
  }

  private parseIssueTypeFromMarkdown(content: string, fileName: string): IssueTypeMemory | null {
    const examples: IssueExample[] = []
    const lines = content.split('\n')
    
    let issueTypeName = fileName
    let currentExample: Partial<IssueExample> | null = null
    let inDescription = false
    let descriptionLines: string[] = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const trimmed = line.trim()

      // Extract issue type name from title
      if (trimmed.startsWith('# ') && trimmed.includes(' - ')) {
        issueTypeName = trimmed.substring(2).split(' - ')[0].trim()
      }

      // New example
      if (trimmed.startsWith('## Example')) {
        // Save previous example
        if (currentExample?.issueKey && currentExample?.summary) {
          if (inDescription && descriptionLines.length > 0) {
            currentExample.description = descriptionLines.join('\n')
          }
          examples.push(currentExample as IssueExample)
        }
        
        // Parse issue key from title (e.g., "## Example 1: PROJ-123")
        const match = trimmed.match(/:\s*([A-Z]+-\d+)/)
        currentExample = {
          issueKey: match ? match[1] : `UNKNOWN-${i}`,
          createdAt: new Date().toISOString(),
        }
        inDescription = false
        descriptionLines = []
      }

      // Summary
      if (trimmed.startsWith('**Summary:**') && currentExample) {
        currentExample.summary = trimmed.replace('**Summary:**', '').trim()
      }

      // Description block
      if (trimmed === '**Description:**') {
        inDescription = true
        descriptionLines = []
      } else if (trimmed === '```' && inDescription) {
        // Toggle code block
        if (descriptionLines.length > 0 && descriptionLines[descriptionLines.length - 1] !== '```') {
          // End of description
          inDescription = false
        }
      } else if (inDescription && trimmed !== '```') {
        descriptionLines.push(line)
      }
    }

    // Don't forget last example
    if (currentExample?.issueKey && currentExample?.summary) {
      if (inDescription && descriptionLines.length > 0) {
        currentExample.description = descriptionLines.join('\n')
      }
      examples.push(currentExample as IssueExample)
    }

    return {
      issueTypeName,
      issueTypeId: '', // Will be filled from Jira metadata
      examples,
      updatedAt: new Date().toISOString(),
    }
  }

  // ========== Markdown Generation ==========

  private memoryToLearnedMarkdown(memory: MemoryStore): string {
    const lines = ['# Learned Memory', '']
    const learnedGeneral = memory.general.entries.filter(entry => entry.source === 'learned')
    const learnedLexicon = memory.lexicon.entries.filter(entry => entry.source === 'learned')

    lines.push('## General Learned Notes')
    if (learnedGeneral.length > 0) {
      for (const entry of learnedGeneral) lines.push(`- ${entry.content}`)
    } else {
      lines.push('_No learned general notes yet._')
    }
    lines.push('')

    lines.push('## Lexicon Learned Notes')
    if (learnedLexicon.length > 0) {
      for (const entry of learnedLexicon) lines.push(`- ${entry.content}`)
    } else {
      lines.push('_No learned lexicon notes yet._')
    }
    lines.push('')

    if (memory.lexicon.commonPhrases.length > 0) {
      lines.push('## Common Phrases')
      for (const phrase of memory.lexicon.commonPhrases) lines.push(`- "${phrase}"`)
      lines.push('')
    }

    if (memory.lexicon.vocabularyNotes.length > 0) {
      lines.push('## Vocabulary')
      for (const note of memory.lexicon.vocabularyNotes) lines.push(`- ${note}`)
      lines.push('')
    }

    return lines.join('\n').trimEnd() + '\n'
  }

  private memoryToGeneralMarkdown(general: { entries: MemoryEntry[] }): string {
    const lines = ['# General Memory', '']
    
    if (general.entries.length > 0) {
      for (const entry of general.entries) {
        lines.push(`- ${entry.content}`)
      }
    } else {
      lines.push('_No memories yet. The agent will learn your preferences over time._')
    }
    
    return lines.join('\n')
  }

  private memoryToLexiconMarkdown(lexicon: {
    entries: MemoryEntry[]
    commonPhrases: string[]
    vocabularyNotes: string[]
  }): string {
    const lines = ['# Lexicon & Writing Style', '']
    
    if (lexicon.entries.length > 0) {
      lines.push('## Style Notes')
      for (const entry of lexicon.entries) {
        lines.push(`- ${entry.content}`)
      }
      lines.push('')
    }
    
    if (lexicon.commonPhrases.length > 0) {
      lines.push('## Common Phrases')
      for (const phrase of lexicon.commonPhrases) {
        lines.push(`- "${phrase}"`)
      }
      lines.push('')
    }
    
    if (lexicon.vocabularyNotes.length > 0) {
      lines.push('## Vocabulary')
      for (const note of lexicon.vocabularyNotes) {
        lines.push(`- ${note}`)
      }
    }
    
    if (lines.length === 2) {
      lines.push('_No lexicon learned yet. The agent will analyze your writing style._')
    }
    
    return lines.join('\n')
  }

  private issueTypeToMarkdown(issueType: IssueTypeMemory): string {
    const lines = [`# ${issueType.issueTypeName} - Writing Examples`, '']
    
    if (issueType.examples.length > 0) {
      lines.push(`_${issueType.examples.length} example(s) • Last updated: ${issueType.updatedAt}_`)
      lines.push('')
      
      for (let i = 0; i < issueType.examples.length; i++) {
        const ex = issueType.examples[i]
        lines.push(`## Example ${i + 1}: ${ex.issueKey}`)
        lines.push('')
        lines.push(`**Summary:** ${ex.summary}`)
        lines.push('')
        if (ex.description) {
          lines.push('**Description:**')
          lines.push('```')
          lines.push(ex.description)
          lines.push('```')
          lines.push('')
        }
      }
    } else {
      lines.push('_No examples yet._')
    }
    
    return lines.join('\n')
  }

  // ========== Utilities ==========

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
  }

  private sanitizeFileName(name: string): string {
    return name.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase()
  }
}

// Singleton instance
let memoryService: MemoryService | null = null

export function getMemoryService(): MemoryService {
  if (!memoryService) {
    memoryService = new MemoryService()
  }
  return memoryService
}
