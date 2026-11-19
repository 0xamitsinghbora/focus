export interface RemoteFileInfo {
  name: string
  id?: string
  modifiedTime?: string
  md5Checksum?: string
  size?: number
  isStub?: boolean
}

export interface SyncStorageProvider {
  readonly providerId: 'google-drive' | string
  readonly name: string

  isConfigured(): boolean
  isConnected(): boolean

  connect(credentialsOrPath?: string): Promise<{ success: boolean; error?: string } | boolean>
  disconnect(): Promise<unknown>

  listRemoteFiles(syncId?: number): Promise<RemoteFileInfo[]>
  readRemoteFile(
    filename: string,
    fileId?: string,
    syncId?: number,
    signal?: AbortSignal
  ): Promise<string | null>
  writeRemoteFile(
    filename: string,
    content: string,
    fileId?: string,
    syncId?: number
  ): Promise<{ fileId?: string }>
  deleteRemoteFile?(filename: string, fileId?: string, syncId?: number): Promise<void>
}
