import crypto from 'crypto'
import { powerMonitor, BrowserWindow } from 'electron'
import { showNativeNotification } from './notifications'
import { ReminderIpcController } from './ipc/ReminderIpcController'
import {
  isPromptVisible,
  showPromptWindow,
  hidePromptWindow,
  onPromptDismiss,
  setPromptSnoozeHandler,
  getPromptWindow
} from './windows/prompt'
import { getWidgetWindow } from './windows/widget'
import {
  assertSenderIsMainWindow,
  assertSenderIsMainWindowOrPrompt,
  assertSenderIsAppWindow
} from './ipcSecurity'
import {
  AppSettings,
  LogEntry,
  ReminderStatus,
  SessionTimerPayload,
  BreakNudgePayload,
  IpcChannels,
  localDateStr
} from '../shared/types'
import { DataManager } from './dataManager'
import { SettingsRepository } from './repositories/SettingsRepository'
import { SettingsService } from './services/SettingsService'
import { logger } from './logger'

export class ReminderScheduler {
  private intervalId: NodeJS.Timeout | null = null
  private nextPromptTime: number = 0
  private currentBlockStartedAt: number = 0
  private isPendingPrompt: boolean = false
  private promptTriggeredAt: number = 0
  private lastResetBlockAt: number = 0
  private gracePeriodMs: number = 30 * 1000 // 30 seconds
  private idleThresholdSec: number = 5 * 60 // 5 minutes
  private dismissCleanup: (() => void) | null = null
  private suspendedOrLockedAt: number | null = null
  private resumeTimeout: NodeJS.Timeout | null = null
  private lastTickTime: number = 0
  private idleStartedAt: number | null = null
  private isDeepFocusActive: boolean = false
  private sessionTimerRemaining: number = 0
  private snoozeCount: number = 0
  private deepFocusStartedAt: number | null = null
  private deepFocusPausedAt: number | null = null
  private deepFocusAccumulatedPausedMs: number = 0
  private breakNudgeStartEpoch: number = 0
  private lastBreakNudgeEpoch: number = 0
  private breakNudgeCount: number = 0
  private getMainWindow?: () => BrowserWindow | null
  private settingsService: SettingsService
  private powerSuspendHandler: (() => void) | null = null
  private powerResumeHandler: (() => void) | null = null
  private powerLockHandler: (() => void) | null = null
  private cleanupSettingsIpc: (() => void) | null = null
  private powerUnlockHandler: (() => void) | null = null
  private reminderIpcController: ReminderIpcController | null = null
  private onResetSession?: () => void
  private pendingUnattendedBreak: LogEntry | null = null

  constructor(
    settingsSource: SettingsRepository | DataManager,
    getMainWindow?: () => BrowserWindow | null,
    settingsService?: SettingsService
  ) {
    this.getMainWindow = getMainWindow
    const settingsRepo =
      'settingsRepo' in settingsSource && settingsSource.settingsRepo
        ? settingsSource.settingsRepo
        : (settingsSource as SettingsRepository)
    this.settingsService = settingsService ?? new SettingsService(settingsRepo)

    this.settingsService.setOnSettingsUpdated((newSettings, oldSettings) => {
      const intervalChanged =
        typeof newSettings.reminderIntervalMinutes === 'number' &&
        newSettings.reminderIntervalMinutes !== oldSettings.reminderIntervalMinutes

      if (intervalChanged || !this.nextPromptTime) {
        this.rescheduleNextPrompt()
        this.isPendingPrompt = false
      }

      if (!this.intervalId) {
        this.startTimer()
      }
    })

    this.setupPowerMonitor()
    this.setupIpc()
    this.startTimer()
  }

  public setOnSettingsChanged(fn: (settings: AppSettings) => void): void {
    this.settingsService.setOnSettingsChanged(fn)
  }

  public getSettings(): AppSettings {
    return this.settingsService.getSettings()
  }

  public getSettingsService(): SettingsService {
    return this.settingsService
  }

  public updateFocusSession(payload: SessionTimerPayload): void {
    const now = Date.now()
    this.isDeepFocusActive = Boolean(payload.isActive && !payload.isPaused)
    this.sessionTimerRemaining =
      typeof payload.secondsRemaining === 'number' ? payload.secondsRemaining : 0

    // Break nudge tracking: detect transitions into/out of break state.
    // Active intentional break countdowns ("Take Break") must NOT trigger break nudges.
    const isIntentionalBreakActive = Boolean(
      payload.isBreak && payload.isActive && !payload.isPaused && !payload.isAfk && payload.secondsRemaining > 0
    )
    const isOnBreak =
      payload.isAfk ||
      (!isIntentionalBreakActive &&
        (!payload.isActive || payload.isPaused || (payload.isBreak && payload.secondsRemaining <= 0)))
    if (isOnBreak) {
      if (this.breakNudgeStartEpoch === 0) {
        this.breakNudgeStartEpoch =
          payload.afkBreakStartEpoch && payload.afkBreakStartEpoch > 0
            ? payload.afkBreakStartEpoch
            : payload.isPaused && payload.pauseStartEpoch
              ? payload.pauseStartEpoch
              : payload.emptyInProgressStartEpoch && payload.emptyInProgressStartEpoch > 0
                ? payload.emptyInProgressStartEpoch
                : now
        this.breakNudgeCount = 0
        this.lastBreakNudgeEpoch = 0
      }
    } else {
      this.breakNudgeStartEpoch = 0
      this.breakNudgeCount = 0
      this.lastBreakNudgeEpoch = 0
    }

    if (!this.deepFocusStartedAt && payload.isActive) {
      if (payload.startedAt) {
        const sMs = new Date(payload.startedAt).getTime()
        this.deepFocusStartedAt = !isNaN(sMs) && sMs > 0 && sMs <= now ? sMs : now
      } else {
        this.deepFocusStartedAt = now
      }
      this.deepFocusPausedAt = payload.isPaused ? now : null
      this.deepFocusAccumulatedPausedMs = 0
    } else if (this.deepFocusStartedAt && payload.isActive) {
      if (payload.isPaused) {
        if (!this.deepFocusPausedAt) {
          this.deepFocusPausedAt = now
        }
      } else {
        if (this.deepFocusPausedAt) {
          this.deepFocusAccumulatedPausedMs += Math.max(0, now - this.deepFocusPausedAt)
          this.deepFocusPausedAt = null
        }
      }
    } else if (this.deepFocusStartedAt && !payload.isActive) {
      if (this.deepFocusPausedAt) {
        this.deepFocusAccumulatedPausedMs += Math.max(0, now - this.deepFocusPausedAt)
        this.deepFocusPausedAt = null
      }
      const grossDuration = Math.max(0, now - this.deepFocusStartedAt)
      const startedAt = this.deepFocusStartedAt
      this.deepFocusStartedAt = null
      this.deepFocusAccumulatedPausedMs = 0
      this.promptTriggeredAt = 0

      if (
        this.currentBlockStartedAt &&
        this.currentBlockStartedAt < startedAt &&
        grossDuration > 0
      ) {
        // Preserve unlogged work from before deep focus by shifting block start forward by total deep focus session duration
        // so that no time spent in deep focus (active or paused) inflates the prior work block
        this.currentBlockStartedAt = Math.min(now, this.currentBlockStartedAt + grossDuration)
        this.nextPromptTime = Math.max(
          now + 60 * 1000,
          this.currentBlockStartedAt + this.frequencyMinutes * 60 * 1000
        )
      } else {
        this.currentBlockStartedAt = now
        this.rescheduleNextPrompt()
      }
    }
  }

  public setSettings(settings: AppSettings, updateTimestamp: boolean = true): void {
    this.settingsService.setSettings(settings, updateTimestamp)
  }

  public patchSettings(
    partial: Partial<AppSettings>,
    updateTimestamp: boolean = true
  ): AppSettings {
    return this.settingsService.patchSettings(partial, updateTimestamp)
  }

  public getStatus(): ReminderStatus {
    const now = Date.now()
    const blockStarted = this.currentBlockStartedAt || now

    const isDayRollover =
      this.isDifferentDay(blockStarted, now) && now - blockStarted > 8 * 60 * 60 * 1000
    const effectiveBlockStarted = isDayRollover ? now : blockStarted
    const effectiveNextPrompt = isDayRollover
      ? now + this.frequencyMinutes * 60 * 1000
      : this.nextPromptTime || now + this.frequencyMinutes * 60 * 1000
    const effectiveIsPendingPrompt = isDayRollover ? false : this.isPendingPrompt

    return {
      intervalMinutes: this.frequencyMinutes,
      currentBlockStartedAt: new Date(effectiveBlockStarted).toISOString(),
      nextPromptTime: new Date(effectiveNextPrompt).toISOString(),
      isPendingPrompt: effectiveIsPendingPrompt,
      dayCutoffHour: this.dayCutoffHour,
      snoozeCount: this.snoozeCount
    }
  }

  public enrichLogWithCurrentBlock(entry: LogEntry): LogEntry {
    this.ensureBlockStarted()
    const now = Date.now()
    // Cap dwell time: if the prompt was triggered and left open on screen,
    // don't inflate the completed interval by more than 2 minutes of response grace.
    const endedAt =
      this.promptTriggeredAt && now > this.promptTriggeredAt
        ? Math.min(now, this.promptTriggeredAt + 2 * 60 * 1000)
        : now

    // Safety guard: if block started long ago (e.g. computer sleeping overnight for > 8h without power events),
    // cap the block start rather than wiping duration to 0 across midnight work sessions
    if (
      this.isDifferentDay(this.currentBlockStartedAt, endedAt) &&
      endedAt - this.currentBlockStartedAt > 8 * 60 * 60 * 1000
    ) {
      this.currentBlockStartedAt = endedAt - this.frequencyMinutes * 60 * 1000
    }

    // Safety guard: if system is currently locked/suspended or user was idle, subtract away time
    // Only subtract idle time that occurred after currentBlockStartedAt to avoid double subtraction
    let awayMs = 0
    if (this.suspendedOrLockedAt) {
      const suspendStart = Math.max(this.currentBlockStartedAt, this.suspendedOrLockedAt)
      awayMs = Math.max(0, endedAt - suspendStart)
    } else if (this.idleStartedAt) {
      const idleStart = Math.max(this.currentBlockStartedAt, this.idleStartedAt)
      awayMs = Math.max(0, endedAt - idleStart)
      this.idleStartedAt = null
    } else if (typeof powerMonitor.getSystemIdleTime === 'function') {
      try {
        const idleSec = powerMonitor.getSystemIdleTime()
        if (idleSec >= this.idleThresholdSec) {
          const idleStart = Math.max(this.currentBlockStartedAt, endedAt - idleSec * 1000)
          awayMs = Math.max(0, endedAt - idleStart)
        }
      } catch {
        // ignore
      }
    }

    const elapsedMs = Math.max(0, endedAt - this.currentBlockStartedAt)
    const effectiveElapsedMs = Math.max(0, elapsedMs - awayMs)
    const fallbackDuration = Math.max(0, Math.round(effectiveElapsedMs / 60000))
    const durationMinutes =
      typeof entry.durationMinutes === 'number' ? entry.durationMinutes : fallbackDuration
    const productivity = entry.productivity || 'productive'
    const fallbackProductive = productivity === 'productive' ? durationMinutes : 0
    const productiveMinutes =
      typeof entry.productiveMinutes === 'number' ? entry.productiveMinutes : fallbackProductive

    // Pre-prompt idle detection: if user was already idle before prompt appeared (e.g. left at minute 20 of 45),
    // count idle portion as break instead of phantom focus
    if (productivity !== 'break' && awayMs >= 60 * 1000) {
      const awayBreakMins = Math.max(1, Math.round(awayMs / 60000))
      this.pendingUnattendedBreak = {
        id: crypto.randomUUID(),
        timestamp: new Date(now).toISOString(),
        startedAt: new Date(endedAt - awayMs).toISOString(),
        endedAt: new Date(endedAt).toISOString(),
        text: 'Break',
        productivity: 'break',
        durationMinutes: awayBreakMins,
        productiveMinutes: 0
      }
    } else if (productivity !== 'break' && this.promptTriggeredAt && now - endedAt >= 40 * 1000) {
      const breakMins = Math.max(1, Math.round((now - endedAt) / 60000))
      this.pendingUnattendedBreak = {
        id: crypto.randomUUID(),
        timestamp: new Date(now).toISOString(),
        startedAt: new Date(endedAt).toISOString(),
        endedAt: new Date(now).toISOString(),
        text: 'Break',
        productivity: 'break',
        durationMinutes: breakMins,
        productiveMinutes: 0
      }
    } else {
      this.pendingUnattendedBreak = null
    }

    return {
      ...entry,
      timestamp: entry.timestamp || new Date(endedAt).toISOString(),
      startedAt: entry.startedAt || new Date(this.currentBlockStartedAt).toISOString(),
      endedAt: entry.endedAt || new Date(endedAt).toISOString(),
      durationMinutes,
      productiveMinutes
    }
  }

  public consumeUnattendedBreak(): LogEntry | null {
    const b = this.pendingUnattendedBreak
    this.pendingUnattendedBreak = null
    return b
  }

  public setOnResetSession(fn: () => void): void {
    this.onResetSession = fn
  }

  public setAutoLaunch(enabled: boolean): void {
    this.settingsService.setAutoLaunch(enabled)
  }

  private get frequencyMinutes(): number {
    const mins = this.settingsService.getSettings().reminderIntervalMinutes
    return typeof mins === 'number' && mins >= 1 ? mins : 45
  }

  private get dayCutoffHour(): number {
    const cutoff = this.settingsService.getSettings().dayCutoffHour
    return typeof cutoff === 'number' && cutoff >= 0 && cutoff <= 12 ? cutoff : 0
  }

  private isDifferentDay(t1: number, t2: number): boolean {
    return (
      localDateStr(new Date(t1), this.dayCutoffHour) !==
      localDateStr(new Date(t2), this.dayCutoffHour)
    )
  }

  private setupPowerMonitor(): void {
    this.powerSuspendHandler = () => {
      logger.info('scheduler', 'System suspended, pausing timer')
      this.handleSuspendOrLock('suspend')
    }

    this.powerResumeHandler = () => {
      logger.info('scheduler', 'System resumed, recalculating next prompt')
      this.handleResume()
    }

    this.powerLockHandler = () => {
      logger.debug('scheduler', 'Screen locked, pausing timer')
      this.handleSuspendOrLock('lock')
    }

    this.powerUnlockHandler = () => {
      logger.debug('scheduler', 'Screen unlocked')
      this.handleResume()
    }

    try {
      if (typeof powerMonitor?.on === 'function') {
        powerMonitor.on('suspend', this.powerSuspendHandler)
        powerMonitor.on('resume', this.powerResumeHandler)
        powerMonitor.on('lock-screen', this.powerLockHandler)
        powerMonitor.on('unlock-screen', this.powerUnlockHandler)
      }
    } catch {
      // ignore
    }
  }

  private handleSuspendOrLock(event: 'suspend' | 'lock'): void {
    logger.debug('scheduler', `Power state changed: ${event}, pausing timer`)
    if (!this.suspendedOrLockedAt) {
      this.suspendedOrLockedAt = this.idleStartedAt || Date.now()
    }
    this.idleStartedAt = null
    if (this.resumeTimeout) {
      clearTimeout(this.resumeTimeout)
      this.resumeTimeout = null
    }
    this.stopTimer()
  }

  private setupIpc(): void {
    const getMain = this.getMainWindow || (() => null)
    const assertSenderIsMain = (
      event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent
    ): void => {
      assertSenderIsMainWindow(event, getMain)
    }
    const assertSenderIsMainOrPrompt = (
      event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent
    ): void => {
      assertSenderIsMainWindowOrPrompt(event, getMain, getPromptWindow)
    }
    const assertSenderIsApp = (
      event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent
    ): void => {
      assertSenderIsAppWindow(event, getMain, getPromptWindow, getWidgetWindow)
    }

    try {
      if (this.cleanupSettingsIpc) {
        this.cleanupSettingsIpc()
        this.cleanupSettingsIpc = null
      }
    } catch {
      // ignore
    }

    if (this.reminderIpcController) {
      try {
        this.reminderIpcController.unregister()
      } catch {
        // ignore
      }
    }

    this.reminderIpcController = new ReminderIpcController({
      scheduler: this,
      security: {
        assertSenderIsMainWindowOrPrompt: (event) => assertSenderIsMainOrPrompt(event),
        assertSenderIsAppWindow: (event) => assertSenderIsApp(event)
      }
    })
    this.reminderIpcController.register()

    this.cleanupSettingsIpc = this.settingsService.registerIpc({
      assertSenderIsMain,
      assertSenderIsApp
    })

    this.ensureDismissListener()
  }

  private ensureDismissListener(): void {
    if (!this.dismissCleanup && typeof onPromptDismiss === 'function') {
      this.dismissCleanup = onPromptDismiss(() => {
        logger.info(
          'scheduler',
          'Prompt window dismissed externally, snoozing to preserve work block'
        )
        this.snooze(5)
      })
      if (typeof setPromptSnoozeHandler === 'function') {
        setPromptSnoozeHandler((minutes) => this.snooze(minutes || 5))
      }
    }
  }

  public startTimer(): void {
    if (this.intervalId) return

    this.ensureBlockStarted()
    if (!this.nextPromptTime) {
      this.rescheduleNextPrompt()
    }
    this.lastTickTime = Date.now()
    this.ensureDismissListener()

    this.intervalId = setInterval(() => {
      this.checkTimer()
    }, 15 * 1000)
  }

  public stopTimer(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    if (this.resumeTimeout) {
      clearTimeout(this.resumeTimeout)
      this.resumeTimeout = null
    }
    if (this.dismissCleanup) {
      this.dismissCleanup()
      this.dismissCleanup = null
    }
    if (typeof setPromptSnoozeHandler === 'function') {
      setPromptSnoozeHandler(null)
    }
    this.lastResetBlockAt = 0
  }

  public destroy(): void {
    this.stopTimer()
    if (this.resumeTimeout) {
      clearTimeout(this.resumeTimeout)
      this.resumeTimeout = null
    }
    if (this.dismissCleanup) {
      try {
        this.dismissCleanup()
      } catch {
        // ignore
      }
      this.dismissCleanup = null
    }

    try {
      if (typeof powerMonitor?.removeListener === 'function') {
        if (this.powerSuspendHandler) {
          powerMonitor.removeListener('suspend', this.powerSuspendHandler)
          this.powerSuspendHandler = null
        }
        if (this.powerResumeHandler) {
          powerMonitor.removeListener('resume', this.powerResumeHandler)
          this.powerResumeHandler = null
        }
        if (this.powerLockHandler) {
          powerMonitor.removeListener('lock-screen', this.powerLockHandler)
          this.powerLockHandler = null
        }
        if (this.powerUnlockHandler) {
          powerMonitor.removeListener('unlock-screen', this.powerUnlockHandler)
          this.powerUnlockHandler = null
        }
      }
    } catch {
      // ignore
    }

    try {
      if (this.reminderIpcController) {
        this.reminderIpcController.unregister()
        this.reminderIpcController = null
      }
      if (this.cleanupSettingsIpc) {
        this.cleanupSettingsIpc()
        this.cleanupSettingsIpc = null
      }
      this.settingsService.destroy()
    } catch {
      // ignore
    }
  }

  private resetTimer(): void {
    this.rescheduleNextPrompt()
    this.isPendingPrompt = false
    logger.debug(
      'scheduler',
      `Timer reset, next prompt at ${new Date(this.nextPromptTime).toLocaleTimeString()}`
    )
  }

  public notifyPromptTriggered(): void {
    this.ensureBlockStarted()
    this.promptTriggeredAt = Date.now()
    this.isPendingPrompt = true
  }

  private ensureBlockStarted(): void {
    if (!this.currentBlockStartedAt || this.currentBlockStartedAt > Date.now()) {
      this.currentBlockStartedAt = Date.now()
    }
  }

  public resetBlockAndTimer(): void {
    const now = Date.now()
    if (this.lastResetBlockAt && now - this.lastResetBlockAt < 1000) {
      return
    }
    this.lastResetBlockAt = now
    this.promptTriggeredAt = 0
    this.currentBlockStartedAt = now
    this.snoozeCount = 0
    this.breakNudgeStartEpoch = 0
    this.breakNudgeCount = 0
    this.lastBreakNudgeEpoch = 0
    this.resetTimer()
    try {
      this.onResetSession?.()
    } catch (err) {
      logger.error('scheduler', 'Error invoking onResetSession callback:', err)
    }
  }

  public snooze(minutes = 5): void {
    this.promptTriggeredAt = 0
    this.snoozeCount = (this.snoozeCount || 0) + 1
    const snoozeDurationMs = Math.max(1, minutes) * 60 * 1000
    this.nextPromptTime = Date.now() + snoozeDurationMs
    this.isPendingPrompt = false
    logger.info(
      'scheduler',
      `Prompt snoozed for ${minutes} min (snooze count: ${this.snoozeCount}), next prompt at ${new Date(this.nextPromptTime).toLocaleTimeString()}`
    )
  }

  private rescheduleNextPrompt(): void {
    const mins = Math.max(1, this.frequencyMinutes)
    this.nextPromptTime = Date.now() + mins * 60 * 1000
  }

  private checkTimer(): void {
    const now = Date.now()
    const elapsedSinceLastTick = this.lastTickTime ? now - this.lastTickTime : 0
    this.lastTickTime = now

    // Unified heartbeat drift detection threshold (25s): if more than 25 seconds elapsed since a 15-second tick,
    // the system entered sleep, standby, or hibernation without firing an OS powerMonitor event (e.g. Windows Modern Standby)
    if (elapsedSinceLastTick > 25 * 1000 && !this.suspendedOrLockedAt) {
      logger.info(
        'scheduler',
        `Heartbeat drift detected (${Math.round(elapsedSinceLastTick / 1000)}s elapsed since last tick). Synthesizing resume.`
      )
      this.suspendedOrLockedAt = now - elapsedSinceLastTick
      this.handleResume()
      return
    }

    // Check if calendar day rolled over after prolonged inactivity (> 8h)
    if (
      this.currentBlockStartedAt &&
      this.isDifferentDay(this.currentBlockStartedAt, now) &&
      now - this.currentBlockStartedAt > 8 * 60 * 60 * 1000
    ) {
      this.currentBlockStartedAt = now
      this.rescheduleNextPrompt()
      this.isPendingPrompt = false
    }

    // Check system idle time if available
    let idleSec = 0
    if (typeof powerMonitor.getSystemIdleTime === 'function') {
      try {
        idleSec = powerMonitor.getSystemIdleTime()
      } catch {
        idleSec = 0
      }
    }

    if (idleSec >= this.idleThresholdSec) {
      if (!this.idleStartedAt) {
        this.idleStartedAt = now - idleSec * 1000
      }
    } else {
      if (this.idleStartedAt) {
        const idleDurationMs = now - this.idleStartedAt
        this.idleStartedAt = null

        // User returned from being idle
        if (idleDurationMs >= this.frequencyMinutes * 60 * 1000) {
          // Missed entire interval while idle: reset block start and reschedule next prompt
          logger.info(
            'scheduler',
            `User returned after long idle (${Math.round(idleDurationMs / 60000)} min). Resetting block start.`
          )
          this.currentBlockStartedAt = now
          this.rescheduleNextPrompt()
          this.isPendingPrompt = false
          if (isPromptVisible()) {
            hidePromptWindow()
          }
        } else if (idleDurationMs >= this.idleThresholdSec * 1000) {
          // Moderate idle pause: shift timestamps forward so idle duration isn't counted as work
          logger.debug(
            'scheduler',
            `User returned after idle pause (${Math.round(idleDurationMs / 1000)}s). Shifting timestamps forward.`
          )
          this.currentBlockStartedAt = Math.min(now, this.currentBlockStartedAt + idleDurationMs)
          this.nextPromptTime += idleDurationMs
        }
      }
    }

    if (this.resumeTimeout !== null) {
      // Grace period active after resume; resumeTimeout will trigger prompt once grace period expires
      return
    }

    if (now >= this.nextPromptTime) {
      this.tryTriggerPrompt()
    }

    this.checkBreakNudge(now)
  }

  private checkBreakNudge(now: number): void {
    if (this.breakNudgeStartEpoch === 0) return
    if (this.suspendedOrLockedAt) return

    const intervalMs = this.frequencyMinutes * 60 * 1000
    const breakDurationMs = now - this.breakNudgeStartEpoch

    // First nudge at 2x interval, subsequent nudges every 1x interval after that
    const firstNudgeMs = intervalMs * 2
    if (breakDurationMs < firstNudgeMs) return

    const nextNudgeMs =
      this.breakNudgeCount === 0 ? firstNudgeMs : firstNudgeMs + this.breakNudgeCount * intervalMs

    if (breakDurationMs < nextNudgeMs) return
    if (this.lastBreakNudgeEpoch && now - this.lastBreakNudgeEpoch < 60 * 1000) return

    this.breakNudgeCount++
    this.lastBreakNudgeEpoch = now

    const breakMins = Math.round(breakDurationMs / 60000)
    const urgency = this.breakNudgeCount

    let title: string
    let body: string
    if (urgency === 1) {
      title = 'Break running long'
      body = `You've been on break for ${breakMins} minutes. Ready to get back to focus?`
    } else if (urgency === 2) {
      title = 'Still on break'
      body = `${breakMins} minutes on break now. Your focus target is waiting.`
    } else {
      title = 'Extended break'
      body = `${breakMins} minute break. Pick a task and start a focus session to get back on track.`
    }

    const mainWin = this.getMainWindow?.()

    const nudgePayload: BreakNudgePayload = {
      urgency,
      breakMinutes: breakMins,
      intervalMinutes: this.frequencyMinutes,
      title,
      body,
      timestamp: now
    }

    if (mainWin && !mainWin.isDestroyed() && mainWin.webContents) {
      try {
        mainWin.webContents.send(IpcChannels.BreakNudge, nudgePayload)
      } catch {
        // ignore
      }
    }

    showNativeNotification({
      title,
      body,
      onClick: () => {
        if (mainWin && !mainWin.isDestroyed()) {
          if (mainWin.isMinimized()) mainWin.restore()
          mainWin.show()
          mainWin.focus()
        }
      }
    })

    if (urgency >= 2 && mainWin && !mainWin.isDestroyed()) {
      if (typeof mainWin.isMinimized === 'function' && mainWin.isMinimized()) {
        if (typeof mainWin.restore === 'function') mainWin.restore()
      }
      if (typeof mainWin.show === 'function') mainWin.show()
      if (typeof mainWin.focus === 'function') mainWin.focus()
    }

    logger.info(
      'scheduler',
      `Break nudge #${urgency}: ${breakMins}m on break (interval: ${this.frequencyMinutes}m)`
    )
  }

  private tryTriggerPrompt(): void {
    if (this.resumeTimeout !== null) {
      logger.debug('scheduler', 'Resume grace period is active, deferring prompt')
      return
    }

    if (this.isDeepFocusActive && this.sessionTimerRemaining > 0) {
      logger.debug('scheduler', 'Deep focus session is active, deferring periodic check-in prompt')
      this.nextPromptTime = Date.now() + 60 * 1000
      return
    }

    if (this.promptTriggeredAt || isPromptVisible()) {
      logger.debug('scheduler', 'Prompt window is already open, deferring prompt re-trigger')
      this.nextPromptTime = Date.now() + 2 * 60 * 1000
      return
    }

    let idleState = 'active'
    try {
      if (typeof powerMonitor?.getSystemIdleState === 'function') {
        idleState = powerMonitor.getSystemIdleState(this.idleThresholdSec)
      }
    } catch (err) {
      logger.warn('scheduler', `Failed to determine system idle state: ${err}`)
    }
    logger.debug('scheduler', `Idle state: ${idleState}`)

    if (idleState === 'active') {
      logger.info('scheduler', 'User is active, triggering prompt')
      this.promptTriggeredAt = Date.now()
      showPromptWindow()
      this.rescheduleNextPrompt()
      this.isPendingPrompt = false
    } else {
      logger.debug('scheduler', 'User is idle, deferring prompt')
      this.isPendingPrompt = true
      this.nextPromptTime = Date.now() + 60 * 1000
    }
  }

  private handleResume(): void {
    if (this.resumeTimeout) {
      clearTimeout(this.resumeTimeout)
      this.resumeTimeout = null
    }

    const now = Date.now()
    const suspendedAt = this.suspendedOrLockedAt
    this.suspendedOrLockedAt = null
    this.idleStartedAt = null

    let awayDurationMs = suspendedAt ? Math.max(0, now - suspendedAt) : 0
    // Fallback: check time elapsed since last timer tick if suspendedAt was not captured
    if (!suspendedAt && this.lastTickTime) {
      const elapsedSinceTick = now - this.lastTickTime
      if (elapsedSinceTick > 2 * 60 * 1000) {
        awayDurationMs = elapsedSinceTick
      }
    }

    this.ensureBlockStarted()

    // Additional fallback: if awayDurationMs is 0, but current block start is inordinately long ago
    if (!awayDurationMs && this.currentBlockStartedAt) {
      const elapsedSinceBlockStart = now - this.currentBlockStartedAt
      if (elapsedSinceBlockStart >= this.frequencyMinutes * 60 * 1000 * 2) {
        awayDurationMs = elapsedSinceBlockStart
      }
    }

    const isDifferentDay = this.isDifferentDay(this.currentBlockStartedAt, now)
    const fullIntervalMs = this.frequencyMinutes * 60 * 1000
    const isExtendedAbsence =
      awayDurationMs >= fullIntervalMs || (isDifferentDay && awayDurationMs > 30 * 60 * 1000)

    if (isExtendedAbsence) {
      logger.info(
        'scheduler',
        `Extended absence detected (${Math.round(awayDurationMs / 60000)} min, differentDay: ${isDifferentDay}). Resetting block start.`
      )
      this.currentBlockStartedAt = now
      this.breakNudgeStartEpoch = 0
      this.breakNudgeCount = 0
      this.lastBreakNudgeEpoch = 0
      this.rescheduleNextPrompt()
      this.isPendingPrompt = false
      if (isPromptVisible()) {
        hidePromptWindow()
      }
    } else if (awayDurationMs > 0) {
      // Pause (< interval): shift currentBlockStartedAt and nextPromptTime forward so pause isn't counted as work,
      // while preserving work already accumulated during this interval
      logger.debug(
        'scheduler',
        `Pause detected (${Math.round(awayDurationMs / 1000)}s). Shifting timestamps forward.`
      )
      this.currentBlockStartedAt = Math.min(now, this.currentBlockStartedAt + awayDurationMs)
      this.nextPromptTime += awayDurationMs
    }

    this.startTimer()

    // Use grace period for triggering prompt if prompt was pending or due
    this.resumeTimeout = setTimeout(() => {
      this.resumeTimeout = null
      if (this.isPendingPrompt) {
        logger.info('scheduler', 'Pending prompt on resume, triggering')
        this.tryTriggerPrompt()
      } else if (Date.now() > this.nextPromptTime) {
        this.tryTriggerPrompt()
      }
    }, this.gracePeriodMs)
  }
}
