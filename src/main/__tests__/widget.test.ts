import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  clampPosition,
  getDefaultWidgetPosition,
  getAdaptiveTrayClusterWidth,
  detectTaskbar,
  getActiveDisplay,
  isPrimaryDisplay,
  isPositionInsideAnyDisplay,
  WIDGET_WINDOW_LEVEL,
  WIDGET_VISIBLE_ON_FULLSCREEN,
  isWindows11TaskbarCentered,
  fetchTaskbarAlignmentAsync,
  _setCachedTaskbarCentered,
  setupScreenListeners,
  getActiveMainWindow,
  setWidgetMainWindow,
  rebindWidgetMainWindow,
  _resetScreenListenersForTesting,
  savePosition,
  broadcastToWidget,
  initWidgetWindow,
  ensureWidgetTopmost,
  isWidgetActive,
  setWidgetExpanded,
  WINDOW_WIDTH
} from '../windows/widget'
import { BrowserWindow, screen, Menu, ipcMain } from 'electron'
import * as promptModule from '../windows/prompt'

vi.mock('../../../build/icon.png?asset', () => ({
  default: 'mock-icon.png'
}))
vi.mock('../../../build/icon.ico?asset', () => ({
  default: 'mock-icon.ico'
}))

describe('Widget position logic', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const mockDisplay = {
      bounds: { x: 0, y: 0, width: 1536, height: 864 },
      workArea: { x: 0, y: 0, width: 1536, height: 816 },
      workAreaSize: { width: 1536, height: 816 },
      scaleFactor: 1.25
    } as any

    vi.spyOn(screen, 'getPrimaryDisplay').mockReturnValue(mockDisplay)
    ;(screen as any).getDisplayNearestPoint = vi.fn().mockReturnValue(mockDisplay)
  })

  it('clamps coordinates to the display bounds (allowing hovering over taskbar and whole screen, preventing off-screen loss)', () => {
    // If dragged off to the right
    const right = clampPosition(2000, 100)
    expect(right.x).toBe(1536 - 100)
    expect(right.y).toBe(100)

    // If dragged off to the left
    const left = clampPosition(-50, 100)
    expect(left.x).toBe(0)

    // If dragged above screen
    const top = clampPosition(500, -20)
    expect(top.y).toBe(0)

    // If dragged below screen / into taskbar (display bounds height 864, window height 32)
    // Allows hovering over taskbar, but never goes off the bottom of the screen
    const bottom = clampPosition(500, 9999)
    expect(bottom.y).toBe(864 - 32)
  })

  it('computes default widget position adaptively without overlapping tray icons', () => {
    const pos = getDefaultWidgetPosition()
    const mockDisplay = screen.getPrimaryDisplay()
    const trayWidth = getAdaptiveTrayClusterWidth(mockDisplay)

    // Expected x = bounds.width - 100 - trayWidth
    expect(pos.x).toBe(1536 - 100 - trayWidth)
    // taskbarTop = 816, taskbarHeight = 48, centered vertically: 816 + (48 - 32)/2 = 824
    expect(pos.y).toBe(824)
  })

  it('adjusts tray cluster width based on scaleFactor and OS environment', () => {
    const display100 = {
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      scaleFactor: 1.0
    } as any
    const display150 = {
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      scaleFactor: 1.5
    } as any

    const width100 = getAdaptiveTrayClusterWidth(display100)
    const width150 = getAdaptiveTrayClusterWidth(display150)

    // Higher DPI scaling should allocate more clearance for expanded tray padding
    expect(width150).toBeGreaterThan(width100)
  })

  it('clamps properly on multi-monitor setups', () => {
    const secondaryDisplay = {
      bounds: { x: 1536, y: 0, width: 1920, height: 1080 },
      workArea: { x: 1536, y: 0, width: 1920, height: 1040 },
      scaleFactor: 1.0
    } as any

    ;(screen as any).getDisplayNearestPoint = vi.fn().mockImplementation(({ x }: any) => {
      if (x >= 1536) return secondaryDisplay
      return screen.getPrimaryDisplay()
    })

    // Dragged onto second monitor
    const pos = clampPosition(2000, 500)
    expect(pos.x).toBe(2000)
    expect(pos.y).toBe(500)

    // Dragged past right edge of second monitor
    const farRight = clampPosition(5000, 500)
    expect(farRight.x).toBe(1536 + 1920 - 100)

    // Dragged into taskbar of second monitor (bounds height 1080)
    const farBottom = clampPosition(2000, 9999)
    expect(farBottom.y).toBe(1080 - 32)
  })

  describe('detectTaskbar and orientation-adaptive positioning', () => {
    it('detects bottom taskbar and centers widget within it', () => {
      const bottomDisplay = {
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1040 },
        scaleFactor: 1.0
      } as any

      const taskbar = detectTaskbar(bottomDisplay)
      expect(taskbar.position).toBe('bottom')
      expect(taskbar.thickness).toBe(40)
      expect(taskbar.bounds).toEqual({ x: 0, y: 1040, width: 1920, height: 40 })

      const pos = getDefaultWidgetPosition(bottomDisplay)
      const trayWidth = getAdaptiveTrayClusterWidth(bottomDisplay)
      expect(pos.x).toBe(1920 - 100 - trayWidth)
      // 1040 + (40 - 32) / 2 = 1044
      expect(pos.y).toBe(1044)
    })

    it('detects top taskbar and places widget inside top taskbar instead of bottom desktop content', () => {
      const topDisplay = {
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 40, width: 1920, height: 1040 },
        scaleFactor: 1.0
      } as any

      const taskbar = detectTaskbar(topDisplay)
      expect(taskbar.position).toBe('top')
      expect(taskbar.thickness).toBe(40)
      expect(taskbar.bounds).toEqual({ x: 0, y: 0, width: 1920, height: 40 })

      const pos = getDefaultWidgetPosition(topDisplay)
      const trayWidth = getAdaptiveTrayClusterWidth(topDisplay)
      expect(pos.x).toBe(1920 - 100 - trayWidth)
      // Centered inside top taskbar: 0 + (40 - 32) / 2 = 4
      expect(pos.y).toBe(4)
    })

    it('detects left docked taskbar (Windows 10) and places widget adjacent in work area when taskbar is narrower than widget', () => {
      const leftDisplay = {
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 62, y: 0, width: 1858, height: 1080 },
        scaleFactor: 1.0
      } as any

      const taskbar = detectTaskbar(leftDisplay)
      expect(taskbar.position).toBe('left')
      expect(taskbar.thickness).toBe(62)
      expect(taskbar.bounds).toEqual({ x: 0, y: 0, width: 62, height: 1080 })

      const pos = getDefaultWidgetPosition(leftDisplay)
      // Floats adjacent in work area: workArea.x + 12 = 74
      expect(pos.x).toBe(74)
      // Bottom margin 12: 1080 - 32 - 12 = 1036
      expect(pos.y).toBe(1036)
    })

    it('centers widget inside left docked taskbar when taskbar thickness is wide enough', () => {
      const leftDisplay = {
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 150, y: 0, width: 1770, height: 1080 },
        scaleFactor: 1.0
      } as any

      const pos = getDefaultWidgetPosition(leftDisplay)
      // Centered in 150px taskbar: 0 + Math.floor((150 - 100) / 2) = 25
      expect(pos.x).toBe(25)
      // Above 90px tray at bottom: 1080 - 32 - 90 = 958
      expect(pos.y).toBe(958)
    })

    it('detects right docked taskbar (Windows 10) and places widget adjacent in work area when taskbar is narrower than widget', () => {
      const rightDisplay = {
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1858, height: 1080 },
        scaleFactor: 1.0
      } as any

      const taskbar = detectTaskbar(rightDisplay)
      expect(taskbar.position).toBe('right')
      expect(taskbar.thickness).toBe(62)
      expect(taskbar.bounds).toEqual({ x: 1858, y: 0, width: 62, height: 1080 })

      const pos = getDefaultWidgetPosition(rightDisplay)
      // Floats adjacent in work area: workArea.x + workArea.width - 100 - 12 = 1746
      expect(pos.x).toBe(1746)
      // Bottom margin 12: 1080 - 32 - 12 = 1036
      expect(pos.y).toBe(1036)
    })

    it('centers widget inside right docked taskbar when taskbar thickness is wide enough', () => {
      const rightDisplay = {
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1770, height: 1080 },
        scaleFactor: 1.0
      } as any

      const pos = getDefaultWidgetPosition(rightDisplay)
      // Centered in 150px taskbar: 1770 + Math.floor((150 - 100) / 2) = 1795
      expect(pos.x).toBe(1795)
      // Above 90px tray at bottom: 1080 - 32 - 90 = 958
      expect(pos.y).toBe(958)
    })

    it('positions widget on secondary active monitor when cursor is on secondary monitor', () => {
      const primaryDisplay = {
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1040 },
        scaleFactor: 1.0
      } as any

      const secondaryDisplay = {
        bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
        workArea: { x: 1920, y: 0, width: 2560, height: 1392 },
        scaleFactor: 1.0
      } as any

      vi.spyOn(screen, 'getPrimaryDisplay').mockReturnValue(primaryDisplay)
      ;(screen as any).getCursorScreenPoint = vi.fn().mockReturnValue({ x: 2500, y: 500 })
      ;(screen as any).getDisplayNearestPoint = vi.fn().mockReturnValue(secondaryDisplay)

      expect(getActiveDisplay()).toBe(secondaryDisplay)

      const pos = getDefaultWidgetPosition()
      const trayWidth = getAdaptiveTrayClusterWidth(secondaryDisplay)
      // Expected on secondary display: 1920 + 2560 - 100 - trayWidth = 4380 - trayWidth
      expect(pos.x).toBe(4380 - trayWidth)
      // Taskbar top = 1392, height = 48: 1392 + (48 - 32) / 2 = 1400
      expect(pos.y).toBe(1400)
    })
  })
})

describe('Widget window layering configuration', () => {
  it('uses screen-saver window level so widget remains above Windows taskbar when switching apps', () => {
    expect(WIDGET_WINDOW_LEVEL).toBe('screen-saver')
  })

  it('enables visibleOnFullScreen so widget remains visible across app switching and screenshots on all monitors', () => {
    expect(WIDGET_VISIBLE_ON_FULLSCREEN).toBe(true)
  })

  it('ensureWidgetTopmost reasserts topmost status with screen-saver level and moves window to top', () => {
    const win = initWidgetWindow(() => null, { getShowWidget: () => true })!
    expect(win).toBeDefined()

    const alwaysOnTopSpy = vi.spyOn(win, 'setAlwaysOnTop')
    const moveTopSpy = vi.spyOn(win, 'moveTop')
    const showInactiveSpy = vi.spyOn(win, 'showInactive')
    const restoreSpy = vi.spyOn(win, 'restore')

    // Normal active call
    ensureWidgetTopmost({ moveTop: true })
    expect(alwaysOnTopSpy).toHaveBeenCalledWith(true, 'screen-saver', 1)
    expect(moveTopSpy).toHaveBeenCalled()

    // When minimized by OS/Win+D, ensureWidgetTopmost restores and shows inactive
    vi.spyOn(win, 'isMinimized').mockReturnValue(true)
    vi.spyOn(win, 'isVisible').mockReturnValue(false)

    ensureWidgetTopmost({ moveTop: true })
    expect(restoreSpy).toHaveBeenCalled()
    expect(showInactiveSpy).toHaveBeenCalled()
  })

  it('isWidgetActive correctly reflects whether widget should be displayed', () => {
    expect(isWidgetActive()).toBe(true)
  })
})

describe('Taskbar alignment detection without synchronous shell calls', () => {
  it('isWindows11TaskbarCentered does not call child_process.execSync', () => {
    const childProcess = require('child_process')
    const execSyncSpy = vi.spyOn(childProcess, 'execSync')

    const isCentered = isWindows11TaskbarCentered()
    expect(typeof isCentered).toBe('boolean')
    expect(execSyncSpy).not.toHaveBeenCalled()
  })

  it('adjusts base width based on cached taskbar alignment', () => {
    const display100 = {
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      scaleFactor: 1.0
    } as any

    _setCachedTaskbarCentered(true)
    const centeredWidth = getAdaptiveTrayClusterWidth(display100)

    _setCachedTaskbarCentered(false)
    const leftAlignedWidth = getAdaptiveTrayClusterWidth(display100)

    const os = require('os')
    if (process.platform === 'win32' && parseInt(os.release().split('.')[2] || '0', 10) >= 22000) {
      expect(centeredWidth).toBe(260)
      expect(leftAlignedWidth).toBe(240)
      expect(centeredWidth).toBeGreaterThan(leftAlignedWidth)
    }
  })

  it('fetchTaskbarAlignmentAsync resolves without errors and updates cache', async () => {
    _setCachedTaskbarCentered(null)
    const result = await fetchTaskbarAlignmentAsync()
    expect(typeof result).toBe('boolean')
    expect(isWindows11TaskbarCentered()).toBe(result)
  })

  describe('Multi-monitor taskbar presence and edge case handling', () => {
    it('detects when a display has no docked taskbar (hasTaskbar: false)', () => {
      const noTaskbarSecondary = {
        id: 2,
        bounds: { x: 1920, y: 0, width: 1920, height: 1080 },
        workArea: { x: 1920, y: 0, width: 1920, height: 1080 }
      } as any

      const taskbar = detectTaskbar(noTaskbarSecondary)
      expect(taskbar.hasTaskbar).toBe(false)
    })

    it('falls back to primary display taskbar when active display has no taskbar', () => {
      const primaryDisplay = {
        id: 1,
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1040 }
      } as any

      const noTaskbarSecondary = {
        id: 2,
        bounds: { x: 1920, y: 0, width: 1920, height: 1080 },
        workArea: { x: 1920, y: 0, width: 1920, height: 1080 }
      } as any

      vi.spyOn(screen, 'getPrimaryDisplay').mockReturnValue(primaryDisplay)
      ;(screen as any).getCursorScreenPoint = vi.fn().mockReturnValue({ x: 2500, y: 500 })
      ;(screen as any).getDisplayNearestPoint = vi.fn().mockReturnValue(noTaskbarSecondary)

      // When called with no argument on secondary with no taskbar, falls back to primary display
      const pos = getDefaultWidgetPosition()
      expect(pos.x).toBeLessThan(1920)
      // 1040 + (40 - 32) / 2 = 1044
      expect(pos.y).toBe(1044)
    })

    it('positions widget cleanly with margins when target display explicitly has no taskbar', () => {
      const noTaskbarDisplay = {
        id: 2,
        bounds: { x: 1920, y: 0, width: 1920, height: 1080 },
        workArea: { x: 1920, y: 0, width: 1920, height: 1080 }
      } as any

      const pos = getDefaultWidgetPosition(noTaskbarDisplay)
      // Floating pill at bottom right of workArea with 20px margin:
      // x = 1920 + 1920 - 100 - 20 = 3720
      // y = 0 + 1080 - 32 - 20 = 1028
      expect(pos.x).toBe(3720)
      expect(pos.y).toBe(1028)
    })

    it('allocates clearance for auto-hidden taskbar so pop-up taskbar does not occlude the widget', () => {
      // Auto-hidden taskbar typically leaves a tiny 2px edge on Windows
      const autohideDisplay = {
        id: 3,
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1078 }
      } as any

      const pos = getDefaultWidgetPosition(autohideDisplay)
      // Floating pill leaves extra margin (thickness + 12px) to clear popping up taskbar
      expect(pos.y).toBeLessThan(1078 - 32 - 20)
    })

    it('bounds widget within custom docked taskbars with reduced width', () => {
      const customDockDisplay = {
        id: 4,
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1032 }
      } as any

      const pos = getDefaultWidgetPosition(customDockDisplay)
      expect(pos.x).toBeGreaterThanOrEqual(0)
      expect(pos.x + 100).toBeLessThanOrEqual(1920)
      expect(pos.y + 32).toBeLessThanOrEqual(1080)
    })

    it('differentiates primary and secondary displays for system tray width', () => {
      const primary = {
        id: 1,
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        scaleFactor: 1.0
      } as any
      const secondary = {
        id: 2,
        bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
        scaleFactor: 1.0
      } as any

      vi.spyOn(screen, 'getPrimaryDisplay').mockReturnValue(primary)
      expect(isPrimaryDisplay(primary)).toBe(true)
      expect(isPrimaryDisplay(secondary)).toBe(false)

      const primaryTray = getAdaptiveTrayClusterWidth(primary)
      const secondaryTray = getAdaptiveTrayClusterWidth(secondary)
      expect(primaryTray).toBeGreaterThan(secondaryTray)
      expect(secondaryTray).toBeLessThanOrEqual(72)
    })

    it('checks whether coordinates intersect any connected display', () => {
      const primary = {
        id: 1,
        bounds: { x: 0, y: 0, width: 1920, height: 1080 }
      } as any
      vi.spyOn(screen, 'getAllDisplays').mockReturnValue([primary])

      // Inside primary
      expect(isPositionInsideAnyDisplay(500, 500)).toBe(true)
      expect(isPositionInsideAnyDisplay(1792, 1040)).toBe(true)

      // Outside all displays (e.g. unplugged external monitor)
      expect(isPositionInsideAnyDisplay(3000, 500)).toBe(false)
      expect(isPositionInsideAnyDisplay(-1000, 500)).toBe(false)
    })

    it('treats macOS Dock / insets as hasTaskbar: false so widget floats cleanly', () => {
      const originalPlatform = process.platform
      try {
        Object.defineProperty(process, 'platform', { value: 'darwin' })
        const macDisplay = {
          bounds: { x: 0, y: 0, width: 1440, height: 900 },
          // Top menu bar (25px) and bottom dock (70px)
          workArea: { x: 0, y: 25, width: 1440, height: 805 }
        } as any

        const taskbar = detectTaskbar(macDisplay)
        expect(taskbar.hasTaskbar).toBe(false)
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform })
      }
    })

    it('attaches listeners to screen for display-removed, display-added and display-metrics-changed only once', () => {
      _resetScreenListenersForTesting()
      const onSpy = vi.spyOn(screen, 'on')
      setupScreenListeners()
      setupScreenListeners() // Second call must be a no-op

      const events = onSpy.mock.calls.map((call) => call[0])
      expect(events).toContain('display-removed')
      expect(events).toContain('display-added')
      expect(events).toContain('display-metrics-changed')
      expect(onSpy).toHaveBeenCalledTimes(3)
    })

    it('resolves active main window dynamically via function getter', () => {
      let winInstance: any = { isDestroyed: () => false, id: 10 }
      setWidgetMainWindow(() => winInstance)

      expect(getActiveMainWindow()).toBe(winInstance)

      // When window is destroyed and replaced
      winInstance = { isDestroyed: () => false, id: 20 }
      expect(getActiveMainWindow()).toBe(winInstance)

      // When destroyed
      winInstance.isDestroyed = () => true
      expect(getActiveMainWindow()).toBeNull()
    })

    it('ignores prompt window when searching fallback windows in getActiveMainWindow', () => {
      setWidgetMainWindow(null as any)
      const mockPromptWin: any = { isDestroyed: () => false, id: 99 }
      const mockMainWin: any = { isDestroyed: () => false, id: 100 }

      vi.spyOn(promptModule, 'getPromptWindow').mockReturnValue(mockPromptWin as any)
      vi.spyOn(BrowserWindow, 'getAllWindows').mockReturnValue([mockPromptWin, mockMainWin] as any)

      expect(getActiveMainWindow()).toBe(mockMainWin)
    })

    it('rebindWidgetMainWindow safely transfers blur/minimize/hide listeners', () => {
      const mockWin1: any = {
        isDestroyed: () => false,
        on: vi.fn(),
        removeListener: vi.fn()
      }
      const mockWin2: any = {
        isDestroyed: () => false,
        on: vi.fn(),
        removeListener: vi.fn()
      }

      rebindWidgetMainWindow(mockWin1)
      expect(mockWin1.on).toHaveBeenCalledWith('blur', expect.any(Function))
      expect(mockWin1.on).toHaveBeenCalledWith('minimize', expect.any(Function))
      expect(mockWin1.on).toHaveBeenCalledWith('hide', expect.any(Function))

      rebindWidgetMainWindow(mockWin2)
      expect(mockWin1.removeListener).toHaveBeenCalledWith('blur', expect.any(Function))
      expect(mockWin1.removeListener).toHaveBeenCalledWith('minimize', expect.any(Function))
      expect(mockWin1.removeListener).toHaveBeenCalledWith('hide', expect.any(Function))
      expect(mockWin2.on).toHaveBeenCalledWith('blur', expect.any(Function))
      expect(mockWin2.on).toHaveBeenCalledWith('minimize', expect.any(Function))
      expect(mockWin2.on).toHaveBeenCalledWith('hide', expect.any(Function))

      rebindWidgetMainWindow(null)
      expect(mockWin2.removeListener).toHaveBeenCalledWith('blur', expect.any(Function))
    })

    it('savePosition writes clamped position atomically without throwing', async () => {
      const mockDisplay = {
        bounds: { x: 0, y: 0, width: 1536, height: 864 }
      } as any
      vi.spyOn(screen, 'getDisplayNearestPoint').mockReturnValue(mockDisplay)
      const syncUtils = await import('../syncUtils')
      const atomicWriteSpy = vi.spyOn(syncUtils, 'atomicWriteJson').mockResolvedValue(undefined)

      await savePosition(2000, 9999)

      expect(atomicWriteSpy).toHaveBeenCalledTimes(1)
      const call = atomicWriteSpy.mock.calls[0]
      expect(call[0]).toContain('widget-pos.json')
      const parsed = call[1] as any
      expect(parsed.x).toBe(1536 - 100)
      expect(parsed.y).toBe(864 - 32)
      expect(parsed.v).toBe(3)

      atomicWriteSpy.mockRestore()
    })

    it('broadcastToWidget sends payload to webContents without re-raising z-order or calling setAlwaysOnTop', () => {
      const win = initWidgetWindow(() => null)!
      expect(win).toBeDefined()
      win.show()
      const sendSpy = vi.spyOn(win.webContents, 'send')
      const alwaysOnTopSpy = vi.spyOn(win, 'setAlwaysOnTop')
      const moveTopSpy = vi.spyOn(win, 'moveTop')

      const payload: any = { remainingSeconds: 60, isRunning: true }
      broadcastToWidget(payload)

      expect(sendSpy).toHaveBeenCalledWith('session:update-timer', payload)
      expect(alwaysOnTopSpy).not.toHaveBeenCalled()
      expect(moveTopSpy).not.toHaveBeenCalled()
    })

    it('defers creating widget BrowserWindow when getShowWidget returns false', () => {
      const win = initWidgetWindow(() => null, { getShowWidget: () => false })
      expect(win).toBeNull()
    })

    it('maintains fixed compact width and does not expand to prevent glitchiness', () => {
      const win = initWidgetWindow(() => null, { getShowWidget: () => true })!
      expect(win).toBeDefined()
      expect(win.getBounds().width).toBe(WINDOW_WIDTH) // 100

      setWidgetExpanded(true)
      expect(win.getBounds().width).toBe(WINDOW_WIDTH) // Remains fixed at 100

      setWidgetExpanded(false)
      expect(win.getBounds().width).toBe(WINDOW_WIDTH) // 100
    })

    it('builds context menu with +5 min addon, 5 min break, and Reset Widget without Switch to', () => {
      const buildSpy = vi.spyOn(Menu, 'buildFromTemplate')
      const win = initWidgetWindow(() => null, { getShowWidget: () => true })!
      expect(win).toBeDefined()

      broadcastToWidget({
        isActive: true,
        isBreak: false,
        isPaused: false,
        isOvertime: false,
        secondsRemaining: 1500,
        totalSeconds: 1500
      })
      const mockEvent = { sender: win.webContents } as any
      ipcMain.emit('widget:context-menu', mockEvent)

      expect(buildSpy).toHaveBeenCalled()
      const lastCall = buildSpy.mock.calls[buildSpy.mock.calls.length - 1][0]
      const labels = lastCall.map((item) => item.label).filter(Boolean)
      expect(labels).toContain('+5 min addon')
      expect(labels).toContain('5 min break')
      expect(labels).toContain('Reset Widget')
      expect(labels.some((l) => l?.includes('Switch to'))).toBe(false)
    })
  })
})
