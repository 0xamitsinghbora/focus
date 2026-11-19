import type { drive_v3 } from '../../driveClient'
import { withRetry } from '../../syncUtils'
import { isGoogleOAuthConfigured } from '../../../shared/config'
import type { SyncStorageProvider, RemoteFileInfo } from '../SyncStorageProvider'

export interface GoogleDriveProviderOptions {
  getDriveClient: () => drive_v3.Drive | null
  isConnected: () => boolean
}

export class GoogleDriveProvider implements SyncStorageProvider {
  public readonly providerId = 'google-drive'
  public readonly name = 'Google Drive'
  private getDrive: () => drive_v3.Drive | null
  private checkConnected: () => boolean

  constructor(options: GoogleDriveProviderOptions) {
    this.getDrive = options.getDriveClient
    this.checkConnected = options.isConnected
  }

  public isConfigured(): boolean {
    return isGoogleOAuthConfigured()
  }

  public isConnected(): boolean {
    return Boolean(this.checkConnected() && this.getDrive())
  }

  public async connect(): Promise<{ success: boolean; error?: string }> {
    return { success: this.isConnected() }
  }

  public async disconnect(): Promise<void> {
    // No-op for the provider itself
  }

  public async listRemoteFiles(): Promise<RemoteFileInfo[]> {
    const drive = this.getDrive()
    if (!drive) return []

    const allFiles: drive_v3.Schema$File[] = []
    let pageToken: string | undefined

    do {
      const res = await withRetry(() =>
        drive.files.list({
          q: `'appDataFolder' in parents and trashed=false`,
          spaces: 'appDataFolder',
          fields: 'nextPageToken, files(id, name, modifiedTime, md5Checksum, size)',
          pageSize: 1000,
          pageToken
        })
      )
      if (res.data.files) allFiles.push(...res.data.files)
      pageToken = res.data.nextPageToken ?? undefined
    } while (pageToken)

    const filesByName = new Map<string, drive_v3.Schema$File[]>()
    const unnamedFiles: drive_v3.Schema$File[] = []

    for (const f of allFiles) {
      if (f.name) {
        const list = filesByName.get(f.name) || []
        list.push(f)
        filesByName.set(f.name, list)
      } else {
        unnamedFiles.push(f)
      }
    }

    const deduplicated: RemoteFileInfo[] = unnamedFiles.map((f) => {
      const rawSize = (f as { size?: string | number }).size
      return {
        name: f.name || '',
        id: f.id || undefined,
        modifiedTime: f.modifiedTime || undefined,
        md5Checksum: f.md5Checksum || undefined,
        size:
          typeof rawSize === 'string'
            ? Number(rawSize)
            : typeof rawSize === 'number'
              ? rawSize
              : undefined
      }
    })

    for (const [name, files] of filesByName.entries()) {
      if (files.length === 1) {
        const f = files[0]
        const rawSize = (f as { size?: string | number }).size
        deduplicated.push({
          name: f.name || name,
          id: f.id || undefined,
          modifiedTime: f.modifiedTime || undefined,
          md5Checksum: f.md5Checksum || undefined,
          size:
            typeof rawSize === 'string'
              ? Number(rawSize)
              : typeof rawSize === 'number'
                ? rawSize
                : undefined
        })
      } else {
        files.sort((a, b) => {
          const tA = a.modifiedTime ? new Date(a.modifiedTime).getTime() : 0
          const tB = b.modifiedTime ? new Date(b.modifiedTime).getTime() : 0
          return tB - tA
        })
        const newest = files[0]
        const duplicates = files.slice(1)
        for (const dup of duplicates) {
          if (dup.id) {
            drive.files.delete({ fileId: dup.id }).catch(() => {})
          }
        }
        const rawSize = (newest as { size?: string | number }).size
        deduplicated.push({
          name: newest.name || name,
          id: newest.id || undefined,
          modifiedTime: newest.modifiedTime || undefined,
          md5Checksum: newest.md5Checksum || undefined,
          size:
            typeof rawSize === 'string'
              ? Number(rawSize)
              : typeof rawSize === 'number'
                ? rawSize
                : undefined
        })
      }
    }

    return deduplicated
  }

  public async readRemoteFile(
    _filename: string,
    fileId?: string,
    _syncId?: number,
    signal?: AbortSignal
  ): Promise<string | null> {
    const drive = this.getDrive()
    if (!drive || !fileId) return null

    const res = await withRetry(() =>
      drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' })
    )

    if (typeof res.data === 'string') {
      return res.data
    }

    if (res.data && typeof (res.data as NodeJS.ReadableStream).on === 'function') {
      return new Promise<string>((resolve, reject) => {
        let data = ''
        const stream = res.data as NodeJS.ReadableStream & { destroy?: () => void }
        const onAbort = (): void => {
          if (typeof stream?.destroy === 'function') {
            stream.destroy()
          }
          const err = new Error('Sync aborted: Drive client disconnected')
          err.name = 'SyncAbortedError'
          reject(err)
        }
        if (signal?.aborted) {
          onAbort()
          return
        }
        signal?.addEventListener('abort', onAbort, { once: true })
        stream.on('data', (chunk: string) => {
          data += chunk
        })
        stream.on('end', () => {
          signal?.removeEventListener('abort', onAbort)
          resolve(data)
        })
        stream.on('error', (err: unknown) => {
          signal?.removeEventListener('abort', onAbort)
          reject(err)
        })
      })
    }

    return JSON.stringify(res.data)
  }

  public async writeRemoteFile(
    filename: string,
    content: string,
    fileId?: string
  ): Promise<{ fileId?: string }> {
    const drive = this.getDrive()
    if (!drive) throw new Error('Google Drive client is not initialized')

    if (fileId) {
      const res = await withRetry(() =>
        drive.files.update({
          fileId,
          media: { mimeType: 'application/json', body: content }
        })
      )
      return { fileId: res?.data?.id || fileId }
    } else {
      const res = await withRetry(() =>
        drive.files.create({
          requestBody: { name: filename, parents: ['appDataFolder'] },
          media: { mimeType: 'application/json', body: content },
          fields: 'id'
        })
      )
      return { fileId: res?.data?.id || undefined }
    }
  }

  public async deleteRemoteFile(_filename: string, fileId?: string): Promise<void> {
    const drive = this.getDrive()
    if (!drive || !fileId) return
    await withRetry(() => drive.files.delete({ fileId }))
  }
}
