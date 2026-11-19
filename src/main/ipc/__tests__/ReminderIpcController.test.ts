import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ipcMain } from 'electron'
import { ReminderIpcController } from '../ReminderIpcController'
import { IpcChannels, ReminderStatus } from '../../../shared/types'

describe('ReminderIpcController', () => {
  let handlers: Record<string, (...args: any[]) => any> = {}
  let listeners: Record<string, (...args: any[]) => any> = {}
  let controller: ReminderIpcController
  let mockScheduler: any
  let mockHidePrompt: any
  let mockSecurity: any

  beforeEach(() => {
    handlers = {}
    listeners = {}

    vi.spyOn(ipcMain, 'handle').mockImplementation((channel: string, handler: any) => {
      handlers[channel] = handler
      return undefined as any
    })
    vi.spyOn(ipcMain, 'removeHandler').mockImplementation((channel: string) => {
      delete handlers[channel]
      return undefined as any
    })
    vi.spyOn(ipcMain, 'on').mockImplementation((channel: string, listener: any) => {
      listeners[channel] = listener
      return ipcMain
    })
    vi.spyOn(ipcMain, 'removeListener').mockImplementation((channel: string) => {
      delete listeners[channel]
      return ipcMain
    })

    mockScheduler = {
      snooze: vi.fn(),
      resetBlockAndTimer: vi.fn(),
      getStatus: vi.fn().mockReturnValue({
        nextPromptTime: 123456789,
        isPendingPrompt: false
      } as unknown as ReminderStatus)
    }

    mockHidePrompt = vi.fn()

    mockSecurity = {
      assertSenderIsMainWindowOrPrompt: vi.fn(),
      assertSenderIsAppWindow: vi.fn()
    }

    controller = new ReminderIpcController({
      scheduler: mockScheduler,
      hidePromptWindow: mockHidePrompt,
      security: mockSecurity
    })
  })

  afterEach(() => {
    controller.unregister()
    vi.restoreAllMocks()
  })

  it('registers IPC handlers and handles RemindGetStatus', async () => {
    controller.register()

    expect(handlers[IpcChannels.RemindGetStatus]).toBeDefined()
    const mockEvent = { sender: {} }
    const status = await handlers[IpcChannels.RemindGetStatus](mockEvent)

    expect(mockSecurity.assertSenderIsAppWindow).toHaveBeenCalledWith(mockEvent)
    expect(mockScheduler.getStatus).toHaveBeenCalled()
    expect(status).toEqual({
      nextPromptTime: 123456789,
      isPendingPrompt: false
    })
  })

  it('handles RemindSnooze event with custom minutes and default minutes', () => {
    controller.register()

    expect(listeners[IpcChannels.RemindSnooze]).toBeDefined()
    const mockEvent = { sender: {} }

    // Custom minutes (10)
    listeners[IpcChannels.RemindSnooze](mockEvent, 10)
    expect(mockSecurity.assertSenderIsMainWindowOrPrompt).toHaveBeenCalledWith(mockEvent)
    expect(mockScheduler.snooze).toHaveBeenCalledWith(10)
    expect(mockHidePrompt).toHaveBeenCalled()

    // Default minutes when undefined or invalid
    mockScheduler.snooze.mockClear()
    listeners[IpcChannels.RemindSnooze](mockEvent, -1)
    expect(mockScheduler.snooze).toHaveBeenCalledWith(5)
  })

  it('handles RemindSubmit event, resetting block and hiding prompt', () => {
    controller.register()

    expect(listeners[IpcChannels.RemindSubmit]).toBeDefined()
    const mockEvent = { sender: {} }

    listeners[IpcChannels.RemindSubmit](mockEvent)
    expect(mockSecurity.assertSenderIsMainWindowOrPrompt).toHaveBeenCalledWith(mockEvent)
    expect(mockScheduler.resetBlockAndTimer).toHaveBeenCalled()
    expect(mockHidePrompt).toHaveBeenCalled()
  })

  it('unregisters listeners and handlers cleanly', () => {
    controller.register()
    expect(listeners[IpcChannels.RemindSnooze]).toBeDefined()
    expect(listeners[IpcChannels.RemindSubmit]).toBeDefined()
    expect(handlers[IpcChannels.RemindGetStatus]).toBeDefined()

    controller.unregister()
    expect(listeners[IpcChannels.RemindSnooze]).toBeUndefined()
    expect(listeners[IpcChannels.RemindSubmit]).toBeUndefined()
    expect(handlers[IpcChannels.RemindGetStatus]).toBeUndefined()
  })
})
