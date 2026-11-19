import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useWeeklyInsights } from '../useWeeklyInsights'
import { DayReviewData, AppSettings } from '../../../../shared/types'

describe('useWeeklyInsights', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(window as any).api = {
      logs: {
        getDayReview: vi.fn()
      },
      settings: {
        get: vi.fn()
      },
      events: {
        onDataUpdated: vi.fn(() => vi.fn())
      }
    }
  })

  it('returns clean initial state with loading indicator when inactive', () => {
    const { result } = renderHook(() => useWeeklyInsights('2026-11-06', false))

    expect(result.current.loading).toBe(true)
    expect(result.current.totalFocusMinutes).toBe(0)
    expect(result.current.activeDays).toBe(0)
    expect(result.current.bestDay).toBeNull()
    expect(result.current.bestHours).toEqual([])
    expect((result.current as any).currentStreak).toBeUndefined()
  })

  it('aggregates week review data correctly when active', async () => {
    const mockSettings: AppSettings = {
      openAtLogin: true,
      reminderIntervalMinutes: 45,
      dailyFocusTargetMinutes: 120
    }

    const mockReview: DayReviewData = {
      date: '2026-11-06',
      totalProductiveMinutes: 150,
      goals: [
        {
          id: 'g-1',
          date: '2026-11-06',
          title: 'Goal 1',
          status: 'done',
          createdAt: '2026-11-06T10:00:00Z'
        }
      ],
      logs: [
        {
          id: 'l-1',
          text: 'Coding',
          timestamp: '2026-11-06T10:00:00Z',
          startedAt: '2026-11-06T10:00:00Z',
          endedAt: '2026-11-06T12:00:00Z',
          productiveMinutes: 120,
          productivity: 'productive'
        }
      ],
      goalBreakdown: [],
      otherProductiveMinutes: 30,
      unclassifiedLogs: []
    }

    ;(window as any).api.settings.get.mockResolvedValue(mockSettings)
    ;(window as any).api.logs.getDayReview.mockImplementation(async (date: string) => {
      if (date === '2026-11-06') return mockReview
      return null
    })

    const { result } = renderHook(() => useWeeklyInsights('2026-11-06', true))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.totalFocusMinutes).toBe(150)
    expect(result.current.activeDays).toBe(1)
    expect(result.current.bestDay).toEqual({ date: '2026-11-06', minutes: 150 })
    expect(result.current.dailyTargetMinutes).toBe(120)
    expect(result.current.targetHitDays).toBe(1)
    expect(result.current.longestSession).toBe(120)
    expect(result.current.dailyBreakdown).toHaveLength(7)
    expect((result.current as any).currentStreak).toBeUndefined()
  })

  it('only re-fetches today review on onDataUpdated when update targets today', async () => {
    let updateCallback: ((target?: any) => void) | null = null
    ;(window as any).api.events.onDataUpdated = vi.fn((cb) => {
      updateCallback = cb
      return () => {
        updateCallback = null
      }
    })

    const mockSettings: AppSettings = {
      openAtLogin: true,
      reminderIntervalMinutes: 45,
      dailyFocusTargetMinutes: 120
    }
    ;(window as any).api.settings.get.mockResolvedValue(mockSettings)
    ;(window as any).api.logs.getDayReview.mockResolvedValue(null)

    const { result } = renderHook(() => useWeeklyInsights('2026-11-06', true))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    // Mount fetches all 7 days
    expect((window as any).api.logs.getDayReview).toHaveBeenCalledTimes(7)
    ;(window as any).api.logs.getDayReview.mockClear()

    // Trigger update for today
    await act(async () => {
      updateCallback?.({ logDates: ['2026-11-06'] })
      await Promise.resolve()
    })

    // Must ONLY re-fetch today (1 call instead of 7)
    expect((window as any).api.logs.getDayReview).toHaveBeenCalledTimes(1)
    expect((window as any).api.logs.getDayReview).toHaveBeenCalledWith('2026-11-06')
  })

  it('does not re-fetch day reviews when onDataUpdated only has syncSettings', async () => {
    let updateCallback: ((target?: any) => void) | null = null
    ;(window as any).api.events.onDataUpdated = vi.fn((cb) => {
      updateCallback = cb
      return () => {
        updateCallback = null
      }
    })

    ;(window as any).api.settings.get.mockResolvedValue({ dailyFocusTargetMinutes: 120 })
    ;(window as any).api.logs.getDayReview.mockResolvedValue(null)

    const { result } = renderHook(() => useWeeklyInsights('2026-11-06', true))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect((window as any).api.logs.getDayReview).toHaveBeenCalledTimes(7)
    ;(window as any).api.logs.getDayReview.mockClear()
    ;(window as any).api.settings.get.mockResolvedValueOnce({ dailyFocusTargetMinutes: 150 })

    await act(async () => {
      updateCallback?.({ syncSettings: true })
      await Promise.resolve()
    })

    // No day reviews fetched, only settings
    expect((window as any).api.logs.getDayReview).not.toHaveBeenCalled()
    expect((window as any).api.settings.get).toHaveBeenCalledTimes(2)
  })

  it('does not re-fetch day reviews when updated dates are outside the 7-day week', async () => {
    let updateCallback: ((target?: any) => void) | null = null
    ;(window as any).api.events.onDataUpdated = vi.fn((cb) => {
      updateCallback = cb
      return () => {
        updateCallback = null
      }
    })

    ;(window as any).api.settings.get.mockResolvedValue({ dailyFocusTargetMinutes: 120 })
    ;(window as any).api.logs.getDayReview.mockResolvedValue(null)

    const { result } = renderHook(() => useWeeklyInsights('2026-11-06', true))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect((window as any).api.logs.getDayReview).toHaveBeenCalledTimes(7)
    ;(window as any).api.logs.getDayReview.mockClear()

    await act(async () => {
      updateCallback?.({ goalDates: ['2026-08-01'] })
      await Promise.resolve()
    })

    expect((window as any).api.logs.getDayReview).not.toHaveBeenCalled()
  })
})
