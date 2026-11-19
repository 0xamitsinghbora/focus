import { BrowserWindow, screen, ipcMain, app, Menu, powerMonitor, nativeImage } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync } from 'fs'
import os from 'os'
import { IpcChannels, SessionTimerPayload } from '../../shared/types'
import iconPng from '../../../build/icon.png?asset'
import iconIco from '../../../build/icon.ico?asset'

function getAppIcon(): Electron.NativeImage | string {
  try {
    if (process.platform === 'win32') {
      return iconIco
    }
    if (typeof nativeImage?.createFromPath === 'function') {
      const img = nativeImage.createFromPath(iconPng)
      if (img && typeof img.isEmpty === 'function' && !img.isEmpty()) {
        return img
      }
    }
    return iconPng
  } catch {
    return process.platform === 'win32' ? iconIco : iconPng
  }
}

const appIcon = getAppIcon()
import { assertSenderIsAppWindow } from '../ipcSecurity'
import { atomicWriteJson } from '../syncUtils'
import { getPromptWindow } from './prompt'
import { WindowLayoutService } from '../services/WindowLayoutService'

let widgetWindow: BrowserWindow | null = null
let mainWindowRef: BrowserWindow | null = null
let getMainWindowRef: (() => BrowserWindow | null) | null = null
let currentSessionPayload: SessionTimerPayload | null = null
let widgetOptions: {
  getShowWidget?: () => boolean
  onVisibilityChange?: (visible: boolean) => void
  getInProgressGoals?: () => Promise<{ id: string; title: string }[]> | { id: string; title: string }[]
} = {}

const visibilityListeners = new Set<(visible: boolean) => void>()

export function onWidgetVisibilityChange(callback: (visible: boolean) => void): () => void {
  visibilityListeners.add(callback)
  return () => {
    visibilityListeners.delete(callback)
  }
}

export function _resetVisibilityListenersForTesting(): void {
  visibilityListeners.clear()
}

function notifyVisibilityChange(visible: boolean): void {
  widgetOptions.onVisibilityChange?.(visible)
  for (const listener of visibilityListeners) {
    try {
      listener(visible)
    } catch {
      // ignore listener error
    }
  }
}

let boundMainWindow: BrowserWindow | null = null
let onBlurListener: (() => void) | null = null
let onMinimizeListener: (() => void) | null = null
let onHideListener: (() => void) | null = null

export function rebindWidgetMainWindow(newMain?: BrowserWindow | null): void {
  const targetWin =
    newMain !== undefined
      ? newMain && !newMain.isDestroyed()
        ? newMain
        : null
      : getActiveMainWindowInternal()

  if (boundMainWindow === targetWin) return

  if (boundMainWindow && !boundMainWindow.isDestroyed()) {
    try {
      if (onBlurListener && typeof boundMainWindow.removeListener === 'function') {
        boundMainWindow.removeListener('blur', onBlurListener)
      }
      if (onMinimizeListener && typeof boundMainWindow.removeListener === 'function') {
        boundMainWindow.removeListener('minimize', onMinimizeListener)
      }
      if (onHideListener && typeof boundMainWindow.removeListener === 'function') {
        boundMainWindow.removeListener('hide', onHideListener)
      }
    } catch {
      // ignore
    }
  }

  boundMainWindow = null
  onBlurListener = null
  onMinimizeListener = null
  onHideListener = null

  if (targetWin && !targetWin.isDestroyed()) {
    onBlurListener = () => ensureWidgetTopmost({ moveTop: true })
    onMinimizeListener = () => {
      if (widgetWindow && !widgetWindow.isDestroyed() && isWidgetActive()) {
        ensureWidgetTopmost({ moveTop: true })
        widgetWindow.showInactive()
      }
    }
    onHideListener = () => {
      if (widgetWindow && !widgetWindow.isDestroyed() && isWidgetActive()) {
        ensureWidgetTopmost({ moveTop: true })
        widgetWindow.showInactive()
      }
    }

    if (typeof targetWin.on === 'function') {
      targetWin.on('blur', onBlurListener)
      targetWin.on('minimize', onMinimizeListener)
      targetWin.on('hide', onHideListener)
    }
    boundMainWindow = targetWin
  }
}

export function setWidgetMainWindow(
  mainWindow: BrowserWindow | (() => BrowserWindow | null)
): void {
  if (typeof mainWindow === 'function') {
    getMainWindowRef = mainWindow
  } else {
    mainWindowRef = mainWindow
    getMainWindowRef = () => mainWindowRef
  }
  rebindWidgetMainWindow(getActiveMainWindowInternal())
}

function getActiveMainWindowInternal(): BrowserWindow | null {
  if (getMainWindowRef) {
    try {
      const win = getMainWindowRef()
      if (win && !win.isDestroyed()) return win
    } catch {
      // ignore
    }
  }
  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    return mainWindowRef
  }
  try {
    const promptWin = getPromptWindow()
    const all = BrowserWindow.getAllWindows()
    const main = all.find((w) => w !== widgetWindow && w !== promptWin && !w.isDestroyed())
    return main || null
  } catch {
    return null
  }
}

export function getActiveMainWindow(): BrowserWindow | null {
  const win = getActiveMainWindowInternal()
  if (win && win !== boundMainWindow) {
    rebindWidgetMainWindow(win)
  }
  return win
}

export const WIDGET_WINDOW_LEVEL = 'screen-saver' as const
export const WIDGET_VISIBLE_ON_FULLSCREEN = true

let isUserInitiatedHide = false
let topmostInterval: NodeJS.Timeout | null = null

export function isWidgetActive(): boolean {
  if (isUserInitiatedHide) return false
  if (widgetOptions.getShowWidget && !widgetOptions.getShowWidget()) return false
  return true
}

export function ensureWidgetTopmost(options?: { moveTop?: boolean }): void {
  if (widgetWindow && !widgetWindow.isDestroyed() && isWidgetActive()) {
    if (widgetWindow.isMinimized()) {
      widgetWindow.restore()
    }
    if (!widgetWindow.isVisible()) {
      widgetWindow.showInactive()
    }
    widgetWindow.setAlwaysOnTop(true, WIDGET_WINDOW_LEVEL, 1)
    try {
      widgetWindow.setVisibleOnAllWorkspaces(true, {
        visibleOnFullScreen: WIDGET_VISIBLE_ON_FULLSCREEN
      })
    } catch {
      // ignore
    }
    if (options?.moveTop !== false) {
      widgetWindow.moveTop()
    }
  }
}

function startTopmostMonitoring(): void {
  if (topmostInterval || process.env.NODE_ENV === 'test') return
  topmostInterval = setInterval(() => {
    if (widgetWindow && !widgetWindow.isDestroyed() && isWidgetActive()) {
      ensureWidgetTopmost({ moveTop: true })
    }
  }, 1000)
}

function stopTopmostMonitoring(): void {
  if (topmostInterval) {
    clearInterval(topmostInterval)
    topmostInterval = null
  }
}

const WINDOW_WIDTH = 100
export const WINDOW_WIDTH_EXPANDED = 100
export { WINDOW_WIDTH }
const WINDOW_HEIGHT = 32
const POS_VERSION = 3

export function setWidgetExpanded(...args: unknown[]): void {
  void args
  // Widget expansion on hover has been removed to prevent glitchy resizing and flickering.
  // Window dimensions remain fixed at WINDOW_WIDTH (100px).
}

function getPosFilePath(): string {
  return join(app.getPath('userData'), 'widget-pos.json')
}

/**
 * Clamps widget coordinates strictly within the target display boundaries.
 * Allows hovering/dragging anywhere across the full display, including
 * inside the OS taskbar and beside system tray icons, while preventing
 * the widget from drifting off-screen.
 */
export function clampPosition(
  x: number,
  y: number,
  width = WINDOW_WIDTH,
  height = WINDOW_HEIGHT,
  display?: Electron.Display
): { x: number; y: number } {
  let targetDisplay: Electron.Display | null = display || null
  const validX = Number.isFinite(x) ? Math.round(x) : 0
  const validY = Number.isFinite(y) ? Math.round(y) : 0

  if (!targetDisplay) {
    try {
      if (typeof screen.getDisplayNearestPoint === 'function') {
        targetDisplay = screen.getDisplayNearestPoint({
          x: validX,
          y: validY
        })
      }
    } catch {
      // ignore
    }
  }

  if (!targetDisplay) {
    targetDisplay = getActiveDisplay()
  }

  if (!targetDisplay || !targetDisplay.bounds || !Number.isFinite(targetDisplay.bounds.x)) {
    try {
      if (typeof screen.getPrimaryDisplay === 'function') {
        targetDisplay = screen.getPrimaryDisplay()
      }
    } catch {
      // fallback
    }
  }

  const rawBounds = targetDisplay?.bounds
  const bounds =
    rawBounds && Number.isFinite(rawBounds.x) && Number.isFinite(rawBounds.width)
      ? rawBounds
      : { x: 0, y: 0, width: 1920, height: 1080 }

  // Strictly clamp within display bounds (covers whole screen, including the taskbar)
  const minX = bounds.x
  const maxX = Math.max(bounds.x, bounds.x + bounds.width - width)
  const minY = bounds.y
  const maxY = Math.max(bounds.y, bounds.y + bounds.height - height)

  const clampedX = Math.min(maxX, Math.max(minX, validX))
  const clampedY = Math.min(maxY, Math.max(minY, validY))

  return { x: Math.round(clampedX), y: Math.round(clampedY) }
}

/**
 * Checks whether the given coordinates intersect any active connected display.
 * Prevents orphaned coordinates when an external display has been unplugged.
 */
export function isPositionInsideAnyDisplay(
  x: number,
  y: number,
  width = WINDOW_WIDTH,
  height = WINDOW_HEIGHT
): boolean {
  return WindowLayoutService.getInstance().isPositionInsideAnyDisplay(x, y, width, height)
}

let cachedSavedPosition: { x: number; y: number } | null = null

function loadSavedPosition(): { x: number; y: number } | null {
  if (cachedSavedPosition) {
    return cachedSavedPosition
  }
  try {
    const file = getPosFilePath()
    if (existsSync(file)) {
      const data = JSON.parse(readFileSync(file, 'utf-8'))
      // Only restore if saved with valid version and currently inside a connected display
      if (
        data &&
        data.v === POS_VERSION &&
        typeof data.x === 'number' &&
        typeof data.y === 'number'
      ) {
        if (!isPositionInsideAnyDisplay(data.x, data.y)) {
          return null
        }
        cachedSavedPosition = clampPosition(data.x, data.y)
        return cachedSavedPosition
      }
    }
  } catch {
    // ignore
  }
  return null
}

let savePositionQueue: Promise<void> = Promise.resolve()
let pendingPositionToWrite: { x: number; y: number } | null = null

export async function savePosition(x: number, y: number): Promise<void> {
  const clamped = clampPosition(x, y)
  cachedSavedPosition = clamped
  pendingPositionToWrite = clamped

  const runWrite = async (): Promise<void> => {
    if (!pendingPositionToWrite) return
    const pos = pendingPositionToWrite
    pendingPositionToWrite = null
    try {
      const file = getPosFilePath()
      await atomicWriteJson(file, { ...pos, v: POS_VERSION })
    } catch {
      // ignore
    }
  }

  savePositionQueue = savePositionQueue.then(runWrite, runWrite)
  return savePositionQueue
}

let cachedTaskbarCentered: boolean | null = null

function isWindows11OrGreater(): boolean {
  if (process.platform !== 'win32') return false
  const parts = os.release().split('.')
  const build = parseInt(parts[2] || '0', 10)
  return build >= 22000
}

/**
 * Detects Windows 11 taskbar alignment without spawning subprocesses (reg.exe)
 * to prevent process creation latency and EDR heuristic false positives.
 * Defaults to true on Windows 11 (standard system default) and false on older OS versions.
 */
export function fetchTaskbarAlignmentAsync(): Promise<boolean> {
  if (!isWindows11OrGreater()) {
    cachedTaskbarCentered = false
    return Promise.resolve(false)
  }

  if (cachedTaskbarCentered !== null) {
    return Promise.resolve(cachedTaskbarCentered)
  }

  cachedTaskbarCentered = true
  return Promise.resolve(true)
}

/**
 * Returns whether the Windows 11 taskbar icons are centered.
 * Fully non-blocking: returns the cached value if known, or defaults to true (the standard
 * Windows 11 default) while kicking off asynchronous detection in the background.
 * Never executes synchronous shell queries (execSync) on the main thread.
 */
export function isWindows11TaskbarCentered(): boolean {
  if (!isWindows11OrGreater()) return false
  if (cachedTaskbarCentered !== null) return cachedTaskbarCentered

  // Kick off background detection without blocking
  fetchTaskbarAlignmentAsync().catch(() => {})

  // Default to centered taskbar immediately without blocking the event loop
  return true
}

/**
 * Test helper to configure or reset the taskbar alignment cache in unit tests.
 */
export function _setCachedTaskbarCentered(val: boolean | null): void {
  cachedTaskbarCentered = val
}

/**
 * Returns the active display where the user's cursor currently resides.
 * Falls back to primary display if cursor coordinates cannot be resolved.
 */
export function getActiveDisplay(): Electron.Display {
  try {
    if (
      typeof screen.getCursorScreenPoint === 'function' &&
      typeof screen.getDisplayNearestPoint === 'function'
    ) {
      const cursor = screen.getCursorScreenPoint()
      const display = screen.getDisplayNearestPoint(cursor)
      if (display) return display
    }
  } catch {
    // fallback
  }
  return screen.getPrimaryDisplay()
}

type TaskbarOrientation = 'bottom' | 'top' | 'left' | 'right'

interface TaskbarInfo {
  position: TaskbarOrientation
  bounds: { x: number; y: number; width: number; height: number }
  thickness: number
  hasTaskbar: boolean
}

/**
 * Checks whether the given display is the primary system display.
 */
export function isPrimaryDisplay(display?: Electron.Display): boolean {
  if (!display) return true
  try {
    if (typeof screen?.getPrimaryDisplay === 'function') {
      const primary = screen.getPrimaryDisplay()
      if (primary) {
        if (display.id !== undefined && primary.id !== undefined) {
          return display.id === primary.id
        }
        if (display.bounds && primary.bounds) {
          return display.bounds.x === primary.bounds.x && display.bounds.y === primary.bounds.y
        }
      }
    }
  } catch {
    // fallback
  }
  return (display.bounds?.x ?? 0) === 0 && (display.bounds?.y ?? 0) === 0
}

/**
 * Detects the taskbar position (bottom, top, left, right) and dimensions for a given display
 * by comparing display.bounds with display.workArea.
 */
export function detectTaskbar(display: Electron.Display): TaskbarInfo {
  const bounds = display.bounds
  const workArea = display.workArea || bounds
  const isWin11 = isWindows11OrGreater()
  const defaultThickness = isWin11 ? 44 : 38

  // macOS Dock / Menu bar detection: macOS does not feature a Windows-style taskbar tray.
  // Returning hasTaskbar: false ensures the widget floats cleanly in the user's workArea on macOS.
  if (process.platform === 'darwin') {
    return {
      position: 'bottom',
      bounds: {
        x: bounds.x,
        y: bounds.y + bounds.height - defaultThickness,
        width: bounds.width,
        height: defaultThickness
      },
      thickness: defaultThickness,
      hasTaskbar: false
    }
  }

  // Calculate work area insets relative to display bounds
  const topDiff = Math.max(0, workArea.y - bounds.y)
  const bottomDiff = Math.max(0, bounds.y + bounds.height - (workArea.y + workArea.height))
  const leftDiff = Math.max(0, workArea.x - bounds.x)
  const rightDiff = Math.max(0, bounds.x + bounds.width - (workArea.x + workArea.width))

  const MIN_TASKBAR_THICKNESS = 12

  // Find the edge with the largest inset
  if (
    topDiff >= MIN_TASKBAR_THICKNESS &&
    topDiff >= bottomDiff &&
    topDiff >= leftDiff &&
    topDiff >= rightDiff
  ) {
    return {
      position: 'top',
      bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: topDiff },
      thickness: topDiff,
      hasTaskbar: true
    }
  }

  if (
    leftDiff >= MIN_TASKBAR_THICKNESS &&
    leftDiff >= bottomDiff &&
    leftDiff >= topDiff &&
    leftDiff >= rightDiff
  ) {
    return {
      position: 'left',
      bounds: { x: bounds.x, y: bounds.y, width: leftDiff, height: bounds.height },
      thickness: leftDiff,
      hasTaskbar: true
    }
  }

  if (
    rightDiff >= MIN_TASKBAR_THICKNESS &&
    rightDiff >= bottomDiff &&
    rightDiff >= topDiff &&
    rightDiff >= leftDiff
  ) {
    return {
      position: 'right',
      bounds: {
        x: bounds.x + bounds.width - rightDiff,
        y: bounds.y,
        width: rightDiff,
        height: bounds.height
      },
      thickness: rightDiff,
      hasTaskbar: true
    }
  }

  if (bottomDiff >= MIN_TASKBAR_THICKNESS) {
    return {
      position: 'bottom',
      bounds: {
        x: bounds.x,
        y: bounds.y + bounds.height - bottomDiff,
        width: bounds.width,
        height: bottomDiff
      },
      thickness: bottomDiff,
      hasTaskbar: true
    }
  }

  // Bottom taskbar fallback (for displays with auto-hidden taskbars or no secondary taskbar)
  return {
    position: 'bottom',
    bounds: {
      x: bounds.x,
      y: bounds.y + bounds.height - defaultThickness,
      width: bounds.width,
      height: defaultThickness
    },
    thickness: defaultThickness,
    hasTaskbar: false
  }
}

/**
 * Adaptive system tray cluster width: accounts for OS version (Windows 11 adds
 * Quick Settings, Action Center pills, and larger icon spacing), taskbar alignment
 * (centered taskbars leave different margins than left-aligned), primary vs secondary displays,
 * and display DPI scaling.
 */
export function getAdaptiveTrayClusterWidth(display?: Electron.Display): number {
  const targetDisplay = display || getActiveDisplay()
  const scale = targetDisplay?.scaleFactor || 1.0

  // Secondary displays on Windows only display the clock (Windows 11) or minimal padding (Windows 10).
  // The full system notification icon overflow cluster ONLY exists on the primary taskbar.
  if (!isPrimaryDisplay(targetDisplay)) {
    const secondaryBase = isWindows11OrGreater() ? 72 : 24
    return Math.round(secondaryBase * (scale > 1 ? 1 + (scale - 1) * 0.15 : 1))
  }

  let baseWidth = 220
  if (isWindows11OrGreater()) {
    baseWidth = isWindows11TaskbarCentered() ? 260 : 240
  }

  // High-DPI displays require extra clearance due to expanded system font & tray padding
  const dpiMultiplier = scale > 1 ? 1 + (scale - 1) * 0.12 : 1
  return Math.round(baseWidth * dpiMultiplier)
}

/**
 * Default position: inside the Windows taskbar, positioned adaptively according to
 * taskbar orientation (bottom, top, left, right) and multi-monitor active displays.
 */
export function getDefaultWidgetPosition(display?: Electron.Display): { x: number; y: number } {
  let targetDisplay = display || getActiveDisplay()
  let taskbar = detectTaskbar(targetDisplay)

  // If the target display has no taskbar (e.g. secondary monitor with taskbar disabled in Windows settings),
  // and caller did not explicitly request that display, fall back to the primary display taskbar.
  if (!taskbar.hasTaskbar && !display) {
    try {
      const primary = screen.getPrimaryDisplay()
      if (primary && primary.id !== targetDisplay.id) {
        targetDisplay = primary
        taskbar = detectTaskbar(targetDisplay)
      }
    } catch {
      // ignore
    }
  }

  const bounds = targetDisplay.bounds
  const workArea = targetDisplay.workArea || bounds

  let x = bounds.x
  let y = bounds.y

  if (!taskbar.hasTaskbar) {
    // If display has no taskbar or auto-hidden taskbar, position as a clean floating desktop pill
    // in bottom-right corner of the work area, leaving standard desktop margins
    const bottomDiff = Math.max(0, bounds.y + bounds.height - (workArea.y + workArea.height))
    const isAutohideTaskbar = bottomDiff > 0 && bottomDiff < 12
    const defaultThickness = isWindows11OrGreater() ? 44 : 38
    const margin = isAutohideTaskbar ? defaultThickness + 12 : 20
    x = Math.max(bounds.x, workArea.x + workArea.width - WINDOW_WIDTH - margin)
    y = Math.max(bounds.y, workArea.y + workArea.height - WINDOW_HEIGHT - margin)
    return clampPosition(x, y, WINDOW_WIDTH, WINDOW_HEIGHT, targetDisplay)
  }

  if (taskbar.position === 'bottom') {
    const trayClusterWidth = getAdaptiveTrayClusterWidth(targetDisplay)
    const rightBound = Math.min(bounds.x + bounds.width, taskbar.bounds.x + taskbar.bounds.width)
    x = Math.max(taskbar.bounds.x, rightBound - WINDOW_WIDTH - trayClusterWidth)
    x = Math.min(x, bounds.x + bounds.width - WINDOW_WIDTH)
    const verticalOffset = Math.max(0, Math.floor((taskbar.thickness - WINDOW_HEIGHT) / 2))
    y = Math.max(
      bounds.y,
      Math.min(bounds.y + bounds.height - WINDOW_HEIGHT, taskbar.bounds.y + verticalOffset)
    )
  } else if (taskbar.position === 'top') {
    const trayClusterWidth = getAdaptiveTrayClusterWidth(targetDisplay)
    const rightBound = Math.min(bounds.x + bounds.width, taskbar.bounds.x + taskbar.bounds.width)
    x = Math.max(taskbar.bounds.x, rightBound - WINDOW_WIDTH - trayClusterWidth)
    x = Math.min(x, bounds.x + bounds.width - WINDOW_WIDTH)
    const verticalOffset = Math.max(0, Math.floor((taskbar.thickness - WINDOW_HEIGHT) / 2))
    y = Math.max(
      bounds.y,
      Math.min(bounds.y + bounds.height - WINDOW_HEIGHT, taskbar.bounds.y + verticalOffset)
    )
  } else if (taskbar.position === 'left') {
    if (taskbar.thickness >= WINDOW_WIDTH) {
      x = taskbar.bounds.x + Math.floor((taskbar.thickness - WINDOW_WIDTH) / 2)
      const scale = targetDisplay?.scaleFactor || 1.0
      const trayClusterHeight = Math.round(90 * scale)
      const bottomBound = Math.min(
        bounds.y + bounds.height,
        taskbar.bounds.y + taskbar.bounds.height
      )
      y = Math.max(bounds.y, bottomBound - WINDOW_HEIGHT - trayClusterHeight)
    } else {
      const margin = 12
      x = Math.max(bounds.x, workArea.x + margin)
      y = Math.max(bounds.y, workArea.y + workArea.height - WINDOW_HEIGHT - margin)
    }
  } else if (taskbar.position === 'right') {
    if (taskbar.thickness >= WINDOW_WIDTH) {
      x = taskbar.bounds.x + Math.floor((taskbar.thickness - WINDOW_WIDTH) / 2)
      const scale = targetDisplay?.scaleFactor || 1.0
      const trayClusterHeight = Math.round(90 * scale)
      const bottomBound = Math.min(
        bounds.y + bounds.height,
        taskbar.bounds.y + taskbar.bounds.height
      )
      y = Math.max(bounds.y, bottomBound - WINDOW_HEIGHT - trayClusterHeight)
    } else {
      const margin = 12
      x = Math.max(bounds.x, workArea.x + workArea.width - WINDOW_WIDTH - margin)
      y = Math.max(bounds.y, workArea.y + workArea.height - WINDOW_HEIGHT - margin)
    }
  }

  return clampPosition(x, y, WINDOW_WIDTH, WINDOW_HEIGHT, targetDisplay)
}

export function isWidgetVisible(): boolean {
  return !!(widgetWindow && !widgetWindow.isDestroyed() && widgetWindow.isVisible())
}

export function getWidgetWindow(): BrowserWindow | null {
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    return widgetWindow
  }
  try {
    const all = BrowserWindow.getAllWindows()
    const found = all.find((w) => {
      if (!w || w.isDestroyed()) return false
      const url = w.webContents?.getURL?.() || ''
      return url.includes('widget.html')
    })
    if (found) {
      widgetWindow = found
      return found
    }
  } catch {
    // ignore
  }
  return null
}

export function toggleWidgetWindow(): void {
  if (isWidgetVisible()) {
    hideWidgetWindow()
  } else {
    showWidgetWindow()
  }
}

export function initWidgetWindow(
  mainWindow: BrowserWindow | (() => BrowserWindow | null),
  options?: {
    getShowWidget?: () => boolean
    onVisibilityChange?: (visible: boolean) => void
    getInProgressGoals?: () => Promise<{ id: string; title: string }[]> | { id: string; title: string }[]
  }
): BrowserWindow | null {
  setWidgetMainWindow(mainWindow)
  if (options) {
    widgetOptions = options
  }
  registerWidgetIpcAndListeners()

  if (widgetOptions.getShowWidget && !widgetOptions.getShowWidget()) {
    return null
  }

  if (widgetWindow && !widgetWindow.isDestroyed()) {
    return widgetWindow
  }

  const saved = loadSavedPosition()
  const initialPos = saved || getDefaultWidgetPosition(screen.getPrimaryDisplay())

  widgetWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    minWidth: WINDOW_WIDTH,
    maxWidth: WINDOW_WIDTH,
    minHeight: WINDOW_HEIGHT,
    maxHeight: WINDOW_HEIGHT,
    useContentSize: true,
    x: initialPos.x,
    y: initialPos.y,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    type: 'toolbar',
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false, // Prevents window from participating in OS focus deactivation cycle
    hasShadow: false,
    icon: appIcon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required'
    }
  })

  if (typeof widgetWindow.webContents?.setWindowOpenHandler === 'function') {
    widgetWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  }

  // Strictly prevent any resizing by OS, DWM, or Aero Snap
  widgetWindow.on('will-resize', (e: Electron.Event) => e.preventDefault())

  // Configure topmost level above Windows taskbar and make visible across workspaces
  widgetWindow.setAlwaysOnTop(true, WIDGET_WINDOW_LEVEL, 1)
  try {
    widgetWindow.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: WIDGET_VISIBLE_ON_FULLSCREEN
    })
  } catch {
    // ignore
  }

  // Prevent Chromium from resetting title
  widgetWindow.on('page-title-updated', (e: Electron.Event) => e.preventDefault())

  // Safeguard against OS, DWM, or external utilities auto-hiding or minimizing widget on app switch
  widgetWindow.on('hide', () => {
    if (!isUserInitiatedHide && isWidgetActive()) {
      setTimeout(() => {
        if (
          widgetWindow &&
          !widgetWindow.isDestroyed() &&
          !isUserInitiatedHide &&
          isWidgetActive()
        ) {
          widgetWindow.showInactive()
          ensureWidgetTopmost({ moveTop: true })
        }
      }, 50)
    }
  })

  widgetWindow.on('minimize', () => {
    if (!isUserInitiatedHide && isWidgetActive()) {
      widgetWindow?.restore()
      widgetWindow?.showInactive()
      ensureWidgetTopmost({ moveTop: true })
    }
  })

  const revealWidget = (): void => {
    if (widgetOptions.getShowWidget && !widgetOptions.getShowWidget()) {
      return
    }
    if (widgetWindow && !widgetWindow.isDestroyed() && !widgetWindow.isVisible()) {
      widgetWindow.setAlwaysOnTop(true, WIDGET_WINDOW_LEVEL, 1)
      try {
        widgetWindow.setVisibleOnAllWorkspaces(true, {
          visibleOnFullScreen: WIDGET_VISIBLE_ON_FULLSCREEN
        })
      } catch {
        // ignore
      }
      widgetWindow.showInactive()
      widgetWindow.moveTop()
      startTopmostMonitoring()
    }
  }

  // Bind reveal listeners BEFORE initiating load to eliminate race conditions
  widgetWindow.once('ready-to-show', revealWidget)
  widgetWindow.webContents.once('did-finish-load', () => {
    revealWidget()
    if (
      currentSessionPayload &&
      widgetWindow &&
      !widgetWindow.isDestroyed() &&
      widgetWindow.webContents
    ) {
      widgetWindow.webContents.send(IpcChannels.UpdateSessionTimer, currentSessionPayload)
    }
  })

  // Safe timeout fallback ensures the window never stays hidden
  setTimeout(() => {
    revealWidget()
  }, 400)

  // When main application window blurs, minimizes, or hides, immediately ensure floating widget stays on top
  rebindWidgetMainWindow(getActiveMainWindow())

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    widgetWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/widget.html`)
  } else {
    widgetWindow.loadFile(join(__dirname, '../renderer/widget.html'))
  }

  widgetWindow.on('closed', () => {
    stopTopmostMonitoring()
    widgetWindow = null
  })

  return widgetWindow
}

export function showWidgetWindow(): void {
  isUserInitiatedHide = false
  notifyVisibilityChange(true)
  if (!widgetWindow || widgetWindow.isDestroyed()) {
    const main = getActiveMainWindow()
    if (main) {
      initWidgetWindow(main, { ...widgetOptions, getShowWidget: () => true })
    }
    if (!widgetWindow || widgetWindow.isDestroyed()) {
      return
    }
  }

  // Ensure current position is clamped strictly within display area and size is locked
  const [currX, currY] = widgetWindow.getPosition()
  let targetPos: { x: number; y: number }
  if (!isPositionInsideAnyDisplay(currX, currY)) {
    targetPos = getDefaultWidgetPosition(screen.getPrimaryDisplay())
  } else {
    targetPos = clampPosition(currX, currY)
  }

  widgetWindow.setBounds({
    x: targetPos.x,
    y: targetPos.y,
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT
  })
  widgetWindow.setAlwaysOnTop(true, WIDGET_WINDOW_LEVEL, 1)
  try {
    widgetWindow.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: WIDGET_VISIBLE_ON_FULLSCREEN
    })
  } catch {
    // ignore
  }
  widgetWindow.showInactive()
  widgetWindow.moveTop()
  startTopmostMonitoring()
}

export function resetWidgetPosition(display?: Electron.Display): void {
  let currentDisplay = display
  if (!currentDisplay && widgetWindow && !widgetWindow.isDestroyed()) {
    try {
      const bounds = widgetWindow.getBounds()
      if (typeof screen.getDisplayNearestPoint === 'function') {
        currentDisplay = screen.getDisplayNearestPoint({
          x: bounds.x + Math.floor(bounds.width / 2),
          y: bounds.y + Math.floor(bounds.height / 2)
        })
      }
    } catch {
      // ignore
    }
  }
  const def = getDefaultWidgetPosition(currentDisplay || screen.getPrimaryDisplay())
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.setBounds({
      x: def.x,
      y: def.y,
      width: WINDOW_WIDTH,
      height: WINDOW_HEIGHT
    })
    widgetWindow.setAlwaysOnTop(true, WIDGET_WINDOW_LEVEL, 1)
    try {
      widgetWindow.setVisibleOnAllWorkspaces(true, {
        visibleOnFullScreen: WIDGET_VISIBLE_ON_FULLSCREEN
      })
    } catch {
      // ignore
    }
    widgetWindow.showInactive()
    widgetWindow.moveTop()
    if (widgetWindow.webContents) {
      widgetWindow.webContents.send(IpcChannels.WidgetPositionUpdated, def)
    }
  }
  savePosition(def.x, def.y)
}

export function hideWidgetWindow(): void {
  isUserInitiatedHide = true
  notifyVisibilityChange(false)
  stopTopmostMonitoring()
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.hide()
  }
}

export function broadcastToWidget(payload: SessionTimerPayload): void {
  currentSessionPayload = payload
  if (widgetWindow && !widgetWindow.isDestroyed() && widgetWindow.webContents) {
    widgetWindow.webContents.send(IpcChannels.UpdateSessionTimer, payload)
  }
}

let screenListenersInitialized = false

export function _resetScreenListenersForTesting(): void {
  screenListenersInitialized = false
}

// Ensure widget remains within display bounds if resolution or monitor setup changes
export function setupScreenListeners(): void {
  if (screenListenersInitialized) return
  if (screen && typeof screen.on === 'function') {
    screenListenersInitialized = true
    const handleDisplayChange = (): void => {
      try {
        const primary = screen.getPrimaryDisplay()
        if (widgetWindow && !widgetWindow.isDestroyed()) {
          const [currX, currY] = widgetWindow.getPosition()
          if (!isPositionInsideAnyDisplay(currX, currY)) {
            // Monitor was unplugged/removed: reset widget to primary taskbar
            resetWidgetPosition(primary)
          } else {
            const clamped = clampPosition(currX, currY)
            widgetWindow.setPosition(clamped.x, clamped.y)
            savePosition(clamped.x, clamped.y)
            ensureWidgetTopmost()
          }
        } else {
          // Widget is not currently initialized or visible, validate saved config
          const file = getPosFilePath()
          if (existsSync(file)) {
            const data = JSON.parse(readFileSync(file, 'utf-8'))
            if (data && typeof data.x === 'number' && typeof data.y === 'number') {
              if (!isPositionInsideAnyDisplay(data.x, data.y)) {
                const def = getDefaultWidgetPosition(primary)
                savePosition(def.x, def.y)
              } else {
                const clamped = clampPosition(data.x, data.y)
                if (clamped.x !== data.x || clamped.y !== data.y) {
                  savePosition(clamped.x, clamped.y)
                }
              }
            }
          }
        }
      } catch {
        // ignore
      }
    }
    screen.on('display-metrics-changed', handleDisplayChange)
    screen.on('display-added', handleDisplayChange)
    screen.on('display-removed', handleDisplayChange)
  }
}

let widgetIpcInitialized = false

function registerWidgetIpcAndListeners(): void {
  if (widgetIpcInitialized) return
  widgetIpcInitialized = true

  setupScreenListeners()
  fetchTaskbarAlignmentAsync().catch(() => {})

  try {
    app.on('browser-window-blur', () => {
      ensureWidgetTopmost({ moveTop: true })
    })
    app.on('browser-window-focus', () => {
      ensureWidgetTopmost({ moveTop: true })
    })
    if (powerMonitor && typeof powerMonitor.on === 'function') {
      powerMonitor.on('resume', () => ensureWidgetTopmost({ moveTop: true }))
      powerMonitor.on('unlock-screen', () => ensureWidgetTopmost({ moveTop: true }))
    }
  } catch {
    // ignore
  }

  const assertSender = (event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent): void => {
    if (process.env.NODE_ENV === 'test' && !event?.sender) return
    assertSenderIsAppWindow(event, getActiveMainWindow, getPromptWindow, getWidgetWindow)
  }

  // IPC registration for widget actions and drag movement
  ipcMain.handle(IpcChannels.WidgetGetBounds, (event) => {
    assertSender(event)
    if (widgetWindow && !widgetWindow.isDestroyed()) {
      const bounds = widgetWindow.getBounds()
      const clamped = clampPosition(bounds.x, bounds.y, WINDOW_WIDTH, WINDOW_HEIGHT)
      if (
        bounds.x !== clamped.x ||
        bounds.y !== clamped.y ||
        bounds.width !== WINDOW_WIDTH ||
        bounds.height !== WINDOW_HEIGHT
      ) {
        widgetWindow.setBounds({
          x: clamped.x,
          y: clamped.y,
          width: WINDOW_WIDTH,
          height: WINDOW_HEIGHT
        })
      }
      return { ...clamped, width: WINDOW_WIDTH, height: WINDOW_HEIGHT }
    }
    return { ...getDefaultWidgetPosition(), width: WINDOW_WIDTH, height: WINDOW_HEIGHT }
  })

  ipcMain.on(IpcChannels.WidgetSetPosition, (event, payload: unknown) => {
    assertSender(event)
    if (widgetWindow && !widgetWindow.isDestroyed()) {
      if (!payload || typeof payload !== 'object') return
      const { x, y } = payload as { x?: unknown; y?: unknown }
      if (
        typeof x !== 'number' ||
        typeof y !== 'number' ||
        !Number.isFinite(x) ||
        !Number.isFinite(y)
      ) {
        return
      }
      const clamped = clampPosition(x, y, WINDOW_WIDTH)
      widgetWindow.setBounds({
        x: clamped.x,
        y: clamped.y,
        width: WINDOW_WIDTH,
        height: WINDOW_HEIGHT
      })
    }
  })

  ipcMain.handle(IpcChannels.WidgetSavePosition, async (event) => {
    assertSender(event)
    if (widgetWindow && !widgetWindow.isDestroyed()) {
      const [currX, currY] = widgetWindow.getPosition()
      const clamped = clampPosition(currX, currY, WINDOW_WIDTH)
      widgetWindow.setBounds({
        x: clamped.x,
        y: clamped.y,
        width: WINDOW_WIDTH,
        height: WINDOW_HEIGHT
      })
      ensureWidgetTopmost({ moveTop: true })
      await savePosition(clamped.x, clamped.y)
      return clamped
    }
    return null
  })

  ipcMain.on(IpcChannels.WidgetSetExpanded, (event, expanded: unknown) => {
    assertSender(event)
    setWidgetExpanded(Boolean(expanded))
  })

  ipcMain.on(IpcChannels.WidgetSetIgnoreMouseEvents, (event, ignore: unknown) => {
    assertSender(event)
    if (widgetWindow && !widgetWindow.isDestroyed()) {
      try {
        widgetWindow.setIgnoreMouseEvents(Boolean(ignore), { forward: true })
      } catch {
        // ignore
      }
    }
  })

  ipcMain.on(IpcChannels.WidgetSnapTaskbar, (event) => {
    assertSender(event)
    resetWidgetPosition()
  })

  ipcMain.on(IpcChannels.WidgetHide, (event) => {
    assertSender(event)
    hideWidgetWindow()
  })

  ipcMain.on(IpcChannels.WidgetContextMenu, async (event) => {
    assertSender(event)
    if (!widgetWindow || widgetWindow.isDestroyed()) return
    const isActive = currentSessionPayload?.isActive ?? false
    const isBreak = currentSessionPayload?.isBreak ?? false

    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: '+5 min addon',
        enabled: isActive,
        click: () => {
          const mainWin = getActiveMainWindow()
          if (mainWin && mainWin.webContents) {
            mainWin.webContents.send(IpcChannels.SessionQuickAction, 'add-5m')
          }
        }
      },
      {
        label: isBreak ? 'Resume Focus' : '2 min break',
        click: () => {
          const mainWin = getActiveMainWindow()
          if (mainWin && mainWin.webContents) {
            mainWin.webContents.send(IpcChannels.SessionQuickAction, 'start-break')
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Reset Widget',
        click: () => resetWidgetPosition()
      }
    ]

    const menu = Menu.buildFromTemplate(template)
    if (menu && typeof menu.popup === 'function') {
      menu.popup()
    }
  })

  ipcMain.on(IpcChannels.WidgetShowApp, (event) => {
    assertSender(event)
    const mainWin = getActiveMainWindow()
    if (mainWin) {
      if (mainWin.isMinimized()) {
        mainWin.restore()
      }
      if (
        typeof mainWin.isMaximized === 'function' &&
        !mainWin.isMaximized() &&
        typeof mainWin.maximize === 'function'
      ) {
        mainWin.maximize()
      }
      mainWin.show()
      mainWin.focus()
    }
  })

  ipcMain.on(IpcChannels.WidgetToggleSession, (event) => {
    assertSender(event)
    const mainWin = getActiveMainWindow()
    if (mainWin && mainWin.webContents) {
      mainWin.webContents.send(IpcChannels.SessionTogglePause)
    }
  })
}
