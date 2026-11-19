import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BreakRecoveryModal } from '../components/BreakRecoveryModal'
import { BreakNudgePayload } from '../../../shared/types'

describe('BreakRecoveryModal Component', () => {
  const mockOnClose = vi.fn()
  const mockOnResumeFocus = vi.fn()
  const mockOnStartMicroSession = vi.fn()
  const mockOnExtendBreak = vi.fn()

  const sampleNudge: BreakNudgePayload = {
    urgency: 2,
    breakMinutes: 90,
    intervalMinutes: 45,
    title: 'Still on break',
    body: '90 minutes on break now. Your focus target is waiting.',
    timestamp: Date.now()
  }

  it('renders break recovery modal with urgency 2 and break details', () => {
    render(
      <BreakRecoveryModal
        nudge={sampleNudge}
        onClose={mockOnClose}
        onResumeFocus={mockOnResumeFocus}
        onStartMicroSession={mockOnStartMicroSession}
        onExtendBreak={mockOnExtendBreak}
      />
    )

    expect(screen.getByRole('heading', { name: /Still on break/i })).toBeDefined()
    expect(screen.getByText(/90 minutes on break now/i)).toBeDefined()
    expect(screen.getByText(/1h 30m on break/i)).toBeDefined()
    expect(screen.getByRole('button', { name: /Resume Focus Session/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /Start 5m Micro-Focus/i })).toBeDefined()
  })

  it('clicking Resume Focus invokes onResumeFocus callback', () => {
    render(
      <BreakRecoveryModal
        nudge={sampleNudge}
        onClose={mockOnClose}
        onResumeFocus={mockOnResumeFocus}
        onStartMicroSession={mockOnStartMicroSession}
        onExtendBreak={mockOnExtendBreak}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Resume Focus Session/i }))
    expect(mockOnResumeFocus).toHaveBeenCalled()
  })

  it('clicking Start 5m Micro-Focus invokes onStartMicroSession callback', () => {
    render(
      <BreakRecoveryModal
        nudge={sampleNudge}
        onClose={mockOnClose}
        onResumeFocus={mockOnResumeFocus}
        onStartMicroSession={mockOnStartMicroSession}
        onExtendBreak={mockOnExtendBreak}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Start 5m Micro-Focus/i }))
    expect(mockOnStartMicroSession).toHaveBeenCalled()
  })

  it('clicking Extend +5m invokes onExtendBreak with 5 minutes', () => {
    render(
      <BreakRecoveryModal
        nudge={sampleNudge}
        onClose={mockOnClose}
        onResumeFocus={mockOnResumeFocus}
        onStartMicroSession={mockOnStartMicroSession}
        onExtendBreak={mockOnExtendBreak}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Extend \+5m/i }))
    expect(mockOnExtendBreak).toHaveBeenCalledWith(5)
  })

  it('renders Extended Break badge and inertia breaker callout for urgency >= 3', () => {
    const urgentNudge: BreakNudgePayload = {
      ...sampleNudge,
      urgency: 3,
      breakMinutes: 135,
      title: 'Extended break',
      body: '135 minute break. Pick a task and start a focus session.'
    }

    render(
      <BreakRecoveryModal
        nudge={urgentNudge}
        onClose={mockOnClose}
        onResumeFocus={mockOnResumeFocus}
        onStartMicroSession={mockOnStartMicroSession}
        onExtendBreak={mockOnExtendBreak}
      />
    )

    expect(screen.getByText('Extended Break')).toBeDefined()
    expect(
      screen.getByText(/Feeling stuck\? Even a 5-minute micro-session breaks inertia/i)
    ).toBeDefined()
  })
})

