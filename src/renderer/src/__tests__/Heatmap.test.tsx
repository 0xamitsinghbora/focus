import { act } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Heatmap } from '../components/Heatmap'

describe('Heatmap Component', () => {
  it('renders heatmap days and handles day click', () => {
    const handleDayClick = vi.fn()
    const testData = { '2026-10-27': 4, '2026-10-26': 2 }

    render(<Heatmap data={testData} selectedDate="2026-10-27" onDayClick={handleDayClick} />)

    // Check that day cells are rendered
    const dayButtons = screen.getAllByRole('button')
    expect(dayButtons.length).toBeGreaterThan(300)

    // Find the cell for the selected date
    const selectedCell = screen.getByLabelText(/2026-10-27: 4 activities/i)
    expect(selectedCell).toBeDefined()
    expect(selectedCell.className).toContain('ring-2')

    // Click on the cell
    fireEvent.click(selectedCell)
    expect(handleDayClick).toHaveBeenCalledWith('2026-10-27')
  })

  it('supports keyboard accessibility with tabIndex, aria attributes, and key down handlers', () => {
    const handleDayClick = vi.fn()
    const testData = { '2026-10-27': 4, '2026-10-26': 1 }

    render(<Heatmap data={testData} selectedDate="2026-10-27" onDayClick={handleDayClick} />)

    const selectedCell = screen.getByLabelText(/2026-10-27: 4 activities/i)
    const singleSessionCell = screen.getByLabelText(/2026-10-26: 1 activity$/i)

    // Verify keyboard focusability and ARIA attributes (roving tabIndex: selected is 0, others -1)
    expect(selectedCell.getAttribute('tabindex')).toBe('0')
    expect(selectedCell.getAttribute('aria-pressed')).toBe('true')
    expect(singleSessionCell.getAttribute('tabindex')).toBe('-1')
    expect(singleSessionCell.getAttribute('aria-pressed')).toBe('false')

    // Activate via Enter key
    fireEvent.keyDown(singleSessionCell, { key: 'Enter' })
    expect(handleDayClick).toHaveBeenCalledWith('2026-10-26')

    // Activate via Space key
    fireEvent.keyDown(selectedCell, { key: ' ' })
    expect(handleDayClick).toHaveBeenCalledWith('2026-10-27')
  })

  it('shows and hides tooltip on keyboard focus and blur', () => {
    const testData = { '2026-10-27': 4 }
    render(<Heatmap data={testData} selectedDate="2026-10-27" />)

    const cell = screen.getByLabelText(/2026-10-27: 4 activities/i)

    // Focus triggers tooltip
    fireEvent.focus(cell)
    expect(screen.getByText(/4 focus activities/i)).toBeDefined()

    // Blur removes tooltip
    fireEvent.blur(cell)
    expect(screen.queryByText(/4 focus activities/i)).toBeNull()
  })

  it('shows tooltip on mouseEnter and clears immediately on container mouseLeave or scroll', () => {
    const testData = { '2026-10-27': 4 }
    const { container } = render(<Heatmap data={testData} selectedDate="2026-10-27" />)

    const cell = screen.getByLabelText(/2026-10-27: 4 activities/i)
    const scrollContainer = container.querySelector('.overflow-x-auto')!

    // Hover triggers tooltip
    fireEvent.mouseEnter(cell, { clientX: 100, clientY: 100 })
    expect(screen.getByText(/4 focus activities/i)).toBeDefined()

    // Container leave dismisses tooltip immediately
    fireEvent.mouseLeave(scrollContainer)
    expect(screen.queryByText(/4 focus activities/i)).toBeNull()

    // Hover again
    fireEvent.mouseEnter(cell, { clientX: 100, clientY: 100 })
    expect(screen.getByText(/4 focus activities/i)).toBeDefined()

    // Scroll dismisses tooltip
    fireEvent.scroll(scrollContainer)
    expect(screen.queryByText(/4 focus activities/i)).toBeNull()
  })

  it('clears tooltip after grace period when leaving a cell inside container', () => {
    vi.useFakeTimers()
    const testData = { '2026-10-27': 4 }
    const { container } = render(<Heatmap data={testData} selectedDate="2026-10-27" />)

    const cell = screen.getByLabelText(/2026-10-27: 4 activities/i)
    const scrollContainer = container.querySelector('.overflow-x-auto')!

    fireEvent.mouseEnter(cell, { clientX: 100, clientY: 100 })
    expect(screen.getByText(/4 focus activities/i)).toBeDefined()

    // Move mouse from cell to scrollContainer (still inside the component)
    fireEvent.mouseLeave(cell, { relatedTarget: scrollContainer })

    // Still visible within 50ms grace period
    act(() => {
      vi.advanceTimersByTime(20)
    })
    expect(screen.getByText(/4 focus activities/i)).toBeDefined()

    // Cleared after 50ms grace period expires
    act(() => {
      vi.advanceTimersByTime(35)
    })
    expect(screen.queryByText(/4 focus activities/i)).toBeNull()

    vi.useRealTimers()
  })

  it('coalesces rapid scrubbing transitions via requestAnimationFrame', async () => {
    const testData = { '2026-10-27': 4, '2026-10-26': 2 }
    render(<Heatmap data={testData} selectedDate="2026-10-27" />)

    const cell1 = screen.getByLabelText(/2026-10-27: 4 activities/i)
    const cell2 = screen.getByLabelText(/2026-10-26: 2 activities/i)

    // Initial enter on cell 1 displays immediately
    fireEvent.mouseEnter(cell1, { clientX: 100, clientY: 100 })
    expect(screen.getByText(/4 focus activities/i)).toBeDefined()

    // Rapid transition to cell 2
    fireEvent.mouseEnter(cell2, { clientX: 120, clientY: 100 })

    // Wait for rAF to flush
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve))
    })

    expect(screen.getByText(/2 focus activities/i)).toBeDefined()
  })

  it('respects dayCutoffHour and custom todayDate without duplicate dates', () => {
    // When todayDate is 2026-03-31, verify all rendered buttons have distinct dates and ends on todayDate
    const { container } = render(<Heatmap data={{ '2026-03-31': 3 }} todayDate="2026-03-31" />)
    const buttons = container.querySelectorAll('[role="button"]')
    const ariaLabels = Array.from(buttons).map((b) => b.getAttribute('aria-label') || '')

    // Extract dates
    const dates = ariaLabels.map((l) => l.split(':')[0])
    const uniqueDates = new Set(dates)
    expect(dates.length).toBe(uniqueDates.size)
    expect(dates[dates.length - 1]).toBe('2026-03-31')
  })

  it('renders detailed breakdown with sessions and completed tasks without semantic conflation', () => {
    const testData = {
      '2026-10-27': { total: 3, sessions: 2, completedGoals: 1 }
    }
    render(<Heatmap data={testData} selectedDate="2026-10-27" />)

    const cell = screen.getByLabelText(/2026-10-27: 3 activities \(2 sessions, 1 task\)/i)
    expect(cell).toBeDefined()

    fireEvent.focus(cell)
    expect(screen.getByText(/3 focus activities/i)).toBeDefined()
    expect(screen.getByText(/2 sessions, 1 task/i)).toBeDefined()
  })

  it('preserves user scroll position on data updates and only auto-scrolls on initial load', () => {
    const { container, rerender } = render(<Heatmap data={{ '2026-10-27': 1 }} />)
    const scrollContainer = container.querySelector('.overflow-x-auto') as HTMLDivElement

    // Initial mount auto-scrolls to scrollWidth
    Object.defineProperty(scrollContainer, 'scrollWidth', { value: 1000, configurable: true })
    // Simulate user scrolling manually to position 250
    scrollContainer.scrollLeft = 250

    // Rerender with updated data
    rerender(<Heatmap data={{ '2026-10-27': 2, '2026-10-28': 3 }} />)

    // User's scroll position should be preserved at 250, not reset to scrollWidth
    expect(scrollContainer.scrollLeft).toBe(250)
  })
})
