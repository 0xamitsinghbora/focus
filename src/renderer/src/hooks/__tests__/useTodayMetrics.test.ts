import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useTodayMetrics } from '../useTodayMetrics'
import { DailyGoal, LogEntry, DayReviewData } from '../../../../shared/types'

describe('useTodayMetrics', () => {
  const mockGoals: DailyGoal[] = [
    {
      id: 'g-1',
      date: '2026-10-30',
      title: 'Active Task',
      status: 'in_progress',
      targetMinutes: 60,
      createdAt: '2026-10-30T10:00:00Z'
    },
    {
      id: 'g-2',
      date: '2026-10-30',
      title: 'Planned Task',
      status: 'planned',
      targetMinutes: 45,
      createdAt: '2026-10-30T10:00:00Z'
    },
    {
      id: 'g-3',
      date: '2026-10-30',
      title: 'Completed Task',
      status: 'done',
      targetMinutes: 30,
      createdAt: '2026-10-30T10:00:00Z'
    }
  ]

  const mockLogs: LogEntry[] = [
    {
      id: 'l-1',
      text: 'Working on task',
      timestamp: '2026-10-30T10:00:00Z',
      goalId: 'g-1',
      productiveMinutes: 25,
      productivity: 'productive'
    },
    {
      id: 'l-2',
      text: 'General deep focus',
      timestamp: '2026-10-30T11:00:00Z',
      productiveMinutes: 35,
      productivity: 'productive'
    },
    {
      id: 'l-3',
      text: 'Coffee break',
      timestamp: '2026-10-30T12:00:00Z',
      durationMinutes: 15,
      productivity: 'break'
    }
  ]

  const mockReview: DayReviewData = {
    date: '2026-10-30',
    totalProductiveMinutes: 60,
    goals: mockGoals,
    logs: mockLogs,
    goalBreakdown: [
      {
        goalId: 'g-1',
        title: 'Active Task',
        status: 'in_progress',
        productiveMinutes: 25,
        logs: [mockLogs[0]]
      }
    ],
    otherProductiveMinutes: 35,
    unclassifiedLogs: [mockLogs[1]]
  }

  it('correctly categorizes active, planned, and completed goals', () => {
    const { result } = renderHook(() =>
      useTodayMetrics({
        todayGoals: mockGoals,
        logs: mockLogs,
        todayReview: mockReview,
        persistedLoggedMinutesMap: {},
        heatmapData: { '2026-10-30': 3 },
        todayDateStr: '2026-10-30'
      })
    )

    expect(result.current.activeTodayGoals.length).toBe(1)
    expect(result.current.activeTodayGoals[0].id).toBe('g-1')
    expect(result.current.plannedTodayGoals.length).toBe(1)
    expect(result.current.plannedTodayGoals[0].id).toBe('g-2')
    expect(result.current.todayDoneGoals.length).toBe(1)
    expect(result.current.todayDoneGoals[0].id).toBe('g-3')
    expect(result.current.productiveToday).toBe(60)
    expect(result.current.todayBreakMins).toBe(15)
  })

  it('computes goal logged minutes correctly mapping direct logs', () => {
    const { result } = renderHook(() =>
      useTodayMetrics({
        todayGoals: mockGoals,
        logs: mockLogs,
        todayReview: mockReview,
        persistedLoggedMinutesMap: { 'g-1': 20 },
        heatmapData: {},
        todayDateStr: '2026-10-30'
      })
    )

    // Log l-1 has 25 minutes for g-1, persisted had 20 -> should take max (25)
    expect(result.current.goalLoggedMinutesMap['g-1']).toBe(25)
  })

  it('computes todaySessionsHint with focus time for secondary area', () => {
    // 1. With multiple logs (60 mins total, avg 30m)
    const { result } = renderHook(() =>
      useTodayMetrics({
        todayGoals: mockGoals,
        logs: mockLogs,
        todayReview: mockReview,
        persistedLoggedMinutesMap: {},
        heatmapData: {},
        todayDateStr: '2026-10-30'
      })
    )
    expect(result.current.todaySessionsHint).toBe('1h focus time · 44% of target · Avg ~20m')

    // 2. With 0 logs
    const { result: emptyResult } = renderHook(() =>
      useTodayMetrics({
        todayGoals: [],
        logs: [],
        todayReview: null,
        persistedLoggedMinutesMap: {},
        heatmapData: {},
        todayDateStr: '2026-10-30'
      })
    )
    expect(emptyResult.current.todaySessionsHint).toBe('No focus time logged')
  })
})
