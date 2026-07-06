/**
 * Linear OAuth 2.0 service.
 *
 * Handles the authorization-code flow with PKCE, token refresh, and encrypted
 * storage. GraphQL calls are made through this service so the connector sandbox
 * never sees the access token.
 *
 * User setup:
 * 1. Create an OAuth app in Linear settings.
 * 2. Set redirect URI to http://127.0.0.1:43737/oauth/callback.
 * 3. Paste clientId (and clientSecret if confidential) into the connector settings.
 * 4. Click Connect and authorize in the browser.
 */

import { EventEmitter } from 'events'
import * as http from 'http'
import * as crypto from 'crypto'
import { shell } from 'electron'
import { StorageService } from './storage'

const LINEAR_AUTH_URL = 'https://linear.app/oauth/authorize'
const LINEAR_TOKEN_URL = 'https://api.linear.app/oauth/token'
const LINEAR_API_URL = 'https://api.linear.app/graphql'
const LINEAR_CALLBACK_PORT = 43737
const LINEAR_CALLBACK_PATH = '/oauth/callback'
export const LINEAR_REDIRECT_URI = `http://127.0.0.1:${LINEAR_CALLBACK_PORT}${LINEAR_CALLBACK_PATH}`

const SECURE_TOKENS_KEY = 'connector:linear:tokens'
const SECURE_CLIENT_KEY = 'connector:linear:client'
const AUTO_CONNECT_KEY = 'linearAutoConnect'

interface LinearTokens {
  access_token: string
  refresh_token?: string
  expires_at?: number
  token_type: string
  scope?: string
}

interface LinearClientCredentials {
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

export class LinearOAuthService extends EventEmitter {
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

  private loadTokens(): LinearTokens | null {
    const raw = this.storage.getSecure(SECURE_TOKENS_KEY)
    if (!raw) return null
    try {
      return JSON.parse(raw) as LinearTokens
    } catch {
      return null
    }
  }

  private saveTokens(tokens: LinearTokens): void {
    this.storage.setSecure(SECURE_TOKENS_KEY, JSON.stringify(tokens))
  }

  private loadClientCredentials(): LinearClientCredentials | null {
    const raw = this.storage.getSecure(SECURE_CLIENT_KEY)
    if (!raw) return null
    try {
      return JSON.parse(raw) as LinearClientCredentials
    } catch {
      return null
    }
  }

  async saveClientCredentials(credentials: LinearClientCredentials): Promise<void> {
    this.storage.setSecure(SECURE_CLIENT_KEY, JSON.stringify(credentials))
  }

  private clearTokens(): void {
    this.storage.setSecure(SECURE_TOKENS_KEY, '')
  }

  private clearClientCredentials(): void {
    this.storage.setSecure(SECURE_CLIENT_KEY, '')
  }

  private async fetchToken(params: Record<string, string>): Promise<LinearTokens> {
    const body = new URLSearchParams(params)
    const response = await fetch(LINEAR_TOKEN_URL, {
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

  private startCallbackServer(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (this.callbackServer) {
        this.stopCallbackServer()
      }

      this.callbackServer = http.createServer((req, res) => {
        const url = new URL(req.url || '/', `http://localhost:${LINEAR_CALLBACK_PORT}`)

        if (url.pathname !== LINEAR_CALLBACK_PATH) {
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
      this.callbackServer.listen(LINEAR_CALLBACK_PORT, '127.0.0.1', () => {
        resolve(LINEAR_REDIRECT_URI)
      })
    })
  }

  private stopCallbackServer(): void {
    if (this.callbackServer) {
      this.callbackServer.close()
      this.callbackServer = null
    }
  }

  private waitForCallback(): Promise<OAuthCallbackResult> {
    return new Promise((resolve) => {
      this.pendingCallback = resolve
    })
  }

  async connect(forceReauth = false): Promise<{ success: boolean; error?: string }> {
    if (this.connectionState === 'connecting' || this.connectionState === 'oauth_pending') {
      return { success: false, error: 'Linear OAuth connection already in progress' }
    }

    this.setState('connecting')

    try {
      const client = this.loadClientCredentials()
      if (!client?.clientId) {
        this.setState('error', 'Linear OAuth client ID not configured. Add it in Connectors → Linear.')
        return { success: false, error: 'Linear OAuth client ID not configured.' }
      }

      const tokens = this.loadTokens()
      if (!forceReauth && tokens?.refresh_token) {
        try {
          const refreshed = await this.refreshTokens(tokens.refresh_token)
          this.saveTokens(refreshed)
          this.setState('connected')
          return { success: true }
        } catch (err) {
          console.log('[LinearOAuth] Refresh failed, starting new auth flow:', err instanceof Error ? err.message : err)
          // fall through to full auth
        }
      }

      this.setState('oauth_pending')
      await this.startCallbackServer()

      this.currentVerifier = generateCodeVerifier()
      this.currentState = generateState()
      const challenge = generateCodeChallenge(this.currentVerifier)

      const authUrl = new URL(LINEAR_AUTH_URL)
      authUrl.searchParams.set('response_type', 'code')
      authUrl.searchParams.set('client_id', client.clientId)
      authUrl.searchParams.set('redirect_uri', LINEAR_REDIRECT_URI)
      authUrl.searchParams.set('scope', 'read write')
      authUrl.searchParams.set('state', this.currentState)
      authUrl.searchParams.set('code_challenge', challenge)
      authUrl.searchParams.set('code_challenge_method', 'S256')

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
        throw new Error('No authorization code received from Linear.')
      }
      if (callback.state !== this.currentState) {
        throw new Error('OAuth state mismatch. Possible CSRF attack.')
      }

      const tokenParams: Record<string, string> = {
        grant_type: 'authorization_code',
        code: callback.code,
        redirect_uri: LINEAR_REDIRECT_URI,
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
      const message = err instanceof Error ? err.message : 'Linear OAuth failed'
      console.error('[LinearOAuth] Connect failed:', message)
      this.setState('error', message)
      return { success: false, error: message }
    } finally {
      this.stopCallbackServer()
      this.currentVerifier = null
      this.currentState = null
    }
  }

  private async refreshTokens(refreshToken: string): Promise<LinearTokens> {
    const client = this.loadClientCredentials()
    if (!client?.clientId) throw new Error('Linear OAuth client ID not configured.')

    const params: Record<string, string> = {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: client.clientId,
    }
    if (client.clientSecret) params.client_secret = client.clientSecret

    return await this.fetchToken(params)
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
        console.error('[LinearOAuth] Token refresh failed:', err instanceof Error ? err.message : err)
        this.setState('error', 'Linear session expired. Please reconnect.')
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

  async apiCall(query: string, variables?: Record<string, unknown>): Promise<{ success: boolean; data?: unknown; error?: string }> {
    const accessToken = await this.getAccessToken()
    if (!accessToken) {
      return { success: false, error: 'Linear OAuth not connected. Connect in Connectors → Linear.' }
    }

    try {
      const response = await fetch(LINEAR_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ query, variables: variables || {} }),
      })

      if (!response.ok) {
        const text = await response.text()
        return { success: false, error: `Linear API error (${response.status}): ${text}` }
      }

      const body = await response.json()
      if (body.errors && body.errors.length > 0) {
        const messages = body.errors.map((e: { message?: string }) => e.message || JSON.stringify(e)).join('; ')
        return { success: false, error: `Linear GraphQL error: ${messages}` }
      }

      return { success: true, data: body.data }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Linear API request failed'
      return { success: false, error: message }
    }
  }

  async autoConnectOnStartup(): Promise<void> {
    if (this.storage.get(AUTO_CONNECT_KEY) === false) return
    if (!this.hasStoredAuth()) return
    if (this.getConnectionStatus()) return

    console.log('[LinearOAuth] Auto-connecting from stored session')
    const result = await this.connect()
    if (!result.success) {
      console.warn('[LinearOAuth] Auto-connect failed:', result.error)
    }
  }
}

// Singleton instance
let linearOAuthService: LinearOAuthService | null = null

export function getLinearOAuthService(storage?: StorageService): LinearOAuthService | null {
  if (storage) {
    linearOAuthService = new LinearOAuthService(storage)
  }
  return linearOAuthService
}
