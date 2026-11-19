import { app, BrowserWindow, screen, Display } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { atomicWriteJson } from '../syncUtils'
import { getActiveDisplay } from '../windows/prompt'

export interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
  isMaximized: boolean
}

const DEFAULT_MAIN_WIDTH = 1280
const DEFAULT_MAIN_HEIGHT = 840
const MIN_MAIN_WIDTH = 780
const MIN_MAIN_HEIGHT = 560

export class WindowLayoutService {
  private static instance: WindowLayoutService | null = null
  private displayListenersAttached = false
  private saveDebounceTimer: NodeJS.Timeout | null = null

  public static getInstance(): WindowLayoutService {
    if (!WindowLayoutService.instance) {
      WindowLayoutService.instance = new WindowLayoutService()
    }
    return WindowLayoutService.instance
  }

  public getWindowStateFilePath(): string {
    return join(app.getPath('userData'), 'window-state.json')
  }

  /**
   * Checks whether the given rectangle intersects any active connected display.
   * Leeway of 10px ensures window borders touching edges are preserved.
   */
  public isPositionInsideAnyDisplay(x: number, y: number, width = 1, height = 1): boolean {
    try {
      if (typeof screen?.getAllDisplays === 'function') {
        const displays = screen.getAllDisplays()
        if (Array.isArray(displays) && displays.length > 0) {
          return displays.some((d) => {
            const b = d?.bounds
            if (!b) return false
            const minOverlap = Math.min(10, Math.min(width, height))
            return (
              x + width - minOverlap >= b.x &&
              x + minOverlap <= b.x + b.width &&
              y + height - minOverlap >= b.y &&
              y + minOverlap <= b.y + b.height
            )
          })
        }
      }
    } catch {
      // fallback
    }
    return true
  }

  /**
   * Finds the best matching display for given coordinates, falling back
   * to active display or primary display if disconnected.
   */
  private resolveTargetDisplay(x?: number, y?: number, width = 1, height = 1): Display {
    const validX = typeof x === 'number' && Number.isFinite(x) ? x : undefined
    const validY = typeof y === 'number' && Number.isFinite(y) ? y : undefined
    const validW = typeof width === 'number' && Number.isFinite(width) && width > 0 ? width : 1
    const validH = typeof height === 'number' && Number.isFinite(height) && height > 0 ? height : 1

    if (
      validX !== undefined &&
      validY !== undefined &&
      this.isPositionInsideAnyDisplay(validX, validY, validW, validH)
    ) {
      try {
        if (typeof screen?.getDisplayMatching === 'function') {
          const match = screen.getDisplayMatching({ x: validX, y: validY, width: validW, height: validH })
          if (match && match.bounds && Number.isFinite(match.bounds.x) && Number.isFinite(match.bounds.width)) {
            return match
          }
        }
        if (typeof screen?.getDisplayNearestPoint === 'function') {
          const nearest = screen.getDisplayNearestPoint({ x: validX, y: validY })
          if (nearest && nearest.bounds && Number.isFinite(nearest.bounds.x) && Number.isFinite(nearest.bounds.width)) {
            return nearest
          }
        }
      } catch {
        // fallback
      }
    }

    try {
      const active = getActiveDisplay()
      if (active && active.bounds && Number.isFinite(active.bounds.x) && Number.isFinite(active.bounds.width)) {
        return active
      }
    } catch {
      // fallback
    }

    try {
      if (typeof screen?.getPrimaryDisplay === 'function') {
        const primary = screen.getPrimaryDisplay()
        if (primary && primary.bounds && Number.isFinite(primary.bounds.x) && Number.isFinite(primary.bounds.width)) {
          return primary
        }
      }
    } catch {
      // fallback
    }

    return {
      id: 0,
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      workAreaSize: { width: 1920, height: 1040 },
      scaleFactor: 1.0,
      rotation: 0,
      internal: false,
      touchSupport: 'unknown',
      accelerometerSupport: 'unknown',
      monochrome: false,
      colorDepth: 24,
      colorSpace: 'srgb',
      depthPerComponent: 8,
      size: { width: 1920, height: 1080 },
      displayFrequency: 60
    } as unknown as Display
  }

  /**
   * Clamps window bounds within display boundaries.
   * If useWorkArea is true, respects taskbar/dock insets (standard for main windows).
   * If false, respects full display bounds (standard for floating widget).
   */
  public clampBounds(
    bounds: { x: number; y: number; width: number; height: number },
    targetDisplay?: Display,
    useWorkArea = true
  ): { x: number; y: number; width: number; height: number } {
    const display =
      targetDisplay && targetDisplay.bounds && Number.isFinite(targetDisplay.bounds.x)
        ? targetDisplay
        : this.resolveTargetDisplay()

    const rawArea = useWorkArea ? display.workArea || display.bounds : display.bounds
    const area =
      rawArea && Number.isFinite(rawArea.x) && Number.isFinite(rawArea.width)
        ? rawArea
        : { x: 0, y: 0, width: 1920, height: 1080 }

    const minW = useWorkArea ? MIN_MAIN_WIDTH : 1
    const minH = useWorkArea ? MIN_MAIN_HEIGHT : 1

    const reqW =
      Number.isFinite(bounds?.width) && bounds.width > 0
        ? bounds.width
        : useWorkArea
          ? DEFAULT_MAIN_WIDTH
          : 260
    const reqH =
      Number.isFinite(bounds?.height) && bounds.height > 0
        ? bounds.height
        : useWorkArea
          ? DEFAULT_MAIN_HEIGHT
          : 72

    const width = Math.min(area.width, Math.max(minW, reqW))
    const height = Math.min(area.height, Math.max(minH, reqH))

    const rawX = Number.isFinite(bounds?.x) ? bounds.x : area.x
    const rawY = Number.isFinite(bounds?.y) ? bounds.y : area.y

    const clampedX = Math.max(area.x, Math.min(rawX, area.x + area.width - width))
    const clampedY = Math.max(area.y, Math.min(rawY, area.y + area.height - height))

    return {
      x: Math.round(clampedX),
      y: Math.round(clampedY),
      width: Math.round(width),
      height: Math.round(height)
    }
  }

  /**
   * Loads saved main window state with multi-monitor disconnection protection.
   */
  public loadWindowState(): WindowState {
    try {
      const file = this.getWindowStateFilePath()
      if (existsSync(file)) {
        const raw = readFileSync(file, 'utf-8')
        const data = JSON.parse(raw)
        if (typeof data.width === 'number' && typeof data.height === 'number') {
          const hasPos =
            typeof data.x === 'number' &&
            typeof data.y === 'number' &&
            this.isPositionInsideAnyDisplay(data.x, data.y, data.width, data.height)

          const targetDisplay = this.resolveTargetDisplay(
            hasPos ? data.x : undefined,
            hasPos ? data.y : undefined,
            data.width,
            data.height
          )

          const workArea = targetDisplay.workArea || targetDisplay.bounds
          const width = Math.min(workArea.width, Math.max(MIN_MAIN_WIDTH, data.width))
          const height = Math.min(workArea.height, Math.max(MIN_MAIN_HEIGHT, data.height))

          if (hasPos) {
            return {
              x: Math.max(workArea.x, Math.min(data.x, workArea.x + workArea.width - width)),
              y: Math.max(workArea.y, Math.min(data.y, workArea.y + workArea.height - height)),
              width,
              height,
              isMaximized: true
            }
          }

          // Off-screen / monitor disconnected: omit x,y to center on active display
          return {
            width,
            height,
            isMaximized: true
          }
        }
      }
    } catch {
      // fallback
    }

    const targetDisplay = getActiveDisplay()
    const workArea = targetDisplay.workArea || targetDisplay.bounds
    const defaultWidth = Math.min(
      DEFAULT_MAIN_WIDTH,
      Math.max(MIN_MAIN_WIDTH, Math.round(workArea.width * 0.85))
    )
    const defaultHeight = Math.min(
      DEFAULT_MAIN_HEIGHT,
      Math.max(MIN_MAIN_HEIGHT, Math.round(workArea.height * 0.85))
    )

    return {
      width: defaultWidth,
      height: defaultHeight,
      isMaximized: true
    }
  }

  /**
   * Extracts normal bounds from a window (handling maximized/minimized states).
   */
  private extractWindowBounds(win: BrowserWindow): WindowState | null {
    if (!win || win.isDestroyed()) return null
    const isMaximized = typeof win.isMaximized === 'function' ? win.isMaximized() : false
    const isMinimized = typeof win.isMinimized === 'function' ? win.isMinimized() : false
    let bounds: { x: number; y: number; width: number; height: number }
    if ((isMaximized || isMinimized) && typeof win.getNormalBounds === 'function') {
      bounds = win.getNormalBounds()
    } else {
      bounds = win.getBounds()
    }

    return {
      x: bounds.x,
      y: bounds.y,
      width: Math.max(MIN_MAIN_WIDTH, bounds.width),
      height: Math.max(MIN_MAIN_HEIGHT, bounds.height),
      isMaximized
    }
  }

  /**
   * Synchronously saves window state (guaranteeing flush on app close).
   */
  public saveWindowStateSync(win: BrowserWindow): void {
    try {
      const state = this.extractWindowBounds(win)
      if (!state) return
      writeFileSync(this.getWindowStateFilePath(), JSON.stringify(state, null, 2), 'utf-8')
    } catch {
      // ignore
    }
  }

  /**
   * Asynchronously saves window state using atomic write.
   */
  private async saveWindowStateAsync(win: BrowserWindow): Promise<void> {
    try {
      const state = this.extractWindowBounds(win)
      if (!state) return
      await atomicWriteJson(this.getWindowStateFilePath(), state)
    } catch {
      // ignore
    }
  }

  /**
   * Debounced save to prevent disk thrashing during window resize/drag.
   */
  public scheduleSaveWindowState(win: BrowserWindow, delayMs = 400): void {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer)
    }
    this.saveDebounceTimer = setTimeout(() => {
      this.saveDebounceTimer = null
      this.saveWindowStateAsync(win).catch(() => {})
    }, delayMs)
  }

  /**
   * Re-clamps a live window onto an active display if its position has become off-screen
   * (e.g. after an external display is disconnected or resolution/DPI scale changes).
   */
  public ensureWindowOnScreen(win: BrowserWindow, useWorkArea = true): boolean {
    if (!win || win.isDestroyed()) return false
    try {
      const bounds = win.getBounds()
      const targetDisplay = this.resolveTargetDisplay(
        bounds.x,
        bounds.y,
        bounds.width,
        bounds.height
      )
      const clamped = this.clampBounds(bounds, targetDisplay, useWorkArea)

      if (
        clamped.x !== bounds.x ||
        clamped.y !== bounds.y ||
        clamped.width !== bounds.width ||
        clamped.height !== bounds.height
      ) {
        win.setBounds(clamped)
        return true
      }
    } catch {
      // ignore
    }
    return false
  }

  /**
   * Registers global screen event listeners to automatically re-clamp managed windows
   * when displays are added, removed, or monitor resolution/metrics change.
   */
  public setupScreenChangeListeners(options: {
    getMainWindow?: () => BrowserWindow | null
    getWidgetWindow?: () => BrowserWindow | null
  }): () => void {
    if (this.displayListenersAttached) {
      return () => {}
    }
    this.displayListenersAttached = true

    const handleDisplayChange = (): void => {
      try {
        const mainWin = options.getMainWindow?.()
        if (mainWin && !mainWin.isDestroyed()) {
          this.ensureWindowOnScreen(mainWin, true)
        }
        const widgetWin = options.getWidgetWindow?.()
        if (widgetWin && !widgetWin.isDestroyed()) {
          this.ensureWindowOnScreen(widgetWin, false)
        }
      } catch {
        // ignore
      }
    }

    try {
      if (typeof screen?.on === 'function') {
        screen.on('display-added', handleDisplayChange)
        screen.on('display-removed', handleDisplayChange)
        screen.on('display-metrics-changed', handleDisplayChange)
      }
    } catch {
      // ignore
    }

    return () => {
      try {
        if (typeof screen?.removeListener === 'function') {
          screen.removeListener('display-added', handleDisplayChange)
          screen.removeListener('display-removed', handleDisplayChange)
          screen.removeListener('display-metrics-changed', handleDisplayChange)
        }
      } catch {
        // ignore
      }
      this.displayListenersAttached = false
    }
  }

  public _resetForTesting(): void {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer)
      this.saveDebounceTimer = null
    }
    this.displayListenersAttached = false
  }
}
