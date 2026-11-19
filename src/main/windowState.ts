import { BrowserWindow } from 'electron'
import { WindowLayoutService, WindowState } from './services/WindowLayoutService'

export type { WindowState }

export function loadWindowState(): WindowState {
  return WindowLayoutService.getInstance().loadWindowState()
}

export function saveWindowState(win: BrowserWindow): void {
  WindowLayoutService.getInstance().saveWindowStateSync(win)
}
