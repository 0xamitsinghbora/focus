import { SessionTimerPayload, localDateStr } from '../../shared/types'
import type { SettingsRepository } from '../repositories/SettingsRepository'
import { logger } from '../logger'

export interface SessionServiceOptions {
  settingsRepo: SettingsRepository
  onTick?: (payload: SessionTimerPayload) => void
  tickIntervalMs?: number
  autoPauseOnZero?: boolean
}

const MAX_FOCUS_OVERTIME_SECONDS = 120 * 60
const MAX_BREAK_OVERTIME_SECONDS = 30 * 60

/**
 * SessionService manages authoritative wall-clock timing and focus session state
 * in the Node.js main process, immune to Chromium background throttling and renderer crashes.
 */
export class SessionService {
  private settingsRepo: SettingsRepository
  private onTick?: (payload: SessionTimerPayload) => void
  private tickIntervalMs: number
  private tickerTimer: NodeJS.Timeout | null = null
  private autoPauseOnZero = false

  private active = false
  private paused = false
  private breakMode = false
  private isAfk = false
  private overtime = false
  private totalSeconds = 0
  private secondsRemaining = 0
  private sessionStartEpoch = 0
  private afkBreakStartEpoch = 0
  private pauseStartEpoch = 0
  private accumulatedPausedMs = 0
  private goalId?: string
  private goalTitle?: string
  private sessionNote?: string
  private startedAt?: string
  private effectiveDate?: string
  private suspendedAt: number | null = null
  private emptyInProgressStartEpoch = 0

  constructor(options: SessionServiceOptions) {
    this.settingsRepo = options.settingsRepo
    this.onTick = options.onTick
    this.tickIntervalMs = options.tickIntervalMs ?? 1000
    this.autoPauseOnZero = options.autoPauseOnZero ?? false

    this.hydrateFromStorage()
  }

  private hydrateFromStorage(): void {
    try {
      const persisted = this.settingsRepo.getActiveSession()
      if (persisted && persisted.isActive) {
        this.active = true
        this.paused = Boolean(persisted.isPaused)
        this.breakMode = Boolean(persisted.isBreak)
        this.totalSeconds = persisted.totalSeconds || 0
        this.goalId = persisted.goalId
        this.goalTitle = persisted.goalTitle
        this.sessionNote = persisted.sessionNote
        this.startedAt = persisted.startedAt
        this.effectiveDate = persisted.effectiveDate
        this.accumulatedPausedMs = persisted.accumulatedPausedMs || 0
        this.pauseStartEpoch = persisted.pauseStartEpoch || 0

        if (persisted.startedAt) {
          this.sessionStartEpoch = new Date(persisted.startedAt).getTime()
        } else {
          this.sessionStartEpoch =
            Date.now() - ((persisted.totalSeconds || 0) - (persisted.secondsRemaining || 0)) * 1000
        }

        this.computeTick()
        if (this.active && !this.paused) {
          this.startTicker()
        }
      }
    } catch (err) {
      logger.error('session:service', 'Failed to hydrate active session from storage:', err)
    }
  }

  public getState(): SessionTimerPayload {
    return {
      isActive: this.active,
      isPaused: this.paused,
      isBreak: this.breakMode,
      isAfk: this.isAfk || undefined,
      isOvertime: this.overtime,
      totalSeconds: this.totalSeconds,
      secondsRemaining: this.secondsRemaining,
      goalId: this.goalId,
      goalTitle: this.goalTitle,
      startedAt: this.startedAt,
      effectiveDate: this.effectiveDate,
      sessionNote: this.sessionNote,
      accumulatedPausedMs: this.accumulatedPausedMs,
      pauseStartEpoch: this.pauseStartEpoch || undefined,
      emptyInProgressStartEpoch: this.emptyInProgressStartEpoch || undefined,
      afkBreakStartEpoch: this.afkBreakStartEpoch || undefined
    }
  }

  public updateTimer(payload: SessionTimerPayload): void {
    if (!payload.isActive) {
      this.emptyInProgressStartEpoch = payload.emptyInProgressStartEpoch || 0
      this.stop(true)
      return
    }

    this.emptyInProgressStartEpoch = 0

    this.active = true
    this.paused = Boolean(payload.isPaused)
    this.breakMode = Boolean(payload.isBreak)
    this.isAfk = Boolean(payload.isAfk)
    this.afkBreakStartEpoch = payload.afkBreakStartEpoch || 0
    this.totalSeconds = payload.totalSeconds
    this.goalId = payload.goalId
    this.goalTitle = payload.goalTitle
    this.sessionNote = payload.sessionNote
    this.startedAt = payload.startedAt
    this.effectiveDate = payload.effectiveDate ?? this.effectiveDate
    this.accumulatedPausedMs = payload.accumulatedPausedMs || 0
    this.pauseStartEpoch = payload.pauseStartEpoch || 0

    if (payload.startedAt) {
      this.sessionStartEpoch = new Date(payload.startedAt).getTime()
    } else if (!this.sessionStartEpoch) {
      this.sessionStartEpoch = Date.now() - (payload.totalSeconds - payload.secondsRemaining) * 1000
    }

    this.computeTick()

    if (this.active && !this.paused) {
      this.startTicker()
    } else {
      this.stopTicker()
    }

    this.persist()
  }

  public start(params: {
    totalSeconds: number
    isBreak?: boolean
    isAfk?: boolean
    afkBreakStartEpoch?: number
    goalId?: string
    goalTitle?: string
    sessionNote?: string
    effectiveDate?: string
    autoPauseOnZero?: boolean
  }): SessionTimerPayload {
    const now = Date.now()
    this.active = true
    this.paused = false
    this.breakMode = Boolean(params.isBreak)
    this.isAfk = Boolean(params.isAfk)
    this.afkBreakStartEpoch = params.afkBreakStartEpoch || 0
    this.overtime = false
    this.totalSeconds = params.totalSeconds
    this.secondsRemaining = params.totalSeconds
    this.sessionStartEpoch = now
    this.startedAt = new Date(now).toISOString()
    const cutoff = this.settingsRepo?.getSettings?.()?.dayCutoffHour || 0
    this.effectiveDate = params.effectiveDate || localDateStr(new Date(now), cutoff)
    this.pauseStartEpoch = 0
    this.accumulatedPausedMs = 0
    this.goalId = params.goalId
    this.goalTitle = params.goalTitle
    this.sessionNote = params.sessionNote
    if (typeof params.autoPauseOnZero === 'boolean') {
      this.autoPauseOnZero = params.autoPauseOnZero
    }

    this.startTicker()
    this.persist()

    const state = this.getState()
    this.onTick?.(state)
    return state
  }

  public updateDuration(newTotalSeconds: number): SessionTimerPayload {
    if (!this.active || this.breakMode || newTotalSeconds <= 0) return this.getState()
    this.totalSeconds = newTotalSeconds
    this.computeTick()
    this.persist()
    const state = this.getState()
    this.onTick?.(state)
    return state
  }

  public pause(): SessionTimerPayload {
    if (!this.active || this.paused) return this.getState()
    this.paused = true
    this.pauseStartEpoch = Date.now()
    this.stopTicker()
    this.persist()

    const state = this.getState()
    this.onTick?.(state)
    return state
  }

  public resume(): SessionTimerPayload {
    if (!this.active || !this.paused) return this.getState()
    const now = Date.now()
    if (this.pauseStartEpoch > 0) {
      this.accumulatedPausedMs += now - this.pauseStartEpoch
    }
    this.pauseStartEpoch = 0
    this.paused = false
    this.computeTick()
    this.startTicker()
    this.persist()

    const state = this.getState()
    this.onTick?.(state)
    return state
  }

  public stop(keepEmptyInProgress = false): SessionTimerPayload {
    this.active = false
    this.paused = false
    this.breakMode = false
    this.isAfk = false
    this.afkBreakStartEpoch = 0
    this.overtime = false
    this.totalSeconds = 0
    this.secondsRemaining = 0
    this.sessionStartEpoch = 0
    this.pauseStartEpoch = 0
    this.accumulatedPausedMs = 0
    this.goalId = undefined
    this.goalTitle = undefined
    this.sessionNote = undefined
    this.startedAt = undefined
    this.effectiveDate = undefined
    this.suspendedAt = null
    if (!keepEmptyInProgress) {
      this.emptyInProgressStartEpoch = 0
    }

    this.stopTicker()
    try {
      this.settingsRepo.setActiveSession(null)
    } catch (err) {
      logger.error('session:service', 'Error clearing active session in storage:', err)
    }

    const state = this.getState()
    this.onTick?.(state)
    return state
  }

  public handleZeroReached(autoPause = true): SessionTimerPayload {
    if (!this.active) return this.getState()
    if (autoPause) {
      this.paused = true
      this.pauseStartEpoch = Date.now()
      this.stopTicker()
      this.secondsRemaining = 0
      this.overtime = false
    } else {
      this.computeTick()
    }
    this.persist()
    const state = this.getState()
    this.onTick?.(state)
    return state
  }

  private computeTick(): void {
    if (!this.active) {
      this.secondsRemaining = 0
      this.overtime = false
      return
    }

    if (this.isAfk) {
      const now = Date.now()
      const afkStart = this.afkBreakStartEpoch || this.sessionStartEpoch || now
      const elapsedSec = Math.max(0, Math.floor((now - afkStart) / 1000))
      this.secondsRemaining = elapsedSec
      this.totalSeconds = 0
      this.overtime = false
      this.paused = false
      return
    }

    const now = Date.now()
    const currentPausedMs =
      this.accumulatedPausedMs +
      (this.paused && this.pauseStartEpoch > 0 ? now - this.pauseStartEpoch : 0)

    let elapsedSec = Math.max(
      0,
      Math.floor((now - this.sessionStartEpoch - currentPausedMs) / 1000)
    )
    const maxAllowedOvertime = this.breakMode
      ? MAX_BREAK_OVERTIME_SECONDS
      : MAX_FOCUS_OVERTIME_SECONDS
    const maxAllowedElapsed = this.totalSeconds + maxAllowedOvertime
    if (elapsedSec > maxAllowedElapsed) {
      elapsedSec = maxAllowedElapsed
    }
    this.secondsRemaining = this.totalSeconds - elapsedSec
    this.overtime = !this.breakMode && this.secondsRemaining <= 0

    if (this.autoPauseOnZero && this.secondsRemaining <= 0 && !this.paused) {
      this.secondsRemaining = 0
      this.overtime = false
      this.paused = true
      this.pauseStartEpoch = now
      this.stopTicker()
    }
  }

  public handleSuspend(): void {
    if (!this.active) return
    this.suspendedAt = Date.now()
    this.stopTicker()
  }

  public handleResume(): void {
    if (!this.active) return
    const now = Date.now()
    if (this.suspendedAt) {
      const suspendedDuration = now - this.suspendedAt
      this.accumulatedPausedMs += Math.max(0, suspendedDuration)
      this.suspendedAt = null
    }
    this.computeTick()
    if (!this.paused) {
      this.startTicker()
    }
    this.persist()
    const state = this.getState()
    this.onTick?.(state)
  }

  private startTicker(): void {
    if (this.tickerTimer) return
    let lastTick = Date.now()
    this.tickerTimer = setInterval(() => {
      const now = Date.now()
      const timeSinceLastTick = now - lastTick
      lastTick = now
      // Unified unnotified sleep/standby drift detection threshold (25s)
      if (timeSinceLastTick > 25000) {
        const sleepMs = timeSinceLastTick - this.tickIntervalMs
        this.accumulatedPausedMs += sleepMs
      }
      this.computeTick()
      const state = this.getState()
      this.onTick?.(state)
    }, this.tickIntervalMs)
  }

  private stopTicker(): void {
    if (this.tickerTimer) {
      clearInterval(this.tickerTimer)
      this.tickerTimer = null
    }
  }

  private persist(): void {
    try {
      this.settingsRepo.setActiveSession(this.active ? this.getState() : null)
    } catch (err) {
      logger.error('session:service', 'Error persisting active session:', err)
    }
  }

  public destroy(): void {
    this.stopTicker()
  }
}
