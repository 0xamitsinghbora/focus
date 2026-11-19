import { BrowserWindow, shell, app, nativeImage } from 'electron'
import { join } from 'path'
import iconPng from '../../../build/icon.png?asset'
import iconIco from '../../../build/icon.ico?asset'

export function getAppIcon(): Electron.NativeImage | string {
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
import { WindowLayoutService } from '../services/WindowLayoutService'
import {
  showPromptWindow,
  getPromptWindow,
  isPromptVisible,
  getActiveDisplay,
  setPromptMainWindow
} from './prompt'
import { SessionTimerPayload } from '../../shared/types'
import {
  initWidgetWindow,
  broadcastToWidget,
  getWidgetWindow,
  rebindWidgetMainWindow
} from './widget'
import { logger } from '../logger'

export interface WindowManagerOptions {
  getShowWidget: () => boolean
  onWidgetVisibilityChange: (visible: boolean) => void
  getInProgressGoals?: () =>
    Promise<{ id: string; title: string }[]> | { id: string; title: string }[]
}

/**
 * WindowManager coordinates the lifecycle, bounds persistence, and inter-window
 * broadcasts between MainWindow, PromptWindow, and TaskbarWidget.
 */
export class WindowManager {
  private mainWindow: BrowserWindow | null = null
  private layoutService: WindowLayoutService
  private options?: WindowManagerOptions

  constructor(options?: WindowManagerOptions) {
    this.layoutService = WindowLayoutService.getInstance()
    this.options = options
  }

  public getMainWindow(): BrowserWindow | null {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      return this.mainWindow
    }
    try {
      const prompt = this.getPromptWindow()
      const widget = this.getWidgetWindow()
      const all = BrowserWindow.getAllWindows()
      const main = all.find((w) => {
        if (!w || w.isDestroyed()) return false
        if (w === prompt || w === widget) return false
        const url = w.webContents?.getURL?.() || ''
        if (url.includes('widget.html') || url.includes('prompt.html')) return false
        return true
      })
      if (main) {
        this.mainWindow = main
        return main
      }
    } catch {
      // ignore
    }
    return null
  }

  public setMainWindow(win: BrowserWindow | null): void {
    this.mainWindow = win
  }

  public getPromptWindow(): BrowserWindow | null {
    const win = getPromptWindow()
    if (win && !win.isDestroyed()) return win
    try {
      const all = BrowserWindow.getAllWindows()
      const found = all.find((w) => {
        if (!w || w.isDestroyed()) return false
        const url = w.webContents?.getURL?.() || ''
        return url.includes('prompt.html')
      })
      if (found) return found
    } catch {
      // ignore
    }
    return null
  }

  public getWidgetWindow(): BrowserWindow | null {
    const win = getWidgetWindow()
    if (win && !win.isDestroyed()) return win
    try {
      const all = BrowserWindow.getAllWindows()
      const found = all.find((w) => {
        if (!w || w.isDestroyed()) return false
        const url = w.webContents?.getURL?.() || ''
        return url.includes('widget.html')
      })
      if (found) return found
    } catch {
      // ignore
    }
    return null
  }

  public isPromptVisible(): boolean {
    return isPromptVisible()
  }

  public createMainWindow(): BrowserWindow {
    const windowState = this.layoutService.loadWindowState()
    const targetDisplay = getActiveDisplay()
    const workArea = targetDisplay.workArea || targetDisplay.bounds

    const x =
      typeof windowState.x === 'number'
        ? windowState.x
        : Math.round(workArea.x + Math.max(0, (workArea.width - windowState.width) / 2))
    const y =
      typeof windowState.y === 'number'
        ? windowState.y
        : Math.round(workArea.y + Math.max(0, (workArea.height - windowState.height) / 2))

    const win = new BrowserWindow({
      x,
      y,
      width: windowState.width,
      height: windowState.height,
      minWidth: 780,
      minHeight: 560,
      show: false,
      autoHideMenuBar: true,
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: '#00000000',
        symbolColor: '#8e8e93',
        height: 32
      },
      icon: appIcon,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: true,
        backgroundThrottling: true,
        autoplayPolicy: 'no-user-gesture-required'
      }
    })

    if (process.platform === 'win32') {
      try {
        win.setIcon(appIcon)
      } catch (err) {
        logger.warn('main:window', 'Failed to explicitly set window icon:', err)
      }
    }

    win.on('resize', () => {
      this.layoutService.scheduleSaveWindowState(win)
    })
    win.on('move', () => {
      this.layoutService.scheduleSaveWindowState(win)
    })
    win.on('close', () => {
      this.layoutService.saveWindowStateSync(win)
    })

    win.on('ready-to-show', () => {
      if (process.platform === 'win32') {
        try {
          win.setIcon(appIcon)
        } catch {
          // ignore
        }
      }
      win.maximize()
      if (!process.argv.includes('--hidden')) {
        win.show()
        win.focus()
        if (
          typeof win.isMaximized === 'function' &&
          !win.isMaximized() &&
          typeof win.maximize === 'function'
        ) {
          win.maximize()
        }
      }
    })

    win.on('page-title-updated', (e) => {
      e.preventDefault()
    })

    win.webContents.setWindowOpenHandler((details) => {
      try {
        const parsed = new URL(details.url)
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
          shell.openExternal(details.url).catch((err) => {
            logger.warn('main:security', `Failed to open external URL: ${details.url}`, err)
          })
        } else {
          logger.warn(
            'main:security',
            `Blocked attempt to open unsupported protocol: ${parsed.protocol}`
          )
        }
      } catch {
        logger.warn('main:security', `Blocked invalid URL in window open handler: ${details.url}`)
      }
      return { action: 'deny' }
    })

    win.webContents.on('render-process-gone', (_, details) => {
      logger.error('main:window', 'Main window render process gone:', details)
    })

    win.on('unresponsive', () => {
      logger.warn('main:window', 'Main window became unresponsive')
    })

    win.webContents.on('did-fail-load', (_, errorCode, errorDescription, validatedURL) => {
      logger.error(
        'main:window',
        `Failed to load ${validatedURL}: ${errorCode} ${errorDescription}`
      )
    })

    if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
      win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
      win.loadFile(join(__dirname, '../renderer/index.html'))
    }

    this.mainWindow = win
    return win
  }

  public initAuxiliaryWindows(): void {
    setPromptMainWindow(() => this.getMainWindow())
    if (this.options) {
      initWidgetWindow(() => this.getMainWindow(), {
        getShowWidget: this.options.getShowWidget,
        onVisibilityChange: this.options.onWidgetVisibilityChange,
        getInProgressGoals: this.options.getInProgressGoals
      })
    }
    this.layoutService.setupScreenChangeListeners({
      getMainWindow: () => this.getMainWindow(),
      getWidgetWindow: () => this.getWidgetWindow()
    })
  }

  public focusOrRestoreMainWindow(): void {
    const win = this.getMainWindow()
    if (!win) {
      this.createMainWindow()
      return
    }
    if (win.isMinimized()) win.restore()
    if (
      typeof win.isMaximized === 'function' &&
      !win.isMaximized() &&
      typeof win.maximize === 'function'
    ) {
      win.maximize()
    }
    if (!win.isVisible()) win.show()
    win.focus()
    if (
      typeof win.isMaximized === 'function' &&
      !win.isMaximized() &&
      typeof win.maximize === 'function'
    ) {
      win.maximize()
    }
  }

  public showPrompt(options: { focus?: boolean } = {}): void {
    showPromptWindow(options)
  }

  public broadcast(channel: string, ...args: unknown[]): void {
    const sendToWin = (win: BrowserWindow | null): void => {
      if (!win || win.isDestroyed() || !win.webContents) return
      const isDestroyed =
        typeof win.webContents.isDestroyed === 'function' ? win.webContents.isDestroyed() : false
      if (isDestroyed) return

      if (typeof win.webContents.isLoading === 'function' && win.webContents.isLoading()) {
        win.webContents.once('did-finish-load', () => {
          if (!win.isDestroyed() && win.webContents) {
            const stillDestroyed =
              typeof win.webContents.isDestroyed === 'function'
                ? win.webContents.isDestroyed()
                : false
            if (!stillDestroyed) {
              try {
                win.webContents.send(channel, ...args)
              } catch {
                // ignore
              }
            }
          }
        })
      } else {
        try {
          win.webContents.send(channel, ...args)
        } catch {
          // ignore
        }
      }
    }

    sendToWin(this.getMainWindow())
    sendToWin(this.getPromptWindow())
    sendToWin(this.getWidgetWindow())
  }

  public broadcastToWidget(payload: SessionTimerPayload): void {
    broadcastToWidget(payload)
  }

  public rebindAuxiliaryWindows(win: BrowserWindow): void {
    this.mainWindow = win
    rebindWidgetMainWindow(win)
    setPromptMainWindow(() => win)
  }

  public saveWindowState(): void {
    const win = this.getMainWindow()
    if (win) {
      this.layoutService.saveWindowStateSync(win)
    }
  }

  public destroyAllWindows(): void {
    const trackedWindows = [this.getPromptWindow(), this.getWidgetWindow(), this.getMainWindow()]
    for (const win of trackedWindows) {
      if (win && !win.isDestroyed()) {
        try {
          win.removeAllListeners()
          win.destroy()
        } catch {
          // ignore
        }
      }
    }
    // Destroy any remaining BrowserWindow instances in the process
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        try {
          win.removeAllListeners()
          win.destroy()
        } catch {
          // ignore
        }
      }
    }
    this.mainWindow = null
  }
}
