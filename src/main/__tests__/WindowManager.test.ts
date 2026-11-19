import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WindowManager } from '../windows/WindowManager'

vi.mock('../../build/icon.png?asset', () => ({
  default: 'mock-icon.png'
}))
vi.mock('../../build/icon.ico?asset', () => ({
  default: 'mock-icon.ico'
}))

vi.mock('../services/WindowLayoutService', () => {
  const instance = {
    loadWindowState: vi.fn().mockReturnValue({ width: 900, height: 600 }),
    saveWindowStateSync: vi.fn(),
    scheduleSaveWindowState: vi.fn(),
    setupScreenChangeListeners: vi.fn()
  }
  return {
    WindowLayoutService: {
      getInstance: () => instance
    }
  }
})

vi.mock('../windows/prompt', () => ({
  showPromptWindow: vi.fn(),
  getPromptWindow: vi.fn(),
  isPromptVisible: vi.fn().mockReturnValue(false),
  getActiveDisplay: vi.fn().mockReturnValue({
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    workArea: { x: 0, y: 0, width: 1920, height: 1040 }
  }),
  setPromptMainWindow: vi.fn()
}))

vi.mock('../windows/widget', () => ({
  initWidgetWindow: vi.fn(),
  broadcastToWidget: vi.fn(),
  getWidgetWindow: vi.fn(),
  rebindWidgetMainWindow: vi.fn()
}))

describe('WindowManager', () => {
  let windowManager: WindowManager

  beforeEach(() => {
    vi.clearAllMocks()
    windowManager = new WindowManager({
      getShowWidget: () => true,
      onWidgetVisibilityChange: vi.fn()
    })
  })

  it('manages main window reference and ignores destroyed windows', () => {
    expect(windowManager.getMainWindow()).toBeNull()

    const mockWin = {
      isDestroyed: () => false,
      focus: vi.fn()
    } as any

    windowManager.setMainWindow(mockWin)
    expect(windowManager.getMainWindow()).toBe(mockWin)

    mockWin.isDestroyed = () => true
    expect(windowManager.getMainWindow()).toBeNull()
  })

  it('broadcasts IPC message to all active windows', () => {
    const mainSend = vi.fn()
    const promptSend = vi.fn()
    const widgetSend = vi.fn()

    const mainWin = {
      isDestroyed: () => false,
      webContents: { send: mainSend }
    } as any
    const promptWin = {
      isDestroyed: () => false,
      webContents: { send: promptSend }
    } as any
    const widgetWin = {
      isDestroyed: () => false,
      webContents: { send: widgetSend }
    } as any

    windowManager.setMainWindow(mainWin)
    vi.spyOn(windowManager, 'getPromptWindow').mockReturnValue(promptWin)
    vi.spyOn(windowManager, 'getWidgetWindow').mockReturnValue(widgetWin)

    windowManager.broadcast('test-channel', { data: 123 })

    expect(mainSend).toHaveBeenCalledWith('test-channel', { data: 123 })
    expect(promptSend).toHaveBeenCalledWith('test-channel', { data: 123 })
    expect(widgetSend).toHaveBeenCalledWith('test-channel', { data: 123 })
  })

  it('queues broadcast for loading windows until did-finish-load', () => {
    let finishLoadCb: (() => void) | null = null
    const mainSend = vi.fn()

    const loadingMainWin = {
      isDestroyed: () => false,
      webContents: {
        isLoading: () => true,
        isDestroyed: () => false,
        once: vi.fn((event: string, cb: () => void) => {
          if (event === 'did-finish-load') finishLoadCb = cb
        }),
        send: mainSend
      }
    } as any

    windowManager.setMainWindow(loadingMainWin)
    vi.spyOn(windowManager, 'getPromptWindow').mockReturnValue(null)
    vi.spyOn(windowManager, 'getWidgetWindow').mockReturnValue(null)

    windowManager.broadcast('channel-loading', { ready: false })

    expect(mainSend).not.toHaveBeenCalled()
    expect(loadingMainWin.webContents.once).toHaveBeenCalledWith(
      'did-finish-load',
      expect.any(Function)
    )

    ;(finishLoadCb as any)?.()

    expect(mainSend).toHaveBeenCalledWith('channel-loading', { ready: false })
  })

  it('restores and focuses main window if already existing', () => {
    const mockWin = {
      isDestroyed: () => false,
      isMinimized: vi.fn().mockReturnValue(true),
      restore: vi.fn(),
      isVisible: vi.fn().mockReturnValue(false),
      show: vi.fn(),
      focus: vi.fn()
    } as any

    windowManager.setMainWindow(mockWin)
    windowManager.focusOrRestoreMainWindow()

    expect(mockWin.restore).toHaveBeenCalled()
    expect(mockWin.show).toHaveBeenCalled()
    expect(mockWin.focus).toHaveBeenCalled()
  })

  it('maximizes window to maximum view when restoring/focusing if not maximized', () => {
    const mockWin = {
      isDestroyed: () => false,
      isMinimized: vi.fn().mockReturnValue(false),
      isMaximized: vi.fn().mockReturnValue(false),
      maximize: vi.fn(),
      isVisible: vi.fn().mockReturnValue(true),
      focus: vi.fn()
    } as any

    windowManager.setMainWindow(mockWin)
    windowManager.focusOrRestoreMainWindow()

    expect(mockWin.maximize).toHaveBeenCalled()
    expect(mockWin.focus).toHaveBeenCalled()
  })

  it('destroys all windows cleanly and removes listeners on destroyAllWindows', () => {
    const mainDestroy = vi.fn()
    const promptDestroy = vi.fn()
    const widgetDestroy = vi.fn()
    const removeAllListeners = vi.fn()

    const mainWin = {
      isDestroyed: () => false,
      destroy: mainDestroy,
      removeAllListeners
    } as any
    const promptWin = {
      isDestroyed: () => false,
      destroy: promptDestroy,
      removeAllListeners
    } as any
    const widgetWin = {
      isDestroyed: () => false,
      destroy: widgetDestroy,
      removeAllListeners
    } as any

    windowManager.setMainWindow(mainWin)
    vi.spyOn(windowManager, 'getPromptWindow').mockReturnValue(promptWin)
    vi.spyOn(windowManager, 'getWidgetWindow').mockReturnValue(widgetWin)

    windowManager.destroyAllWindows()

    expect(mainDestroy).toHaveBeenCalled()
    expect(promptDestroy).toHaveBeenCalled()
    expect(widgetDestroy).toHaveBeenCalled()
    expect(windowManager.getMainWindow()).toBeNull()
  })
})
