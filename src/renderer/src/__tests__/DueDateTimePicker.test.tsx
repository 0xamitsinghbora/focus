import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DueDateTimePicker } from '../components/ui/DueDateTimePicker'

describe('DueDateTimePicker Component', () => {
  it('renders compact header, hour, minute, AM/PM, quick presets, calendar and done button', () => {
    const onDateChange = vi.fn()
    const onTimeChange = vi.fn()
    const onClose = vi.fn()

    render(
      <DueDateTimePicker
        dueDate="2026-10-15"
        dueTime="14:30"
        onDateChange={onDateChange}
        onTimeChange={onTimeChange}
        onClose={onClose}
      />
    )

    // Compact header
    expect(screen.getByText('Due Date & Time')).toBeDefined()
    expect(screen.queryByText(/Deadline when task must be finished/i)).toBeNull()
    expect(screen.queryByTitle('Close (Esc)')).toBeNull()

    // 1. Hour spinbutton
    const hourControl = screen.getByRole('spinbutton', { name: 'Hour' })
    expect(hourControl).toBeDefined()
    expect(hourControl.textContent).toBe('02')

    // 2. Minute spinbutton
    const minuteControl = screen.getByRole('spinbutton', { name: 'Minute' })
    expect(minuteControl).toBeDefined()
    expect(minuteControl.textContent).toBe('30')

    // 3. AM / PM button
    const periodControl = screen.getByRole('button', { name: 'AM or PM' })
    expect(periodControl).toBeDefined()
    expect(periodControl.textContent).toBe('PM')

    // Presets and calendar
    expect(screen.getAllByText('Today').length).toBeGreaterThan(0)
    expect(screen.getByText('Tomorrow')).toBeDefined()
    expect(screen.getByText('Next week')).toBeDefined()
    expect(screen.getByText(/October 2026/i)).toBeDefined()
    expect(screen.getByRole('button', { name: 'Done' })).toBeDefined()
  })

  it('handles quick date preset clicks', () => {
    const onDateChange = vi.fn()
    render(
      <DueDateTimePicker
        dueDate={null}
        dueTime={null}
        onDateChange={onDateChange}
        onTimeChange={vi.fn()}
      />
    )

    const tomorrowBtn = screen.getByText('Tomorrow').closest('button')!
    fireEvent.click(tomorrowBtn)

    expect(onDateChange).toHaveBeenCalled()
    const calledDate = onDateChange.mock.calls[0][0]
    expect(calledDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('selects dates in calendar grid using integrated FluentDatePicker', () => {
    const onDateChange = vi.fn()
    render(
      <DueDateTimePicker
        dueDate="2026-10-15"
        dueTime={null}
        onDateChange={onDateChange}
        onTimeChange={vi.fn()}
      />
    )

    const day18 = screen.getByRole('gridcell', { name: /18.*Oct|Oct.*18/i })
    fireEvent.click(day18)

    expect(onDateChange).toHaveBeenCalledWith('2026-10-18')
  })

  it('handles hour scrolling and stepping with ArrowUp, ArrowDown, mouse wheel, and digits', () => {
    const onDateChange = vi.fn()
    const onTimeChange = vi.fn()

    render(
      <DueDateTimePicker
        dueDate="2026-10-15"
        dueTime="09:00"
        onDateChange={onDateChange}
        onTimeChange={onTimeChange}
      />
    )

    const hourControl = screen.getByRole('spinbutton', { name: 'Hour' })

    // ArrowUp: 09 -> 10
    fireEvent.keyDown(hourControl, { key: 'ArrowUp' })
    expect(onTimeChange).toHaveBeenCalledWith('10:00')

    // ArrowDown: 09 -> 08
    onTimeChange.mockClear()
    fireEvent.keyDown(hourControl, { key: 'ArrowDown' })
    expect(onTimeChange).toHaveBeenCalledWith('08:00')

    // Wheel up: 09 -> 10
    onTimeChange.mockClear()
    fireEvent.wheel(hourControl, { deltaY: -100 })
    expect(onTimeChange).toHaveBeenCalledWith('10:00')

    // Typing digit '4' -> 04:00
    onTimeChange.mockClear()
    fireEvent.keyDown(hourControl, { key: '4' })
    expect(onTimeChange).toHaveBeenCalledWith('04:00')
  })

  it('handles minute scrolling and stepping with ArrowUp, ArrowDown, mouse wheel, and digits', () => {
    const onDateChange = vi.fn()
    const onTimeChange = vi.fn()

    render(
      <DueDateTimePicker
        dueDate="2026-10-15"
        dueTime="09:00"
        onDateChange={onDateChange}
        onTimeChange={onTimeChange}
      />
    )

    const minuteControl = screen.getByRole('spinbutton', { name: 'Minute' })

    // ArrowUp: 00 -> 15
    fireEvent.keyDown(minuteControl, { key: 'ArrowUp' })
    expect(onTimeChange).toHaveBeenCalledWith('09:15')

    // ArrowDown: 00 -> 45
    onTimeChange.mockClear()
    fireEvent.keyDown(minuteControl, { key: 'ArrowDown' })
    expect(onTimeChange).toHaveBeenCalledWith('09:45')

    // Wheel up: 00 -> 15
    onTimeChange.mockClear()
    fireEvent.wheel(minuteControl, { deltaY: -100 })
    expect(onTimeChange).toHaveBeenCalledWith('09:15')

    // Typing digit '3' then '0' -> 09:30
    onTimeChange.mockClear()
    fireEvent.keyDown(minuteControl, { key: '3' })
    fireEvent.keyDown(minuteControl, { key: '0' })
    expect(onTimeChange).toHaveBeenCalledWith('09:30')
  })

  it('handles AM/PM toggling via click and keyboard shortcuts (A, P, Space, Enter, Arrows)', () => {
    const onDateChange = vi.fn()
    const onTimeChange = vi.fn()

    render(
      <DueDateTimePicker
        dueDate="2026-10-15"
        dueTime="09:00"
        onDateChange={onDateChange}
        onTimeChange={onTimeChange}
      />
    )

    const periodBtn = screen.getByRole('button', { name: 'AM or PM' })

    // Click toggles AM to PM (21:00)
    fireEvent.click(periodBtn)
    expect(onTimeChange).toHaveBeenCalledWith('21:00')

    // Press 'p' sets PM
    onTimeChange.mockClear()
    fireEvent.keyDown(periodBtn, { key: 'p' })
    expect(onTimeChange).toHaveBeenCalledWith('21:00')

    // Press 'a' sets AM
    onTimeChange.mockClear()
    fireEvent.keyDown(periodBtn, { key: 'a' })
    expect(onTimeChange).toHaveBeenCalledWith('09:00')

    // Press Space toggles to PM
    onTimeChange.mockClear()
    fireEvent.keyDown(periodBtn, { key: ' ' })
    expect(onTimeChange).toHaveBeenCalledWith('21:00')

    // Press 'a' sets AM
    onTimeChange.mockClear()
    fireEvent.keyDown(periodBtn, { key: 'a' })
    expect(onTimeChange).toHaveBeenCalledWith('09:00')
  })

  it('ensures Arrow keys on Hour and Minute controls ONLY change time and NEVER change the date', () => {
    const onDateChange = vi.fn()
    const onTimeChange = vi.fn()

    render(
      <DueDateTimePicker
        dueDate="2026-10-15"
        dueTime="09:00"
        onDateChange={onDateChange}
        onTimeChange={onTimeChange}
      />
    )

    const hourControl = screen.getByRole('spinbutton', { name: 'Hour' })
    const minuteControl = screen.getByRole('spinbutton', { name: 'Minute' })

    // ArrowUp on hour control changes time only
    fireEvent.keyDown(hourControl, { key: 'ArrowUp' })
    expect(onTimeChange).toHaveBeenCalledWith('10:00')
    expect(onDateChange).not.toHaveBeenCalled()

    // ArrowUp on minute control changes time only
    onTimeChange.mockClear()
    fireEvent.keyDown(minuteControl, { key: 'ArrowUp' })
    expect(onTimeChange).toHaveBeenCalledWith('09:15')
    expect(onDateChange).not.toHaveBeenCalled()
  })

  it('supports keyboard tab transitions: Hour -> Minute -> AM/PM -> Calendar -> Done -> Hour', () => {
    const onClose = vi.fn()
    const { container } = render(
      <DueDateTimePicker
        dueDate="2026-10-15"
        dueTime="09:30"
        onDateChange={vi.fn()}
        onTimeChange={vi.fn()}
        onClose={onClose}
      />
    )

    const hourControl = screen.getByRole('spinbutton', { name: 'Hour' })
    const minuteControl = screen.getByRole('spinbutton', { name: 'Minute' })
    const periodControl = screen.getByRole('button', { name: 'AM or PM' })
    const calendarRegion = container.querySelector('[role="region"]')!
    const doneBtn = screen.getByRole('button', { name: 'Done' })

    // 1. Tab from Hour moves focus to Minute
    fireEvent.keyDown(hourControl, { key: 'Tab' })
    expect(document.activeElement).toBe(minuteControl)

    // 2. Tab from Minute moves focus to AM/PM
    fireEvent.keyDown(minuteControl, { key: 'Tab' })
    expect(document.activeElement).toBe(periodControl)

    // 3. Tab from AM/PM moves focus to Calendar (Date only!)
    fireEvent.keyDown(periodControl, { key: 'Tab' })
    expect(document.activeElement).toBe(calendarRegion)

    // 4. Tab in Calendar (Day view) switches to Month view
    fireEvent.keyDown(calendarRegion, { key: 'Tab' })
    expect(screen.getByText('Nov')).toBeDefined()

    // 5. Tab in Month view switches to Year view
    fireEvent.keyDown(calendarRegion, { key: 'Tab' })
    expect(screen.getByText('2020 - 2029')).toBeDefined()

    // 6. Tab in Year view moves focus to Done button
    fireEvent.keyDown(calendarRegion, { key: 'Tab' })
    expect(document.activeElement).toBe(doneBtn)

    // 7. Enter on Done button calls onClose
    fireEvent.keyDown(doneBtn, { key: 'Enter' })
    expect(onClose).toHaveBeenCalled()

    // 8. Shift+Tab in Year view switches back to Month view
    fireEvent.keyDown(doneBtn, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(calendarRegion)
    fireEvent.keyDown(calendarRegion, { key: 'Tab', shiftKey: true })
    expect(screen.getByText('Nov')).toBeDefined()

    // 9. Shift+Tab in Month view switches back to Day view
    fireEvent.keyDown(calendarRegion, { key: 'Tab', shiftKey: true })
    expect(screen.getByText(/October 2026/i)).toBeDefined()

    // 10. Shift+Tab in Day view moves focus back to AM/PM
    fireEvent.keyDown(calendarRegion, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(periodControl)

    // 11. Shift+Tab from AM/PM moves focus back to Minute
    fireEvent.keyDown(periodControl, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(minuteControl)

    // 12. Shift+Tab from Minute moves focus back to Hour
    fireEvent.keyDown(minuteControl, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(hourControl)

    // 13. Shift+Tab from Hour closes popover and returns to note
    fireEvent.keyDown(hourControl, { key: 'Tab', shiftKey: true })
    expect(onClose).toHaveBeenCalledWith('note')
  })

  it('supports arrow keys in Calendar to navigate dates (ArrowRight, ArrowLeft, ArrowDown, ArrowUp)', () => {
    const onDateChange = vi.fn()
    const { container } = render(
      <DueDateTimePicker
        dueDate="2026-10-15"
        dueTime={null}
        onDateChange={onDateChange}
        onTimeChange={vi.fn()}
      />
    )

    const calendarRegion = container.querySelector('[role="region"]')!
    expect(calendarRegion).toBeDefined()

    // ArrowRight: 2026-10-15 + 1 day -> 2026-10-16
    fireEvent.keyDown(calendarRegion, { key: 'ArrowRight' })
    expect(onDateChange).toHaveBeenCalledWith('2026-10-16')

    // ArrowLeft: 2026-10-16 - 1 day -> 2026-10-15
    onDateChange.mockClear()
    fireEvent.keyDown(calendarRegion, { key: 'ArrowLeft' })
    expect(onDateChange).toHaveBeenCalledWith('2026-10-15')

    // ArrowDown: 2026-10-15 + 7 days -> 2026-10-22
    onDateChange.mockClear()
    fireEvent.keyDown(calendarRegion, { key: 'ArrowDown' })
    expect(onDateChange).toHaveBeenCalledWith('2026-10-22')

    // ArrowUp: 2026-10-22 - 7 days -> 2026-10-15
    onDateChange.mockClear()
    fireEvent.keyDown(calendarRegion, { key: 'ArrowUp' })
    expect(onDateChange).toHaveBeenCalledWith('2026-10-15')
  })

  it('auto-defaults date to today when setting hour if date is not set', () => {
    const onDateChange = vi.fn()
    const onTimeChange = vi.fn()

    render(
      <DueDateTimePicker
        dueDate={null}
        dueTime={null}
        onDateChange={onDateChange}
        onTimeChange={onTimeChange}
      />
    )

    const hourControl = screen.getByRole('spinbutton', { name: 'Hour' })
    fireEvent.keyDown(hourControl, { key: 'ArrowUp' })

    // Defaults to 10:00 and today's date
    expect(onTimeChange).toHaveBeenCalledWith('10:00')
    expect(onDateChange).toHaveBeenCalled()
  })

  it('handles clear all, clear time, and close callbacks', () => {
    const onClearAll = vi.fn()
    const onTimeChange = vi.fn()
    const onClose = vi.fn()

    render(
      <DueDateTimePicker
        dueDate="2026-10-15"
        dueTime="10:00"
        onDateChange={vi.fn()}
        onTimeChange={onTimeChange}
        onClearAll={onClearAll}
        onClose={onClose}
      />
    )

    const clearAllBtn = screen.getByTitle('Clear date and time')
    fireEvent.click(clearAllBtn)
    expect(onClearAll).toHaveBeenCalledTimes(1)

    const clearTimeBtn = screen.getByTitle('Clear time')
    fireEvent.click(clearTimeBtn)
    expect(onTimeChange).toHaveBeenCalledWith(null)

    const doneBtn = screen.getByRole('button', { name: 'Done' })
    fireEvent.click(doneBtn)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('handles keyboard shortcuts (T, M, W, C, Escape)', () => {
    const onDateChange = vi.fn()
    const onClearAll = vi.fn()
    const onClose = vi.fn()

    const { container } = render(
      <DueDateTimePicker
        dueDate="2026-10-15"
        dueTime="10:00"
        onDateChange={onDateChange}
        onTimeChange={vi.fn()}
        onClearAll={onClearAll}
        onClose={onClose}
      />
    )

    const root = container.firstElementChild as HTMLElement

    // T shortcut (Today)
    fireEvent.keyDown(root, { key: 't' })
    expect(onDateChange).toHaveBeenCalled()

    // C shortcut (Clear)
    fireEvent.keyDown(root, { key: 'c' })
    expect(onClearAll).toHaveBeenCalled()

    // Escape shortcut (Close)
    fireEvent.keyDown(root, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('aligns preset weekday labels with logical cutoff date across early morning boundaries', () => {
    // Mock system time at 2:00 AM on Sunday Oct 25, 2026
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 25, 2, 0, 0)) // 2026-10-25 (Sun) 02:00

    render(
      <DueDateTimePicker
        dueDate={null}
        dueTime={null}
        dayCutoffHour={4}
        onDateChange={vi.fn()}
        onTimeChange={vi.fn()}
      />
    )

    const todayBtn = screen.getByText('Today').closest('button')!
    expect(todayBtn.textContent).toContain('Sat')

    const tomorrowBtn = screen.getByText('Tomorrow').closest('button')!
    expect(tomorrowBtn.textContent).toContain('Sun')

    const nextWeekBtn = screen.getByText('Next week').closest('button')!
    expect(nextWeekBtn.textContent).toContain('Sat')

    vi.useRealTimers()
  })
})
