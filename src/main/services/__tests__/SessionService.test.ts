import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SessionService } from '../SessionService'

describe('SessionService', () => {
  let sessionService: SessionService
  let mockDataManager: any
  let onTickMock: any

  beforeEach(() => {
    vi.useFakeTimers()
    onTickMock = vi.fn()

    mockDataManager = {
      getActiveSession: vi.fn().mockReturnValue(null),
      setActiveSession: vi.fn()
    }

    sessionService = new SessionService({
      settingsRepo: mockDataManager,
      onTick: onTickMock,
      tickIntervalMs: 1000
    })
  })

  afterEach(() => {
    sessionService.destroy()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('initializes in inactive state when no session is in storage', () => {
    const state = sessionService.getState()
    expect(state.isActive).toBe(false)
    expect(state.isPaused).toBe(false)
    expect(state.secondsRemaining).toBe(0)
    expect(state.totalSeconds).toBe(0)
  })

  it('hydrates active session from storage and continues ticking', () => {
    const startTime = Date.now() - 30 * 1000 // 30 seconds ago
    mockDataManager.getActiveSession.mockReturnValue({
      isActive: true,
      isPaused: false,
      isBreak: false,
      totalSeconds: 1500,
      secondsRemaining: 1470,
      startedAt: new Date(startTime).toISOString()
    })

    const hydratedService = new SessionService({
      settingsRepo: mockDataManager,
      onTick: onTickMock,
      tickIntervalMs: 1000
    })

    const state = hydratedService.getState()
    expect(state.isActive).toBe(true)
    expect(state.secondsRemaining).toBeLessThanOrEqual(1470)

    hydratedService.destroy()
  })

  it('starts a new focus session and runs the timer', () => {
    sessionService.start({
      totalSeconds: 1500,
      goalId: 'goal-1',
      goalTitle: 'Write unit tests'
    })

    let state = sessionService.getState()
    expect(state.isActive).toBe(true)
    expect(state.isPaused).toBe(false)
    expect(state.totalSeconds).toBe(1500)
    expect(state.secondsRemaining).toBe(1500)
    expect(mockDataManager.setActiveSession).toHaveBeenCalled()

    // Advance 5 seconds
    vi.advanceTimersByTime(5000)

    state = sessionService.getState()
    expect(state.secondsRemaining).toBe(1495)
    expect(onTickMock).toHaveBeenCalled()
  })

  it('pauses and resumes the session without timer drift', () => {
    sessionService.start({ totalSeconds: 1500 })

    vi.advanceTimersByTime(10000) // 10s elapsed -> 1490s remaining
    expect(sessionService.getState().secondsRemaining).toBe(1490)

    sessionService.pause()
    expect(sessionService.getState().isPaused).toBe(true)

    // Advance 60s while paused
    vi.advanceTimersByTime(60000)
    expect(sessionService.getState().secondsRemaining).toBe(1490)

    sessionService.resume()
    expect(sessionService.getState().isPaused).toBe(false)

    // Advance 5s after resuming -> should be 1485s remaining
    vi.advanceTimersByTime(5000)
    expect(sessionService.getState().secondsRemaining).toBe(1485)
  })

  it('enters overtime when remaining seconds reach 0 for focus sessions', () => {
    sessionService.start({ totalSeconds: 60, isBreak: false })

    vi.advanceTimersByTime(65000) // 65 seconds elapsed

    const state = sessionService.getState()
    expect(state.isOvertime).toBe(true)
    expect(state.secondsRemaining).toBe(-5)
  })

  it('stops session and clears database active session', () => {
    sessionService.start({ totalSeconds: 1500 })
    sessionService.stop()

    const state = sessionService.getState()
    expect(state.isActive).toBe(false)
    expect(state.secondsRemaining).toBe(0)
    expect(mockDataManager.setActiveSession).toHaveBeenCalledWith(null)
  })

  it('caps overtime at maximum duration', () => {
    sessionService.start({ totalSeconds: 60, isBreak: false })

    // Advance by 3 hours (more than 2 hour max overtime)
    vi.advanceTimersByTime(3 * 3600 * 1000)

    const state = sessionService.getState()
    expect(state.secondsRemaining).toBe(-120 * 60)
  })

  it('updates session duration on active focus session', () => {
    sessionService.start({ totalSeconds: 45 * 60 })
    vi.advanceTimersByTime(30000) // 30s elapsed -> 2670s remaining
    expect(sessionService.getState().secondsRemaining).toBe(2670)

    sessionService.updateDuration(15 * 60)
    const state = sessionService.getState()
    expect(state.totalSeconds).toBe(15 * 60)
    expect(state.secondsRemaining).toBe(15 * 60 - 30) // 870s remaining
    expect(onTickMock).toHaveBeenCalled()
  })

  it('ignores updateDuration on break session or inactive session', () => {
    // Inactive
    sessionService.updateDuration(15 * 60)
    expect(sessionService.getState().isActive).toBe(false)

    // Break
    sessionService.start({ totalSeconds: 300, isBreak: true })
    sessionService.updateDuration(15 * 60)
    expect(sessionService.getState().totalSeconds).toBe(300)
  })

  it('handleZeroReached authoritatively pauses session and stops ticker', () => {
    sessionService.start({ totalSeconds: 60 })
    vi.advanceTimersByTime(60000)

    const state = sessionService.handleZeroReached(true)
    expect(state.isPaused).toBe(true)
    expect(state.secondsRemaining).toBe(0)
    expect(state.isOvertime).toBe(false)

    // Ensure ticker is stopped and does not advance into overtime
    onTickMock.mockClear()
    vi.advanceTimersByTime(10000)
    expect(onTickMock).not.toHaveBeenCalled()
    expect(sessionService.getState().secondsRemaining).toBe(0)
  })

  it('autoPauses on zero when autoPauseOnZero option is enabled', () => {
    sessionService.start({ totalSeconds: 60, autoPauseOnZero: true })

    vi.advanceTimersByTime(61000)

    const state = sessionService.getState()
    expect(state.isPaused).toBe(true)
    expect(state.secondsRemaining).toBe(0)
    expect(state.isOvertime).toBe(false)
  })

  it('handleSuspend and handleResume properly adjust accumulatedPausedMs during OS sleep', () => {
    sessionService.start({ totalSeconds: 1500 }) // 25 min

    // Advance 5 minutes active
    vi.advanceTimersByTime(300 * 1000)
    expect(sessionService.getState().secondsRemaining).toBe(1200)

    // OS goes to sleep
    sessionService.handleSuspend()

    // 2 hours pass while sleeping
    vi.advanceTimersByTime(2 * 3600 * 1000)

    // OS wakes up
    sessionService.handleResume()

    // Timer should NOT have advanced during sleep
    const state = sessionService.getState()
    expect(state.secondsRemaining).toBe(1200)
    expect(state.accumulatedPausedMs).toBeGreaterThanOrEqual(2 * 3600 * 1000)

    // And after 10 more seconds awake, ticks properly
    vi.advanceTimersByTime(10 * 1000)
    expect(sessionService.getState().secondsRemaining).toBe(1190)
  })

  it('handles AFK break counting up elapsed seconds without pausing or timing out', () => {
    const afkStart = Date.now()
    sessionService.start({
      totalSeconds: 0,
      isBreak: true,
      isAfk: true,
      afkBreakStartEpoch: afkStart,
      autoPauseOnZero: true
    })

    expect(sessionService.getState().isAfk).toBe(true)
    expect(sessionService.getState().isBreak).toBe(true)
    expect(sessionService.getState().isPaused).toBe(false)

    // Advance by 6 minutes 10 seconds (370 seconds)
    vi.advanceTimersByTime(370 * 1000)

    const state = sessionService.getState()
    expect(state.isPaused).toBe(false)
    expect(state.secondsRemaining).toBe(370)
  })
})
