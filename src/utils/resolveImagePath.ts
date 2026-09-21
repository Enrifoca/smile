/**
 * Resolve a markdown image src to a base64 data URL by reading it from the workspace.
 * Tries the path as-is, then URL-decoded, then a workspace search by basename,
 * then a broader search by extension for recently-generated images.
 */

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg', '.webp']

function getMimeType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || 'png'
  if (ext === 'svg') return 'image/svg+xml'
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'gif') return 'image/gif'
  if (ext === 'bmp') return 'image/bmp'
  if (ext === 'webp') return 'image/webp'
  return 'image/png'
}

function normalizePathSeparators(path: string): string {
  return path.replace(/\\/g, '/')
}

export async function resolveImageDataUrl(src: string): Promise<string | null> {
  if (!src) {
    console.log('[resolveImagePath] Empty src')
    return null
  }
  if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) {
    return src
  }

  const fileApi = window.electronAPI?.file
  if (!fileApi) {
    console.log('[resolveImagePath] No file API available')
    return null
  }

  const tryRead = async (path: string): Promise<string | null> => {
    const normalized = normalizePathSeparators(path)
    try {
      const result = await fileApi.readBinary(normalized)
      if (result.success && result.data) {
        return `data:${getMimeType(normalized)};base64,${result.data}`
      }
    } catch (err) {
      console.log('[resolveImagePath] Failed to read:', normalized, err)
    }
    return null
  }

  // 1. Try the path exactly as written.
  const exact = await tryRead(src)
  if (exact) {
    console.log('[resolveImagePath] Resolved exact path:', src)
    return exact
  }

  // 2. Try URL-decoded version (models sometimes percent-encode spaces/parentheses).
  let decodedSrc = src
  try {
    decodedSrc = decodeURIComponent(src)
  } catch {
    // src was not encoded; keep original
  }
  if (decodedSrc !== src) {
    const decoded = await tryRead(decodedSrc)
    if (decoded) {
      console.log('[resolveImagePath] Resolved URL-decoded path:', decodedSrc)
      return decoded
    }
  }

  // 3. Try a workspace search by filename.
  const normalizedSrc = normalizePathSeparators(src)
  const basename = normalizedSrc.split('/').pop() || ''
  if (basename) {
    try {
      const search = await fileApi.search(basename, '')
      console.log('[resolveImagePath] Search for basename:', basename, search)
      if (search.success && Array.isArray(search.data) && search.data.length > 0) {
        const rows = search.data as Array<{ path: string; name: string; modified?: string }>
        const imageRows = rows.filter(row =>
          IMAGE_EXTENSIONS.some(ext => row.path.toLowerCase().endsWith(ext)),
        )
        // Prefer the most recently modified image when multiple candidates match.
        imageRows.sort((a, b) => {
          if (a.modified && b.modified) return new Date(b.modified).getTime() - new Date(a.modified).getTime()
          return 0
        })
        const candidate = imageRows[0] || rows[0]
        if (candidate?.path) {
          const searched = await tryRead(candidate.path)
          if (searched) {
            console.log('[resolveImagePath] Resolved via search:', candidate.path)
            return searched
          }
        }
      }
    } catch (err) {
      console.log('[resolveImagePath] Search failed:', err)
    }
  }

  // 4. Last resort: search by extension and pick the most recent image in the workspace.
  // This handles cases where the model invents a filename unrelated to the saved file.
  try {
    const ext = IMAGE_EXTENSIONS.find(ext => basename.toLowerCase().endsWith(ext)) || '.png'
    const broadSearch = await fileApi.search(`*${ext}`, '')
    console.log('[resolveImagePath] Broad search for extension:', ext, broadSearch)
    if (broadSearch.success && Array.isArray(broadSearch.data) && broadSearch.data.length > 0) {
      const rows = broadSearch.data as Array<{ path: string; name: string; modified?: string }>
      rows.sort((a, b) => {
        if (a.modified && b.modified) return new Date(b.modified).getTime() - new Date(a.modified).getTime()
        return 0
      })
      const latest = rows[0]
      if (latest?.path) {
        const searched = await tryRead(latest.path)
        if (searched) {
          console.warn('[resolveImagePath] Falling back to most recent image:', latest.path, 'for src:', src)
          return searched
        }
      }
    }
  } catch (err) {
    console.log('[resolveImagePath] Broad search failed:', err)
  }

  console.error('[resolveImagePath] Could not resolve image:', src)
  return null
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function pathMatchesQuery(imagePath: string, query: string): boolean {
  const normalizedQuery = normalize(query)
  if (!normalizedQuery) return false
  const normalizedPath = normalize(imagePath)
  const words = normalizedQuery.split(' ').filter(Boolean)
  return words.some(word => normalizedPath.includes(word))
}

/**
 * Search the workspace for image files and return the most recently modified one
 * that matches the query, or the most recent image overall if no match is found.
 */
export async function findWorkspaceImage(query: string): Promise<string | null> {
  const fileApi = window.electronAPI?.file
  if (!fileApi) return null

  const allImages: Array<{ path: string; modified?: string }> = []
  for (const ext of IMAGE_EXTENSIONS) {
    try {
      const result = await fileApi.search(`*${ext}`, '')
      if (result.success && Array.isArray(result.data)) {
        allImages.push(...(result.data as Array<{ path: string; modified?: string }>))
      }
    } catch {
      // Ignore search errors for individual extensions.
    }
  }

  if (allImages.length === 0) return null

  allImages.sort((a, b) => {
    if (a.modified && b.modified) {
      return new Date(b.modified).getTime() - new Date(a.modified).getTime()
    }
    return 0
  })

  const match = allImages.find(img => pathMatchesQuery(img.path, query))
  return match?.path || allImages[0]?.path || null
}

/**
 * Replace empty markdown image references like `![alt]()` with the best matching
 * image file found in the workspace. This is a last-resort fallback for reports
 * saved before image-src injection was in place.
 */
export async function fillEmptyImagesFromWorkspace(content: string): Promise<string> {
  // Matches ![alt]() and ![alt]("title") / ![alt]('title') with an empty src.
  const emptyRefs = Array.from(content.matchAll(/!\[([^\]]*)\]\(\s*(?:["'][^"']*["'])?\s*\)/g))
  if (emptyRefs.length === 0) return content

  let result = content
  for (const match of emptyRefs) {
    const [full, alt] = match
    const path = await findWorkspaceImage(alt)
    if (path) {
      result = result.replace(full, `![${alt}](${path})`)
    }
  }
  return result
}

// Markdown image: ![alt](src) or ![alt](src "title") or ![alt](src 'title')
const MARKDOWN_IMAGE_RE = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+["']([^"']*)["'])?\)/g

function htmlImgToMarkdown(content: string): string {
  return content
    .replace(/<img[^>]+src=["']([^"']+)["'][^>]*alt=["']([^"']*)["'][^>]*>/gi, '![$2]($1)')
    .replace(/<img[^>]+alt=["']([^"']*)["'][^>]*src=["']([^"']+)["'][^>]*>/gi, '![$1]($2)')
    .replace(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi, '![]($1)')
}

/**
 * Convert every local image reference in markdown or HTML img tags to an inline
 * base64 data URL. This guarantees the image renders even when ReactMarkdown's
 * custom component path is bypassed.
 */
export async function embedImagesInMarkdown(content: string): Promise<string> {
  let result = htmlImgToMarkdown(content)

  const mdMatches = Array.from(result.matchAll(MARKDOWN_IMAGE_RE))
  console.log('[embedImagesInMarkdown] Found', mdMatches.length, 'image references')
  for (const match of mdMatches) {
    const [full, alt, src] = match
    console.log('[embedImagesInMarkdown] Resolving image:', { alt, src })
    const dataUrl = await resolveImageDataUrl(src)
    if (dataUrl) {
      result = result.replace(full, `![${alt}](${dataUrl})`)
      console.log('[embedImagesInMarkdown] Embedded image:', src, '->', dataUrl.slice(0, 60) + '...')
    } else {
      console.error('[embedImagesInMarkdown] Could not embed image:', src)
    }
  }

  return result
}
