import { SessionTimerPayload } from './types'

/**
 * Formats seconds into MM:SS or HH:MM:SS
 */
export function formatSecondsForTaskbar(totalSeconds: number): string {
  const safeSec = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safeSec / 3600)
  const minutes = Math.floor((safeSec % 3600) / 60)
  const seconds = safeSec % 60

  const mStr = String(minutes).padStart(2, '0')
  const sStr = String(seconds).padStart(2, '0')

  if (hours > 0) {
    return `${hours}:${mStr}:${sStr}`
  }
  return `${mStr}:${sStr}`
}

/**
 * Formats human readable remaining time like "24m", "1h 10m", or "45s"
 */
export function formatHumanDuration(totalSeconds: number): string {
  const safeSec = Math.max(0, Math.floor(totalSeconds))
  if (safeSec < 60) {
    return `${safeSec}s`
  }
  const hours = Math.floor(safeSec / 3600)
  const minutes = Math.floor((safeSec % 3600) / 60)

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
  }
  return `${minutes}m`
}

/**
 * Formats the window title / taskbar button label
 */
export function formatTaskbarTitle(payload: SessionTimerPayload): string {
  if (!payload.isActive) {
    return 'focus'
  }

  const timeStr = payload.isOvertime
    ? `+${formatSecondsForTaskbar(Math.abs(payload.secondsRemaining))}`
    : formatSecondsForTaskbar(Math.max(0, payload.secondsRemaining))

  if (payload.isBreak) {
    if (payload.isAfk) {
      return `${timeStr} - AFK Break | focus`
    }
    return `${timeStr} - Break | focus`
  }

  const taskName = payload.goalTitle?.trim() || 'Focusing'

  if (payload.isPaused) {
    if (payload.pauseStartEpoch && payload.pauseStartEpoch > 0) {
      const pauseSec = Math.max(0, Math.floor((Date.now() - payload.pauseStartEpoch) / 1000))
      const pauseTimeStr = formatSecondsForTaskbar(pauseSec)
      const taskTimeStr = formatSecondsForTaskbar(Math.max(0, payload.secondsRemaining))
      return `[Pause ${pauseTimeStr}] ${taskName} (Noted: ${taskTimeStr}) | focus`
    }
    return `${timeStr} (Paused) - ${taskName} | focus`
  }

  if (payload.isOvertime) {
    return `${timeStr} (Overtime) - ${taskName} | focus`
  }

  return `${timeStr} - ${taskName} | focus`
}

/**
 * Formats the taskbar thumbnail preview tooltip (Windows taskbar hover)
 */
export function formatTaskbarThumbnailTooltip(payload: SessionTimerPayload): string {
  if (!payload.isActive) {
    return 'focus'
  }

  const durationStr = formatHumanDuration(Math.abs(payload.secondsRemaining))

  if (payload.isBreak) {
    if (payload.isAfk) {
      return `AFK Break (${durationStr})`
    }
    return `Break (${durationStr} left)`
  }

  const taskName = payload.goalTitle?.trim() || 'Focus session'

  if (payload.isPaused) {
    if (payload.pauseStartEpoch && payload.pauseStartEpoch > 0) {
      const pauseSec = Math.max(0, Math.floor((Date.now() - payload.pauseStartEpoch) / 1000))
      return `Paused: ${formatHumanDuration(pauseSec)} · Noted green task: ${taskName} (${durationStr} left)`
    }
    return `Paused: ${taskName} (${durationStr} left)`
  }

  if (payload.isOvertime) {
    return `Overtime: ${taskName} (+${durationStr})`
  }

  return `Focusing: ${taskName} (${durationStr} left)`
}

/**
 * Formats the system tray tooltip (notification area hover)
 */
export function formatTrayTooltip(payload: SessionTimerPayload, nextPromptText?: string): string {
  if (!payload.isActive) {
    return nextPromptText ? `focus - ${nextPromptText}` : 'focus'
  }

  const timeStr = payload.isOvertime
    ? `+${formatSecondsForTaskbar(Math.abs(payload.secondsRemaining))}`
    : formatSecondsForTaskbar(Math.max(0, payload.secondsRemaining))

  if (payload.isBreak) {
    if (payload.isAfk) {
      return `AFK Break: ${timeStr}`
    }
    return `Break: ${timeStr} remaining`
  }

  const taskName = payload.goalTitle?.trim() || 'Focus Session'

  if (payload.isPaused) {
    if (payload.pauseStartEpoch && payload.pauseStartEpoch > 0) {
      const pauseSec = Math.max(0, Math.floor((Date.now() - payload.pauseStartEpoch) / 1000))
      return `Pause: ${formatSecondsForTaskbar(pauseSec)} · Noted green task: ${taskName} (${timeStr} remaining)`
    }
    return `Focus Paused: ${timeStr} remaining - ${taskName}`
  }

  if (payload.isOvertime) {
    return `Focus Overtime: ${timeStr} - ${taskName}`
  }

  return `Focus: ${timeStr} remaining - ${taskName}`
}

/**
 * Formats the tray context menu top status header label
 */
export function formatTrayMenuLabel(
  payload: SessionTimerPayload,
  nextPromptText?: string
): string | null {
  if (!payload.isActive) {
    return nextPromptText ? nextPromptText : null
  }

  const timeStr = payload.isOvertime
    ? `+${formatSecondsForTaskbar(Math.abs(payload.secondsRemaining))}`
    : formatSecondsForTaskbar(Math.max(0, payload.secondsRemaining))

  if (payload.isBreak) {
    if (payload.isAfk) {
      return `AFK Break: ${timeStr}`
    }
    return `Break: ${timeStr}`
  }

  const taskName = payload.goalTitle?.trim() || 'Focus Session'

  if (payload.isPaused) {
    return `Paused: ${taskName} (${timeStr})`
  }

  if (payload.isOvertime) {
    return `Overtime: ${taskName} (${timeStr})`
  }

  return `Focusing: ${taskName} (${timeStr})`
}

/**
 * Calculates taskbar progress bar value and mode
 * - normal: green progress bar
 * - paused: yellow progress bar
 * - error: red progress bar (overtime)
 * - none: removed (-1)
 */
export function calculateTaskbarProgress(payload: SessionTimerPayload): {
  progress: number
  mode: 'normal' | 'paused' | 'error' | 'none'
} {
  if (!payload.isActive) {
    return { progress: -1, mode: 'none' }
  }

  if (payload.isOvertime) {
    return { progress: 1, mode: 'error' }
  }

  const total = Math.max(1, payload.totalSeconds)
  const remaining = Math.max(0, payload.secondsRemaining)
  const elapsed = Math.max(0, total - remaining)
  const fraction = Math.min(1, Math.max(0, elapsed / total))

  if (payload.isBreak) {
    return { progress: fraction, mode: 'error' }
  }

  if (payload.isPaused) {
    return { progress: fraction, mode: 'paused' }
  }

  return { progress: fraction, mode: 'normal' }
}
