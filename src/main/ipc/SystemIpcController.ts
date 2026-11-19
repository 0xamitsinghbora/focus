import fs from 'fs'
import { ipcMain, BrowserWindow, shell, dialog, clipboard, app } from 'electron'
import { IpcChannels, ClientLogPayload, GetAppLogsPayload } from '../../shared/types'
import { SUPPORT_EMAIL } from '../../shared/config'
import { logger } from '../logger'
import { performUninstall } from '../uninstaller'
import type { DataManager } from '../dataManager'
import type { ReminderScheduler } from '../scheduler'
import type { TaskbarManager } from '../taskbarManager'
import type { DriveSyncManager } from '../driveSync'
import type { SyncTarget } from '../syncUtils'

export interface SystemIpcDependencies {
  dataManager: DataManager
  scheduler: ReminderScheduler
  getMainWindow: () => BrowserWindow | null
  getTaskbarManager: () => TaskbarManager | null
  getDriveSyncManager?: () => DriveSyncManager | null
  getSyncManager?: () => { destroy: () => void } | null
  getPromptWindow: () => BrowserWindow | null
  getWidgetWindow: () => BrowserWindow | null
  syncAfterWrite: (target?: SyncTarget) => void
  onPrepareForExit: () => void
  security: {
    assertSenderIsMainWindow: (event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent) => void
    assertSenderIsAppWindow: (event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent) => void
  }
}

export class SystemIpcController {
  private deps: SystemIpcDependencies

  constructor(deps: SystemIpcDependencies) {
    this.deps = deps
  }

  public register(): void {
    const {
      dataManager,
      scheduler,
      getMainWindow,
      getTaskbarManager,
      getDriveSyncManager,
      getPromptWindow,
      getWidgetWindow,
      syncAfterWrite,
      onPrepareForExit,
      security
    } = this.deps

    ipcMain.handle(IpcChannels.OpenDataFolder, async (event) => {
      security.assertSenderIsMainWindow(event)
      const dataPath = dataManager.getDataPath()
      shell.showItemInFolder(dataPath)
      return true
    })

    ipcMain.handle(IpcChannels.ExportData, async (event) => {
      security.assertSenderIsMainWindow(event)
      try {
        const mainWindow = getMainWindow()
        const targetWindow = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined
        const defaultFileName = `focus-export-${new Date().toISOString().slice(0, 10)}.json`
        const result = targetWindow
          ? await dialog.showSaveDialog(targetWindow, {
              title: 'Export Focus Data',
              defaultPath: defaultFileName,
              filters: [{ name: 'JSON Files', extensions: ['json'] }]
            })
          : await dialog.showSaveDialog({
              title: 'Export Focus Data',
              defaultPath: defaultFileName,
              filters: [{ name: 'JSON Files', extensions: ['json'] }]
            })

        if (result.canceled || !result.filePath) {
          return { success: false, canceled: true }
        }

        const data = await dataManager.exportAllData()
        await fs.promises.writeFile(result.filePath, JSON.stringify(data, null, 2), 'utf-8')
        return { success: true, filePath: result.filePath }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        return { success: false, error: message }
      }
    })

    ipcMain.handle(IpcChannels.ImportData, async (event) => {
      security.assertSenderIsMainWindow(event)
      try {
        const mainWindow = getMainWindow()
        const targetWindow = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined
        const result = targetWindow
          ? await dialog.showOpenDialog(targetWindow, {
              title: 'Import Focus Data',
              properties: ['openFile'],
              filters: [{ name: 'JSON Files', extensions: ['json'] }]
            })
          : await dialog.showOpenDialog({
              title: 'Import Focus Data',
              properties: ['openFile'],
              filters: [{ name: 'JSON Files', extensions: ['json'] }]
            })

        if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
          return { success: false, canceled: true }
        }

        const selectedFile = result.filePaths[0]
        const raw = await fs.promises.readFile(selectedFile, 'utf-8')
        const parsed = JSON.parse(raw)
        const stats = await dataManager.importAllData(parsed)
        syncAfterWrite()
        return { success: true, filePath: selectedFile, stats }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        return { success: false, error: message }
      }
    })

    ipcMain.handle(IpcChannels.BackupDatabase, async (event) => {
      security.assertSenderIsMainWindow(event)
      return await dataManager.backupDatabase()
    })

    ipcMain.handle(IpcChannels.DownloadDatabase, async (event) => {
      security.assertSenderIsMainWindow(event)
      try {
        const mainWindow = getMainWindow()
        const targetWindow = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined
        const defaultFileName = `focus-backup-${new Date().toISOString().slice(0, 10)}.db`
        const result = targetWindow
          ? await dialog.showSaveDialog(targetWindow, {
              title: 'Download SQLite Database',
              defaultPath: defaultFileName,
              filters: [
                { name: 'SQLite Database', extensions: ['db', 'sqlite'] },
                { name: 'All Files', extensions: ['*'] }
              ]
            })
          : await dialog.showSaveDialog({
              title: 'Download SQLite Database',
              defaultPath: defaultFileName,
              filters: [
                { name: 'SQLite Database', extensions: ['db', 'sqlite'] },
                { name: 'All Files', extensions: ['*'] }
              ]
            })

        if (result.canceled || !result.filePath) {
          return { success: false, canceled: true }
        }

        await dataManager.backupDatabaseToFile(result.filePath)
        return { success: true, filePath: result.filePath }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        return { success: false, error: message }
      }
    })

    ipcMain.handle(IpcChannels.UploadDatabaseToDrive, async (event) => {
      security.assertSenderIsMainWindow(event)
      try {
        const syncManager = this.deps.getSyncManager ? this.deps.getSyncManager() : null
        const driveSync =
          (
            syncManager as {
              driveSync?: DriveSyncManager
              getDriveSync?: () => DriveSyncManager
            } | null
          )?.driveSync ||
          (syncManager as { getDriveSync?: () => DriveSyncManager } | null)?.getDriveSync?.() ||
          this.deps.getDriveSyncManager?.() ||
          null

        if (!driveSync) {
          return { success: false, error: 'Google Drive sync is unavailable' }
        }

        return await driveSync.uploadDatabaseBackup()
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        return { success: false, error: message }
      }
    })

    // --- Diagnostics & Application Logging IPC ---
    ipcMain.on(IpcChannels.LogMessage, (event, payload: ClientLogPayload) => {
      security.assertSenderIsAppWindow(event)
      logger.logClientMessage(payload)
    })

    ipcMain.handle(IpcChannels.GetAppLogs, async (event, payload?: GetAppLogsPayload) => {
      security.assertSenderIsMainWindow(event)
      return logger.getRecentLogs(payload?.limit)
    })

    ipcMain.handle(IpcChannels.OpenLogsFolder, async (event) => {
      security.assertSenderIsMainWindow(event)
      logger.openLogsFolder()
      return true
    })

    ipcMain.handle(IpcChannels.ClearAppLogs, async (event) => {
      security.assertSenderIsMainWindow(event)
      logger.clearLogs()
      return true
    })

    ipcMain.handle(IpcChannels.GetSystemDiagnostics, async (event) => {
      security.assertSenderIsMainWindow(event)
      return logger.getDiagnostics()
    })

    ipcMain.handle(IpcChannels.OpenGitHubIssue, async (event, customDescription?: string) => {
      security.assertSenderIsMainWindow(event)
      const report = logger.generateEmailReport(customDescription)
      clipboard.writeText(report)

      let subject = 'Focus Bug Report'
      if (customDescription) {
        const firstLine = customDescription
          .trim()
          .split('\n')[0]
          .replace(/[*#`_]/g, '')
          .trim()
        if (firstLine.length > 0) {
          subject = `Focus Bug Report: ${firstLine.slice(0, 60)}`
        }
      }

      const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(SUPPORT_EMAIL)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(report)}`
      shell.openExternal(gmailUrl).catch((err) => {
        logger.warn('main', 'Failed to open Gmail URL:', err)
      })

      // Open File Explorer with focus.log highlighted for easy drag & drop attachment
      logger.openLogsFolder()

      return { success: true, report }
    })

    ipcMain.handle(IpcChannels.DeleteAllData, async (event) => {
      try {
        security.assertSenderIsMainWindow(event)
      } catch (err) {
        logger.warn('system:ipc', 'Unauthorized delete all data request:', err)
        return { success: false, error: 'Unauthorized delete all data request' }
      }

      try {
        const syncManager = this.deps.getSyncManager ? this.deps.getSyncManager() : null
        const driveSync =
          (
            syncManager as {
              driveSync?: DriveSyncManager
              getDriveSync?: () => DriveSyncManager
            } | null
          )?.driveSync ||
          (syncManager as { getDriveSync?: () => DriveSyncManager } | null)?.getDriveSync?.() ||
          this.deps.getDriveSyncManager?.() ||
          null

        if (driveSync) {
          try {
            await driveSync.deleteAllRemoteData()
          } catch (driveErr) {
            logger.warn('system:ipc', 'Error deleting remote Google Drive data:', driveErr)
          }
        }

        await dataManager.deleteAllData()
        logger.clearLogs()
        scheduler.resetBlockAndTimer()

        syncAfterWrite({
          logDates: [],
          goalDates: [],
          syncInbox: true,
          syncRecurring: true,
          syncSettings: true,
          syncPurged: true
        })

        return {
          success: true,
          message: 'All local and Google Drive data deleted successfully.'
        }
      } catch (err) {
        logger.error('system:ipc', 'Failed to delete all data:', err)
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to delete all data'
        }
      }
    })

    ipcMain.handle(
      IpcChannels.UninstallApp,
      async (event, options?: { keepUserData?: boolean }) => {
        try {
          security.assertSenderIsMainWindow(event)
        } catch (err) {
          logger.warn('system:ipc', 'Unauthorized uninstallation request:', err)
          return { success: false, error: 'Unauthorized uninstallation request' }
        }
        return await performUninstall({
          keepUserData: Boolean(options?.keepUserData),
          dataManager,
          prepareForExit: () => {
            onPrepareForExit()
            scheduler.destroy()
            getTaskbarManager()?.destroy()
            if (this.deps.getSyncManager) {
              this.deps.getSyncManager()?.destroy()
            } else {
              getDriveSyncManager?.()?.destroy()
            }
            try {
              getPromptWindow()?.destroy()
              getWidgetWindow()?.destroy()
            } catch (err) {
              logger.warn('system:ipc', 'Error destroying auxiliary windows during uninstall:', err)
            }
          },
          quitApp: () => {
            BrowserWindow.getAllWindows().forEach((win) => {
              if (!win.isDestroyed()) {
                win.destroy()
              }
            })
            if (typeof app?.exit === 'function') {
              app.exit(0)
            } else if (typeof app?.quit === 'function') {
              app.quit()
            }
          }
        })
      }
    )
  }

  public destroy(): void {
    try {
      ipcMain.removeAllListeners(IpcChannels.LogMessage)
    } catch (err) {
      logger.warn('system:ipc', 'Failed to remove LogMessage listener:', err)
    }

    const channels = [
      IpcChannels.OpenDataFolder,
      IpcChannels.ExportData,
      IpcChannels.ImportData,
      IpcChannels.BackupDatabase,
      IpcChannels.GetAppLogs,
      IpcChannels.OpenLogsFolder,
      IpcChannels.ClearAppLogs,
      IpcChannels.GetSystemDiagnostics,
      IpcChannels.OpenGitHubIssue,
      IpcChannels.UninstallApp,
      IpcChannels.DeleteAllData
    ]

    for (const channel of channels) {
      try {
        ipcMain.removeHandler(channel)
      } catch (err) {
        logger.warn('system:ipc', `Failed to remove handler for ${channel}:`, err)
      }
    }
  }
}
