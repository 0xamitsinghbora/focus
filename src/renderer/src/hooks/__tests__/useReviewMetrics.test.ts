import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useReviewMetrics } from '../useReviewMetrics'
import { DayReviewData } from '../../../../shared/types'

describe('useReviewMetrics', () => {
  const mockReview: DayReviewData = {
    date: '2026-10-29',
    totalProductiveMinutes: 120,
    goals: [
      {
        id: 'g-past',
        date: '2026-10-29',
        title: 'Review Goal',
        targetMinutes: 120,
        status: 'done',
        createdAt: '2026-10-29T10:00:00Z'
      }
    ],
    logs: [
      {
        id: 'l-past-1',
        text: 'Session 1',
        timestamp: '2026-10-29T10:00:00Z',
        productiveMinutes: 60,
        productivity: 'productive'
      },
      {
        id: 'l-past-2',
        text: 'Session 2',
        timestamp: '2026-10-29T11:00:00Z',
        productiveMinutes: 60,
        productivity: 'productive'
      },
      {
        id: 'l-past-break',
        text: 'Break',
        timestamp: '2026-10-29T12:00:00Z',
        durationMinutes: 20,
        productivity: 'break'
      }
    ],
    goalBreakdown: [],
    otherProductiveMinutes: 0,
    unclassifiedLogs: []
  }

  it('computes review statistics accurately from active review payload', () => {
    const { result } = renderHook(() =>
      useReviewMetrics({
        selectedDayDate: '2026-10-29',
        todayDateStr: '2026-10-30',
        selectedDayReview: mockReview,
        todayReview: null,
        productiveToday: 45
      })
    )

    expect(result.current.reviewProductiveMins).toBe(120)
    expect(result.current.reviewBreakMins).toBe(20)
    expect(result.current.totalTargetMinutes).toBe(120)
    expect(result.current.reviewLogs.length).toBe(3)
    expect(result.current.reviewFocusHint).toContain('100% of 2h daily target')
  })

  it('falls back to today review when selected day matches today and day review is empty', () => {
    const todayReview: DayReviewData = {
      date: '2026-10-30',
      totalProductiveMinutes: 45,
      goals: [],
      logs: [],
      goalBreakdown: [],
      otherProductiveMinutes: 0,
      unclassifiedLogs: []
    }

    const { result } = renderHook(() =>
      useReviewMetrics({
        selectedDayDate: '2026-10-30',
        todayDateStr: '2026-10-30',
        selectedDayReview: null,
        todayReview,
        productiveToday: 45
      })
    )

    expect(result.current.reviewProductiveMins).toBe(45)
    expect(result.current.activeReview?.date).toBe('2026-10-30')
  })
})
