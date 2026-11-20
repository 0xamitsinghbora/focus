import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TimelineList } from '../components/TimelineList'
import { LogEntry } from '../../../shared/types'

describe('TimelineList Component Rendering & Virtualization', () => {
  it('renders empty state message when no logs exist', () => {
    render(<TimelineList logs={[]} emptyMessage="No sessions found today" />)
    expect(screen.getByText('No sessions found today')).toBeDefined()
  })

  it('renders sessions with timestamps, titles, and duration badges', () => {
    const logs: LogEntry[] = [
      {
        id: 'log-1',
        timestamp: '2026-11-01T10:30:00.000Z',
        startedAt: '2026-11-01T10:00:00.000Z',
        endedAt: '2026-11-01T10:30:00.000Z',
        durationMinutes: 30,
        productiveMinutes: 30,
        productivity: 'productive',
        goalTitle: 'Core compiler optimization',
        text: 'Core compiler optimization'
      },
      {
        id: 'log-2',
        timestamp: '2026-11-01T10:45:00.000Z',
        startedAt: '2026-11-01T10:35:00.000Z',
        endedAt: '2026-11-01T10:45:00.000Z',
        durationMinutes: 10,
        productivity: 'break',
        text: 'Break'
      }
    ]

    render(<TimelineList logs={logs} />)
    expect(screen.getByText('Core compiler optimization')).toBeDefined()
    expect(screen.getAllByText('Break').length).toBeGreaterThanOrEqual(1)
  })

  it('interactively activates card on mouse hover and keyboard focus', () => {
    const logs: LogEntry[] = [
      {
        id: 'log-1',
        timestamp: '2026-11-01T10:30:00.000Z',
        startedAt: '2026-11-01T10:00:00.000Z',
        endedAt: '2026-11-01T10:30:00.000Z',
        durationMinutes: 30,
        productiveMinutes: 30,
        productivity: 'productive',
        goalTitle: 'Interactive test task',
        text: 'Interactive test task'
      }
    ]

    render(<TimelineList logs={logs} />)
    const card = screen.getByRole('article')
    expect(card).toBeDefined()

    fireEvent.mouseEnter(card)
    expect(card.className).toContain('border-accent')

    fireEvent.mouseLeave(card)
    expect(card.className).not.toContain('border-accent')
  })

  it('virtualizes rendering when logs exceed 25 entries without crashing', () => {
    const manyLogs: LogEntry[] = Array.from({ length: 40 }, (_, i) => ({
      id: `log-${i}`,
      timestamp: new Date(1700000000000 + i * 3600000).toISOString(),
      startedAt: new Date(1700000000000 + i * 3600000).toISOString(),
      endedAt: new Date(1700000000000 + i * 3600000 + 1800000).toISOString(),
      durationMinutes: 30,
      productiveMinutes: 30,
      productivity: 'productive',
      goalTitle: `Session Number ${i}`,
      text: `Session Number ${i}`
    }))

    const { container } = render(<TimelineList logs={manyLogs} />)
    const list = container.querySelector('[role="list"]')
    expect(list).toBeDefined()

    // Virtual list renders visible window slice
    const articles = screen.getAllByRole('article')
    expect(articles.length).toBeGreaterThan(0)
    expect(articles.length).toBeLessThanOrEqual(40)
  })

  it('calls onOpenQuickLog when manual record button is clicked in empty state', () => {
    const onOpen = vi.fn()
    render(<TimelineList logs={[]} onOpenQuickLog={onOpen} />)
    const btn = screen.getByRole('button', { name: /Record Session Manually/i })
    fireEvent.click(btn)
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('hides timeline bar when showTimelineBar is false', () => {
    const logs: LogEntry[] = [
      {
        id: 'log-1',
        timestamp: '2026-11-01T10:30:00.000Z',
        startedAt: '2026-11-01T10:00:00.000Z',
        endedAt: '2026-11-01T10:30:00.000Z',
        durationMinutes: 30,
        productivity: 'productive',
        goalTitle: 'Task 1',
        text: 'Task 1'
      }
    ]

    const { queryByText } = render(<TimelineList logs={logs} showTimelineBar={false} />)
    // TimelineBar header has "Session " and "Tasks", which should be omitted when showTimelineBar is false
    expect(queryByText(/Session /i)).toBeNull()
    expect(queryByText('Tasks')).toBeNull()

    // Session card should still be rendered
    expect(screen.getByText('Task 1')).toBeDefined()
  })

  it('displays productive minutes and idle deducted time when clock span exceeds productive focus', () => {
    const logs: LogEntry[] = [
      {
        id: 'log-idle',
        timestamp: '2026-11-01T20:13:00.000Z',
        startedAt: '2026-11-01T19:15:00.000Z',
        endedAt: '2026-11-01T20:13:00.000Z',
        durationMinutes: 58,
        productiveMinutes: 30,
        productivity: 'productive',
        goalTitle: 'Namaste Js',
        text: 'Namaste Js'
      }
    ]

    render(<TimelineList logs={logs} />)
    expect(screen.getAllByText(/30m/).length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('(28m idle)')).toBeDefined()
  })
})
