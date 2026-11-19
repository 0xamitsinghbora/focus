import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ipcMain } from 'electron'
import { GoalsIpcController } from '../GoalsIpcController'
import { IpcChannels } from '../../../shared/types'

describe('GoalsIpcController', () => {
  let handlers: Record<string, (...args: any[]) => any> = {}
  let controller: GoalsIpcController
  let mockDataManager: any
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
      getTodayDate: vi.fn().mockReturnValue('2026-10-30'),
      generateTodayGoals: vi.fn().mockResolvedValue([]),
      getBoardGoals: vi.fn().mockResolvedValue([{ id: 'goal-1', title: 'Task 1' }]),
      getGoals: vi.fn().mockResolvedValue([{ id: 'goal-2', title: 'Task 2' }]),
      addGoal: vi.fn().mockResolvedValue({ id: 'goal-new', title: 'New Task' }),
      updateGoal: vi.fn().mockResolvedValue({ id: 'goal-1', title: 'Updated' }),
      deleteGoal: vi.fn().mockResolvedValue('2026-10-30'),
      carryGoal: vi.fn().mockResolvedValue({ id: 'carried-1', title: 'Carried' }),
      getGoalLoggedMinutesMap: vi.fn().mockResolvedValue({ 'goal-1': 50 }),
      getGroupColors: vi.fn().mockReturnValue({ work: 'blue' }),
      updateGroupColorAcrossGoals: vi.fn().mockResolvedValue(['2026-10-30']),
      getDirtySyncTargets: vi.fn().mockReturnValue({ goalDates: [] })
    }

    mockSyncAfterWrite = vi.fn()

    mockSecurity = {
      assertSenderIsMainWindow: vi.fn(),
      assertSenderIsMainWindowOrPrompt: vi.fn()
    }

    controller = new GoalsIpcController({
      goalsRepo: mockDataManager,
      settingsRepo: mockDataManager,
      analyticsService: mockDataManager,
      syncAfterWrite: mockSyncAfterWrite,
      getDirtyGoalDates: () => mockDataManager.getDirtySyncTargets().goalDates,
      security: mockSecurity
    })
    controller.register()
  })

  afterEach(() => {
    controller.destroy()
    vi.restoreAllMocks()
  })

  it('registers handlers for goals, colors, and inbox and cleans up on destroy', () => {
    expect(handlers[IpcChannels.GetGoals]).toBeDefined()
    expect(handlers[IpcChannels.AddGoal]).toBeDefined()
    expect(handlers[IpcChannels.UpdateGoal]).toBeDefined()
    expect(handlers[IpcChannels.DeleteGoal]).toBeDefined()
    expect(handlers[IpcChannels.CarryGoal]).toBeDefined()
    expect(handlers[IpcChannels.GetGroupColors]).toBeDefined()

    controller.destroy()
    expect(handlers[IpcChannels.GetGoals]).toBeUndefined()
    expect(handlers[IpcChannels.AddGoal]).toBeUndefined()
  })

  it('GetGoals returns board goals if date is today', async () => {
    const mockEvent = {} as any
    const result = await handlers[IpcChannels.GetGoals](mockEvent, { date: '2026-10-30' })
    expect(mockSecurity.assertSenderIsMainWindowOrPrompt).toHaveBeenCalledWith(mockEvent)
    expect(mockDataManager.generateTodayGoals).toHaveBeenCalledWith('2026-10-30')
    expect(mockDataManager.getBoardGoals).toHaveBeenCalledWith('2026-10-30')
    expect(result).toEqual([{ id: 'goal-1', title: 'Task 1' }])
  })

  it('AddGoal adds goal and triggers syncAfterWrite', async () => {
    const mockEvent = {} as any
    const payload = {
      date: '2026-10-30',
      title: 'New Task',
      targetMinutes: 30
    }
    const result = await handlers[IpcChannels.AddGoal](mockEvent, payload)
    expect(mockSecurity.assertSenderIsMainWindowOrPrompt).toHaveBeenCalledWith(mockEvent)
    expect(mockDataManager.addGoal).toHaveBeenCalled()
    expect(mockSyncAfterWrite).toHaveBeenCalledWith({ goalDates: ['2026-10-30'] })
    expect(result).toEqual({ id: 'goal-new', title: 'New Task' })
  })

  it('GetGoals returns empty array when isQuitting is true', async () => {
    const quittingController = new GoalsIpcController({
      goalsRepo: mockDataManager,
      settingsRepo: mockDataManager,
      analyticsService: mockDataManager,
      syncAfterWrite: mockSyncAfterWrite,
      security: mockSecurity,
      isQuitting: () => true
    })
    quittingController.register()

    const mockEvent = {} as any
    const result = await handlers[IpcChannels.GetGoals](mockEvent, { date: '2026-10-30' })
    expect(result).toEqual([])
    expect(mockDataManager.getBoardGoals).not.toHaveBeenCalled()

    quittingController.destroy()
  })

  it('CarryGoal invokes dataManager and updates dates in syncAfterWrite', async () => {
    const mockEvent = {} as any
    const payload = {
      fromDate: '2026-10-29',
      toDate: '2026-10-30',
      goalId: 'goal-1'
    }
    const result = await handlers[IpcChannels.CarryGoal](mockEvent, payload)
    expect(mockSecurity.assertSenderIsMainWindow).toHaveBeenCalledWith(mockEvent)
    expect(mockDataManager.carryGoal).toHaveBeenCalledWith('2026-10-29', '2026-10-30', 'goal-1')
    expect(mockSyncAfterWrite).toHaveBeenCalledWith({ goalDates: ['2026-10-29', '2026-10-30'] })
    expect(result).toEqual({ id: 'carried-1', title: 'Carried' })
  })
})
