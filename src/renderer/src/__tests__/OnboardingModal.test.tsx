import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { OnboardingModal } from '../components/OnboardingModal'

describe('OnboardingModal Component', () => {
  const mockOnClose = vi.fn()
  const mockOnComplete = vi.fn().mockResolvedValue(undefined)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not render when isOpen is false', () => {
    render(
      <OnboardingModal
        isOpen={false}
        onClose={mockOnClose}
        onComplete={mockOnComplete}
      />
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders Step 1 (The Daily Planner) with column explanations and goal input', () => {
    render(
      <OnboardingModal
        isOpen={true}
        onClose={mockOnClose}
        onComplete={mockOnComplete}
      />
    )

    expect(screen.getByRole('dialog')).toBeDefined()
    expect(screen.getByRole('heading', { name: /The Daily Planner/i })).toBeDefined()
    expect(screen.getByText(/Step 1 of 3/i)).toBeDefined()
    expect(screen.getByText('Planned')).toBeDefined()
    expect(screen.getByText('In Progress')).toBeDefined()
    expect(screen.getByText('Done')).toBeDefined()
    expect(screen.getByPlaceholderText(/e\.g\. Finish database migration/i)).toBeDefined()
  })

  it('navigates through steps 1, 2, and 3 with Back and Continue', () => {
    render(
      <OnboardingModal
        isOpen={true}
        onClose={mockOnClose}
        onComplete={mockOnComplete}
      />
    )

    // Type a primary goal
    const goalInput = screen.getByPlaceholderText(/e\.g\. Finish database migration/i)
    fireEvent.change(goalInput, { target: { value: 'Launch Apollo Mission' } })

    // Step 1 -> Step 2
    fireEvent.click(screen.getByRole('button', { name: /Continue →/i }))

    expect(screen.getByRole('heading', { name: /Session Timing & Daily Target/i })).toBeDefined()
    expect(screen.getByText(/Step 2 of 3/i)).toBeDefined()
    expect(screen.getByRole('button', { name: /25m/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /6 Hours/i })).toBeDefined()

    // Select 25m interval and 6 Hours daily target
    fireEvent.click(screen.getByRole('button', { name: /25m/i }))
    fireEvent.click(screen.getByRole('button', { name: /6 Hours/i }))

    // Step 2 -> Step 3
    fireEvent.click(screen.getByRole('button', { name: /Continue →/i }))

    expect(screen.getByRole('heading', { name: /Self-Awareness & Break Guard/i })).toBeDefined()
    expect(screen.getByText(/Step 3 of 3/i)).toBeDefined()
    expect(screen.getByText(/Focus Quality Self-Rating \(1–5\)/i)).toBeDefined()
    expect(screen.getByText(/Escalating Break Nudges/i)).toBeDefined()
    expect(screen.getByText(/Morning Planning Ritual/i)).toBeDefined()

    // Test Back button: Step 3 -> Step 2
    fireEvent.click(screen.getByRole('button', { name: /Back/i }))
    expect(screen.getByRole('heading', { name: /Session Timing & Daily Target/i })).toBeDefined()
  })

  it('completes onboarding setup and invokes onComplete with user selections and initial goal', async () => {
    render(
      <OnboardingModal
        isOpen={true}
        onClose={mockOnClose}
        onComplete={mockOnComplete}
      />
    )

    // Step 1: Type goal
    const goalInput = screen.getByPlaceholderText(/e\.g\. Finish database migration/i)
    fireEvent.change(goalInput, { target: { value: 'Deep Engine Optimization' } })
    fireEvent.click(screen.getByRole('button', { name: /Continue →/i }))

    // Step 2: Choose 60m interval and 8 Hours
    fireEvent.click(screen.getByRole('button', { name: /60m/i }))
    fireEvent.click(screen.getByRole('button', { name: /8 Hours/i }))
    fireEvent.click(screen.getByRole('button', { name: /Continue →/i }))

    // Step 3: Complete Setup & Open Planner
    const finishBtn = screen.getByRole('button', { name: /Complete Setup & Open Planner/i })
    fireEvent.click(finishBtn)

    await waitFor(() => {
      expect(mockOnComplete).toHaveBeenCalledWith({
        intervalMinutes: 60,
        dailyTargetMinutes: 480,
        initialGoalTitle: 'Deep Engine Optimization'
      })
    })
  })

  it('allows skipping onboarding with Skip to Planner button using defaults', async () => {
    render(
      <OnboardingModal
        isOpen={true}
        onClose={mockOnClose}
        defaultIntervalMinutes={45}
        defaultDailyTargetMinutes={480}
        onComplete={mockOnComplete}
      />
    )

    const skipBtn = screen.getByRole('button', { name: /Skip to Planner/i })
    fireEvent.click(skipBtn)

    await waitFor(() => {
      expect(mockOnComplete).toHaveBeenCalledWith({
        intervalMinutes: 45,
        dailyTargetMinutes: 480
      })
    })
  })
})

