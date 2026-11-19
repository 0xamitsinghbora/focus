import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import os from 'os'
import path from 'path'
import fs from 'fs'
import { BrowserWindow } from 'electron'
import { setMockSenderWindow } from '../__mocks__/electron'
import { DataManager } from '../main/dataManager'
import { ReminderScheduler } from '../main/scheduler'
import { SyncManager } from '../main/sync'
import {
  LogsIpcController,
  GoalsIpcController,
  SessionIpcController,
  ReminderIpcController,
  SystemIpcController
} from '../main/ipc'
import {
  assertSenderIsMainWindow,
  assertSenderIsMainWindowOrPrompt,
  assertSenderIsAppWindow
} from '../main/ipcSecurity'
import { WindowManager } from '../main/windows/WindowManager'
import { hidePromptWindow } from '../main/windows/prompt'
import { IpcChannels, SyncTarget, HeatmapBreakdown } from '../shared/types'
import { api } from '../preload'

vi.mock('../../build/icon.png?asset', () => ({
  default: 'mock-icon.png'
}))

describe('End-to-End Multi-Window Integration & User Journey Flow', () => {
  let testDir: string
  let dm: DataManager
  let scheduler: ReminderScheduler
  let syncManager: SyncManager
  let windowManager: WindowManager

  let logsController: LogsIpcController
  let goalsController: GoalsIpcController
  let sessionController: SessionIpcController
  let reminderController: ReminderIpcController
  let systemController: SystemIpcController

  let untrustedWindow: BrowserWindow

  const today = '2026-04-10'

  const setupAppStack = (dataManager: DataManager): void => {
    windowManager = new WindowManager({
      getShowWidget: () => dataManager.settingsRepo.getSettings().showWidget !== false,
      onWidgetVisibilityChange: (visible) => {
        try {
          const s = dataManager.settingsRepo.getSettings()
          if (s.showWidget !== visible) {
            scheduler.patchSettings({ showWidget: visible })
          }
        } catch {
          // ignore
        }
      }
    })

    // Real Window Instances managed by WindowManager
    windowManager.createMainWindow()
    windowManager.initAuxiliaryWindows()
    windowManager.showPrompt()

    scheduler = new ReminderScheduler(dataManager.settingsRepo, () => windowManager.getMainWindow())

    const security = {
      assertSenderIsMainWindow: (event: any) =>
        assertSenderIsMainWindow(event, () => windowManager.getMainWindow()),
      assertSenderIsMainWindowOrPrompt: (event: any) =>
        assertSenderIsMainWindowOrPrompt(
          event,
          () => windowManager.getMainWindow(),
          () => windowManager.getPromptWindow()
        ),
      assertSenderIsAppWindow: (event: any) =>
        assertSenderIsAppWindow(
          event,
          () => windowManager.getMainWindow(),
          () => windowManager.getPromptWindow(),
          () => windowManager.getWidgetWindow()
        )
    }

    const notifyDataUpdated = (target?: SyncTarget): void => {
      windowManager.broadcast(IpcChannels.DataUpdated, target)
    }

    const syncAfterWrite = (target?: SyncTarget): void => {
      notifyDataUpdated(target)
      if (target) {
        dataManager.markDirty(target)
      }
      syncManager?.scheduleSyncAfterWrite(target)
    }

    syncManager = new SyncManager(dataManager, scheduler, notifyDataUpdated, () =>
      windowManager.getMainWindow()
    )

    logsController = new LogsIpcController({
      logsRepo: dataManager.logsRepo,
      analyticsService: dataManager.analyticsService,
      settingsRepo: dataManager.settingsRepo,
      goalsRepo: dataManager.goalsRepo,
      scheduler,
      syncAfterWrite,
      security
    })
    logsController.register()

    goalsController = new GoalsIpcController({
      goalsRepo: dataManager.goalsRepo,
      settingsRepo: dataManager.settingsRepo,
      analyticsService: dataManager.analyticsService,
      syncAfterWrite,
      getDirtyGoalDates: () => dataManager.getDirtySyncTargets().goalDates,
      security
    })
    goalsController.register()

    sessionController = new SessionIpcController({
      settingsRepo: dataManager.settingsRepo,
      scheduler,
      getTaskbarManager: () => null,
      broadcastToWidget: (payload) => windowManager.broadcastToWidget(payload),
      getPromptWindow: () => windowManager.getPromptWindow(),
      getMainWindow: () => windowManager.getMainWindow(),
      isPromptVisible: () => windowManager.isPromptVisible(),
      security
    })
    sessionController.register()

    reminderController = new ReminderIpcController({
      scheduler,
      security,
      hidePromptWindow: () => hidePromptWindow()
    })
    reminderController.register()

    systemController = new SystemIpcController({
      dataManager,
      scheduler,
      getMainWindow: () => windowManager.getMainWindow(),
      getTaskbarManager: () => null,
      getPromptWindow: () => windowManager.getPromptWindow(),
      getWidgetWindow: () => windowManager.getWidgetWindow(),
      syncAfterWrite,
      onPrepareForExit: () => {},
      security
    })
    systemController.register()
  }

  const tearDownAppStack = (): void => {
    windowManager?.destroyAllWindows()
    logsController?.destroy()
    goalsController?.destroy()
    sessionController?.destroy()
    reminderController?.unregister()
    systemController?.destroy()
    scheduler?.destroy()
    syncManager?.destroy()
  }

  beforeEach(() => {
    testDir = path.join(
      os.tmpdir(),
      `focus-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`
    )
    fs.mkdirSync(testDir, { recursive: true })
    vi.stubEnv('FOCUS_TEST_USER_DATA', testDir)

    dm = new DataManager()
    setupAppStack(dm)

    // Untrusted window created outside WindowManager to simulate unauthorized webview / rogue sender
    untrustedWindow = new BrowserWindow()
  })

  afterEach(() => {
    tearDownAppStack()
    if (dm) dm.getDb().close()
    try {
      fs.rmSync(testDir, { recursive: true, force: true })
    } catch {
      // ignore
    }
    vi.restoreAllMocks()
  })

  it('completes multi-window end-to-end journey via real Preload API: settings -> goals -> session -> widget -> prompt -> day review -> restart persistence', async () => {
    const mainWindow = windowManager.getMainWindow()!
    const widgetWindow = windowManager.getWidgetWindow()!
    const promptWindow = windowManager.getPromptWindow()!

    expect(mainWindow).toBeDefined()
    expect(widgetWindow).toBeDefined()
    expect(promptWindow).toBeDefined()

    // -------------------------------------------------------------
    // PHASE 1: User configures settings from Main Window
    // -------------------------------------------------------------
    setMockSenderWindow(mainWindow)

    await api.settings.patch({
      reminderIntervalMinutes: 30,
      theme: 'dark'
    })

    const initialSettings = await api.settings.get()
    expect(initialSettings.reminderIntervalMinutes).toBe(30)
    expect(initialSettings.theme).toBe('dark')

    // -------------------------------------------------------------
    // PHASE 2: User adds daily task and starts focus session
    // -------------------------------------------------------------
    const createdGoal = await api.goals.add({
      date: today,
      title: 'Deep refactoring of storage engine',
      targetMinutes: 45
    })
    expect(createdGoal.id).toBeDefined()
    expect(createdGoal.title).toBe('Deep refactoring of storage engine')
    expect(createdGoal.targetMinutes).toBe(45)

    // Start focus session via session IPC
    api.session.updateTimer({
      isActive: true,
      isPaused: false,
      isBreak: false,
      isOvertime: false,
      totalSeconds: 45 * 60,
      secondsRemaining: 45 * 60,
      goalId: createdGoal.id,
      goalTitle: createdGoal.title,
      startedAt: new Date().toISOString()
    })

    // -------------------------------------------------------------
    // PHASE 3: Taskbar Deskband Widget reads metrics & session state
    // -------------------------------------------------------------
    setMockSenderWindow(widgetWindow)

    // MUST SUCCEED: Widget calling getDayReview must NOT throw Unauthorized IPC sender
    const widgetDayReview = await api.logs.getDayReview(today)
    expect(widgetDayReview).toBeDefined()
    expect(typeof widgetDayReview.totalProductiveMinutes).toBe('number')

    const widgetLogs = await api.logs.get(today)
    expect(Array.isArray(widgetLogs)).toBe(true)

    const widgetGoals = await api.goals.get(today)
    expect(Array.isArray(widgetGoals)).toBe(true)
    expect(widgetGoals.length).toBeGreaterThan(0)

    const widgetSchedulerStatus = await api.scheduler.getStatus()
    expect(widgetSchedulerStatus.intervalMinutes).toBe(30)

    const activeSessionState = await api.session.getState!()
    expect(activeSessionState.isActive).toBe(true)
    expect(activeSessionState.goalTitle).toBe('Deep refactoring of storage engine')

    // Security check: Deskband widget must NOT be able to delete goals or patch settings
    await expect(api.goals.delete(createdGoal.id)).rejects.toThrow('Unauthorized IPC sender')
    await expect(api.settings.patch({ reminderIntervalMinutes: 45 })).rejects.toThrow(
      'Unauthorized IPC sender'
    )

    // -------------------------------------------------------------
    // PHASE 4: Periodic check-in prompt dialog pops up
    // -------------------------------------------------------------
    setMockSenderWindow(promptWindow)

    // Prompt queries goals for user to pick what they worked on
    const promptGoals = await api.goals.get(today)
    expect(promptGoals.some((g) => g.id === createdGoal.id)).toBe(true)

    // Prompt logs productive work against the goal
    const checkInLogId = 'log-e2e-checkin-1'
    await api.logs.append(
      today,
      {
        id: checkInLogId,
        goalId: createdGoal.id,
        goalTitle: createdGoal.title,
        text: 'Completed SQLite schema migration and indexes',
        durationMinutes: 30,
        productiveMinutes: 30,
        productivity: 'productive',
        timestamp: `${today}T10:00:00.000Z`
      },
      true
    )

    // User marks goal in-progress and submits prompt
    await api.goals.update(today, {
      ...createdGoal,
      status: 'in_progress'
    })
    api.scheduler.submit()

    // -------------------------------------------------------------
    // PHASE 5: User reviews day and marks task complete in Main Window
    // -------------------------------------------------------------
    setMockSenderWindow(mainWindow)

    // Verify day review metrics now reflect logged work
    const mainDayReview = await api.logs.getDayReview(today)
    expect(mainDayReview.totalProductiveMinutes).toBe(30)
    expect(mainDayReview.logs).toHaveLength(1)
    expect(mainDayReview.logs[0].id).toBe(checkInLogId)

    // Mark task done on that day
    const completedGoal = await api.goals.update(today, {
      ...createdGoal,
      status: 'done',
      completedAt: `${today}T15:00:00.000Z`
    })
    expect(completedGoal.status).toBe('done')

    // Verify heatmap incorporates session and completed goal
    const heatmap = await api.logs.getHeatmap()
    const todayHeatmap = heatmap[today] as HeatmapBreakdown
    expect(todayHeatmap).toBeDefined()
    expect(todayHeatmap.sessions).toBe(1)
    expect(todayHeatmap.completedGoals).toBe(1)
    expect(todayHeatmap.total).toBe(2)

    // -------------------------------------------------------------
    // PHASE 6: Untrusted window security rejection
    // -------------------------------------------------------------
    setMockSenderWindow(untrustedWindow)
    await expect(api.logs.getDayReview(today)).rejects.toThrow('Unauthorized IPC sender')
    await expect(api.goals.delete(createdGoal.id)).rejects.toThrow('Unauthorized IPC sender')

    // -------------------------------------------------------------
    // PHASE 7: Restart persistence across app reboot
    // -------------------------------------------------------------
    tearDownAppStack()
    dm.getDb().close()

    // Fresh application boot from disk
    const freshDm = new DataManager()
    setupAppStack(freshDm)
    setMockSenderWindow(windowManager.getMainWindow()!)

    const restoredSettings = await api.settings.get()
    expect(restoredSettings.reminderIntervalMinutes).toBe(30)
    expect(restoredSettings.theme).toBe('dark')

    const restoredGoals = await api.goals.get(today)
    const refactorGoal = restoredGoals.find((g) => g.title === 'Deep refactoring of storage engine')
    expect(refactorGoal?.status).toBe('done')

    const restoredLogs = await api.logs.get(today)
    expect(restoredLogs).toHaveLength(1)
    expect(restoredLogs[0].text).toBe('Completed SQLite schema migration and indexes')

    tearDownAppStack()
    freshDm.getDb().close()
  })

  it('completes cloud sync lifecycle: handles remote changes, conflict resolution, and two-way merge', async () => {
    const mainWindow = windowManager.getMainWindow()!
    setMockSenderWindow(mainWindow)

    await api.settings.patch({
      driveSyncEnabled: true
    })

    const goal = await api.goals.add({
      date: today,
      title: 'Draft Design Document',
      targetMinutes: 60
    })

    const remoteStorage = new Map<string, string>()

    const mockDrive = {
      files: {
        list: vi.fn().mockImplementation(async () => {
          const files = Array.from(remoteStorage.keys()).map((name) => ({
            id: `id-${name}`,
            name
          }))
          return { data: { files, nextPageToken: null } }
        }),
        get: vi.fn().mockImplementation(async (params: { fileId: string }) => {
          const fileName = params.fileId.replace('id-', '')
          const content = remoteStorage.get(fileName) || '[]'
          const { Readable } = await import('stream')
          const s = new Readable()
          s.push(content)
          s.push(null)
          return { data: s }
        }),
        create: vi.fn().mockImplementation(async (params: any) => {
          const name = params.requestBody.name
          const body = params.media.body
          remoteStorage.set(name, body)
          return { data: { id: `id-${name}` } }
        }),
        update: vi.fn().mockImplementation(async (params: any) => {
          const name = params.fileId.replace('id-', '')
          const body = params.media.body
          remoteStorage.set(name, body)
          return { data: { id: params.fileId } }
        })
      }
    }

    ;(syncManager.driveSync as any).drive = mockDrive

    // Initial sync
    const initialSync = await syncManager.driveSync.syncNow()
    expect(initialSync.success).toBe(true)
    expect(remoteStorage.has(`goals-${today}.json`)).toBe(true)

    // Remote changes arrive
    const remoteGoals = JSON.parse(remoteStorage.get(`goals-${today}.json`)!)
    remoteGoals[0].status = 'done'
    remoteGoals[0].completedAt = new Date(Date.now() + 100000).toISOString()
    remoteGoals.push({
      id: 'remote-goal-2',
      title: 'Peer Code Review',
      status: 'planned',
      date: today,
      createdAt: new Date().toISOString()
    })
    remoteStorage.set(`goals-${today}.json`, JSON.stringify(remoteGoals))

    // Second sync merges remote changes
    const secondSync = await syncManager.driveSync.syncNow()
    expect(secondSync.success).toBe(true)

    const mergedGoals = await api.goals.get(today)
    expect(mergedGoals).toHaveLength(2)

    const updatedDesignGoal = mergedGoals.find((g) => g.id === goal.id)
    expect(updatedDesignGoal?.status).toBe('done')

    const newRemoteGoal = mergedGoals.find((g) => g.id === 'remote-goal-2')
    expect(newRemoteGoal?.title).toBe('Peer Code Review')

    await syncManager.driveSync.disconnect()
    const settingsAfterDisconnect = await api.settings.get()
    expect(settingsAfterDisconnect.driveSyncEnabled).toBe(false)
  })
})
