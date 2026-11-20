import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { AppHeader } from '../components/AppHeader'
import { Tabs } from '../components/ui/tabs'
import { FocusSessionActionsContext, FocusSessionActions } from '../context/FocusSessionContext'
import { useFocusSessionStore } from '../context/focusSessionStore'

const mockActions: FocusSessionActions = {
  startFocus: async () => {},
  startBreak: async () => {},
  pauseFocus: () => {},
  resumeFocus: () => {},
  togglePause: () => {},
  addMinutes: () => {},
  setSessionNote: () => {},
  openZenMode: () => {},
  closeZenMode: () => {},
  toggleZenMode: () => {},
  setIsMinimized: () => {},
  toggleMinimized: () => {},
  completeTask: async () => {},
  endSession: async () => {},
  isGoalFocused: () => false
}

function renderHeader(): ReturnType<typeof render> {
  return render(
    <FocusSessionActionsContext.Provider value={mockActions}>
      <Tabs defaultValue="today">
        <AppHeader />
      </Tabs>
    </FocusSessionActionsContext.Provider>
  )
}

describe('AppHeader Component', () => {
  beforeEach(() => {
    act(() => {
      useFocusSessionStore.getState().resetSession()
    })
  })

  it('renders Focus title and Ready badge when inactive', () => {
    renderHeader()

    expect(screen.getByRole('heading', { name: 'Focus' })).toBeDefined()
    expect(screen.getByText('Ready')).toBeDefined()
  })

  it('renders Meditation button when onOpenTrataka is provided and fires callback on click', () => {
    const onOpenTrataka = vi.fn()
    render(
      <FocusSessionActionsContext.Provider value={mockActions}>
        <Tabs defaultValue="today">
          <AppHeader onOpenTrataka={onOpenTrataka} />
        </Tabs>
      </FocusSessionActionsContext.Provider>
    )

    const meditationBtn = screen.getByRole('button', { name: 'Meditation' })
    expect(meditationBtn).toBeDefined()
    expect(meditationBtn.getAttribute('title')).toBe(
      'Meditation (Trataka) — zero-input visual decompression'
    )
    fireEvent.click(meditationBtn)
    expect(onOpenTrataka).toHaveBeenCalledTimes(1)
  })

  it('does not render duplicate header soundscape player', () => {
    renderHeader()
    expect(screen.queryByRole('button', { name: /Play soundscape/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /Ambient soundscape/i })).toBeNull()
  })

  it('does not render status indicator before session hydration is complete', () => {
    act(() => {
      useFocusSessionStore.getState().setLifecycle({ isHydrated: false })
    })

    renderHeader()

    expect(screen.queryByText('Ready')).toBeNull()
    expect(screen.queryByText('Break')).toBeNull()
    expect(screen.queryByText('Focusing')).toBeNull()
  })

  it('displays Focusing badge when session is active', () => {
    const { rerender } = renderHeader()

    act(() => {
      useFocusSessionStore.getState().setLifecycle({
        isActive: true,
        isPaused: false,
        activeGoal: {
          id: 'test-goal',
          title: 'Writing Specifications',
          date: '2026-11-04',
          targetMinutes: 30,
          status: 'in_progress',
          createdAt: new Date().toISOString()
        }
      })
    })

    rerender(
      <FocusSessionActionsContext.Provider value={mockActions}>
        <Tabs defaultValue="today">
          <AppHeader />
        </Tabs>
      </FocusSessionActionsContext.Provider>
    )

    expect(screen.getByText('Focusing')).toBeDefined()
    expect(screen.queryByText('Ready')).toBeNull()
  })

  it('displays Paused badge when session is paused', () => {
    const { rerender } = renderHeader()

    act(() => {
      useFocusSessionStore.getState().setLifecycle({
        isActive: true,
        isPaused: true
      })
    })

    rerender(
      <FocusSessionActionsContext.Provider value={mockActions}>
        <Tabs defaultValue="today">
          <AppHeader />
        </Tabs>
      </FocusSessionActionsContext.Provider>
    )

    expect(screen.getByText('Paused')).toBeDefined()
  })

  it('does not render quick control buttons (+5m, Break, Pause) in status badge', () => {
    renderHeader()

    act(() => {
      useFocusSessionStore.getState().setLifecycle({
        isActive: true,
        isPaused: false
      })
      useFocusSessionStore.getState().setTimer(2700, 0, 2700)
    })

    expect(screen.queryByRole('button', { name: 'Add 5 minutes' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Take a 5-minute break' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Pause focus' })).toBeNull()
  })

  it('renders Break badge without inline timer when isBreak is true', () => {
    renderHeader()

    act(() => {
      useFocusSessionStore.getState().setLifecycle({
        isActive: true,
        isBreak: true,
        isPaused: false
      })
      useFocusSessionStore.getState().setTimer(300, 0, 300)
    })

    expect(screen.getByText('Break')).toBeDefined()
    expect(screen.queryByText('05:00')).toBeNull()
  })
})
