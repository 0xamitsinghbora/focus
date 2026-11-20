import React, { useState, useRef, useEffect } from 'react'
import { DailyGoal } from '../../../../shared/types'
import { useFocusSessionStore } from '../focusSessionStore'

const MAX_FOCUS_OVERTIME_SECONDS = 120 * 60
const MAX_BREAK_OVERTIME_SECONDS = 30 * 60

export interface FocusSessionTimerState {
  totalSeconds: number
  secondsRemaining: number
  secondsElapsed: number
}

export interface UseFocusSessionTimerEngineProps {
  isActive: boolean
  isPaused: boolean
  isBreak: boolean
  isAfk?: boolean
  totalSeconds: number
  activeGoal: DailyGoal | null
  sessionStartEpochRef: React.MutableRefObject<number>
  afkBreakStartEpochRef?: React.MutableRefObject<number>
  pauseStartEpochRef: React.MutableRefObject<number>
  accumulatedPausedMsRef: React.MutableRefObject<number>
  targetSecondsRef: React.MutableRefObject<number>
  secondsRemainingRef: React.MutableRefObject<number>
  secondsElapsedRef: React.MutableRefObject<number>
  isOvertimeRef: React.MutableRefObject<boolean>
  setIsOvertime: React.Dispatch<React.SetStateAction<boolean>>
  broadcastTaskbarTimer: (
    active: boolean,
    paused: boolean,
    isBreakSession: boolean,
    remainingSec: number,
    totalSec: number,
    goal?: DailyGoal | null
  ) => void
  onZeroReached?: () => void
  timerControlRef: React.MutableRefObject<{
    setTimer: (remaining: number, elapsed: number, total: number) => void
  } | null>
}

export function useFocusSessionTimerEngine({
  isActive,
  isPaused,
  isBreak,
  isAfk,
  totalSeconds,
  activeGoal,
  sessionStartEpochRef,
  afkBreakStartEpochRef,
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
}: UseFocusSessionTimerEngineProps): FocusSessionTimerState {
  const [secondsRemaining, setSecondsRemaining] = useState<number>(secondsRemainingRef.current)
  const [secondsElapsed, setSecondsElapsed] = useState<number>(secondsElapsedRef.current)
  const [currentTotalSec, setCurrentTotalSec] = useState<number>(totalSeconds)

  const chimePlayedForZeroRef = useRef(false)
  const lastBroadcastSecRef = useRef<number | null>(null)
  const onZeroReachedRef = useRef(onZeroReached)
  onZeroReachedRef.current = onZeroReached

  useEffect(() => {
    timerControlRef.current = {
      setTimer: (remaining: number, elapsed: number, total: number) => {
        setSecondsRemaining(remaining)
        setSecondsElapsed(elapsed)
        setCurrentTotalSec(total)
        secondsRemainingRef.current = remaining
        secondsElapsedRef.current = elapsed
        useFocusSessionStore.getState().setTimer(remaining, elapsed, total)
      }
    }
    return () => {
      timerControlRef.current = null
    }
  }, [timerControlRef, secondsRemainingRef, secondsElapsedRef])

  useEffect(() => {
    setCurrentTotalSec(totalSeconds)
  }, [totalSeconds])

  // Wall-clock delta timer — immune to Chromium background throttling and OS sleep
  useEffect(() => {
    if (!isActive || isPaused) return

    let lastTick = Date.now()

    const tick = (): void => {
      if (!sessionStartEpochRef.current) return
      const now = Date.now()
      const timeSinceLastTick = now - lastTick
      lastTick = now

      // Unified unnotified sleep/standby drift detection threshold (25s)
      if (timeSinceLastTick > 25000) {
        const sleepMs = timeSinceLastTick - 500
        accumulatedPausedMsRef.current += sleepMs
      }

      if (isAfk) {
        const afkStart =
          (afkBreakStartEpochRef && afkBreakStartEpochRef.current > 0
            ? afkBreakStartEpochRef.current
            : sessionStartEpochRef.current) || now
        const elapsedSec = Math.max(0, Math.floor((now - afkStart) / 1000))

        if (elapsedSec !== secondsElapsedRef.current) {
          secondsElapsedRef.current = elapsedSec
          setSecondsElapsed(elapsedSec)
        }
        if (elapsedSec !== secondsRemainingRef.current) {
          secondsRemainingRef.current = elapsedSec
          setSecondsRemaining(elapsedSec)
        }
        useFocusSessionStore.getState().setTimer(elapsedSec, elapsedSec, 0)

        const isSecChange =
          lastBroadcastSecRef.current === null ||
          Math.floor(lastBroadcastSecRef.current) !== Math.floor(elapsedSec)

        if (isSecChange) {
          lastBroadcastSecRef.current = elapsedSec
          broadcastTaskbarTimer(true, false, true, elapsedSec, 0, null)
        }
        return
      }

      const totalPausedMs =
        accumulatedPausedMsRef.current +
        (pauseStartEpochRef.current > 0 ? now - pauseStartEpochRef.current : 0)

      let elapsedSec = Math.max(
        0,
        Math.floor((now - sessionStartEpochRef.current - totalPausedMs) / 1000)
      )

      const maxAllowedOvertime = isBreak ? MAX_BREAK_OVERTIME_SECONDS : MAX_FOCUS_OVERTIME_SECONDS
      const maxAllowedElapsed = targetSecondsRef.current + maxAllowedOvertime
      if (elapsedSec > maxAllowedElapsed) {
        elapsedSec = maxAllowedElapsed
      }

      // Allow signed remaining seconds during overtime to prevent ping-pong oscillation with Main SessionService
      const remainingSec = targetSecondsRef.current - elapsedSec

      if (elapsedSec !== secondsElapsedRef.current) {
        secondsElapsedRef.current = elapsedSec
        setSecondsElapsed(elapsedSec)
      }
      if (remainingSec !== secondsRemainingRef.current) {
        secondsRemainingRef.current = remainingSec
        setSecondsRemaining(remainingSec)
      }

      useFocusSessionStore.getState().setTimer(remainingSec, elapsedSec, targetSecondsRef.current)

      const ot = !isBreak && remainingSec <= 0
      if (ot !== isOvertimeRef.current) {
        isOvertimeRef.current = ot
        setIsOvertime(ot)
        useFocusSessionStore.getState().setIsOvertime(ot)
      }

      const isMinuteChange =
        lastBroadcastSecRef.current === null ||
        Math.floor(lastBroadcastSecRef.current / 60) !== Math.floor(remainingSec / 60)
      const isOvertimeChange = ot !== isOvertimeRef.current

      if (isMinuteChange || isOvertimeChange) {
        lastBroadcastSecRef.current = remainingSec
        broadcastTaskbarTimer(
          true,
          false,
          isBreak,
          remainingSec,
          targetSecondsRef.current,
          activeGoal
        )
      }

      if (remainingSec <= 0 && !chimePlayedForZeroRef.current) {
        chimePlayedForZeroRef.current = true
        onZeroReachedRef.current?.()
      } else if (remainingSec > 0 && chimePlayedForZeroRef.current) {
        chimePlayedForZeroRef.current = false
      }
    }

    tick()
    const interval = window.setInterval(tick, 500)
    return () => window.clearInterval(interval)
  }, [
    isActive,
    isPaused,
    isBreak,
    isAfk,
    activeGoal,
    broadcastTaskbarTimer,
    setIsOvertime,
    sessionStartEpochRef,
    afkBreakStartEpochRef,
    pauseStartEpochRef,
    accumulatedPausedMsRef,
    targetSecondsRef,
    secondsRemainingRef,
    secondsElapsedRef,
    isOvertimeRef
  ])

  return {
    totalSeconds: currentTotalSec,
    secondsRemaining,
    secondsElapsed
  }
}
