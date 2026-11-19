import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import React, { ReactNode } from 'react'
import { FocusSessionProvider } from '../FocusSessionProvider'
import {
  useFocusSession,
  useFocusSessionActions,
  useFocusSessionState,
  useFocusSessionStore,
  useSessionIsActive,
  useSessionRemainingSeconds
} from '../FocusSessionContext'
import { DailyGoal } from '../../../../shared/types'

// Mock audioEngine to avoid actual Web Audio API instantiation in test
const mockPlayAudio = vi.fn()
const mockPauseAudio = vi.fn()
let mockAudioPlaying = false
let mockUserPaused = false
let mockAudioVersion = 0
const audioListeners = new Set<() => void>()
const notifyAudio = (): void => {
  mockAudioVersion++
  audioListeners.forEach((l) => l())
}

vi.mock('../../lib/audioEngine', () => ({
  playFocusChime: vi.fn(),
  audioEngine: {
    get isUserPaused() {
      return mockUserPaused
    },
    setUserPaused: (p: boolean) => {
      mockUserPaused = p
      notifyAudio()
    }
  },
  useAudioEngine: () => {
    React.useSyncExternalStore(
      (cb) => {
        audioListeners.add(cb)
        return () => {
          audioListeners.delete(cb)
        }
      },
      () => mockAudioVersion
    )
    return {
      playing: mockAudioPlaying,
      userPaused: mockUserPaused,
      systemPlay: () => {
        mockAudioPlaying = true
        notifyAudio()
        mockPlayAudio()
      },
      systemPause: () => {
        mockAudioPlaying = false
        notifyAudio()
        mockPauseAudio()
      },
      play: () => {
        mockAudioPlaying = true
        mockUserPaused = false
        notifyAudio()
        mockPlayAudio()
      },
      pause: () => {
        mockAudioPlaying = false
        mockUserPaused = true
        notifyAudio()
        mockPauseAudio()
      }
    }
  }
}))

// Mock useToast with stable references so tests do not require full ToastProvider tree
const mockToast = {
  success: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn()
}
vi.mock('../../lib/useToast', () => ({
  useToast: () => mockToast
}))

const mockGoal: DailyGoal = {
  id: 'g-focus-1',
  date: '2026-03-01',
  title: 'Deep Architecture Work',
  status: 'planned',
  createdAt: '2026-03-01T10:00:00Z',
  targetMinutes: 30
}

describe('FocusSessionContext', () => {
  beforeEach(() => {
    delete (window as any).api
    mockAudioPlaying = false
    mockUserPaused = false
    mockAudioVersion = 0
    audioListeners.clear()
    vi.clearAllMocks()
  })

  const wrapper = ({ children }: { children: ReactNode }): React.JSX.Element => (
    <FocusSessionProvider>{children}</FocusSessionProvider>
  )

  it('initializes with inactive session defaults', () => {
    const { result } = renderHook(() => useFocusSession(), { wrapper })

    expect(result.current.isActive).toBe(false)
    expect(result.current.isPaused).toBe(false)
    expect(result.current.isBreak).toBe(false)
    expect(result.current.activeGoal).toBeNull()
  })

  it('starts a focus session on a target goal', async () => {
    const { result } = renderHook(() => useFocusSession(), { wrapper })

    await act(async () => {
      await result.current.startFocus(mockGoal, 25)
    })

    expect(result.current.isActive).toBe(true)
    expect(result.current.isPaused).toBe(false)
    expect(result.current.isBreak).toBe(false)
    expect(result.current.activeGoal?.id).toBe('g-focus-1')
    expect(result.current.totalSeconds).toBe(25 * 60)
    expect(result.current.isGoalFocused('g-focus-1')).toBe(true)
  })

  it('pauses and resumes the active focus session', async () => {
    const { result } = renderHook(() => useFocusSession(), { wrapper })

    await act(async () => {
      await result.current.startFocus(mockGoal, 20)
    })

    act(() => {
      result.current.pauseFocus()
    })
    expect(result.current.isPaused).toBe(true)

    act(() => {
      result.current.resumeFocus()
    })
    expect(result.current.isPaused).toBe(false)

    act(() => {
      result.current.togglePause()
    })
    expect(result.current.isPaused).toBe(true)
  })

  it('pauses music when pausing session and resumes music when resuming session', async () => {
    const { result } = renderHook(() => useFocusSession(), { wrapper })

    await act(async () => {
      await result.current.startFocus(mockGoal, 20)
    })
    expect(mockPlayAudio).toHaveBeenCalled()
    expect(mockAudioPlaying).toBe(true)

    // Pause focus session -> music should pause
    act(() => {
      result.current.pauseFocus()
    })
    expect(result.current.isPaused).toBe(true)
    expect(mockPauseAudio).toHaveBeenCalledTimes(1)
    expect(mockAudioPlaying).toBe(false)

    // Resume focus session -> music should resume
    act(() => {
      result.current.resumeFocus()
    })
    expect(result.current.isPaused).toBe(false)
    expect(mockPlayAudio).toHaveBeenCalledTimes(2)
    expect(mockAudioPlaying).toBe(true)
  })

  it('pauses and resumes music via togglePause', async () => {
    const { result } = renderHook(() => useFocusSession(), { wrapper })

    await act(async () => {
      await result.current.startFocus(mockGoal, 20)
    })
    expect(mockAudioPlaying).toBe(true)
    mockPauseAudio.mockClear()
    mockPlayAudio.mockClear()

    // Toggle pause to paused
    act(() => {
      result.current.togglePause()
    })
    expect(result.current.isPaused).toBe(true)
    expect(mockPauseAudio).toHaveBeenCalledTimes(1)

    // Toggle pause to unpaused
    act(() => {
      result.current.togglePause()
    })
    expect(result.current.isPaused).toBe(false)
    expect(mockPlayAudio).toHaveBeenCalledTimes(1)
  })

  it('does not resume music on session resume if music was not playing prior to pause', async () => {
    const { result } = renderHook(() => useFocusSession(), { wrapper })

    await act(async () => {
      await result.current.startFocus(mockGoal, 20)
    })

    // Simulate user muting/stopping music while session is running
    act(() => {
      mockAudioPlaying = false
      notifyAudio()
    })
    mockPlayAudio.mockClear()
    mockPauseAudio.mockClear()

    // Pause session
    act(() => {
      result.current.pauseFocus()
    })
    expect(result.current.isPaused).toBe(true)
    expect(mockPauseAudio).not.toHaveBeenCalled()

    // Resume session
    act(() => {
      result.current.resumeFocus()
    })
    expect(result.current.isPaused).toBe(false)
    expect(mockPlayAudio).not.toHaveBeenCalled()
  })

  it('remembers user pause and does not auto-play ambient music on subsequent session start until user manually plays', async () => {
    const { result } = renderHook(() => useFocusSession(), { wrapper })

    // 1. Start initial focus session: ambient starts playing
    await act(async () => {
      await result.current.startFocus(mockGoal, 20)
    })
    expect(mockPlayAudio).toHaveBeenCalled()
    expect(mockAudioPlaying).toBe(true)

    // 2. User manually pauses songs
    act(() => {
      mockAudioPlaying = false
      mockUserPaused = true
      notifyAudio()
    })
    mockPlayAudio.mockClear()

    // 3. User starts another focus session (e.g. task switch, next session)
    const secondGoal: DailyGoal = {
      ...mockGoal,
      id: 'g-focus-2',
      title: 'Next Task'
    }
    await act(async () => {
      await result.current.startFocus(secondGoal, 20)
    })

    // Ambient audio MUST NOT auto-play again and again!
    expect(mockPlayAudio).not.toHaveBeenCalled()
    expect(mockAudioPlaying).toBe(false)

    // 4. Now user manually plays songs again
    act(() => {
      mockAudioPlaying = false
      mockUserPaused = false
      notifyAudio()
    })

    // 5. User starts a third session: ambient audio plays as user unpaused it
    const thirdGoal: DailyGoal = {
      ...mockGoal,
      id: 'g-focus-3',
      title: 'Third Task'
    }
    await act(async () => {
      await result.current.startFocus(thirdGoal, 20)
    })
    expect(mockPlayAudio).toHaveBeenCalled()
  })

  it('during pause, notes time of green task and starts red timer of pause', async () => {
    const appendSpy = vi.fn().mockResolvedValue(true)
    const submitSpy = vi.fn().mockResolvedValue(true)
    ;(window as any).api = {
      logs: { append: appendSpy },
      scheduler: { submit: submitSpy },
      session: {
        updateTimer: vi.fn(),
        onTogglePause: vi.fn(() => () => {}),
        onSessionUpdate: vi.fn(() => () => {})
      }
    }

    const { result } = renderHook(() => useFocusSession(), { wrapper })

    await act(async () => {
      await result.current.startFocus(mockGoal, 25)
    })

    // Simulate 60 seconds elapsed on the green task
    act(() => {
      useFocusSessionStore.setState({
        secondsElapsed: 60,
        secondsRemaining: 24 * 60
      })
    })

    // Pause focus
    await act(async () => {
      result.current.pauseFocus()
      await Promise.resolve()
    })

    // 1. Noted time of green task into logs
    expect(appendSpy).toHaveBeenCalledTimes(1)
    const loggedEntry = appendSpy.mock.calls[0][1]
    expect(loggedEntry.text).toBe(mockGoal.title)
    expect(loggedEntry.productivity).toBe('productive')
    expect(loggedEntry.durationMinutes).toBe(1)
    expect(loggedEntry.productiveMinutes).toBe(1)
    expect(submitSpy).toHaveBeenCalledTimes(1)

    // 2. Starts red timer of pause
    expect(result.current.isPaused).toBe(true)
    const storeState = useFocusSessionStore.getState()
    expect(storeState.isPaused).toBe(true)
    expect(storeState.pauseStartEpoch).toBeGreaterThan(0)
    // Remaining time preserved for green task remainder
    expect(storeState.secondsRemaining).toBe(24 * 60)
  })

  it('adds minutes to the running timer', async () => {
    const { result } = renderHook(() => useFocusSession(), { wrapper })

    await act(async () => {
      await result.current.startFocus(mockGoal, 10)
    })

    const initialTotal = result.current.totalSeconds

    act(() => {
      result.current.addMinutes(5)
    })

    expect(result.current.totalSeconds).toBe(initialTotal + 5 * 60)
  })

  it('updates running focus timer when defaultIntervalMinutes changes from settings', async () => {
    let currentInterval = 45
    const dynamicWrapper = ({ children }: { children: ReactNode }): React.JSX.Element => (
      <FocusSessionProvider defaultIntervalMinutes={currentInterval}>
        {children}
      </FocusSessionProvider>
    )

    const { result, rerender } = renderHook(() => useFocusSession(), {
      wrapper: dynamicWrapper
    })

    await act(async () => {
      await result.current.startFocus(mockGoal)
    })

    expect(result.current.isActive).toBe(true)
    expect(result.current.totalSeconds).toBe(45 * 60)
    expect(result.current.secondsRemaining).toBe(45 * 60)

    // User changes timer in settings from 45 to 15 min
    currentInterval = 15
    rerender()

    expect(result.current.totalSeconds).toBe(15 * 60)
    expect(result.current.secondsRemaining).toBe(15 * 60)
  })

  it('starts break mode and ensures session is active', async () => {
    const { result } = renderHook(() => useFocusSession(), { wrapper })

    await act(async () => {
      await result.current.startBreak(5)
    })

    expect(result.current.isActive).toBe(true)
    expect(result.current.isBreak).toBe(true)
    expect(result.current.isPaused).toBe(false)
    expect(result.current.activeGoal).toBeNull()
    expect(result.current.totalSeconds).toBe(5 * 60)
  })

  it('saves active focus time before switching to break mode', async () => {
    vi.useFakeTimers()
    const mockAppendLog = vi.fn().mockResolvedValue(true)
    const mockSubmit = vi.fn()
    const mockRefresh = vi.fn().mockResolvedValue(undefined)
    ;(window as any).api = {
      logs: {
        append: mockAppendLog
      },
      scheduler: {
        submit: mockSubmit
      },
      session: {
        updateTimer: vi.fn(),
        onTogglePause: vi.fn(),
        onSessionUpdate: vi.fn()
      }
    }

    const customWrapper = ({ children }: { children: ReactNode }): React.JSX.Element => (
      <FocusSessionProvider onDataRefresh={mockRefresh}>{children}</FocusSessionProvider>
    )

    const { result } = renderHook(() => useFocusSession(), { wrapper: customWrapper })

    await act(async () => {
      await result.current.startFocus(mockGoal, 25)
    })

    // Advance state to simulate 60s elapsed
    act(() => {
      vi.advanceTimersByTime(60000)
    })

    await act(async () => {
      await result.current.startBreak(5)
    })

    expect(mockAppendLog).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        goalId: mockGoal.id,
        goalTitle: mockGoal.title,
        durationMinutes: 1
      })
    )
    expect(mockSubmit).toHaveBeenCalled()
    expect(mockRefresh).toHaveBeenCalled()

    expect(result.current.isActive).toBe(true)
    expect(result.current.isBreak).toBe(true)
    expect(result.current.activeGoal).toBeNull()
    vi.useRealTimers()
  })

  it('auto-saves active focus session and notifies scheduler when switching to a different goal', async () => {
    vi.useFakeTimers()
    const mockAppendLog = vi.fn().mockResolvedValue(true)
    const mockSubmit = vi.fn()
    const mockRefresh = vi.fn().mockResolvedValue(undefined)
    ;(window as any).api = {
      logs: {
        append: mockAppendLog
      },
      scheduler: {
        submit: mockSubmit
      },
      session: {
        updateTimer: vi.fn(),
        onTogglePause: vi.fn(),
        onSessionUpdate: vi.fn()
      }
    }

    const goalB: DailyGoal = {
      id: 'g-focus-2',
      date: '2026-03-01',
      title: 'Second Goal in Progress',
      status: 'planned',
      createdAt: '2026-03-01T10:00:00Z',
      targetMinutes: 20
    }

    const customWrapper = ({ children }: { children: ReactNode }): React.JSX.Element => (
      <FocusSessionProvider onDataRefresh={mockRefresh}>{children}</FocusSessionProvider>
    )

    const { result } = renderHook(() => useFocusSession(), { wrapper: customWrapper })

    await act(async () => {
      await result.current.startFocus(mockGoal, 25)
    })

    // Advance state to simulate 60s elapsed
    act(() => {
      vi.advanceTimersByTime(60000)
    })

    await act(async () => {
      await result.current.startFocus(goalB, 20)
    })

    expect(mockAppendLog).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        goalId: mockGoal.id,
        goalTitle: mockGoal.title,
        durationMinutes: 1
      })
    )
    expect(mockSubmit).toHaveBeenCalled()
    expect(mockRefresh).toHaveBeenCalled()

    expect(result.current.isActive).toBe(true)
    expect(result.current.isBreak).toBe(false)
    expect(result.current.activeGoal?.id).toBe(goalB.id)
    vi.useRealTimers()
  })

  it('broadcasts UpdateSessionTimer IPC events on start, pause, resume, and break', async () => {
    const mockUpdateTimer = vi.fn()
    ;(window as any).api = {
      session: {
        updateTimer: mockUpdateTimer,
        onTogglePause: vi.fn(),
        onSessionUpdate: vi.fn()
      }
    }

    const { result } = renderHook(() => useFocusSession(), { wrapper })

    await act(async () => {
      await result.current.startFocus(mockGoal, 25)
    })

    expect(mockUpdateTimer).toHaveBeenCalledWith(
      expect.objectContaining({
        isActive: true,
        isPaused: false,
        isBreak: false,
        goalTitle: 'Deep Architecture Work',
        secondsRemaining: 25 * 60,
        totalSeconds: 25 * 60
      })
    )

    act(() => {
      result.current.pauseFocus()
    })

    expect(mockUpdateTimer).toHaveBeenCalledWith(
      expect.objectContaining({
        isActive: true,
        isPaused: true
      })
    )

    act(() => {
      result.current.startBreak(10)
    })

    expect(mockUpdateTimer).toHaveBeenCalledWith(
      expect.objectContaining({
        isActive: true,
        isBreak: true,
        secondsRemaining: 10 * 60,
        totalSeconds: 10 * 60
      })
    )
  })

  it('starts focus on available goal when remote onTogglePause is received while inactive', async () => {
    let remoteToggleCallback: (() => void) | null = null
    ;(window as any).api = {
      session: {
        updateTimer: vi.fn(),
        onTogglePause: vi.fn((cb) => {
          remoteToggleCallback = cb
          return () => {}
        }),
        onSessionUpdate: vi.fn()
      }
    }

    const { result } = renderHook(() => useFocusSession(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <FocusSessionProvider availableGoals={[mockGoal]}>{children}</FocusSessionProvider>
      )
    })

    expect(result.current.isActive).toBe(false)

    await act(async () => {
      remoteToggleCallback?.()
    })

    expect(result.current.isActive).toBe(true)
    expect(result.current.activeGoal?.id).toBe(mockGoal.id)
    expect(result.current.isPaused).toBe(false)
  })

  it('does not insert synthetic goal when remote onTogglePause is received with no available goals', async () => {
    let remoteToggleCallback: (() => void) | null = null
    const mockAddGoal = vi.fn()
    ;(window as any).api = {
      session: {
        updateTimer: vi.fn(),
        onTogglePause: vi.fn((cb) => {
          remoteToggleCallback = cb
          return () => {}
        }),
        onSessionUpdate: vi.fn()
      },
      goals: {
        add: mockAddGoal
      }
    }

    const { result } = renderHook(() => useFocusSession(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <FocusSessionProvider availableGoals={[]}>{children}</FocusSessionProvider>
      )
    })

    expect(result.current.isActive).toBe(false)

    await act(async () => {
      remoteToggleCallback?.()
    })

    expect(result.current.isActive).toBe(false)
    expect(mockAddGoal).not.toHaveBeenCalled()
  })

  it('useFocusSessionActions provides stable actions context that does not churn on 1-second ticks', async () => {
    vi.useFakeTimers()
    const { result } = renderHook(
      () => ({
        session: useFocusSession(),
        actions: useFocusSessionActions()
      }),
      { wrapper }
    )

    expect(typeof result.current.actions.startFocus).toBe('function')
    expect(typeof result.current.actions.togglePause).toBe('function')
    expect(typeof result.current.actions.isGoalFocused).toBe('function')

    await act(async () => {
      await result.current.actions.startFocus(mockGoal, 25)
    })

    const initialActions = result.current.actions

    // Session is active and tracking goal
    expect(result.current.session.isActive).toBe(true)
    expect(result.current.actions.isGoalFocused(mockGoal.id)).toBe(true)

    // Verify actions references remain stable
    expect(result.current.actions.startFocus).toBe(initialActions.startFocus)
    expect(result.current.actions.togglePause).toBe(initialActions.togglePause)
    expect(result.current.actions.openZenMode).toBe(initialActions.openZenMode)
    expect(result.current.actions.completeTask).toBe(initialActions.completeTask)
    expect(result.current.actions.endSession).toBe(initialActions.endSession)
    expect(result.current.actions.startBreak).toBe(initialActions.startBreak)

    // Advance timers by multiple ticks
    act(() => {
      vi.advanceTimersByTime(2000)
    })

    // Actions object and callbacks MUST remain reference equal across timer ticks
    expect(result.current.actions.completeTask).toBe(initialActions.completeTask)
    expect(result.current.actions.endSession).toBe(initialActions.endSession)

    vi.useRealTimers()
  })

  it('synchronizes activeGoal with updated availableGoals when title or metadata changes', async () => {
    let goals = [mockGoal]
    const { result, rerender } = renderHook(
      () => ({
        session: useFocusSession(),
        state: useFocusSessionState()
      }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <FocusSessionProvider availableGoals={goals}>{children}</FocusSessionProvider>
        )
      }
    )

    await act(async () => {
      await result.current.session.startFocus(mockGoal, 25)
    })

    expect(result.current.state.activeGoal?.title).toBe('Deep Architecture Work')

    // Simulate goal edit from board
    goals = [{ ...mockGoal, title: 'Updated Goal Title from Planner', targetMinutes: 45 }]
    rerender()

    expect(result.current.state.activeGoal?.title).toBe('Updated Goal Title from Planner')
    expect(result.current.state.activeGoal?.targetMinutes).toBe(45)
  })

  it('notifies scheduler via window.api.scheduler.submit on completeTask and endSession', async () => {
    const appendSpy = vi.fn().mockResolvedValue({})
    const submitSpy = vi.fn()
    ;(window as any).api = {
      logs: { append: appendSpy },
      scheduler: { submit: submitSpy }
    }

    const { result } = renderHook(() => useFocusSession(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <FocusSessionProvider dayCutoffHour={4}>{children}</FocusSessionProvider>
      )
    })

    await act(async () => {
      await result.current.startFocus(mockGoal, 25)
    })

    await act(async () => {
      await result.current.completeTask()
    })

    expect(submitSpy).toHaveBeenCalled()
    expect(appendSpy).toHaveBeenCalled()
  })

  it('restores in-flight focus session from main process and initializes timer and goal', async () => {
    ;(window as any).api = {
      session: {
        getState: vi.fn().mockResolvedValue({
          isActive: true,
          isPaused: false,
          isBreak: false,
          totalSeconds: 1500,
          secondsRemaining: 1200,
          goalId: 'g-focus-1',
          goalTitle: 'Deep Architecture Work'
        }),
        updateTimer: vi.fn(),
        onTogglePause: vi.fn(() => () => {}),
        onSessionUpdate: vi.fn(() => () => {})
      }
    }

    const { result } = renderHook(() => useFocusSession(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <FocusSessionProvider availableGoals={[mockGoal]}>{children}</FocusSessionProvider>
      )
    })

    // Wait for the async getState effect to resolve
    await act(async () => {
      await Promise.resolve()
    })

    expect(result.current.isActive).toBe(true)
    expect(result.current.totalSeconds).toBe(1500)
    expect(result.current.secondsRemaining).toBe(1200)
    expect(result.current.secondsElapsed).toBe(300)
    expect(result.current.activeGoal?.id).toBe('g-focus-1')
  })

  it('persists active focus session note and state to api.session and clears upon session completion', async () => {
    let latestUpdatedSession: any = null
    ;(window as any).api = {
      session: {
        updateTimer: vi.fn((payload) => {
          latestUpdatedSession = payload
        }),
        getState: vi.fn().mockResolvedValue(null),
        onTogglePause: vi.fn(() => () => {}),
        onSessionUpdate: vi.fn(() => () => {})
      }
    }

    const { result } = renderHook(() => useFocusSession(), { wrapper })

    await act(async () => {
      await result.current.startFocus(mockGoal, 25)
    })

    act(() => {
      result.current.setSessionNote('Implemented indexing optimization')
    })

    expect(latestUpdatedSession).toBeTruthy()
    expect(latestUpdatedSession.isActive).toBe(true)
    expect(latestUpdatedSession.sessionNote).toBe('Implemented indexing optimization')
    expect(latestUpdatedSession.goalId).toBe('g-focus-1')

    await act(async () => {
      await result.current.completeTask()
    })

    expect(latestUpdatedSession.isActive).toBe(false)
  })

  it('decouples timer ticks from lifecycle state so lifecycle consumers do not churn', async () => {
    vi.useFakeTimers()
    let lifecycleRenderCount = 0

    const { result } = renderHook(
      () => {
        const lifecycle = useFocusSessionState()
        lifecycleRenderCount++
        return lifecycle
      },
      { wrapper }
    )

    // Initial render
    expect(lifecycleRenderCount).toBe(1)
    expect(result.current.isActive).toBe(false)

    // Advance timers - inactive session should not cause ticks or renders
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(lifecycleRenderCount).toBe(1)

    vi.useRealTimers()
  })

  it('restores in-flight paused session preserving pauseStartEpoch', async () => {
    const startedAt = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    const pauseStartEpoch = Date.now() - 10 * 60 * 1000
    ;(window as any).api = {
      session: {
        updateTimer: vi.fn(),
        onTogglePause: vi.fn(() => () => {}),
        getState: vi.fn().mockResolvedValue({
          isActive: true,
          isPaused: true,
          isBreak: false,
          totalSeconds: 25 * 60,
          secondsRemaining: 20 * 60,
          startedAt,
          pauseStartEpoch,
          accumulatedPausedMs: 0
        })
      }
    }

    const { result } = renderHook(() => useFocusSession(), { wrapper })

    await waitFor(() => {
      expect(result.current.isActive).toBe(true)
      expect(result.current.isPaused).toBe(true)
    })
  })

  it('reactively updates timer, overtime, and goals from authoritative onSessionUpdate IPC stream', async () => {
    let sessionUpdateCb: ((payload: any) => void) | null = null
    ;(window as any).api = {
      session: {
        updateTimer: vi.fn(),
        onTogglePause: vi.fn(() => () => {}),
        getState: vi.fn().mockResolvedValue(null),
        onSessionUpdate: vi.fn((cb) => {
          sessionUpdateCb = cb
          return () => {}
        })
      }
    }

    const { result } = renderHook(() => useFocusSession(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <FocusSessionProvider availableGoals={[mockGoal]}>{children}</FocusSessionProvider>
      )
    })

    expect(result.current.isActive).toBe(false)
    expect(sessionUpdateCb).toBeTruthy()

    // Simulate incoming tick from SessionService in Main Process
    act(() => {
      sessionUpdateCb?.({
        isActive: true,
        isPaused: false,
        isBreak: false,
        isOvertime: false,
        totalSeconds: 1500,
        secondsRemaining: 1450,
        goalId: 'g-focus-1',
        goalTitle: 'Deep Architecture Work',
        startedAt: new Date(Date.now() - 50 * 1000).toISOString()
      })
    })

    expect(result.current.isActive).toBe(true)
    expect(result.current.totalSeconds).toBe(1500)
    expect(result.current.secondsRemaining).toBe(1450)
    expect(result.current.secondsElapsed).toBe(50)
    expect(result.current.activeGoal?.id).toBe('g-focus-1')

    // Simulate session ended by SessionService
    act(() => {
      sessionUpdateCb?.({
        isActive: false,
        isPaused: false,
        isBreak: false,
        totalSeconds: 0,
        secondsRemaining: 0
      })
    })

    expect(result.current.isActive).toBe(false)
    expect(result.current.activeGoal).toBeNull()
  })

  it('provides fine-grained reactivity via useFocusSessionStore and atomic selectors', async () => {
    const { result } = renderHook(
      () => ({
        session: useFocusSession(),
        isActive: useSessionIsActive(),
        remaining: useSessionRemainingSeconds(),
        storeState: useFocusSessionStore()
      }),
      { wrapper }
    )

    expect(result.current.isActive).toBe(false)

    await act(async () => {
      await result.current.session.startFocus(mockGoal, 20)
    })

    expect(result.current.isActive).toBe(true)
    expect(result.current.storeState.isActive).toBe(true)
    expect(result.current.remaining).toBe(20 * 60)
    expect(result.current.storeState.activeGoal?.id).toBe(mockGoal.id)

    act(() => {
      result.current.storeState.setIsZenOpen(true)
    })

    expect(useFocusSessionStore.getState().isZenOpen).toBe(true)

    await act(async () => {
      await result.current.session.endSession()
    })

    expect(result.current.isActive).toBe(false)
    expect(useFocusSessionStore.getState().isActive).toBe(false)
  })

  it('completeTask pauses at 00:00 without runaway overtime and logs post-session duration as break', async () => {
    vi.useFakeTimers()
    const appendSpy = vi.fn().mockResolvedValue({})
    const submitSpy = vi.fn()
    ;(window as any).api = {
      logs: { append: appendSpy },
      scheduler: { submit: submitSpy },
      session: {
        updateTimer: vi.fn(),
        onTogglePause: vi.fn(),
        onSessionUpdate: vi.fn()
      }
    }

    const { result } = renderHook(() => useFocusSession(), { wrapper })

    await act(async () => {
      await result.current.startFocus(mockGoal, 25)
    })

    // Advance by 42 minutes (25m planned + 17m paused at 00:00)
    act(() => {
      vi.advanceTimersByTime(42 * 60 * 1000)
    })

    await act(async () => {
      await result.current.completeTask()
    })

    // Task log should be 25m planned session
    expect(appendSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        goalId: mockGoal.id,
        goalTitle: mockGoal.title,
        productivity: 'productive',
        durationMinutes: 25,
        productiveMinutes: 25
      })
    )

    // Break log should be 17m pause duration
    expect(appendSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        text: 'Break',
        productivity: 'break',
        durationMinutes: 17,
        productiveMinutes: 0
      }),
      false
    )

    expect(result.current.isActive).toBe(false)
    expect(useFocusSessionStore.getState().isActive).toBe(false)
    vi.useRealTimers()
  })

  it('endSession pauses at 00:00 without runaway overtime and logs post-session duration as break', async () => {
    vi.useFakeTimers()
    const appendSpy = vi.fn().mockResolvedValue({})
    const submitSpy = vi.fn()
    ;(window as any).api = {
      logs: { append: appendSpy },
      scheduler: { submit: submitSpy },
      session: {
        updateTimer: vi.fn(),
        onTogglePause: vi.fn(),
        onSessionUpdate: vi.fn()
      }
    }

    const { result } = renderHook(() => useFocusSession(), { wrapper })

    await act(async () => {
      await result.current.startFocus(mockGoal, 25)
    })

    // Advance by 42 minutes (25m planned + 17m paused at 00:00)
    act(() => {
      vi.advanceTimersByTime(42 * 60 * 1000)
    })

    await act(async () => {
      await result.current.endSession()
    })

    // Task log should be 25m
    expect(appendSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        goalId: mockGoal.id,
        goalTitle: mockGoal.title,
        productivity: 'productive',
        durationMinutes: 25,
        productiveMinutes: 25
      })
    )

    // Break log should be 17m
    expect(appendSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        text: 'Break',
        productivity: 'break',
        durationMinutes: 17,
        productiveMinutes: 0
      }),
      false
    )

    expect(result.current.isActive).toBe(false)
    expect(useFocusSessionStore.getState().isActive).toBe(false)
    vi.useRealTimers()
  })

  it('automatically starts focus timer when a task is moved to in_progress', async () => {
    let goals: DailyGoal[] = [{ ...mockGoal, status: 'planned' }]
    const { result, rerender } = renderHook(
      () => ({
        session: useFocusSession(),
        state: useFocusSessionState()
      }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <FocusSessionProvider availableGoals={goals}>{children}</FocusSessionProvider>
        )
      }
    )

    expect(result.current.state.isActive).toBe(false)

    // Move task to in_progress
    goals = [{ ...mockGoal, status: 'in_progress' }]
    await act(async () => {
      rerender()
      await Promise.resolve()
    })

    expect(result.current.state.isActive).toBe(true)
    expect(result.current.state.activeGoal?.id).toBe(mockGoal.id)
    expect(result.current.state.isPaused).toBe(false)
  })

  it('automatically stops focus timer when in_progress task is moved to planned', async () => {
    let goals: DailyGoal[] = [{ ...mockGoal, status: 'in_progress' }]
    const { result, rerender } = renderHook(
      () => ({
        session: useFocusSession(),
        state: useFocusSessionState()
      }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <FocusSessionProvider availableGoals={goals}>{children}</FocusSessionProvider>
        )
      }
    )

    // On mount with in_progress task, it auto-starts
    await act(async () => {
      await Promise.resolve()
    })
    expect(result.current.state.isActive).toBe(true)
    expect(result.current.state.activeGoal?.id).toBe(mockGoal.id)

    // Move task from in_progress to planned
    goals = [{ ...mockGoal, status: 'planned' }]
    await act(async () => {
      rerender()
      await Promise.resolve()
    })

    expect(result.current.state.isActive).toBe(false)
    expect(useFocusSessionStore.getState().isActive).toBe(false)
  })

  it('automatically stops focus timer when in_progress task is moved to done', async () => {
    let goals: DailyGoal[] = [{ ...mockGoal, status: 'in_progress' }]
    const { result, rerender } = renderHook(
      () => ({
        session: useFocusSession(),
        state: useFocusSessionState()
      }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <FocusSessionProvider availableGoals={goals}>{children}</FocusSessionProvider>
        )
      }
    )

    await act(async () => {
      await Promise.resolve()
    })
    expect(result.current.state.isActive).toBe(true)

    // Move task from in_progress to done
    goals = [{ ...mockGoal, status: 'done', completedAt: new Date().toISOString() }]
    await act(async () => {
      rerender()
      await Promise.resolve()
    })

    expect(result.current.state.isActive).toBe(false)
  })

  it('automatically switches timer to next in-progress task when active in-progress task is completed', async () => {
    const goal2: DailyGoal = {
      id: 'g-focus-2',
      date: '2026-03-01',
      title: 'Second in-progress task',
      status: 'in_progress',
      createdAt: '2026-03-01T11:00:00Z',
      sortOrder: 2000
    }
    let goals: DailyGoal[] = [{ ...mockGoal, status: 'in_progress', sortOrder: 1000 }, goal2]
    const { result, rerender } = renderHook(
      () => ({
        session: useFocusSession(),
        state: useFocusSessionState()
      }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <FocusSessionProvider availableGoals={goals}>{children}</FocusSessionProvider>
        )
      }
    )

    await act(async () => {
      await Promise.resolve()
    })
    expect(result.current.state.isActive).toBe(true)
    expect(result.current.state.activeGoal?.id).toBe(mockGoal.id)

    // Complete the first task; second task remains in_progress
    goals = [
      { ...mockGoal, status: 'done', completedAt: new Date().toISOString(), sortOrder: 1000 },
      goal2
    ]
    await act(async () => {
      rerender()
      await Promise.resolve()
    })

    expect(result.current.state.isActive).toBe(true)
    expect(result.current.state.activeGoal?.id).toBe(goal2.id)
  })

  it('restarts focus session from starting on restart-session quick action', async () => {
    let quickActionCallback: ((action: string) => void) | null = null
    ;(window as any).api = {
      session: {
        updateTimer: vi.fn(),
        onQuickAction: vi.fn().mockImplementation((cb) => {
          quickActionCallback = cb
          return () => {}
        })
      }
    }

    const inProgressGoal: DailyGoal = {
      id: 'g-restart-1',
      date: '2026-03-01',
      title: 'Task to restart',
      status: 'in_progress',
      createdAt: '2026-03-01T10:00:00Z',
      sortOrder: 1000
    }

    const { result } = renderHook(
      () => ({
        session: useFocusSession()
      }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <FocusSessionProvider availableGoals={[inProgressGoal]} defaultIntervalMinutes={45}>
            {children}
          </FocusSessionProvider>
        )
      }
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(result.current.session.isActive).toBe(true)
    expect(result.current.session.totalSeconds).toBe(2700)

    // Trigger restart-session quick action
    expect(quickActionCallback).not.toBeNull()
    await act(async () => {
      quickActionCallback!('restart-session')
      await Promise.resolve()
    })

    expect(result.current.session.isActive).toBe(true)
    expect(result.current.session.isPaused).toBe(false)
    expect(result.current.session.secondsRemaining).toBe(2700)
    expect(result.current.session.secondsElapsed).toBe(0)
    expect(result.current.session.activeGoal?.id).toBe(inProgressGoal.id)
  })

  it('moves active task back to planned mid-session: discards if < 1 minute and switches to next in-progress task', async () => {
    const mockAppendLog = vi.fn()
    ;(window as any).api = {
      logs: { append: mockAppendLog },
      scheduler: { submit: vi.fn() },
      session: { updateTimer: vi.fn(), onSessionUpdate: vi.fn() }
    }

    const task1: DailyGoal = {
      id: 'task-1',
      date: '2026-11-06',
      title: 'Task 1',
      status: 'in_progress',
      createdAt: '2026-11-06T09:00:00Z',
      sortOrder: 1000
    }
    const task2: DailyGoal = {
      id: 'task-2',
      date: '2026-11-06',
      title: 'Task 2',
      status: 'in_progress',
      createdAt: '2026-11-06T09:05:00Z',
      sortOrder: 2000
    }

    let goals: DailyGoal[] = [task1, task2]
    const { result, rerender } = renderHook(
      () => ({
        session: useFocusSession(),
        state: useFocusSessionState()
      }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <FocusSessionProvider availableGoals={goals}>{children}</FocusSessionProvider>
        )
      }
    )

    await act(async () => {
      await Promise.resolve()
    })
    // Top-most task task-1 is tracked by default
    expect(result.current.state.isActive).toBe(true)
    expect(result.current.state.activeGoal?.id).toBe(task1.id)

    // Simulate working for 30s (< 1 min)
    act(() => {
      useFocusSessionStore.setState({ secondsElapsed: 30 })
    })

    // Move task1 back to planned mid-session
    goals = [{ ...task1, status: 'planned' }, task2]
    await act(async () => {
      rerender()
      await Promise.resolve()
    })

    // Elapsed was < 60s -> discarded (no log appended)
    expect(mockAppendLog).not.toHaveBeenCalled()
    // Timer automatically switches to next task (task2) and starts
    expect(result.current.state.isActive).toBe(true)
    expect(result.current.state.activeGoal?.id).toBe(task2.id)
  })

  it('moves active task back to planned mid-session: logs partial time if >= 1 minute and stops if no in-progress tasks remain', async () => {
    const mockAppendLog = vi.fn().mockResolvedValue(true)
    ;(window as any).api = {
      logs: { append: mockAppendLog },
      scheduler: { submit: vi.fn() },
      session: { updateTimer: vi.fn(), onSessionUpdate: vi.fn() }
    }

    const task1: DailyGoal = {
      id: 'task-single',
      date: '2026-11-06',
      title: 'Single Task',
      status: 'in_progress',
      createdAt: '2026-11-06T09:00:00Z',
      sortOrder: 1000
    }

    let goals: DailyGoal[] = [task1]
    const { result, rerender } = renderHook(
      () => ({
        session: useFocusSession(),
        state: useFocusSessionState()
      }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <FocusSessionProvider availableGoals={goals}>{children}</FocusSessionProvider>
        )
      }
    )

    await act(async () => {
      await Promise.resolve()
    })
    expect(result.current.state.isActive).toBe(true)

    // Simulate working for 90s (>= 1 min)
    act(() => {
      useFocusSessionStore.setState({ secondsElapsed: 90 })
    })

    // Move task1 back to planned mid-session (now 0 in-progress tasks)
    goals = [{ ...task1, status: 'planned' }]
    await act(async () => {
      rerender()
      await Promise.resolve()
    })

    // Partial time was >= 1 min -> logged!
    expect(mockAppendLog).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        text: 'Single Task',
        durationMinutes: 2,
        productiveMinutes: 2
      })
    )
    // Section became empty (0 tasks) -> stops and waits in idle
    expect(result.current.state.isActive).toBe(false)
    expect(result.current.state.activeGoal).toBeNull()
  })

  it('reordering tasks in progress preserves active session without switching tasks', async () => {
    const mockAppendLog = vi.fn().mockResolvedValue(true)
    ;(window as any).api = {
      logs: { append: mockAppendLog },
      scheduler: { submit: vi.fn() },
      session: { updateTimer: vi.fn(), onSessionUpdate: vi.fn() }
    }

    const taskA: DailyGoal = {
      id: 'task-a',
      date: '2026-11-06',
      title: 'Task A',
      status: 'in_progress',
      createdAt: '2026-11-06T09:00:00Z',
      sortOrder: 1000
    }
    const taskB: DailyGoal = {
      id: 'task-b',
      date: '2026-11-06',
      title: 'Task B',
      status: 'in_progress',
      createdAt: '2026-11-06T09:05:00Z',
      sortOrder: 2000
    }

    let goals: DailyGoal[] = [taskA, taskB]
    const { result, rerender } = renderHook(
      () => ({
        session: useFocusSession(),
        state: useFocusSessionState()
      }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <FocusSessionProvider availableGoals={goals}>{children}</FocusSessionProvider>
        )
      }
    )

    await act(async () => {
      await Promise.resolve()
    })
    // Initially active
    expect(result.current.state.isActive).toBe(true)
    expect(result.current.state.activeGoal?.id).toBe(taskA.id)

    // User reorders tasks: taskB is dragged to the top (sortOrder 500)
    goals = [
      { ...taskB, sortOrder: 500 },
      { ...taskA, sortOrder: 1000 }
    ]
    await act(async () => {
      rerender()
      await Promise.resolve()
    })

    // Active focus does not switch on reordering
    expect(result.current.state.isActive).toBe(true)
    expect(result.current.state.activeGoal?.id).toBe(taskA.id)
  })

  it('deleting active task stops cleanly and switches to next in-progress task', async () => {
    const task1: DailyGoal = {
      id: 'task-del-1',
      date: '2026-11-06',
      title: 'Task to Delete',
      status: 'in_progress',
      createdAt: '2026-11-06T09:00:00Z',
      sortOrder: 1000
    }
    const task2: DailyGoal = {
      id: 'task-del-2',
      date: '2026-11-06',
      title: 'Remaining Task',
      status: 'in_progress',
      createdAt: '2026-11-06T09:05:00Z',
      sortOrder: 2000
    }

    let goals: DailyGoal[] = [task1, task2]
    const { result, rerender } = renderHook(
      () => ({
        session: useFocusSession(),
        state: useFocusSessionState()
      }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <FocusSessionProvider availableGoals={goals}>{children}</FocusSessionProvider>
        )
      }
    )

    await act(async () => {
      await Promise.resolve()
    })
    expect(result.current.state.activeGoal?.id).toBe(task1.id)

    // Delete task1 (removed from goals list)
    goals = [task2]
    await act(async () => {
      rerender()
      await Promise.resolve()
    })

    // Timer switches cleanly to task2
    expect(result.current.state.isActive).toBe(true)
    expect(result.current.state.activeGoal?.id).toBe(task2.id)
  })

  it('resumes focus timer when an accidentally completed task is moved back to in_progress', async () => {
    const task: DailyGoal = {
      id: 'task-accident',
      date: '2026-11-06',
      title: 'Accidental completion task',
      status: 'in_progress',
      createdAt: '2026-11-06T09:00:00Z',
      sortOrder: 1000
    }

    let goals: DailyGoal[] = [task]
    const { result, rerender } = renderHook(
      () => ({
        session: useFocusSession(),
        state: useFocusSessionState()
      }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <FocusSessionProvider availableGoals={goals}>{children}</FocusSessionProvider>
        )
      }
    )

    await act(async () => {
      await Promise.resolve()
    })
    expect(result.current.state.isActive).toBe(true)
    expect(result.current.state.activeGoal?.id).toBe(task.id)

    // User accidentally moves task to completed
    goals = [{ ...task, status: 'done', completedAt: new Date().toISOString() }]
    await act(async () => {
      rerender()
      await Promise.resolve()
    })

    // Timer stopped
    expect(result.current.state.isActive).toBe(false)

    // User drags/moves task back to in_progress (clearing completed status)
    goals = [{ ...task, status: 'in_progress', completedAt: undefined }]
    await act(async () => {
      rerender()
      await Promise.resolve()
    })

    // Completed status cleared and timer resumes!
    expect(result.current.state.isActive).toBe(true)
    expect(result.current.state.activeGoal?.id).toBe(task.id)
  })

  it('user can take manual break button: saves focus time worked so far (>= 60s) to timing and starts break timer in red', async () => {
    const appendLogSpy = vi.fn().mockResolvedValue({ id: 'log-1' })
    ;(window as any).api = {
      logs: { append: appendLogSpy },
      scheduler: { submit: vi.fn() },
      session: { updateTimer: vi.fn(), onSessionUpdate: vi.fn() }
    }

    const { result } = renderHook(() => useFocusSession(), { wrapper })

    await act(async () => {
      await result.current.startFocus(mockGoal, 45)
    })

    expect(result.current.isActive).toBe(true)
    expect(result.current.isBreak).toBe(false)
    expect(result.current.activeGoal?.id).toBe(mockGoal.id)

    // Simulate 120 seconds of focus work
    act(() => {
      useFocusSessionStore.getState().setTimer(2700 - 120, 120, 2700)
    })

    // User takes manual break
    await act(async () => {
      await result.current.startBreak(5)
    })

    // Work saved to today's timing!
    expect(appendLogSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        goalId: mockGoal.id,
        durationMinutes: 2,
        productivity: 'productive'
      })
    )

    // Break timer active in red mode
    expect(result.current.isActive).toBe(true)
    expect(result.current.isBreak).toBe(true)
    expect(result.current.totalSeconds).toBe(300)
    expect(result.current.secondsRemaining).toBe(300)
  })

  it('user can click "+5 min" to extend current session', async () => {
    ;(window as any).api = {
      session: { updateTimer: vi.fn(), onSessionUpdate: vi.fn() }
    }

    const { result } = renderHook(() => useFocusSession(), { wrapper })

    await act(async () => {
      await result.current.startFocus(mockGoal, 45)
    })

    expect(result.current.totalSeconds).toBe(2700)
    expect(result.current.secondsRemaining).toBe(2700)

    act(() => {
      result.current.addMinutes(5)
    })

    expect(result.current.totalSeconds).toBe(3000)
    expect(result.current.secondsRemaining).toBe(3000)
  })

  it('pauses timer on remote pause quickAction (e.g. screen lock) and logs pause >= 40s as break on resume', async () => {
    let quickActionHandler: ((action: any) => void) | null = null
    const appendLogSpy = vi.fn().mockResolvedValue({ id: 'break-log' })
    ;(window as any).api = {
      logs: { append: appendLogSpy },
      scheduler: { submit: vi.fn() },
      session: {
        updateTimer: vi.fn(),
        onSessionUpdate: vi.fn(),
        onQuickAction: vi.fn((cb) => {
          quickActionHandler = cb
          return () => {
            quickActionHandler = null
          }
        })
      }
    }

    const { result } = renderHook(() => useFocusSession(), { wrapper })

    await act(async () => {
      await result.current.startFocus(mockGoal, 45)
    })

    expect(result.current.isActive).toBe(true)
    expect(result.current.isPaused).toBe(false)

    // Screen locked event triggers quickAction 'pause'
    act(() => {
      quickActionHandler?.('pause')
    })

    expect(result.current.isPaused).toBe(true)

    // Simulate 45 seconds locked (paused)
    const pauseStart = useFocusSessionStore.getState().pauseStartEpoch
    expect(pauseStart).toBeGreaterThan(0)
    vi.spyOn(Date, 'now').mockReturnValue(pauseStart + 45000)

    // User resumes after unlocking screen
    await act(async () => {
      await result.current.resumeFocus()
    })

    expect(result.current.isPaused).toBe(false)
    expect(appendLogSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        text: 'Break',
        productivity: 'break',
        durationMinutes: 1
      }),
      false
    )

    vi.restoreAllMocks()
  })

  it('counts time with no tasks in progress as break: logs break when >= 60 seconds pass before adding a task to in progress', async () => {
    const appendLogSpy = vi.fn().mockResolvedValue({ id: 'break-log-1' })
    ;(window as any).api = {
      logs: { append: appendLogSpy },
      scheduler: { submit: vi.fn() },
      session: { updateTimer: vi.fn(), onSessionUpdate: vi.fn() }
    }

    const startMs = 1700000000000
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(startMs)

    let goals: DailyGoal[] = [{ ...mockGoal, status: 'planned' }]
    const { result, rerender } = renderHook(
      () => ({
        session: useFocusSession(),
        state: useFocusSessionState()
      }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <FocusSessionProvider availableGoals={goals}>{children}</FocusSessionProvider>
        )
      }
    )

    await act(async () => {
      await Promise.resolve()
    })

    // No tasks in progress -> timer is inactive and break tracking starts
    expect(result.current.state.isActive).toBe(false)
    expect(useFocusSessionStore.getState().emptyInProgressStartEpoch).toBe(startMs)

    // Simulate 120 seconds (2 minutes) elapsing with 0 tasks in progress
    nowSpy.mockReturnValue(startMs + 120000)

    // User moves a task into in_progress
    goals = [{ ...mockGoal, status: 'in_progress' }]
    await act(async () => {
      rerender()
      await Promise.resolve()
    })

    // Break of 2 minutes logged in red to today's timing!
    expect(appendLogSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        text: 'Break',
        productivity: 'break',
        durationMinutes: 2,
        productiveMinutes: 0
      }),
      false
    )

    // Focus timer starts on newly added in-progress task, emptyInProgressStartEpoch cleared
    expect(result.current.state.isActive).toBe(true)
    expect(result.current.state.activeGoal?.id).toBe(mockGoal.id)
    expect(useFocusSessionStore.getState().emptyInProgressStartEpoch).toBe(0)

    nowSpy.mockRestore()
  })

  it('discards trivial break when time with no tasks in progress is under 1 minute (< 60s)', async () => {
    const appendLogSpy = vi.fn().mockResolvedValue({ id: 'break-log-2' })
    ;(window as any).api = {
      logs: { append: appendLogSpy },
      scheduler: { submit: vi.fn() },
      session: { updateTimer: vi.fn(), onSessionUpdate: vi.fn() }
    }

    const startMs = 1700000000000
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(startMs)

    let goals: DailyGoal[] = [{ ...mockGoal, status: 'planned' }]
    const { result, rerender } = renderHook(
      () => ({
        session: useFocusSession(),
        state: useFocusSessionState()
      }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <FocusSessionProvider availableGoals={goals}>{children}</FocusSessionProvider>
        )
      }
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(result.current.state.isActive).toBe(false)
    expect(useFocusSessionStore.getState().emptyInProgressStartEpoch).toBe(startMs)

    // Simulate only 40 seconds elapsing (< 60s)
    nowSpy.mockReturnValue(startMs + 40000)

    // User moves task to in_progress
    goals = [{ ...mockGoal, status: 'in_progress' }]
    await act(async () => {
      rerender()
      await Promise.resolve()
    })

    // Trivial break (< 60s) is discarded to keep timeline clean
    expect(appendLogSpy).not.toHaveBeenCalled()
    expect(result.current.state.isActive).toBe(true)
    expect(useFocusSessionStore.getState().emptyInProgressStartEpoch).toBe(0)

    nowSpy.mockRestore()
  })

  it('counts time as break when active task is moved back to planned and later another task is put in progress', async () => {
    const appendLogSpy = vi.fn().mockResolvedValue({ id: 'log-id' })
    ;(window as any).api = {
      logs: { append: appendLogSpy },
      scheduler: { submit: vi.fn() },
      session: { updateTimer: vi.fn(), onSessionUpdate: vi.fn() }
    }

    const startMs = 1700000000000
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(startMs)

    let goals: DailyGoal[] = [{ ...mockGoal, status: 'in_progress' }]
    const { result, rerender } = renderHook(
      () => ({
        session: useFocusSession(),
        state: useFocusSessionState()
      }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <FocusSessionProvider availableGoals={goals}>{children}</FocusSessionProvider>
        )
      }
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(result.current.state.isActive).toBe(true)

    // Simulate 120s focus work
    act(() => {
      useFocusSessionStore.getState().setTimer(2700 - 120, 120, 2700)
    })

    // User moves task back to planned (0 tasks now in progress)
    const taskPlannedMs = startMs + 120000
    nowSpy.mockReturnValue(taskPlannedMs)

    goals = [{ ...mockGoal, status: 'planned' }]
    await act(async () => {
      rerender()
      await Promise.resolve()
    })

    // Active task focus is logged
    expect(appendLogSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        goalId: mockGoal.id,
        durationMinutes: 2,
        productivity: 'productive'
      })
    )
    expect(result.current.state.isActive).toBe(false)
    expect(useFocusSessionStore.getState().emptyInProgressStartEpoch).toBe(taskPlannedMs)

    // User is idle / waits 180 seconds (3 minutes)
    const newTaskStartMs = taskPlannedMs + 180000
    nowSpy.mockReturnValue(newTaskStartMs)

    // User puts task back into in_progress
    goals = [{ ...mockGoal, status: 'in_progress' }]
    await act(async () => {
      rerender()
      await Promise.resolve()
    })

    // Break of 3 minutes is logged
    expect(appendLogSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        text: 'Break',
        productivity: 'break',
        durationMinutes: 3,
        productiveMinutes: 0
      }),
      false
    )

    expect(result.current.state.isActive).toBe(true)
    expect(useFocusSessionStore.getState().emptyInProgressStartEpoch).toBe(0)

    nowSpy.mockRestore()
  })

  it('counts time as break when active task is deleted and no tasks remain in progress', async () => {
    const appendLogSpy = vi.fn().mockResolvedValue({ id: 'log-del' })
    ;(window as any).api = {
      logs: { append: appendLogSpy },
      scheduler: { submit: vi.fn() },
      session: { updateTimer: vi.fn(), onSessionUpdate: vi.fn() }
    }

    const startMs = 1700000000000
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(startMs)

    let goals: DailyGoal[] = [{ ...mockGoal, status: 'in_progress' }]
    const { result, rerender } = renderHook(
      () => ({
        session: useFocusSession(),
        state: useFocusSessionState()
      }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <FocusSessionProvider availableGoals={goals}>{children}</FocusSessionProvider>
        )
      }
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(result.current.state.isActive).toBe(true)

    // Delete active task
    const delMs = startMs + 10000
    nowSpy.mockReturnValue(delMs)

    goals = [{ ...mockGoal, status: 'in_progress', deletedAt: new Date(delMs).toISOString() }]
    await act(async () => {
      rerender()
      await Promise.resolve()
    })

    expect(result.current.state.isActive).toBe(false)
    expect(useFocusSessionStore.getState().emptyInProgressStartEpoch).toBe(delMs)

    // 90 seconds pass with 0 tasks in progress
    const nextTaskMs = delMs + 90000
    nowSpy.mockReturnValue(nextTaskMs)

    const goal2: DailyGoal = {
      id: 'g-focus-2',
      date: '2026-03-01',
      title: 'Second Task',
      status: 'in_progress',
      createdAt: '2026-03-01T10:05:00Z',
      targetMinutes: 30
    }
    goals = [goals[0], goal2]

    await act(async () => {
      rerender()
      await Promise.resolve()
    })

    // Break of 2 minutes (rounded from 90s) is logged
    expect(appendLogSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        text: 'Break',
        productivity: 'break',
        durationMinutes: 2,
        productiveMinutes: 0
      }),
      false
    )
    expect(result.current.state.isActive).toBe(true)
    expect(result.current.state.activeGoal?.id).toBe(goal2.id)

    nowSpy.mockRestore()
  })

  it('waits for authoritative session getState to hydrate before syncTimerWithInProgressTasks runs', async () => {
    const existingGoal: DailyGoal = {
      id: 'existing-task-id',
      date: '2026-03-01',
      title: 'Active In Progress Task',
      status: 'in_progress',
      createdAt: '2026-03-01T09:00:00Z',
      targetMinutes: 45
    }

    let resolveSessionGetState: (val: any) => void = () => {}
    const sessionGetStatePromise = new Promise((resolve) => {
      resolveSessionGetState = resolve
    })

    const originalApi = (window as any).api
    ;(window as any).api = {
      ...originalApi,
      session: {
        getState: vi.fn().mockImplementation(() => sessionGetStatePromise),
        updateTimer: vi.fn(),
        onSessionUpdate: vi.fn().mockReturnValue(() => {})
      }
    }

    const { result, unmount } = renderHook(
      () => ({
        state: useFocusSessionState(),
        store: useFocusSessionStore()
      }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <FocusSessionProvider availableGoals={[existingGoal]}>{children}</FocusSessionProvider>
        )
      }
    )

    // While session hydration is pending, syncTimerWithInProgressTasks has NOT executed
    // and emptyInProgressStartEpoch is 0
    expect(result.current.store.isHydrated).toBe(false)
    expect(result.current.store.emptyInProgressStartEpoch).toBe(0)

    // Now resolve the in-flight authoritative session state
    const authoritativeStartedAt = new Date(Date.now() - 300 * 1000).toISOString()
    await act(async () => {
      resolveSessionGetState({
        isActive: true,
        isPaused: false,
        isBreak: false,
        isOvertime: false,
        totalSeconds: 2700,
        secondsRemaining: 2400,
        goalId: existingGoal.id,
        goalTitle: existingGoal.title,
        startedAt: authoritativeStartedAt
      })
      await Promise.resolve()
    })

    // After hydration resolves, state matches authoritative session without premature restart or break
    expect(result.current.store.isHydrated).toBe(true)
    expect(result.current.state.isActive).toBe(true)
    expect(result.current.state.activeGoal?.id).toBe(existingGoal.id)
    expect(result.current.store.secondsRemaining).toBe(2400)
    expect(result.current.store.startedAt).toBe(authoritativeStartedAt)
    expect(result.current.store.emptyInProgressStartEpoch).toBe(0)

    unmount()
    ;(window as any).api = originalApi
  })
})
