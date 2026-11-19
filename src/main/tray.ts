import { Tray, Menu, app, BrowserWindow, nativeImage } from 'electron'
import { showPromptWindow } from './windows/prompt'
import trayIconPng from '../../build/tray-icon.png?asset'
import { IpcChannels } from '../shared/types'

export interface TrayStatusOptions {
  tooltip: string
  title?: string
  menuLabel?: string | null
  icon?: Electron.NativeImage | null
  isActive?: boolean
  isPaused?: boolean
  isBreak?: boolean
  remainingSeconds?: number
  goalTitle?: string
}

export class TrayGenerator {
  private tray: Tray | null = null
  private getMainWindow: () => BrowserWindow | null
  private onLogNow?: () => void
  private currentStatusLabel: string | null = null
  private currentSessionState: {
    isActive: boolean
    isPaused: boolean
    isBreak: boolean
    remainingSeconds: number
    goalTitle?: string
  } | null = null
  private defaultIcon: Electron.NativeImage | null = null

  constructor(mainWindow: BrowserWindow | (() => BrowserWindow | null), onLogNow?: () => void) {
    this.getMainWindow = typeof mainWindow === 'function' ? mainWindow : () => mainWindow
    this.onLogNow = onLogNow
    this.createTray()
  }

  private getWindow(): BrowserWindow | null {
    const win = this.getMainWindow()
    return win && !win.isDestroyed() ? win : null
  }

  private createTray(): void {
    this.defaultIcon =
      typeof nativeImage?.createFromPath === 'function'
        ? nativeImage.createFromPath(trayIconPng)
        : ({} as Electron.NativeImage)
    this.tray = new Tray(this.defaultIcon)
    this.tray.setToolTip('focus')

    this.tray.on('click', () => {
      this.toggleWindow()
    })

    this.tray.on('right-click', () => {
      this.updateContextMenu()
    })

    this.updateContextMenu()
  }

  public showMainWindow(): void {
    const win = this.getWindow()
    if (!win) return
    if (win.isMinimized()) {
      win.restore()
    }
    if (
      typeof win.isMaximized === 'function' &&
      !win.isMaximized() &&
      typeof win.maximize === 'function'
    ) {
      win.maximize()
    }
    win.show()
    win.focus()
  }

  private toggleWindow(forceShow = false): void {
    const win = this.getWindow()
    if (!win) return
    if (!forceShow && win.isVisible()) {
      win.hide()
    } else {
      this.showMainWindow()
    }
  }

  public updateStatus(options: TrayStatusOptions): void {
    if (!this.tray) return
    try {
      this.tray.setToolTip(options.tooltip)

      if (options.icon) {
        this.tray.setImage(options.icon)
      } else if (this.defaultIcon) {
        this.tray.setImage(this.defaultIcon)
      }

      if (process.platform === 'darwin' && typeof this.tray.setTitle === 'function') {
        this.tray.setTitle(options.title || '')
      }

      if (options.isActive !== undefined) {
        this.currentSessionState = {
          isActive: options.isActive,
          isPaused: Boolean(options.isPaused),
          isBreak: Boolean(options.isBreak),
          remainingSeconds: options.remainingSeconds ?? 0,
          goalTitle: options.goalTitle
        }
      } else if (options.menuLabel === null) {
        this.currentSessionState = null
      }

      if (this.currentStatusLabel !== (options.menuLabel ?? null)) {
        this.currentStatusLabel = options.menuLabel ?? null
        this.updateContextMenu()
      } else if (options.isActive !== undefined) {
        this.updateContextMenu()
      }
    } catch {
      // Ignore errors during app teardown
    }
  }

  private openSettings(): void {
    this.showMainWindow()
    const win = this.getWindow()
    if (!win) return

    const sendNavigate = (): void => {
      win.webContents.send(IpcChannels.NavigateTab, 'settings')
    }

    if (win.webContents.isLoading()) {
      win.webContents.once('did-finish-load', sendNavigate)
    } else {
      sendNavigate()
    }
  }

  public updateContextMenu(): void {
    const template: Electron.MenuItemConstructorOptions[] = []

    const win = this.getWindow()

    if (this.currentSessionState?.isActive) {
      template.push(
        {
          label: '+5 min addon',
          click: () => {
            win?.webContents.send(IpcChannels.SessionQuickAction, 'add-5m')
          }
        },
        {
          label: this.currentSessionState.isBreak ? 'Resume Focus' : '5 min break',
          click: () => {
            win?.webContents.send(IpcChannels.SessionQuickAction, 'start-break')
          }
        },
        { type: 'separator' }
      )
    }

    template.push(
      {
        label: 'Log Now',
        click: () => {
          if (this.onLogNow) {
            this.onLogNow()
          } else {
            showPromptWindow({ focus: true })
          }
        }
      },
      {
        label: 'Settings',
        click: () => {
          this.openSettings()
        }
      },
      { type: 'separator' },
      {
        label: 'Quit focus',
        click: () => {
          app.quit()
        }
      }
    )

    const contextMenu = Menu.buildFromTemplate(template)
    this.tray?.setContextMenu(contextMenu)
  }

  public destroy(): void {
    if (this.tray) {
      if (typeof this.tray.isDestroyed === 'function' && this.tray.isDestroyed()) {
        this.tray = null
        return
      }
      try {
        this.tray.destroy?.()
      } catch {
        // Ignore
      }
      this.tray = null
    }
  }
}
