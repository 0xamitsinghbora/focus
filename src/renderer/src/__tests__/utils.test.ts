import { describe, it, expect } from 'vitest'
import { localDateStr, shiftDate } from '../../../shared/types'
import {
  formatMinutes,
  formatDurationMs,
  formatSeconds,
  formatTime12h,
  formatDeadlineBadge,
  isDeadlineOverdue,
  calculateStreakStats,
  cn
} from '../lib/utils'

describe('Renderer Utils — cn (class merge)', () => {
  it('combines classes and handles tailwind conflicts', () => {
    expect(cn('p-4', 'p-2')).toBe('p-2')
    expect(cn('text-red-500', undefined, 'font-bold')).toBe('text-red-500 font-bold')
  })
})

describe('Renderer Utils — formatMinutes', () => {
  it('formats 0 or negative minutes', () => {
    expect(formatMinutes(0)).toBe('0m')
    expect(formatMinutes(-10)).toBe('0m')
    expect(formatMinutes(undefined)).toBe('0m')
  })

  it('formats under 60 minutes', () => {
    expect(formatMinutes(15)).toBe('15m')
    expect(formatMinutes(59)).toBe('59m')
  })

  it('formats exact hours and mixed hours and minutes', () => {
    expect(formatMinutes(60)).toBe('1h')
    expect(formatMinutes(120)).toBe('2h')
    expect(formatMinutes(90)).toBe('1h 30m')
    expect(formatMinutes(155)).toBe('2h 35m')
  })
})

describe('Renderer Utils — formatDurationMs', () => {
  it('formats zero or sub-minute durations', () => {
    expect(formatDurationMs(0)).toBe('0m')
    expect(formatDurationMs(-500)).toBe('0m')
    expect(formatDurationMs(20000)).toBe('<1m')
  })

  it('formats rounded minutes and hours from milliseconds', () => {
    expect(formatDurationMs(60000)).toBe('1m')
    expect(formatDurationMs(90000)).toBe('2m')
    expect(formatDurationMs(3600000)).toBe('1h')
    expect(formatDurationMs(5400000)).toBe('1h 30m')
  })
})

describe('Renderer Utils — formatSeconds', () => {
  it('formats minutes and seconds', () => {
    expect(formatSeconds(0)).toBe('00:00')
    expect(formatSeconds(65)).toBe('01:05')
    expect(formatSeconds(599)).toBe('09:59')
  })

  it('formats hours, minutes, and seconds', () => {
    expect(formatSeconds(3600)).toBe('1:00:00')
    expect(formatSeconds(3665)).toBe('1:01:05')
  })
})

describe('Renderer Utils — formatTime12h', () => {
  it('converts 24h to 12h AM/PM format', () => {
    expect(formatTime12h('09:05')).toBe('9:05 AM')
    expect(formatTime12h('12:00')).toBe('12:00 PM')
    expect(formatTime12h('14:30')).toBe('2:30 PM')
    expect(formatTime12h('00:15')).toBe('12:15 AM')
    expect(formatTime12h('23:59')).toBe('11:59 PM')
  })

  it('returns raw string for invalid inputs', () => {
    expect(formatTime12h('invalid')).toBe('invalid')
  })
})

describe('Renderer Utils — Deadlines', () => {
  it('identifies overdue deadlines', () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    expect(isDeadlineOverdue(yesterday, false)).toBe(true)
    expect(isDeadlineOverdue(yesterday, true)).toBe(false)
    expect(isDeadlineOverdue(tomorrow, false)).toBe(false)
    expect(isDeadlineOverdue(undefined, false)).toBe(false)
  })

  it('respects dayCutoffHour for date-only deadlines', () => {
    const today = localDateStr(new Date(), 4)
    expect(isDeadlineOverdue(today, false, 4)).toBe(false)
    const yesterday = shiftDate(today, -1)
    expect(isDeadlineOverdue(yesterday, false, 4)).toBe(true)
  })

  it('formats deadline badges correctly', () => {
    expect(formatDeadlineBadge(null)).toBe('')
    expect(formatDeadlineBadge(undefined)).toBe('')
    const badgeDate = formatDeadlineBadge('2026-05-15')
    expect(badgeDate).toMatch(/May/)
    expect(badgeDate).toMatch(/15/)
    const badgeDateTime = formatDeadlineBadge('2026-05-15T14:30:00')
    expect(badgeDateTime).toMatch(/May/)
    expect(badgeDateTime).toMatch(/15/)
    expect(badgeDateTime).toContain('2:30 PM')
  })
})

describe('Renderer Utils — calculateStreakStats', () => {
  it('calculates current and longest streaks correctly', () => {
    const data = {
      '2026-03-01': 2,
      '2026-03-02': 1,
      '2026-03-03': 4,
      '2026-03-05': 1,
      '2026-03-06': 3
    }
    // Today is 2026-03-06
    const stats = calculateStreakStats(data, '2026-03-06')
    expect(stats.activeDays).toBe(5)
    expect(stats.currentStreak).toBe(2) // 03-05 and 03-06
    expect(stats.longestStreak).toBe(3) // 03-01, 03-02, 03-03
  })

  it('keeps current streak alive if yesterday was active and today has no activity yet', () => {
    const data = {
      '2026-03-05': 2,
      '2026-03-06': 3
    }
    // Today is 2026-03-07 (not in data yet)
    const stats = calculateStreakStats(data, '2026-03-07')
    expect(stats.currentStreak).toBe(2)
  })

  it('resets current streak to 0 if neither today nor yesterday had activity', () => {
    const data = {
      '2026-03-01': 2,
      '2026-03-02': 1
    }
    // Today is 2026-03-05
    const stats = calculateStreakStats(data, '2026-03-05')
    expect(stats.currentStreak).toBe(0)
    expect(stats.longestStreak).toBe(2)
  })

  it('handles DST transition boundaries accurately using calendar math without day slip', () => {
    // US Spring DST transition occurs on 2026-03-08 (23h day)
    const data = {
      '2026-03-07': 1,
      '2026-03-08': 1,
      '2026-03-09': 1
    }
    const stats = calculateStreakStats(data, '2026-03-09')
    expect(stats.currentStreak).toBe(3)
    expect(stats.longestStreak).toBe(3)
  })

  it('handles structured activity objects with total counts', () => {
    const data = {
      '2026-03-01': { total: 2 },
      '2026-03-02': { total: 1 }
    }
    const stats = calculateStreakStats(data, '2026-03-02')
    expect(stats.currentStreak).toBe(2)
    expect(stats.longestStreak).toBe(2)
  })
})
