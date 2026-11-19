import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { KeyboardShortcutsModal } from '../components/KeyboardShortcutsModal'

vi.mock('../lib/useToast', () => ({
  useToast: () => ({
    show: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn()
  })
}))

describe('KeyboardShortcutsModal Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.api = {
      settings: {
        get: vi.fn().mockResolvedValue({ customShortcuts: {} }),
        set: vi.fn().mockResolvedValue(undefined),
        patch: vi.fn().mockResolvedValue(undefined),
        uninstall: vi.fn(),
        deleteAllData: vi.fn()
      }
    } as any
  })

  it('does not render when isOpen is false', () => {
    const onClose = vi.fn()
    render(<KeyboardShortcutsModal isOpen={false} onClose={onClose} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders modal with shortcut items when isOpen is true', () => {
    const onClose = vi.fn()
    render(<KeyboardShortcutsModal isOpen={true} onClose={onClose} isMac={false} />)

    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Keyboard Shortcuts' })).toBeTruthy()
    expect(screen.getByText('Quick Log Prompt')).toBeTruthy()
    expect(screen.getByText('Bring Focus to Front')).toBeTruthy()
    expect(screen.getByText('Quick Add Task')).toBeTruthy()
    expect(screen.getAllByText('Ctrl').length).toBeGreaterThan(0)
  })

  it('renders Mac modifier symbols when isMac is true', () => {
    const onClose = vi.fn()
    render(<KeyboardShortcutsModal isOpen={true} onClose={onClose} isMac={true} />)

    expect(screen.getAllByText('⌘').length).toBeGreaterThan(0)
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(<KeyboardShortcutsModal isOpen={true} onClose={onClose} />)

    const closeBtn = screen.getByLabelText('Close shortcuts modal')
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when clicking the presentation backdrop', () => {
    const onClose = vi.fn()
    render(<KeyboardShortcutsModal isOpen={true} onClose={onClose} />)

    const backdrop = screen.getByRole('presentation')
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not close when clicking inside the dialog card', () => {
    const onClose = vi.fn()
    render(<KeyboardShortcutsModal isOpen={true} onClose={onClose} />)

    const dialog = screen.getByRole('dialog')
    fireEvent.click(dialog)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('removes non-existent shortcuts and natural shorthand card', () => {
    const onClose = vi.fn()
    render(<KeyboardShortcutsModal isOpen={true} onClose={onClose} />)

    // Ensure phantom/non-existent shortcuts and shorthand reference card are not present
    expect(screen.queryByText(/Switch Tabs \(1–4\)/i)).toBeNull()
    expect(screen.queryByText(/Toggle Deep Focus Zen/i)).toBeNull()
    expect(screen.queryByText(/when in Zen or Command Palette/i)).toBeNull()
    expect(screen.queryByText('Command Palette')).toBeNull()
    expect(screen.queryByText('Exit Zen Mode')).toBeNull()
    expect(screen.queryByText('Task Input Natural Shorthand')).toBeNull()
  })

  it('renders only changeable shortcuts and excludes unchangeable board navigation shortcuts', () => {
    const onClose = vi.fn()
    render(<KeyboardShortcutsModal isOpen={true} onClose={onClose} />)

    // All 5 changeable shortcuts are rendered
    expect(screen.getByText('Quick Log Prompt')).toBeTruthy()
    expect(screen.getByText('Bring Focus to Front')).toBeTruthy()
    expect(screen.getByText('Global Quick Add Task')).toBeTruthy()
    expect(screen.getByText('Toggle Focus / Pause')).toBeTruthy()
    expect(screen.getByText('Quick Add Task')).toBeTruthy()

    // Non-changeable shortcuts are NOT rendered
    expect(screen.queryByText('Move Task Status (1 / 2 / 3)')).toBeNull()
    expect(screen.queryByText('Reorder Card (Up / Down)')).toBeNull()
    expect(screen.queryByText('Quick Time Estimate')).toBeNull()
    expect(screen.queryByText('Delete Selected Task')).toBeNull()
    expect(screen.queryByText('Select All Visible Cards')).toBeNull()
  })

  it('filters shortcuts by search query', () => {
    const onClose = vi.fn()
    render(<KeyboardShortcutsModal isOpen={true} onClose={onClose} />)

    const searchInput = screen.getByPlaceholderText(/Search shortcuts/i)
    fireEvent.change(searchInput, { target: { value: 'front' } })

    expect(screen.getByText('Bring Focus to Front')).toBeTruthy()
    expect(screen.queryByText('Quick Log Prompt')).toBeNull()

    // Test non-matching query displays empty state
    fireEvent.change(searchInput, { target: { value: 'xyznonexistent123' } })
    expect(screen.getByText('No shortcuts found')).toBeTruthy()

    // Click reset button
    const resetBtn = screen.getByRole('button', { name: /Reset Search Filters/i })
    fireEvent.click(resetBtn)
    expect(screen.getByText('Quick Log Prompt')).toBeTruthy()
  })

  it('filters shortcuts by category tab', () => {
    const onClose = vi.fn()
    render(<KeyboardShortcutsModal isOpen={true} onClose={onClose} />)

    // Click on Global Desktop tab
    const globalTab = screen.getByRole('tab', { name: /Global Desktop/i })
    fireEvent.click(globalTab)

    expect(screen.getByText('Quick Log Prompt')).toBeTruthy()
    expect(screen.getByText('Bring Focus to Front')).toBeTruthy()
    expect(screen.queryByText('Quick Add Task')).toBeNull()

    // Click on In Focus tab
    const appTab = screen.getByRole('tab', { name: /In Focus/i })
    fireEvent.click(appTab)

    expect(screen.getByText('Quick Add Task')).toBeTruthy()
    expect(screen.queryByText('Quick Log Prompt')).toBeNull()
  })

  it('allows customizing a global shortcut with game-style key rebind and patches settings', async () => {
    const onClose = vi.fn()
    render(<KeyboardShortcutsModal isOpen={true} onClose={onClose} />)

    const rebindBtn = screen.getByRole('button', { name: 'Rebind shortcut for Quick Log Prompt' })
    fireEvent.click(rebindBtn)

    expect(screen.getByText(/Press keys/i)).toBeTruthy()

    // Press Alt + Shift + P
    fireEvent.keyDown(window, {
      key: 'p',
      altKey: true,
      shiftKey: true,
      ctrlKey: false,
      metaKey: false
    })

    await waitFor(() => {
      expect(window.api.settings.patch).toHaveBeenCalledWith({
        customShortcuts: {
          'global-log': 'Alt+Shift+P'
        }
      })
    })

    // Custom badge should now appear
    expect(screen.getByText('Custom')).toBeTruthy()
  })

  it('allows disabling a shortcut to prevent collisions with other apps', async () => {
    const onClose = vi.fn()
    render(<KeyboardShortcutsModal isOpen={true} onClose={onClose} />)

    const disableBtn = screen.getByRole('button', {
      name: 'Disable shortcut for Bring Focus to Front'
    })
    fireEvent.click(disableBtn)

    await waitFor(() => {
      expect(window.api.settings.patch).toHaveBeenCalledWith({
        customShortcuts: {
          'global-front': 'none'
        }
      })
    })

    expect(screen.getAllByText('Disabled').length).toBeGreaterThan(0)
  })

  it('allows resetting a customized shortcut back to default', async () => {
    const onClose = vi.fn()
    render(
      <KeyboardShortcutsModal
        isOpen={true}
        onClose={onClose}
        initialCustomShortcuts={{ 'global-log': 'Alt+Shift+P' }}
      />
    )

    expect(screen.getByText('Custom')).toBeTruthy()

    const resetBtn = screen.getByRole('button', { name: 'Reset Quick Log Prompt to default' })
    fireEvent.click(resetBtn)

    await waitFor(() => {
      expect(window.api.settings.patch).toHaveBeenCalledWith({
        customShortcuts: {}
      })
    })
  })
})
