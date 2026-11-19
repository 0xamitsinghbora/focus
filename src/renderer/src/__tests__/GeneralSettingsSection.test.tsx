import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GeneralSettingsSection } from '../components/settings/GeneralSettingsSection'

describe('GeneralSettingsSection Component - Daily Focus Target', () => {
  it('displays daily target in hours consistently for presets and input', () => {
    const setDailyFocusTarget = vi.fn()

    render(
      <GeneralSettingsSection
        theme="system"
        setTheme={vi.fn()}
        interval={45}
        setInterval={vi.fn()}
        dailyFocusTarget={240} // 240 mins = 4 hours
        setDailyFocusTarget={setDailyFocusTarget}
        openAtLogin={true}
        setOpenAtLogin={vi.fn()}
        showWidget={true}
        setShowWidget={vi.fn()}
      />
    )

    // Preset buttons should show hours: 2h, 4h, 6h, 8h
    expect(screen.getByRole('button', { name: '2h' })).toBeDefined()
    expect(screen.getByRole('button', { name: '4h' })).toBeDefined()
    expect(screen.getByRole('button', { name: '6h' })).toBeDefined()
    expect(screen.getByRole('button', { name: '8h' })).toBeDefined()

    // Input should display hours (4) and unit label "h", not 240 min
    const targetInput = screen.getByLabelText(/Daily focus target in hours/i) as HTMLInputElement
    expect(targetInput.value).toBe('4')
    expect(screen.getByText('h')).toBeDefined()
    expect(screen.queryByText('240')).toBeNull()
  })

  it('calls setDailyFocusTarget with minutes when preset button is clicked', () => {
    const setDailyFocusTarget = vi.fn()

    render(
      <GeneralSettingsSection
        theme="system"
        setTheme={vi.fn()}
        interval={45}
        setInterval={vi.fn()}
        dailyFocusTarget={120} // 2 hours
        setDailyFocusTarget={setDailyFocusTarget}
        openAtLogin={true}
        setOpenAtLogin={vi.fn()}
        showWidget={true}
        setShowWidget={vi.fn()}
      />
    )

    const preset6h = screen.getByRole('button', { name: '6h' })
    fireEvent.click(preset6h)
    expect(setDailyFocusTarget).toHaveBeenCalledWith(360) // 6 * 60 = 360
  })

  it('updates target in minutes when user types hours into input', () => {
    const setDailyFocusTarget = vi.fn()

    render(
      <GeneralSettingsSection
        theme="system"
        setTheme={vi.fn()}
        interval={45}
        setInterval={vi.fn()}
        dailyFocusTarget={0}
        setDailyFocusTarget={setDailyFocusTarget}
        openAtLogin={true}
        setOpenAtLogin={vi.fn()}
        showWidget={true}
        setShowWidget={vi.fn()}
      />
    )

    const targetInput = screen.getByLabelText(/Daily focus target in hours/i) as HTMLInputElement
    fireEvent.change(targetInput, { target: { value: '5' } })
    expect(setDailyFocusTarget).toHaveBeenCalledWith(300) // 5 * 60 = 300
  })

  it('handles decimal hours smoothly', () => {
    const setDailyFocusTarget = vi.fn()

    render(
      <GeneralSettingsSection
        theme="system"
        setTheme={vi.fn()}
        interval={45}
        setInterval={vi.fn()}
        dailyFocusTarget={90} // 1.5 hours
        setDailyFocusTarget={setDailyFocusTarget}
        openAtLogin={true}
        setOpenAtLogin={vi.fn()}
        showWidget={true}
        setShowWidget={vi.fn()}
      />
    )

    const targetInput = screen.getByLabelText(/Daily focus target in hours/i) as HTMLInputElement
    expect(targetInput.value).toBe('1.5')

    fireEvent.change(targetInput, { target: { value: '2.5' } })
    expect(setDailyFocusTarget).toHaveBeenCalledWith(150) // 2.5 * 60 = 150
  })

  it('does not render the escalating break nudges toggle in settings', () => {
    render(
      <GeneralSettingsSection
        theme="system"
        setTheme={vi.fn()}
        interval={45}
        setInterval={vi.fn()}
        dailyFocusTarget={240}
        setDailyFocusTarget={vi.fn()}
        openAtLogin={true}
        setOpenAtLogin={vi.fn()}
        showWidget={true}
        setShowWidget={vi.fn()}
      />
    )

    expect(screen.queryByText(/Escalating Break Nudges/i)).toBeNull()
    expect(screen.queryByLabelText(/Escalating Break Nudges/i)).toBeNull()
  })
})
