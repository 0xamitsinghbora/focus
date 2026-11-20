import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { EvaluatorSettingsSection } from '../EvaluatorSettingsSection'
import { EvaluatorMetrics } from '../../../../../shared/types'

describe('EvaluatorSettingsSection', () => {
  const mockSettings = {
    mode: 'embedded_lite' as const,
    strictness: 'strict' as const,
    requireProofOfWork: true
  }

  const mockMetrics: EvaluatorMetrics = {
    mode: 'embedded_lite',
    totalEvaluations: 25,
    verifiedGoalsCount: 22,
    rejectedCount: 3,
    averageHonestyScore: 88
  }

  const mockGetSettings = vi.fn()
  const mockUpdateSettings = vi.fn()
  const mockGetMetrics = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSettings.mockResolvedValue(mockSettings)
    mockGetMetrics.mockResolvedValue(mockMetrics)
    mockUpdateSettings.mockResolvedValue(mockSettings)

    ;(window as any).api = {
      evaluator: {
        getSettings: mockGetSettings,
        updateSettings: mockUpdateSettings,
        getMetrics: mockGetMetrics
      }
    }
  })

  it('renders evaluator mode controls, strictness, and metrics cleanly', async () => {
    render(<EvaluatorSettingsSection />)

    await waitFor(() => {
      expect(mockGetSettings).toHaveBeenCalled()
      expect(mockGetMetrics).toHaveBeenCalled()
    })

    expect(screen.getByText('Evaluator & Anti-Cheat')).toBeDefined()
    expect(screen.getByRole('button', { name: /Built-in Evaluator/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /Self-Evaluation/i })).toBeDefined()
    expect(screen.getByText('Require Deliverables')).toBeDefined()

    // Metrics
    expect(screen.getByText('88%')).toBeDefined() // Honesty score
    expect(screen.getByText('22')).toBeDefined() // Total verified
  })

  it('switches evaluation mode to self-evaluation and persists via updateSettings', async () => {
    render(<EvaluatorSettingsSection />)

    await waitFor(() => {
      expect(mockGetSettings).toHaveBeenCalled()
    })

    const selfModeBtn = screen.getByRole('button', { name: /Self-Evaluation/i })
    fireEvent.click(selfModeBtn)

    await waitFor(() => {
      expect(mockUpdateSettings).toHaveBeenCalledWith({ mode: 'self' })
    })
  })

  it('switches strictness level', async () => {
    render(<EvaluatorSettingsSection />)

    await waitFor(() => {
      expect(mockGetSettings).toHaveBeenCalled()
    })

    const moderateBtn = screen.getByText('Moderate')
    fireEvent.click(moderateBtn)

    await waitFor(() => {
      expect(mockUpdateSettings).toHaveBeenCalledWith({ strictness: 'moderate' })
    })
  })

  it('toggles proof of work requirement', async () => {
    render(<EvaluatorSettingsSection />)

    await waitFor(() => {
      expect(mockGetSettings).toHaveBeenCalled()
    })

    const switchBtn = screen.getByRole('switch')
    fireEvent.click(switchBtn)

    await waitFor(() => {
      expect(mockUpdateSettings).toHaveBeenCalledWith({ requireProofOfWork: false })
    })
  })
})
