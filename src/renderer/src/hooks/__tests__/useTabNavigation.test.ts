import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTabNavigation } from '../useTabNavigation'

describe('useTabNavigation', () => {
  let navListener: ((tab: string) => void) | null = null

  beforeEach(() => {
    navListener = null
    window.api = {
      ...window.api,
      events: {
        ...window.api?.events,
        onNavigateTab: vi.fn((callback) => {
          navListener = callback
          return () => {
            navListener = null
          }
        })
      }
    } as any
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('initializes with default tab today and records it in visitedTabs without firing onTabChange', () => {
    const onTabChange = vi.fn()
    const { result } = renderHook(() => useTabNavigation({ onTabChange }))

    expect(result.current.tab).toBe('today')
    expect(result.current.visitedTabs.has('today')).toBe(true)
    expect(result.current.visitedTabs.size).toBe(1)
    expect(onTabChange).not.toHaveBeenCalled()
  })

  it('notifies onTabChange exactly once when tab changes', () => {
    const onTabChange = vi.fn()
    const { result } = renderHook(() => useTabNavigation({ onTabChange }))

    act(() => {
      result.current.setTab('review')
    })

    expect(result.current.tab).toBe('review')
    expect(result.current.visitedTabs.has('review')).toBe(true)
    expect(result.current.visitedTabs.size).toBe(2)
    expect(onTabChange).toHaveBeenCalledTimes(1)
    expect(onTabChange).toHaveBeenCalledWith('review')

    // Setting the same tab again should not trigger redundant callback
    act(() => {
      result.current.setTab('review')
    })
    expect(onTabChange).toHaveBeenCalledTimes(1)
  })

  it('switches to goals and increments triggerAddGoal on Ctrl+N / Cmd+N', () => {
    const onTabChange = vi.fn()
    const { result } = renderHook(() => useTabNavigation({ onTabChange }))

    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true })
      window.dispatchEvent(event)
    })

    expect(result.current.tab).toBe('goals')
    expect(result.current.visitedTabs.has('goals')).toBe(true)
    expect(result.current.triggerAddGoal).toBe(1)
    expect(onTabChange).toHaveBeenCalledWith('goals')

    // Triggering again when already on goals keeps tab on goals and increments triggerAddGoal
    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true })
      window.dispatchEvent(event)
    })

    expect(result.current.tab).toBe('goals')
    expect(result.current.triggerAddGoal).toBe(2)
  })

  it('ignores Ctrl+N when focused inside an INPUT or TEXTAREA element', () => {
    const onTabChange = vi.fn()
    const { result } = renderHook(() => useTabNavigation({ onTabChange }))

    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true })
      input.dispatchEvent(event)
    })

    expect(result.current.tab).toBe('today')
    expect(result.current.triggerAddGoal).toBe(0)
    expect(onTabChange).not.toHaveBeenCalled()

    document.body.removeChild(input)
  })

  it('handles IPC onNavigateTab transitions cleanly', () => {
    const onTabChange = vi.fn()
    const { result } = renderHook(() => useTabNavigation({ onTabChange }))

    expect(navListener).toBeTruthy()

    act(() => {
      navListener?.('settings')
    })

    expect(result.current.tab).toBe('settings')
    expect(result.current.visitedTabs.has('settings')).toBe(true)
    expect(onTabChange).toHaveBeenCalledWith('settings')
  })
})
