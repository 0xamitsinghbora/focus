import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MorningRitualModal } from '../components/MorningRitualModal'
import { DailyGoal } from '../../../shared/types'

describe('MorningRitualModal Component', () => {
  const mockOnClose = vi.fn()
  const mockOnUpdateTargetMinutes = vi.fn().mockResolvedValue(undefined)
  const mockOnCarryGoal = vi.fn().mockResolvedValue(undefined)
  const mockOnPromoteGoal = vi.fn().mockResolvedValue(undefined)
  const mockOnAddGoal = vi.fn().mockResolvedValue(undefined)
  const mockOnRitualCompleted = vi.fn()

  const sampleTodayGoals: DailyGoal[] = [
    {
      id: 'g-1',
      title: 'Finish Database Migration',
      date: '2026-11-06',
      status: 'planned',
      createdAt: '2026-11-06T08:00:00Z'
    },
    {
      id: 'g-2',
      title: 'Active Core Engine Focus',
      date: '2026-11-06',
      status: 'in_progress',
      createdAt: '2026-11-06T09:00:00Z'
    }
  ]

  const sampleYesterdayGoals: DailyGoal[] = [
    {
      id: 'g-past-1',
      title: 'Incomplete Yesterday Task',
      date: '2026-11-05',
      status: 'planned',
      createdAt: '2026-11-05T14:00:00Z'
    }
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    window.api = {
      ...window.api,
      goals: {
        ...window.api?.goals,
        get: vi.fn().mockResolvedValue(sampleYesterdayGoals)
      },
      settings: {
        ...window.api?.settings,
        patch: vi.fn().mockResolvedValue({})
      }
    } as any
  })

  it('renders morning planning ritual modal with preset targets and anchor choices', async () => {
    render(
      <MorningRitualModal
        isOpen={true}
        onClose={mockOnClose}
        todayStr="2026-11-06"
        todayGoals={sampleTodayGoals}
        dailyFocusTargetMinutes={180}
        onUpdateTargetMinutes={mockOnUpdateTargetMinutes}
        onCarryGoal={mockOnCarryGoal}
        onPromoteGoal={mockOnPromoteGoal}
        onAddGoal={mockOnAddGoal}
        onRitualCompleted={mockOnRitualCompleted}
      />
    )

    expect(screen.getByRole('heading', { name: /Morning Planning Ritual/i })).toBeDefined()
    expect(screen.getByText(/Set intention, carry forward, commit/i)).toBeDefined()
    expect(screen.getByRole('button', { name: /4 Hours/i })).toBeDefined()

    await waitFor(() => {
      expect(screen.getByText('Incomplete Yesterday Task')).toBeDefined()
    })
  })

  it('commits today ritual, carries forward tasks, and marks ritual completed in settings', async () => {
    render(
      <MorningRitualModal
        isOpen={true}
        onClose={mockOnClose}
        todayStr="2026-11-06"
        todayGoals={sampleTodayGoals}
        dailyFocusTargetMinutes={180}
        onUpdateTargetMinutes={mockOnUpdateTargetMinutes}
        onCarryGoal={mockOnCarryGoal}
        onPromoteGoal={mockOnPromoteGoal}
        onAddGoal={mockOnAddGoal}
        onRitualCompleted={mockOnRitualCompleted}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Incomplete Yesterday Task')).toBeDefined()
    })

    // Click 5 Hours preset
    fireEvent.click(screen.getByRole('button', { name: /5 Hours/i }))

    // Click Commit to Today
    const commitBtn = screen.getByRole('button', { name: /Commit to Today/i })
    fireEvent.click(commitBtn)

    await waitFor(() => {
      expect(mockOnUpdateTargetMinutes).toHaveBeenCalledWith(300)
      expect(mockOnCarryGoal).toHaveBeenCalledWith(expect.objectContaining({ id: 'g-past-1' }))
      expect(window.api.settings.patch).toHaveBeenCalledWith(
        expect.objectContaining({
          lastMorningRitualDate: '2026-11-06',
          dailyFocusTargetMinutes: 300
        })
      )
      expect(mockOnRitualCompleted).toHaveBeenCalled()
      expect(mockOnClose).toHaveBeenCalled()
    })
  })

  it('allows skipping the ritual with Skip or Ill plan later', () => {
    render(
      <MorningRitualModal
        isOpen={true}
        onClose={mockOnClose}
        todayStr="2026-11-06"
        todayGoals={sampleTodayGoals}
        dailyFocusTargetMinutes={180}
        onUpdateTargetMinutes={mockOnUpdateTargetMinutes}
        onCarryGoal={mockOnCarryGoal}
        onPromoteGoal={mockOnPromoteGoal}
        onAddGoal={mockOnAddGoal}
        onRitualCompleted={mockOnRitualCompleted}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /I'll plan later/i }))
    expect(mockOnClose).toHaveBeenCalled()
  })
})
