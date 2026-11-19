import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TrayGenerator } from '../tray'
import { Tray, Menu } from 'electron'
import * as widgetModule from '../windows/widget'

vi.mock('../../build/tray-icon.png?asset', () => ({
  default: 'mock-tray-icon.png'
}))

describe('TrayGenerator', () => {
  let mockMainWindow: any
  let trayInstance: TrayGenerator | null = null

  beforeEach(() => {
    vi.clearAllMocks()
    widgetModule._resetVisibilityListenersForTesting?.()

    mockMainWindow = {
      isDestroyed: vi.fn().mockReturnValue(false),
      isMinimized: vi.fn().mockReturnValue(false),
      isVisible: vi.fn().mockReturnValue(false),
      show: vi.fn(),
      focus: vi.fn(),
      restore: vi.fn(),
      webContents: {
        send: vi.fn(),
        isLoading: vi.fn().mockReturnValue(false),
        once: vi.fn()
      }
    }
  })

  afterEach(() => {
    if (trayInstance) {
      trayInstance.destroy()
      trayInstance = null
    }
    vi.restoreAllMocks()
  })

  it('initializes tray and creates minimal context menu without widget or status labels', () => {
    const setContextMenuSpy = vi.spyOn(Tray.prototype, 'setContextMenu')
    const buildFromTemplateSpy = vi.spyOn(Menu, 'buildFromTemplate')

    trayInstance = new TrayGenerator(() => mockMainWindow)

    expect(setContextMenuSpy).toHaveBeenCalled()
    const lastCall = buildFromTemplateSpy.mock.calls[buildFromTemplateSpy.mock.calls.length - 1][0]
    expect(lastCall.some((item) => item.label === 'Log Now')).toBe(true)
    expect(lastCall.some((item) => item.label === 'Settings')).toBe(true)
    expect(lastCall.some((item) => item.label === 'Quit focus')).toBe(true)
    // Widget options removed from tray menu
    expect(
      lastCall.some((item) => item.label === 'Show Widget' || item.label === 'Hide Widget')
    ).toBe(false)
    expect(lastCall.some((item) => item.label === 'Reset Widget')).toBe(false)
  })

  it('updates tooltip via updateStatus without injecting status label into menu', () => {
    const setToolTipSpy = vi.spyOn(Tray.prototype, 'setToolTip')
    const buildFromTemplateSpy = vi.spyOn(Menu, 'buildFromTemplate')

    trayInstance = new TrayGenerator(() => mockMainWindow)

    trayInstance.updateStatus({
      tooltip: 'Focus - 25m remaining',
      menuLabel: 'Pomodoro: 25m left'
    })

    expect(setToolTipSpy).toHaveBeenCalledWith('Focus - 25m remaining')
    const lastCall = buildFromTemplateSpy.mock.calls[buildFromTemplateSpy.mock.calls.length - 1][0]
    expect(lastCall.some((item) => item.label === 'Pomodoro: 25m left')).toBe(false)
  })

  it('populates and triggers quick actions when focus session is active (without Mark Task Done)', () => {
    const buildFromTemplateSpy = vi.spyOn(Menu, 'buildFromTemplate')
    trayInstance = new TrayGenerator(() => mockMainWindow)

    trayInstance.updateStatus({
      tooltip: 'Focus - 20m remaining',
      menuLabel: '⚡ Deep Work (20m)',
      isActive: true,
      isPaused: false,
      isBreak: false,
      remainingSeconds: 1200,
      goalTitle: 'Deep Work'
    })

    const lastCall = buildFromTemplateSpy.mock.calls[buildFromTemplateSpy.mock.calls.length - 1][0]
    const add5m = lastCall.find((item) => item.label === '+5 min addon')
    const takeBreak = lastCall.find((item) => item.label === '2 min break')

    expect(add5m).toBeDefined()
    expect(takeBreak).toBeDefined()
    // Pause option, Mark Task Done, and status label removed
    expect(
      lastCall.some((item) => item.label === 'Pause Session' || item.label === 'Resume Session')
    ).toBe(false)
    expect(lastCall.some((item) => item.label === 'Mark Task Done')).toBe(false)
    expect(lastCall.some((item) => item.label === '⚡ Deep Work (20m)')).toBe(false)

    // Test clicking +5m
    add5m?.click?.({} as any, undefined as any, {} as any)
    expect(mockMainWindow.webContents.send).toHaveBeenCalledWith('session:quick-action', 'add-5m')
  })

  it('cleans up visibility listener and tray on destroy', () => {
    const destroySpy = vi.spyOn(Tray.prototype, 'destroy')
    trayInstance = new TrayGenerator(() => mockMainWindow)

    trayInstance.destroy()
    expect(destroySpy).toHaveBeenCalled()
    trayInstance = null
  })
})
