import { ipcMain } from 'electron'
import { IpcChannels, ReminderStatus } from '../../shared/types'
import { hidePromptWindow, showPromptWindow } from '../windows/prompt'
import { logger } from '../logger'
import type { ReminderScheduler } from '../scheduler'

export interface ReminderIpcDependencies {
  scheduler: ReminderScheduler
  hidePromptWindow?: () => void
  showPromptWindow?: (options?: { focus?: boolean }) => void
  security: {
    assertSenderIsMainWindowOrPrompt: (
      event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent
    ) => void
    assertSenderIsAppWindow: (event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent) => void
  }
}

export class ReminderIpcController {
  private deps: ReminderIpcDependencies
  private snoozeHandler: ((event: Electron.IpcMainEvent, minutes?: number) => void) | null = null
  private submitHandler: ((event: Electron.IpcMainEvent) => void) | null = null
  private showPromptHandler: ((event: Electron.IpcMainEvent) => void) | null = null

  constructor(deps: ReminderIpcDependencies) {
    this.deps = deps
  }

  public register(): void {
    const { scheduler, security } = this.deps
    const hidePrompt = this.deps.hidePromptWindow ?? hidePromptWindow
    const showPrompt = this.deps.showPromptWindow ?? showPromptWindow

    this.unregister()

    this.snoozeHandler = (event, minutes?: number) => {
      security.assertSenderIsMainWindowOrPrompt(event)
      scheduler.snooze(typeof minutes === 'number' && minutes > 0 ? minutes : 5)
      hidePrompt()
    }

    this.submitHandler = (event) => {
      security.assertSenderIsMainWindowOrPrompt(event)
      scheduler.resetBlockAndTimer()
      hidePrompt()
    }

    this.showPromptHandler = (event) => {
      security.assertSenderIsAppWindow(event)
      scheduler.notifyPromptTriggered()
      showPrompt({ focus: true })
    }

    ipcMain.on(IpcChannels.RemindSnooze, this.snoozeHandler)
    ipcMain.on(IpcChannels.RemindSubmit, this.submitHandler)
    ipcMain.on(IpcChannels.PromptShow, this.showPromptHandler)

    ipcMain.handle(IpcChannels.RemindGetStatus, (event): ReminderStatus => {
      security.assertSenderIsAppWindow(event)
      return scheduler.getStatus()
    })
  }

  public unregister(): void {
    if (this.showPromptHandler) {
      try {
        ipcMain.removeListener(IpcChannels.PromptShow, this.showPromptHandler)
      } catch (err) {
        logger.warn('reminder:ipc', 'Failed to remove PromptShow listener:', err)
      }
      this.showPromptHandler = null
    }

    if (this.snoozeHandler) {
      try {
        ipcMain.removeListener(IpcChannels.RemindSnooze, this.snoozeHandler)
      } catch (err) {
        logger.warn('reminder:ipc', 'Failed to remove RemindSnooze listener:', err)
      }
      this.snoozeHandler = null
    }

    if (this.submitHandler) {
      try {
        ipcMain.removeListener(IpcChannels.RemindSubmit, this.submitHandler)
      } catch (err) {
        logger.warn('reminder:ipc', 'Failed to remove RemindSubmit listener:', err)
      }
      this.submitHandler = null
    }

    try {
      ipcMain.removeHandler(IpcChannels.RemindGetStatus)
    } catch (err) {
      logger.warn('reminder:ipc', 'Failed to remove RemindGetStatus handler:', err)
    }
  }
}
