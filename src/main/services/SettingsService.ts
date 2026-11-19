import { app, BrowserWindow } from 'electron'
import { IpcChannels, AppSettings } from '../../shared/types'
import { SettingsRepository } from '../repositories/SettingsRepository'
import { logger } from '../logger'
import { SettingsIpcController } from '../ipc/SettingsIpcController'

export interface SettingsIpcOptions {
  assertSenderIsMain?: (event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent) => void
  assertSenderIsApp?: (event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent) => void
}

export class SettingsService {
  private settingsRepo: SettingsRepository
  private onSettingsChanged?: (settings: AppSettings) => void
  private onSettingsUpdated?: (newSettings: AppSettings, oldSettings: AppSettings) => void
  private cleanupIpc: (() => void) | null = null

  constructor(settingsRepo: SettingsRepository) {
    this.settingsRepo = settingsRepo
    const current = this.settingsRepo.getSettings()
    this.setAutoLaunch(current.openAtLogin)
  }

  public setAutoLaunch(enabled: boolean): void {
    try {
      if (!app.isPackaged) return
      app.setLoginItemSettings({
        openAtLogin: enabled,
        args: ['--hidden']
      })
    } catch (err) {
      logger.warn('scheduler', 'Failed to configure login item settings:', err)
    }
  }

  public getSettings(): AppSettings {
    return this.settingsRepo.getSettings()
  }

  public setSettings(settings: AppSettings, updateTimestamp = true): void {
    const currentSettings = this.settingsRepo.getSettings()
    const themeChanged = Boolean(settings.theme && settings.theme !== currentSettings.theme)

    if (updateTimestamp) {
      settings.lastUpdated = Date.now()
    }
    this.settingsRepo.setSettings(settings)

    if (themeChanged && settings.theme) {
      const windows = BrowserWindow.getAllWindows()
      for (const win of windows) {
        if (!win.isDestroyed() && win.webContents) {
          win.webContents.send(IpcChannels.ThemeUpdated, settings.theme)
        }
      }
    }

    if (typeof settings.openAtLogin === 'boolean') {
      this.setAutoLaunch(settings.openAtLogin)
    }

    if (updateTimestamp && this.onSettingsChanged) {
      this.onSettingsChanged(settings)
    }

    if (this.onSettingsUpdated) {
      this.onSettingsUpdated(settings, currentSettings)
    }
  }

  public patchSettings(partial: Partial<AppSettings>, updateTimestamp = true): AppSettings {
    const current = this.settingsRepo.getSettings()
    const merged: AppSettings = {
      ...current,
      ...partial,
      whiteNoisePreference: partial.whiteNoisePreference
        ? { ...current.whiteNoisePreference, ...partial.whiteNoisePreference }
        : current.whiteNoisePreference,
      groupColors: partial.groupColors
        ? { ...current.groupColors, ...partial.groupColors }
        : current.groupColors,
      collapsedColumns: partial.collapsedColumns
        ? { ...current.collapsedColumns, ...partial.collapsedColumns }
        : current.collapsedColumns,
      customShortcuts: partial.customShortcuts
        ? { ...current.customShortcuts, ...partial.customShortcuts }
        : current.customShortcuts
    }
    this.setSettings(merged, updateTimestamp)
    return this.getSettings()
  }

  public setOnSettingsChanged(fn: (settings: AppSettings) => void): void {
    this.onSettingsChanged = fn
  }

  public setOnSettingsUpdated(
    fn: (newSettings: AppSettings, oldSettings: AppSettings) => void
  ): void {
    this.onSettingsUpdated = fn
  }

  public registerIpc(options?: SettingsIpcOptions): () => void {
    if (this.cleanupIpc) {
      this.cleanupIpc()
    }

    const controller = new SettingsIpcController({
      settingsService: this,
      security: {
        assertSenderIsMainWindow: options?.assertSenderIsMain ?? (() => {}),
        assertSenderIsAppWindow: options?.assertSenderIsApp ?? (() => {})
      }
    })
    controller.register()

    this.cleanupIpc = () => {
      controller.destroy()
    }

    return this.cleanupIpc
  }

  public destroy(): void {
    if (this.cleanupIpc) {
      this.cleanupIpc()
      this.cleanupIpc = null
    }
  }
}
