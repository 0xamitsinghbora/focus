import { describe, it, expect } from 'vitest'
import {
  CONFIGURABLE_SHORTCUTS,
  DEFAULT_SHORTCUTS,
  formatAcceleratorForDisplay,
  keyboardEventToAccelerator,
  checkShortcutConflict
} from '../shortcuts'

describe('shortcuts utility', () => {
  it('has all 4 global desktop shortcuts and in-app shortcuts configured', () => {
    expect(DEFAULT_SHORTCUTS['global-log']).toBe('CommandOrControl+Shift+L')
    expect(CONFIGURABLE_SHORTCUTS.find((s) => s.id === 'global-log')).toBeDefined()
    expect(CONFIGURABLE_SHORTCUTS.find((s) => s.id === 'global-front')).toBeDefined()
    expect(CONFIGURABLE_SHORTCUTS.find((s) => s.id === 'global-add-task')).toBeDefined()
    expect(CONFIGURABLE_SHORTCUTS.find((s) => s.id === 'global-toggle-session')).toBeDefined()
    expect(CONFIGURABLE_SHORTCUTS.find((s) => s.id === 'app-quick-add')).toBeDefined()
  })

  it('formats accelerators for display on Windows/Linux', () => {
    expect(formatAcceleratorForDisplay('CommandOrControl+Shift+L', false)).toEqual([
      'Ctrl',
      'Shift',
      'L'
    ])
    expect(formatAcceleratorForDisplay('CommandOrControl+Alt+Space', false)).toEqual([
      'Ctrl',
      'Alt',
      'Space'
    ])
    expect(formatAcceleratorForDisplay('none', false)).toEqual(['Disabled'])
    expect(formatAcceleratorForDisplay('', false)).toEqual(['Disabled'])
    expect(formatAcceleratorForDisplay('?', false)).toEqual(['?'])
  })

  it('formats accelerators for display on Mac', () => {
    expect(formatAcceleratorForDisplay('CommandOrControl+Shift+L', true)).toEqual(['⌘', '⇧', 'L'])
    expect(formatAcceleratorForDisplay('CommandOrControl+Alt+Space', true)).toEqual([
      '⌘',
      '⌥',
      'Space'
    ])
  })

  it('converts KeyboardEvent to accelerator', () => {
    // Modifier only -> null
    expect(
      keyboardEventToAccelerator({
        key: 'Shift',
        shiftKey: true,
        ctrlKey: false,
        altKey: false,
        metaKey: false
      } as any)
    ).toBeNull()

    // Ctrl+Alt+K
    expect(
      keyboardEventToAccelerator({
        key: 'k',
        shiftKey: false,
        ctrlKey: true,
        altKey: true,
        metaKey: false
      } as any)
    ).toBe('CommandOrControl+Alt+K')

    // Space with Ctrl
    expect(
      keyboardEventToAccelerator({
        key: ' ',
        shiftKey: false,
        ctrlKey: true,
        altKey: false,
        metaKey: false
      } as any)
    ).toBe('CommandOrControl+Space')
  })

  it('detects shortcut conflicts', () => {
    const currentShortcuts = {
      'global-log': 'CommandOrControl+Shift+L',
      'global-front': 'CommandOrControl+Shift+F'
    }

    const conflict = checkShortcutConflict(
      'CommandOrControl+Shift+L',
      'global-front',
      currentShortcuts
    )
    expect(conflict.hasConflict).toBe(true)
    expect(conflict.conflictingShortcutId).toBe('global-log')

    const noConflict = checkShortcutConflict(
      'CommandOrControl+Alt+K',
      'global-front',
      currentShortcuts
    )
    expect(noConflict.hasConflict).toBe(false)

    const disabledNoConflict = checkShortcutConflict('none', 'global-front', currentShortcuts)
    expect(disabledNoConflict.hasConflict).toBe(false)
  })
})
