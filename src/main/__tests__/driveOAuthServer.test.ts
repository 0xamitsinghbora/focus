import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import http from 'http'
import { DriveOAuthServer } from '../driveOAuthServer'
import { shell } from 'electron'
import { auth } from '../driveClient'
import * as configModule from '../../shared/config'

describe('DriveOAuthServer', () => {
  let server: DriveOAuthServer

  beforeEach(() => {
    server = new DriveOAuthServer()
  })

  afterEach(() => {
    if (server) {
      server.close()
    }
    vi.restoreAllMocks()
  })

  it('fails immediately if Google OAuth is not configured', async () => {
    vi.spyOn(configModule, 'isGoogleOAuthConfigured').mockReturnValue(false)
    const result = await server.acquireToken()
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('not configured')
    }
    expect(server.isListening()).toBe(false)
  })

  it('closes any active server when close() is called', () => {
    expect(server.isListening()).toBe(false)
    server.close()
    expect(server.isListening()).toBe(false)
  })

  it('starts loopback server, opens browser with PKCE, and exchanges auth code on callback', async () => {
    vi.spyOn(configModule, 'isGoogleOAuthConfigured').mockReturnValue(true)
    const openExternalSpy = vi.spyOn(shell, 'openExternal').mockResolvedValue()
    const getTokenSpy = vi.spyOn(auth.OAuth2.prototype, 'getToken').mockResolvedValue({
      tokens: { refresh_token: 'mock-refresh-token-123' },
      res: null as any
    } as any)

    const tokenPromise = server.acquireToken()

    await vi.waitFor(() => {
      expect(openExternalSpy).toHaveBeenCalled()
    })

    expect(server.isListening()).toBe(true)

    const authUrl = openExternalSpy.mock.calls[0][0] as string
    const parsedUrl = new URL(authUrl)
    const redirectUri = parsedUrl.searchParams.get('redirect_uri')
    const state = parsedUrl.searchParams.get('state')

    expect(redirectUri).toBeDefined()
    expect(state).toBeDefined()
    expect(parsedUrl.searchParams.get('code_challenge')).toBeTruthy()
    expect(parsedUrl.searchParams.get('code_challenge_method')).toBe('S256')

    // Simulate OAuth callback
    const callbackRes = await fetch(`${redirectUri}?code=my-auth-code&state=${state}`)
    expect(callbackRes.status).toBe(200)
    const body = await callbackRes.text()
    expect(body).toContain('Authentication successful!')

    const tokenResult = await tokenPromise
    expect(tokenResult.success).toBe(true)
    if (tokenResult.success) {
      expect(tokenResult.refreshToken).toBe('mock-refresh-token-123')
    }

    expect(getTokenSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'my-auth-code',
        redirect_uri: redirectUri,
        codeVerifier: expect.any(String)
      })
    )

    expect(server.isListening()).toBe(false)
  })

  it('returns CSRF mismatch error and responds with 403 on invalid state', async () => {
    vi.spyOn(configModule, 'isGoogleOAuthConfigured').mockReturnValue(true)
    const openExternalSpy = vi.spyOn(shell, 'openExternal').mockResolvedValue()

    const tokenPromise = server.acquireToken()

    await vi.waitFor(() => {
      expect(openExternalSpy).toHaveBeenCalled()
    })

    const authUrl = openExternalSpy.mock.calls[0][0] as string
    const parsedUrl = new URL(authUrl)
    const redirectUri = parsedUrl.searchParams.get('redirect_uri')

    const callbackRes = await fetch(`${redirectUri}?code=code-123&state=wrong-state`)
    expect(callbackRes.status).toBe(403)

    const result = await tokenPromise
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBe('CSRF state mismatch')
    }
  })

  it('returns error when callback lacks code', async () => {
    vi.spyOn(configModule, 'isGoogleOAuthConfigured').mockReturnValue(true)
    const openExternalSpy = vi.spyOn(shell, 'openExternal').mockResolvedValue()

    const tokenPromise = server.acquireToken()

    await vi.waitFor(() => {
      expect(openExternalSpy).toHaveBeenCalled()
    })

    const authUrl = openExternalSpy.mock.calls[0][0] as string
    const parsedUrl = new URL(authUrl)
    const redirectUri = parsedUrl.searchParams.get('redirect_uri')
    const state = parsedUrl.searchParams.get('state')

    const callbackRes = await fetch(`${redirectUri}?state=${state}`)
    expect(callbackRes.status).toBe(400)

    const result = await tokenPromise
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBe('No code received')
    }
  })

  it('falls back to consecutive ports when preferred port is occupied by EADDRINUSE', async () => {
    vi.spyOn(configModule, 'isGoogleOAuthConfigured').mockReturnValue(true)
    const openExternalSpy = vi.spyOn(shell, 'openExternal').mockResolvedValue()

    // Occupy a dummy port using http.createServer
    const blocker = http.createServer((_, res) => res.end())
    try {
      await new Promise<void>((resolve, reject) => {
        blocker.once('error', reject)
        blocker.listen(3456, () => resolve())
      })
    } catch {
      // If 3456 cannot be bound on this system, skip test gracefully
      return
    }

    try {
      void server.acquireToken()
      await vi.waitFor(() => {
        expect(openExternalSpy).toHaveBeenCalled()
      })

      const authUrl = openExternalSpy.mock.calls[0][0] as string
      const parsedUrl = new URL(authUrl)
      const redirectUri = parsedUrl.searchParams.get('redirect_uri')
      expect(redirectUri).toBeDefined()
      const port = new URL(redirectUri!).port
      expect(port).not.toBe('3456')
      expect(parseInt(port, 10)).toBeGreaterThanOrEqual(3457)

      server.close()
    } finally {
      await new Promise<void>((resolve) => blocker.close(() => resolve()))
    }
  })

  it('returns a user-friendly error when all candidate ports are in use', async () => {
    vi.spyOn(configModule, 'isGoogleOAuthConfigured').mockReturnValue(true)
    vi.spyOn(http, 'createServer').mockImplementation(() => {
      const fakeServer: any = {
        once: (event: string, cb: any) => {
          if (event === 'error') {
            const err = new Error('bind EADDRINUSE 127.0.0.1:3456') as any
            err.code = 'EADDRINUSE'
            setTimeout(() => cb(err), 5)
          }
        },
        removeListener: () => {},
        listen: () => {},
        close: () => {},
        closeAllConnections: () => {}
      }
      return fakeServer
    })

    const result = await server.acquireToken()
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('Another application is using these ports')
    }
  })

  it('handles OAuth error query parameters gracefully', async () => {
    vi.spyOn(configModule, 'isGoogleOAuthConfigured').mockReturnValue(true)
    const openExternalSpy = vi.spyOn(shell, 'openExternal').mockResolvedValue()

    const tokenPromise = server.acquireToken()

    await vi.waitFor(() => {
      expect(openExternalSpy).toHaveBeenCalled()
    })

    const authUrl = openExternalSpy.mock.calls[0][0] as string
    const parsedUrl = new URL(authUrl)
    const redirectUri = parsedUrl.searchParams.get('redirect_uri')
    const state = parsedUrl.searchParams.get('state')

    const callbackRes = await fetch(`${redirectUri}?error=access_denied&state=${state}`)
    expect(callbackRes.status).toBe(400)
    const body = await callbackRes.text()
    expect(body).toContain('Authentication failed')
    expect(body).toContain('access_denied')

    const result = await tokenPromise
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBe('access_denied')
    }
  })

  it('renders a helpful hint when Google returns redirect_uri_mismatch', async () => {
    vi.spyOn(configModule, 'isGoogleOAuthConfigured').mockReturnValue(true)
    const openExternalSpy = vi.spyOn(shell, 'openExternal').mockResolvedValue()

    const tokenPromise = server.acquireToken()

    await vi.waitFor(() => {
      expect(openExternalSpy).toHaveBeenCalled()
    })

    const authUrl = openExternalSpy.mock.calls[0][0] as string
    const parsedUrl = new URL(authUrl)
    const redirectUri = parsedUrl.searchParams.get('redirect_uri')
    const state = parsedUrl.searchParams.get('state')

    const callbackRes = await fetch(`${redirectUri}?error=redirect_uri_mismatch&state=${state}`)
    expect(callbackRes.status).toBe(400)
    const body = await callbackRes.text()
    expect(body).toContain('Google rejected the callback URI')
    expect(body).toContain('Authorized redirect URIs in Google Cloud Console')

    const result = await tokenPromise
    expect(result.success).toBe(false)
  })

  it('supports custom URI scheme callback (focusapp://oauth2callback)', async () => {
    vi.spyOn(configModule, 'isGoogleOAuthConfigured').mockReturnValue(true)
    vi.spyOn(configModule, 'GOOGLE_OAUTH', 'get').mockReturnValue({
      clientId: 'mock-client-id',
      clientSecret: 'mock-client-secret',
      redirectUri: 'focusapp://oauth2callback'
    } as any)

    const openExternalSpy = vi.spyOn(shell, 'openExternal').mockResolvedValue()
    vi.spyOn(auth.OAuth2.prototype, 'getToken').mockResolvedValue({
      tokens: { refresh_token: 'custom-scheme-refresh-token' },
      res: null as any
    } as any)

    const tokenPromise = server.acquireToken()

    await vi.waitFor(() => {
      expect(openExternalSpy).toHaveBeenCalled()
    })

    const authUrl = openExternalSpy.mock.calls[0][0] as string
    const parsedUrl = new URL(authUrl)
    const redirectUri = parsedUrl.searchParams.get('redirect_uri')
    const state = parsedUrl.searchParams.get('state')

    expect(redirectUri).toBe('focusapp://oauth2callback')

    // Simulate custom protocol callback dispatched from OS/Electron
    const handled = DriveOAuthServer.handleCustomProtocolUrl(
      `focusapp://oauth2callback?code=mock-code&state=${state}`
    )
    expect(handled).toBe(true)

    const tokenResult = await tokenPromise
    expect(tokenResult.success).toBe(true)
    if (tokenResult.success) {
      expect(tokenResult.refreshToken).toBe('custom-scheme-refresh-token')
    }
  })
})
