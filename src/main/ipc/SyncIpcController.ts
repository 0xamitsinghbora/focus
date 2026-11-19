import { ipcMain } from 'electron'
import { IpcChannels } from '../../shared/types'
import { logger } from '../logger'

export interface DriveStatusResult {
  isConfigured: boolean
  isConnected: boolean
  isSyncing: boolean
  lastError?: string
}

export interface SyncIpcDependencies {
  driveSync?: {
    connect: () => Promise<unknown>
    disconnect: () => Promise<unknown>
    syncNow: () => Promise<unknown>
    getStatus: () => DriveStatusResult
  }
  security: {
    assertSenderIsMainWindow: (event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent) => void
  }
}

export class SyncIpcController {
  private deps: SyncIpcDependencies

  constructor(deps: SyncIpcDependencies) {
    this.deps = deps
  }

  public register(): void {
    this.registerDrive()
  }

  public unregister(): void {
    this.unregisterDrive()
  }

  public registerDrive(): void {
    this.unregisterDrive()
    const { driveSync, security } = this.deps

    ipcMain.handle(IpcChannels.DriveConnect, async (event) => {
      security.assertSenderIsMainWindow(event)
      return driveSync
        ? await driveSync.connect()
        : { success: false, error: 'Drive sync unavailable' }
    })

    ipcMain.handle(IpcChannels.DriveDisconnect, async (event) => {
      security.assertSenderIsMainWindow(event)
      return driveSync ? await driveSync.disconnect() : false
    })

    ipcMain.handle(IpcChannels.DriveSyncNow, async (event) => {
      security.assertSenderIsMainWindow(event)
      return driveSync ? await driveSync.syncNow() : false
    })

    ipcMain.handle(IpcChannels.DriveStatus, (event): DriveStatusResult => {
      security.assertSenderIsMainWindow(event)
      return driveSync
        ? driveSync.getStatus()
        : {
            isConfigured: false,
            isConnected: false,
            isSyncing: false
          }
    })
  }

  public unregisterDrive(): void {
    const channels = [
      IpcChannels.DriveConnect,
      IpcChannels.DriveDisconnect,
      IpcChannels.DriveSyncNow,
      IpcChannels.DriveStatus
    ]

    for (const channel of channels) {
      try {
        ipcMain.removeHandler(channel)
      } catch (err) {
        logger.warn('sync:ipc', `Failed to remove drive handler for ${channel}:`, err)
      }
    }
  }
}
