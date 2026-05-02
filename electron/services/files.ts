import fs from 'fs/promises'
import path from 'path'
import { lookup as getMimeType } from 'mime-types'
// pdf-parse, mammoth and adm-zip are marked external in vite.config.ts so they
// are loaded at runtime from node_modules rather than bundled by Rollup.
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const pdfParse: (buffer: Buffer) => Promise<{ text: string; numpages: number }> = require('pdf-parse')
const mammoth: { extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string; messages: unknown[] }> } = require('mammoth')
const AdmZip: new (buffer: Buffer) => { readAsText: (name: string) => string } = require('adm-zip')

/**
 * Direct XML extraction fallback for .docx files.
 * A .docx is a ZIP archive — this opens it with adm-zip, reads
 * word/document.xml, and pulls all <w:t> text nodes in order.
 * Works on any valid .docx regardless of font encoding or export tool.
 */
function extractDocxXml(buffer: Buffer): string {
  const zip = new AdmZip(buffer)
  const xml = zip.readAsText('word/document.xml')
  if (!xml) throw new Error('word/document.xml not found inside the .docx archive')

  // Collect text runs in document order, inserting paragraph breaks at <w:p>
  const result: string[] = []
  const tagRe = /<(w:t|w:p|w:br)[^>]*>([^<]*)<\/\1>|<(w:p|w:br)[^/]*\/>/g
  let m: RegExpExecArray | null
  while ((m = tagRe.exec(xml)) !== null) {
    const tag = m[1] || m[3]
    if (tag === 'w:t') {
      result.push(m[2]) // raw text content
    } else if (tag === 'w:p' || tag === 'w:br') {
      result.push('\n')
    }
  }

  // Also catch any <w:t> without a closing tag (malformed XML edge case)
  const fallbackRe = /<w:t[^>]*>([^<]+)/g
  const found = new Set(result)
  while ((m = fallbackRe.exec(xml)) !== null) {
    if (!found.has(m[1])) result.push(m[1])
  }

  return result.join('').replace(/\n{3,}/g, '\n\n').trim()
}

interface FileInfo {
  name: string
  path: string
  isDirectory: boolean
  size: number
  modified: string
  mimeType?: string
}

// Maximum file size for Jira attachments (10MB)
export const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024

export class FileService {
  private workspacePath: string

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath
  }

  /**
   * Ensure the path is within the workspace (security)
   */
  private validatePath(relativePath: string): string {
    const fullPath = path.resolve(this.workspacePath, relativePath)
    
    // Check that the resolved path is still within the workspace
    if (!fullPath.startsWith(this.workspacePath)) {
      throw new Error('Path traversal attempt detected')
    }
    
    return fullPath
  }

  /**
   * List files in a directory
   */
  async listFiles(relativePath: string = ''): Promise<{ success: boolean; data?: FileInfo[]; error?: string }> {
    try {
      const fullPath = this.validatePath(relativePath)
      const entries = await fs.readdir(fullPath, { withFileTypes: true })
      
      const files: FileInfo[] = await Promise.all(
        entries
          .filter(entry => !entry.name.startsWith('.')) // Skip hidden files
          .map(async (entry) => {
            const filePath = path.join(fullPath, entry.name)
            const stats = await fs.stat(filePath)
            
            return {
              name: entry.name,
              path: path.relative(this.workspacePath, filePath),
              isDirectory: entry.isDirectory(),
              size: stats.size,
              modified: stats.mtime.toISOString()
            }
          })
      )

      // Sort: directories first, then by name
      files.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) {
          return a.isDirectory ? -1 : 1
        }
        return a.name.localeCompare(b.name)
      })

      return { success: true, data: files }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to list files'
      return { success: false, error: message }
    }
  }

  /**
   * Read a file's contents.
   * PDF files are automatically parsed and their text extracted.
   * All other files are read as UTF-8 text.
   */
  async readFile(relativePath: string): Promise<{ success: boolean; data?: string; error?: string }> {
    try {
      const fullPath = this.validatePath(relativePath)
      const stats = await fs.stat(fullPath)

      // 50 MB cap for PDFs (parsing is memory-intensive), 10 MB for plain text
      const isPdf = path.extname(fullPath).toLowerCase() === '.pdf'
      const maxSize = isPdf ? 50 * 1024 * 1024 : 10 * 1024 * 1024
      if (stats.size > maxSize) {
        return { success: false, error: `File too large (${(stats.size / 1024 / 1024).toFixed(1)} MB, max ${isPdf ? '50' : '10'} MB)` }
      }

      if (isPdf) {
        const buffer = await fs.readFile(fullPath)
        try {
          const parsed = await pdfParse(buffer)
          const text = parsed.text.trim()
          if (!text) {
            return { success: false, error: 'No extractable text found in this PDF. It is likely a scanned image — only OCR-capable tools can read it.' }
          }

          // Quality check: estimate what fraction of characters are meaningful
          // (printable ASCII + Latin Extended). If very low, the font encoding
          // is broken and the extracted text is garbage.
          const totalChars = text.length
          const printableChars = text.split('').filter(c => {
            const code = c.charCodeAt(0)
            return (
              (code >= 0x0020 && code <= 0x007E) || // basic printable ASCII
              (code >= 0x00A0 && code <= 0x024F) || // Latin-1 supplement + Latin extended
              code === 0x000A || code === 0x000D || code === 0x0009 // whitespace
            )
          }).length
          const printableRatio = printableChars / totalChars

          const pageInfo = `[PDF: ${parsed.numpages} page${parsed.numpages !== 1 ? 's' : ''}]\n\n`

          if (printableRatio < 0.6) {
            // Text is mostly non-printable — warn the agent clearly so it
            // doesn't waste iterations trying to interpret garbled content.
            const warning = `[WARNING: PDF text extraction quality is poor (${Math.round(printableRatio * 100)}% readable). `
              + `The font encoding in this PDF is not standard. The extracted text below may contain garbled characters. `
              + `Inform the user that this specific PDF cannot be read automatically and ask them to provide the content as plain text or a different file format.]\n\n`
            return { success: true, data: pageInfo + warning + text }
          }

          return { success: true, data: pageInfo + text }
        } catch (pdfErr) {
          return { success: false, error: `Failed to parse PDF: ${pdfErr instanceof Error ? pdfErr.message : 'unknown error'}` }
        }
      }

      // Word documents (.docx) — try three extraction strategies in order:
      //   1. mammoth   — best quality, preserves structure
      //   2. adm-zip + XML parse — direct <w:t> extraction, works on any valid DOCX
      //   3. Return a clear error message rather than raw binary garbage
      const ext = path.extname(fullPath).toLowerCase()
      if (ext === '.docx') {
        const buffer = await fs.readFile(fullPath)

        // Strategy 1: mammoth
        let mammothText = ''
        try {
          const result = await mammoth.extractRawText({ buffer })
          mammothText = result.value.trim()
        } catch { /* fall through */ }

        if (mammothText) {
          return { success: true, data: '[Word document]\n\n' + mammothText }
        }

        // Strategy 2: direct ZIP + XML extraction
        let xmlText = ''
        try {
          xmlText = extractDocxXml(buffer)
        } catch { /* fall through */ }

        if (xmlText) {
          return { success: true, data: '[Word document — extracted via XML]\n\n' + xmlText }
        }

        // Strategy 3: give up gracefully
        return {
          success: false,
          error: 'Could not extract text from this Word document. The file may be corrupted, encrypted, or use a format variant not supported by any extraction strategy. Please share the content as plain text instead.',
        }
      }

      const content = await fs.readFile(fullPath, 'utf-8')
      return { success: true, data: content }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to read file'
      return { success: false, error: message }
    }
  }

  /**
   * Write content to a file
   */
  async writeFile(relativePath: string, content: string): Promise<{ success: boolean; error?: string }> {
    try {
      const fullPath = this.validatePath(relativePath)
      
      // Ensure the directory exists
      const dir = path.dirname(fullPath)
      await fs.mkdir(dir, { recursive: true })
      
      await fs.writeFile(fullPath, content, 'utf-8')
      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to write file'
      return { success: false, error: message }
    }
  }

  /**
   * Check if a file exists
   */
  async exists(relativePath: string): Promise<{ success: boolean; exists?: boolean; error?: string }> {
    try {
      const fullPath = this.validatePath(relativePath)
      
      try {
        await fs.access(fullPath)
        return { success: true, exists: true }
      } catch {
        return { success: true, exists: false }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to check file'
      return { success: false, error: message }
    }
  }

  /**
   * Delete a file
   */
  async deleteFile(relativePath: string): Promise<{ success: boolean; error?: string }> {
    try {
      const fullPath = this.validatePath(relativePath)
      await fs.unlink(fullPath)
      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete file'
      return { success: false, error: message }
    }
  }

  /**
   * Create a directory
   */
  async createDirectory(relativePath: string): Promise<{ success: boolean; error?: string }> {
    try {
      const fullPath = this.validatePath(relativePath)
      await fs.mkdir(fullPath, { recursive: true })
      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create directory'
      return { success: false, error: message }
    }
  }

  /**
   * Get file/directory info
   */
  async getInfo(relativePath: string): Promise<{ success: boolean; data?: FileInfo; error?: string }> {
    try {
      const fullPath = this.validatePath(relativePath)
      const stats = await fs.stat(fullPath)
      
      return {
        success: true,
        data: {
          name: path.basename(fullPath),
          path: relativePath,
          isDirectory: stats.isDirectory(),
          size: stats.size,
          modified: stats.mtime.toISOString()
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get file info'
      return { success: false, error: message }
    }
  }

  /**
   * Search for files by name pattern (recursively through all folders)
   */
  async searchFiles(pattern: string, relativePath: string = ''): Promise<{ success: boolean; data?: FileInfo[]; error?: string }> {
    try {
      const results: FileInfo[] = []
      
      // Convert glob-like patterns to regex.
      // Key normalizations applied before building the regex:
      //   1. Spaces in the pattern match any common word separator in filenames
      //      (space, underscore, hyphen, dot) so that "Helium Shopify*" finds
      //      "Helium_Shopify-handover-request.pdf".
      //   2. Literal dots are escaped before the glob * / ? conversions.
      let regexPattern = pattern
        .replace(/\./g, '\\.')     // Escape literal dots first
        .replace(/\*/g, '.*')      // * → .*
        .replace(/\?/g, '.')       // ? → .
        .replace(/ /g, '[\\s_\\-.]') // space → any separator

      // If no wildcards were present, wrap in .* for a substring match
      if (!pattern.includes('*') && !pattern.includes('?')) {
        regexPattern = `.*${regexPattern}.*`
      }
      
      const regex = new RegExp(`^${regexPattern}$`, 'i')
      
      const searchDir = async (dirPath: string) => {
        try {
          const fullPath = this.validatePath(dirPath)
          const entries = await fs.readdir(fullPath, { withFileTypes: true })
          
          for (const entry of entries) {
            // Skip hidden files/folders but allow .mirai folder access
            if (entry.name.startsWith('.') && entry.name !== '.mirai') continue
            
            const entryRelPath = path.join(dirPath, entry.name)
            const entryFullPath = path.join(fullPath, entry.name)
            
            if (regex.test(entry.name) && !entry.isDirectory()) {
              const stats = await fs.stat(entryFullPath)
              results.push({
                name: entry.name,
                path: entryRelPath,
                isDirectory: entry.isDirectory(),
                size: stats.size,
                modified: stats.mtime.toISOString(),
                mimeType: getMimeType(entry.name) || undefined
              })
            }
            
            // Always search subdirectories (recursive search)
            if (entry.isDirectory() && results.length < 500) {
              await searchDir(entryRelPath)
            }
          }
        } catch (err) {
          // Skip directories we can't read
          console.warn(`[FileService] Skipping unreadable directory: ${dirPath}`)
        }
      }
      
      await searchDir(relativePath)
      
      // Sort by modification date (newest first)
      results.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime())
      
      return { success: true, data: results }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to search files'
      return { success: false, error: message }
    }
  }

  /**
   * Get detailed file info including MIME type
   */
  async getFileInfo(relativePath: string): Promise<{ success: boolean; data?: { name: string; size: number; isDirectory: boolean; mimeType?: string; fullPath: string }; error?: string }> {
    try {
      const fullPath = this.validatePath(relativePath)
      const stats = await fs.stat(fullPath)
      const name = path.basename(fullPath)
      
      return {
        success: true,
        data: {
          name,
          size: stats.size,
          isDirectory: stats.isDirectory(),
          mimeType: getMimeType(name) || undefined,
          fullPath
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get file info'
      return { success: false, error: message }
    }
  }

  /**
   * Ensure .mirai/attachments directory exists
   */
  async ensureAttachmentsDir(): Promise<{ success: boolean; path?: string; error?: string }> {
    try {
      const attachmentsPath = path.join(this.workspacePath, '.mirai', 'attachments')
      await fs.mkdir(attachmentsPath, { recursive: true })
      return { success: true, path: attachmentsPath }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create attachments directory'
      return { success: false, error: message }
    }
  }

  /**
   * Save a file to .mirai/attachments
   */
  async saveAttachment(fileName: string, data: Buffer): Promise<{ success: boolean; path?: string; error?: string }> {
    try {
      // Ensure directory exists
      const ensureResult = await this.ensureAttachmentsDir()
      if (!ensureResult.success) {
        return ensureResult
      }

      // Check file size
      if (data.length > MAX_ATTACHMENT_SIZE) {
        return { 
          success: false, 
          error: `File is too large (${(data.length / 1024 / 1024).toFixed(2)}MB). Maximum size is 10MB.` 
        }
      }

      const attachmentPath = path.join('.mirai', 'attachments', fileName)
      const fullPath = this.validatePath(attachmentPath)
      
      await fs.writeFile(fullPath, data)
      return { success: true, path: attachmentPath }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save attachment'
      return { success: false, error: message }
    }
  }

  /**
   * Read file as buffer (for attachments)
   */
  async readFileBuffer(relativePath: string): Promise<{ success: boolean; data?: Buffer; error?: string }> {
    try {
      const fullPath = this.validatePath(relativePath)
      
      // Check file size
      const stats = await fs.stat(fullPath)
      if (stats.size > MAX_ATTACHMENT_SIZE) {
        return { 
          success: false, 
          error: `File is too large (${(stats.size / 1024 / 1024).toFixed(2)}MB). Maximum size for Jira attachments is 10MB.` 
        }
      }

      const content = await fs.readFile(fullPath)
      return { success: true, data: content }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to read file'
      return { success: false, error: message }
    }
  }

  /**
   * Get full absolute path for a relative path
   */
  getFullPath(relativePath: string): string {
    return this.validatePath(relativePath)
  }

  /**
   * Get workspace path
   */
  getWorkspacePath(): string {
    return this.workspacePath
  }
}
