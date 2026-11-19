import http from 'http'
import { randomBytes, createHash } from 'crypto'
import { EventEmitter } from 'events'
import { app, shell } from 'electron'
import { auth } from './driveClient'
import { GOOGLE_OAUTH, isGoogleOAuthConfigured } from '../shared/config'
import { logger } from './logger'
import { renderOAuthCallbackHtml } from './oauthCallbackHtml'

interface OAuthTokenSuccess {
  success: true
  refreshToken: string
}

interface OAuthTokenFailure {
  success: false
  error: string
}

type OAuthTokenResult = OAuthTokenSuccess | OAuthTokenFailure

const oauthCustomSchemeEvents = new EventEmitter()

export class DriveOAuthServer {
  private activeServer: http.Server | null = null
  private customProtocolActive = false

  public static handleCustomProtocolUrl(rawUrl: string): boolean {
    try {
      const parsed = new URL(rawUrl)
      if (
        (parsed.protocol === 'focus:' || parsed.protocol === 'focusapp:') &&
        (parsed.pathname.includes('oauth2callback') || parsed.host.includes('oauth2callback'))
      ) {
        oauthCustomSchemeEvents.emit('callback', rawUrl)
        return true
      }
    } catch {
      // ignore
    }
    return false
  }

  public isListening(): boolean {
    return Boolean(this.activeServer?.listening || this.customProtocolActive)
  }

  public close(): void {
    this.customProtocolActive = false
    if (this.activeServer?.listening) {
      try {
        this.activeServer.closeAllConnections?.()
        this.activeServer.close()
      } catch {
        // Server may already be closed or closing
      }
      this.activeServer = null
    }
  }

  public async acquireToken(): Promise<OAuthTokenResult> {
    if (!isGoogleOAuthConfigured()) {
      return {
        success: false,
        error:
          'Google Drive cloud backup is not configured in this build. Cloud sync is optional; all your focus logs and tasks remain safely stored locally.'
      }
    }

    // Clean up any previously pending OAuth server if user re-triggers connect
    this.close()

    const DEFAULT_PORT = 3456
    let preferredPort = DEFAULT_PORT
    let callbackPath = '/oauth2callback'
    let loopbackHost = '127.0.0.1'

    if (GOOGLE_OAUTH.redirectUri) {
      try {
        const parsed = new URL(GOOGLE_OAUTH.redirectUri)
        if (parsed.protocol === 'focus:' || parsed.protocol === 'focusapp:') {
          // Custom protocol scheme handler
          const customScheme = parsed.protocol.replace(':', '')
          try {
            if (app && typeof app.setAsDefaultProtocolClient === 'function') {
              app.setAsDefaultProtocolClient(customScheme)
            }
          } catch {
            // ignore
          }

          this.customProtocolActive = true

          return new Promise((resolve) => {
            let isCleanedUp = false
            let timeoutTimer: NodeJS.Timeout | null = null
            const csrfState = randomBytes(32).toString('hex')
            const codeVerifier = randomBytes(32).toString('base64url')
            const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url')
            const redirectUri = GOOGLE_OAUTH.redirectUri!

            const oauth2Client = new auth.OAuth2(
              GOOGLE_OAUTH.clientId,
              GOOGLE_OAUTH.clientSecret,
              redirectUri
            )

            const cleanup = (): void => {
              if (isCleanedUp) return
              isCleanedUp = true
              this.customProtocolActive = false
              if (timeoutTimer) {
                clearTimeout(timeoutTimer)
                timeoutTimer = null
              }
              oauthCustomSchemeEvents.removeListener('callback', onCallback)
            }

            const onCallback = async (rawUrl: string): Promise<void> => {
              try {
                const url = new URL(rawUrl)
                const code = url.searchParams.get('code')
                const returnedState = url.searchParams.get('state')
                const errorParam = url.searchParams.get('error')
                const errorDesc = url.searchParams.get('error_description')

                if (returnedState !== csrfState) {
                  cleanup()
                  resolve({ success: false, error: 'CSRF state mismatch' })
                  return
                }

                if (errorParam) {
                  cleanup()
                  resolve({ success: false, error: errorDesc || errorParam })
                  return
                }

                if (code) {
                  const { tokens } = await oauth2Client.getToken({
                    code,
                    codeVerifier,
                    redirect_uri: redirectUri
                  })
                  if (tokens.refresh_token) {
                    cleanup()
                    resolve({ success: true, refreshToken: tokens.refresh_token })
                  } else {
                    cleanup()
                    resolve({ success: false, error: 'No refresh token received' })
                  }
                } else {
                  cleanup()
                  resolve({ success: false, error: 'No code received' })
                }
              } catch (err: unknown) {
                cleanup()
                const message = err instanceof Error ? err.message : String(err)
                resolve({ success: false, error: message })
              }
            }

            oauthCustomSchemeEvents.on('callback', onCallback)

            const authUrl = oauth2Client.generateAuthUrl({
              access_type: 'offline',
              scope: ['https://www.googleapis.com/auth/drive.appdata'],
              prompt: 'consent',
              state: csrfState,
              redirect_uri: redirectUri,
              code_challenge: codeChallenge,
              code_challenge_method: 'S256'
            })

            shell.openExternal(authUrl).catch((err: Error) => {
              cleanup()
              resolve({ success: false, error: 'Failed to open browser: ' + err.message })
            })

            timeoutTimer = setTimeout(
              () => {
                cleanup()
                resolve({ success: false, error: 'Timeout waiting for authentication' })
              },
              3 * 60 * 1000
            )
          })
        }

        if (parsed.port) {
          preferredPort = parseInt(parsed.port, 10)
        }
        if (parsed.pathname && parsed.pathname !== '/') {
          callbackPath = parsed.pathname
        }
        if (parsed.hostname) {
          loopbackHost = parsed.hostname
        }
      } catch {
        // Fallback to defaults
      }
    }

    // Try preferred port first (e.g. 3456), then fallback consecutive ports (e.g. 3457..3460)
    // authorized in Google Cloud Console. If GOOGLE_OAUTH_DISABLE_PORT_FALLBACK is set, only use preferredPort.
    const disablePortFallback =
      typeof process !== 'undefined' &&
      process.env &&
      process.env.GOOGLE_OAUTH_DISABLE_PORT_FALLBACK === 'true'

    const candidatePorts =
      preferredPort > 0
        ? disablePortFallback
          ? [preferredPort]
          : [
              preferredPort,
              preferredPort + 1,
              preferredPort + 2,
              preferredPort + 3,
              preferredPort + 4
            ]
        : [0]

    return new Promise((resolve) => {
      let isCleanedUp = false
      let timeoutTimer: NodeJS.Timeout | null = null
      let actualRedirectUri = ''
      let oauth2Client: InstanceType<typeof auth.OAuth2> | null = null
      let boundPort: number | null = null
      const csrfState = randomBytes(32).toString('hex')
      const codeVerifier = randomBytes(32).toString('base64url')
      const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url')

      const requestHandler: http.RequestListener = async (req, res) => {
        try {
          if (req.url?.startsWith(callbackPath)) {
            const url = new URL(req.url, `http://${loopbackHost}:${boundPort}`)
            const code = url.searchParams.get('code')
            const returnedState = url.searchParams.get('state')
            const errorParam = url.searchParams.get('error')
            const errorDesc = url.searchParams.get('error_description')

            if (returnedState !== csrfState) {
              res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' })
              res.end(
                renderOAuthCallbackHtml({
                  status: 'error',
                  title: 'Authentication failed',
                  message:
                    'Security verification failed: invalid state parameter. Please return to Focus and try connecting again.'
                })
              )
              cleanup()
              resolve({ success: false, error: 'CSRF state mismatch' })
              return
            }

            if (errorParam) {
              res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
              res.end(
                renderOAuthCallbackHtml({
                  status: 'error',
                  title: 'Authentication failed',
                  message: errorDesc || `Google authorization error: ${errorParam}`,
                  hint:
                    errorParam === 'access_denied'
                      ? 'Access was denied or cancelled. If your Google Cloud project is in Testing mode, ensure your Google email is added to Test Users in Google Cloud Console.'
                      : errorParam === 'redirect_uri_mismatch'
                        ? `Google rejected the callback URI (${actualRedirectUri}) as unauthorized. Ensure all ports ${preferredPort}–${preferredPort + 4} are added to Authorized redirect URIs in Google Cloud Console, or free up port ${preferredPort}.`
                        : undefined
                })
              )
              cleanup()
              resolve({ success: false, error: errorDesc || errorParam })
              return
            }

            if (code && oauth2Client) {
              logger.info('drive', 'Received authorization code, exchanging for tokens...')
              try {
                const { tokens } = await oauth2Client.getToken({
                  code,
                  codeVerifier,
                  redirect_uri: actualRedirectUri
                })

                if (tokens.refresh_token) {
                  logger.info('drive', 'Successfully acquired refresh token from Google')
                  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
                  res.end(
                    renderOAuthCallbackHtml({
                      status: 'success',
                      title: 'Authentication successful!',
                      message:
                        'Google Drive cloud backup is now connected to Focus. You can close this tab and return to Focus.'
                    })
                  )
                  cleanup()
                  resolve({ success: true, refreshToken: tokens.refresh_token })
                } else {
                  logger.warn('drive', 'No refresh token returned by Google')
                  res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
                  res.end(
                    renderOAuthCallbackHtml({
                      status: 'error',
                      title: 'Authentication failed',
                      message:
                        'Google did not return a refresh token. If you previously connected this account, please visit your Google Account permissions (https://myaccount.google.com/permissions) to remove Focus and connect again.',
                      hint: 'Google only returns a refresh token upon initial permission grant or when explicitly re-prompted.'
                    })
                  )
                  cleanup()
                  resolve({ success: false, error: 'No refresh token received' })
                }
              } catch (tokenErr: unknown) {
                const message = tokenErr instanceof Error ? tokenErr.message : String(tokenErr)
                logger.error('drive', 'Failed to exchange authorization code:', message)
                res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' })
                res.end(
                  renderOAuthCallbackHtml({
                    status: 'error',
                    title: 'Authentication failed',
                    message: `Failed to exchange authorization code: ${message}`
                  })
                )
                cleanup()
                resolve({ success: false, error: message })
              }
            } else {
              res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
              res.end(
                renderOAuthCallbackHtml({
                  status: 'error',
                  title: 'Authentication failed',
                  message:
                    'No authorization code received from Google. Please return to Focus and try again.'
                })
              )
              cleanup()
              resolve({ success: false, error: 'No code received' })
            }
          } else {
            res.writeHead(404)
            res.end()
          }
        } catch (e: unknown) {
          try {
            res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' })
            res.end(
              renderOAuthCallbackHtml({
                status: 'error',
                title: 'Authentication failed',
                message: 'An error occurred during authentication.'
              })
            )
          } catch {
            // ignore
          }
          cleanup()
          const message = e instanceof Error ? e.message : String(e)
          resolve({ success: false, error: message })
        }
      }

      let server: http.Server | null = null

      const cleanup = (): void => {
        if (isCleanedUp) return
        isCleanedUp = true
        if (timeoutTimer) {
          clearTimeout(timeoutTimer)
          timeoutTimer = null
        }
        if (this.activeServer) {
          try {
            this.activeServer.closeAllConnections?.()
            this.activeServer.close()
          } catch {
            // Server may already be closed or closing
          }
          this.activeServer = null
        }
        if (server && server.listening) {
          try {
            server.closeAllConnections?.()
            server.close()
          } catch {
            // Server may already be closed or closing
          }
          server = null
        }
      }

      // Start listening on candidate ports with graceful fallback
      ;(async () => {
        let lastError: NodeJS.ErrnoException | null = null

        for (const port of candidatePorts) {
          const candidateServer = http.createServer(requestHandler)
          try {
            boundPort = await new Promise<number>((resListen, rejListen) => {
              const onListening = (): void => {
                candidateServer.removeListener('error', onError)
                const addr = candidateServer.address()
                const actualPort = typeof addr === 'object' && addr ? addr.port : port
                resListen(actualPort)
              }
              const onError = (err: NodeJS.ErrnoException): void => {
                candidateServer.removeListener('listening', onListening)
                try {
                  candidateServer.close()
                } catch {
                  // ignore
                }
                rejListen(err)
              }
              candidateServer.once('listening', onListening)
              candidateServer.once('error', onError)
              candidateServer.listen(port)
            })
            server = candidateServer
            break
          } catch (err: unknown) {
            lastError = err as NodeJS.ErrnoException
            if (lastError.code === 'EADDRINUSE') {
              logger.warn('drive', `OAuth redirect port ${port} is in use, trying next port...`)
              continue
            }
            cleanup()
            resolve({
              success: false,
              error: lastError.message || `Failed to bind OAuth server to port ${port}`
            })
            return
          }
        }

        if (boundPort === null || !server) {
          cleanup()
          const errorMsg =
            lastError?.code === 'EADDRINUSE'
              ? `Google authorization could not bind to local port ${preferredPort} (or fallbacks ${preferredPort + 1}–${preferredPort + 4}). Another application is using these ports. Please free up port ${preferredPort} or restart Focus.`
              : `Could not find an available port for OAuth loopback server (${preferredPort}..${preferredPort + 4})`
          resolve({
            success: false,
            error: errorMsg
          })
          return
        }

        this.activeServer = server

        server.on('error', (err: Error) => {
          logger.error('drive', 'OAuth local server error:', err)
          cleanup()
          resolve({ success: false, error: err.message })
        })

        actualRedirectUri = `http://${loopbackHost}:${boundPort}${callbackPath}`
        if (boundPort !== preferredPort) {
          logger.warn(
            'drive',
            `OAuth loopback server bound to fallback port ${boundPort} (preferred ${preferredPort} was occupied). Ensure ${actualRedirectUri} is registered in Google Cloud Console Authorized redirect URIs.`
          )
        }
        logger.info(
          'drive',
          `OAuth loopback server listening on port ${boundPort}, redirectUri: ${actualRedirectUri}`
        )

        oauth2Client = new auth.OAuth2(
          GOOGLE_OAUTH.clientId,
          GOOGLE_OAUTH.clientSecret,
          actualRedirectUri
        )

        const authUrl = oauth2Client.generateAuthUrl({
          access_type: 'offline',
          scope: ['https://www.googleapis.com/auth/drive.appdata'],
          prompt: 'consent',
          state: csrfState,
          redirect_uri: actualRedirectUri,
          code_challenge: codeChallenge,
          code_challenge_method: 'S256'
        })

        shell.openExternal(authUrl).catch((err: Error) => {
          logger.error('drive', 'Failed to open external OAuth URL:', err)
          cleanup()
          resolve({ success: false, error: 'Failed to open browser: ' + err.message })
        })

        timeoutTimer = setTimeout(
          () => {
            cleanup()
            resolve({ success: false, error: 'Timeout waiting for authentication' })
          },
          3 * 60 * 1000
        )
      })()
    })
  }
}
