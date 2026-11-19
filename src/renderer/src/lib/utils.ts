import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { shiftDate, localDateStr, parseLocalDate } from '../../../shared/types'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export function formatMinutes(minutes?: number): string {
  if (!minutes || minutes <= 0) return '0m'
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

export function formatDurationMs(ms: number): string {
  if (!ms || ms <= 0) return '0m'
  const totalMin = Math.round(ms / 60000)
  if (totalMin < 1) return '<1m'
  return formatMinutes(totalMin)
}

export function formatTime(iso?: string, fallback = '--'): string {
  if (!iso) return fallback
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function formatSeconds(totalSeconds: number): string {
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

export function formatTime12h(timeStr: string): string {
  try {
    const [hStr, mStr] = timeStr.split(':')
    const h = parseInt(hStr, 10)
    const m = parseInt(mStr, 10)
    if (isNaN(h) || isNaN(m)) return timeStr
    const period = h >= 12 ? 'PM' : 'AM'
    const h12 = h % 12 === 0 ? 12 : h % 12
    const mm = String(m).padStart(2, '0')
    return `${h12}:${mm} ${period}`
  } catch {
    return timeStr
  }
}

export function formatDeadlineBadge(deadline?: string | null): string {
  if (!deadline) return ''
  try {
    const hasTime = deadline.includes('T') && deadline.length > 10
    const [datePart, timePart] = deadline.includes('T') ? deadline.split('T') : [deadline, null]
    const [y, m, d] = datePart.split('-').map(Number)
    if (!y || !m || !d) return deadline

    const dateObj = new Date(y, m - 1, d)
    const nowYear = new Date().getFullYear()
    const dateFormatted = dateObj.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: dateObj.getFullYear() !== nowYear ? 'numeric' : undefined
    })

    if (hasTime && timePart) {
      const cleanTime = timePart.slice(0, 5)
      const formattedTime = formatTime12h(cleanTime)
      return `${dateFormatted} · ${formattedTime}`
    }
    return dateFormatted
  } catch {
    return deadline
  }
}

export function isDeadlineOverdue(
  deadline?: string | null,
  isDone?: boolean,
  dayCutoffHour = 0
): boolean {
  if (!deadline || isDone) return false
  try {
    if (deadline.includes('T') && deadline.length > 10) {
      const d = new Date(deadline)
      return !isNaN(d.getTime()) && d < new Date()
    }
    const today = localDateStr(new Date(), dayCutoffHour)
    return deadline < today
  } catch {
    return false
  }
}

interface StreakStats {
  activeDays: number
  currentStreak: number
  longestStreak: number
}

export function calculateStreakStats(
  heatmapData: Record<string, number | { total?: number }>,
  todayDateStr: string
): StreakStats {
  const getActivityCount = (val: unknown): number => {
    if (typeof val === 'number') return val
    if (val && typeof val === 'object' && 'total' in val) {
      return Number((val as { total: number }).total) || 0
    }
    return 0
  }

  const dates = Object.keys(heatmapData).filter((d) => getActivityCount(heatmapData[d]) > 0)
  const activeDays = dates.length

  let currentStreak = 0
  let longestStreak = 0

  if (dates.length > 0) {
    const todayKey = todayDateStr
    const yestKey = shiftDate(todayKey, -1)

    let startAnchorKey: string | null = null
    if (getActivityCount(heatmapData[todayKey]) > 0) {
      startAnchorKey = todayKey
    } else if (getActivityCount(heatmapData[yestKey]) > 0) {
      startAnchorKey = yestKey
    }

    if (startAnchorKey) {
      let cursorKey = startAnchorKey
      while (getActivityCount(heatmapData[cursorKey]) > 0) {
        currentStreak++
        cursorKey = shiftDate(cursorKey, -1)
      }
    }

    const sorted = [...dates].sort()
    let tempStreak = 0
    for (let i = 0; i < sorted.length; i++) {
      if (i === 0) {
        tempStreak = 1
      } else if (sorted[i] === sorted[i - 1]) {
        continue
      } else if (shiftDate(sorted[i - 1], 1) === sorted[i]) {
        tempStreak++
      } else {
        tempStreak = 1
      }
      if (tempStreak > longestStreak) longestStreak = tempStreak
    }
  }

  return { activeDays, currentStreak, longestStreak }
}

export function formatDueDateLabel(
  dateStr?: string | null,
  timeStr?: string | null,
  dayCutoffHour = 0
): string | null {
  if (!dateStr) return null
  try {
    const cleanDate = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr
    const extractedTime =
      timeStr || (dateStr.includes('T') ? dateStr.split('T')[1]?.slice(0, 5) : null)

    const todayStr = localDateStr(new Date(), dayCutoffHour)
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowStr = localDateStr(tomorrow, dayCutoffHour)

    let dateLabel = ''
    if (cleanDate === todayStr) {
      const day = parseLocalDate(cleanDate).toLocaleDateString(undefined, {
        weekday: 'short'
      })
      dateLabel = `Today (${day})`
    } else if (cleanDate === tomorrowStr) {
      const day = parseLocalDate(cleanDate).toLocaleDateString(undefined, {
        weekday: 'short'
      })
      dateLabel = `Tomorrow (${day})`
    } else {
      const [y, m, d] = cleanDate.split('-').map(Number)
      if (y && m && d) {
        const dateObj = new Date(y, m - 1, d)
        const nowYear = new Date().getFullYear()
        dateLabel = dateObj.toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: dateObj.getFullYear() !== nowYear ? 'numeric' : undefined
        })
      } else {
        dateLabel = cleanDate
      }
    }

    if (extractedTime) {
      return `${dateLabel} at ${formatTime12h(extractedTime)}`
    }
    return dateLabel
  } catch {
    return dateStr
  }
}
