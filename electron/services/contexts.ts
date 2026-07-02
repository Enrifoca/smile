/**
 * Context Service
 *
 * Portable project contexts stored under `.smile/contexts/<slug>/`.
 * Each folder contains `<slug>.json`, `<slug>.md`, and a `history/` backup dir.
 */

import * as fs from 'fs'
import * as path from 'path'
import { v4 as uuidv4 } from 'uuid'

import { validateContextContent } from '../../src/context/admission'
import {
  appendMarkdownSection,
  buildDefaultContextMarkdown,
  replaceMarkdownSection,
} from '../../src/context/markdown'
import { resolveContextPromptBody, type ContextPromptBody } from '../../src/context/promptInjection'
import { resolveUniqueSlug, slugifyContextName } from '../../src/context/slug'
import {
  CONTEXT_FILE_VERSION,
  ContextConnectorConfig,
  LegacyProjectContext,
  ProjectContext,
} from '../../src/context/types'

interface ContextFilePayload {
  id: string
  name: string
  slug: string
  createdAt: string
  updatedAt: string
  version: number
  connectors: Record<string, ContextConnectorConfig>
}

export class ContextService {
  private workspacePath: string | null = null

  setWorkspace(workspacePath: string): void {
    this.workspacePath = workspacePath
  }

  private getContextsRoot(): string | null {
    if (!this.workspacePath) return null
    return path.join(this.workspacePath, '.smile', 'contexts')
  }

  private getContextDir(slug: string): string | null {
    const root = this.getContextsRoot()
    if (!root) return null
    return path.join(root, slug)
  }

  private ensureContextsRoot(): string {
    const root = this.getContextsRoot()
    if (!root) throw new Error('Workspace not configured')
    if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true })
    return root
  }

  private jsonPath(slug: string): string {
    const dir = this.getContextDir(slug)
    if (!dir) throw new Error('Workspace not configured')
    return path.join(dir, `${slug}.json`)
  }

  private markdownPath(slug: string): string {
    const dir = this.getContextDir(slug)
    if (!dir) throw new Error('Workspace not configured')
    return path.join(dir, `${slug}.md`)
  }

  private historyDir(slug: string): string {
    const dir = this.getContextDir(slug)
    if (!dir) throw new Error('Workspace not configured')
    return path.join(dir, 'history')
  }

  private readJsonFile(slug: string): ContextFilePayload {
    const raw = fs.readFileSync(this.jsonPath(slug), 'utf-8')
    return JSON.parse(raw) as ContextFilePayload
  }

  private writeJsonFile(payload: ContextFilePayload): void {
    payload.updatedAt = new Date().toISOString()
    fs.writeFileSync(this.jsonPath(payload.slug), `${JSON.stringify(payload, null, 2)}\n`, 'utf-8')
  }

  private payloadToContext(payload: ContextFilePayload): ProjectContext {
    return {
      id: payload.id,
      name: payload.name,
      slug: payload.slug,
      createdAt: payload.createdAt,
      updatedAt: payload.updatedAt,
      version: payload.version,
      connectors: payload.connectors,
    }
  }

  private listSlugs(): string[] {
    const root = this.getContextsRoot()
    if (!root || !fs.existsSync(root)) return []
    return fs.readdirSync(root, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
  }

  list(): ProjectContext[] {
    this.ensureContextsRoot()
    const contexts: ProjectContext[] = []
    for (const slug of this.listSlugs()) {
      try {
        const jsonFile = this.jsonPath(slug)
        if (!fs.existsSync(jsonFile)) continue
        contexts.push(this.payloadToContext(this.readJsonFile(slug)))
      } catch {
        // Skip malformed context folders.
      }
    }
    return contexts.sort((a, b) => a.name.localeCompare(b.name))
  }

  findById(contextId: string): ProjectContext | null {
    return this.list().find(item => item.id === contextId) ?? null
  }

  create(name: string): ProjectContext {
    const trimmed = name.trim()
    if (!trimmed) throw new Error('Context name is required')

    const baseSlug = slugifyContextName(trimmed)
    if (!baseSlug) throw new Error('Context name must contain at least one letter or number')

    this.ensureContextsRoot()
    const taken = new Set(this.listSlugs())
    const slug = resolveUniqueSlug(baseSlug, taken)
    const now = new Date().toISOString()

    const dir = this.getContextDir(slug)
    if (!dir) throw new Error('Workspace not configured')
    fs.mkdirSync(dir, { recursive: true })
    fs.mkdirSync(this.historyDir(slug), { recursive: true })

    const payload: ContextFilePayload = {
      id: uuidv4(),
      name: trimmed,
      slug,
      createdAt: now,
      updatedAt: now,
      version: CONTEXT_FILE_VERSION,
      connectors: {},
    }

    fs.writeFileSync(this.jsonPath(slug), `${JSON.stringify(payload, null, 2)}\n`, 'utf-8')
    fs.writeFileSync(this.markdownPath(slug), buildDefaultContextMarkdown(trimmed), 'utf-8')

    return this.payloadToContext(payload)
  }

  update(context: ProjectContext): ProjectContext {
    const existing = this.findById(context.id)
    if (!existing) throw new Error('Context not found')

    const payload: ContextFilePayload = {
      id: existing.id,
      name: context.name.trim() || existing.name,
      slug: existing.slug,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
      version: CONTEXT_FILE_VERSION,
      connectors: context.connectors,
    }

    this.writeJsonFile(payload)
    return this.payloadToContext(payload)
  }

  delete(contextId: string): void {
    const existing = this.findById(contextId)
    if (!existing) return
    const dir = this.getContextDir(existing.slug)
    if (dir && fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }

  readMarkdown(contextId: string): string {
    const context = this.findById(contextId)
    if (!context) throw new Error('Context not found')
    const filePath = this.markdownPath(context.slug)
    if (!fs.existsSync(filePath)) return ''
    return fs.readFileSync(filePath, 'utf-8')
  }

  getPromptBody(contextId: string): ContextPromptBody {
    try {
      return resolveContextPromptBody(this.readMarkdown(contextId))
    } catch {
      return { length: 0, markdown: '', injectFull: true }
    }
  }

  private backupMarkdown(slug: string): void {
    const source = this.markdownPath(slug)
    if (!fs.existsSync(source)) return
    const history = this.historyDir(slug)
    if (!fs.existsSync(history)) fs.mkdirSync(history, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    fs.copyFileSync(source, path.join(history, `${stamp}.md`))
  }

  writeMarkdown(contextId: string, next: string): void {
    const context = this.findById(contextId)
    if (!context) throw new Error('Context not found')
    this.backupMarkdown(context.slug)
    fs.writeFileSync(this.markdownPath(context.slug), next.endsWith('\n') ? next : `${next}\n`, 'utf-8')
  }

  appendSection(contextId: string, section: string, content: string): string {
    const admission = validateContextContent(content)
    if (!admission.ok) throw new Error(admission.reason || 'Invalid context content')

    const current = this.readMarkdown(contextId)
    const next = appendMarkdownSection(current, section, content)
    this.writeMarkdown(contextId, next)
    return next
  }

  replaceSection(contextId: string, heading: string, content: string): string {
    const admission = validateContextContent(content)
    if (!admission.ok) throw new Error(admission.reason || 'Invalid context content')

    const current = this.readMarkdown(contextId)
    const next = replaceMarkdownSection(current, heading, content)
    this.writeMarkdown(contextId, next)
    return next
  }

  /** One-time migration from electron-store legacy contexts. */
  migrateLegacyContexts(legacy: LegacyProjectContext[]): ProjectContext[] {
    if (!legacy.length) return this.list()

    for (const item of legacy) {
      if (this.list().some(existing => existing.id === item.id)) continue

      const trimmed = (item.name || 'Untitled context').trim()
      const baseSlug = slugifyContextName(trimmed) || 'context'
      this.ensureContextsRoot()
      const taken = new Set(this.listSlugs())
      const slug = resolveUniqueSlug(baseSlug, taken)
      const now = new Date().toISOString()

      const dir = this.getContextDir(slug)
      if (!dir) continue
      fs.mkdirSync(dir, { recursive: true })
      fs.mkdirSync(this.historyDir(slug), { recursive: true })

      const connectors: Record<string, ContextConnectorConfig> = {}
      for (const [connectorId, config] of Object.entries(item.connectorScopes || {})) {
        connectors[connectorId] = {
          enabled: Object.keys(config).length > 0,
          config,
        }
      }

      const payload: ContextFilePayload = {
        id: item.id,
        name: trimmed,
        slug,
        createdAt: now,
        updatedAt: now,
        version: CONTEXT_FILE_VERSION,
        connectors,
      }

      fs.writeFileSync(this.jsonPath(slug), `${JSON.stringify(payload, null, 2)}\n`, 'utf-8')
      fs.writeFileSync(this.markdownPath(slug), buildDefaultContextMarkdown(trimmed), 'utf-8')
    }

    return this.list()
  }
}

let contextServiceInstance: ContextService | null = null

export function getContextService(): ContextService {
  if (!contextServiceInstance) contextServiceInstance = new ContextService()
  return contextServiceInstance
}
