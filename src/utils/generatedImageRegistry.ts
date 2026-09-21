/**
 * Keeps track of images generated during the current session so that reports
 * can be post-processed to fix empty or incorrect image src attributes.
 */

interface RegisteredImage {
  path: string
  title?: string
  prompt?: string
  createdAt: number
}

const registry: RegisteredImage[] = []

export function registerGeneratedImage(path: string | undefined, metadata?: { title?: string; prompt?: string }): void {
  if (!path) return
  registry.push({
    path,
    title: metadata?.title,
    prompt: metadata?.prompt,
    createdAt: Date.now(),
  })
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function similarity(a: string, b: string): number {
  const na = normalize(a)
  const nb = normalize(b)
  if (na === nb) return 1
  if (!na || !nb) return 0
  const wordsA = new Set(na.split(' '))
  const wordsB = nb.split(' ')
  const intersection = wordsB.filter(w => wordsA.has(w)).length
  return intersection / Math.max(wordsA.size, wordsB.length)
}

export function findGeneratedImage(query: string): string | null {
  if (!query || registry.length === 0) return null
  const normalizedQuery = normalize(query)
  if (!normalizedQuery) return null

  let best: { path: string; score: number } | null = null
  for (const entry of registry) {
    const candidates = [entry.title, entry.prompt, entry.path].filter(Boolean) as string[]
    for (const candidate of candidates) {
      const score = similarity(candidate, query)
      if (!best || score > best.score) {
        best = { path: entry.path, score }
      }
    }
  }

  // Require a reasonable match; otherwise fall back to the most recent image.
  if (best && best.score >= 0.3) return best.path
  return registry[registry.length - 1]?.path || null
}

export function clearGeneratedImages(): void {
  registry.length = 0
}

export function getRegisteredImages(): RegisteredImage[] {
  return [...registry]
}

/**
 * Replace empty image src attributes with the best matching registered image path.
 * Handles both markdown `![alt]()` and HTML `<img src="" alt="...">`.
 */
export function injectMissingImageSources(content: string): string {
  if (registry.length === 0) return content

  // Markdown: ![alt]() or ![alt]( )
  let result = content.replace(/!\[([^\]]*)\]\(\s*\)/g, (match, alt) => {
    const path = findGeneratedImage(alt)
    if (!path) return match
    return `![${alt}](${path})`
  })

  // HTML: <img src="" alt="..."> / <img alt="..." src="">
  result = result.replace(/<img\s+([^>]*?)src=["']\s*["']([^>]*?)>/gi, (match, before, after) => {
    const altMatch = match.match(/alt=["']([^"']*)["']/i)
    const alt = altMatch?.[1] || ''
    const path = findGeneratedImage(alt)
    if (!path) return match
    return `<img${before}src="${path}"${after}>`
  })

  return result
}
