import { Readable } from 'stream'

interface DriveFile {
  id?: string | null
  name?: string | null
  modifiedTime?: string | null
  parents?: string[] | null
  mimeType?: string | null
  md5Checksum?: string | null
}

interface DriveFileListResult {
  data: {
    files: DriveFile[]
    nextPageToken?: string | null
  }
}

interface DriveFileResult {
  data: DriveFile
}

interface DriveStreamResult {
  data: Readable
}

export class GoogleOAuth2Client {
  public clientId: string
  public clientSecret: string
  public redirectUri: string
  private refreshToken?: string
  private accessToken?: string
  private tokenExpiresAt = 0

  constructor(clientId?: string, clientSecret?: string, redirectUri?: string) {
    this.clientId = clientId || ''
    this.clientSecret = clientSecret || ''
    this.redirectUri = redirectUri || ''
  }

  public setCredentials(credentials: {
    refresh_token?: string
    access_token?: string
    expiry_date?: number
  }): void {
    if (credentials.refresh_token) this.refreshToken = credentials.refresh_token
    if (credentials.access_token) this.accessToken = credentials.access_token
    if (credentials.expiry_date) this.tokenExpiresAt = credentials.expiry_date
  }

  public generateAuthUrl(opts: {
    access_type?: string
    scope?: string | string[]
    prompt?: string
    state?: string
    redirect_uri?: string
    code_challenge?: string
    code_challenge_method?: string
  }): string {
    const params = new URLSearchParams()
    params.set('client_id', this.clientId)
    params.set('redirect_uri', opts.redirect_uri || this.redirectUri)
    params.set('response_type', 'code')
    if (opts.scope) {
      params.set('scope', Array.isArray(opts.scope) ? opts.scope.join(' ') : opts.scope)
    }
    if (opts.access_type) params.set('access_type', opts.access_type)
    if (opts.prompt) params.set('prompt', opts.prompt)
    if (opts.state) params.set('state', opts.state)
    if (opts.code_challenge) params.set('code_challenge', opts.code_challenge)
    if (opts.code_challenge_method) params.set('code_challenge_method', opts.code_challenge_method)
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  }

  public async getToken(opts: {
    code: string
    codeVerifier?: string
    redirect_uri?: string
  }): Promise<{
    tokens: { refresh_token?: string; access_token?: string; expiry_date?: number }
    res: unknown
  }> {
    const body = new URLSearchParams()
    body.set('client_id', this.clientId)
    if (this.clientSecret) {
      body.set('client_secret', this.clientSecret)
    }
    body.set('code', opts.code)
    body.set('grant_type', 'authorization_code')
    body.set('redirect_uri', opts.redirect_uri || this.redirectUri)
    if (opts.codeVerifier) {
      body.set('code_verifier', opts.codeVerifier)
    }

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    })

    if (!res.ok) {
      const errText = await res.text()
      const err = new Error(`Failed to exchange auth code: ${res.status} ${errText}`) as Error & {
        status?: number
      }
      err.status = res.status
      throw err
    }

    const data = (await res.json()) as {
      access_token?: string
      refresh_token?: string
      expires_in?: number
    }

    const tokens = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expiry_date: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined
    }

    this.setCredentials(tokens)
    return { tokens, res: null }
  }

  public async getValidAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60000) {
      return this.accessToken
    }

    if (!this.refreshToken) {
      throw new Error('No refresh token available to refresh access token')
    }

    const body = new URLSearchParams()
    body.set('client_id', this.clientId)
    if (this.clientSecret) {
      body.set('client_secret', this.clientSecret)
    }
    body.set('refresh_token', this.refreshToken)
    body.set('grant_type', 'refresh_token')

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    })

    if (!res.ok) {
      const errText = await res.text()
      const err = new Error(`Failed to refresh access token: ${res.status} ${errText}`) as Error & {
        status?: number
      }
      err.status = res.status
      throw err
    }

    const data = (await res.json()) as { access_token: string; expires_in: number }
    this.accessToken = data.access_token
    this.tokenExpiresAt = Date.now() + data.expires_in * 1000
    return this.accessToken
  }

  public async revokeToken(token?: string): Promise<void> {
    const targetToken = token || this.refreshToken || this.accessToken
    if (!targetToken) return
    const body = new URLSearchParams()
    body.set('token', targetToken)
    await fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    }).catch(() => {})
  }
}

export class GoogleDriveClient {
  private authClient: GoogleOAuth2Client

  constructor(authClient: GoogleOAuth2Client) {
    this.authClient = authClient
  }

  public files = {
    list: async (params: {
      spaces?: string
      fields?: string
      pageSize?: number
      q?: string
      pageToken?: string
    }): Promise<DriveFileListResult> => {
      const token = await this.authClient.getValidAccessToken()
      const url = new URL('https://www.googleapis.com/drive/v3/files')
      if (params.spaces) url.searchParams.set('spaces', params.spaces)
      if (params.fields) url.searchParams.set('fields', params.fields)
      if (params.pageSize) url.searchParams.set('pageSize', String(params.pageSize))
      if (params.q) url.searchParams.set('q', params.q)
      if (params.pageToken) url.searchParams.set('pageToken', params.pageToken)

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` }
      })

      if (!res.ok) {
        const errText = await res.text()
        const err = new Error(`Drive list error: ${res.status} ${errText}`) as Error & {
          status?: number
        }
        err.status = res.status
        throw err
      }

      const data = (await res.json()) as { files?: DriveFile[]; nextPageToken?: string }
      return { data: { files: data.files || [], nextPageToken: data.nextPageToken || null } }
    },

    get: async (
      params: { fileId: string; alt?: string },
      opts?: { responseType?: 'stream' }
    ): Promise<DriveStreamResult> => {
      void opts
      const token = await this.authClient.getValidAccessToken()
      const url = new URL(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(params.fileId)}`
      )
      if (params.alt) url.searchParams.set('alt', params.alt)

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` }
      })

      if (!res.ok) {
        const errText = await res.text()
        const err = new Error(`Drive get error: ${res.status} ${errText}`) as Error & {
          status?: number
        }
        err.status = res.status
        throw err
      }

      const text = await res.text()
      const stream = Readable.from([text])
      return { data: stream }
    },

    create: async (params: {
      requestBody?: { name?: string; parents?: string[] }
      media?: { mimeType?: string; body?: string | unknown }
      fields?: string
    }): Promise<DriveFileResult> => {
      const token = await this.authClient.getValidAccessToken()
      const metadata = params.requestBody || {}

      const isBuf = Buffer.isBuffer(params.media?.body)
      const mime =
        params.media?.mimeType || (isBuf ? 'application/octet-stream' : 'application/json')
      const bodyBuffer: Buffer = isBuf
        ? (params.media?.body as Buffer)
        : Buffer.from(
            typeof params.media?.body === 'string'
              ? params.media.body
              : JSON.stringify(params.media?.body ?? {}),
            'utf-8'
          )

      const boundary = '-------314159265358979323846'
      const prePart = Buffer.from(
        `\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`,
        'utf-8'
      )
      const postPart = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8')
      const multipartRequestBody = Buffer.concat([prePart, bodyBuffer, postPart])

      const url = new URL('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart')
      if (params.fields) url.searchParams.set('fields', params.fields)

      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body: multipartRequestBody as unknown as BodyInit
      })

      if (!res.ok) {
        const errText = await res.text()
        const err = new Error(`Drive create error: ${res.status} ${errText}`) as Error & {
          status?: number
        }
        err.status = res.status
        throw err
      }

      const data = (await res.json()) as DriveFile
      return { data }
    },

    update: async (params: {
      fileId: string
      media?: { mimeType?: string; body?: string | unknown }
      fields?: string
    }): Promise<DriveFileResult> => {
      const token = await this.authClient.getValidAccessToken()
      const isBuf = Buffer.isBuffer(params.media?.body)
      const mime =
        params.media?.mimeType || (isBuf ? 'application/octet-stream' : 'application/json')
      const bodyContent: BodyInit = (
        isBuf
          ? new Uint8Array(params.media?.body as Buffer)
          : typeof params.media?.body === 'string'
            ? params.media.body
            : JSON.stringify(params.media?.body ?? {})
      ) as BodyInit

      const url = new URL(
        `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(params.fileId)}?uploadType=media`
      )
      if (params.fields) url.searchParams.set('fields', params.fields)

      const res = await fetch(url.toString(), {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': mime
        },
        body: bodyContent
      })

      if (!res.ok) {
        const errText = await res.text()
        const err = new Error(`Drive update error: ${res.status} ${errText}`) as Error & {
          status?: number
        }
        err.status = res.status
        throw err
      }

      const data = (await res.json()) as DriveFile
      return { data }
    },

    delete: async (params: { fileId: string }): Promise<{ data: Record<string, never> }> => {
      const token = await this.authClient.getValidAccessToken()
      const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(params.fileId)}`
      const res = await fetch(url, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })

      if (!res.ok && res.status !== 404) {
        const errText = await res.text()
        const err = new Error(`Drive delete error: ${res.status} ${errText}`) as Error & {
          status?: number
        }
        err.status = res.status
        throw err
      }

      return { data: {} }
    }
  }
}

export const auth = {
  OAuth2: GoogleOAuth2Client
}

export function drive(options: { version: 'v3'; auth: GoogleOAuth2Client }): GoogleDriveClient {
  return new GoogleDriveClient(options.auth)
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace drive_v3 {
  export type Drive = GoogleDriveClient
  export type Schema$File = DriveFile
}
