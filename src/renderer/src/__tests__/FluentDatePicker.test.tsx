import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FluentDatePicker } from '../components/ui/FluentDatePicker'
import { localDateStr } from '../../../shared/types'

describe('FluentDatePicker Component', () => {
  it('renders days of current month and handles date click', () => {
    const onSelect = vi.fn()
    const onCancel = vi.fn()

    render(<FluentDatePicker value="2026-10-15" onSelect={onSelect} onCancel={onCancel} />)

    // Should display October 2026 in header
    expect(screen.getByText(/October 2026/i)).toBeDefined()

    // 15th should be selected
    const day15 = screen.getByRole('gridcell', { name: /15.*Oct|Oct.*15/i })
    expect(day15.getAttribute('aria-selected')).toBe('true')

    // Click 20th
    const day20 = screen.getByRole('gridcell', { name: /20.*Oct|Oct.*20/i })
    fireEvent.click(day20)

    expect(onSelect).toHaveBeenCalledWith('2026-10-20')
  })

  it('navigates to Month view and Decade view on header clicks without premature onSelect', () => {
    const onSelect = vi.fn()
    const onCancel = vi.fn()

    render(<FluentDatePicker value="2026-10-15" onSelect={onSelect} onCancel={onCancel} />)

    const headerButton = screen.getByTitle(/Click to change month or year/i)
    expect(headerButton).toBeDefined()

    // 1. Click header: switches from Day view to Month view (shows 2026)
    fireEvent.click(headerButton)
    expect(screen.getByText('Nov')).toBeDefined()
    expect(screen.getByText('Dec')).toBeDefined()

    // Clicking a month in Month view transitions to Day view without calling onSelect
    const novBtn = screen.getByText('Nov')
    fireEvent.click(novBtn)
    expect(onSelect).not.toHaveBeenCalled()
    expect(screen.getByText(/November 2026/i)).toBeDefined()

    // 2. Click header twice to reach Year view
    fireEvent.click(headerButton) // back to month view
    fireEvent.click(headerButton) // now year view
    expect(screen.getByText('2020 - 2029')).toBeDefined()
    expect(screen.getByText('2028')).toBeDefined()

    // Clicking year transitions to Month view without calling onSelect
    const year2028Btn = screen.getByText('2028')
    fireEvent.click(year2028Btn)
    expect(onSelect).not.toHaveBeenCalled()
    expect(screen.getByText('2028')).toBeDefined()
  })

  it('handles prev and next navigation chevrons', () => {
    const onSelect = vi.fn()
    render(<FluentDatePicker value="2026-10-15" onSelect={onSelect} />)

    expect(screen.getByText(/October 2026/i)).toBeDefined()

    // Next month
    const nextBtn = screen.getByLabelText('Next')
    fireEvent.click(nextBtn)
    expect(screen.getByText(/November 2026/i)).toBeDefined()

    // Prev month
    const prevBtn = screen.getByLabelText('Previous')
    fireEvent.click(prevBtn)
    expect(screen.getByText(/October 2026/i)).toBeDefined()
  })

  it('supports Today shortcut and footer action buttons', () => {
    const onSelect = vi.fn()
    const onCancel = vi.fn()
    render(<FluentDatePicker onSelect={onSelect} onCancel={onCancel} />)

    const todayBtn = screen.getByText('Today')
    fireEvent.click(todayBtn)

    const todayStr = localDateStr(new Date())
    expect(onSelect).toHaveBeenCalledWith(todayStr)

    const cancelBtn = screen.getByText('Cancel')
    fireEvent.click(cancelBtn)
    expect(onCancel).toHaveBeenCalledTimes(1)

    const saveBtn = screen.getByText('Save')
    fireEvent.click(saveBtn)
    expect(onSelect).toHaveBeenCalled()
  })

  it('hides footer when hideFooter is set to true', () => {
    render(<FluentDatePicker value="2026-10-15" onSelect={vi.fn()} hideFooter={true} />)

    expect(screen.queryByText('Cancel')).toBeNull()
    expect(screen.queryByText('Save')).toBeNull()
  })

  it('handles Escape and Enter keyboard navigation', () => {
    const onSelect = vi.fn()
    const onCancel = vi.fn()
    const { container } = render(
      <FluentDatePicker value="2026-10-15" onSelect={onSelect} onCancel={onCancel} />
    )

    const region = container.querySelector('[role="region"]')!

    // Escape triggers onCancel
    fireEvent.keyDown(region, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalled()

    // Enter triggers save
    fireEvent.keyDown(region, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith('2026-10-15')
  })

  it('navigates focused days with arrow keys without calling onSelect until Enter is pressed', () => {
    const onSelect = vi.fn()
    const { container } = render(<FluentDatePicker value="2026-10-15" onSelect={onSelect} />)

    const region = container.querySelector('[role="region"]')!

    // Arrow Right navigates to 2026-10-16
    fireEvent.keyDown(region, { key: 'ArrowRight' })
    expect(onSelect).not.toHaveBeenCalled()

    // Arrow Down navigates +7 days to 2026-10-23
    fireEvent.keyDown(region, { key: 'ArrowDown' })
    expect(onSelect).not.toHaveBeenCalled()

    // Enter commits the focused date
    fireEvent.keyDown(region, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith('2026-10-23')
  })

  it('respects dayCutoffHour when selecting Today button', () => {
    // Mock current time to 2:00 AM on 2026-11-01
    vi.useFakeTimers()
    const mockedNow = new Date(2026, 10, 1, 2, 0, 0) // Nov 1 2026, 02:00
    vi.setSystemTime(mockedNow)

    const onSelect = vi.fn()
    // With dayCutoffHour = 4, Nov 1 02:00 is considered part of Oct 31
    render(<FluentDatePicker dayCutoffHour={4} onSelect={onSelect} />)

    const todayBtn = screen.getByText('Today')
    fireEvent.click(todayBtn)

    expect(onSelect).toHaveBeenCalledWith('2026-10-31')

    vi.useRealTimers()
  })

  it('supports V, M, Y, D keyboard shortcuts to switch view modes', () => {
    const onSelect = vi.fn()
    const { container } = render(
      <FluentDatePicker value="2026-10-15" onSelect={onSelect} />
    )
    const region = container.querySelector('[role="region"]')!

    // Initially in Day view (shows October 2026)
    expect(screen.getByText(/October 2026/i)).toBeDefined()

    // Press V -> switches to Month view (shows 2026 and months like Nov, Dec)
    fireEvent.keyDown(region, { key: 'v' })
    expect(screen.getByText('Nov')).toBeDefined()

    // Press V again -> switches to Year view (shows 2020 - 2029)
    fireEvent.keyDown(region, { key: 'v' })
    expect(screen.getByText('2020 - 2029')).toBeDefined()

    // Press V again -> cycles back to Day view
    fireEvent.keyDown(region, { key: 'v' })
    expect(screen.getByText(/October 2026/i)).toBeDefined()

    // Press Y -> directly switches to Year view
    fireEvent.keyDown(region, { key: 'y' })
    expect(screen.getByText('2020 - 2029')).toBeDefined()

    // Press M -> directly switches to Month view
    fireEvent.keyDown(region, { key: 'm' })
    expect(screen.getByText('Nov')).toBeDefined()

    // Press D -> directly switches to Day view
    fireEvent.keyDown(region, { key: 'd' })
    expect(screen.getByText(/October 2026/i)).toBeDefined()
  })

  it('supports autoSelectOnArrow and Tab navigation handlers through view modes', () => {
    const onSelect = vi.fn()
    const onTabNext = vi.fn()
    const onTabPrev = vi.fn()

    const { container } = render(
      <FluentDatePicker
        value="2026-10-15"
        autoSelectOnArrow={true}
        onSelect={onSelect}
        onTabNext={onTabNext}
        onTabPrev={onTabPrev}
      />
    )
    const region = container.querySelector('[role="region"]')!

    // ArrowRight with autoSelectOnArrow=true immediately calls onSelect
    fireEvent.keyDown(region, { key: 'ArrowRight' })
    expect(onSelect).toHaveBeenCalledWith('2026-10-16')

    // Tab in Day view switches to Month view
    fireEvent.keyDown(region, { key: 'Tab' })
    expect(screen.getByText('Nov')).toBeDefined()

    // Tab in Month view switches to Year view
    fireEvent.keyDown(region, { key: 'Tab' })
    expect(screen.getByText('2020 - 2029')).toBeDefined()

    // Tab in Year view calls onTabNext
    fireEvent.keyDown(region, { key: 'Tab' })
    expect(onTabNext).toHaveBeenCalledTimes(1)

    // Shift+Tab in Year view goes back to Month view
    fireEvent.keyDown(region, { key: 'Tab', shiftKey: true })
    expect(screen.getByText('Nov')).toBeDefined()

    // Shift+Tab in Month view goes back to Day view
    fireEvent.keyDown(region, { key: 'Tab', shiftKey: true })
    expect(screen.getByText(/October 2026/i)).toBeDefined()

    // Shift+Tab in Day view calls onTabPrev
    fireEvent.keyDown(region, { key: 'Tab', shiftKey: true })
    expect(onTabPrev).toHaveBeenCalledTimes(1)
  })
})
