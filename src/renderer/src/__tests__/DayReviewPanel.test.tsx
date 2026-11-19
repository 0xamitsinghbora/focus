import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { DayReviewPanel } from '../components/DayReviewPanel'
import { DayReviewData, localDateStr } from '../../../shared/types'

describe('DayReviewPanel Component', () => {
  it('renders loading state when review is null', () => {
    render(<DayReviewPanel review={null} today="2026-10-28" />)
    expect(screen.getByText(/Loading day review.../i)).toBeDefined()
  })

  it('transitions from null to loaded review without rules-of-hooks error', () => {
    const today = localDateStr()
    const { rerender } = render(<DayReviewPanel review={null} today={today} />)
    expect(screen.getByText(/Loading day review.../i)).toBeDefined()

    const mockReview: DayReviewData = {
      date: today,
      logs: [],
      goals: [],
      totalProductiveMinutes: 0,
      goalBreakdown: [],
      otherProductiveMinutes: 0,
      unclassifiedLogs: []
    }

    // Should not throw: "Rendered more hooks than during the previous render"
    expect(() => {
      rerender(<DayReviewPanel review={mockReview} today={today} />)
    }).not.toThrow()

    expect(screen.getByText('Today')).toBeDefined()
    expect(screen.getByText(/No activity recorded for this day/i)).toBeDefined()
  })

  it('renders Yesterday title for the day before today', () => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    const yesterday = localDateStr(d)

    const mockReview: DayReviewData = {
      date: yesterday,
      logs: [],
      goals: [],
      totalProductiveMinutes: 0,
      goalBreakdown: [],
      otherProductiveMinutes: 0,
      unclassifiedLogs: []
    }

    render(<DayReviewPanel review={mockReview} today={localDateStr()} />)
    expect(screen.getByText('Yesterday')).toBeDefined()
  })

  it('correctly identifies Yesterday when dayCutoffHour is configured', () => {
    const mockReview: DayReviewData = {
      date: '2026-10-29',
      logs: [],
      goals: [],
      totalProductiveMinutes: 0,
      goalBreakdown: [],
      otherProductiveMinutes: 0,
      unclassifiedLogs: []
    }

    render(<DayReviewPanel review={mockReview} today="2026-10-30" dayCutoffHour={4} />)
    expect(screen.getByText('Yesterday')).toBeDefined()
  })

  it('renders active time span and log entries when logs are present', () => {
    const mockReview: DayReviewData = {
      date: '2026-10-25',
      logs: [
        {
          id: 'log-1',
          text: 'Coding session',
          productivity: 'productive',
          timestamp: '2026-10-25T10:00:00.000Z',
          startedAt: '2026-10-25T09:00:00.000Z',
          endedAt: '2026-10-25T10:00:00.000Z',
          durationMinutes: 60
        }
      ],
      goals: [],
      totalProductiveMinutes: 60,
      goalBreakdown: [],
      otherProductiveMinutes: 60,
      unclassifiedLogs: []
    }

    render(<DayReviewPanel review={mockReview} today="2026-10-28" />)
    expect(screen.getByText(/Active/i)).toBeDefined()
    expect(screen.getByText('Coding session')).toBeDefined()
  })

  it('renders incomplete goals from past days with a carry-to-today action', async () => {
    const handleCarry = vi.fn().mockResolvedValue(undefined)
    const mockReview: DayReviewData = {
      date: '2026-10-25',
      logs: [],
      goals: [
        {
          id: 'goal-unfinished',
          title: 'Unfinished project report',
          status: 'planned',
          date: '2026-10-25',
          createdAt: '2026-10-25T08:00:00.000Z'
        },
        {
          id: 'goal-done',
          title: 'Morning emails',
          status: 'done',
          date: '2026-10-25',
          createdAt: '2026-10-25T08:00:00.000Z'
        }
      ],
      totalProductiveMinutes: 0,
      goalBreakdown: [],
      otherProductiveMinutes: 0,
      unclassifiedLogs: []
    }

    render(<DayReviewPanel review={mockReview} today="2026-10-28" onCarryGoal={handleCarry} />)

    expect(screen.getByText(/Incomplete Tasks/i)).toBeDefined()
    expect(screen.getByText('Unfinished project report')).toBeDefined()
    expect(screen.getByText(/Completed Tasks/i)).toBeDefined()
    expect(screen.getByText('Morning emails')).toBeDefined()

    const carryButton = screen.getByRole('button', { name: /Carry to Today/i })
    await act(async () => {
      fireEvent.click(carryButton)
    })
    expect(handleCarry).toHaveBeenCalledWith(expect.objectContaining({ id: 'goal-unfinished' }))
  })

  it('handles large volume of logs without stack overflow during active time span reduction', () => {
    const manyLogs = Array.from({ length: 5000 }, (_, i) => ({
      id: `log-${i}`,
      text: 'Working',
      timestamp: new Date(Date.now() - i * 60000).toISOString(),
      durationMinutes: 1,
      productiveMinutes: 1
    }))

    const mockReview: DayReviewData = {
      date: '2026-10-25',
      logs: manyLogs,
      goals: [],
      totalProductiveMinutes: 5000,
      goalBreakdown: [],
      otherProductiveMinutes: 5000,
      unclassifiedLogs: []
    }

    expect(() => {
      render(<DayReviewPanel review={mockReview} today="2026-10-28" />)
    }).not.toThrow()
    expect(screen.getByText(/Active/i)).toBeDefined()
  })

  it('renders Carry All button when multiple incomplete goals exist and invokes onCarryAllGoals', async () => {
    const handleCarryAll = vi.fn().mockResolvedValue(undefined)
    const mockReview: DayReviewData = {
      date: '2026-10-25',
      logs: [],
      goals: [
        {
          id: 'goal-1',
          title: 'Unfinished task 1',
          status: 'planned',
          date: '2026-10-25',
          createdAt: '2026-10-25T08:00:00.000Z'
        },
        {
          id: 'goal-2',
          title: 'Unfinished task 2',
          status: 'in_progress',
          date: '2026-10-25',
          createdAt: '2026-10-25T09:00:00.000Z'
        }
      ],
      totalProductiveMinutes: 0,
      goalBreakdown: [],
      otherProductiveMinutes: 0,
      unclassifiedLogs: []
    }

    render(
      <DayReviewPanel review={mockReview} today="2026-10-28" onCarryAllGoals={handleCarryAll} />
    )

    const carryAllButton = screen.getByRole('button', { name: /Carry All \(2\)/i })
    expect(carryAllButton).toBeDefined()

    await act(async () => {
      fireEvent.click(carryAllButton)
    })
    expect(handleCarryAll).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: 'goal-1' }),
        expect.objectContaining({ id: 'goal-2' })
      ])
    )
  })

  it('appends (+1d) when active time span crosses midnight into the next day', () => {
    const localStart = new Date(2026, 9, 25, 23, 30, 0)
    const localEnd = new Date(2026, 9, 26, 1, 30, 0)

    const mockReview: DayReviewData = {
      date: '2026-10-25',
      logs: [
        {
          id: 'log-late',
          text: 'Late night coding',
          productivity: 'productive',
          timestamp: localEnd.toISOString(),
          startedAt: localStart.toISOString(),
          endedAt: localEnd.toISOString(),
          durationMinutes: 120
        }
      ],
      goals: [],
      totalProductiveMinutes: 120,
      goalBreakdown: [],
      otherProductiveMinutes: 120,
      unclassifiedLogs: []
    }

    render(<DayReviewPanel review={mockReview} today="2026-10-28" />)
    const activeSpanElement = screen.getByText(/\(\+1d\)/i)
    expect(activeSpanElement).toBeDefined()
  })

  it('determines isDiffYear relative to effectiveToday year rather than system clock year', () => {
    const mockReview: DayReviewData = {
      date: '2025-12-31',
      logs: [],
      goals: [],
      totalProductiveMinutes: 0,
      goalBreakdown: [],
      otherProductiveMinutes: 0,
      unclassifiedLogs: []
    }

    // Effective today is 2026-01-01 -> 2025-12-31 is previous year, so year "2025" must be formatted
    render(<DayReviewPanel review={mockReview} today="2026-01-01" />)
    expect(screen.getByText(/2025/)).toBeDefined()
  })

  it('renders completed goals from past days with a Reopen / Move to Today action', async () => {
    const handleReopen = vi.fn().mockResolvedValue(undefined)
    const mockReview: DayReviewData = {
      date: '2026-10-25',
      logs: [],
      goals: [
        {
          id: 'goal-completed-past',
          title: 'Finished sprint backlog task',
          status: 'done',
          date: '2026-10-25',
          completedAt: '2026-10-25T14:30:00.000Z',
          createdAt: '2026-10-25T10:00:00.000Z'
        }
      ],
      totalProductiveMinutes: 0,
      goalBreakdown: [],
      otherProductiveMinutes: 0,
      unclassifiedLogs: []
    }

    render(
      <DayReviewPanel
        review={mockReview}
        today="2026-10-28"
        onReopenGoal={handleReopen}
      />
    )

    expect(screen.getByText('Finished sprint backlog task')).toBeDefined()
    const reopenButton = screen.getByRole('button', { name: /Reopen task "Finished sprint backlog task" and move to today/i })
    expect(reopenButton).toBeDefined()

    await act(async () => {
      fireEvent.click(reopenButton)
    })

    expect(handleReopen).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'goal-completed-past' })
    )
  })
})
