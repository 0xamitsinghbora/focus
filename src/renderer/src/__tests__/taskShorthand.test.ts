import { describe, it, expect } from 'vitest'
import { parseTaskShorthand } from '../lib/taskShorthand'

describe('parseTaskShorthand', () => {
  const fixedNow = new Date('2026-11-01T10:00:00Z') // A Sunday

  it('parses duration in minutes and hours', () => {
    expect(parseTaskShorthand('Write blog post ~45m')).toEqual({
      cleanTitle: 'Write blog post',
      parsedMinutes: 45,
      parsedTag: undefined,
      parsedDueDate: undefined,
      parsedDueTime: undefined
    })

    expect(parseTaskShorthand('Deep focus session ~1.5h')).toEqual({
      cleanTitle: 'Deep focus session',
      parsedMinutes: 90,
      parsedTag: undefined,
      parsedDueDate: undefined,
      parsedDueTime: undefined
    })
  })

  it('parses group tags', () => {
    expect(parseTaskShorthand('Refactor auth module #backend')).toEqual({
      cleanTitle: 'Refactor auth module',
      parsedMinutes: undefined,
      parsedTag: 'backend',
      parsedDueDate: undefined,
      parsedDueTime: undefined
    })
  })

  it('parses natural language due dates for @today and @tomorrow', () => {
    const todayResult = parseTaskShorthand('Submit expense report @today', fixedNow)
    expect(todayResult.cleanTitle).toBe('Submit expense report')
    expect(todayResult.parsedDueDate).toBe('2026-11-01')

    const tomorrowResult = parseTaskShorthand('Call dentist @tomorrow', fixedNow)
    expect(tomorrowResult.cleanTitle).toBe('Call dentist')
    expect(tomorrowResult.parsedDueDate).toBe('2026-11-02')
  })

  it('parses natural weekday targets (e.g. @fri or @friday)', () => {
    // 2026-11-01 is Sunday (day 0), Friday is 2026-11-06 (day 5)
    const result = parseTaskShorthand('Team retrospective @fri', fixedNow)
    expect(result.cleanTitle).toBe('Team retrospective')
    expect(result.parsedDueDate).toBe('2026-11-06')
  })

  it('parses combined due date and time', () => {
    const result = parseTaskShorthand('Client demo ~45m #sales @tomorrow 3pm', fixedNow)
    expect(result.cleanTitle).toBe('Client demo')
    expect(result.parsedMinutes).toBe(45)
    expect(result.parsedTag).toBe('sales')
    expect(result.parsedDueDate).toBe('2026-11-02')
    expect(result.parsedDueTime).toBe('15:00')
  })

  it('parses explicit ISO date syntax', () => {
    const result = parseTaskShorthand('Quarterly filing due:2026-11-15 @17:00', fixedNow)
    expect(result.cleanTitle).toBe('Quarterly filing')
    expect(result.parsedDueDate).toBe('2026-11-15')
    expect(result.parsedDueTime).toBe('17:00')
  })
})
