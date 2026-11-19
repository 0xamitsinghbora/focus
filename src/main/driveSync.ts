import { safeStorage, ipcMain, BrowserWindow } from 'electron'
import fs from 'fs'
import { auth, drive, drive_v3 } from './driveClient'
import { DriveOAuthServer } from './driveOAuthServer'
import { GOOGLE_OAUTH, isGoogleOAuthConfigured } from '../shared/config'
import { logger } from './logger'
import { SyncTarget, IpcChannels } from '../shared/types'
import { DataManager } from './dataManager'
import { ReminderScheduler } from './scheduler'
import { SyncIpcController, DriveStatusResult } from './ipc/SyncIpcController'
import { assertSenderIsMainWindow } from './ipcSecurity'
import { SyncEngine } from './sync/SyncEngine'
import { GoogleDriveProvider } from './sync/providers/GoogleDriveProvider'
import { withRetry, idSetsDiffer, mergedDiffers, computeChecksum } from './syncUtils'

export { withRetry, idSetsDiffer, mergedDiffers, computeChecksum }
export type { DriveStatusResult }

export function encryptToken(token: string): string {
  if (!token) return ''
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.encryptString(token).toString('base64')
    }
  } catch {
    // Encryption unavailable fallback
  }
  return token
}

export function decryptToken(stored: string): string {
  if (!stored) return ''
  const isBase64 = /^[A-Za-z0-9+/=]+$/.test(stored) && stored.length % 4 === 0
  if (isBase64) {
    try {
      if (!safeStorage.isEncryptionAvailable()) {
        return ''
      }
      return safeStorage.decryptString(Buffer.from(stored, 'base64'))
    } catch {
      return ''
    }
  }
  return stored
}

export class DriveSyncManager {
  private dataManager: DataManager
  private scheduler: ReminderScheduler
  public drive: drive_v3.Drive | null = null
  public authClient: InstanceType<typeof auth.OAuth2> | null = null
  public oauthServer = new DriveOAuthServer()
  private onDataUpdated?: (target?: SyncTarget) => void
  private getMainWindow?: () => BrowserWindow | null
  private syncIpcController: SyncIpcController | null = null
  public readonly provider: GoogleDriveProvider
  public readonly syncEngine: SyncEngine

  constructor(
    dataManager: DataManager,
    scheduler: ReminderScheduler,
    onDataUpdated?: (target?: SyncTarget) => void,
    getMainWindow?: () => BrowserWindow | null
  ) {
    this.dataManager = dataManager
    this.scheduler = scheduler
    this.onDataUpdated = onDataUpdated
    this.getMainWindow = getMainWindow

    this.provider = new GoogleDriveProvider({
      getDriveClient: () => this.drive,
      isConnected: () =>
        Boolean(this.drive && this.scheduler.getSettings().driveSyncEnabled !== false)
    })

    this.syncEngine = new SyncEngine({
      dataManager: this.dataManager,
      scheduler: this.scheduler,
      provider: this.provider,
      onDataUpdated: this.onDataUpdated,
      onPerformSync: (opts) => this.syncNow(opts)
    })

    this.setupIpc()
    this.initialize()
  }

  public setMainWindow(getMainWindow: () => BrowserWindow | null): void {
    this.getMainWindow = getMainWindow
  }

  public getStatus(): DriveStatusResult {
    const settings = this.scheduler.getSettings()
    return {
      isConfigured: isGoogleOAuthConfigured(),
      isConnected: Boolean(settings.driveRefreshToken),
      isSyncing: this.isSyncing,
      lastError: this.lastSyncError ?? undefined
    }
  }

  private unregisterIpc(): void {
    if (this.syncIpcController) {
      this.syncIpcController.unregisterDrive()
      this.syncIpcController = null
    } else if (typeof ipcMain?.removeHandler === 'function') {
      ipcMain.removeHandler(IpcChannels.DriveConnect)
      ipcMain.removeHandler(IpcChannels.DriveDisconnect)
      ipcMain.removeHandler(IpcChannels.DriveSyncNow)
      ipcMain.removeHandler(IpcChannels.DriveStatus)
    }
  }

  private setupIpc(): void {
    this.unregisterIpc()

    const assertSenderIsMain = (event: Electron.IpcMainInvokeEvent): void => {
      assertSenderIsMainWindow(event, () => (this.getMainWindow ? this.getMainWindow() : null))
    }

    this.syncIpcController = new SyncIpcController({
      driveSync: this,
      security: {
        assertSenderIsMainWindow: assertSenderIsMain
      }
    })
    this.syncIpcController.registerDrive()
  }

  private async initialize(): Promise<void> {
    const settings = this.scheduler.getSettings()
    if (settings.driveRefreshToken) {
      const decrypted = decryptToken(settings.driveRefreshToken)
      if (decrypted) {
        this.initDriveClient(decrypted)
        if (settings.driveSyncEnabled !== false) {
          setTimeout(() => this.syncNow(), 5000)
          this.startBackgroundPolling()
        }
      } else {
        logger.warn(
          'drive',
          'Drive refresh token could not be decrypted, skipping drive client initialization'
        )
      }
    }
  }

  public initDriveClient(refreshToken: string): void {
    if (!isGoogleOAuthConfigured()) {
      logger.warn(
        'drive',
        'Google Drive sync is not configured in this build. Skipping cloud sync initialization.'
      )
      return
    }

    this.authClient = new auth.OAuth2(
      GOOGLE_OAUTH.clientId,
      GOOGLE_OAUTH.clientSecret,
      GOOGLE_OAUTH.redirectUri
    )
    this.authClient.setCredentials({ refresh_token: refreshToken })
    this.drive = drive({ version: 'v3', auth: this.authClient })
  }

  public async connect(): Promise<{ success: boolean; error?: string }> {
    logger.info('drive', 'Starting Google Drive OAuth connection flow...')
    const result = await this.oauthServer.acquireToken()
    if (!result.success) {
      logger.warn('drive', 'OAuth connection failed:', result.error)
      return result
    }

    logger.info('drive', 'OAuth connection succeeded, storing refresh token...')
    if (typeof this.scheduler.patchSettings === 'function') {
      this.scheduler.patchSettings(
        {
          syncProvider: 'google-drive',
          driveRefreshToken: encryptToken(result.refreshToken),
          driveSyncEnabled: true
        },
        false
      )
    } else {
      const s = this.scheduler.getSettings()
      s.syncProvider = 'google-drive'
      s.driveRefreshToken = encryptToken(result.refreshToken)
      s.driveSyncEnabled = true
      this.scheduler.setSettings(s, false)
    }
    this.initDriveClient(result.refreshToken)

    // Bring Focus main window to the front once connected
    try {
      const win = this.getMainWindow ? this.getMainWindow() : null
      if (win && !win.isDestroyed()) {
        if (win.isMinimized()) win.restore()
        win.show()
        win.focus()
      }
    } catch {
      // ignore
    }

    // Trigger initial sync and ensure status refreshes when complete
    this.syncNow()
      .catch((err) => logger.warn('drive', 'Initial sync failed:', err))
      .finally(() => {
        this.onDataUpdated?.({ syncSettings: true })
      })
    this.startBackgroundPolling()
    this.onDataUpdated?.({ syncSettings: true })
    logger.info('drive', 'Google Drive connected and initial sync triggered')
    return { success: true }
  }

  public async disconnect(): Promise<void> {
    this.syncEngine.destroy()
    this.oauthServer.close()

    const settings = this.scheduler.getSettings()
    const rawToken = settings.driveRefreshToken
    if (rawToken) {
      try {
        const decrypted = decryptToken(rawToken)
        if (decrypted) {
          if (this.authClient && typeof this.authClient.revokeToken === 'function') {
            await this.authClient.revokeToken(decrypted).catch(() => {})
          } else {
            try {
              const tempClient = new auth.OAuth2(
                GOOGLE_OAUTH.clientId,
                GOOGLE_OAUTH.clientSecret,
                GOOGLE_OAUTH.redirectUri
              )
              if (typeof tempClient.revokeToken === 'function') {
                await tempClient.revokeToken(decrypted).catch(() => {})
              }
            } catch {
              // ignore
            }
          }
        }
      } catch (err) {
        logger.warn('drive', 'Failed to revoke token on disconnect:', err)
      }
    }

    if (typeof this.scheduler.patchSettings === 'function') {
      this.scheduler.patchSettings(
        {
          syncProvider: 'none',
          driveRefreshToken: undefined,
          driveSyncEnabled: false
        },
        false
      )
    } else {
      const s = this.scheduler.getSettings()
      s.syncProvider = 'none'
      s.driveRefreshToken = undefined
      s.driveSyncEnabled = false
      this.scheduler.setSettings(s, false)
    }
    this.drive = null
    this.authClient = null
    this.dirtyLogDates.clear()
    this.dirtyGoalDates.clear()
    this.dirtyInbox = false
    this.dirtyRecurring = false
    this.dirtyPurged = false
    this.dirtySettings = false
    this.lastSyncError = null
    this.onDataUpdated?.()
  }

  public async deleteAllRemoteData(): Promise<{
    success: boolean
    deletedCount: number
    error?: string
  }> {
    try {
      const settings = this.scheduler.getSettings()
      if (!this.drive && settings.driveRefreshToken) {
        const decrypted = decryptToken(settings.driveRefreshToken)
        if (decrypted) {
          this.initDriveClient(decrypted)
        }
      }

      let deletedCount = 0
      if (this.drive) {
        try {
          const files = await this.provider.listRemoteFiles()
          for (const file of files) {
            if (file.id) {
              await this.provider.deleteRemoteFile(file.name, file.id).catch((err) => {
                logger.warn(
                  'drive:sync',
                  `Failed to delete remote file ${file.name} (${file.id}):`,
                  err
                )
              })
              deletedCount++
            }
          }
        } catch (listErr) {
          logger.warn('drive:sync', 'Failed listing files during remote wipe:', listErr)
        }
      }

      await this.disconnect()
      return { success: true, deletedCount }
    } catch (err) {
      logger.error('drive:sync', 'Failed to delete remote drive data:', err)
      return {
        success: false,
        deletedCount: 0,
        error: err instanceof Error ? err.message : String(err)
      }
    }
  }

  public async uploadDatabaseBackup(): Promise<{
    success: boolean
    fileName?: string
    error?: string
  }> {
    try {
      const settings = this.scheduler.getSettings()
      if (!this.drive && settings.driveRefreshToken) {
        const decrypted = decryptToken(settings.driveRefreshToken)
        if (decrypted) {
          this.initDriveClient(decrypted)
        }
      }

      if (!this.drive) {
        return {
          success: false,
          error: 'Google Drive is not connected. Please connect Google Drive first.'
        }
      }

      const backupPath = await this.dataManager.backupDatabase()
      const buffer = await fs.promises.readFile(backupPath)
      const fileName = `focus-backup-${new Date().toISOString().slice(0, 10)}.db`

      const remoteFiles = await this.provider.listRemoteFiles()
      const existing = remoteFiles.find((f) => f.name === fileName)

      if (existing?.id) {
        await withRetry(() =>
          this.drive!.files.update({
            fileId: existing.id!,
            media: { mimeType: 'application/x-sqlite3', body: buffer }
          })
        )
      } else {
        await withRetry(() =>
          this.drive!.files.create({
            requestBody: { name: fileName, parents: ['appDataFolder'] },
            media: { mimeType: 'application/x-sqlite3', body: buffer },
            fields: 'id'
          })
        )
      }

      return { success: true, fileName }
    } catch (err) {
      logger.error('drive:sync', 'Failed to upload database backup to Google Drive:', err)
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err)
      }
    }
  }

  public async syncNow(options?: {
    incremental?: boolean
  }): Promise<{ success: boolean; error?: string }> {
    if (this.isSyncing) {
      this.hasPendingSync = true
      return { success: false, error: 'Cannot sync right now' }
    }
    if (!this.drive) {
      return { success: false, error: 'Google Drive is not connected' }
    }
    const settings = this.scheduler.getSettings()
    if (!settings.driveSyncEnabled && settings.syncProvider !== 'google-drive') {
      return { success: false, error: 'Sync is disabled' }
    }
    return this.syncEngine.syncNow(options)
  }

  public scheduleSyncAfterWrite(target?: SyncTarget): void {
    this.syncEngine.scheduleSyncAfterWrite(target)
  }

  public startBackgroundPolling(intervalMs = 60000): void {
    this.syncEngine.startBackgroundPolling(intervalMs)
  }

  public stopBackgroundPolling(): void {
    this.syncEngine.stopBackgroundPolling()
  }

  public async waitForInFlightSync(timeoutMs = 3000): Promise<void> {
    await this.syncEngine.waitForInFlightSync(timeoutMs)
  }

  public destroy(): void {
    this.unregisterIpc()
    this.syncEngine.destroy()
    this.oauthServer.close()
  }

  public async readDriveFile(fileId: string, syncId?: number): Promise<string> {
    const data = await this.provider.readRemoteFile(
      '',
      fileId,
      syncId,
      this.syncAbortController?.signal
    )
    return data ?? ''
  }

  public get isSyncing(): boolean {
    return this.syncEngine.isSyncing
  }
  public set isSyncing(val: boolean) {
    this.syncEngine.isSyncing = val
  }

  public get hasPendingSync(): boolean {
    return this.syncEngine.hasPendingSync
  }
  public set hasPendingSync(val: boolean) {
    this.syncEngine.hasPendingSync = val
  }

  public get lastSyncError(): string | null {
    return this.syncEngine.lastSyncError
  }
  public set lastSyncError(val: string | null) {
    this.syncEngine.lastSyncError = val
  }

  public get dirtyLogDates(): Set<string> {
    return this.syncEngine.dirtyLogDates
  }

  public get dirtyGoalDates(): Set<string> {
    return this.syncEngine.dirtyGoalDates
  }

  public get dirtyInbox(): boolean {
    return this.syncEngine.dirtyInbox
  }
  public set dirtyInbox(val: boolean) {
    this.syncEngine.dirtyInbox = val
  }

  public get dirtyRecurring(): boolean {
    return this.syncEngine.dirtyRecurring
  }
  public set dirtyRecurring(val: boolean) {
    this.syncEngine.dirtyRecurring = val
  }

  public get dirtySettings(): boolean {
    return this.syncEngine.dirtySettings
  }
  public set dirtySettings(val: boolean) {
    this.syncEngine.dirtySettings = val
  }

  public get dirtyPurged(): boolean {
    return this.syncEngine.dirtyPurged
  }
  public set dirtyPurged(val: boolean) {
    this.syncEngine.dirtyPurged = val
  }

  public get syncAbortController(): AbortController | null {
    return this.syncEngine.syncAbortController
  }
  public set syncAbortController(val: AbortController | null) {
    this.syncEngine.syncAbortController = val
  }
}
