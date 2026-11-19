import { BrowserWindow, nativeImage } from 'electron'
import { TrayGenerator } from './tray'
import { ReminderScheduler } from './scheduler'
import { SessionTimerPayload } from '../shared/types'
import {
  formatTaskbarTitle,
  formatTaskbarThumbnailTooltip,
  formatTrayTooltip,
  formatTrayMenuLabel,
  calculateTaskbarProgress,
  formatSecondsForTaskbar
} from '../shared/taskbar'
import { logger } from './logger'

export class TaskbarManager {
  private getMainWindow: () => BrowserWindow | null
  private trayGenerator: TrayGenerator
  private scheduler?: ReminderScheduler
  private currentSession: SessionTimerPayload | null = null
  private idleTimerId: NodeJS.Timeout | null = null
  private lastFlashedZero = false
  private lastAppliedBadgeDataUrl: string | null = null
  private cachedOverlayImage: Electron.NativeImage | null = null
  private lastAppliedTitle: string | null = null
  private lastAppliedProgress: number | null = null
  private lastAppliedProgressMode: string | null = null
  private lastAppliedTooltip: string | null = null
  private lastAppliedIdleTitle: string | null = null
  private lastAppliedIdleTooltip: string | null = null
  private lastAppliedIdleProgress: number | null = null
  private lastAppliedIdleTimeDisplay: string | null = null
  private lastAppliedIdleOverlayCleared = false
  private boundWindow: BrowserWindow | null = null
  private boundFocusListener: (() => void) | null = null

  constructor(
    mainWindow: BrowserWindow | (() => BrowserWindow | null),
    trayGenerator: TrayGenerator,
    scheduler?: ReminderScheduler
  ) {
    this.getMainWindow = typeof mainWindow === 'function' ? mainWindow : () => mainWindow
    this.trayGenerator = trayGenerator
    this.scheduler = scheduler

    this.rebindWindow()
    this.startIdleMonitor()
  }

  private getWindowInternal(): BrowserWindow | null {
    const win = this.getMainWindow()
    return win && !win.isDestroyed() ? win : null
  }

  private getWindow(): BrowserWindow | null {
    const win = this.getWindowInternal()
    if (win && win !== this.boundWindow) {
      this.rebindWindow(win)
    }
    return win
  }

  private onFocus(): void {
    try {
      const currentWin = this.getWindowInternal()
      currentWin?.flashFrame(false)
    } catch {
      // ignore
    }
  }

  public rebindWindow(newWin?: BrowserWindow | null): void {
    const targetWin =
      newWin !== undefined
        ? newWin && !newWin.isDestroyed()
          ? newWin
          : null
        : this.getWindowInternal()

    if (this.boundWindow === targetWin) return

    if (this.boundWindow && !this.boundWindow.isDestroyed() && this.boundFocusListener) {
      try {
        if (typeof this.boundWindow.removeListener === 'function') {
          this.boundWindow.removeListener('focus', this.boundFocusListener)
        }
      } catch {
        // ignore
      }
    }

    this.boundWindow = null
    this.boundFocusListener = null

    if (targetWin && !targetWin.isDestroyed()) {
      const listener = (): void => this.onFocus()
      if (typeof targetWin.on === 'function') {
        targetWin.on('focus', listener)
      }
      this.boundWindow = targetWin
      this.boundFocusListener = listener
    }
  }

  /**
   * Called when renderer sends session timer updates (e.g. tick, pause, resume, start, end)
   */
  public updateSession(payload: SessionTimerPayload): void {
    const win = this.getWindow()
    if (!win) return

    this.currentSession = payload

    if (payload.isActive) {
      this.applyActiveSession(payload)
    } else {
      this.applyIdle()
    }
  }

  private applyActiveSession(payload: SessionTimerPayload): void {
    const win = this.getWindow()
    if (!win) return

    this.lastAppliedIdleTitle = null
    this.lastAppliedIdleTooltip = null
    this.lastAppliedIdleProgress = null
    this.lastAppliedIdleTimeDisplay = null
    this.lastAppliedIdleOverlayCleared = false

    const title = formatTaskbarTitle(payload)
    const thumbnailTooltip = formatTaskbarThumbnailTooltip(payload)
    const trayTooltip = formatTrayTooltip(payload)
    const trayMenuLabel = formatTrayMenuLabel(payload)
    const { progress, mode } = calculateTaskbarProgress(payload)

    try {
      // 1. Taskbar Window Title
      if (this.lastAppliedTitle !== title) {
        win.setTitle(title)
        this.lastAppliedTitle = title
      }

      // 2. Taskbar Progress Bar (native Windows / macOS)
      if (this.lastAppliedProgress !== progress || this.lastAppliedProgressMode !== mode) {
        win.setProgressBar(progress, { mode })
        this.lastAppliedProgress = progress
        this.lastAppliedProgressMode = mode
      }

      // 3. Taskbar Thumbnail Tooltip (Windows)
      if (this.lastAppliedTooltip !== thumbnailTooltip) {
        if (process.platform === 'win32' && typeof win.setThumbnailToolTip === 'function') {
          win.setThumbnailToolTip(thumbnailTooltip)
        }
        this.lastAppliedTooltip = thumbnailTooltip
      }

      let overlayImg = this.cachedOverlayImage
      const badgeChanged =
        payload.badgeDataUrl !== undefined && payload.badgeDataUrl !== this.lastAppliedBadgeDataUrl
      if (badgeChanged) {
        this.lastAppliedBadgeDataUrl = payload.badgeDataUrl || null
        if (payload.badgeDataUrl) {
          overlayImg = nativeImage.createFromDataURL(payload.badgeDataUrl)
          this.cachedOverlayImage = overlayImg
        } else {
          overlayImg = null
          this.cachedOverlayImage = null
        }

        // 4. Taskbar Overlay Icon Badge (Windows 7+) — only invoke native COM API when badge changes
        if (process.platform === 'win32' && typeof win.setOverlayIcon === 'function') {
          if (overlayImg) {
            win.setOverlayIcon(overlayImg, thumbnailTooltip)
          } else {
            win.setOverlayIcon(null, '')
          }
        }
      }

      // 5. System Tray Tooltip, Dynamic Icon, and Menu
      const timeStr = payload.isOvertime
        ? `+${formatSecondsForTaskbar(Math.abs(payload.secondsRemaining))}`
        : formatSecondsForTaskbar(Math.max(0, payload.secondsRemaining))
      const macTitle = payload.isBreak
        ? `Break: ${timeStr}`
        : payload.isPaused
          ? `Paused: ${timeStr}`
          : timeStr

      this.trayGenerator.updateStatus({
        tooltip: trayTooltip,
        title: macTitle,
        menuLabel: trayMenuLabel,
        icon: overlayImg,
        isActive: payload.isActive,
        isPaused: payload.isPaused,
        isBreak: payload.isBreak,
        remainingSeconds: payload.secondsRemaining,
        goalTitle: payload.goalTitle
      })

      // 6. Flash taskbar frame on reaching 0 seconds (completion alert)
      if (
        payload.secondsRemaining <= 0 &&
        !payload.isPaused &&
        !payload.isAfk &&
        !this.lastFlashedZero
      ) {
        this.lastFlashedZero = true
        win.flashFrame(true)
      } else if (payload.secondsRemaining > 0) {
        this.lastFlashedZero = false
      }
    } catch (err) {
      logger.warn('taskbar', 'Failed to update taskbar session state:', err)
    }
  }

  public applyIdle(): void {
    this.lastFlashedZero = false
    this.lastAppliedBadgeDataUrl = null
    this.cachedOverlayImage = null
    this.lastAppliedTitle = null
    this.lastAppliedProgress = null
    this.lastAppliedProgressMode = null
    this.lastAppliedTooltip = null

    const win = this.getWindow()

    try {
      const idle = this.getIdleReminderStatus()

      if (idle) {
        // 1. Taskbar Window Title: constantly visible on taskbar button
        const timeDisplay =
          idle.secondsRemaining < 60 ? `${idle.secondsRemaining}s` : `${idle.minutesRemaining}m`
        const title = `[${timeDisplay}] Next session · focus`
        const tooltip = `Next session in ${idle.minutesRemaining}m (${idle.timeString})`

        if (this.lastAppliedIdleTitle !== title) {
          win?.setTitle(title)
          this.lastAppliedIdleTitle = title
        }

        // Clear taskbar progress bar when idle to avoid permanent green fill on Windows taskbar
        if (this.lastAppliedIdleProgress !== -1) {
          win?.setProgressBar(-1)
          this.lastAppliedIdleProgress = -1
        }

        // Clear taskbar overlay icon badge on Windows when idle
        if (!this.lastAppliedIdleOverlayCleared) {
          if (process.platform === 'win32' && win && typeof win.setOverlayIcon === 'function') {
            win.setOverlayIcon(null, '')
          }
          this.lastAppliedIdleOverlayCleared = true
        }

        if (this.lastAppliedIdleTooltip !== tooltip) {
          if (
            process.platform === 'win32' &&
            win &&
            typeof win.setThumbnailToolTip === 'function'
          ) {
            win.setThumbnailToolTip(tooltip)
          }
          this.lastAppliedIdleTooltip = tooltip
        }

        if (this.lastAppliedIdleTimeDisplay !== timeDisplay) {
          this.trayGenerator.updateStatus({
            tooltip: `focus - Next session in ${idle.minutesRemaining}m (${idle.timeString})`,
            title: timeDisplay,
            menuLabel: `Next session in ${idle.minutesRemaining}m (${idle.timeString})`,
            icon: null,
            isActive: false
          })
          this.lastAppliedIdleTimeDisplay = timeDisplay
        }
      } else {
        this.lastAppliedIdleTitle = 'focus'
        this.lastAppliedIdleProgress = -1
        this.lastAppliedIdleTooltip = 'focus'
        this.lastAppliedIdleTimeDisplay = ''
        this.lastAppliedIdleOverlayCleared = true

        win?.setTitle('focus')
        win?.setProgressBar(-1)

        if (process.platform === 'win32' && win && typeof win.setThumbnailToolTip === 'function') {
          win.setThumbnailToolTip('focus')
        }

        if (process.platform === 'win32' && win && typeof win.setOverlayIcon === 'function') {
          win.setOverlayIcon(null, '')
        }

        this.trayGenerator.updateStatus({
          tooltip: 'focus',
          title: '',
          menuLabel: null,
          icon: null,
          isActive: false
        })
      }
    } catch (err) {
      logger.warn('taskbar', 'Failed to clear taskbar state:', err)
    }
  }

  private getIdleReminderStatus(): {
    minutesRemaining: number
    secondsRemaining: number
    fractionElapsed: number
    timeString: string
  } | null {
    if (!this.scheduler) return null
    try {
      const status = this.scheduler.getStatus()
      if (!status || !status.nextPromptTime) return null

      const nextEpoch = new Date(status.nextPromptTime).getTime()
      const startEpoch = status.currentBlockStartedAt
        ? new Date(status.currentBlockStartedAt).getTime()
        : nextEpoch - (status.intervalMinutes || 15) * 60000

      const now = Date.now()
      const diffMs = nextEpoch - now
      const diffSec = Math.max(0, Math.floor(diffMs / 1000))
      const mins = Math.max(1, Math.ceil(diffMs / 60000))

      const totalBlockSec = Math.max(60, Math.floor((nextEpoch - startEpoch) / 1000))
      const elapsedBlockSec = Math.max(0, Math.floor((now - startEpoch) / 1000))
      const fraction = Math.min(1, Math.max(0, elapsedBlockSec / totalBlockSec))

      const timeStr = new Date(nextEpoch).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
      })

      return {
        minutesRemaining: mins,
        secondsRemaining: diffSec,
        fractionElapsed: fraction,
        timeString: timeStr
      }
    } catch {
      return null
    }
  }

  private startIdleMonitor(): void {
    this.scheduleNextIdleCheck()
  }

  private scheduleNextIdleCheck(): void {
    if (this.idleTimerId) {
      clearTimeout(this.idleTimerId)
      this.idleTimerId = null
    }

    const idle = this.getIdleReminderStatus()
    // When >60s remaining, check every 10 seconds; when <=60s, check every 1 second
    const delayMs = idle && idle.secondsRemaining > 60 ? 10000 : 1000

    this.idleTimerId = setTimeout(() => {
      if (!this.currentSession || !this.currentSession.isActive) {
        this.applyIdle()
      }
      this.scheduleNextIdleCheck()
    }, delayMs)
  }

  public destroy(): void {
    if (this.idleTimerId) {
      clearTimeout(this.idleTimerId)
      this.idleTimerId = null
    }
    if (this.boundWindow && !this.boundWindow.isDestroyed() && this.boundFocusListener) {
      try {
        if (typeof this.boundWindow.removeListener === 'function') {
          this.boundWindow.removeListener('focus', this.boundFocusListener)
        }
      } catch {
        // ignore
      }
    }
    this.boundWindow = null
    this.boundFocusListener = null
  }
}
