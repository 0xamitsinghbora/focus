import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WeeklyInsightsPanel } from '../components/WeeklyInsightsPanel'
import { WeeklyInsightsData } from '../hooks/useWeeklyInsights'

describe('WeeklyInsightsPanel Component', () => {
  const emptyInsights: WeeklyInsightsData = {
    loading: false,
    totalFocusMinutes: 0,
    avgDailyFocusMinutes: 0,
    activeDays: 0,
    bestDay: null,
    bestHours: [],
    peakHourLabel: '',
    dailyTargetMinutes: 240,
    targetHitDays: 0,
    targetHitRate: 0,
    dailyBreakdown: [
      { date: '2026-11-01', minutes: 0, goalsDone: 0, goalsTotal: 0 },
      { date: '2026-11-02', minutes: 0, goalsDone: 0, goalsTotal: 0 },
      { date: '2026-11-03', minutes: 0, goalsDone: 0, goalsTotal: 0 },
      { date: '2026-11-04', minutes: 0, goalsDone: 0, goalsTotal: 0 },
      { date: '2026-11-05', minutes: 0, goalsDone: 0, goalsTotal: 0 },
      { date: '2026-11-06', minutes: 0, goalsDone: 0, goalsTotal: 0 },
      { date: '2026-11-07', minutes: 0, goalsDone: 0, goalsTotal: 0 }
    ],
    longestSession: 0
  }

  it('renders loading state when loading is true', () => {
    render(<WeeklyInsightsPanel insights={{ ...emptyInsights, loading: true }} />)
    expect(screen.getByText('Loading weekly insights...')).toBeDefined()
  })

  it('renders motivational empty state instead of null when no weekly activity exists', () => {
    const { container } = render(<WeeklyInsightsPanel insights={emptyInsights} />)
    expect(container.firstChild).not.toBeNull()
    expect(screen.getByText('Weekly Insights')).toBeDefined()
    expect(screen.getByText('0/7 active days')).toBeDefined()
    expect(screen.getByText('Ready to build your focus rhythm?')).toBeDefined()
    expect(
      screen.getByText(
        'Complete focus sessions this week to unlock insights into your peak hours, daily averages, and productivity trends.'
      )
    ).toBeDefined()
    expect(screen.getByText('Daily Focus Breakdown')).toBeDefined()
    expect(screen.getByText('Peak Productive Hours')).toBeDefined()
    expect(screen.getByText('Target Progress')).toBeDefined()
  })

  it('renders full insights metrics and charts when activity is present', () => {
    const activeInsights: WeeklyInsightsData = {
      ...emptyInsights,
      totalFocusMinutes: 480,
      avgDailyFocusMinutes: 69,
      activeDays: 3,
      bestDay: { date: '2026-11-05', minutes: 240 },
      bestHours: [{ hour: 10, minutes: 120 }],
      peakHourLabel: '10 AM – 11 AM',
      targetHitDays: 1,
      targetHitRate: 14,
      longestSession: 90
    }

    render(<WeeklyInsightsPanel insights={activeInsights} />)
    expect(screen.getByText('Weekly Insights')).toBeDefined()
    expect(screen.getByText('3/7 active days')).toBeDefined()
    expect(screen.getByText('Total Focus')).toBeDefined()
    expect(screen.getByText('8h')).toBeDefined()
    expect(screen.getByText('Daily Average')).toBeDefined()
    expect(screen.getByText('Best Day')).toBeDefined()
    expect(screen.getByText('Target Hit Rate')).toBeDefined()
  })
})
