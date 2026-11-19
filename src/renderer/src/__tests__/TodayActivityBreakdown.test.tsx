import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TodayActivityBreakdown } from '../components/TodayActivityBreakdown'
import { DailyGoal, LogEntry } from '../../../shared/types'

describe('TodayActivityBreakdown Component', () => {
  it('renders nothing when logs array is empty', () => {
    const { container } = render(<TodayActivityBreakdown logs={[]} goals={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders breakdown of tasks and percentages when logs are present', () => {
    const goals: DailyGoal[] = [
      {
        id: 'g1',
        title: 'Build UI Component',
        date: '2026-10-28',
        status: 'in_progress',
        createdAt: new Date().toISOString()
      },
      {
        id: 'g2',
        title: 'Review Pull Request',
        groupTag: 'Backend',
        groupColor: 'blue',
        date: '2026-10-28',
        status: 'in_progress',
        createdAt: new Date().toISOString()
      }
    ]

    const logs: LogEntry[] = [
      {
        id: 'l1',
        timestamp: new Date().toISOString(),
        text: 'Build UI Component',
        goalId: 'g1',
        goalTitle: 'Build UI Component',
        durationMinutes: 45,
        productiveMinutes: 45,
        productivity: 'productive'
      },
      {
        id: 'l2',
        timestamp: new Date().toISOString(),
        text: 'Review Pull Request',
        goalId: 'g2',
        goalTitle: 'Review Pull Request',
        durationMinutes: 15,
        productiveMinutes: 15,
        productivity: 'productive'
      }
    ]

    render(<TodayActivityBreakdown logs={logs} goals={goals} />)

    expect(screen.getByText('Focus Breakdown')).toBeDefined()
    expect(screen.getByText('2 tasks worked on')).toBeDefined()
    expect(screen.getByText('Build UI Component')).toBeDefined()
    expect(screen.getByText('Review Pull Request')).toBeDefined()
    expect(screen.getByText('45m')).toBeDefined()
    expect(screen.getByText('15m')).toBeDefined()
    expect(screen.getByText('75%')).toBeDefined()
    expect(screen.getByText('25%')).toBeDefined()
  })

  it('handles breaks and categorizes them accurately', () => {
    const goals: DailyGoal[] = [
      {
        id: 'g1',
        title: 'Deep Coding',
        date: '2026-10-28',
        status: 'in_progress',
        createdAt: new Date().toISOString()
      }
    ]

    const logs: LogEntry[] = [
      {
        id: 'l1',
        timestamp: new Date().toISOString(),
        text: 'Deep Coding',
        goalId: 'g1',
        durationMinutes: 50,
        productiveMinutes: 50,
        productivity: 'productive'
      },
      {
        id: 'l2',
        timestamp: new Date().toISOString(),
        text: 'Coffee and stretch break',
        durationMinutes: 10,
        productiveMinutes: 0,
        productivity: 'break'
      }
    ]

    render(<TodayActivityBreakdown logs={logs} goals={goals} />)

    expect(screen.getByText('Break Time')).toBeDefined()
    expect(screen.getByText('Deep Coding')).toBeDefined()
    expect(screen.getByText('10m')).toBeDefined()
    expect(screen.getByText('50m')).toBeDefined()

    const breakBadge = screen.getByText('Break Time')
    expect(breakBadge.className).toContain('text-apple-red')
    const breakContainer = breakBadge.closest('div')
    expect(breakContainer?.className).toContain('bg-apple-red/10')
  })

  it('does not classify productive tasks with "break" in title as break time', () => {
    const goals: DailyGoal[] = [
      {
        id: 'g1',
        title: 'Fix breaking change in authentication',
        date: '2026-10-28',
        status: 'in_progress',
        createdAt: new Date().toISOString()
      }
    ]

    const logs: LogEntry[] = [
      {
        id: 'l1',
        timestamp: new Date().toISOString(),
        text: 'Fix breaking change in authentication',
        goalId: 'g1',
        durationMinutes: 40,
        productiveMinutes: 40,
        productivity: 'productive'
      }
    ]

    render(<TodayActivityBreakdown logs={logs} goals={goals} />)

    expect(screen.getByText('Fix breaking change in authentication')).toBeDefined()
    expect(screen.queryByText('Break Time')).toBeNull()
  })

  it('keeps cumulative segment bar widths bounded to 100% when many small tasks exist', () => {
    // 20 tasks, 1 minute each, plus one 180 minute task
    const logs: LogEntry[] = Array.from({ length: 20 }, (_, i) => ({
      id: `task-${i}`,
      timestamp: new Date().toISOString(),
      text: `Microtask ${i}`,
      durationMinutes: 1,
      productiveMinutes: 1,
      productivity: 'productive' as const
    }))
    logs.push({
      id: 'big-task',
      timestamp: new Date().toISOString(),
      text: 'Major Feature Work',
      durationMinutes: 180,
      productiveMinutes: 180,
      productivity: 'productive' as const
    })

    const { container } = render(<TodayActivityBreakdown logs={logs} goals={[]} />)
    const progressBar =
      container.querySelector('.w-full.rounded-full') || container.querySelector('.h-2.w-full')
    expect(progressBar).toBeDefined()

    const segments = Array.from(progressBar!.querySelectorAll('div'))
    expect(segments).toHaveLength(21)

    // Sum of segment widths must be <= 100.001%
    const totalWidth = segments.reduce((sum, seg) => {
      const match = seg.style.width.match(/([\d.]+)%/)
      return sum + (match ? parseFloat(match[1]) : 0)
    }, 0)

    expect(totalWidth).toBeLessThanOrEqual(100.001)
    expect(totalWidth).toBeGreaterThan(99.99)
  })

  it('unifies logs with goalId and logs without goalId matching goal title into a single row', () => {
    const goals: DailyGoal[] = [
      {
        id: 'g-canonical',
        title: 'API Refactoring',
        date: '2026-10-28',
        status: 'in_progress',
        createdAt: new Date().toISOString()
      }
    ]

    const logs: LogEntry[] = [
      {
        id: 'l1',
        timestamp: new Date().toISOString(),
        text: 'API Refactoring',
        goalId: 'g-canonical',
        durationMinutes: 30,
        productiveMinutes: 30,
        productivity: 'productive'
      },
      {
        id: 'l2',
        timestamp: new Date().toISOString(),
        text: 'API Refactoring',
        goalTitle: 'API Refactoring',
        durationMinutes: 20,
        productiveMinutes: 20,
        productivity: 'productive'
      }
    ]

    render(<TodayActivityBreakdown logs={logs} goals={goals} />)

    expect(screen.getByText('1 task worked on')).toBeDefined()
    expect(screen.getByText('API Refactoring')).toBeDefined()
    expect(screen.getByText('50m')).toBeDefined()
    expect(screen.getByText('100%')).toBeDefined()
  })
})
