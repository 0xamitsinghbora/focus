import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import os from 'os'
import path from 'path'
import fs from 'fs'
import { BrowserWindow, ipcRenderer } from 'electron'
import { setMockSenderWindow } from '../__mocks__/electron'
import { IpcChannels } from '../shared/types'
import { DataManager } from '../main/dataManager'
import { ReminderScheduler } from '../main/scheduler'
import {
  LogsIpcController,
  GoalsIpcController,
  SessionIpcController,
  ReminderIpcController,
  SystemIpcController,
  SettingsIpcController
} from '../main/ipc'
import {
  assertSenderIsMainWindow,
  assertSenderIsMainWindowOrPrompt,
  assertSenderIsAppWindow
} from '../main/ipcSecurity'

import { WindowManager } from '../main/windows/WindowManager'

vi.mock('../../build/icon.png?asset', () => ({
  default: 'mock-icon.png'
}))

describe('Integration Test: IPC Authorization Matrix across Application Windows', () => {
  let testDir: string
  let dataManager: DataManager
  let scheduler: ReminderScheduler
  let windowManager: WindowManager
  let mainWindow: any
  let promptWindow: any
  let widgetWindow: any
  let untrustedWindow: any

  let logsController: LogsIpcController
  let goalsController: GoalsIpcController
  let sessionController: SessionIpcController
  let reminderController: ReminderIpcController
  let systemController: SystemIpcController
  let settingsController: SettingsIpcController

  const today = '2026-10-30'

  beforeEach(async () => {
    testDir = path.join(
      os.tmpdir(),
      `focus-ipc-matrix-${Date.now()}-${Math.random().toString(36).slice(2)}`
    )
    fs.mkdirSync(testDir, { recursive: true })
    vi.stubEnv('FOCUS_TEST_USER_DATA', testDir)

    dataManager = new DataManager()

    windowManager = new WindowManager({
      getShowWidget: () => true,
      onWidgetVisibilityChange: vi.fn()
    })
    mainWindow = windowManager.createMainWindow()
    windowManager.initAuxiliaryWindows()
    windowManager.showPrompt()

    promptWindow = windowManager.getPromptWindow()
    widgetWindow = windowManager.getWidgetWindow()
    untrustedWindow = new BrowserWindow()

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

    logsController = new LogsIpcController({
      logsRepo: dataManager.logsRepo,
      analyticsService: dataManager.analyticsService,
      settingsRepo: dataManager.settingsRepo,
      goalsRepo: dataManager.goalsRepo,
      scheduler,
      syncAfterWrite: vi.fn(),
      security
    })
    logsController.register()

    goalsController = new GoalsIpcController({
      goalsRepo: dataManager.goalsRepo,
      settingsRepo: dataManager.settingsRepo,
      analyticsService: dataManager.analyticsService,
      syncAfterWrite: vi.fn(),
      getDirtyGoalDates: () => [],
      security
    })
    goalsController.register()

    sessionController = new SessionIpcController({
      settingsRepo: dataManager.settingsRepo,
      scheduler,
      getTaskbarManager: () => null,
      broadcastToWidget: vi.fn(),
      getPromptWindow: () => promptWindow,
      getMainWindow: () => mainWindow,
      isPromptVisible: () => false,
      security
    })
    sessionController.register()

    reminderController = new ReminderIpcController({
      scheduler,
      security,
      hidePromptWindow: vi.fn()
    })
    reminderController.register()

    systemController = new SystemIpcController({
      dataManager,
      scheduler,
      getMainWindow: () => windowManager.getMainWindow(),
      getTaskbarManager: () => null,
      getPromptWindow: () => windowManager.getPromptWindow(),
      getWidgetWindow: () => windowManager.getWidgetWindow(),
      syncAfterWrite: vi.fn(),
      onPrepareForExit: () => {},
      security
    })
    systemController.register()

    settingsController = new SettingsIpcController({
      settingsService: scheduler.getSettingsService(),
      security
    })
    settingsController.register()

    // Pre-seed some test records via main window
    setMockSenderWindow(mainWindow)
    await ipcRenderer.invoke(IpcChannels.AddGoal, {
      date: today,
      title: 'Matrix Test Task',
      targetMinutes: 30
    })
  })

  afterEach(() => {
    windowManager?.destroyAllWindows()
    logsController?.destroy()
    goalsController?.destroy()
    sessionController?.destroy()
    reminderController?.unregister()
    systemController?.destroy()
    settingsController?.destroy()
    scheduler?.stopTimer()
    dataManager?.close()

    try {
      fs.rmSync(testDir, { recursive: true, force: true })
    } catch {}
    vi.restoreAllMocks()
  })

  describe('Main Window (Superuser Role)', () => {
    beforeEach(() => {
      setMockSenderWindow(mainWindow)
    })

    it('can read and write goals, logs, reviews, and settings without authorization errors', async () => {
      const goals = await ipcRenderer.invoke(IpcChannels.GetGoals, { date: today })
      expect(Array.isArray(goals)).toBe(true)
      expect(goals.length).toBeGreaterThan(0)

      const review = await ipcRenderer.invoke(IpcChannels.GetDayReview, { date: today })
      expect(review).toBeDefined()
      expect(typeof review.totalProductiveMinutes).toBe('number')

      const logs = await ipcRenderer.invoke(IpcChannels.GetLogs, { date: today })
      expect(Array.isArray(logs)).toBe(true)

      const settings = await ipcRenderer.invoke(IpcChannels.GetSettings)
      expect(settings).toBeDefined()

      const sessionState = await ipcRenderer.invoke(IpcChannels.GetSessionState)
      expect(sessionState).toBeDefined()
    })
  })

  describe('Taskbar Widget Window (Deskband Role)', () => {
    beforeEach(() => {
      setMockSenderWindow(widgetWindow)
    })

    it('SUCCESS: can invoke GetDayReview (resolves regression bug)', async () => {
      const review = await ipcRenderer.invoke(IpcChannels.GetDayReview, { date: today })
      expect(review).toBeDefined()
      expect(typeof review.totalProductiveMinutes).toBe('number')
    })

    it('SUCCESS: can invoke GetLogs to display current progress', async () => {
      const logs = await ipcRenderer.invoke(IpcChannels.GetLogs, { date: today })
      expect(Array.isArray(logs)).toBe(true)
    })

    it('SUCCESS: can invoke RemindGetStatus to read reminder countdown', async () => {
      const status = await ipcRenderer.invoke(IpcChannels.RemindGetStatus)
      expect(status).toBeDefined()
      expect(typeof status.intervalMinutes).toBe('number')
    })

    it('SUCCESS: can invoke GetSessionState to sync timer status', async () => {
      const state = await ipcRenderer.invoke(IpcChannels.GetSessionState)
      expect(state).toBeDefined()
      expect(typeof state.isActive).toBe('boolean')
    })

    it('SUCCESS: can invoke GetGoals to read kanban tasks', async () => {
      const goals = await ipcRenderer.invoke(IpcChannels.GetGoals, { date: today })
      expect(Array.isArray(goals)).toBe(true)
    })

    it('SECURITY REJECTION: cannot add, update, or delete daily goals', async () => {
      await expect(
        ipcRenderer.invoke(IpcChannels.AddGoal, {
          date: today,
          title: 'Malicious Goal'
        })
      ).rejects.toThrow('Unauthorized IPC sender')

      await expect(
        ipcRenderer.invoke(IpcChannels.DeleteGoal, { goalId: 'goal-1' })
      ).rejects.toThrow('Unauthorized IPC sender')

      await expect(ipcRenderer.invoke(IpcChannels.GoalsEmptyTrash)).rejects.toThrow(
        'Unauthorized IPC sender'
      )
    })

    it('SECURITY REJECTION: cannot delete or modify log entries or change app settings', async () => {
      await expect(ipcRenderer.invoke(IpcChannels.DeleteLog, { id: 'log-1' })).rejects.toThrow(
        'Unauthorized IPC sender'
      )

      await expect(
        ipcRenderer.invoke(IpcChannels.PatchSettings, { theme: 'light' })
      ).rejects.toThrow('Unauthorized IPC sender')
    })
  })

  describe('Prompt Window (Intervention Dialog Role)', () => {
    beforeEach(() => {
      setMockSenderWindow(promptWindow)
    })

    it('SUCCESS: can query goals and append check-in logs during prompt', async () => {
      const goals = await ipcRenderer.invoke(IpcChannels.GetGoals, { date: today })
      expect(Array.isArray(goals)).toBe(true)

      await ipcRenderer.invoke(IpcChannels.AppendLog, {
        date: today,
        entry: {
          id: 'log-prompt-1',
          text: 'Check-in response from prompt',
          durationMinutes: 25,
          productiveMinutes: 25,
          productivity: 'productive',
          timestamp: new Date().toISOString()
        },
        isCheckIn: true
      })
      const savedLogs = await ipcRenderer.invoke(IpcChannels.GetLogs, { date: today })
      expect(savedLogs.some((l: any) => l.id === 'log-prompt-1')).toBe(true)
    })

    it('SUCCESS: can update goal when user marks task in progress from prompt', async () => {
      const goals = await ipcRenderer.invoke(IpcChannels.GetGoals, { date: today })
      const target = goals[0]

      const updated = await ipcRenderer.invoke(IpcChannels.UpdateGoal, {
        date: today,
        goal: {
          ...target,
          status: 'in_progress'
        }
      })
      expect(updated.status).toBe('in_progress')
    })

    it('SECURITY REJECTION: cannot delete goals or alter global settings', async () => {
      await expect(ipcRenderer.invoke(IpcChannels.DeleteGoal, { goalId: 'g-1' })).rejects.toThrow(
        'Unauthorized IPC sender'
      )

      await expect(
        ipcRenderer.invoke(IpcChannels.PatchSettings, { reminderIntervalMinutes: 10 })
      ).rejects.toThrow('Unauthorized IPC sender')
    })
  })

  describe('Untrusted External Window (Attacker / Hijacked Frame Role)', () => {
    beforeEach(() => {
      setMockSenderWindow(untrustedWindow)
    })

    it('SECURITY REJECTION: rejects all secure operations with Unauthorized IPC sender', async () => {
      await expect(ipcRenderer.invoke(IpcChannels.GetLogs, { date: today })).rejects.toThrow(
        'Unauthorized IPC sender: unknown window'
      )

      await expect(ipcRenderer.invoke(IpcChannels.GetDayReview, { date: today })).rejects.toThrow(
        'Unauthorized IPC sender: unknown window'
      )

      await expect(ipcRenderer.invoke(IpcChannels.GetGoals, { date: today })).rejects.toThrow(
        'Unauthorized IPC sender'
      )

      await expect(
        ipcRenderer.invoke(IpcChannels.AddGoal, { date: today, title: 'Injected' })
      ).rejects.toThrow('Unauthorized IPC sender')

      await expect(ipcRenderer.invoke(IpcChannels.DeleteLog, { id: 'log-1' })).rejects.toThrow(
        'Unauthorized IPC sender'
      )

      await expect(ipcRenderer.invoke(IpcChannels.GetSettings)).rejects.toThrow(
        'Unauthorized IPC sender'
      )
    })
  })
})
