import { ipcMain } from 'electron'
import { IpcChannels, InstallUpdateOptions } from '../../shared/types'
import { logger } from '../logger'
import type { UpdateService } from '../services/UpdateService'

export interface UpdateIpcDependencies {
  updateService: UpdateService
  security: {
    assertSenderIsMainWindow: (event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent) => void
    assertSenderIsAppWindow: (event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent) => void
  }
  isQuitting?: () => boolean
}

export class UpdateIpcController {
  private deps: UpdateIpcDependencies

  constructor(deps: UpdateIpcDependencies) {
    this.deps = deps
  }

  public register(): void {
    const { updateService, security, isQuitting } = this.deps

    this.destroy()

    ipcMain.handle(IpcChannels.UpdateGetState, (event) => {
      try {
        if (!isQuitting?.()) {
          security.assertSenderIsAppWindow(event)
        }
      } catch (err) {
        logger.warn('ipc:security', 'Rejected unauthorized UpdateGetState request')
        throw err
      }
      return updateService.getState()
    })

    ipcMain.handle(IpcChannels.UpdateCheck, async (event) => {
      try {
        if (!isQuitting?.()) {
          security.assertSenderIsMainWindow(event)
        }
      } catch (err) {
        logger.warn('ipc:security', 'Rejected unauthorized UpdateCheck request')
        throw err
      }
      return await updateService.checkForUpdates()
    })

    ipcMain.handle(IpcChannels.UpdateDownload, async (event) => {
      try {
        if (!isQuitting?.()) {
          security.assertSenderIsMainWindow(event)
        }
      } catch (err) {
        logger.warn('ipc:security', 'Rejected unauthorized UpdateDownload request')
        throw err
      }
      return await updateService.downloadUpdate()
    })

    ipcMain.handle(IpcChannels.UpdateCancelDownload, async (event) => {
      try {
        if (!isQuitting?.()) {
          security.assertSenderIsMainWindow(event)
        }
      } catch (err) {
        logger.warn('ipc:security', 'Rejected unauthorized UpdateCancelDownload request')
        throw err
      }
      return await updateService.cancelDownload()
    })

    ipcMain.handle(IpcChannels.UpdateInstall, async (event, options?: InstallUpdateOptions) => {
      try {
        if (!isQuitting?.()) {
          security.assertSenderIsMainWindow(event)
        }
      } catch (err) {
        logger.warn('ipc:security', 'Rejected unauthorized UpdateInstall request')
        throw err
      }
      return await updateService.installUpdate(options)
    })

    ipcMain.handle(IpcChannels.UpdateCleanCache, async (event) => {
      try {
        if (!isQuitting?.()) {
          security.assertSenderIsMainWindow(event)
        }
      } catch (err) {
        logger.warn('ipc:security', 'Rejected unauthorized UpdateCleanCache request')
        throw err
      }
      return updateService.cleanCache()
    })
  }

  public destroy(): void {
    const channels = [
      IpcChannels.UpdateGetState,
      IpcChannels.UpdateCheck,
      IpcChannels.UpdateDownload,
      IpcChannels.UpdateCancelDownload,
      IpcChannels.UpdateInstall,
      IpcChannels.UpdateCleanCache
    ]

    for (const channel of channels) {
      try {
        ipcMain.removeHandler(channel)
      } catch (err) {
        logger.warn('ipc:updater', `Failed to remove handler for ${channel}:`, err)
      }
    }
  }
}
