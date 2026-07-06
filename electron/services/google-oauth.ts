/**
 * Shared Google OAuth 2.0 service for Gmail, Google Calendar, and Google Drive.
 *
 * Handles the authorization-code flow with PKCE, token refresh, and encrypted
 * storage. All Google API calls are made through this service so connector
 * sandboxes never see the access token.
 *
 * User setup:
 * 1. Create an OAuth app in Google Cloud Console.
 * 2. Set redirect URI to http://127.0.0.1:43738.
 * 3. Paste clientId (and clientSecret if confidential) into the connector settings.
 * 4. Click Connect and authorize in the browser.
 */

import { EventEmitter } from 'events'
import * as http from 'http'
import * as crypto from 'crypto'
import { shell } from 'electron'
import { StorageService } from './storage'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_API_BASE = 'https://www.googleapis.com'
const GOOGLE_CALLBACK_PORT = 43738
export const GOOGLE_REDIRECT_URI = `http://127.0.0.1:${GOOGLE_CALLBACK_PORT}`
const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/drive',
].join(' ')

const SECURE_TOKENS_KEY = 'connector:google:tokens'
const SECURE_CLIENT_KEY = 'connector:google:client'
const AUTO_CONNECT_KEY = 'googleAutoConnect'

interface GoogleTokens {
  access_token: string
  refresh_token?: string
  expires_at?: number
  token_type: string
  scope?: string
}

interface GoogleClientCredentials {
  clientId: string
  clientSecret?: string
}

interface OAuthCallbackResult {
  code: string
  state: string
  error?: string
}

function base64urlEncode(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function generateCodeVerifier(): string {
  return base64urlEncode(crypto.randomBytes(32))
}

function generateCodeChallenge(verifier: string): string {
  return base64urlEncode(crypto.createHash('sha256').update(verifier).digest())
}

function generateState(): string {
  return crypto.randomUUID()
}

export class GoogleOAuthService extends EventEmitter {
  private storage: StorageService
  private connectionState: 'disconnected' | 'connecting' | 'oauth_pending' | 'connected' | 'error' = 'disconnected'
  private callbackServer: http.Server | null = null
  private pendingCallback: ((result: OAuthCallbackResult) => void) | null = null
  private currentState: string | null = null
  private currentVerifier: string | null = null

  constructor(storage: StorageService) {
    super()
    this.storage = storage
  }

  private setState(state: typeof this.connectionState, error?: string): void {
    this.connectionState = state
    this.emit('stateChange', { state, error })
  }

  getConnectionStatus(): boolean {
    return this.connectionState === 'connected'
  }

  getConnectionState(): { state: typeof this.connectionState; connected: boolean; error?: string } {
    return {
      state: this.connectionState,
      connected: this.connectionState === 'connected',
    }
  }

  hasStoredAuth(): boolean {
    return !!this.loadTokens()
  }

  private loadTokens(): GoogleTokens | null {
    const raw = this.storage.getSecure(SECURE_TOKENS_KEY)
    if (!raw) return null
    try {
      return JSON.parse(raw) as GoogleTokens
    } catch {
      return null
    }
  }

  private saveTokens(tokens: GoogleTokens): void {
    this.storage.setSecure(SECURE_TOKENS_KEY, JSON.stringify(tokens))
  }

  private loadClientCredentials(): GoogleClientCredentials | null {
    const raw = this.storage.getSecure(SECURE_CLIENT_KEY)
    if (!raw) return null
    try {
      return JSON.parse(raw) as GoogleClientCredentials
    } catch {
      return null
    }
  }

  async saveClientCredentials(credentials: GoogleClientCredentials): Promise<void> {
    this.storage.setSecure(SECURE_CLIENT_KEY, JSON.stringify(credentials))
  }

  private clearTokens(): void {
    this.storage.setSecure(SECURE_TOKENS_KEY, '')
  }

  private clearClientCredentials(): void {
    this.storage.setSecure(SECURE_CLIENT_KEY, '')
  }

  private async fetchToken(params: Record<string, string>): Promise<GoogleTokens> {
    const body = new URLSearchParams(params)
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Token exchange failed (${response.status}): ${text}`)
    }

    const data = await response.json()
    if (!data.access_token) {
      throw new Error(`Invalid token response: ${JSON.stringify(data)}`)
    }

    const expiresAt = data.expires_in
      ? Date.now() + data.expires_in * 1000
      : undefined

    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: expiresAt,
      token_type: data.token_type || 'Bearer',
      scope: data.scope,
    }
  }

  private async startCallbackServer(): Promise<string> {
    if (this.callbackServer?.listening) {
      return GOOGLE_REDIRECT_URI
    }
    if (this.callbackServer) {
      await this.stopCallbackServerAsync()
    }

    return new Promise((resolve, reject) => {
      this.callbackServer = http.createServer((req, res) => {
        const url = new URL(req.url || '/', `http://localhost:${GOOGLE_CALLBACK_PORT}`)

        if (url.pathname !== '/' && url.pathname !== '') {
          res.writeHead(404)
          res.end('Not found')
          return
        }

        const code = url.searchParams.get('code') || ''
        const state = url.searchParams.get('state') || ''
        const error = url.searchParams.get('error') || undefined

        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(`
          <html>
            <body style="font-family: system-ui; text-align: center; padding-top: 3rem;">
              <h2>Authorization ${error ? 'failed' : 'successful'}</h2>
              <p>${error ? `Error: ${error}` : 'You can close this window and return to smile:D.'}</p>
            </body>
          </html>
        `)

        if (this.pendingCallback) {
          this.pendingCallback({ code, state, error })
          this.pendingCallback = null
        }
      })

      this.callbackServer.on('error', reject)
      this.callbackServer.listen(GOOGLE_CALLBACK_PORT, '127.0.0.1', () => {
        resolve(GOOGLE_REDIRECT_URI)
      })
    })
  }

  private stopCallbackServer(): void {
    if (this.callbackServer) {
      this.callbackServer.close()
      this.callbackServer = null
    }
  }

  private stopCallbackServerAsync(): Promise<void> {
    return new Promise(resolve => {
      if (!this.callbackServer) {
        resolve()
        return
      }
      const server = this.callbackServer
      this.callbackServer = null
      server.close(err => {
        if (err) {
          console.log('[GoogleOAuth] Callback server close error:', err.message)
        }
        resolve()
      })
    })
  }

  private waitForCallback(): Promise<OAuthCallbackResult> {
    return new Promise((resolve) => {
      this.pendingCallback = resolve
    })
  }

  async connect(forceReauth = false): Promise<{ success: boolean; error?: string }> {
    if (this.connectionState === 'connecting' || this.connectionState === 'oauth_pending') {
      return { success: false, error: 'Google OAuth connection already in progress' }
    }

    this.setState('connecting')

    try {
      const client = this.loadClientCredentials()
      if (!client?.clientId) {
        this.setState('error', 'Google OAuth client ID not configured. Add it in Connectors → Google.')
        return { success: false, error: 'Google OAuth client ID not configured.' }
      }

      const tokens = this.loadTokens()
      if (!forceReauth && tokens?.refresh_token) {
        try {
          const refreshed = await this.refreshTokens(tokens.refresh_token)
          this.saveTokens(refreshed)
          this.setState('connected')
          return { success: true }
        } catch (err) {
          console.log('[GoogleOAuth] Refresh failed, starting new auth flow:', err instanceof Error ? err.message : err)
          // fall through to full auth
        }
      }

      this.setState('oauth_pending')
      try {
        await this.startCallbackServer()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to start OAuth callback server'
        if (message.includes('EADDRINUSE')) {
          this.setState('error', `Port ${GOOGLE_CALLBACK_PORT} is already in use. Quit any other smile:D instances and try again.`)
          return { success: false, error: `Port ${GOOGLE_CALLBACK_PORT} is already in use.` }
        }
        throw err
      }

      this.currentVerifier = generateCodeVerifier()
      this.currentState = generateState()
      const challenge = generateCodeChallenge(this.currentVerifier)

      const authUrl = new URL(GOOGLE_AUTH_URL)
      authUrl.searchParams.set('response_type', 'code')
      authUrl.searchParams.set('client_id', client.clientId)
      authUrl.searchParams.set('redirect_uri', GOOGLE_REDIRECT_URI)
      authUrl.searchParams.set('scope', GOOGLE_SCOPES)
      authUrl.searchParams.set('state', this.currentState)
      authUrl.searchParams.set('code_challenge', challenge)
      authUrl.searchParams.set('code_challenge_method', 'S256')
      // offline + consent are required to receive a refresh_token from Google
      authUrl.searchParams.set('access_type', 'offline')
      authUrl.searchParams.set('prompt', 'consent')

      await shell.openExternal(authUrl.toString())

      const callback = await Promise.race([
        this.waitForCallback(),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('OAuth flow timed out. If you closed the browser, click Connect again.')), 5 * 60 * 1000)
        }),
      ])

      if (callback.error) {
        throw new Error(`OAuth error: ${callback.error}`)
      }
      if (!callback.code) {
        throw new Error('No authorization code received from Google.')
      }
      if (callback.state !== this.currentState) {
        throw new Error('OAuth state mismatch. Possible CSRF attack.')
      }

      const tokenParams: Record<string, string> = {
        grant_type: 'authorization_code',
        code: callback.code,
        redirect_uri: GOOGLE_REDIRECT_URI,
        client_id: client.clientId,
        code_verifier: this.currentVerifier,
      }
      if (client.clientSecret) tokenParams.client_secret = client.clientSecret

      const newTokens = await this.fetchToken(tokenParams)
      this.saveTokens(newTokens)
      this.setState('connected')
      this.storage.set(AUTO_CONNECT_KEY, true)
      return { success: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Google OAuth failed'
      console.error('[GoogleOAuth] Connect failed:', message)
      this.setState('error', message)
      return { success: false, error: message }
    } finally {
      this.stopCallbackServer()
      this.currentVerifier = null
      this.currentState = null
    }
  }

  private async refreshTokens(refreshToken: string): Promise<GoogleTokens> {
    const client = this.loadClientCredentials()
    if (!client?.clientId) throw new Error('Google OAuth client ID not configured.')

    const params: Record<string, string> = {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: client.clientId,
    }
    if (client.clientSecret) params.client_secret = client.clientSecret

    const refreshed = await this.fetchToken(params)
    // Google does not return a new refresh_token on refresh; keep the existing one.
    if (!refreshed.refresh_token) {
      const existing = this.loadTokens()
      refreshed.refresh_token = existing?.refresh_token
    }
    return refreshed
  }

  async getAccessToken(): Promise<string | null> {
    const tokens = this.loadTokens()
    if (!tokens) return null

    const isExpired = tokens.expires_at ? Date.now() >= tokens.expires_at - 60000 : false
    if (isExpired && tokens.refresh_token) {
      try {
        const refreshed = await this.refreshTokens(tokens.refresh_token)
        this.saveTokens(refreshed)
        return refreshed.access_token
      } catch (err) {
        console.error('[GoogleOAuth] Token refresh failed:', err instanceof Error ? err.message : err)
        this.setState('error', 'Google session expired. Please reconnect.')
        return null
      }
    }

    return tokens.access_token
  }

  async disconnect(): Promise<void> {
    this.stopCallbackServer()
    this.clearTokens()
    this.storage.set(AUTO_CONNECT_KEY, false)
    this.setState('disconnected')
  }

  async clearClientAndDisconnect(): Promise<void> {
    await this.disconnect()
    this.clearClientCredentials()
  }

  async apiCall(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'GET',
    body?: Record<string, unknown> | string,
    queryParams?: Record<string, string>,
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    const accessToken = await this.getAccessToken()
    if (!accessToken) {
      return { success: false, error: 'Google OAuth not connected. Connect in Connectors → Google.' }
    }

    try {
      const url = new URL(`${GOOGLE_API_BASE}${endpoint}`)
      if (queryParams) {
        for (const [key, value] of Object.entries(queryParams)) {
          url.searchParams.set(key, value)
        }
      }

      const headers: Record<string, string> = {
        'Authorization': `${this.loadTokens()?.token_type || 'Bearer'} ${accessToken}`,
      }
      const init: RequestInit = { method }

      if (body && method !== 'GET') {
        if (typeof body === 'string') {
          headers['Content-Type'] = 'text/plain; charset=utf-8'
          init.body = body
        } else {
          headers['Content-Type'] = 'application/json'
          init.body = JSON.stringify(body)
        }
      }
      init.headers = headers

      const response = await fetch(url.toString(), init)

      if (!response.ok) {
        const text = await response.text()
        return { success: false, error: `Google API error (${response.status}): ${text}` }
      }

      const contentType = response.headers.get('content-type') || ''
      const data = contentType.includes('application/json') ? await response.json() : await response.text()
      return { success: true, data }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Google API request failed'
      return { success: false, error: message }
    }
  }

  async autoConnectOnStartup(): Promise<void> {
    if (this.storage.get(AUTO_CONNECT_KEY) === false) return
    if (!this.hasStoredAuth()) return
    if (this.getConnectionStatus()) return

    console.log('[GoogleOAuth] Auto-connecting from stored session')
    const result = await this.connect()
    if (!result.success) {
      console.warn('[GoogleOAuth] Auto-connect failed:', result.error)
    }
  }
}

// Singleton instance
let googleOAuthService: GoogleOAuthService | null = null

export function getGoogleOAuthService(storage?: StorageService): GoogleOAuthService | null {
  if (storage) {
    googleOAuthService = new GoogleOAuthService(storage)
  }
  return googleOAuthService
}
