import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ipcMain } from 'electron'
import { LogsIpcController } from '../LogsIpcController'
import { IpcChannels } from '../../../shared/types'

describe('LogsIpcController', () => {
  let handlers: Record<string, (...args: any[]) => any> = {}
  let controller: LogsIpcController
  let mockDataManager: any
  let mockScheduler: any
  let mockSyncAfterWrite: any
  let mockSecurity: any

  beforeEach(() => {
    handlers = {}
    vi.spyOn(ipcMain, 'handle').mockImplementation((channel: string, handler: any) => {
      handlers[channel] = handler
      return undefined as any
    })
    vi.spyOn(ipcMain, 'removeHandler').mockImplementation((channel: string) => {
      delete handlers[channel]
      return undefined as any
    })

    mockDataManager = {
      getLogs: vi.fn().mockResolvedValue([{ id: 'log-1', text: 'Focus work' }]),
      appendLog: vi.fn().mockResolvedValue(undefined),
      updateLog: vi.fn().mockResolvedValue({ id: 'log-1', text: 'Updated' }),
      deleteLog: vi.fn().mockResolvedValue('2026-10-30'),
      getHeatmapBreakdown: vi.fn().mockResolvedValue({ '2026-10-30': { sessionsCount: 3 } }),
      getDayReview: vi.fn().mockResolvedValue({ totalProductiveMinutes: 90 }),
      getTodayDate: vi.fn().mockReturnValue('2026-10-30'),
      generateTodayGoals: vi.fn().mockResolvedValue([])
    }

    mockScheduler = {
      enrichLogWithCurrentBlock: vi.fn((e) => ({ ...e, durationMinutes: 25 })),
      resetBlockAndTimer: vi.fn()
    }

    mockSyncAfterWrite = vi.fn()

    mockSecurity = {
      assertSenderIsMainWindow: vi.fn(),
      assertSenderIsMainWindowOrPrompt: vi.fn(),
      assertSenderIsAppWindow: vi.fn()
    }

    controller = new LogsIpcController({
      logsRepo: mockDataManager,
      analyticsService: mockDataManager,
      settingsRepo: mockDataManager,
      goalsRepo: mockDataManager,
      scheduler: mockScheduler,
      syncAfterWrite: mockSyncAfterWrite,
      security: mockSecurity
    })
    controller.register()
  })

  afterEach(() => {
    controller.destroy()
    vi.restoreAllMocks()
  })

  it('registers handlers for all expected channels and cleans up on destroy', () => {
    expect(handlers[IpcChannels.GetLogs]).toBeDefined()
    expect(handlers[IpcChannels.AppendLog]).toBeDefined()
    expect(handlers[IpcChannels.UpdateLog]).toBeDefined()
    expect(handlers[IpcChannels.DeleteLog]).toBeDefined()
    expect(handlers[IpcChannels.GetHeatmap]).toBeDefined()
    expect(handlers[IpcChannels.GetDayReview]).toBeDefined()

    controller.destroy()
    expect(handlers[IpcChannels.GetLogs]).toBeUndefined()
    expect(handlers[IpcChannels.AppendLog]).toBeUndefined()
  })

  it('GetLogs calls assertSenderIsAppWindow and returns dataManager logs', async () => {
    const mockEvent = {} as any
    const result = await handlers[IpcChannels.GetLogs](mockEvent, { date: '2026-10-30' })
    expect(mockSecurity.assertSenderIsAppWindow).toHaveBeenCalledWith(mockEvent)
    expect(mockDataManager.getLogs).toHaveBeenCalledWith('2026-10-30')
    expect(result).toEqual([{ id: 'log-1', text: 'Focus work' }])
  })

  it('AppendLog enriches entry and resets timer on checkIn', async () => {
    const mockEvent = {} as any
    const payload = {
      date: '2026-10-30',
      entry: { id: 'entry-1', text: 'Session' } as any,
      isCheckIn: true
    }
    const result = await handlers[IpcChannels.AppendLog](mockEvent, payload)
    expect(mockSecurity.assertSenderIsMainWindowOrPrompt).toHaveBeenCalledWith(mockEvent)
    expect(mockScheduler.enrichLogWithCurrentBlock).toHaveBeenCalledWith(payload.entry)
    expect(mockScheduler.resetBlockAndTimer).toHaveBeenCalled()
    expect(mockSyncAfterWrite).toHaveBeenCalledWith({ logDates: ['2026-10-30'] })
    expect(result).toBeUndefined()
  })

  it('AppendLog appends unattended break when scheduler returns consumeUnattendedBreak', async () => {
    const mockEvent = {} as any
    const breakEntry = {
      id: 'break-1',
      text: 'Break',
      productivity: 'break',
      durationMinutes: 15,
      productiveMinutes: 0
    }
    mockScheduler.consumeUnattendedBreak = vi.fn().mockReturnValue(breakEntry)

    const payload = {
      date: '2026-10-30',
      entry: { id: 'entry-1', text: 'Important task' } as any,
      isCheckIn: true
    }
    await handlers[IpcChannels.AppendLog](mockEvent, payload)
    expect(mockDataManager.appendLog).toHaveBeenCalledWith(
      '2026-10-30',
      expect.objectContaining({ id: 'entry-1' })
    )
    expect(mockDataManager.appendLog).toHaveBeenCalledWith('2026-10-30', breakEntry)
    expect(mockScheduler.resetBlockAndTimer).toHaveBeenCalled()
  })

  it('DeleteLog notifies sync of affected date', async () => {
    const mockEvent = {} as any
    const result = await handlers[IpcChannels.DeleteLog](mockEvent, { id: 'log-1' })
    expect(mockSecurity.assertSenderIsMainWindow).toHaveBeenCalledWith(mockEvent)
    expect(mockDataManager.deleteLog).toHaveBeenCalledWith('log-1')
    expect(mockSyncAfterWrite).toHaveBeenCalledWith({ logDates: ['2026-10-30'] })
    expect(result).toEqual({ success: true })
  })

  it('GetDayReview calls assertSenderIsAppWindow and returns day review data', async () => {
    const mockEvent = {} as any
    const result = await handlers[IpcChannels.GetDayReview](mockEvent, { date: '2026-10-30' })
    expect(mockSecurity.assertSenderIsAppWindow).toHaveBeenCalledWith(mockEvent)
    expect(mockDataManager.getDayReview).toHaveBeenCalledWith('2026-10-30')
    expect(result).toEqual({ totalProductiveMinutes: 90 })
  })

  it('GetDayReview and GetLogs return safe fallbacks when isQuitting is true', async () => {
    const quittingController = new LogsIpcController({
      logsRepo: mockDataManager,
      analyticsService: mockDataManager,
      settingsRepo: mockDataManager,
      goalsRepo: mockDataManager,
      scheduler: mockScheduler,
      syncAfterWrite: mockSyncAfterWrite,
      security: mockSecurity,
      isQuitting: () => true
    })
    quittingController.register()

    const mockEvent = {} as any
    const reviewResult = await handlers[IpcChannels.GetDayReview](mockEvent, { date: '2026-10-30' })
    expect(reviewResult).toBeNull()

    const logsResult = await handlers[IpcChannels.GetLogs](mockEvent, { date: '2026-10-30' })
    expect(logsResult).toEqual([])

    quittingController.destroy()
  })
})
