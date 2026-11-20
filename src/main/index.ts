import 'dotenv/config'
import path from 'path'
import { app, shell, BrowserWindow, globalShortcut, powerMonitor } from 'electron'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { DataManager } from './dataManager'
import { ReminderScheduler } from './scheduler'
import { TrayGenerator } from './tray'
import { TaskbarManager } from './taskbarManager'
import { SyncManager } from './sync'
import { SyncTarget } from './syncUtils'
import { WindowManager } from './windows/WindowManager'
import {
  assertSenderIsMainWindow as assertSenderIsMainWindowHelper,
  assertSenderIsMainWindowOrPrompt as assertSenderIsMainWindowOrPromptHelper,
  assertSenderIsAppWindow as assertSenderIsAppWindowHelper
} from './ipcSecurity'
import { logger } from './logger'
import iconIco from '../../build/icon.ico?asset'
import { IpcChannels, localDateStr } from '../shared/types'
import {
  LogsIpcController,
  GoalsIpcController,
  SystemIpcController,
  SessionIpcController,
  SettingsIpcController,
  LearningIpcController,
  EvaluationIpcController,
  UpdateIpcController
} from './ipc'
import { UpdateService } from './services/UpdateService'
import { GlobalShortcutManager } from './services/GlobalShortcutManager'
import { DriveOAuthServer } from './driveOAuthServer'

// Initialize application logger early to capture all boot errors, process exceptions, and console logs
logger.init()

// Disable Chromium native window occlusion so transparent widgets never vanish or flicker on app switch
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')

const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.whenReady().then(() => {
    if (process.platform === 'win32') {
      const appId = 'com.focus.app'
      app.setAppUserModelId(appId)

      // In development mode on Windows, Windows Taskbar resolves the process icon
      // by looking up a matching shortcut (.lnk) in the Start Menu for the AppUserModelId.
      // If none exists, Windows falls back to electron.exe's default atom icon and ignores window icons.
      if (!app.isPackaged) {
        try {
          const shortcutPath = path.join(
            app.getPath('appData'),
            'Microsoft',
            'Windows',
            'Start Menu',
            'Programs',
            'Focus.lnk'
          )
          const iconPath = path.join(app.getAppPath(), 'build', 'icon.ico')
          shell.writeShortcutLink(shortcutPath, 'replace', {
            target: process.execPath,
            args: '.',
            cwd: app.getAppPath(),
            appUserModelId: appId,
            icon: iconPath,
            iconIndex: 0,
            description: 'Focus'
          })
        } catch (err) {
          logger.warn('main', 'Failed to create development shortcut:', err)
        }
      }
    } else {
      electronApp.setAppUserModelId('com.focus.app')
    }

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    app.on('web-contents-created', (_, contents) => {
      contents.on('will-navigate', (event, navigationUrl) => {
        const isDevUrl =
          is.dev &&
          process.env['ELECTRON_RENDERER_URL'] &&
          navigationUrl.startsWith(process.env['ELECTRON_RENDERER_URL'])
        if (!isDevUrl) {
          event.preventDefault()
          try {
            const parsed = new URL(navigationUrl)
            if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
              shell.openExternal(navigationUrl).catch((err) => {
                logger.warn(
                  'main:security',
                  `Failed to open external URL from will-navigate: ${navigationUrl}`,
                  err
                )
              })
            }
          } catch {
            // ignore
          }
        }
      })

      contents.on('will-redirect', (event, navigationUrl) => {
        const isDevUrl =
          is.dev &&
          process.env['ELECTRON_RENDERER_URL'] &&
          navigationUrl.startsWith(process.env['ELECTRON_RENDERER_URL'])
        if (!isDevUrl) {
          event.preventDefault()
        }
      })
    })

    let dataManager: DataManager
    try {
      dataManager = new DataManager()
      logger.info('main', 'Data Manager initialized')
    } catch (error) {
      logger.error('main', 'Failed to initialize Data Manager:', error)
      app.quit()
      return
    }

    let isQuitting = false

    const windowManager = new WindowManager({
      getShowWidget: () => dataManager.settingsRepo.getSettings().showWidget !== false,
      getInProgressGoals: async () => {
        try {
          const cutoff = dataManager.settingsRepo.getSettings().dayCutoffHour || 0
          const today = localDateStr(new Date(), cutoff)
          const goals = await dataManager.goalsRepo.getGoals(today)
          return goals
            .filter((g) => g.status === 'in_progress' && !g.deletedAt)
            .map((g) => ({ id: g.id, title: g.title }))
        } catch {
          return []
        }
      },
      onWidgetVisibilityChange: (visible) => {
        if (isQuitting) return
        try {
          const s = dataManager.settingsRepo.getSettings()
          if (s.showWidget !== visible) {
            scheduler.patchSettings({ showWidget: visible })
          }
        } catch (err) {
          logger.warn('main', 'Failed to update widget visibility setting:', err)
        }
      }
    })

    const scheduler = new ReminderScheduler(dataManager.settingsRepo, () =>
      windowManager.getMainWindow()
    )
    const mainWindow = windowManager.createMainWindow()

    const assertSenderIsMainWindow = (
      event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent
    ): void => {
      assertSenderIsMainWindowHelper(event, () => windowManager.getMainWindow())
    }

    const assertSenderIsMainWindowOrPrompt = (
      event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent
    ): void => {
      assertSenderIsMainWindowOrPromptHelper(
        event,
        () => windowManager.getMainWindow(),
        () => windowManager.getPromptWindow()
      )
    }

    const assertSenderIsAppWindow = (
      event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent
    ): void => {
      assertSenderIsAppWindowHelper(
        event,
        () => windowManager.getMainWindow(),
        () => windowManager.getPromptWindow(),
        () => windowManager.getWidgetWindow()
      )
    }

    const security = {
      assertSenderIsMainWindow,
      assertSenderIsMainWindowOrPrompt,
      assertSenderIsAppWindow
    }

    windowManager.initAuxiliaryWindows()

    dataManager.goalsRepo.recurring
      .generateTodayGoals(dataManager.settingsRepo.getTodayDate())
      .catch((error) => {
        logger.error('main', 'Failed to generate recurring goals for today:', error)
      })

    let syncManager: SyncManager | null = null
    let taskbarManager: TaskbarManager | null = null

    const notifyDataUpdated = (target?: SyncTarget): void => {
      const sendUpdate = (payload?: SyncTarget): void => {
        windowManager.broadcast(IpcChannels.DataUpdated, payload)
      }

      if (isQuitting || !dataManager.isOpen()) {
        sendUpdate(target)
        return
      }

      if (
        target &&
        target.todayMinutes === undefined &&
        (target.logDates?.length || target.goalDates?.length)
      ) {
        try {
          const today = localDateStr(new Date(), scheduler.getSettings().dayCutoffHour || 0)
          if (target.logDates?.includes(today) || target.goalDates?.includes(today)) {
            dataManager.analyticsService
              .getDayReview(today)
              .then((review) => {
                sendUpdate({
                  ...target,
                  todayMinutes: review.totalProductiveMinutes
                })
              })
              .catch(() => {
                sendUpdate(target)
              })
            return
          }
        } catch {
          // fallback to standard broadcast
        }
      }

      sendUpdate(target)
    }

    const syncAfterWrite = (target?: SyncTarget): void => {
      notifyDataUpdated(target)
      if (target) {
        dataManager.markDirty(target)
      }
      syncManager?.scheduleSyncAfterWrite(target)
    }

    // Register Domain IPC Controllers
    const logsController = new LogsIpcController({
      logsRepo: dataManager.logsRepo,
      analyticsService: dataManager.analyticsService,
      settingsRepo: dataManager.settingsRepo,
      goalsRepo: dataManager.goalsRepo,
      scheduler,
      syncAfterWrite,
      security,
      isQuitting: () => isQuitting
    })
    logsController.register()

    const goalsController = new GoalsIpcController({
      goalsRepo: dataManager.goalsRepo,
      settingsRepo: dataManager.settingsRepo,
      analyticsService: dataManager.analyticsService,
      syncAfterWrite,
      getDirtyGoalDates: () => dataManager.getDirtySyncTargets().goalDates,
      security,
      isQuitting: () => isQuitting
    })
    goalsController.register()

    syncManager = new SyncManager(dataManager, scheduler, notifyDataUpdated, () => mainWindow)

    const trayGenerator = new TrayGenerator(
      () => windowManager.getMainWindow(),
      () => {
        scheduler.notifyPromptTriggered()
        windowManager.showPrompt({ focus: true })
      }
    )
    taskbarManager = new TaskbarManager(
      () => windowManager.getMainWindow(),
      trayGenerator,
      scheduler
    )

    const sessionController = new SessionIpcController({
      settingsRepo: dataManager.settingsRepo,
      scheduler,
      getTaskbarManager: () => taskbarManager,
      broadcastToWidget: (p) => windowManager.broadcastToWidget(p),
      getPromptWindow: () => windowManager.getPromptWindow(),
      getMainWindow: () => windowManager.getMainWindow(),
      isPromptVisible: () => windowManager.isPromptVisible(),
      security
    })
    sessionController.register()

    try {
      if (typeof powerMonitor?.on === 'function') {
        powerMonitor.on('suspend', () => {
          sessionController.sessionService.handleSuspend()
        })
        powerMonitor.on('resume', () => {
          sessionController.sessionService.handleResume()
        })
      }
    } catch {
      // ignore
    }

    scheduler.setOnSettingsChanged((newSettings) => {
      syncAfterWrite({ syncSettings: true })
      if (
        newSettings &&
        typeof newSettings.reminderIntervalMinutes === 'number' &&
        newSettings.reminderIntervalMinutes > 0
      ) {
        const sessionState = sessionController.sessionService.getState()
        if (sessionState.isActive && !sessionState.isBreak) {
          sessionController.sessionService.updateDuration(newSettings.reminderIntervalMinutes * 60)
          sessionController.dispatchSessionUpdate(sessionController.sessionService.getState())
        }
      }
    })

    scheduler.setOnResetSession(() => {
      if (sessionController.sessionService.getState().isActive) {
        sessionController.sessionService.stop()
        sessionController.dispatchSessionUpdate(sessionController.sessionService.getState())
      }
    })

    const systemController = new SystemIpcController({
      dataManager,
      scheduler,
      getMainWindow: () => windowManager.getMainWindow(),
      getTaskbarManager: () => taskbarManager,
      getSyncManager: () => syncManager,
      getPromptWindow: () => windowManager.getPromptWindow(),
      getWidgetWindow: () => windowManager.getWidgetWindow(),
      syncAfterWrite,
      onPrepareForExit: () => {
        isQuitting = true
      },
      security
    })
    systemController.register()

    const settingsController = new SettingsIpcController({
      settingsService: scheduler.getSettingsService(),
      security,
      isQuitting: () => isQuitting
    })
    settingsController.register()

    const learningController = new LearningIpcController({
      learningService: dataManager.learningService,
      security
    })
    learningController.register()

    const evaluationController = new EvaluationIpcController({
      evaluatorService: dataManager.evaluatorService,
      security
    })
    evaluationController.register()

    const updateService = new UpdateService({
      settingsRepo: dataManager.settingsRepo,
      broadcast: (ch, payload) => windowManager.broadcast(ch, payload),
      prepareForExit: async () => {
        isQuitting = true
        try {
          scheduler.stopTimer()
          taskbarManager?.destroy()
          syncManager?.destroy()
          windowManager.destroyAllWindows()
          dataManager.close()
        } catch {
          // ignore
        }
      },
      quitApp: () => {
        isQuitting = true
        app.exit(0)
      }
    })
    updateService.handlePostUpdateCleanup()
    updateService.startAutoCheckTimer()

    const updateController = new UpdateIpcController({
      updateService,
      security,
      isQuitting: () => isQuitting
    })
    updateController.register()

    if (process.platform === 'win32') {
      const taskbarIconPath = app.isPackaged ? process.execPath : path.resolve(iconIco)
      app.setUserTasks([
        {
          program: process.execPath,
          arguments: '--settings',
          iconPath: taskbarIconPath,
          iconIndex: 0,
          title: 'Settings',
          description: 'Open Focus Settings'
        },
        {
          program: process.execPath,
          arguments: '--log-now',
          iconPath: taskbarIconPath,
          iconIndex: 0,
          title: 'Log Now',
          description: 'Log focus activity now'
        }
      ])
    }

    const globalShortcutManager = new GlobalShortcutManager({
      onLog: () => {
        scheduler.notifyPromptTriggered()
        windowManager.showPrompt({ focus: true })
      },
      onBringToFront: () => {
        let win = windowManager.getMainWindow()
        if (!win) {
          win = windowManager.createMainWindow()
          attachWindowCloseHandler(win)
        } else {
          windowManager.focusOrRestoreMainWindow()
        }
      },
      onAddTask: () => {
        let win = windowManager.getMainWindow()
        if (!win) {
          win = windowManager.createMainWindow()
          attachWindowCloseHandler(win)
        } else {
          windowManager.focusOrRestoreMainWindow()
        }
        if (win && !win.isDestroyed() && win.webContents) {
          win.webContents.send(IpcChannels.NavigateTab, 'goals')
        }
      },
      onToggleSession: () => {
        const win = windowManager.getMainWindow()
        if (win && !win.isDestroyed() && win.webContents) {
          win.webContents.send(IpcChannels.SessionTogglePause)
        }
      }
    })

    const initialSettings = scheduler.getSettingsService().getSettings()
    globalShortcutManager.registerAll(initialSettings.customShortcuts)

    scheduler.getSettingsService().setOnSettingsUpdated((newSettings, oldSettings) => {
      if (
        JSON.stringify(newSettings.customShortcuts) !== JSON.stringify(oldSettings?.customShortcuts)
      ) {
        globalShortcutManager.registerAll(newSettings.customShortcuts)
      }
    })

    app.on('open-url', (event, url) => {
      if (DriveOAuthServer.handleCustomProtocolUrl(url)) {
        event.preventDefault()
      }
    })

    app.on('second-instance', (_, commandLine) => {
      const customUrl = commandLine.find(
        (arg) => arg.startsWith('focus://') || arg.startsWith('focusapp://')
      )
      if (customUrl && DriveOAuthServer.handleCustomProtocolUrl(customUrl)) {
        return
      }

      let win = windowManager.getMainWindow()
      if (!win) {
        win = windowManager.createMainWindow()
        attachWindowCloseHandler(win)
        taskbarManager?.rebindWindow(win)
        windowManager.rebindAuxiliaryWindows(win)
        syncManager?.setMainWindow(() => win)
      } else {
        windowManager.focusOrRestoreMainWindow()
        windowManager.rebindAuxiliaryWindows(win)
      }

      const activeMain = windowManager.getMainWindow()
      if (commandLine.includes('--settings')) {
        const sendSettings = (): void => {
          if (activeMain && !activeMain.isDestroyed() && activeMain.webContents) {
            activeMain.webContents.send(IpcChannels.NavigateTab, 'settings')
          }
        }
        if (activeMain && activeMain.webContents.isLoading()) {
          activeMain.webContents.once('did-finish-load', sendSettings)
        } else {
          sendSettings()
        }
      } else if (commandLine.includes('--log-now')) {
        scheduler.notifyPromptTriggered()
        windowManager.showPrompt({ focus: true })
      }
    })

    const initialMain = windowManager.getMainWindow()
    if (process.argv.includes('--settings') && initialMain) {
      const sendSettings = (): void => {
        if (initialMain && !initialMain.isDestroyed() && initialMain.webContents) {
          initialMain.webContents.send(IpcChannels.NavigateTab, 'settings')
        }
      }
      if (initialMain.webContents.isLoading()) {
        initialMain.webContents.once('did-finish-load', sendSettings)
      } else {
        sendSettings()
      }
    }

    if (process.argv.includes('--log-now')) {
      scheduler.notifyPromptTriggered()
      windowManager.showPrompt({ focus: true })
    }

    let isAppReadyToQuit = false
    app.on('before-quit', async (event) => {
      if (isAppReadyToQuit) return
      event.preventDefault()
      isQuitting = true
      try {
        globalShortcutManager.unregisterAll()
        globalShortcut.unregisterAll()
      } catch {
        // ignore
      }

      // 1. If cloud sync is actively in flight, allow in-flight database/cloud commits to complete cleanly
      if (syncManager) {
        try {
          await syncManager.waitForInFlightSync(3000)
        } catch (err) {
          logger.warn('main', 'Error awaiting in-flight sync on quit:', err)
        }
      }

      // 2. Save persistent state while database and controllers are still active
      try {
        windowManager.saveWindowState()
        const latestSessionState = sessionController.getLatestSessionState()
        if (latestSessionState?.isActive) {
          dataManager.settingsRepo.setActiveSession(latestSessionState, true)
        }
      } catch (err) {
        logger.error('main', 'Error saving session state on quit:', err)
      }

      // 3. Stop timers & background intervals
      try {
        scheduler.stopTimer()
        taskbarManager?.destroy()
        syncManager?.destroy()
        updateService.destroy()
      } catch (err) {
        logger.error('main', 'Error stopping background services on quit:', err)
      }

      // 4. Destroy IPC controllers so incoming/pending IPC calls do not query closed DB
      try {
        logsController.destroy()
        goalsController.destroy()
        sessionController.destroy()
        systemController.destroy()
        settingsController.destroy()
        updateController.destroy()
      } catch (err) {
        logger.error('main', 'Error destroying IPC controllers on quit:', err)
      }

      // 5. Destroy all windows so renderer execution, timers, and pending IPC invokes stop immediately
      try {
        windowManager.destroyAllWindows()
      } catch (err) {
        logger.error('main', 'Error destroying windows on quit:', err)
      }

      // 6. Safely close database connection
      try {
        dataManager.close()
      } catch (err) {
        logger.error('main', 'Error closing database on exit:', err)
      }
      logger.flushSync()

      isAppReadyToQuit = true
      app.quit()
    })

    const attachWindowCloseHandler = (win: BrowserWindow): void => {
      win.on('close', (event) => {
        if (!isQuitting) {
          event.preventDefault()
          win.hide()
          return false
        }
        return true
      })
    }
    attachWindowCloseHandler(mainWindow)

    app.on('activate', function () {
      let win = windowManager.getMainWindow()
      if (BrowserWindow.getAllWindows().length === 0 || !win) {
        win = windowManager.createMainWindow()
        attachWindowCloseHandler(win)
        taskbarManager?.rebindWindow(win)
        windowManager.rebindAuxiliaryWindows(win)
        syncManager?.setMainWindow(() => win)
      } else {
        windowManager.focusOrRestoreMainWindow()
        windowManager.rebindAuxiliaryWindows(win)
      }
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
