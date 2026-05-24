import * as fs from 'fs'
import * as path from 'path'
import { SOURCE_BUFFER_SEAL_THRESHOLD } from '../../src/memory/sourceAdmission'
import {
  SourceMemoryLeaf,
  SourceMemoryLeafInput,
  SourceMemoryReadResult,
  SourceMemoryScopeListing,
} from '../../src/memory/sourceTypes'

interface SourceScopeMeta {
  bufferCharCount: number
  lastSealedAt: string | null
}

let sourceMemoryService: SourceMemoryService | null = null

export function getSourceMemoryService(): SourceMemoryService {
  if (!sourceMemoryService) sourceMemoryService = new SourceMemoryService()
  return sourceMemoryService
}

export class SourceMemoryService {
  private workspacePath: string | null = null

  setWorkspace(workspacePath: string): void {
    this.workspacePath = workspacePath
  }

  private getSourcesRoot(): string | null {
    if (!this.workspacePath) return null
    return path.join(this.workspacePath, '.smile', 'memories', 'sources')
  }

  private scopeDir(connectorId: string, scopeId: string): string | null {
    const root = this.getSourcesRoot()
    if (!root) return null
    return path.join(root, connectorId, this.sanitizeSegment(scopeId))
  }

  private sanitizeSegment(value: string): string {
    return value.replace(/[^a-zA-Z0-9._-]/g, '_')
  }

  private ensureScopeDir(connectorId: string, scopeId: string): string | null {
    const dir = this.scopeDir(connectorId, scopeId)
    if (!dir) return null
    fs.mkdirSync(path.join(dir, 'summaries'), { recursive: true })
    return dir
  }

  private metaPath(connectorId: string, scopeId: string): string | null {
    const dir = this.scopeDir(connectorId, scopeId)
    return dir ? path.join(dir, 'meta.json') : null
  }

  private bufferPath(connectorId: string, scopeId: string): string | null {
    const dir = this.scopeDir(connectorId, scopeId)
    return dir ? path.join(dir, 'buffer.jsonl') : null
  }

  private readMeta(connectorId: string, scopeId: string): SourceScopeMeta {
    const metaFile = this.metaPath(connectorId, scopeId)
    if (!metaFile || !fs.existsSync(metaFile)) {
      return { bufferCharCount: 0, lastSealedAt: null }
    }
    try {
      return JSON.parse(fs.readFileSync(metaFile, 'utf-8')) as SourceScopeMeta
    } catch {
      return { bufferCharCount: 0, lastSealedAt: null }
    }
  }

  private writeMeta(connectorId: string, scopeId: string, meta: SourceScopeMeta): void {
    const metaFile = this.metaPath(connectorId, scopeId)
    if (!metaFile) return
    fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2), 'utf-8')
  }

  private readBuffer(connectorId: string, scopeId: string): SourceMemoryLeaf[] {
    const file = this.bufferPath(connectorId, scopeId)
    if (!file || !fs.existsSync(file)) return []
    const lines = fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean)
    const leaves: SourceMemoryLeaf[] = []
    for (const line of lines) {
      try {
        leaves.push(JSON.parse(line) as SourceMemoryLeaf)
      } catch {
        // skip corrupt line
      }
    }
    return leaves
  }

  private writeBuffer(connectorId: string, scopeId: string, leaves: SourceMemoryLeaf[]): void {
    const file = this.bufferPath(connectorId, scopeId)
    if (!file) return
    const content = leaves.map(leaf => JSON.stringify(leaf)).join('\n')
    fs.writeFileSync(file, content ? `${content}\n` : '', 'utf-8')
  }

  private sealBuffer(connectorId: string, scopeId: string, leaves: SourceMemoryLeaf[]): void {
    if (leaves.length === 0) return
    const dir = this.scopeDir(connectorId, scopeId)
    if (!dir) return

    const createdAt = new Date().toISOString()
    const id = createdAt.replace(/[:.]/g, '-')
    const lines = [
      `# Source summary`,
      '',
      `_Connector: ${connectorId} · Scope: ${scopeId} · ${createdAt}_`,
      '',
      ...leaves.map(leaf => `- ${leaf.createdAt.slice(0, 16)} · ${leaf.toolName}: ${leaf.summary}`),
    ]
    fs.writeFileSync(path.join(dir, 'summaries', `L1-${id}.md`), lines.join('\n'), 'utf-8')
    this.writeBuffer(connectorId, scopeId, [])
    this.writeMeta(connectorId, scopeId, { bufferCharCount: 0, lastSealedAt: createdAt })
  }

  appendLeaf(input: SourceMemoryLeafInput): boolean {
    if (!this.ensureScopeDir(input.connectorId, input.scopeId)) return false

    const leaf: SourceMemoryLeaf = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      connectorId: input.connectorId,
      scopeId: input.scopeId,
      kind: input.kind,
      toolName: input.toolName,
      summary: input.summary,
      createdAt: new Date().toISOString(),
    }

    const buffer = this.readBuffer(input.connectorId, input.scopeId)
    buffer.push(leaf)
    this.writeBuffer(input.connectorId, input.scopeId, buffer)

    const meta = this.readMeta(input.connectorId, input.scopeId)
    meta.bufferCharCount += leaf.summary.length
    this.writeMeta(input.connectorId, input.scopeId, meta)

    if (meta.bufferCharCount >= SOURCE_BUFFER_SEAL_THRESHOLD) {
      this.sealBuffer(input.connectorId, input.scopeId, buffer)
    }

    return true
  }

  readSource(connectorId: string, scopeId: string): SourceMemoryReadResult | null {
    const dir = this.scopeDir(connectorId, scopeId)
    if (!dir || !fs.existsSync(dir)) return null

    const summariesDir = path.join(dir, 'summaries')
    const summaries = fs.existsSync(summariesDir)
      ? fs.readdirSync(summariesDir)
        .filter(name => name.endsWith('.md'))
        .sort()
        .reverse()
        .slice(0, 5)
        .map(name => ({
          id: name,
          createdAt: name.replace(/^L1-/, '').replace(/-/g, ':'),
          content: fs.readFileSync(path.join(summariesDir, name), 'utf-8'),
        }))
      : []

    return {
      connectorId,
      scopeId,
      buffer: this.readBuffer(connectorId, scopeId),
      summaries,
    }
  }

  listScopes(): SourceMemoryScopeListing[] {
    const root = this.getSourcesRoot()
    if (!root || !fs.existsSync(root)) return []

    const listings: SourceMemoryScopeListing[] = []
    for (const connectorId of fs.readdirSync(root)) {
      const connectorPath = path.join(root, connectorId)
      if (!fs.statSync(connectorPath).isDirectory()) continue

      for (const scopeId of fs.readdirSync(connectorPath)) {
        const scopePath = path.join(connectorPath, scopeId)
        if (!fs.statSync(scopePath).isDirectory()) continue

        const buffer = this.readBuffer(connectorId, scopeId)
        const summariesDir = path.join(scopePath, 'summaries')
        const summaryFiles = fs.existsSync(summariesDir)
          ? fs.readdirSync(summariesDir).filter(name => name.endsWith('.md')).sort().reverse()
          : []

        let latestSummaryPreview: string | null = null
        if (summaryFiles[0]) {
          const content = fs.readFileSync(path.join(summariesDir, summaryFiles[0]), 'utf-8')
          latestSummaryPreview = content.split('\n').find(line => line.startsWith('- '))?.slice(0, 160) || null
        } else if (buffer.length > 0) {
          latestSummaryPreview = buffer[buffer.length - 1].summary.slice(0, 160)
        }

        listings.push({
          connectorId,
          scopeId,
          leafCount: buffer.length,
          summaryCount: summaryFiles.length,
          latestSummaryPreview,
        })
      }
    }

    return listings
  }
}
