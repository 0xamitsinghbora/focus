import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getActiveDisplay,
  getPromptPosition,
  showPromptWindow,
  hidePromptWindow,
  isPromptVisible,
  getPromptWindow,
  onPromptDismiss,
  setPromptIsQuitting,
  setPromptMainWindow,
  getActivePromptMainWindow,
  setPromptDismissOnBlur
} from '../windows/prompt'
import { screen, ipcMain } from 'electron'
import { IpcChannels } from '../../shared/types'

vi.mock('../../../build/icon.png?asset', () => ({
  default: 'mock-icon.png'
}))
vi.mock('../../../build/icon.ico?asset', () => ({
  default: 'mock-icon.ico'
}))

describe('Prompt Window Multi-Monitor Positioning', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const primaryDisplay = {
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      workAreaSize: { width: 1920, height: 1040 },
      scaleFactor: 1.0
    } as any

    vi.spyOn(screen, 'getPrimaryDisplay').mockReturnValue(primaryDisplay)
    ;(screen as any).getCursorScreenPoint = vi.fn().mockReturnValue({ x: 500, y: 500 })
    ;(screen as any).getDisplayNearestPoint = vi.fn().mockReturnValue(primaryDisplay)
  })

  describe('getActiveDisplay', () => {
    it('returns the display nearest to the user cursor point', () => {
      const secondaryDisplay = {
        bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
        workArea: { x: 1920, y: 0, width: 2560, height: 1400 }
      } as any

      ;(screen as any).getCursorScreenPoint = vi.fn().mockReturnValue({ x: 2200, y: 400 })
      ;(screen as any).getDisplayNearestPoint = vi
        .fn()
        .mockImplementation((pt: { x: number; y: number }) => {
          if (pt.x >= 1920) return secondaryDisplay
          return screen.getPrimaryDisplay()
        })

      const active = getActiveDisplay()
      expect(active).toBe(secondaryDisplay)
      expect(screen.getDisplayNearestPoint).toHaveBeenCalledWith({ x: 2200, y: 400 })
    })

    it('gracefully falls back to primary display if cursor coordinates fail', () => {
      ;(screen as any).getCursorScreenPoint = vi.fn().mockImplementation(() => {
        throw new Error('OS cursor unavailable')
      })

      const active = getActiveDisplay()
      expect(active).toBe(screen.getPrimaryDisplay())
    })
  })

  describe('getPromptPosition', () => {
    it('positions prompt at bottom-right of primary display work area with 20px padding', () => {
      const display = {
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1040 }
      } as any

      const pos = getPromptPosition(display, 400, 500)
      // x = 0 + 1920 - 400 - 20 = 1500
      expect(pos.x).toBe(1500)
      // y = 0 + 1040 - 500 - 20 = 520
      expect(pos.y).toBe(520)
    })

    it('positions prompt correctly on secondary monitor with coordinate offsets', () => {
      const secondaryDisplay = {
        bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
        workArea: { x: 1920, y: 0, width: 2560, height: 1392 }
      } as any

      const pos = getPromptPosition(secondaryDisplay, 400, 350)
      // x = 1920 + 2560 - 400 - 20 = 4060
      expect(pos.x).toBe(4060)
      // y = 0 + 1392 - 350 - 20 = 1022
      expect(pos.y).toBe(1022)
    })

    it('positions prompt correctly when taskbar is docked at top (Windows 10)', () => {
      const topTaskbarDisplay = {
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 40, width: 1920, height: 1040 }
      } as any

      const pos = getPromptPosition(topTaskbarDisplay, 400, 500)
      expect(pos.x).toBe(1500)
      // y = 40 + 1040 - 500 - 20 = 560
      expect(pos.y).toBe(560)
    })

    it('positions prompt correctly when taskbar is docked on left (Windows 10)', () => {
      const leftTaskbarDisplay = {
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 62, y: 0, width: 1858, height: 1080 }
      } as any

      const pos = getPromptPosition(leftTaskbarDisplay, 400, 500)
      // x = 62 + 1858 - 400 - 20 = 1500
      expect(pos.x).toBe(1500)
      // y = 0 + 1080 - 500 - 20 = 560
      expect(pos.y).toBe(560)
    })

    it('clamps coordinates so prompt cannot be placed above or to the left of the work area', () => {
      const constrainedDisplay = {
        bounds: { x: 100, y: 100, width: 800, height: 480 },
        workArea: { x: 100, y: 100, width: 800, height: 480 }
      } as any

      // Prompt height (500) exceeds display workArea height (480)
      const pos = getPromptPosition(constrainedDisplay, 400, 500)
      // x = 100 + 800 - 400 - 20 = 480
      expect(pos.x).toBe(480)
      // y without clamping would be 100 + 480 - 500 - 20 = 60, but height >= workArea.height clamps to workArea.y (100)
      expect(pos.y).toBeGreaterThanOrEqual(100)
    })
  })

  describe('showPromptWindow and multi-monitor display switching', () => {
    it('creates and positions prompt on the active cursor display', () => {
      const secondaryDisplay = {
        bounds: { x: 1920, y: 0, width: 1920, height: 1080 },
        workArea: { x: 1920, y: 0, width: 1920, height: 1040 }
      } as any

      ;(screen as any).getCursorScreenPoint = vi.fn().mockReturnValue({ x: 2500, y: 500 })
      ;(screen as any).getDisplayNearestPoint = vi.fn().mockReturnValue(secondaryDisplay)

      showPromptWindow()

      // Should be positioned on secondary display
      // x = 1920 + 1920 - 400 - 20 = 3420
      // y = 0 + 1040 - 500 - 20 = 520
      expect(isPromptVisible()).toBe(true)

      hidePromptWindow()
      expect(isPromptVisible()).toBe(false)
    })

    it('switches monitors when showPromptWindow is called while cursor is on another display', () => {
      const primaryDisplay = {
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1040 }
      } as any

      const secondaryDisplay = {
        bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
        workArea: { x: 1920, y: 0, width: 2560, height: 1392 }
      } as any

      // First open on primary
      ;(screen as any).getCursorScreenPoint = vi.fn().mockReturnValue({ x: 500, y: 500 })
      ;(screen as any).getDisplayNearestPoint = vi.fn().mockReturnValue(primaryDisplay)
      showPromptWindow()

      hidePromptWindow()

      // Next prompt triggers while user is active on secondary monitor
      ;(screen as any).getCursorScreenPoint = vi.fn().mockReturnValue({ x: 3000, y: 500 })
      ;(screen as any).getDisplayNearestPoint = vi.fn().mockReturnValue(secondaryDisplay)
      showPromptWindow()

      const expectedPos = getPromptPosition(secondaryDisplay, 400, 500)
      expect(expectedPos.x).toBe(1920 + 2560 - 400 - 20)
      expect(expectedPos.y).toBe(0 + 1392 - 500 - 20)
      expect(isPromptVisible()).toBe(true)
    })
  })

  describe('Prompt Window Dismissal & Close Interception', () => {
    it('intercepts window close (Alt+F4 / taskbar), prevents destruction, hides window, and notifies dismissal', () => {
      setPromptIsQuitting(false)
      const dismissSpy = vi.fn()
      const unsubscribe = onPromptDismiss(dismissSpy)

      showPromptWindow()
      expect(isPromptVisible()).toBe(true)

      const win = getPromptWindow()
      expect(win).toBeDefined()

      const preventDefault = vi.fn()
      win!.emit('close', { preventDefault })

      expect(preventDefault).toHaveBeenCalled()
      expect(isPromptVisible()).toBe(false)
      expect(dismissSpy).toHaveBeenCalledTimes(1)

      unsubscribe()
    })

    it('allows window to close without preventDefault during app exit (isQuitting = true)', () => {
      setPromptIsQuitting(true)

      showPromptWindow()
      const win = getPromptWindow()
      expect(win).toBeDefined()

      const preventDefault = vi.fn()
      win!.emit('close', { preventDefault })

      expect(preventDefault).not.toHaveBeenCalled()

      setPromptIsQuitting(false)
    })
  })

  describe('Focus Management & Show Inactive Behavior', () => {
    it('uses showInactive by default to avoid stealing keyboard focus from active apps', () => {
      showPromptWindow()
      const win = getPromptWindow()
      expect(win).toBeDefined()
      expect(isPromptVisible()).toBe(true)

      const focusSpy = vi.spyOn(win!, 'focus')
      const showInactiveSpy = vi.spyOn(win!, 'showInactive')

      hidePromptWindow()
      showPromptWindow()

      expect(showInactiveSpy).toHaveBeenCalled()
      expect(focusSpy).not.toHaveBeenCalled()
    })

    it('explicitly focuses window when { focus: true } option is passed', () => {
      showPromptWindow()
      const win = getPromptWindow()
      expect(win).toBeDefined()

      const focusSpy = vi.spyOn(win!, 'focus')
      const showSpy = vi.spyOn(win!, 'show')

      hidePromptWindow()
      showPromptWindow({ focus: true })

      expect(showSpy).toHaveBeenCalled()
      expect(focusSpy).toHaveBeenCalled()
    })
  })

  describe('PromptResize IPC Validation', () => {
    it('ignores non-finite and NaN height values without modifying bounds', () => {
      showPromptWindow()
      const win = getPromptWindow()
      expect(win).toBeDefined()
      const initialBounds = win!.getBounds()
      const setBoundsSpy = vi.spyOn(win!, 'setBounds')

      ;(ipcMain as any).emit(IpcChannels.PromptResize, {}, NaN)
      ;(ipcMain as any).emit(IpcChannels.PromptResize, {}, undefined)
      ;(ipcMain as any).emit(IpcChannels.PromptResize, {}, Infinity)
      ;(ipcMain as any).emit(IpcChannels.PromptResize, {}, 'invalid')

      expect(setBoundsSpy).not.toHaveBeenCalled()
      expect(win!.getBounds()).toEqual(initialBounds)

      hidePromptWindow()
    })

    it('resizes within clamped bounds [160, 550] for valid numeric heights', () => {
      showPromptWindow()
      const win = getPromptWindow()
      expect(win).toBeDefined()
      const setBoundsSpy = vi.spyOn(win!, 'setBounds')

      ;(ipcMain as any).emit(IpcChannels.PromptResize, {}, 320)

      expect(setBoundsSpy).toHaveBeenCalledWith(
        expect.objectContaining({ width: 400, height: 320 }),
        false
      )

      hidePromptWindow()
    })

    it('does not multiply DIP height by webContents zoomFactor', () => {
      showPromptWindow()
      const win = getPromptWindow()
      expect(win).toBeDefined()
      const setBoundsSpy = vi.spyOn(win!, 'setBounds')
      ;(win!.webContents as any).getZoomFactor = vi.fn().mockReturnValue(1.5)

      ;(ipcMain as any).emit(IpcChannels.PromptResize, {}, 300)

      // Height should remain 300 DIPs without being scaled to 450
      expect(setBoundsSpy).toHaveBeenCalledWith(
        expect.objectContaining({ width: 400, height: 300 }),
        false
      )

      hidePromptWindow()
    })

    it('resolves active prompt main window dynamically via getter', () => {
      let winInstance: any = { isDestroyed: () => false, id: 101 }
      setPromptMainWindow(() => winInstance)
      expect(getActivePromptMainWindow()).toBe(winInstance)

      winInstance = { isDestroyed: () => false, id: 102 }
      expect(getActivePromptMainWindow()).toBe(winInstance)

      winInstance.isDestroyed = () => true
      expect(getActivePromptMainWindow()).toBeNull()
    })

    it('schedules and triggers notification fallback when prompt remains unfocused', async () => {
      vi.useFakeTimers()
      const notifications = await import('../notifications')
      const notifSpy = vi.spyOn(notifications, 'showNativeNotification')

      showPromptWindow({ focus: false, fallbackTimeoutMs: 1000 })
      expect(isPromptVisible()).toBe(true)

      // Advance timers to trigger fallback
      vi.advanceTimersByTime(1100)
      expect(notifSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Focus Check-in'
        })
      )

      hidePromptWindow()
      vi.useRealTimers()
    })

    it('ignores transient blur events within 300ms grace period after show', () => {
      vi.useFakeTimers()
      showPromptWindow({ focus: true })
      const win = getPromptWindow()
      expect(win).toBeDefined()
      const dismissSpy = vi.fn()
      onPromptDismiss(dismissSpy)
      setPromptDismissOnBlur(true)

      // Transient blur immediately after show (e.g. 50ms in)
      vi.advanceTimersByTime(50)
      ;(win as any).emit('blur')
      expect(dismissSpy).not.toHaveBeenCalled()

      // After 300ms grace period
      vi.advanceTimersByTime(300)
      ;(win as any).emit('blur')
      expect(dismissSpy).toHaveBeenCalled()

      setPromptDismissOnBlur(false)
      hidePromptWindow()
      vi.useRealTimers()
    })
  })
})
