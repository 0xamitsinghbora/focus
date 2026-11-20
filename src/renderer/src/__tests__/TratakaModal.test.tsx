import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { TratakaModal } from '../components/TratakaModal'
import { audioEngine, playFocusChime } from '../lib/audioEngine'

vi.mock('../lib/audioEngine', () => {
  let isPlaying = false
  return {
    audioEngine: {
      get isPlaying() {
        return isPlaying
      },
      play: vi.fn(() => {
        isPlaying = true
      }),
      pause: vi.fn(() => {
        isPlaying = false
      })
    },
    playFocusChime: vi.fn()
  }
})

describe('TratakaModal Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  it('does not render when isOpen is false', () => {
    render(<TratakaModal isOpen={false} onClose={vi.fn()} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders fullscreen reset view with centered dot and guidance cue when isOpen is true', () => {
    render(<TratakaModal isOpen={true} onClose={vi.fn()} />)

    expect(screen.getByRole('dialog')).toBeDefined()
    expect(screen.getByTestId('trataka-dot')).toBeDefined()
    expect(
      screen.getByText(
        /Rest your eyes softly on the dot\. Blink naturally\. Let the noise settle\./i
      )
    ).toBeDefined()
  })

  it('fades out the eye strain guidance cue after 4.5 seconds', () => {
    render(<TratakaModal isOpen={true} onClose={vi.fn()} />)

    const cue = screen.getByText(
      /Rest your eyes softly on the dot\. Blink naturally\. Let the noise settle\./i
    ).parentElement
    expect(cue?.className).toContain('opacity-90')

    act(() => {
      vi.advanceTimersByTime(4600)
    })

    expect(cue?.className).toContain('opacity-0')
  })

  it('defaults to 60s and allows switching duration presets (30s, 60s, 90s, 2m, 5m)', () => {
    render(<TratakaModal isOpen={true} onClose={vi.fn()} />)

    const preset30 = screen.getByText('30s')
    const preset60 = screen.getByText('60s')
    const preset90 = screen.getByText('90s')
    const preset5m = screen.getByText('5m')

    expect(preset30).toBeDefined()
    expect(preset60.className).toContain('font-semibold')

    // Click 30s preset
    act(() => {
      fireEvent.click(preset30)
    })
    expect(preset30.className).toContain('font-semibold')

    // Click 90s preset
    act(() => {
      fireEvent.click(preset90)
    })
    expect(preset90.className).toContain('font-semibold')

    // Click 5m preset
    act(() => {
      fireEvent.click(preset5m)
    })
    expect(preset5m.className).toContain('font-semibold')
  })

  it('counts down and triggers completion and chime when time reaches zero', () => {
    const handleClose = vi.fn()
    const handleComplete = vi.fn()
    render(
      <TratakaModal
        isOpen={true}
        onClose={handleClose}
        onComplete={handleComplete}
        initialDurationSeconds={60}
      />
    )

    act(() => {
      vi.advanceTimersByTime(60000)
    })

    expect(playFocusChime).toHaveBeenCalledWith('complete')
    expect(handleComplete).toHaveBeenCalled()
    expect(handleClose).toHaveBeenCalled()
  })

  it('closes when pressing Escape key', () => {
    const handleClose = vi.fn()
    render(<TratakaModal isOpen={true} onClose={handleClose} />)

    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' })
    })

    expect(handleClose).toHaveBeenCalled()
  })

  it('calls onComplete with elapsed seconds on early exit if elapsed >= 10s', () => {
    const handleClose = vi.fn()
    const handleComplete = vi.fn()
    render(<TratakaModal isOpen={true} onClose={handleClose} onComplete={handleComplete} />)

    act(() => {
      vi.advanceTimersByTime(15000)
    })

    const exitBtn = screen.getByRole('button', { name: 'Exit' })
    act(() => {
      fireEvent.click(exitBtn)
    })

    expect(handleComplete).toHaveBeenCalledWith(15)
    expect(handleClose).toHaveBeenCalled()
  })

  it('silences audio on mount and restores on close if audio was active', () => {
    vi.spyOn(audioEngine, 'isPlaying', 'get').mockReturnValue(true)
    const handleClose = vi.fn()

    const { unmount } = render(
      <TratakaModal isOpen={true} onClose={handleClose} initialDurationSeconds={90} />
    )

    expect(audioEngine.pause).toHaveBeenCalledWith({ userInitiated: false })

    unmount()
    expect(audioEngine.play).toHaveBeenCalledWith({ userInitiated: false })
  })
})
