import { ipcMain } from 'electron'
import { IpcChannels, AppSettings } from '../../shared/types'
import { logger } from '../logger'
import type { SettingsService } from '../services/SettingsService'

export interface SettingsIpcDependencies {
  settingsService: SettingsService
  security: {
    assertSenderIsMainWindow: (event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent) => void
    assertSenderIsAppWindow: (event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent) => void
  }
  isQuitting?: () => boolean
}

export class SettingsIpcController {
  private deps: SettingsIpcDependencies

  constructor(deps: SettingsIpcDependencies) {
    this.deps = deps
  }

  public register(): void {
    const { settingsService, security, isQuitting } = this.deps

    this.destroy()

    ipcMain.handle(IpcChannels.GetSettings, (event) => {
      try {
        if (!isQuitting?.()) {
          security.assertSenderIsAppWindow(event)
        }
      } catch (err) {
        if (isQuitting?.()) {
          const current = settingsService.getSettings()
          const sanitized: AppSettings = { ...current }
          delete sanitized.driveRefreshToken
          return sanitized
        }
        logger.warn('ipc:security', 'Rejected unauthorized GetSettings request')
        throw err
      }

      const settings = settingsService.getSettings()
      const sanitized: AppSettings = { ...settings }
      delete sanitized.driveRefreshToken
      return sanitized
    })

    ipcMain.handle(
      IpcChannels.SetSettings,
      (event: Electron.IpcMainInvokeEvent, settings: AppSettings) => {
        try {
          if (!isQuitting?.()) {
            security.assertSenderIsMainWindow(event)
          }
        } catch (err) {
          if (isQuitting?.()) return
          logger.warn('ipc:security', 'Rejected unauthorized SetSettings request')
          throw err
        }

        if (!settings || typeof settings !== 'object') {
          throw new Error('Invalid SetSettings payload')
        }

        const current = settingsService.getSettings()
        const safeSettings: AppSettings = { ...settings }
        if (current.driveRefreshToken !== undefined) {
          safeSettings.driveRefreshToken = current.driveRefreshToken
        } else {
          delete safeSettings.driveRefreshToken
        }

        settingsService.setSettings(safeSettings)
      }
    )

    ipcMain.handle(
      IpcChannels.PatchSettings,
      (event: Electron.IpcMainInvokeEvent, partial: Partial<AppSettings>) => {
        try {
          if (!isQuitting?.()) {
            security.assertSenderIsMainWindow(event)
          }
        } catch (err) {
          if (isQuitting?.()) {
            const current = settingsService.getSettings()
            const sanitized: AppSettings = { ...current }
            delete sanitized.driveRefreshToken
            return sanitized
          }
          logger.warn('ipc:security', 'Rejected unauthorized PatchSettings request')
          throw err
        }

        if (!partial || typeof partial !== 'object') {
          throw new Error('Invalid PatchSettings payload')
        }

        const safePartial: Partial<AppSettings> = { ...partial }
        delete safePartial.driveRefreshToken
        const updated = settingsService.patchSettings(safePartial)
        const sanitized: AppSettings = { ...updated }
        delete sanitized.driveRefreshToken
        return sanitized
      }
    )
  }

  public destroy(): void {
    if (this.deps.isQuitting?.()) {
      return
    }

    const channels = [IpcChannels.GetSettings, IpcChannels.SetSettings, IpcChannels.PatchSettings]

    for (const channel of channels) {
      try {
        ipcMain.removeHandler(channel)
      } catch (err) {
        logger.warn('settings:ipc', `Failed to remove handler for ${channel}:`, err)
      }
    }
  }
}
