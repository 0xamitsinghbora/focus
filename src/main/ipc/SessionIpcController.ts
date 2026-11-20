import { ipcMain, BrowserWindow, powerMonitor } from 'electron'
import { IpcChannels, SessionTimerPayload } from '../../shared/types'
import { isValidSessionTimerPayload } from '../ipcSecurity'
import { logger } from '../logger'
import { SessionService } from '../services/SessionService'
import type { SettingsRepository } from '../repositories/SettingsRepository'
import type { ReminderScheduler } from '../scheduler'
import type { TaskbarManager } from '../taskbarManager'

export interface SessionIpcDependencies {
  settingsRepo: SettingsRepository
  scheduler: ReminderScheduler
  sessionService?: SessionService
  getTaskbarManager: () => TaskbarManager | null
  broadcastToWidget: (payload: SessionTimerPayload) => void
  getPromptWindow: () => BrowserWindow | null
  getMainWindow?: () => BrowserWindow | null
  isPromptVisible: () => boolean
  security: {
    assertSenderIsMainWindow: (event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent) => void
    assertSenderIsAppWindow: (event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent) => void
  }
}

export class SessionIpcController {
  private deps: SessionIpcDependencies
  public readonly sessionService: SessionService
  private powerLockHandler: (() => void) | null = null

  constructor(deps: SessionIpcDependencies) {
    this.deps = deps
    this.sessionService =
      deps.sessionService ??
      new SessionService({
        settingsRepo: deps.settingsRepo,
        onTick: (payload) => this.dispatchSessionUpdate(payload)
      })
  }

  public getLatestSessionState(): SessionTimerPayload {
    return this.sessionService.getState()
  }

  public dispatchSessionUpdate(payload: SessionTimerPayload): void {
    const {
      scheduler,
      getTaskbarManager,
      broadcastToWidget,
      getPromptWindow,
      getMainWindow,
      isPromptVisible
    } = this.deps

    try {
      scheduler.updateFocusSession(payload)
      const taskbarManager = getTaskbarManager()
      if (taskbarManager) {
        taskbarManager.updateSession(payload)
      }
      broadcastToWidget(payload)

      const mainWin = getMainWindow?.()
      if (mainWin && !mainWin.isDestroyed() && mainWin.webContents) {
        const isDestroyed =
          typeof mainWin.webContents.isDestroyed === 'function'
            ? mainWin.webContents.isDestroyed()
            : false
        if (!isDestroyed) {
          if (
            typeof mainWin.webContents.isLoading === 'function' &&
            mainWin.webContents.isLoading()
          ) {
            mainWin.webContents.once('did-finish-load', () => {
              if (
                !mainWin.isDestroyed() &&
                mainWin.webContents &&
                !(
                  typeof mainWin.webContents.isDestroyed === 'function' &&
                  mainWin.webContents.isDestroyed()
                )
              ) {
                try {
                  mainWin.webContents.send(IpcChannels.UpdateSessionTimer, payload)
                } catch {
                  // ignore
                }
              }
            })
          } else {
            mainWin.webContents.send(IpcChannels.UpdateSessionTimer, payload)
          }
        }
      }

      if (isPromptVisible()) {
        const promptWin = getPromptWindow()
        if (promptWin && !promptWin.isDestroyed() && promptWin.webContents) {
          const isDestroyed =
            typeof promptWin.webContents.isDestroyed === 'function'
              ? promptWin.webContents.isDestroyed()
              : false
          if (!isDestroyed) {
            if (
              typeof promptWin.webContents.isLoading === 'function' &&
              promptWin.webContents.isLoading()
            ) {
              promptWin.webContents.once('did-finish-load', () => {
                if (
                  !promptWin.isDestroyed() &&
                  promptWin.webContents &&
                  !(
                    typeof promptWin.webContents.isDestroyed === 'function' &&
                    promptWin.webContents.isDestroyed()
                  )
                ) {
                  try {
                    promptWin.webContents.send(IpcChannels.UpdateSessionTimer, payload)
                  } catch {
                    // ignore
                  }
                }
              })
            } else {
              promptWin.webContents.send(IpcChannels.UpdateSessionTimer, payload)
            }
          }
        }
      }
    } catch (err) {
      logger.error('session:ipc', 'Error dispatching session update:', err)
    }
  }

  public register(): void {
    const { security } = this.deps

    ipcMain.handle(IpcChannels.GetSessionState, (event) => {
      security.assertSenderIsAppWindow(event)
      return this.sessionService.getState()
    })

    ipcMain.on(IpcChannels.UpdateSessionTimer, (event, payload: SessionTimerPayload) => {
      security.assertSenderIsMainWindow(event)
      if (!isValidSessionTimerPayload(payload)) {
        logger.warn('ipc:security', 'Rejected invalid UpdateSessionTimer payload')
        return
      }
      this.sessionService.updateTimer(payload)
      this.dispatchSessionUpdate(this.sessionService.getState())
    })

    ipcMain.on(IpcChannels.SessionQuickAction, (event, action) => {
      security.assertSenderIsAppWindow(event)
      const mainWin = this.deps.getMainWindow?.()
      if (mainWin && !mainWin.isDestroyed() && mainWin.webContents) {
        if (action === 'dot-reset') {
          try {
            if (mainWin.isMinimized()) mainWin.restore()
            mainWin.show()
            mainWin.focus()
          } catch {
            // ignore window focus errors
          }
        }
        mainWin.webContents.send(IpcChannels.SessionQuickAction, action)
      }
    })

    ipcMain.on(IpcChannels.SessionZeroReached, (event, autoPause?: boolean) => {
      security.assertSenderIsAppWindow(event)
      this.sessionService.handleZeroReached(autoPause ?? true)
      this.dispatchSessionUpdate(this.sessionService.getState())
    })

    if (typeof powerMonitor?.on === 'function') {
      this.powerLockHandler = () => {
        logger.info('session:power', 'Screen locked (Win+L / Mac lock), pausing focus timer')
        const state = this.sessionService.getState()
        if (state.isActive && !state.isPaused) {
          const mainWin = this.deps.getMainWindow?.()
          if (mainWin && !mainWin.isDestroyed() && mainWin.webContents) {
            mainWin.webContents.send(IpcChannels.SessionQuickAction, 'pause')
          }
        }
      }

      try {
        powerMonitor.on('lock-screen', this.powerLockHandler)
      } catch {
        // ignore
      }
    }
  }

  public destroy(): void {
    if (this.powerLockHandler && typeof powerMonitor?.removeListener === 'function') {
      try {
        powerMonitor.removeListener('lock-screen', this.powerLockHandler)
      } catch {
        // ignore
      }
      this.powerLockHandler = null
    }

    try {
      this.sessionService.destroy()
    } catch (err) {
      logger.error('session:ipc', 'Error destroying sessionService:', err)
    }

    try {
      ipcMain.removeHandler(IpcChannels.GetSessionState)
    } catch (err) {
      logger.error('session:ipc', 'Error removing GetSessionState handler:', err)
    }

    try {
      ipcMain.removeAllListeners(IpcChannels.UpdateSessionTimer)
      ipcMain.removeAllListeners(IpcChannels.SessionQuickAction)
      ipcMain.removeAllListeners(IpcChannels.SessionZeroReached)
    } catch (err) {
      logger.error('session:ipc', 'Error removing UpdateSessionTimer listeners:', err)
    }
  }
}
