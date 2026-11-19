import { BrowserWindow, screen, ipcMain, app, nativeImage } from 'electron'
import { join } from 'path'
import { IpcChannels } from '../../shared/types'
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
import { showNativeNotification, closeNativeNotification } from '../notifications'

let promptWindow: BrowserWindow | null = null
let mainWindowRef: BrowserWindow | null = null
let getMainWindowRef: (() => BrowserWindow | null) | null = null
let ipcRegistered = false
let isQuitting = false
let hasPendingLoadNotification = false
let lastPromptShowEpoch = 0
let dismissOnBlur = false

export function setPromptDismissOnBlur(enable: boolean): void {
  dismissOnBlur = enable
}
let fallbackTimer: NodeJS.Timeout | null = null

export function setPromptMainWindow(
  mainWindow: BrowserWindow | (() => BrowserWindow | null)
): void {
  if (typeof mainWindow === 'function') {
    getMainWindowRef = mainWindow
  } else {
    mainWindowRef = mainWindow
    getMainWindowRef = () => mainWindowRef
  }
}

export function getActivePromptMainWindow(): BrowserWindow | null {
  if (getMainWindowRef) {
    const win = getMainWindowRef()
    if (win && !win.isDestroyed()) return win
  }
  if (mainWindowRef && !mainWindowRef.isDestroyed()) return mainWindowRef
  const allWindows = BrowserWindow.getAllWindows()
  for (const win of allWindows) {
    if (win !== promptWindow && !win.isDestroyed()) {
      const url = win.webContents?.getURL?.() || ''
      if (!url.includes('widget.html') && !url.includes('prompt.html')) {
        return win
      }
    }
  }
  return null
}

if (typeof app?.on === 'function') {
  app.on('before-quit', () => {
    isQuitting = true
  })
}

export function setPromptIsQuitting(quitting: boolean): void {
  isQuitting = quitting
}

type DismissListener = () => void
const dismissListeners: Set<DismissListener> = new Set()
let directSnoozeHandler: ((minutes?: number) => void) | null = null

export function setPromptSnoozeHandler(handler: ((minutes?: number) => void) | null): void {
  directSnoozeHandler = handler
}

export function onPromptDismiss(listener: DismissListener): () => void {
  dismissListeners.add(listener)
  return () => {
    dismissListeners.delete(listener)
  }
}

function emitPromptDismissed(): void {
  let handled = false
  for (const listener of dismissListeners) {
    try {
      listener()
      handled = true
    } catch {
      // ignore
    }
  }
  if (!handled) {
    hidePromptWindow()
    if (directSnoozeHandler) {
      try {
        directSnoozeHandler(5)
      } catch {
        // ignore
      }
    }
  }
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
    // fallback to primary display
  }
  return screen.getPrimaryDisplay()
}

/**
 * Computes bottom-right position for the prompt popup on the target display's
 * usable work area (accounting for multi-monitor offsets and docked taskbars).
 */
export function getPromptPosition(
  display: Electron.Display,
  width = 400,
  height = 500
): { x: number; y: number } {
  const workArea = display?.workArea || display?.bounds || { x: 0, y: 0, width: 1920, height: 1080 }
  const padding = 20
  const idealX = Math.round(workArea.x + workArea.width - width - padding)
  const idealY = Math.round(workArea.y + workArea.height - height - padding)
  const minX = workArea.width >= width + padding ? workArea.x + padding : workArea.x
  const minY = workArea.height >= height + padding ? workArea.y + padding : workArea.y
  const x = Math.max(minX, idealX)
  const y = Math.max(minY, idealY)
  return { x, y }
}

function registerIpc(): void {
  if (ipcRegistered) return
  ipcRegistered = true

  const assertSender = (event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent): void => {
    if (process.env.NODE_ENV === 'test' && !event?.sender) return
    assertSenderIsAppWindow(event, getActivePromptMainWindow, getPromptWindow)
  }

  ipcMain.on(IpcChannels.PromptResize, (event, height: number) => {
    assertSender(event)
    if (!promptWindow || promptWindow.isDestroyed()) return
    if (typeof height !== 'number' || !Number.isFinite(height)) return
    const currentBounds = promptWindow.getBounds()
    let targetDisplay: Electron.Display
    try {
      if (typeof screen.getDisplayNearestPoint === 'function') {
        targetDisplay = screen.getDisplayNearestPoint({
          x: currentBounds.x + Math.floor(currentBounds.width / 2),
          y: currentBounds.y + Math.floor(currentBounds.height / 2)
        })
      } else {
        targetDisplay = screen.getPrimaryDisplay()
      }
    } catch {
      targetDisplay = screen.getPrimaryDisplay()
    }

    const dipHeight = Math.round(height)
    const workArea = targetDisplay.workArea || targetDisplay.bounds || { height: 1080 }
    const maxScreenHeight = Math.max(160, Math.floor(workArea.height - 40))
    const windowWidth = 400
    const clampedHeight = Math.max(160, Math.min(550, maxScreenHeight, dipHeight))
    const { x, y } = getPromptPosition(targetDisplay, windowWidth, clampedHeight)

    if (
      Math.abs(currentBounds.height - clampedHeight) >= 4 ||
      Math.abs(currentBounds.y - y) >= 4 ||
      Math.abs(currentBounds.x - x) >= 4
    ) {
      promptWindow.setBounds({ x, y, width: windowWidth, height: clampedHeight }, false)
    }
  })

  ipcMain.on(IpcChannels.PromptFocus, (event) => {
    assertSender(event)
    if (!promptWindow || promptWindow.isDestroyed()) return
    promptWindow.focus()
    promptWindow.webContents.focus()
  })
}

function createPromptWindow(): BrowserWindow {
  if (promptWindow && !promptWindow.isDestroyed()) {
    return promptWindow
  }

  const targetDisplay = getActiveDisplay()
  const windowWidth = 400
  const windowHeight = 500
  const { x, y } = getPromptPosition(targetDisplay, windowWidth, windowHeight)

  promptWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x,
    y,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    focusable: true,
    icon: appIcon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required'
    }
  })

  if (typeof promptWindow.webContents?.setWindowOpenHandler === 'function') {
    promptWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  }

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    promptWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/prompt.html`)
  } else {
    promptWindow.loadFile(join(__dirname, '../renderer/prompt.html'))
  }

  promptWindow.on('focus', () => {
    clearPromptFallbackNotification()
  })

  promptWindow.on('blur', () => {
    // 300ms grace period after show() prevents transient OS/taskbar focus switches from closing prompt
    if (Date.now() - lastPromptShowEpoch < 300) {
      return
    }
    if (dismissOnBlur && !isQuitting && isPromptVisible()) {
      emitPromptDismissed()
    }
  })

  promptWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      const wasVisible = promptWindow
        ? !promptWindow.isDestroyed() && promptWindow.isVisible()
        : false
      hidePromptWindow()
      if (wasVisible) {
        emitPromptDismissed()
      }
    }
  })

  promptWindow.on('closed', () => {
    promptWindow = null
    hasPendingLoadNotification = false
    clearPromptFallbackNotification()
  })

  registerIpc()

  return promptWindow
}

export function isPromptVisible(): boolean {
  return Boolean(promptWindow && !promptWindow.isDestroyed() && promptWindow.isVisible())
}

export function getPromptWindow(): BrowserWindow | null {
  if (promptWindow && !promptWindow.isDestroyed()) {
    return promptWindow
  }
  try {
    const all = BrowserWindow.getAllWindows()
    const found = all.find((w) => {
      if (!w || w.isDestroyed()) return false
      const url = w.webContents?.getURL?.() || ''
      return url.includes('prompt.html')
    })
    if (found) {
      promptWindow = found
      return found
    }
  } catch {
    // ignore
  }
  return null
}

function clearPromptFallbackNotification(): void {
  if (fallbackTimer) {
    clearTimeout(fallbackTimer)
    fallbackTimer = null
  }
  closeNativeNotification()
}

function triggerNotificationFallback(): void {
  const isFocused = Boolean(
    promptWindow && typeof promptWindow.isFocused === 'function' && promptWindow.isFocused()
  )
  if (isPromptVisible() && !isFocused) {
    showNativeNotification({
      title: 'Focus Check-in',
      body: 'Time to record your work or take a break.',
      onClick: () => {
        showPromptWindow({ focus: true })
      }
    })
  }
}

export function showPromptWindow(options?: { focus?: boolean; fallbackTimeoutMs?: number }): void {
  if (!promptWindow || promptWindow.isDestroyed()) {
    createPromptWindow()
  }

  if (promptWindow) {
    if (promptWindow.isMinimized()) {
      promptWindow.restore()
    }

    // Always reposition prompt popup on the active display where user's cursor currently resides
    const targetDisplay = getActiveDisplay()
    const currentBounds = promptWindow.getBounds()
    const windowWidth = currentBounds.width > 0 ? currentBounds.width : 400
    const windowHeight = currentBounds.height > 0 ? currentBounds.height : 500
    const { x, y } = getPromptPosition(targetDisplay, windowWidth, windowHeight)

    promptWindow.setBounds({ x, y, width: windowWidth, height: windowHeight })
    try {
      promptWindow.setAlwaysOnTop(true, 'floating')
    } catch {
      try {
        promptWindow.setAlwaysOnTop(true)
      } catch {
        // ignore
      }
    }
    try {
      promptWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    } catch {
      // ignore
    }
    lastPromptShowEpoch = Date.now()
    if (options?.focus) {
      clearPromptFallbackNotification()
      promptWindow.show()
      promptWindow.focus()
    } else {
      promptWindow.showInactive()
      const timeout = options?.fallbackTimeoutMs ?? 5000
      if (timeout > 0) {
        if (fallbackTimer) clearTimeout(fallbackTimer)
        fallbackTimer = setTimeout(() => {
          fallbackTimer = null
          triggerNotificationFallback()
        }, timeout)
      }
    }

    const notifyRenderer = (): void => {
      hasPendingLoadNotification = false
      if (promptWindow && !promptWindow.isDestroyed() && promptWindow.webContents) {
        promptWindow.webContents.send(IpcChannels.PromptShown)
      }
    }

    if (promptWindow.webContents.isLoading()) {
      if (!hasPendingLoadNotification) {
        hasPendingLoadNotification = true
        promptWindow.webContents.once('did-finish-load', notifyRenderer)
      }
    } else {
      hasPendingLoadNotification = false
      notifyRenderer()
    }
  }
}

export function hidePromptWindow(): void {
  clearPromptFallbackNotification()
  if (promptWindow && !promptWindow.isDestroyed()) {
    promptWindow.hide()
  }
}
