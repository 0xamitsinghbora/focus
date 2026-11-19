import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ipcMain, powerMonitor } from 'electron'
import { SessionIpcController } from '../SessionIpcController'
import { IpcChannels } from '../../../shared/types'

describe('SessionIpcController', () => {
  let handlers: Record<string, (...args: any[]) => any> = {}
  let listeners: Record<string, (...args: any[]) => any> = {}
  let controller: SessionIpcController
  let mockDataManager: any
  let mockScheduler: any
  let mockTaskbarManager: any
  let mockBroadcastToWidget: any
  let mockSecurity: any
  let mockMainWindow: any

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
      return undefined as any
    })
    vi.spyOn(ipcMain, 'removeAllListeners').mockImplementation((channel?: string) => {
      if (channel) {
        delete listeners[channel]
      } else {
        listeners = {}
      }
      return undefined as any
    })

    mockDataManager = {
      getActiveSession: vi.fn().mockReturnValue(null),
      setActiveSession: vi.fn()
    }

    mockScheduler = {
      updateFocusSession: vi.fn()
    }

    mockTaskbarManager = {
      updateSession: vi.fn()
    }

    mockBroadcastToWidget = vi.fn()

    mockMainWindow = {
      isDestroyed: vi.fn().mockReturnValue(false),
      webContents: {
        send: vi.fn()
      }
    }

    mockSecurity = {
      assertSenderIsMainWindow: vi.fn(),
      assertSenderIsAppWindow: vi.fn()
    }

    controller = new SessionIpcController({
      settingsRepo: mockDataManager,
      scheduler: mockScheduler,
      getTaskbarManager: () => mockTaskbarManager,
      broadcastToWidget: mockBroadcastToWidget,
      getPromptWindow: () => null,
      getMainWindow: () => mockMainWindow,
      isPromptVisible: () => false,
      security: mockSecurity
    })
  })

  afterEach(() => {
    controller.destroy()
    vi.restoreAllMocks()
  })

  it('registers GetSessionState and UpdateSessionTimer handlers', () => {
    controller.register()

    expect(handlers[IpcChannels.GetSessionState]).toBeDefined()
    expect(listeners[IpcChannels.UpdateSessionTimer]).toBeDefined()
  })

  it('handles GetSessionState correctly', () => {
    controller.register()
    const mockEvent = { sender: {} }

    const state = handlers[IpcChannels.GetSessionState](mockEvent)
    expect(mockSecurity.assertSenderIsAppWindow).toHaveBeenCalledWith(mockEvent)
    expect(state.isActive).toBe(false)
  })

  it('handles UpdateSessionTimer and propagates to taskbar and widgets', () => {
    controller.register()
    const mockEvent = { sender: {} }

    const payload = {
      isActive: true,
      isPaused: false,
      isBreak: false,
      isOvertime: false,
      secondsRemaining: 1200,
      totalSeconds: 1500,
      goalId: 'g1',
      goalTitle: 'Code review'
    }

    listeners[IpcChannels.UpdateSessionTimer](mockEvent, payload)

    expect(mockSecurity.assertSenderIsMainWindow).toHaveBeenCalledWith(mockEvent)
    expect(mockScheduler.updateFocusSession).toHaveBeenCalledWith(
      expect.objectContaining({ goalId: 'g1' })
    )
    expect(mockTaskbarManager.updateSession).toHaveBeenCalledWith(
      expect.objectContaining({ goalId: 'g1' })
    )
    expect(mockBroadcastToWidget).toHaveBeenCalledWith(expect.objectContaining({ goalId: 'g1' }))
    expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
      IpcChannels.UpdateSessionTimer,
      expect.objectContaining({ goalId: 'g1' })
    )
  })

  it('pauses active session when powerMonitor emits lock-screen', () => {
    controller.register()

    // Start active session
    controller.sessionService.start({
      totalSeconds: 2700,
      goalId: 'g1',
      goalTitle: 'Deep Focus'
    })

    expect(controller.sessionService.getState().isActive).toBe(true)
    expect(controller.sessionService.getState().isPaused).toBe(false)

    // Simulate screen lock
    ;(powerMonitor as any).emit('lock-screen')

    expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
      IpcChannels.SessionQuickAction,
      'pause'
    )
  })

  it('handles SessionZeroReached and authoritatively pauses session', () => {
    controller.register()
    const mockEvent = { sender: {} }

    controller.sessionService.start({ totalSeconds: 60 })
    expect(controller.sessionService.getState().isPaused).toBe(false)

    listeners[IpcChannels.SessionZeroReached](mockEvent, true)

    expect(mockSecurity.assertSenderIsAppWindow).toHaveBeenCalledWith(mockEvent)
    expect(controller.sessionService.getState().isPaused).toBe(true)
    expect(controller.sessionService.getState().secondsRemaining).toBe(0)
    expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
      IpcChannels.UpdateSessionTimer,
      expect.objectContaining({ isPaused: true, secondsRemaining: 0 })
    )
  })

  it('queues session update when webContents is loading until did-finish-load', () => {
    let finishLoadCb: (() => void) | null = null
    const loadingWin = {
      isDestroyed: vi.fn().mockReturnValue(false),
      webContents: {
        isLoading: vi.fn().mockReturnValue(true),
        isDestroyed: vi.fn().mockReturnValue(false),
        once: vi.fn((event: string, cb: () => void) => {
          if (event === 'did-finish-load') finishLoadCb = cb
        }),
        send: vi.fn()
      }
    }

    const customController = new SessionIpcController({
      settingsRepo: mockDataManager,
      scheduler: mockScheduler,
      getTaskbarManager: () => mockTaskbarManager,
      broadcastToWidget: mockBroadcastToWidget,
      getPromptWindow: () => null,
      getMainWindow: () => loadingWin as any,
      isPromptVisible: () => false,
      security: mockSecurity
    })

    const payload = {
      isActive: true,
      isPaused: false,
      isBreak: false,
      isOvertime: false,
      secondsRemaining: 1200,
      totalSeconds: 1500
    }

    customController.dispatchSessionUpdate(payload)

    // Should not call send immediately because window is loading
    expect(loadingWin.webContents.send).not.toHaveBeenCalled()
    expect(loadingWin.webContents.once).toHaveBeenCalledWith('did-finish-load', expect.any(Function))

    // Simulate window finished loading
    ;(finishLoadCb as any)?.()

    expect(loadingWin.webContents.send).toHaveBeenCalledWith(
      IpcChannels.UpdateSessionTimer,
      payload
    )

    customController.destroy()
  })

  it('unregisters cleanly on destroy()', () => {
    controller.register()
    expect(handlers[IpcChannels.GetSessionState]).toBeDefined()
    expect(listeners[IpcChannels.UpdateSessionTimer]).toBeDefined()

    controller.destroy()
    expect(handlers[IpcChannels.GetSessionState]).toBeUndefined()
    expect(listeners[IpcChannels.UpdateSessionTimer]).toBeUndefined()
  })
})
