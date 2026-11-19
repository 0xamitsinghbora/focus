import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { powerMonitor, BrowserWindow, ipcMain, Notification } from 'electron'
import os from 'os'
import path from 'path'
import fs from 'fs'
import { DataManager } from '../dataManager'
import { ReminderScheduler } from '../scheduler'
import * as promptModule from '../windows/prompt'
import { LogEntry, IpcChannels } from '../../shared/types'

let registeredDismissHandler: (() => void) | null = null
let mockWidgetWin: any = null

vi.mock('../windows/widget', () => ({
  getWidgetWindow: vi.fn(() => mockWidgetWin)
}))

vi.mock('../windows/prompt', () => ({
  getPromptWindow: vi.fn(() => null),
  showPromptWindow: vi.fn(),
  hidePromptWindow: vi.fn(),
  createPromptWindow: vi.fn(),
  isPromptVisible: vi.fn(() => false),
  setPromptSnoozeHandler: vi.fn(),
  onPromptDismiss: vi.fn((handler: () => void) => {
    registeredDismissHandler = handler
    return () => {
      if (registeredDismissHandler === handler) {
        registeredDismissHandler = null
      }
    }
  })
}))

let testDir: string
let dm: DataManager
let scheduler: ReminderScheduler

beforeEach(() => {
  testDir = path.join(
    os.tmpdir(),
    `focus-scheduler-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  )
  fs.mkdirSync(testDir, { recursive: true })
  vi.stubEnv('FOCUS_TEST_USER_DATA', testDir)

  dm = new DataManager()
  scheduler = new ReminderScheduler(dm)
})

afterEach(() => {
  if (scheduler) scheduler.stopTimer()
  if (dm) dm.getDb().close()
  try {
    fs.rmSync(testDir, { recursive: true, force: true })
  } catch {}
  vi.restoreAllMocks()
})

describe('ReminderScheduler — Status & Timing', () => {
  it('initializes with default status and valid timestamps', () => {
    const status = scheduler.getStatus()
    expect(status.intervalMinutes).toBe(45)
    expect(status.isPendingPrompt).toBe(false)
    expect(new Date(status.currentBlockStartedAt).getTime()).toBeGreaterThan(0)
    expect(new Date(status.nextPromptTime).getTime()).toBeGreaterThan(Date.now())
  })

  it('updates nextPromptTime and interval when settings change', () => {
    const originalNext = new Date(scheduler.getStatus().nextPromptTime).getTime()

    scheduler.setSettings({
      ...scheduler.getSettings(),
      reminderIntervalMinutes: 20
    })

    const newStatus = scheduler.getStatus()
    expect(newStatus.intervalMinutes).toBe(20)
    const newNext = new Date(newStatus.nextPromptTime).getTime()
    expect(newNext).toBeLessThan(originalNext)
  })

  it('updates lastUpdated timestamp when updateTimestamp is true', () => {
    const before = Date.now()
    scheduler.setSettings(
      {
        ...scheduler.getSettings(),
        reminderIntervalMinutes: 15
      },
      true
    )

    const s = scheduler.getSettings()
    expect(s.lastUpdated).toBeGreaterThanOrEqual(before)
  })

  it('preserves existing lastUpdated when updateTimestamp is false', () => {
    const fixedTime = 123456789
    scheduler.setSettings(
      {
        ...scheduler.getSettings(),
        lastUpdated: fixedTime
      },
      false
    )

    const s = scheduler.getSettings()
    expect(s.lastUpdated).toBe(fixedTime)
  })

  it('does not reschedule nextPromptTime or reset isPendingPrompt when reminderIntervalMinutes is unchanged', () => {
    vi.useFakeTimers()
    const baseTime = Date.now()
    vi.setSystemTime(baseTime)

    scheduler.stopTimer()
    scheduler = new ReminderScheduler(dm)
    scheduler.setSettings({
      ...scheduler.getSettings(),
      reminderIntervalMinutes: 30
    })

    const initialStatus = scheduler.getStatus()
    const scheduledNextTime = new Date(initialStatus.nextPromptTime).getTime()

    // Advance 28 minutes into the 30-minute block
    vi.advanceTimersByTime(28 * 60 * 1000)

    // Save settings that do not change reminderIntervalMinutes (e.g., theme or UI state)
    scheduler.setSettings({
      ...scheduler.getSettings(),
      theme: 'dark'
    })

    const statusAfterSave = scheduler.getStatus()
    // nextPromptTime must NOT have been pushed 30 minutes into the future
    expect(new Date(statusAfterSave.nextPromptTime).getTime()).toBe(scheduledNextTime)

    vi.useRealTimers()
  })

  it('preserves isPendingPrompt when settings update without interval change', () => {
    scheduler.stopTimer()
    scheduler = new ReminderScheduler(dm)

    ;(scheduler as any).isPendingPrompt = true

    scheduler.setSettings({
      ...scheduler.getSettings(),
      theme: 'light'
    })

    expect(scheduler.getStatus().isPendingPrompt).toBe(true)
  })
})

describe('ReminderScheduler — enrichLogWithCurrentBlock', () => {
  it('calculates duration and productiveMinutes for productive block', () => {
    vi.useFakeTimers()
    const baseTime = Date.now()
    vi.setSystemTime(baseTime)

    scheduler.stopTimer()
    scheduler = new ReminderScheduler(dm)

    vi.advanceTimersByTime(30 * 60 * 1000)

    const rawEntry = {
      id: 'log-1',
      text: 'Coding feature',
      productivity: 'productive' as const
    } as LogEntry

    const enriched = scheduler.enrichLogWithCurrentBlock(rawEntry)
    expect(enriched.durationMinutes).toBe(30)
    expect(enriched.productiveMinutes).toBe(30)
    expect(enriched.startedAt).toBe(new Date(baseTime).toISOString())
    expect(enriched.endedAt).toBe(new Date(baseTime + 30 * 60 * 1000).toISOString())
    expect(enriched.timestamp).toBe(new Date(baseTime + 30 * 60 * 1000).toISOString())

    vi.useRealTimers()
  })

  it('sets productiveMinutes to 0 when productivity is break or non-productive', () => {
    vi.useFakeTimers()
    const baseTime = Date.now()
    vi.setSystemTime(baseTime)

    scheduler.stopTimer()
    scheduler = new ReminderScheduler(dm)

    vi.advanceTimersByTime(25 * 60 * 1000)

    const breakEntry = {
      id: 'log-break',
      text: 'Coffee break',
      productivity: 'break' as const
    } as LogEntry

    const enrichedBreak = scheduler.enrichLogWithCurrentBlock(breakEntry)
    expect(enrichedBreak.durationMinutes).toBe(25)
    expect(enrichedBreak.productiveMinutes).toBe(0)

    const customBreakEntry = {
      id: 'log-other',
      text: 'Non-productive time',
      productivity: 'break' as const
    } as LogEntry

    const enrichedOther = scheduler.enrichLogWithCurrentBlock(customBreakEntry)
    expect(enrichedOther.durationMinutes).toBe(25)
    expect(enrichedOther.productiveMinutes).toBe(0)

    vi.useRealTimers()
  })

  it('preserves existing durationMinutes and productiveMinutes if explicitly specified', () => {
    const customEntry: LogEntry = {
      id: 'log-custom',
      text: 'Manual entry',
      durationMinutes: 12,
      productiveMinutes: 10,
      timestamp: '2026-03-01T12:00:00Z',
      startedAt: '2026-03-01T11:48:00Z',
      endedAt: '2026-03-01T12:00:00Z'
    }

    const enriched = scheduler.enrichLogWithCurrentBlock(customEntry)
    expect(enriched.durationMinutes).toBe(12)
    expect(enriched.productiveMinutes).toBe(10)
    expect(enriched.timestamp).toBe('2026-03-01T12:00:00Z')
    expect(enriched.startedAt).toBe('2026-03-01T11:48:00Z')
    expect(enriched.endedAt).toBe('2026-03-01T12:00:00Z')
  })

  it('subtracts idle time from duration when user is system idle without locking screen', () => {
    vi.useFakeTimers()
    const baseTime = new Date('2026-03-01T10:00:00Z').getTime()
    vi.setSystemTime(baseTime)

    scheduler.stopTimer()
    scheduler = new ReminderScheduler(dm)
    scheduler.getStatus()

    // 30 mins elapsed, of which 20 mins were idle
    vi.advanceTimersByTime(30 * 60 * 1000)
    vi.spyOn(powerMonitor, 'getSystemIdleTime').mockReturnValue(20 * 60)

    const entry = { id: 'idle-log', text: 'Work with idle' } as LogEntry
    const enriched = scheduler.enrichLogWithCurrentBlock(entry)

    // Total 30 mins elapsed minus 20 mins idle = 10 mins duration
    expect(enriched.durationMinutes).toBe(10)
    expect(enriched.productiveMinutes).toBe(10)

    vi.useRealTimers()
  })

  it('caps duration when check-in prompt is left open for an extended dwell time', () => {
    vi.useFakeTimers()
    const baseTime = new Date('2026-03-01T10:00:00Z').getTime()
    vi.setSystemTime(baseTime)
    vi.spyOn(powerMonitor, 'getSystemIdleTime').mockReturnValue(0)

    scheduler.stopTimer()
    scheduler = new ReminderScheduler(dm)
    ;(scheduler as any).currentBlockStartedAt = baseTime

    // Advance 20 minutes to prompt trigger time (10:20)
    vi.advanceTimersByTime(20 * 60 * 1000)
    ;(scheduler as any).promptTriggeredAt = Date.now() // Prompt opens at 10:20

    // User leaves prompt open for 45 minutes while doing other tasks (now 11:05)
    vi.advanceTimersByTime(45 * 60 * 1000)

    const rawEntry = { id: 'dwell-log', text: 'Completed design doc' } as LogEntry
    const enriched = scheduler.enrichLogWithCurrentBlock(rawEntry)

    // Duration should be capped to 22 minutes (20m block + 2m max response grace), NOT 65 minutes
    expect(enriched.durationMinutes).toBe(22)
    expect(enriched.productiveMinutes).toBe(22)

    // And unattended dwell time (43 minutes) is counted as break
    const unattendedBreak = scheduler.consumeUnattendedBreak()
    expect(unattendedBreak).not.toBeNull()
    expect(unattendedBreak?.productivity).toBe('break')
    expect(unattendedBreak?.text).toBe('Break')
    expect(unattendedBreak?.durationMinutes).toBe(43)
    expect(unattendedBreak?.productiveMinutes).toBe(0)
    // Consuming a second time returns null
    expect(scheduler.consumeUnattendedBreak()).toBeNull()

    vi.useRealTimers()
  })

  it('counts unanswered overtime as break when user did not select what they did for 17 minutes', () => {
    vi.useFakeTimers()
    const baseTime = new Date('2026-11-05T14:00:00').getTime()
    vi.setSystemTime(baseTime)

    scheduler.stopTimer()
    scheduler = new ReminderScheduler(dm)
    scheduler.getStatus() // currentBlockStartedAt = 14:00

    // Focus session completes at 25 minutes (14:25)
    vi.advanceTimersByTime(25 * 60 * 1000)
    scheduler.notifyPromptTriggered() // promptTriggeredAt = 14:25

    // User is away for 17 minutes (now 14:42)
    vi.advanceTimersByTime(17 * 60 * 1000)

    const rawEntry = { id: 'goal-work', text: 'Important Feature' } as LogEntry
    const enriched = scheduler.enrichLogWithCurrentBlock(rawEntry)

    // Work is capped at 25m + 2m grace = 27m
    expect(enriched.durationMinutes).toBe(27)
    expect(enriched.productiveMinutes).toBe(27)

    // Unattended 15 minutes is captured as a break entry
    const breakLog = scheduler.consumeUnattendedBreak()
    expect(breakLog).not.toBeNull()
    expect(breakLog?.productivity).toBe('break')
    expect(breakLog?.durationMinutes).toBe(15)
    expect(breakLog?.productiveMinutes).toBe(0)

    // When resetBlockAndTimer is called, onResetSession callback fires
    const onResetSpy = vi.fn()
    scheduler.setOnResetSession(onResetSpy)
    scheduler.resetBlockAndTimer()
    expect(onResetSpy).toHaveBeenCalledTimes(1)

    vi.useRealTimers()
  })

  it('preserves work session duration across midnight day rollover', () => {
    vi.useFakeTimers()
    // 11:45 PM on 2026-10-29
    const nightTime = new Date('2026-10-29T23:45:00').getTime()
    vi.setSystemTime(nightTime)

    scheduler.stopTimer()
    scheduler = new ReminderScheduler(dm)
    scheduler.getStatus() // initializes currentBlockStartedAt to 23:45

    // Work for 20 minutes across midnight to 12:05 AM on 2026-10-30
    vi.advanceTimersByTime(20 * 60 * 1000)

    const rawEntry = {
      id: 'midnight-work',
      text: 'Working late night across midnight',
      productivity: 'productive' as const
    } as LogEntry

    const enriched = scheduler.enrichLogWithCurrentBlock(rawEntry)
    // Duration MUST be 20 minutes, NOT 0!
    expect(enriched.durationMinutes).toBe(20)
    expect(enriched.productiveMinutes).toBe(20)

    vi.useRealTimers()
  })

  it('resets next prompt timer and clears pending prompt even if resetBlockAndTimer is invoked sub-second', () => {
    vi.useFakeTimers()
    const baseTime = Date.now()
    vi.setSystemTime(baseTime)

    scheduler.stopTimer()
    scheduler = new ReminderScheduler(dm)
    scheduler.getStatus()

    // Mark prompt as pending
    ;(scheduler as any).isPendingPrompt = true
    ;(scheduler as any).nextPromptTime = baseTime - 1000 // In the past

    // Call resetBlockAndTimer 50ms after block started
    vi.advanceTimersByTime(50)
    scheduler.resetBlockAndTimer()

    const status = scheduler.getStatus()
    expect(status.isPendingPrompt).toBe(false)
    expect(new Date(status.nextPromptTime).getTime()).toBeGreaterThan(baseTime)

    vi.useRealTimers()
  })

  it('debounces duplicate resetBlockAndTimer calls within the same tick when not pending prompt', () => {
    vi.useFakeTimers()
    const baseTime = Date.now()
    vi.setSystemTime(baseTime)

    scheduler.stopTimer()
    scheduler = new ReminderScheduler(dm)
    scheduler.resetBlockAndTimer()
    const firstStatus = scheduler.getStatus()

    // Rapid second call 10ms later (e.g. between AppendLog and RemindSubmit)
    vi.advanceTimersByTime(10)
    scheduler.resetBlockAndTimer()
    const secondStatus = scheduler.getStatus()

    // Next prompt time should remain from first call and not be bumped again
    expect(secondStatus.nextPromptTime).toBe(firstStatus.nextPromptTime)

    vi.useRealTimers()
  })

  it('preserves work block across midnight when night-owl dayCutoffHour is configured', () => {
    vi.useFakeTimers()
    // Configure dayCutoffHour: 4 (4:00 AM)
    vi.spyOn(dm, 'getSettings').mockReturnValue({
      reminderIntervalMinutes: 45,
      openAtLogin: true,
      dayCutoffHour: 4
    })

    // Start block at 11:45 PM on April 15
    const startLate = new Date(2026, 3, 15, 23, 45).getTime()
    vi.setSystemTime(startLate)
    scheduler.stopTimer()
    scheduler = new ReminderScheduler(dm)

    // Complete check-in at 12:15 AM on April 16 (30 mins later)
    const endPastMidnight = new Date(2026, 3, 16, 0, 15).getTime()
    vi.setSystemTime(endPastMidnight)

    const rawEntry = { id: 'midnight-entry', text: 'Late night focus' } as LogEntry
    const enriched = scheduler.enrichLogWithCurrentBlock(rawEntry)

    // Should NOT reset block start because cutoff is 4 AM (same day)
    expect(enriched.durationMinutes).toBe(30)
    expect(enriched.productiveMinutes).toBe(30)

    vi.useRealTimers()
  })
})

describe('ReminderScheduler — Idle & Prompt Triggering', () => {
  it('triggers prompt window when user is active and time has elapsed', () => {
    vi.useFakeTimers()
    const baseTime = Date.now()
    vi.setSystemTime(baseTime)

    scheduler.stopTimer()
    scheduler = new ReminderScheduler(dm)

    vi.spyOn(powerMonitor, 'getSystemIdleState').mockReturnValue('active')
    vi.advanceTimersByTime(46 * 60 * 1000)

    expect(promptModule.showPromptWindow).toHaveBeenCalled()
    expect(scheduler.getStatus().isPendingPrompt).toBe(false)

    vi.useRealTimers()
  })

  it('does not re-trigger prompt window when prompt is already visible', () => {
    vi.useFakeTimers()
    const baseTime = Date.now()
    vi.setSystemTime(baseTime)

    scheduler.stopTimer()
    scheduler = new ReminderScheduler(dm)

    vi.spyOn(powerMonitor, 'getSystemIdleState').mockReturnValue('active')
    vi.mocked(promptModule.isPromptVisible).mockReturnValue(true)

    vi.advanceTimersByTime(46 * 60 * 1000)

    expect(promptModule.showPromptWindow).not.toHaveBeenCalled()
    expect(scheduler.getStatus().isPendingPrompt).toBe(false)

    vi.mocked(promptModule.isPromptVisible).mockReturnValue(false)
    vi.useRealTimers()
  })

  it('defers prompt when user is idle', () => {
    vi.useFakeTimers()
    const baseTime = Date.now()
    vi.setSystemTime(baseTime)

    scheduler.stopTimer()
    scheduler = new ReminderScheduler(dm)

    vi.spyOn(powerMonitor, 'getSystemIdleState').mockReturnValue('idle')
    vi.advanceTimersByTime(46 * 60 * 1000)

    expect(promptModule.showPromptWindow).not.toHaveBeenCalled()
    expect(scheduler.getStatus().isPendingPrompt).toBe(true)

    vi.useRealTimers()
  })

  it('triggers prompt once user returns from idle state', () => {
    vi.useFakeTimers()
    const baseTime = Date.now()
    vi.setSystemTime(baseTime)

    scheduler.stopTimer()
    scheduler = new ReminderScheduler(dm)

    const idleSpy = vi.spyOn(powerMonitor, 'getSystemIdleState').mockReturnValue('idle')
    vi.advanceTimersByTime(46 * 60 * 1000)

    expect(promptModule.showPromptWindow).not.toHaveBeenCalled()
    expect(scheduler.getStatus().isPendingPrompt).toBe(true)

    idleSpy.mockReturnValue('active')
    vi.advanceTimersByTime(60 * 1000)

    expect(promptModule.showPromptWindow).toHaveBeenCalled()

    vi.useRealTimers()
  })

  it('does not re-trigger prompt 60 seconds later when prompt was dismissed without IPC (prevents 60-second nag loop)', () => {
    vi.useFakeTimers()
    const baseTime = Date.now()
    vi.setSystemTime(baseTime)

    scheduler.stopTimer()
    scheduler = new ReminderScheduler(dm)

    vi.spyOn(powerMonitor, 'getSystemIdleState').mockReturnValue('active')
    vi.advanceTimersByTime(46 * 60 * 1000)

    expect(promptModule.showPromptWindow).toHaveBeenCalledTimes(1)

    // Triggered at 45m tick, so nextPromptTime is rescheduled to 45m + 45m = 90m
    const expectedNextPrompt = baseTime + 90 * 60 * 1000
    expect(new Date(scheduler.getStatus().nextPromptTime).getTime()).toBe(expectedNextPrompt)

    // Advance 60 seconds later — window was closed/dismissed without IPC
    vi.advanceTimersByTime(60 * 1000)
    expect(promptModule.showPromptWindow).toHaveBeenCalledTimes(1)

    // Advance another 60 seconds later
    vi.advanceTimersByTime(60 * 1000)
    expect(promptModule.showPromptWindow).toHaveBeenCalledTimes(1)

    // Advance 30 minutes later
    vi.advanceTimersByTime(30 * 60 * 1000)
    expect(promptModule.showPromptWindow).toHaveBeenCalledTimes(1)

    vi.useRealTimers()
  })

  it('preserves work interval duration and snoozes timer when prompt is dismissed externally', () => {
    vi.useFakeTimers()
    const baseTime = Date.now()
    vi.setSystemTime(baseTime)

    scheduler.stopTimer()
    scheduler = new ReminderScheduler(dm)

    vi.spyOn(powerMonitor, 'getSystemIdleState').mockReturnValue('active')
    vi.advanceTimersByTime(46 * 60 * 1000)
    expect(promptModule.showPromptWindow).toHaveBeenCalledTimes(1)

    // 5 minutes later, user presses Alt+F4 / dismisses the prompt
    vi.advanceTimersByTime(5 * 60 * 1000)
    const dismissTime = Date.now()

    expect(registeredDismissHandler).toBeDefined()
    registeredDismissHandler!()

    // currentBlockStartedAt must be preserved from the original block start (baseTime)
    // and nextPromptTime must be snoozed (5 minutes from dismissTime)
    const status = scheduler.getStatus()
    expect(new Date(status.currentBlockStartedAt).getTime()).toBe(baseTime)
    expect(new Date(status.nextPromptTime).getTime()).toBe(dismissTime + 5 * 60 * 1000)

    vi.useRealTimers()
  })

  it('gracefully handles powerMonitor.getSystemIdleState throwing or being unavailable', () => {
    vi.useFakeTimers()
    const baseTime = Date.now()
    vi.setSystemTime(baseTime)

    scheduler.stopTimer()
    scheduler = new ReminderScheduler(dm)

    vi.spyOn(powerMonitor, 'getSystemIdleState').mockImplementation(() => {
      throw new Error('Platform does not support idle state detection')
    })

    vi.advanceTimersByTime(46 * 60 * 1000)
    expect(promptModule.showPromptWindow).toHaveBeenCalledTimes(1)

    vi.useRealTimers()
  })
})

describe('ReminderScheduler — Timer Start & Stop', () => {
  it('stops timer cleanly and prevents duplicate intervals', () => {
    scheduler.startTimer()
    const interval1 = (scheduler as any).intervalId
    expect(interval1).toBeDefined()

    scheduler.startTimer()
    expect((scheduler as any).intervalId).toBe(interval1)

    scheduler.stopTimer()
    expect((scheduler as any).intervalId).toBeNull()
  })
})

describe('ReminderScheduler — Power Monitor & IPC Events', () => {
  it('resets block and timer when resetBlockAndTimer is invoked', () => {
    vi.useFakeTimers()
    const baseTime = Date.now()
    vi.setSystemTime(baseTime)

    scheduler.stopTimer()
    scheduler = new ReminderScheduler(dm)

    vi.advanceTimersByTime(20 * 60 * 1000)
    const oldBlockStart = new Date(scheduler.getStatus().currentBlockStartedAt).getTime()

    ;(scheduler as any).resetBlockAndTimer()

    const newBlockStart = new Date(scheduler.getStatus().currentBlockStartedAt).getTime()
    expect(newBlockStart).toBeGreaterThan(oldBlockStart)

    vi.useRealTimers()
  })

  it('prevents phantom productive hours when user locks workstation for a 2-hour lunch on the same day', () => {
    vi.useFakeTimers()
    // Set base time to 12:00 PM today (2026-10-29T12:00:00)
    const baseTime = new Date('2026-10-29T12:00:00').getTime()
    vi.setSystemTime(baseTime)

    scheduler.stopTimer()
    scheduler = new ReminderScheduler(dm)
    scheduler.setSettings({
      ...scheduler.getSettings(),
      reminderIntervalMinutes: 15
    })

    // At 12:00 PM, block starts at 12:00 PM
    expect(new Date(scheduler.getStatus().currentBlockStartedAt).getTime()).toBe(baseTime)

    // User locks screen at 12:00 PM for lunch
    ;(powerMonitor as any).emit('lock-screen')

    // 2 hours pass (lunch until 2:00 PM)
    vi.advanceTimersByTime(2 * 60 * 60 * 1000)
    expect(Date.now()).toBe(baseTime + 2 * 60 * 60 * 1000)

    // User unlocks screen at 2:00 PM
    ;(powerMonitor as any).emit('unlock-screen')

    // currentBlockStartedAt must be reset to 2:00 PM immediately
    const statusAtResume = scheduler.getStatus()
    expect(new Date(statusAtResume.currentBlockStartedAt).getTime()).toBe(Date.now())
    expect(statusAtResume.isPendingPrompt).toBe(false)
    expect(new Date(statusAtResume.nextPromptTime).getTime()).toBe(Date.now() + 15 * 60 * 1000)

    // User works from 2:00 PM to 2:15 PM (15 minutes)
    vi.advanceTimersByTime(15 * 60 * 1000)
    vi.spyOn(powerMonitor, 'getSystemIdleState').mockReturnValue('active')

    // Prompt fires at 2:15 PM
    const rawEntry = {
      id: 'log-lunch-test',
      text: 'Afternoon task',
      productivity: 'productive' as const
    } as LogEntry

    const enriched = scheduler.enrichLogWithCurrentBlock(rawEntry)
    // Duration MUST be 15 minutes, NOT 135 minutes!
    expect(enriched.durationMinutes).toBe(15)
    expect(enriched.productiveMinutes).toBe(15)

    vi.useRealTimers()
  })

  it('prevents phantom productive hours when system suspends for 2 hours on the same day', () => {
    vi.useFakeTimers()
    const baseTime = new Date('2026-10-29T12:00:00').getTime()
    vi.setSystemTime(baseTime)

    scheduler.stopTimer()
    scheduler = new ReminderScheduler(dm)
    scheduler.setSettings({
      ...scheduler.getSettings(),
      reminderIntervalMinutes: 15
    })

    // System suspends at 12:00 PM
    ;(powerMonitor as any).emit('suspend')

    // 2 hours pass while suspended
    vi.advanceTimersByTime(2 * 60 * 60 * 1000)

    // System resumes at 2:00 PM
    ;(powerMonitor as any).emit('resume')

    const statusAtResume = scheduler.getStatus()
    expect(new Date(statusAtResume.currentBlockStartedAt).getTime()).toBe(Date.now())
    expect(statusAtResume.isPendingPrompt).toBe(false)

    // User works for 15 minutes until prompt
    vi.advanceTimersByTime(15 * 60 * 1000)
    vi.spyOn(powerMonitor, 'getSystemIdleState').mockReturnValue('active')

    const rawEntry = {
      id: 'log-suspend-test',
      text: 'Resumed coding',
      productivity: 'productive' as const
    } as LogEntry

    const enriched = scheduler.enrichLogWithCurrentBlock(rawEntry)
    expect(enriched.durationMinutes).toBe(15)
    expect(enriched.productiveMinutes).toBe(15)

    vi.useRealTimers()
  })

  it('shifts timestamps forward on brief screen lock (< 5 min) without destroying the active block', () => {
    vi.useFakeTimers()
    const baseTime = new Date('2026-10-29T10:00:00').getTime()
    vi.setSystemTime(baseTime)

    scheduler.stopTimer()
    scheduler = new ReminderScheduler(dm)
    scheduler.setSettings({
      ...scheduler.getSettings(),
      reminderIntervalMinutes: 45
    })

    // Advance 20 minutes into the 45-minute block
    vi.advanceTimersByTime(20 * 60 * 1000)

    // User locks screen for 60 seconds (e.g. water break)
    ;(powerMonitor as any).emit('lock-screen')
    vi.advanceTimersByTime(60 * 1000)
    ;(powerMonitor as any).emit('unlock-screen')

    const statusAfterUnlock = scheduler.getStatus()
    // currentBlockStartedAt must be shifted forward by 60s (baseTime + 60s) so the break is not counted as work
    expect(new Date(statusAfterUnlock.currentBlockStartedAt).getTime()).toBe(baseTime + 60 * 1000)
    // nextPromptTime shifted forward by 60s
    expect(new Date(statusAfterUnlock.nextPromptTime).getTime()).toBe(
      baseTime + 45 * 60 * 1000 + 60 * 1000
    )

    // Finish the remaining block (25 minutes)
    vi.advanceTimersByTime(25 * 60 * 1000)

    const rawEntry = {
      id: 'log-brief-pause',
      text: 'Deep work with brief pause',
      productivity: 'productive' as const
    } as LogEntry

    const enriched = scheduler.enrichLogWithCurrentBlock(rawEntry)
    // 20 min before pause + 25 min after pause = 45 min work (excluding 60s pause)
    expect(enriched.durationMinutes).toBe(45)

    vi.useRealTimers()
  })

  it('respects 30s resume grace period and prevents 15s checkTimer from prematurely triggering prompt', () => {
    vi.useFakeTimers()
    const baseTime = new Date('2026-10-29T10:00:00').getTime()
    vi.setSystemTime(baseTime)

    scheduler.stopTimer()
    scheduler = new ReminderScheduler(dm)
    vi.mocked(promptModule.showPromptWindow).mockClear()

    // User is idle when prompt becomes due -> isPendingPrompt becomes true
    vi.spyOn(powerMonitor, 'getSystemIdleState').mockReturnValue('idle')
    vi.advanceTimersByTime(46 * 60 * 1000)
    expect(scheduler.getStatus().isPendingPrompt).toBe(true)
    expect(promptModule.showPromptWindow).not.toHaveBeenCalled()

    // Screen locked for 60 seconds (brief pause)
    ;(powerMonitor as any).emit('lock-screen')
    vi.advanceTimersByTime(60 * 1000)

    // User returns and unlocks screen
    vi.spyOn(powerMonitor, 'getSystemIdleState').mockReturnValue('active')
    ;(powerMonitor as any).emit('unlock-screen')
    expect(scheduler.getStatus().isPendingPrompt).toBe(true)

    // At 15 seconds, checkTimer interval fires
    vi.advanceTimersByTime(15 * 1000)
    // Should NOT trigger prompt yet because 30s grace period is active
    expect(promptModule.showPromptWindow).not.toHaveBeenCalled()

    // At 30 seconds, resume grace period expires and triggers prompt
    vi.advanceTimersByTime(15 * 1000)
    expect(promptModule.showPromptWindow).toHaveBeenCalledTimes(1)

    vi.useRealTimers()
  })

  it('resets block start when resuming on a different calendar day', () => {
    vi.useFakeTimers()
    const nightTime = new Date('2026-10-29T23:30:00').getTime()
    vi.setSystemTime(nightTime)

    scheduler.stopTimer()
    scheduler = new ReminderScheduler(dm)

    ;(powerMonitor as any).emit('suspend')

    // Advance to next morning (9:00 AM on 2026-10-30)
    const morningTime = new Date('2026-10-30T09:00:00').getTime()
    vi.setSystemTime(morningTime)

    ;(powerMonitor as any).emit('resume')

    const status = scheduler.getStatus()
    expect(new Date(status.currentBlockStartedAt).getTime()).toBe(morningTime)

    vi.useRealTimers()
  })

  it('detects unnotified sleep/standby drift without powerMonitor event and synthesizes resume', () => {
    vi.useFakeTimers()
    const baseTime = new Date('2026-10-29T12:00:00').getTime()
    vi.setSystemTime(baseTime)

    scheduler.stopTimer()
    scheduler = new ReminderScheduler(dm)
    scheduler.setSettings({
      reminderIntervalMinutes: 20,
      openAtLogin: false
    })

    // Advance 15 seconds normally
    vi.advanceTimersByTime(15 * 1000)

    // Simulate Modern Standby: 2 hours pass with no timer ticks and NO powerMonitor suspend event
    const twoHoursLater = baseTime + 2 * 60 * 60 * 1000
    vi.setSystemTime(twoHoursLater)
    // Advance timers so setInterval fires its next tick
    vi.advanceTimersByTime(15 * 1000)

    // Synthesized resume should have reset block start to wake-up time, avoiding phantom 2-hour productive block
    const status = scheduler.getStatus()
    expect(new Date(status.currentBlockStartedAt).getTime()).toBe(twoHoursLater + 15 * 1000)

    vi.useRealTimers()
  })

  it('prevents phantom productive hours when user is system idle for 2 hours without locking', () => {
    vi.useFakeTimers()
    const baseTime = new Date('2026-10-29T12:00:00').getTime()
    vi.setSystemTime(baseTime)

    scheduler.stopTimer()
    scheduler = new ReminderScheduler(dm)
    scheduler.setSettings({
      ...scheduler.getSettings(),
      reminderIntervalMinutes: 15
    })

    // User steps away from desk at 12:00 PM without locking screen
    vi.spyOn(powerMonitor, 'getSystemIdleTime').mockReturnValue(5 * 60) // 5 minutes idle
    vi.advanceTimersByTime(5 * 60 * 1000)

    // User stays idle for 2 hours
    vi.spyOn(powerMonitor, 'getSystemIdleTime').mockReturnValue(120 * 60) // 2 hours idle
    vi.advanceTimersByTime(115 * 60 * 1000)

    // User returns at 2:00 PM and moves mouse (idle time becomes 0)
    vi.spyOn(powerMonitor, 'getSystemIdleTime').mockReturnValue(0)
    vi.spyOn(powerMonitor, 'getSystemIdleState').mockReturnValue('active')
    vi.advanceTimersByTime(60 * 1000) // Next timer tick

    // Block start must be reset to when user returned
    const statusAfterReturn = scheduler.getStatus()
    expect(new Date(statusAfterReturn.currentBlockStartedAt).getTime()).toBeGreaterThanOrEqual(
      baseTime + 120 * 60 * 1000
    )

    // User works 15 minutes
    vi.advanceTimersByTime(15 * 60 * 1000)
    const rawEntry = {
      id: 'log-idle-return',
      text: 'Post-idle work',
      productivity: 'productive' as const
    } as LogEntry

    const enriched = scheduler.enrichLogWithCurrentBlock(rawEntry)
    // Must be ~15-16 minutes, NOT 135 minutes!
    expect(enriched.durationMinutes).toBeLessThanOrEqual(16)
    expect(enriched.productiveMinutes).toBeLessThanOrEqual(16)

    vi.useRealTimers()
  })

  it('does not double-subtract idle time in enrichLogWithCurrentBlock when idle time was already shifted', () => {
    vi.useFakeTimers()
    const baseTime = new Date('2026-10-29T10:00:00').getTime()
    vi.setSystemTime(baseTime)

    scheduler.stopTimer()
    scheduler = new ReminderScheduler(dm)
    scheduler.setSettings({
      ...scheduler.getSettings(),
      reminderIntervalMinutes: 45
    })

    // Advance 30 minutes
    vi.advanceTimersByTime(30 * 60 * 1000)

    // User returns and powerMonitor reports idle time of 6 minutes (360 seconds),
    // but currentBlockStartedAt was reset or shifted to now - 15m.
    // enrichLogWithCurrentBlock should not subtract 6m if block only started 15m ago.
    vi.spyOn(powerMonitor, 'getSystemIdleTime').mockReturnValue(360)

    const rawEntry = {
      id: 'log-no-double-subtraction',
      text: 'Double subtraction test',
      productivity: 'productive' as const
    } as LogEntry

    const enriched = scheduler.enrichLogWithCurrentBlock(rawEntry)
    // 30 minutes total, with 6 min idle during the block -> 24 minutes duration
    expect(enriched.durationMinutes).toBe(24)

    vi.useRealTimers()
  })

  it('never clamps currentBlockStartedAt into the future', () => {
    vi.useFakeTimers()
    const baseTime = new Date('2026-10-29T10:00:00').getTime()
    vi.setSystemTime(baseTime)

    scheduler.stopTimer()
    scheduler = new ReminderScheduler(dm)

    // Simulate lock and immediate resume with clock skew or large awayDuration
    ;(powerMonitor as any).emit('lock-screen')
    vi.advanceTimersByTime(10 * 1000) // 10s passed
    ;(powerMonitor as any).emit('unlock-screen')

    const status = scheduler.getStatus()
    const blockStartTime = new Date(status.currentBlockStartedAt).getTime()
    expect(blockStartTime).toBeLessThanOrEqual(Date.now())

    vi.useRealTimers()
  })

  describe('Prompt Snooze Functionality', () => {
    it('snooze() postpones nextPromptTime by 5 minutes without resetting currentBlockStartedAt', () => {
      vi.useFakeTimers()
      const baseTime = new Date('2026-03-20T10:00:00Z').getTime()
      vi.setSystemTime(baseTime)

      scheduler.stopTimer()
      scheduler = new ReminderScheduler(dm)
      const initialStatus = scheduler.getStatus()
      const initialBlockStart = initialStatus.currentBlockStartedAt

      // Advance 20 minutes: user has been working for 20 minutes
      vi.advanceTimersByTime(20 * 60 * 1000)

      // Prompt triggers, user snoozes for 5 minutes
      scheduler.snooze(5)

      const statusAfterSnooze = scheduler.getStatus()
      // currentBlockStartedAt must NOT change!
      expect(statusAfterSnooze.currentBlockStartedAt).toBe(initialBlockStart)
      // nextPromptTime must be exactly 5 minutes from now
      expect(new Date(statusAfterSnooze.nextPromptTime).getTime()).toBe(
        baseTime + 20 * 60 * 1000 + 5 * 60 * 1000
      )
      expect(statusAfterSnooze.isPendingPrompt).toBe(false)

      vi.useRealTimers()
    })

    it('snooze(10) custom duration schedules prompt 10 minutes in future', () => {
      vi.useFakeTimers()
      const baseTime = new Date('2026-03-20T10:00:00Z').getTime()
      vi.setSystemTime(baseTime)

      scheduler.stopTimer()
      scheduler = new ReminderScheduler(dm)
      const initialStatus = scheduler.getStatus()

      vi.advanceTimersByTime(20 * 60 * 1000)
      scheduler.snooze(10)

      const status = scheduler.getStatus()
      expect(status.currentBlockStartedAt).toBe(initialStatus.currentBlockStartedAt)
      expect(new Date(status.nextPromptTime).getTime()).toBe(
        baseTime + 20 * 60 * 1000 + 10 * 60 * 1000
      )

      vi.useRealTimers()
    })
  })

  describe('IPC — SetSettings Sender Validation', () => {
    it('rejects SetSettings invocation when sender is not the main window', async () => {
      const mockMainWindow = { isDestroyed: () => false } as any
      const mockOtherWindow = { isDestroyed: () => false } as any
      const mockWebContents = {} as any

      ;(BrowserWindow as any).fromWebContents = vi.fn().mockReturnValue(mockOtherWindow)

      let capturedHandler: any = null
      vi.spyOn(ipcMain, 'handle').mockImplementation(((channel: string, handler: any) => {
        if (channel === IpcChannels.SetSettings) {
          capturedHandler = handler
        }
      }) as any)

      const s = new ReminderScheduler(dm, () => mockMainWindow)

      expect(capturedHandler).toBeDefined()
      expect(() =>
        capturedHandler({ sender: mockWebContents } as any, { theme: 'dark' } as any)
      ).toThrow('Unauthorized IPC sender')

      s.stopTimer()
    })

    it('allows SetSettings invocation when sender is the main window', () => {
      const mockMainWindow = { isDestroyed: () => false } as any
      const mockWebContents = {} as any

      ;(BrowserWindow as any).fromWebContents = vi.fn().mockReturnValue(mockMainWindow)

      let capturedHandler: any = null
      vi.spyOn(ipcMain, 'handle').mockImplementation(((channel: string, handler: any) => {
        if (channel === IpcChannels.SetSettings) {
          capturedHandler = handler
        }
      }) as any)

      const s = new ReminderScheduler(dm, () => mockMainWindow)

      expect(capturedHandler).toBeDefined()
      expect(() =>
        capturedHandler({ sender: mockWebContents } as any, { theme: 'dark' } as any)
      ).not.toThrow()

      expect(dm.getSettings().theme).toBe('dark')
      s.stopTimer()
    })

    it('notifies onSettingsChanged callback on local settings update but not on sync apply', () => {
      const mockMainWindow = { isDestroyed: () => false } as any
      const s = new ReminderScheduler(dm, () => mockMainWindow)
      const onSettingsChanged = vi.fn()
      s.setOnSettingsChanged(onSettingsChanged)

      // Local update (updateTimestamp default = true)
      s.setSettings({ ...dm.getSettings(), reminderIntervalMinutes: 45 })
      expect(onSettingsChanged).toHaveBeenCalledTimes(1)
      expect(onSettingsChanged).toHaveBeenCalledWith(
        expect.objectContaining({ reminderIntervalMinutes: 45 })
      )

      // Remote sync apply (updateTimestamp = false)
      s.setSettings({ ...dm.getSettings(), reminderIntervalMinutes: 20 }, false)
      expect(onSettingsChanged).toHaveBeenCalledTimes(1) // not called again

      s.stopTimer()
    })

    it('rejects SetSettings invocation when main window is null or destroyed', () => {
      let capturedHandler: any = null
      vi.spyOn(ipcMain, 'handle').mockImplementation(((channel: string, handler: any) => {
        if (channel === IpcChannels.SetSettings) {
          capturedHandler = handler
        }
      }) as any)

      // When mainWindow is null
      const sNull = new ReminderScheduler(dm, () => null)
      expect(() => capturedHandler({ sender: {} } as any, { theme: 'dark' } as any)).toThrow(
        'main window unavailable'
      )
      sNull.stopTimer()

      // When mainWindow is destroyed
      const mockDestroyedWindow = { isDestroyed: () => true } as any
      const sDestroyed = new ReminderScheduler(dm, () => mockDestroyedWindow)
      expect(() => capturedHandler({ sender: {} } as any, { theme: 'dark' } as any)).toThrow(
        'main window unavailable'
      )
      sDestroyed.stopTimer()
    })

    it('patches settings atomically via PatchSettings IPC and updates only target fields', async () => {
      let patchHandler: any = null
      const mockMainWindow = { isDestroyed: () => false } as any
      const mockWebContents = { isDestroyed: () => false } as any
      mockMainWindow.webContents = mockWebContents

      ;(BrowserWindow as any).fromWebContents = vi.fn().mockReturnValue(mockMainWindow)

      vi.spyOn(ipcMain, 'handle').mockImplementation(((channel: string, handler: any) => {
        if (channel === IpcChannels.PatchSettings) {
          patchHandler = handler
        }
      }) as any)

      dm.setSettings({
        reminderIntervalMinutes: 30,
        openAtLogin: false,
        theme: 'light',
        collapsedColumns: { planned: true, in_progress: false, done: false }
      })

      const s = new ReminderScheduler(dm, () => mockMainWindow)

      const result = await patchHandler({ sender: mockWebContents } as any, {
        collapsedColumns: { planned: false, in_progress: false, done: false }
      })

      expect(result.collapsedColumns).toEqual({ planned: false, in_progress: false, done: false })
      // Preserves existing fields without clobbering
      expect(result.reminderIntervalMinutes).toBe(30)
      expect(result.theme).toBe('light')

      s.stopTimer()
    })

    it('allows RemindGetStatus invocation from widget window', async () => {
      let statusHandler: any = null
      const mockMainWindow = { isDestroyed: () => false } as any
      const mockWidgetWindow = { isDestroyed: () => false } as any
      const mockWidgetWebContents = { isDestroyed: () => false } as any
      mockWidgetWindow.webContents = mockWidgetWebContents

      mockWidgetWin = mockWidgetWindow
      ;(BrowserWindow as any).fromWebContents = vi.fn().mockReturnValue(mockWidgetWindow)

      vi.spyOn(ipcMain, 'handle').mockImplementation(((channel: string, handler: any) => {
        if (channel === IpcChannels.RemindGetStatus) {
          statusHandler = handler
        }
      }) as any)

      const s = new ReminderScheduler(dm, () => mockMainWindow)

      expect(statusHandler).toBeDefined()
      const status = await statusHandler({ sender: mockWidgetWebContents } as any)
      expect(status).toHaveProperty('nextPromptTime')
      s.stopTimer()
      mockWidgetWin = null
    })
  })

  describe('Midnight Rollover & Deep Focus Continuity', () => {
    it('returns effective midnight rollover state without mutating scheduler instance in getStatus()', () => {
      vi.useFakeTimers()
      const day1 = new Date(2026, 9, 29, 12, 0, 0).getTime()
      vi.setSystemTime(day1)

      scheduler.stopTimer()
      scheduler = new ReminderScheduler(dm)

      // Advance 24 hours into the next calendar day
      const day2 = new Date(2026, 9, 30, 12, 0, 0).getTime()
      vi.setSystemTime(day2)

      const status = scheduler.getStatus()
      expect(new Date(status.currentBlockStartedAt).getTime()).toBe(day2)
      expect(status.isPendingPrompt).toBe(false)
      // Internal state must remain unmutated (getStatus is read-only)
      expect((scheduler as any).currentBlockStartedAt).toBe(day1)

      vi.useRealTimers()
    })

    it('preserves pre-focus unlogged work when deep focus concludes without submit', () => {
      vi.useFakeTimers()
      const baseTime = new Date('2026-10-29T10:00:00Z').getTime()
      vi.setSystemTime(baseTime)

      scheduler.stopTimer()
      scheduler = new ReminderScheduler(dm)

      // User works for 15 minutes in normal flow
      vi.advanceTimersByTime(15 * 60 * 1000)

      // User activates Deep Focus session
      scheduler.updateFocusSession({
        isActive: true,
        isPaused: false,
        isBreak: false,
        isOvertime: false,
        secondsRemaining: 1500,
        totalSeconds: 1500
      })

      // Deep Focus runs for 20 minutes
      vi.advanceTimersByTime(20 * 60 * 1000)

      // Deep Focus concludes without logging/submitting (e.g. user canceled Zen modal)
      scheduler.updateFocusSession({
        isActive: false,
        isPaused: false,
        isBreak: false,
        isOvertime: false,
        secondsRemaining: 0,
        totalSeconds: 1500
      })

      // Current block work should preserve the 15 minutes of pre-focus work
      const rawEntry = {
        id: 'post-deep-focus-test',
        text: 'Pre-focus unlogged work',
        productivity: 'productive' as const
      } as LogEntry

      const enriched = scheduler.enrichLogWithCurrentBlock(rawEntry)
      expect(enriched.durationMinutes).toBe(15)

      vi.useRealTimers()
    })

    it('resets currentBlockStartedAt to now when deep focus finishes if block started at or after deep focus start', () => {
      vi.useFakeTimers()
      const baseTime = new Date('2026-03-20T10:00:00Z').getTime()
      vi.setSystemTime(baseTime)

      dm.setSettings({ reminderIntervalMinutes: 30, openAtLogin: true, dayCutoffHour: 0 })
      scheduler.stopTimer()
      scheduler = new ReminderScheduler(dm)
      scheduler.getStatus()

      // User starts deep focus right as block begins (currentBlockStartedAt == baseTime)
      scheduler.updateFocusSession({
        isActive: true,
        isPaused: false,
        isBreak: false,
        isOvertime: false,
        secondsRemaining: 1500,
        totalSeconds: 1500
      })

      // Advance by 25 minutes
      vi.advanceTimersByTime(25 * 60 * 1000)

      // Deep focus finishes
      scheduler.updateFocusSession({
        isActive: false,
        isPaused: false,
        isBreak: false,
        isOvertime: false,
        secondsRemaining: 0,
        totalSeconds: 1500
      })

      // currentBlockStartedAt must now be reset to current time (baseTime + 25m), NOT left at baseTime
      const status = scheduler.getStatus()
      expect(new Date(status.currentBlockStartedAt).getTime()).toBe(baseTime + 25 * 60 * 1000)

      vi.useRealTimers()
    })

    it('excludes paused time from deep focus duration adjustment', () => {
      vi.useFakeTimers()
      const baseTime = new Date('2026-03-20T10:00:00Z').getTime()
      vi.setSystemTime(baseTime)

      dm.setSettings({ reminderIntervalMinutes: 30, openAtLogin: true, dayCutoffHour: 0 })
      scheduler.stopTimer()
      scheduler = new ReminderScheduler(dm)
      scheduler.getStatus()

      // User works for 15 minutes before Deep Focus
      vi.advanceTimersByTime(15 * 60 * 1000)

      // Deep Focus starts: 10 minutes active, then 10 minutes paused, then 5 minutes active (total 25m real time, 15m active)
      scheduler.updateFocusSession({
        isActive: true,
        isPaused: false,
        isBreak: false,
        isOvertime: false,
        secondsRemaining: 1500,
        totalSeconds: 1500
      })
      vi.advanceTimersByTime(10 * 60 * 1000)

      // User pauses deep focus
      scheduler.updateFocusSession({
        isActive: true,
        isPaused: true,
        isBreak: false,
        isOvertime: false,
        secondsRemaining: 900,
        totalSeconds: 1500
      })
      vi.advanceTimersByTime(10 * 60 * 1000)

      // User resumes deep focus
      scheduler.updateFocusSession({
        isActive: true,
        isPaused: false,
        isBreak: false,
        isOvertime: false,
        secondsRemaining: 900,
        totalSeconds: 1500
      })
      vi.advanceTimersByTime(5 * 60 * 1000)

      // Deep focus finishes
      scheduler.updateFocusSession({
        isActive: false,
        isPaused: false,
        isBreak: false,
        isOvertime: false,
        secondsRemaining: 600,
        totalSeconds: 1500
      })

      // The pre-focus work (15m) should still be preserved
      const rawEntry = {
        id: 'paused-deep-focus-test',
        text: 'Pre-focus unlogged work',
        productivity: 'productive' as const
      } as LogEntry

      const enriched = scheduler.enrichLogWithCurrentBlock(rawEntry)
      expect(enriched.durationMinutes).toBe(15)

      vi.useRealTimers()
    })

    it('restores deep focus start epoch from payload.startedAt when session was already active', () => {
      vi.useFakeTimers()
      const baseTime = new Date('2026-03-20T10:00:00Z').getTime()
      vi.setSystemTime(baseTime)

      dm.setSettings({ reminderIntervalMinutes: 30, openAtLogin: true, dayCutoffHour: 0 })
      scheduler.stopTimer()
      scheduler = new ReminderScheduler(dm)
      scheduler.getStatus()

      // 10 minutes of normal work
      vi.advanceTimersByTime(10 * 60 * 1000)
      const sessionStartedAt = new Date(Date.now()).toISOString()

      // Another 10 minutes pass before app receives/restores session with startedAt
      vi.advanceTimersByTime(10 * 60 * 1000)

      scheduler.updateFocusSession({
        isActive: true,
        isPaused: false,
        isBreak: false,
        isOvertime: false,
        secondsRemaining: 600,
        totalSeconds: 1500,
        startedAt: sessionStartedAt
      })

      // Another 5 minutes of deep focus
      vi.advanceTimersByTime(5 * 60 * 1000)

      // Conclude deep focus (total gross duration = 15m)
      scheduler.updateFocusSession({
        isActive: false,
        isPaused: false,
        isBreak: false,
        isOvertime: false,
        secondsRemaining: 300,
        totalSeconds: 1500
      })

      const rawEntry = {
        id: 'restored-session-test',
        text: 'Pre-focus work',
        productivity: 'productive' as const
      } as LogEntry

      const enriched = scheduler.enrichLogWithCurrentBlock(rawEntry)
      // 10 minutes pre-focus work preserved
      expect(enriched.durationMinutes).toBe(10)

      vi.useRealTimers()
    })

    it('handleResume preserves work block on brief screen lock (< interval) and shifts timestamps forward', () => {
      vi.useFakeTimers()
      const baseTime = new Date('2026-03-20T10:00:00Z').getTime()
      vi.setSystemTime(baseTime)

      dm.setSettings({ reminderIntervalMinutes: 30, openAtLogin: true, dayCutoffHour: 0 })
      scheduler.stopTimer()
      scheduler = new ReminderScheduler(dm)
      scheduler.getStatus()

      // User works for 20 minutes of their 30-minute block
      vi.advanceTimersByTime(20 * 60 * 1000)

      // User locks screen to step away for 8 minutes (< 30m interval, but > 5m idle threshold)
      ;(powerMonitor as any).emit('lock-screen')
      vi.advanceTimersByTime(8 * 60 * 1000)
      ;(powerMonitor as any).emit('unlock-screen')

      // Advance 10 seconds past resume
      vi.advanceTimersByTime(10 * 1000)

      // Work block must preserve the 20 minutes already worked!
      const rawEntry = {
        id: 'lock-resume-test',
        text: 'Work before locking screen',
        productivity: 'productive' as const
      } as LogEntry

      const enriched = scheduler.enrichLogWithCurrentBlock(rawEntry)
      expect(enriched.durationMinutes).toBe(20)

      vi.useRealTimers()
    })

    it('handleResume preserves work block on brief screen lock across midnight rollover', () => {
      vi.useFakeTimers()
      // 11:45 PM on March 20
      const baseTime = new Date('2026-03-20T23:45:00').getTime()
      vi.setSystemTime(baseTime)

      dm.setSettings({ reminderIntervalMinutes: 45, openAtLogin: true, dayCutoffHour: 0 })
      scheduler.stopTimer()
      scheduler = new ReminderScheduler(dm)
      scheduler.getStatus()

      // User works for 10 minutes until 11:55 PM
      vi.advanceTimersByTime(10 * 60 * 1000)

      // User locks screen at 11:55 PM and unlocks at 12:03 AM (8 minutes away, across midnight)
      ;(powerMonitor as any).emit('lock-screen')
      vi.advanceTimersByTime(8 * 60 * 1000)
      ;(powerMonitor as any).emit('unlock-screen')

      // Advance 10 seconds past unlock
      vi.advanceTimersByTime(10 * 1000)

      // The 10 minutes worked before midnight must be preserved!
      const rawEntry = {
        id: 'midnight-lock-test',
        text: 'Work across midnight lock',
        productivity: 'productive' as const
      } as LogEntry

      const enriched = scheduler.enrichLogWithCurrentBlock(rawEntry)
      expect(enriched.durationMinutes).toBe(10)

      vi.useRealTimers()
    })

    it('does not trigger break nudge during an active intentional break countdown', () => {
      vi.useFakeTimers()
      const baseTime = new Date('2026-03-20T10:00:00Z').getTime()
      vi.setSystemTime(baseTime)

      dm.setSettings({ reminderIntervalMinutes: 3, openAtLogin: true, dayCutoffHour: 0 })
      scheduler.stopTimer()
      scheduler = new ReminderScheduler(dm)

      const notificationSpy = vi.spyOn(Notification.prototype, 'show')

      // User starts an intentional 5-minute break
      scheduler.updateFocusSession({
        isActive: true,
        isPaused: false,
        isBreak: true,
        isOvertime: false,
        secondsRemaining: 300,
        totalSeconds: 300
      })

      // Advance by 4 minutes (during active countdown)
      vi.advanceTimersByTime(4 * 60 * 1000)
      expect(notificationSpy).not.toHaveBeenCalled()

      notificationSpy.mockRestore()
      vi.useRealTimers()
    })

    it('triggers escalating break nudge IPC broadcast and window restoration at 2x interval', () => {
      vi.useFakeTimers()
      const baseTime = new Date('2026-03-20T10:00:00Z').getTime()
      vi.setSystemTime(baseTime)

      const mockSend = vi.fn()
      const mockMainWin = {
        isDestroyed: () => false,
        isMinimized: vi.fn().mockReturnValue(true),
        restore: vi.fn(),
        show: vi.fn(),
        focus: vi.fn(),
        webContents: {
          send: mockSend
        }
      } as any

      dm.setSettings({ reminderIntervalMinutes: 5, openAtLogin: true, dayCutoffHour: 0 })
      scheduler.stopTimer()
      scheduler = new ReminderScheduler(dm, () => mockMainWin)

      const notificationSpy = vi.spyOn(Notification.prototype, 'show')

      // User transitions to idle break mode
      scheduler.updateFocusSession({
        isActive: false,
        isPaused: false,
        isBreak: false,
        isOvertime: false,
        secondsRemaining: 0,
        totalSeconds: 0,
        emptyInProgressStartEpoch: baseTime
      })

      // Advance by 10 minutes (2x of 5m interval)
      vi.advanceTimersByTime(10 * 60 * 1000 + 1000)

      expect(notificationSpy).toHaveBeenCalled()
      expect(mockSend).toHaveBeenCalledWith(
        'scheduler:break-nudge',
        expect.objectContaining({
          urgency: 1,
          breakMinutes: 10,
          intervalMinutes: 5
        })
      )

      // Advance by another 5 minutes (3x interval, urgency 2)
      vi.advanceTimersByTime(5 * 60 * 1000 + 1000)

      expect(mockMainWin.restore).toHaveBeenCalled()
      expect(mockMainWin.show).toHaveBeenCalled()
      expect(mockMainWin.focus).toHaveBeenCalled()
      expect(mockSend).toHaveBeenCalledWith(
        'scheduler:break-nudge',
        expect.objectContaining({
          urgency: 2,
          breakMinutes: 15
        })
      )

      notificationSpy.mockRestore()
      vi.useRealTimers()
    })

    it('always triggers break nudges even if legacy settings contain enableBreakNudges: false', () => {
      vi.useFakeTimers()
      const baseTime = new Date('2026-03-20T10:00:00Z').getTime()
      vi.setSystemTime(baseTime)

      const mockSend = vi.fn()
      const mockMainWin = {
        isDestroyed: () => false,
        webContents: { send: mockSend }
      } as any

      dm.setSettings({
        reminderIntervalMinutes: 5,
        openAtLogin: true,
        enableBreakNudges: false
      })
      scheduler.stopTimer()
      scheduler = new ReminderScheduler(dm, () => mockMainWin)

      const notificationSpy = vi.spyOn(Notification.prototype, 'show')

      scheduler.updateFocusSession({
        isActive: false,
        isPaused: false,
        isBreak: false,
        isOvertime: false,
        secondsRemaining: 0,
        totalSeconds: 0,
        emptyInProgressStartEpoch: baseTime
      })

      // Advance 15 minutes
      vi.advanceTimersByTime(15 * 60 * 1000)

      expect(notificationSpy).toHaveBeenCalled()
      expect(mockSend).toHaveBeenCalledWith(
        'scheduler:break-nudge',
        expect.objectContaining({
          urgency: 1,
          breakMinutes: 10,
          intervalMinutes: 5
        })
      )

      notificationSpy.mockRestore()
      vi.useRealTimers()
    })
  })
})
