/**
 * Web Service
 *
 * Network-facing tools: web search and web page fetching.
 *
 * Search strategy (inspired by OpenClaw / Hermes):
 * 1. If a Brave Search API key is configured, use the reliable Brave API.
 * 2. Otherwise scrape DuckDuckGo's HTML endpoint with conservative rate limiting
 *    and a cooldown on CAPTCHA/anomaly detection.
 */

import { JSDOM } from 'jsdom'
import { Readability } from '@mozilla/readability'

export interface WebSearchResult {
  title: string
  url: string
  snippet: string
}

export interface WebFetchResult {
  title: string
  url: string
  content: string
  mode: 'article' | 'raw'
}

const FETCH_TIMEOUT_MS = 15000
const MAX_RAW_SIZE = 200_000 // 200 KB
const USER_AGENT = 'smile:D-agent/0.1.1 (+https://github.com/enrifoca/smile)'

// DuckDuckGo HTML endpoint settings
const DDG_HTML_URL = 'https://html.duckduckgo.com/html'
const MIN_SEARCH_INTERVAL_MS = 2000
const SEARCH_INTERVAL_JITTER_MS = 500
const SEARCH_MAX_RETRIES = 2
const SEARCH_INITIAL_BACKOFF_MS = 1000
const SEARCH_BACKOFF_JITTER_MS = 500
const ANOMALY_COOLDOWN_MS = 60000

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function randomJitter(maxMs: number): number {
  return Math.floor(Math.random() * maxMs)
}

function isAnomalyPage(html: string): boolean {
  const lower = html.toLowerCase()
  return (
    lower.includes('anomaly-modal') ||
    lower.includes('please complete the following challenge') ||
    lower.includes('captcha') ||
    lower.includes('your computer or network may be sending automated queries')
  )
}

export class WebService {
  private lastSearchTime = 0
  private nextAllowedAt = 0
  private searchQueue: Promise<unknown> = Promise.resolve()
  private braveApiKey: string | null = null

  setBraveApiKey(key: string | null): void {
    this.braveApiKey = key
  }

  async webSearch(query: string, count = 5): Promise<{ success: boolean; data?: WebSearchResult[]; error?: string }> {
    if (this.braveApiKey) {
      return this.searchBrave(query, count)
    }
    return this.searchDdg(query, count)
  }

  private async searchBrave(query: string, count: number): Promise<{ success: boolean; data?: WebSearchResult[]; error?: string }> {
    try {
      const url = new URL('https://api.search.brave.com/res/v1/web/search')
      url.searchParams.set('q', query)
      url.searchParams.set('count', String(Math.min(Math.max(1, count), 10)))
      url.searchParams.set('offset', '0')

      const response = await fetch(url.toString(), {
        headers: {
          'Accept': 'application/json',
          'X-Subscription-Token': this.braveApiKey!,
        },
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`Brave Search HTTP ${response.status}: ${text}`)
      }

      const json = await response.json()
      const results = (json.web?.results ?? []).map((r: { title?: string; url?: string; description?: string }) => ({
        title: r.title ?? 'Untitled',
        url: r.url ?? '',
        snippet: r.description ?? '',
      })).filter((r: WebSearchResult) => r.url)

      return { success: true, data: results }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Brave Search failed'
      console.error('[WebService] Brave search error:', message)
      return { success: false, error: `Web search failed: ${message}` }
    }
  }

  private async searchDdg(query: string, count: number): Promise<{ success: boolean; data?: WebSearchResult[]; error?: string }> {
    return this.enqueueSearch(async () => {
      await this.respectSearchRateLimit()

      const safeCount = Math.min(Math.max(1, count), 10)
      let lastError: Error | undefined

      for (let attempt = 0; attempt <= SEARCH_MAX_RETRIES; attempt++) {
        try {
          const results = await this.scrapeDdgHtml(query, safeCount)
          if (results.length > 0) {
            return { success: true, data: results }
          }
          lastError = new Error('No results returned')
        } catch (error) {
          lastError = error instanceof Error ? error : new Error('Web search failed')
          const message = lastError.message

          if (message.includes('CAPTCHA') || message.includes('automated queries')) {
            this.nextAllowedAt = Date.now() + ANOMALY_COOLDOWN_MS
            break
          }

          if (attempt === SEARCH_MAX_RETRIES) break

          const backoff = SEARCH_INITIAL_BACKOFF_MS * 2 ** attempt + randomJitter(SEARCH_BACKOFF_JITTER_MS)
          console.warn(`[WebService] Search failed (attempt ${attempt + 1}/${SEARCH_MAX_RETRIES + 1}), retrying in ${backoff}ms...`)
          await sleep(backoff)
        }
      }

      const message = lastError?.message ?? 'Web search failed'
      console.error('[WebService] Search error:', message)
      return { success: false, error: `Web search failed: ${message}` }
    })
  }

  private async scrapeDdgHtml(query: string, count: number): Promise<WebSearchResult[]> {
    const body = new URLSearchParams({
      q: query,
      b: '',
      df: '',
      kf: '-1',
      kh: '1',
      kl: 'us-en',
      kp: '-2',
      kz: '-1',
    })

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

    const response = await fetch(DDG_HTML_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      body: body.toString(),
      signal: controller.signal,
      redirect: 'follow',
    })
    clearTimeout(timeout)

    if (!response.ok) {
      throw new Error(`DuckDuckGo HTML returned HTTP ${response.status}`)
    }

    const html = await response.text()

    if (isAnomalyPage(html)) {
      this.nextAllowedAt = Date.now() + ANOMALY_COOLDOWN_MS
      throw new Error('DuckDuckGo requested a CAPTCHA. Wait a minute or configure a Brave Search API key in Settings.')
    }

    const doc = new JSDOM(html).window.document
    const results: WebSearchResult[] = []

    // DDG HTML results are in .result blocks with .result__a title links and .result__snippet snippets.
    doc.querySelectorAll('.result').forEach(result => {
      const link = result.querySelector('a.result__a')
      const snippetEl = result.querySelector('a.result__snippet')
      if (!link) return
      const title = link.textContent?.trim() ?? 'Untitled'
      let url = link.getAttribute('href') ?? ''
      // DDG sometimes wraps results in a redirect URL.
      if (url.startsWith('/')) {
        url = `https://duckduckgo.com${url}`
      }
      const snippet = snippetEl?.textContent?.trim() ?? ''
      if (url) results.push({ title, url, snippet })
    })

    if (results.length === 0) {
      // Fallback selectors if DDG changes class names.
      doc.querySelectorAll('[data-testid="result-title-a"], .result__a').forEach(link => {
        const title = link.textContent?.trim() ?? 'Untitled'
        let url = link.getAttribute('href') ?? ''
        if (url.startsWith('/')) url = `https://duckduckgo.com${url}`
        if (url) results.push({ title, url, snippet: '' })
      })
    }

    return results.slice(0, count)
  }

  async webFetch(url: string, mode: 'article' | 'raw' = 'article'): Promise<{ success: boolean; data?: WebFetchResult; error?: string }> {
    try {
      const normalizedUrl = this.normalizeUrl(url)
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

      const response = await fetch(normalizedUrl, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: controller.signal,
        redirect: 'follow',
      })
      clearTimeout(timeout)

      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}: ${response.statusText}` }
      }

      const contentType = response.headers.get('content-type') || ''
      const isHtml = contentType.includes('text/html')
      const rawText = await response.text()
      const truncated = rawText.length > MAX_RAW_SIZE ? rawText.slice(0, MAX_RAW_SIZE) + '\n\n[Content truncated]' : rawText

      if (mode === 'article' && isHtml) {
        const doc = new JSDOM(truncated, { url: normalizedUrl })
        const reader = new Readability(doc.window.document)
        const article = reader.parse()
        if (article) {
          return {
            success: true,
            data: {
              title: article.title || 'Untitled',
              url: normalizedUrl,
              content: article.textContent?.trim() || '',
              mode,
            },
          }
        }
        // Fall back to raw if readability fails
      }

      return {
        success: true,
        data: {
          title: this.guessTitleFromText(truncated),
          url: normalizedUrl,
          content: truncated,
          mode,
        },
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Web fetch failed'
      if (message.includes('abort')) {
        return { success: false, error: `Web fetch timed out after ${FETCH_TIMEOUT_MS / 1000}s` }
      }
      console.error('[WebService] Fetch error:', message)
      return { success: false, error: `Web fetch failed: ${message}` }
    }
  }

  private normalizeUrl(url: string): string {
    let normalized = url.trim()
    if (!/^https?:\/\//i.test(normalized)) {
      normalized = `https://${normalized}`
    }
    return normalized
  }

  private guessTitleFromText(text: string): string {
    const match = text.match(/<title[^>]*>([^<]*)<\/title>/i)
    if (match?.[1]?.trim()) return match[1].trim()
    const firstLine = text.split('\n').find(line => line.trim())
    return firstLine?.trim().slice(0, 80) || 'Untitled'
  }

  private async respectSearchRateLimit(): Promise<void> {
    const now = Date.now()
    const minAllowed = Math.max(this.nextAllowedAt, this.lastSearchTime + MIN_SEARCH_INTERVAL_MS + randomJitter(SEARCH_INTERVAL_JITTER_MS))
    const wait = Math.max(0, minAllowed - now)

    if (wait > 0) {
      console.log(`[WebService] Rate-limit wait: ${wait}ms`)
      await sleep(wait)
    }

    this.lastSearchTime = Date.now()
  }

  private async enqueueSearch<T>(fn: () => Promise<T>): Promise<T> {
    const previous = this.searchQueue
    const next = previous.then(fn, fn)
    this.searchQueue = next.catch(() => undefined)
    return next
  }
}

let sharedWebService: WebService | null = null

export function getWebService(): WebService {
  if (!sharedWebService) {
    sharedWebService = new WebService()
  }
  return sharedWebService
}
