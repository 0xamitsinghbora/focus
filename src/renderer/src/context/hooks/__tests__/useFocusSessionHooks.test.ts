import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTaskbarBadge, useFocusSessionAudio, useFocusSessionTimerEngine } from '../index'

// Mock audioEngine
const mockPlay = vi.fn()
const mockPause = vi.fn()
const mockPlayFocusChime = vi.fn()
vi.mock('../../../lib/audioEngine', () => ({
  playFocusChime: (...args: unknown[]) => mockPlayFocusChime(...args),
  useAudioEngine: () => ({
    playing: false,
    play: mockPlay,
    pause: mockPause
  })
}))

describe('useTaskbarBadge', () => {
  beforeEach(() => {
    delete (window as any).api
  })

  it('broadcasts inactive session payload when active is false', () => {
    const updateTimer = vi.fn()
    ;(window as any).api = { session: { updateTimer } }

    const { result } = renderHook(() => useTaskbarBadge())
    result.current.broadcastTaskbarTimer(false, false, false, 0, 0, null)

    expect(updateTimer).toHaveBeenCalledWith({
      isActive: false,
      isPaused: false,
      isBreak: false,
      isOvertime: false,
      secondsRemaining: 0,
      totalSeconds: 0
    })
  })

  it('broadcasts active focus session payload with formatted metadata', () => {
    const updateTimer = vi.fn()
    ;(window as any).api = { session: { updateTimer } }

    const meta = {
      startedAt: '2026-03-01T10:00:00Z',
      sessionStartEpoch: 1772359200000,
      accumulatedPausedMs: 12000,
      pauseStartEpoch: 0,
      sessionNote: 'Writing architectural tests'
    }

    const { result } = renderHook(() => useTaskbarBadge(() => meta))
    result.current.broadcastTaskbarTimer(true, false, false, 1200, 1500, {
      id: 'g-1',
      title: 'Focus Task',
      status: 'in_progress',
      createdAt: ''
    } as any)

    expect(updateTimer).toHaveBeenCalledWith(
      expect.objectContaining({
        isActive: true,
        isPaused: false,
        isBreak: false,
        isOvertime: false,
        secondsRemaining: 1200,
        totalSeconds: 1500,
        goalId: 'g-1',
        goalTitle: 'Focus Task',
        sessionNote: 'Writing architectural tests',
        accumulatedPausedMs: 12000
      })
    )
  })
})

describe('useFocusSessionAudio', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('plays chimes for start, break, and complete', () => {
    const { result } = renderHook(() => useFocusSessionAudio())
    result.current.playChime('start')
    expect(mockPlayFocusChime).toHaveBeenCalledWith('start')

    result.current.playChime('break')
    expect(mockPlayFocusChime).toHaveBeenCalledWith('break')

    result.current.playChime('complete')
    expect(mockPlayFocusChime).toHaveBeenCalledWith('complete')
  })

  it('starts ambient audio if not already playing', () => {
    const { result } = renderHook(() => useFocusSessionAudio())
    result.current.startAmbient()
    expect(mockPlay).toHaveBeenCalled()
  })

  it('controls play and pause on ambient audio', () => {
    const { result } = renderHook(() => useFocusSessionAudio())
    result.current.playAudio()
    expect(mockPlay).toHaveBeenCalled()

    result.current.pauseAudio()
    expect(mockPause).toHaveBeenCalled()
  })
})

describe('useFocusSessionTimerEngine', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('ticks down timer and triggers onZeroReached at zero', () => {
    const onZeroReached = vi.fn()
    const broadcastTaskbarTimer = vi.fn()
    const setIsOvertime = vi.fn()

    const sessionStartEpochRef = { current: Date.now() }
    const pauseStartEpochRef = { current: 0 }
    const accumulatedPausedMsRef = { current: 0 }
    const targetSecondsRef = { current: 10 }
    const secondsRemainingRef = { current: 10 }
    const secondsElapsedRef = { current: 0 }
    const isOvertimeRef = { current: false }
    const timerControlRef = { current: null }

    const { result } = renderHook(() =>
      useFocusSessionTimerEngine({
        isActive: true,
        isPaused: false,
        isBreak: false,
        totalSeconds: 10,
        activeGoal: null,
        sessionStartEpochRef,
        pauseStartEpochRef,
        accumulatedPausedMsRef,
        targetSecondsRef,
        secondsRemainingRef,
        secondsElapsedRef,
        isOvertimeRef,
        setIsOvertime,
        broadcastTaskbarTimer,
        onZeroReached,
        timerControlRef
      })
    )

    expect(result.current.totalSeconds).toBe(10)

    act(() => {
      vi.advanceTimersByTime(11000)
    })

    expect(onZeroReached).toHaveBeenCalled()
  })

  it('allows signed negative remaining seconds during overtime to prevent ping-pong oscillation', () => {
    const onZeroReached = vi.fn()
    const broadcastTaskbarTimer = vi.fn()
    const setIsOvertime = vi.fn()

    const sessionStartEpochRef = { current: Date.now() }
    const pauseStartEpochRef = { current: 0 }
    const accumulatedPausedMsRef = { current: 0 }
    const targetSecondsRef = { current: 10 }
    const secondsRemainingRef = { current: 10 }
    const secondsElapsedRef = { current: 0 }
    const isOvertimeRef = { current: false }
    const timerControlRef = { current: null }

    const { result } = renderHook(() =>
      useFocusSessionTimerEngine({
        isActive: true,
        isPaused: false,
        isBreak: false,
        totalSeconds: 10,
        activeGoal: null,
        sessionStartEpochRef,
        pauseStartEpochRef,
        accumulatedPausedMsRef,
        targetSecondsRef,
        secondsRemainingRef,
        secondsElapsedRef,
        isOvertimeRef,
        setIsOvertime,
        broadcastTaskbarTimer,
        onZeroReached,
        timerControlRef
      })
    )

    act(() => {
      // 15 seconds elapsed on 10-second timer -> 5s overtime
      vi.advanceTimersByTime(15000)
    })

    expect(result.current.secondsRemaining).toBe(-5)
    expect(secondsRemainingRef.current).toBe(-5)
    expect(broadcastTaskbarTimer).toHaveBeenCalledWith(
      true,
      false,
      false,
      -1,
      10,
      null
    )
  })
})
