import { BrowserWindow } from 'electron'
import { DataManager } from '../dataManager'
import { ReminderScheduler } from '../scheduler'
import { SyncTarget } from '../../shared/types'
import { DriveSyncManager } from '../driveSync'
import { SyncEngine } from './SyncEngine'
import { logger } from '../logger'

/**
 * Unified SyncManager orchestrating Google Drive cloud storage provider.
 * Manages write-trigger debounce, active provider routing, and lifecycle teardown.
 */
export class SyncManager {
  private dataManager: DataManager
  private scheduler: ReminderScheduler
  private onDataUpdated?: (target?: SyncTarget) => void
  private getMainWindow?: () => BrowserWindow | null

  public readonly driveSync: DriveSyncManager

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

    const getWin = this.getMainWindow ?? (() => null)

    this.driveSync = new DriveSyncManager(
      this.dataManager,
      this.scheduler,
      this.onDataUpdated,
      getWin
    )
  }

  public setMainWindow(getMainWindow: () => BrowserWindow | null): void {
    this.getMainWindow = getMainWindow
    this.driveSync.setMainWindow(getMainWindow)
  }

  public getDriveSync(): DriveSyncManager {
    return this.driveSync
  }

  public get driveEngine(): SyncEngine {
    return this.driveSync.syncEngine
  }

  public get activeEngine(): SyncEngine | null {
    const settings = this.scheduler.getSettings()
    const provider =
      settings.syncProvider ||
      (settings.driveRefreshToken && settings.driveSyncEnabled ? 'google-drive' : 'none')

    if (provider === 'google-drive') return this.driveSync.syncEngine
    return null
  }

  /**
   * Routes dirty target sets to active cloud sync providers.
   */
  public scheduleSyncAfterWrite(target?: SyncTarget): void {
    const settings = this.scheduler.getSettings()
    const provider =
      settings.syncProvider ||
      (settings.driveRefreshToken && settings.driveSyncEnabled ? 'google-drive' : 'none')

    if (provider === 'google-drive' || (settings.driveRefreshToken && settings.driveSyncEnabled)) {
      try {
        this.driveSync.scheduleSyncAfterWrite(target)
      } catch (err) {
        logger.error('sync:manager', 'Failed scheduling Google Drive sync after write:', err)
      }
    }
  }

  /**
   * Forces an immediate sync on the active or specified cloud provider.
   */
  public async syncNow(providerChoice?: 'google-drive'): Promise<unknown> {
    const settings = this.scheduler.getSettings()
    const provider = providerChoice || settings.syncProvider

    if (provider === 'google-drive') {
      return await this.driveSync.syncNow()
    }

    // If not explicitly designated, run whichever is enabled
    if (settings.driveRefreshToken && settings.driveSyncEnabled) {
      return await this.driveSync.syncNow()
    }

    return { success: true, message: 'No sync provider active' }
  }

  public async waitForInFlightSync(timeoutMs = 3000): Promise<void> {
    try {
      await this.driveSync.waitForInFlightSync(timeoutMs)
    } catch {
      // ignore
    }
  }

  public destroy(): void {
    try {
      this.driveSync.destroy()
    } catch (err) {
      logger.warn('sync:manager', 'Error destroying DriveSyncManager:', err)
    }
  }
}
