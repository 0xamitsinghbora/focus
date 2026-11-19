import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { useDialogA11y } from '../lib/useDialogA11y'

function TestDialog({
  isOpen,
  onClose,
  closeOnEscape,
  shouldIgnoreFocusOut
}: {
  isOpen: boolean
  onClose: () => void
  closeOnEscape?: boolean
  shouldIgnoreFocusOut?: (target: HTMLElement) => boolean
}) {
  const dialogRef = useDialogA11y<HTMLDivElement>({
    isOpen,
    onClose,
    ...(closeOnEscape !== undefined ? { closeOnEscape } : {}),
    shouldIgnoreFocusOut
  })

  if (!isOpen) return null

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" data-testid="dialog">
      <button data-testid="btn-1">Button 1</button>
      <input data-testid="input-1" placeholder="Input 1" />
      <button data-testid="btn-2">Button 2</button>
    </div>
  )
}

describe('useDialogA11y', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('focuses the first focusable element when opened', () => {
    render(<TestDialog isOpen={true} onClose={vi.fn()} />)
    act(() => {
      vi.advanceTimersByTime(50)
    })
    expect(screen.getByTestId('btn-1')).toBe(document.activeElement)
  })

  it('calls onClose when Escape is pressed by default without specifying closeOnEscape', () => {
    const onClose = vi.fn()
    render(<TestDialog isOpen={true} onClose={onClose} />)
    act(() => {
      vi.advanceTimersByTime(50)
    })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('does not call onClose when Escape is pressed if closeOnEscape is explicitly false', () => {
    const onClose = vi.fn()
    render(<TestDialog isOpen={true} onClose={onClose} closeOnEscape={false} />)
    act(() => {
      vi.advanceTimersByTime(50)
    })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('traps focus inside the dialog when focus tries to escape to document background', () => {
    const outsideBtn = document.createElement('button')
    outsideBtn.setAttribute('data-testid', 'outside-btn')
    document.body.appendChild(outsideBtn)

    render(<TestDialog isOpen={true} onClose={vi.fn()} />)
    act(() => {
      vi.advanceTimersByTime(50)
    })

    // Simulate focus event on background element
    fireEvent.focusIn(outsideBtn)
    expect(screen.getByTestId('btn-1')).toBe(document.activeElement)

    document.body.removeChild(outsideBtn)
  })

  it('does not steal focus when focusing into a portaled element', () => {
    const portalContainer = document.createElement('div')
    portalContainer.setAttribute('data-portal', 'true')
    const portalBtn = document.createElement('button')
    portalBtn.setAttribute('data-testid', 'portal-btn')
    portalContainer.appendChild(portalBtn)
    document.body.appendChild(portalContainer)

    render(<TestDialog isOpen={true} onClose={vi.fn()} />)
    act(() => {
      vi.advanceTimersByTime(50)
    })

    // Focus into portal
    portalBtn.focus()
    fireEvent.focusIn(portalBtn)
    expect(portalBtn).toBe(document.activeElement)

    document.body.removeChild(portalContainer)
  })

  it('does not steal focus or reset cursor when parent re-renders with a new onClose reference', () => {
    const { rerender } = render(<TestDialog isOpen={true} onClose={() => {}} />)
    act(() => {
      vi.advanceTimersByTime(50)
    })
    expect(screen.getByTestId('btn-1')).toBe(document.activeElement)

    // User focuses the input
    const input = screen.getByTestId('input-1')
    input.focus()
    expect(input).toBe(document.activeElement)

    // Parent re-renders with new onClose function reference (e.g. typing causes parent re-render)
    rerender(<TestDialog isOpen={true} onClose={() => {}} />)
    act(() => {
      vi.advanceTimersByTime(100)
    })

    // Input must remain focused
    expect(input).toBe(document.activeElement)
  })
})
