import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { DailyGoalsPanel } from '../components/DailyGoalsPanel'
import { FocusSessionProvider } from '../context/FocusSessionProvider'
import { DailyGoal } from '../../../shared/types'

let mockAudioPlaying = false
vi.mock('../lib/audioEngine', () => ({
  playFocusChime: vi.fn(),
  useAudioEngine: () => ({
    playing: mockAudioPlaying,
    noiseType: 'rain',
    volume: 0.65,
    setVolume: vi.fn(),
    toggle: vi.fn()
  })
}))

vi.mock('../lib/useToast', () => ({
  useToast: () => ({
    success: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  })
}))

describe('DailyGoalsPanel Component', () => {
  const mockGoals: DailyGoal[] = [
    {
      id: 'g-1',
      title: 'Design user profile screen',
      targetMinutes: 30,
      groupTag: 'Design',
      groupColor: 'blue',
      date: '2026-10-28',
      status: 'in_progress',
      createdAt: new Date().toISOString()
    }
  ]

  const renderComponent = (props: Partial<React.ComponentProps<typeof DailyGoalsPanel>> = {}) => {
    return render(
      <FocusSessionProvider>
        <DailyGoalsPanel
          goals={mockGoals}
          plannedGoals={[]}
          completedGoals={[]}
          onUpdateGoal={vi.fn()}
          {...props}
        />
      </FocusSessionProvider>
    )
  }

  it('renders task list and logged time', () => {
    renderComponent({
      goalLoggedMinutesMap: { 'g-1': 15 }
    })

    expect(screen.getByText("Today's Tasks")).toBeDefined()
    expect(screen.getByText('Design user profile screen')).toBeDefined()
    expect(screen.getByText('Design')).toBeDefined()
    expect(screen.getByText('15m logged')).toBeDefined()
  })

  it('does NOT render the old detached manual session creation form', () => {
    renderComponent()

    expect(screen.queryByPlaceholderText('What are you working on?')).toBeNull()
    expect(screen.queryByText(/Start Focus \(\d+m\)/i)).toBeNull()
  })

  it('does NOT render Focus button on tasks', () => {
    renderComponent()

    expect(screen.queryByRole('button', { name: /^Focus$/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /\+ Log/i })).toBeNull()
  })

  it('does NOT render Start My Day or preset tasks button when goals are empty', () => {
    renderComponent({ goals: [] })

    expect(screen.queryByText(/Start My Day/i)).toBeNull()
    expect(screen.queryByText(/Preset Tasks/i)).toBeNull()
  })

  it('allows completing a task by clicking its checkbox', () => {
    const handleUpdate = vi.fn()
    renderComponent({
      onUpdateGoal: handleUpdate
    })

    const checkbox = screen.getByTitle('Mark complete')
    fireEvent.click(checkbox)

    expect(handleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'g-1',
        status: 'done'
      })
    )
  })

  it('allows switching between Today, Planned, and Done tabs', () => {
    const plannedTask: DailyGoal = {
      id: 'p-1',
      title: 'Write automated integration tests',
      targetMinutes: 45,
      date: '2026-10-28',
      status: 'planned',
      createdAt: new Date().toISOString()
    }

    renderComponent({
      plannedGoals: [plannedTask]
    })

    const plannedTabBtn = screen.getByRole('button', { name: /^Planned$/i })
    fireEvent.click(plannedTabBtn)

    expect(screen.getByText('Write automated integration tests')).toBeDefined()
    expect(screen.getByRole('button', { name: /To Today/i })).toBeDefined()
  })

  it('renders task card with article role, tabIndex, and aria-label', () => {
    renderComponent()
    const taskCard = screen.getByRole('article', { name: /Task: Design user profile screen/i })
    expect(taskCard).toBeDefined()
    expect(taskCard.getAttribute('tabindex')).toBe('0')
  })

  it('does not render volume slider when audio is playing in active session', async () => {
    mockAudioPlaying = true
    renderComponent()

    const volumeSlider = screen.queryByRole('slider', { name: /Background noise volume/i })
    expect(volumeSlider).toBeNull()
    mockAudioPlaying = false
  })

  it('does NOT render the quick add task form', () => {
    renderComponent()

    expect(screen.queryByPlaceholderText('Add task to plan and focus...')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Later' })).toBeNull()
  })
})
