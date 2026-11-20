import { describe, it, expect } from 'vitest'
import { localDateStr, parseLocalDate, shiftDate } from '../types'

describe('localDateStr', () => {
  it('formats a date as YYYY-MM-DD', () => {
    const d = new Date(2026, 0, 5) // Jan 5, 2026
    expect(localDateStr(d)).toBe('2026-01-05')
  })

  it('pads single-digit months and days', () => {
    const d = new Date(2025, 2, 9) // Mar 9, 2025
    expect(localDateStr(d)).toBe('2025-03-09')
  })

  it('handles December correctly', () => {
    const d = new Date(2025, 11, 31) // Dec 31, 2025
    expect(localDateStr(d)).toBe('2025-12-31')
  })

  it('defaults to current date when no argument', () => {
    const result = localDateStr()
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('supports configurable night-owl cutoff hour', () => {
    // 2026-04-16 at 01:30 AM with 4 AM cutoff -> still part of 2026-04-15
    const lateNight = new Date(2026, 3, 16, 1, 30)
    expect(localDateStr(lateNight, 4)).toBe('2026-04-15')

    // 2026-04-16 at 03:59 AM with 4 AM cutoff -> still part of 2026-04-15
    const beforeCutoff = new Date(2026, 3, 16, 3, 59)
    expect(localDateStr(beforeCutoff, 4)).toBe('2026-04-15')

    // 2026-04-16 at 04:00 AM with 4 AM cutoff -> rolls over to 2026-04-16
    const atCutoff = new Date(2026, 3, 16, 4, 0)
    expect(localDateStr(atCutoff, 4)).toBe('2026-04-16')

    // 2026-04-15 at 11:30 PM with 4 AM cutoff -> part of 2026-04-15
    const evening = new Date(2026, 3, 15, 23, 30)
    expect(localDateStr(evening, 4)).toBe('2026-04-15')

    // Both late evening and post-midnight belong to the same logical day
    expect(localDateStr(evening, 4)).toBe(localDateStr(lateNight, 4))
  })
})

describe('parseLocalDate and shiftDate', () => {
  it('parses YYYY-MM-DD into a date anchored at 12:00:00 noon', () => {
    const d = parseLocalDate('2026-03-08')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(2) // March
    expect(d.getDate()).toBe(8)
    expect(d.getHours()).toBe(12)
  })

  it('safely shifts dates across month boundaries and leap years', () => {
    expect(shiftDate('2026-02-28', 1)).toBe('2026-03-01')
    expect(shiftDate('2024-02-28', 1)).toBe('2024-02-29') // leap year
    expect(shiftDate('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('handles invalid inputs gracefully by falling back to current date', () => {
    expect(parseLocalDate('')).toBeInstanceOf(Date)
    expect(shiftDate('invalid', 0)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
