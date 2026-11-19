import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { applyTheme, getStoredTheme, useTheme, _resetThemeForTesting } from '../lib/theme'
import { initializeTheme } from '../lib/initTheme'

describe('Theme Management (theme.ts & initTheme.ts)', () => {
  let mockPatch: ReturnType<typeof vi.fn>
  let themeUpdatedCallback: ((theme: string) => void) | null = null

  beforeEach(() => {
    _resetThemeForTesting()
    mockPatch = vi.fn().mockResolvedValue({})
    themeUpdatedCallback = null

    ;(window as any).api = {
      theme: {
        getInitialTheme: vi.fn().mockReturnValue('dark'),
        onThemeUpdated: vi.fn((cb) => {
          themeUpdatedCallback = cb
          return () => {
            themeUpdatedCallback = null
          }
        })
      },
      settings: {
        patch: mockPatch
      }
    }

    // Default to main window
    Object.defineProperty(window, 'location', {
      value: { pathname: '/index.html' },
      writable: true,
      configurable: true
    })

    document.documentElement.className = ''
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('retrieves stored initial theme from window.api.theme', () => {
    const theme = getStoredTheme()
    expect(theme).toBe('dark')
  })

  it('applyTheme styles DOM without triggering settings.patch by default', () => {
    applyTheme('light') // default broadcast = false

    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(localStorage.getItem('focus-theme')).toBe('light')
    expect(mockPatch).not.toHaveBeenCalled()

    applyTheme('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(localStorage.getItem('focus-theme')).toBe('dark')
    expect(mockPatch).not.toHaveBeenCalled()
  })

  it('applyTheme with broadcast=true in main window dispatches custom event and calls settings.patch', () => {
    const eventSpy = vi.fn()
    window.addEventListener('focus-theme-change', eventSpy)

    applyTheme('light', true)

    expect(eventSpy).toHaveBeenCalled()
    expect(mockPatch).toHaveBeenCalledWith({ theme: 'light' })

    window.removeEventListener('focus-theme-change', eventSpy)
  })

  it('applyTheme in widget or prompt window NEVER calls settings.patch even if broadcast=true', () => {
    // Simulate Deskband Widget window
    Object.defineProperty(window, 'location', {
      value: { pathname: '/widget.html' },
      writable: true,
      configurable: true
    })

    applyTheme('dark', true)
    expect(mockPatch).not.toHaveBeenCalled()

    // Simulate Prompt window
    Object.defineProperty(window, 'location', {
      value: { pathname: '/prompt.html' },
      writable: true,
      configurable: true
    })

    applyTheme('light', true)
    expect(mockPatch).not.toHaveBeenCalled()
  })

  it('initializeTheme applies theme on boot without patching settings', () => {
    mockPatch.mockClear()
    initializeTheme()

    // Verifies widget/prompt boot will not fire unauthorized settings:patch
    expect(mockPatch).not.toHaveBeenCalled()
  })

  it('initializeTheme handles live theme updates from main process without echoing settings.patch', () => {
    initializeTheme()
    expect(themeUpdatedCallback).not.toBeNull()

    // Main process broadcasts theme:updated to this window
    themeUpdatedCallback!('light')

    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(mockPatch).not.toHaveBeenCalled()
  })

  it('useTheme setTheme does not patch settings if broadcast=false or theme unchanged', () => {
    const { result } = renderHook(() => useTheme())
    mockPatch.mockClear()

    // setTheme with broadcast = false (e.g. from backend sync)
    act(() => {
      result.current[1]('light', false)
    })
    expect(mockPatch).not.toHaveBeenCalled()

    // setTheme with the same theme should not trigger patch
    mockPatch.mockClear()
    act(() => {
      result.current[1]('light', true)
    })
    expect(mockPatch).not.toHaveBeenCalled()
  })
})
