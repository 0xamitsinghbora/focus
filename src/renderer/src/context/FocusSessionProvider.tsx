import React, { useEffect, useRef, useCallback, useMemo } from 'react'
import {
  DailyGoal,
  localDateStr,
  LogEntry,
  DEFAULT_SORT_ORDER,
  ReminderStatus
} from '../../../shared/types'
import { formatMinutes } from '../lib/utils'
import { useToast } from '../lib/useToast'
import {
  useTaskbarBadge,
  useFocusSessionAudio,
  useFocusSessionTimerEngine,
  TaskbarTimerMetadata
} from './hooks'
import {
  useFocusSessionStore,
  useSessionIsActive,
  useSessionIsPaused,
  useSessionIsBreak,
  useSessionIsAfk,
  useSessionTotalSeconds,
  useSessionActiveGoal
} from './focusSessionStore'
import {
  FocusSessionActions,
  FocusSessionActionsContext,
  FocusSessionProviderProps
} from './FocusSessionContext'

export function FocusSessionProvider({
  children,
  onUpdateDailyGoal,
  onDataRefresh,
  availableGoals,
  dayCutoffHour = 0,
  defaultIntervalMinutes
}: FocusSessionProviderProps): React.JSX.Element {
  const toast = useToast()
  const { playChime } = useFocusSessionAudio()

  const defaultIntervalMinutesRef = useRef<number>(defaultIntervalMinutes || 45)
  const prevIntervalRef = useRef<number>(defaultIntervalMinutes || 45)

  const [isSessionHydrated, setIsSessionHydrated] = React.useState<boolean>(() => {
    return typeof window === 'undefined' || !window.api?.session?.getState
  })
  const hasSessionHydratedRef = useRef(
    typeof window === 'undefined' || !window.api?.session?.getState
  )

  const isOvertimeRef = useRef(false)
  const startedAtRef = useRef<string | null>(null)
  const sessionNoteRef = useRef<string>('')

  const sessionStartEpochRef = useRef<number>(0)
  const afkBreakStartEpochRef = useRef<number>(0)
  const pauseStartEpochRef = useRef<number>(0)
  const emptyInProgressStartEpochRef = useRef<number>(0)
  const accumulatedPausedMsRef = useRef<number>(0)
  const targetSecondsRef = useRef<number>((defaultIntervalMinutes || 45) * 60)
  const secondsRemainingRef = useRef<number>((defaultIntervalMinutes || 45) * 60)
  const secondsElapsedRef = useRef<number>(0)
  const hasNotedOnPauseRef = useRef<boolean>(false)
  const timerControlRef = useRef<{
    setTimer: (remaining: number, elapsed: number, total: number) => void
  } | null>(null)

  const onUpdateDailyGoalRef = useRef(onUpdateDailyGoal)
  onUpdateDailyGoalRef.current = onUpdateDailyGoal
  const onDataRefreshRef = useRef(onDataRefresh)
  onDataRefreshRef.current = onDataRefresh
  const availableGoalsRef = useRef(availableGoals)
  availableGoalsRef.current = availableGoals
  const dayCutoffHourRef = useRef(dayCutoffHour)
  dayCutoffHourRef.current = dayCutoffHour

  const pendingRestoredGoalRef = useRef<{ id?: string; title?: string } | null>(null)

  // Reset store on unmount to prevent test bleed
  useEffect(() => {
    return () => {
      useFocusSessionStore.getState().resetSession()
      emptyInProgressStartEpochRef.current = 0
    }
  }, [])

  // Auto-log accumulated empty in-progress break if window unloads
  useEffect(() => {
    const handleBeforeUnload = (): void => {
      const epoch = emptyInProgressStartEpochRef.current
      if (epoch > 0 && window.api?.logs) {
        const now = Date.now()
        const elapsedSec = Math.floor((now - epoch) / 1000)
        if (elapsedSec >= 60) {
          const breakMins = Math.max(1, Math.round(elapsedSec / 60))
          const endIso = new Date(now).toISOString()
          const startIso = new Date(epoch).toISOString()
          const breakEntry: LogEntry = {
            id: crypto.randomUUID(),
            timestamp: endIso,
            startedAt: startIso,
            endedAt: endIso,
            text: 'Break',
            productivity: 'break',
            durationMinutes: breakMins,
            productiveMinutes: 0
          }
          window.api.logs
            .append(localDateStr(new Date(now), dayCutoffHourRef.current), breakEntry, false)
            .catch(() => {})
        }
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [])

  const getMetadata = useCallback((): TaskbarTimerMetadata => {
    const state = useFocusSessionStore.getState()
    return {
      startedAt: state.startedAt || startedAtRef.current,
      sessionStartEpoch: sessionStartEpochRef.current,
      accumulatedPausedMs: accumulatedPausedMsRef.current,
      pauseStartEpoch: pauseStartEpochRef.current,
      sessionNote: state.sessionNote || sessionNoteRef.current,
      emptyInProgressStartEpoch: emptyInProgressStartEpochRef.current,
      isAfk: state.isAfk,
      afkBreakStartEpoch: afkBreakStartEpochRef.current
    }
  }, [])

  const { broadcastTaskbarTimer } = useTaskbarBadge(getMetadata)

  useEffect(() => {
    if (typeof window !== 'undefined' && window.api?.settings?.get) {
      window.api.settings
        .get()
        .then((s) => {
          if (typeof s?.reminderIntervalMinutes === 'number' && s.reminderIntervalMinutes > 0) {
            defaultIntervalMinutesRef.current = s.reminderIntervalMinutes
            const state = useFocusSessionStore.getState()
            if (!state.isActive) {
              const sec = s.reminderIntervalMinutes * 60
              targetSecondsRef.current = sec
              secondsRemainingRef.current = sec
              useFocusSessionStore.setState({
                totalSeconds: sec,
                secondsRemaining: sec,
                targetSeconds: sec
              })
              timerControlRef.current?.setTimer(sec, 0, sec)
            }
          }
        })
        .catch(() => {})
    }
  }, [])

  useEffect(() => {
    if (defaultIntervalMinutes && defaultIntervalMinutes > 0) {
      const prevInterval = prevIntervalRef.current
      prevIntervalRef.current = defaultIntervalMinutes
      defaultIntervalMinutesRef.current = defaultIntervalMinutes
      const state = useFocusSessionStore.getState()
      if (!state.isActive) {
        const sec = defaultIntervalMinutes * 60
        targetSecondsRef.current = sec
        secondsRemainingRef.current = sec
        useFocusSessionStore.setState({
          totalSeconds: sec,
          secondsRemaining: sec,
          targetSeconds: sec
        })
        timerControlRef.current?.setTimer(sec, 0, sec)
      } else if (!state.isBreak && prevInterval !== defaultIntervalMinutes) {
        const newTotalSec = defaultIntervalMinutes * 60
        const elapsed =
          sessionStartEpochRef.current > 0
            ? Math.max(
                0,
                Math.floor(
                  (Date.now() - sessionStartEpochRef.current - accumulatedPausedMsRef.current) /
                    1000
                )
              )
            : secondsElapsedRef.current
        const newRemaining = newTotalSec - elapsed
        targetSecondsRef.current = newTotalSec
        secondsRemainingRef.current = newRemaining
        const ot = newRemaining <= 0
        isOvertimeRef.current = ot

        useFocusSessionStore.setState({
          totalSeconds: newTotalSec,
          secondsRemaining: newRemaining,
          targetSeconds: newTotalSec,
          isOvertime: ot
        })
        timerControlRef.current?.setTimer(newRemaining, elapsed, newTotalSec)
        broadcastTaskbarTimer(
          true,
          state.isPaused,
          false,
          newRemaining,
          newTotalSec,
          state.activeGoal
        )
      }
    }
  }, [defaultIntervalMinutes, broadcastTaskbarTimer])

  // Subscribe to authoritative session updates and hydrate in-flight focus session from main process
  useEffect(() => {
    const applyAuthoritativeSession = (
      savedState: Partial<import('../../../shared/types').SessionTimerPayload> | null | undefined
    ): boolean => {
      if (!savedState || !savedState.isActive) return false
      if (savedState.startedAt) {
        const startMs = new Date(savedState.startedAt).getTime()
        if (isNaN(startMs) || Date.now() - startMs > 12 * 60 * 60 * 1000) {
          return false
        }
      }
      const totalSec =
        typeof savedState.totalSeconds === 'number' && savedState.totalSeconds > 0
          ? savedState.totalSeconds
          : 25 * 60
      const remainingSec =
        typeof savedState.secondsRemaining === 'number' ? savedState.secondsRemaining : totalSec
      const elapsed = Math.max(0, totalSec - remainingSec)
      const now = Date.now()

      const originalStartMs = savedState.startedAt ? new Date(savedState.startedAt).getTime() : NaN
      const accumulatedPause =
        typeof savedState.accumulatedPausedMs === 'number' &&
        Number.isFinite(savedState.accumulatedPausedMs)
          ? Math.max(0, savedState.accumulatedPausedMs)
          : 0

      sessionStartEpochRef.current =
        !isNaN(originalStartMs) && originalStartMs > 0
          ? originalStartMs
          : now - elapsed * 1000 - accumulatedPause

      let pauseStart = 0
      if (savedState.isPaused) {
        if (
          typeof savedState.pauseStartEpoch === 'number' &&
          Number.isFinite(savedState.pauseStartEpoch) &&
          savedState.pauseStartEpoch > 0
        ) {
          pauseStart = savedState.pauseStartEpoch
        } else {
          pauseStart = now
        }
      }
      pauseStartEpochRef.current = pauseStart
      accumulatedPausedMsRef.current = accumulatedPause
      targetSecondsRef.current = totalSec

      const ot = !savedState.isBreak && remainingSec <= 0
      isOvertimeRef.current = ot

      secondsRemainingRef.current = remainingSec
      secondsElapsedRef.current = elapsed
      timerControlRef.current?.setTimer(remainingSec, elapsed, totalSec)

      const resolvedStart =
        savedState.startedAt || new Date(sessionStartEpochRef.current).toISOString()
      startedAtRef.current = resolvedStart

      if (savedState.sessionNote) {
        sessionNoteRef.current = savedState.sessionNote
      }

      let goalToSet: DailyGoal | null = null
      if (savedState.goalId || savedState.goalTitle) {
        const currentGoals = availableGoalsRef.current || []
        const found = currentGoals.find((g) =>
          savedState.goalId ? g.id === savedState.goalId : g.title === savedState.goalTitle
        )
        if (found) {
          goalToSet = found
        } else {
          pendingRestoredGoalRef.current = {
            id: savedState.goalId,
            title: savedState.goalTitle
          }
        }
      } else if (savedState.isBreak) {
        goalToSet = null
      }

      emptyInProgressStartEpochRef.current = 0

      useFocusSessionStore.setState({
        isHydrated: true,
        isActive: true,
        isPaused: Boolean(savedState.isPaused),
        isBreak: Boolean(savedState.isBreak),
        isOvertime: ot,
        totalSeconds: totalSec,
        secondsRemaining: remainingSec,
        secondsElapsed: elapsed,
        sessionStartEpoch: sessionStartEpochRef.current,
        pauseStartEpoch: pauseStart,
        accumulatedPausedMs: accumulatedPause,
        targetSeconds: totalSec,
        startedAt: resolvedStart,
        sessionNote: savedState.sessionNote || '',
        activeGoal: goalToSet,
        emptyInProgressStartEpoch: 0
      })

      return true
    }

    if (typeof window !== 'undefined' && window.api?.session) {
      if (typeof window.api.session.getState === 'function') {
        useFocusSessionStore.setState({ isHydrated: false })
        window.api.session
          .getState()
          .then((savedState) => {
            if (savedState && savedState.isActive) {
              applyAuthoritativeSession(savedState)
            } else {
              useFocusSessionStore.setState({ isHydrated: true })
            }
          })
          .catch(() => {
            useFocusSessionStore.setState({ isHydrated: true })
          })
          .finally(() => {
            hasSessionHydratedRef.current = true
            setIsSessionHydrated(true)
          })
      } else {
        hasSessionHydratedRef.current = true
        setIsSessionHydrated(true)
        useFocusSessionStore.setState({ isHydrated: true })
      }

      if (typeof window.api.session.onSessionUpdate === 'function') {
        const unsubscribe = window.api.session.onSessionUpdate((payload) => {
          if (!payload) return
          if (payload.isActive) {
            applyAuthoritativeSession(payload)
          } else {
            isOvertimeRef.current = false
            useFocusSessionStore.getState().resetSession()
            timerControlRef.current?.setTimer(0, 0, 0)
          }
        })
        return () => {
          unsubscribe?.()
        }
      }
    } else {
      hasSessionHydratedRef.current = true
      setIsSessionHydrated(true)
      useFocusSessionStore.setState({ isHydrated: true })
    }
    return undefined
  }, [])

  // Synchronize activeGoal with incoming availableGoals (e.g. edits, status changes or renames in Kanban/Planner)
  useEffect(() => {
    if (!availableGoals) return
    const currentActive = useFocusSessionStore.getState().activeGoal
    if (!currentActive && pendingRestoredGoalRef.current) {
      const { id, title } = pendingRestoredGoalRef.current
      const found = availableGoals.find((g) => (id ? g.id === id : g.title === title))
      if (found) {
        useFocusSessionStore.setState({ activeGoal: found })
        pendingRestoredGoalRef.current = null
        return
      }
    }
    if (!currentActive) return
    const matching = availableGoals.find((g) => g.id === currentActive.id)
    if (matching) {
      if (
        matching.title !== currentActive.title ||
        matching.targetMinutes !== currentActive.targetMinutes ||
        matching.status !== currentActive.status ||
        matching.groupTag !== currentActive.groupTag ||
        matching.deletedAt !== currentActive.deletedAt
      ) {
        useFocusSessionStore.setState({ activeGoal: matching })
      }
    }
  }, [availableGoals])

  const logEmptyInProgressBreak = useCallback(async (): Promise<void> => {
    const epoch = emptyInProgressStartEpochRef.current
    if (epoch <= 0) return
    emptyInProgressStartEpochRef.current = 0
    useFocusSessionStore.setState({ emptyInProgressStartEpoch: 0 })

    const now = Date.now()
    const elapsedSec = Math.floor((now - epoch) / 1000)
    // Rule: Count time also as break when no task is in "in progress".
    // Discard trivial breaks (< 60s), auto-log breaks >= 60s as red break in today's timing.
    if (elapsedSec >= 60) {
      const breakMins = Math.max(1, Math.round(elapsedSec / 60))
      const endIso = new Date(now).toISOString()
      const startIso = new Date(epoch).toISOString()
      const breakEntry: LogEntry = {
        id: crypto.randomUUID(),
        timestamp: endIso,
        startedAt: startIso,
        endedAt: endIso,
        text: 'Break',
        productivity: 'break',
        durationMinutes: breakMins,
        productiveMinutes: 0
      }
      try {
        if (window.api?.logs) {
          const dateStr = localDateStr(new Date(now), dayCutoffHourRef.current)
          await window.api.logs.append(dateStr, breakEntry, false)
        }
        if (window.api?.scheduler?.submit) {
          window.api.scheduler.submit()
        }
        if (onDataRefreshRef.current) {
          await onDataRefreshRef.current()
        }
      } catch (err) {
        console.error('Failed to log break for time without in-progress tasks:', err)
      }
    }
  }, [])

  const logActiveTaskElapsed = useCallback(
    async (
      targetGoal: DailyGoal,
      mode: 'planned' | 'done' | 'deleted' | 'switch'
    ): Promise<void> => {
      const { startedAt, sessionNote, isBreak } = useFocusSessionStore.getState()
      if (isBreak) return

      const elapsed = Math.max(
        secondsElapsedRef.current,
        useFocusSessionStore.getState().secondsElapsed
      )
      const endIso = new Date().toISOString()
      const startIso = startedAt || new Date(Date.now() - elapsed * 1000).toISOString()
      const shouldLog = mode === 'done' ? elapsed > 0 : elapsed >= 60

      let breakEntry: LogEntry | null = null
      let taskEndIso = endIso
      if (pauseStartEpochRef.current > 0) {
        const pauseDurationMs = Date.now() - pauseStartEpochRef.current
        if (pauseDurationMs >= 40000) {
          const pausedMins = Math.max(1, Math.round(pauseDurationMs / 60000))
          const pauseStartIso = new Date(pauseStartEpochRef.current).toISOString()
          taskEndIso = pauseStartIso
          breakEntry = {
            id: crypto.randomUUID(),
            timestamp: endIso,
            startedAt: pauseStartIso,
            endedAt: endIso,
            text: 'Break',
            productivity: 'break',
            durationMinutes: pausedMins,
            productiveMinutes: 0
          }
        }
        pauseStartEpochRef.current = 0
      }

      if (shouldLog) {
        const loggedMins = Math.max(1, Math.round(elapsed / 60))
        const entry: LogEntry = {
          id: crypto.randomUUID(),
          timestamp: taskEndIso,
          text: targetGoal.title,
          startedAt: startIso,
          endedAt: taskEndIso,
          goalId: targetGoal.id,
          goalTitle: targetGoal.title,
          note: sessionNote.trim() || undefined,
          productivity: 'productive',
          durationMinutes: loggedMins,
          productiveMinutes: loggedMins
        }

        try {
          if (window.api?.logs) {
            const dateStr =
              targetGoal?.date ||
              useFocusSessionStore.getState().effectiveDate ||
              localDateStr(new Date(startIso), dayCutoffHourRef.current)
            await window.api.logs.append(dateStr, entry)
            if (breakEntry) {
              await window.api.logs.append(dateStr, breakEntry, false)
            }
          }
          if (window.api?.scheduler?.submit) {
            window.api.scheduler.submit()
          }
          if (onDataRefreshRef.current) {
            await onDataRefreshRef.current()
          }
          toast.success(
            `Logged ${formatMinutes(loggedMins)} focus on "${targetGoal.title}".`,
            mode === 'done' ? 'Task Completed' : 'Focus Logged'
          )
        } catch (err) {
          console.error('Failed to log active task elapsed time:', err)
        }
      } else if (breakEntry) {
        try {
          if (window.api?.logs) {
            const dateStr = localDateStr(new Date(), dayCutoffHourRef.current)
            await window.api.logs.append(dateStr, breakEntry, false)
          }
          if (window.api?.scheduler?.submit) {
            window.api.scheduler.submit()
          }
        } catch (err) {
          console.error('Failed to append break log:', err)
        }
      } else if (elapsed > 0 && elapsed < 60) {
        toast.info(`Focus on "${targetGoal.title}" under 1 minute discarded.`, 'Session Discarded')
      }
    },
    [toast]
  )

  const pauseFocus = useCallback(() => {
    const { isPaused, isActive, isBreak, activeGoal, sessionNote, startedAt } =
      useFocusSessionStore.getState()
    if (!isPaused) {
      const now = Date.now()
      pauseStartEpochRef.current = now

      // Note time of green task:
      // If actively focusing on a task (not a break) and worked >= 40 seconds:
      // Record/log the focus session segment into the daily logs.
      const wallElapsed =
        sessionStartEpochRef.current > 0
          ? Math.max(
              0,
              Math.floor(
                (now - sessionStartEpochRef.current - accumulatedPausedMsRef.current) / 1000
              )
            )
          : 0
      const elapsed = Math.max(
        secondsElapsedRef.current,
        useFocusSessionStore.getState().secondsElapsed,
        wallElapsed
      )
      if (isActive && activeGoal && !isBreak && elapsed >= 40) {
        const loggedMinutes = Math.max(1, Math.round(elapsed / 60))
        const endIso = new Date(now).toISOString()
        const startIso = startedAt || new Date(now - elapsed * 1000).toISOString()
        const entry: LogEntry = {
          id: crypto.randomUUID(),
          timestamp: endIso,
          text: activeGoal.title,
          startedAt: startIso,
          endedAt: endIso,
          goalId: activeGoal.id,
          goalTitle: activeGoal.title,
          note: sessionNote.trim() || undefined,
          productivity: 'productive',
          durationMinutes: loggedMinutes,
          productiveMinutes: loggedMinutes
        }

        void (async () => {
          try {
            if (window.api?.logs) {
              await window.api.logs.append(
                localDateStr(new Date(now), dayCutoffHourRef.current),
                entry
              )
            }
            if (window.api?.scheduler?.submit) {
              window.api.scheduler.submit()
            }
            if (onDataRefreshRef.current) {
              await onDataRefreshRef.current()
            }
            toast.info(
              `Noted ${formatMinutes(loggedMinutes)} focus on "${activeGoal.title}". Pause timer started.`,
              'Focus Paused'
            )
          } catch (err) {
            console.error('Failed to log green task focus on pause:', err)
          }
        })()

        // Adjust remaining time so noted time is not double-counted when resumed
        const remaining = Math.max(0, targetSecondsRef.current - elapsed)
        targetSecondsRef.current = remaining
        secondsRemainingRef.current = remaining
        secondsElapsedRef.current = 0
        sessionStartEpochRef.current = now
        accumulatedPausedMsRef.current = 0
        hasNotedOnPauseRef.current = true

        useFocusSessionStore.setState({
          totalSeconds: remaining,
          secondsRemaining: remaining,
          secondsElapsed: 0,
          targetSeconds: remaining,
          isPaused: true,
          pauseStartEpoch: now
        })
      } else {
        useFocusSessionStore.setState({
          isPaused: true,
          pauseStartEpoch: now
        })
      }

      if (isActive) {
        broadcastTaskbarTimer(
          true,
          true,
          isBreak,
          secondsRemainingRef.current,
          targetSecondsRef.current,
          activeGoal
        )
      }
    }
  }, [broadcastTaskbarTimer, toast])

  const resumeFocus = useCallback(async () => {
    const { isPaused, isActive, isBreak, totalSeconds, activeGoal } =
      useFocusSessionStore.getState()
    if (isPaused) {
      const now = Date.now()
      if (pauseStartEpochRef.current > 0) {
        const pauseDurationMs = now - pauseStartEpochRef.current
        accumulatedPausedMsRef.current += pauseDurationMs

        // Rule: If timer is paused, time counts as break, show red
        if (pauseDurationMs >= 40000) {
          const pausedMins = Math.max(1, Math.round(pauseDurationMs / 60000))
          const breakEntry: LogEntry = {
            id: crypto.randomUUID(),
            timestamp: new Date(now).toISOString(),
            startedAt: new Date(pauseStartEpochRef.current).toISOString(),
            endedAt: new Date(now).toISOString(),
            text: 'Break',
            productivity: 'break',
            durationMinutes: pausedMins,
            productiveMinutes: 0
          }
          try {
            if (window.api?.logs) {
              await window.api.logs.append(
                localDateStr(new Date(), dayCutoffHourRef.current),
                breakEntry,
                false
              )
            }
            if (onDataRefreshRef.current) {
              await onDataRefreshRef.current()
            }
          } catch (err) {
            console.error('Failed to log pause break:', err)
          }
        }
        pauseStartEpochRef.current = 0
      }
      if (secondsElapsedRef.current === 0) {
        sessionStartEpochRef.current = now
        accumulatedPausedMsRef.current = 0
        startedAtRef.current = new Date(now).toISOString()
        useFocusSessionStore.setState({ startedAt: new Date(now).toISOString() })
      }
      hasNotedOnPauseRef.current = false
      useFocusSessionStore.setState({ isPaused: false, pauseStartEpoch: 0 })
      if (isActive) {
        broadcastTaskbarTimer(
          true,
          false,
          isBreak,
          secondsRemainingRef.current,
          totalSeconds,
          activeGoal
        )
      }
    }
  }, [broadcastTaskbarTimer])

  const togglePause = useCallback(() => {
    const { isPaused } = useFocusSessionStore.getState()
    if (isPaused) {
      void resumeFocus()
    } else {
      pauseFocus()
    }
  }, [pauseFocus, resumeFocus])

  const startFocus = useCallback(
    async (goal?: DailyGoal | null, durationMinutes?: number) => {
      if (emptyInProgressStartEpochRef.current > 0) {
        await logEmptyInProgressBreak()
      }
      const state = useFocusSessionStore.getState()
      // If already focusing and paused, resume
      if (state.isActive && state.isPaused && (!goal || state.activeGoal?.id === goal.id)) {
        await resumeFocus()
        toast.info(goal ? `Resumed focus on "${goal.title}"` : 'Resumed focus', 'Focus Resumed')
        return
      }

      const elapsed = Math.max(
        secondsElapsedRef.current,
        useFocusSessionStore.getState().secondsElapsed
      )
      if (
        state.isActive &&
        state.activeGoal &&
        goal &&
        state.activeGoal.id !== goal.id &&
        !state.isBreak &&
        elapsed >= 60
      ) {
        await logActiveTaskElapsed(state.activeGoal, 'switch')
      }

      const defaultMins = defaultIntervalMinutesRef.current || 45
      const targetMins = durationMinutes || defaultMins
      const targetSec = targetMins * 60
      const now = Date.now()

      sessionStartEpochRef.current = now
      pauseStartEpochRef.current = 0
      accumulatedPausedMsRef.current = 0
      targetSecondsRef.current = targetSec
      secondsRemainingRef.current = targetSec
      secondsElapsedRef.current = 0
      isOvertimeRef.current = false
      sessionNoteRef.current = ''
      startedAtRef.current = new Date(now).toISOString()

      useFocusSessionStore.setState({
        activeGoal: goal ?? null,
        isActive: true,
        isPaused: false,
        isBreak: false,
        isOvertime: false,
        totalSeconds: targetSec,
        secondsRemaining: targetSec,
        secondsElapsed: 0,
        startedAt: startedAtRef.current,
        effectiveDate: goal?.date || localDateStr(new Date(now), dayCutoffHourRef.current),
        sessionNote: '',
        isMinimized: false,
        sessionStartEpoch: now,
        pauseStartEpoch: 0,
        accumulatedPausedMs: 0,
        targetSeconds: targetSec
      })

      timerControlRef.current?.setTimer(targetSec, 0, targetSec)

      playChime('start')
      broadcastTaskbarTimer(true, false, false, targetSec, targetSec, goal ?? null)

      // Automatically promote to In Progress if currently planned
      if (goal && goal.status === 'planned' && onUpdateDailyGoalRef.current) {
        try {
          await onUpdateDailyGoalRef.current({
            ...goal,
            status: 'in_progress'
          })
          if (onDataRefreshRef.current) {
            await onDataRefreshRef.current()
          }
        } catch (err) {
          console.warn('Failed to auto-update goal to in_progress:', err)
        }
      }

      toast.success(
        `Focus timer started for ${formatMinutes(targetMins)}.`,
        goal ? `Focusing: ${goal.title}` : 'Focusing'
      )
    },
    [
      logActiveTaskElapsed,
      broadcastTaskbarTimer,
      playChime,
      resumeFocus,
      toast,
      logEmptyInProgressBreak
    ]
  )

  const startBreak = useCallback(
    async (breakMinutes = 2) => {
      if (emptyInProgressStartEpochRef.current > 0) {
        await logEmptyInProgressBreak()
      }
      const state = useFocusSessionStore.getState()
      const elapsed = Math.max(
        secondsElapsedRef.current,
        useFocusSessionStore.getState().secondsElapsed
      )
      if (state.isActive && state.activeGoal && !state.isBreak && elapsed >= 60) {
        await logActiveTaskElapsed(state.activeGoal, 'switch')
      }

      const sec = breakMinutes * 60
      const now = Date.now()
      sessionStartEpochRef.current = now
      pauseStartEpochRef.current = 0
      accumulatedPausedMsRef.current = 0
      targetSecondsRef.current = sec
      secondsRemainingRef.current = sec
      secondsElapsedRef.current = 0
      isOvertimeRef.current = false
      sessionNoteRef.current = ''
      startedAtRef.current = new Date(now).toISOString()

      useFocusSessionStore.setState({
        isActive: true,
        isBreak: true,
        isPaused: false,
        isOvertime: false,
        activeGoal: null,
        startedAt: startedAtRef.current,
        effectiveDate: localDateStr(new Date(now), dayCutoffHourRef.current),
        sessionNote: '',
        totalSeconds: sec,
        secondsRemaining: sec,
        secondsElapsed: 0,
        sessionStartEpoch: now,
        pauseStartEpoch: 0,
        accumulatedPausedMs: 0,
        targetSeconds: sec
      })

      timerControlRef.current?.setTimer(sec, 0, sec)

      playChime('break')
      broadcastTaskbarTimer(true, false, true, sec, sec, null)
      toast.info(`Time for a quick recharge (${breakMinutes}m).`, 'Break Started')
    },
    [logActiveTaskElapsed, broadcastTaskbarTimer, playChime, toast, logEmptyInProgressBreak]
  )

  const startAfkBreak = useCallback(
    async (startEpoch?: number) => {
      if (emptyInProgressStartEpochRef.current > 0) {
        await logEmptyInProgressBreak()
      }
      const now = startEpoch && startEpoch > 0 ? startEpoch : Date.now()
      afkBreakStartEpochRef.current = now
      sessionStartEpochRef.current = now
      pauseStartEpochRef.current = 0
      accumulatedPausedMsRef.current = 0
      emptyInProgressStartEpochRef.current = 0
      targetSecondsRef.current = 0
      secondsRemainingRef.current = 0
      secondsElapsedRef.current = 0
      isOvertimeRef.current = false
      sessionNoteRef.current = ''
      startedAtRef.current = new Date(now).toISOString()

      useFocusSessionStore.setState({
        isActive: true,
        isBreak: true,
        isAfk: true,
        isPaused: false,
        isOvertime: false,
        activeGoal: null,
        startedAt: startedAtRef.current,
        effectiveDate: localDateStr(new Date(now), dayCutoffHourRef.current),
        sessionNote: '',
        totalSeconds: 0,
        secondsRemaining: 0,
        secondsElapsed: 0,
        sessionStartEpoch: now,
        afkBreakStartEpoch: now,
        pauseStartEpoch: 0,
        accumulatedPausedMs: 0,
        targetSeconds: 0,
        emptyInProgressStartEpoch: 0
      })

      timerControlRef.current?.setTimer(0, 0, 0)

      playChime('break')
      broadcastTaskbarTimer(true, false, true, 0, 0, null, {
        isAfk: true,
        afkBreakStartEpoch: now,
        startedAt: startedAtRef.current,
        sessionStartEpoch: now
      })
    },
    [broadcastTaskbarTimer, playChime, logEmptyInProgressBreak]
  )

  const addMinutes = useCallback(
    (mins: number) => {
      const sec = mins * 60
      targetSecondsRef.current += sec
      const nextRemaining = secondsRemainingRef.current + sec
      secondsRemainingRef.current = nextRemaining
      const currentTotal = useFocusSessionStore.getState().totalSeconds
      const nextTotal = currentTotal + sec
      const nextOvertime = nextRemaining <= 0
      isOvertimeRef.current = nextOvertime
      useFocusSessionStore.setState({
        totalSeconds: nextTotal,
        secondsRemaining: nextRemaining,
        targetSeconds: targetSecondsRef.current,
        isOvertime: nextOvertime
      })
      timerControlRef.current?.setTimer(nextRemaining, secondsElapsedRef.current, nextTotal)
      const { isActive, isPaused, isBreak, activeGoal } = useFocusSessionStore.getState()
      broadcastTaskbarTimer(
        isActive,
        isPaused,
        isBreak,
        nextRemaining,
        targetSecondsRef.current,
        activeGoal
      )
      toast.info(`Session extended by ${mins} minutes.`, `+${mins} min Added`)
    },
    [broadcastTaskbarTimer, toast]
  )

  const openZenMode = useCallback(() => {
    useFocusSessionStore.setState({ isZenOpen: true })
  }, [])

  const closeZenMode = useCallback(() => {
    useFocusSessionStore.setState({ isZenOpen: false })
  }, [])

  const toggleZenMode = useCallback(() => {
    useFocusSessionStore.setState((s) => ({ isZenOpen: !s.isZenOpen }))
  }, [])

  const setIsMinimized = useCallback((min: boolean) => {
    useFocusSessionStore.setState({ isMinimized: min })
  }, [])

  const toggleMinimized = useCallback(() => {
    useFocusSessionStore.setState((s) => ({ isMinimized: !s.isMinimized }))
  }, [])

  const handleSetSessionNote = useCallback(
    (note: string) => {
      useFocusSessionStore.setState({ sessionNote: note })
      sessionNoteRef.current = note
      const { isActive, isPaused, isBreak, totalSeconds, activeGoal } =
        useFocusSessionStore.getState()
      if (isActive) {
        broadcastTaskbarTimer(
          true,
          isPaused,
          isBreak,
          secondsRemainingRef.current,
          totalSeconds,
          activeGoal
        )
      }
    },
    [broadcastTaskbarTimer]
  )

  const resetSession = useCallback(() => {
    if (pauseStartEpochRef.current > 0) {
      const pausedDurationMs = Date.now() - pauseStartEpochRef.current
      if (pausedDurationMs >= 40000) {
        const pausedMins = Math.max(1, Math.round(pausedDurationMs / 60000))
        const breakEntry: LogEntry = {
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          startedAt: new Date(pauseStartEpochRef.current).toISOString(),
          endedAt: new Date().toISOString(),
          text: 'Break',
          productivity: 'break',
          durationMinutes: pausedMins,
          productiveMinutes: 0
        }
        if (window.api?.logs) {
          window.api.logs
            .append(localDateStr(new Date(), dayCutoffHourRef.current), breakEntry, false)
            .catch(() => {})
        }
      }
    }
    sessionStartEpochRef.current = 0
    pauseStartEpochRef.current = 0
    accumulatedPausedMsRef.current = 0
    targetSecondsRef.current = 25 * 60
    secondsRemainingRef.current = 0
    secondsElapsedRef.current = 0
    hasNotedOnPauseRef.current = false
    sessionNoteRef.current = ''
    isOvertimeRef.current = false

    useFocusSessionStore.getState().resetSession()
    timerControlRef.current?.setTimer(0, 0, 25 * 60)
    broadcastTaskbarTimer(false, false, false, 0, 0, null)
  }, [broadcastTaskbarTimer])

  const completeTask = useCallback(
    async (noteOverride?: string) => {
      const { activeGoal, sessionNote, startedAt } = useFocusSessionStore.getState()
      if (!activeGoal) {
        resetSession()
        return
      }

      const elapsed = Math.max(
        secondsElapsedRef.current,
        useFocusSessionStore.getState().secondsElapsed
      )
      const endIso = new Date().toISOString()
      const startIso = startedAt || new Date(Date.now() - elapsed * 1000).toISOString()
      const elapsedMinutes = Math.max(1, Math.round(elapsed / 60))
      const finalNote = (noteOverride ?? sessionNote).trim()

      let taskEndIso = endIso
      let taskMinutes = elapsedMinutes
      let breakEntry: LogEntry | null = null

      // If user was in overtime for > 2 min without selecting, count the overtime as break!
      if (elapsed > targetSecondsRef.current + 2 * 60) {
        const overtimeSec = elapsed - targetSecondsRef.current
        const breakSec = overtimeSec - 2 * 60
        const breakMinutes = Math.max(1, Math.round(breakSec / 60))
        taskMinutes = Math.max(1, elapsedMinutes - breakMinutes)
        taskEndIso = new Date(Date.now() - breakSec * 1000).toISOString()
        breakEntry = {
          id: crypto.randomUUID(),
          timestamp: endIso,
          startedAt: taskEndIso,
          endedAt: endIso,
          text: 'Break',
          productivity: 'break',
          durationMinutes: breakMinutes,
          productiveMinutes: 0
        }
      }

      // If completed while paused, log pause as break if >= 40s and clip task end to pause start
      if (pauseStartEpochRef.current > 0) {
        const pauseDurationMs = Date.now() - pauseStartEpochRef.current
        if (pauseDurationMs >= 40000) {
          const pausedMins = Math.max(1, Math.round(pauseDurationMs / 60000))
          const pauseStartIso = new Date(pauseStartEpochRef.current).toISOString()
          taskEndIso = pauseStartIso
          breakEntry = {
            id: crypto.randomUUID(),
            timestamp: endIso,
            startedAt: pauseStartIso,
            endedAt: endIso,
            text: 'Break',
            productivity: 'break',
            durationMinutes: pausedMins,
            productiveMinutes: 0
          }
        }
        pauseStartEpochRef.current = 0
      }

      const alreadyNoted = hasNotedOnPauseRef.current && elapsed === 0
      if (!alreadyNoted) {
        const entry: LogEntry = {
          id: crypto.randomUUID(),
          timestamp: taskEndIso,
          text: activeGoal.title,
          startedAt: startIso,
          endedAt: taskEndIso,
          goalId: activeGoal.id,
          goalTitle: activeGoal.title,
          note: finalNote || undefined,
          productivity: 'productive',
          durationMinutes: taskMinutes,
          productiveMinutes: taskMinutes
        }

        try {
          if (window.api?.logs) {
            const dateStr =
              activeGoal?.date ||
              useFocusSessionStore.getState().effectiveDate ||
              localDateStr(new Date(startIso), dayCutoffHourRef.current)
            await window.api.logs.append(dateStr, entry)
            if (breakEntry) {
              await window.api.logs.append(dateStr, breakEntry, false)
            }
          }
          if (window.api?.scheduler?.submit) {
            window.api.scheduler.submit()
          }
        } catch (err) {
          console.error('Failed to append log on task completion:', err)
        }
      } else if (breakEntry) {
        try {
          if (window.api?.logs) {
            const dateStr = localDateStr(new Date(), dayCutoffHourRef.current)
            await window.api.logs.append(dateStr, breakEntry, false)
          }
          if (window.api?.scheduler?.submit) {
            window.api.scheduler.submit()
          }
        } catch (err) {
          console.error('Failed to append break log on task completion:', err)
        }
      }

      if (onUpdateDailyGoalRef.current) {
        try {
          await onUpdateDailyGoalRef.current({
            ...activeGoal,
            status: 'done',
            completedAt: endIso
          })
        } catch (err) {
          console.error('Failed to update goal to done:', err)
        }
      }

      playChime('complete')
      toast.success(
        `"${activeGoal.title}" marked complete with ${formatMinutes(elapsedMinutes)} logged.`,
        'Task Completed!'
      )

      resetSession()

      if (onDataRefreshRef.current) {
        await onDataRefreshRef.current()
      }
    },
    [resetSession, playChime, toast]
  )

  const endSession = useCallback(
    async (noteOverride?: string) => {
      if (emptyInProgressStartEpochRef.current > 0) {
        await logEmptyInProgressBreak()
      }
      const { activeGoal, isBreak, sessionNote, startedAt } = useFocusSessionStore.getState()
      if (!activeGoal && !isBreak) {
        resetSession()
        return
      }

      const elapsed = Math.max(
        secondsElapsedRef.current,
        useFocusSessionStore.getState().secondsElapsed
      )
      const endIso = new Date().toISOString()
      const startIso = startedAt || new Date(Date.now() - elapsed * 1000).toISOString()
      const finalNote = (noteOverride ?? sessionNote).trim()

      let breakEntry: LogEntry | null = null
      let taskEndIso = endIso

      // If ended while paused, log pause as break if >= 40s and clip task end to pause start
      if (pauseStartEpochRef.current > 0) {
        const pauseDurationMs = Date.now() - pauseStartEpochRef.current
        if (pauseDurationMs >= 40000) {
          const pausedMins = Math.max(1, Math.round(pauseDurationMs / 60000))
          const pauseStartIso = new Date(pauseStartEpochRef.current).toISOString()
          taskEndIso = pauseStartIso
          breakEntry = {
            id: crypto.randomUUID(),
            timestamp: endIso,
            startedAt: pauseStartIso,
            endedAt: endIso,
            text: 'Break',
            productivity: 'break',
            durationMinutes: pausedMins,
            productiveMinutes: 0
          }
        }
        pauseStartEpochRef.current = 0
      }

      if (elapsed >= 40) {
        const elapsedMinutes = Math.round(elapsed / 60)
        let loggedMins = Math.max(1, elapsedMinutes)

        // If focus session was in overtime for > 2 min without ending, count the overtime as break!
        if (!isBreak && elapsed > targetSecondsRef.current + 2 * 60) {
          const overtimeSec = elapsed - targetSecondsRef.current
          const breakSec = overtimeSec - 2 * 60
          const breakMinutes = Math.max(1, Math.round(breakSec / 60))
          loggedMins = Math.max(1, elapsedMinutes - breakMinutes)
          taskEndIso = new Date(Date.now() - breakSec * 1000).toISOString()
          breakEntry = {
            id: crypto.randomUUID(),
            timestamp: endIso,
            startedAt: taskEndIso,
            endedAt: endIso,
            text: 'Break',
            productivity: 'break',
            durationMinutes: breakMinutes,
            productiveMinutes: 0
          }
        }

        const entry: LogEntry = {
          id: crypto.randomUUID(),
          timestamp: taskEndIso,
          text: isBreak ? 'Break' : activeGoal?.title || 'Focus Session',
          startedAt: startIso,
          endedAt: taskEndIso,
          goalId: isBreak ? undefined : activeGoal?.id,
          goalTitle: isBreak ? undefined : activeGoal?.title,
          note: finalNote || undefined,
          productivity: isBreak ? 'break' : 'productive',
          durationMinutes: loggedMins,
          productiveMinutes: isBreak ? 0 : loggedMins
        }

        try {
          if (window.api?.logs) {
            const dateStr =
              activeGoal?.date ||
              useFocusSessionStore.getState().effectiveDate ||
              localDateStr(new Date(startIso), dayCutoffHourRef.current)
            await window.api.logs.append(dateStr, entry)
            if (breakEntry) {
              await window.api.logs.append(dateStr, breakEntry, false)
            }
          }
          if (window.api?.scheduler?.submit) {
            window.api.scheduler.submit()
          }
          if (isBreak) {
            toast.info(`Logged ${formatMinutes(loggedMins)} break time.`, 'Break Ended')
          } else if (activeGoal) {
            const breakNotice = breakEntry
              ? ` and ${formatMinutes(breakEntry.durationMinutes || 0)} break`
              : ''
            toast.success(
              `Logged ${formatMinutes(loggedMins)} focus${breakNotice} on "${activeGoal.title}".`,
              'Session Saved'
            )
          }
        } catch (err) {
          console.error('Failed to append log on session end:', err)
        }
      } else if (breakEntry) {
        try {
          if (window.api?.logs) {
            const dateStr = localDateStr(new Date(), dayCutoffHourRef.current)
            await window.api.logs.append(dateStr, breakEntry, false)
          }
          if (window.api?.scheduler?.submit) {
            window.api.scheduler.submit()
          }
          toast.info(
            `Logged ${formatMinutes(breakEntry.durationMinutes || 0)} break time.`,
            'Break Ended'
          )
        } catch (err) {
          console.error('Failed to append break log on session end:', err)
        }
      } else {
        toast.info(
          isBreak ? 'Break ended.' : 'Focus session ended (under 1 minute not logged).',
          isBreak ? 'Break Finished' : 'Session Ended'
        )
      }

      // When ending session on an in-progress goal, move it back to 'planned'
      if (activeGoal && activeGoal.status === 'in_progress' && onUpdateDailyGoalRef.current) {
        try {
          await onUpdateDailyGoalRef.current({
            ...activeGoal,
            status: 'planned'
          })
        } catch (err) {
          console.error('Failed to update goal to planned on endSession:', err)
        }
      }

      resetSession()

      if (onDataRefreshRef.current) {
        await onDataRefreshRef.current()
      }
    },
    [resetSession, toast, logEmptyInProgressBreak]
  )

  // Listen to remote toggle pause events from desktop widget
  useEffect(() => {
    if (typeof window === 'undefined' || !window.api?.session?.onTogglePause) return
    const cleanup = window.api.session.onTogglePause(() => {
      const state = useFocusSessionStore.getState()
      if (state.isActive) {
        togglePause()
      } else {
        const goals = availableGoalsRef.current || []
        const targetGoal =
          goals.find((g) => g.status === 'in_progress') ||
          goals.find((g) => g.status === 'planned') ||
          goals.find((g) => g.status !== 'done') ||
          (goals.length > 0 ? goals[0] : null)
        if (targetGoal) {
          startFocus(targetGoal).catch(() => {})
        } else {
          toast.info('Plan tasks first to start a focus session.', 'No Tasks')
        }
      }
    })
    return () => {
      if (typeof cleanup === 'function') cleanup()
    }
  }, [togglePause, startFocus, toast])

  const restartSession = useCallback(
    async (isSnooze = false) => {
      const goals = availableGoalsRef.current || []
      const inProgressGoals = goals.filter((g) => !g.deletedAt && g.status === 'in_progress')
      const sorted = [...inProgressGoals].sort((a, b) => {
        const orderA = typeof a.sortOrder === 'number' ? a.sortOrder : 1000
        const orderB = typeof b.sortOrder === 'number' ? b.sortOrder : 1000
        if (orderA !== orderB) return orderA - orderB
        return (a.createdAt || '').localeCompare(b.createdAt || '')
      })
      const currentState = useFocusSessionStore.getState()
      const targetGoal =
        (isSnooze && currentState.activeGoal) ||
        sorted[0] ||
        goals.find((g) => !g.deletedAt && g.status !== 'done') ||
        (goals.length > 0 ? goals[0] : null)

      if (!targetGoal && inProgressGoals.length === 0) {
        toast.info('Move a task to in progress to start focusing.', 'No In-Progress Tasks')
        resetSession()
        if (emptyInProgressStartEpochRef.current === 0) {
          const now = Date.now()
          emptyInProgressStartEpochRef.current = now
          useFocusSessionStore.setState({ emptyInProgressStartEpoch: now })
          broadcastTaskbarTimer(false, false, false, 0, 0, null)
        }
        return
      }

      if (emptyInProgressStartEpochRef.current > 0) {
        await logEmptyInProgressBreak()
      }

      const defaultMins = defaultIntervalMinutesRef.current || 45
      const targetSec = defaultMins * 60
      const now = Date.now()
      let nextSnoozeCount = isSnooze ? (currentState.snoozeCount || 0) + 1 : 0
      if (!isSnooze && typeof window !== 'undefined' && window.api?.scheduler?.getStatus) {
        try {
          const s = (await window.api.scheduler.getStatus()) as ReminderStatus
          if (typeof s?.snoozeCount === 'number') {
            nextSnoozeCount = s.snoozeCount
          }
        } catch {
          // ignore
        }
      }

      sessionStartEpochRef.current = now
      afkBreakStartEpochRef.current = 0
      pauseStartEpochRef.current = 0
      accumulatedPausedMsRef.current = 0
      targetSecondsRef.current = targetSec
      secondsRemainingRef.current = targetSec
      secondsElapsedRef.current = 0
      isOvertimeRef.current = false
      sessionNoteRef.current = isSnooze ? currentState.sessionNote : ''
      startedAtRef.current = new Date(now).toISOString()

      useFocusSessionStore.setState({
        activeGoal: targetGoal ?? null,
        isActive: true,
        isPaused: false,
        isBreak: false,
        isAfk: false,
        isOvertime: false,
        snoozeCount: nextSnoozeCount,
        totalSeconds: targetSec,
        secondsRemaining: targetSec,
        secondsElapsed: 0,
        startedAt: startedAtRef.current,
        sessionNote: sessionNoteRef.current,
        isMinimized: false,
        sessionStartEpoch: now,
        afkBreakStartEpoch: 0,
        pauseStartEpoch: 0,
        accumulatedPausedMs: 0,
        targetSeconds: targetSec
      })

      timerControlRef.current?.setTimer(targetSec, 0, targetSec)
      playChime('start')
      broadcastTaskbarTimer(true, false, false, targetSec, targetSec, targetGoal ?? null)
    },
    [broadcastTaskbarTimer, playChime, resetSession, toast, logEmptyInProgressBreak]
  )

  // Listen to remote quick action events from system tray
  useEffect(() => {
    if (typeof window === 'undefined' || !window.api?.session?.onQuickAction) return
    const cleanup = window.api.session.onQuickAction((action, payload) => {
      switch (action) {
        case 'add-5m':
          addMinutes(5)
          break
        case 'start-afk-break': {
          const epochNum = payload ? parseInt(payload, 10) : undefined
          startAfkBreak(epochNum).catch(() => {})
          break
        }
        case 'start-break': {
          const state = useFocusSessionStore.getState()
          if (state.isActive && state.isBreak) {
            restartSession(false).catch(() => {})
          } else {
            startBreak(2)
          }
          break
        }
        case 'complete-task':
          completeTask()
          break
        case 'restart-session':
          restartSession(false).catch(() => {})
          break
        case 'snooze':
          restartSession(true).catch(() => {})
          break
        case 'switch-task':
          break
        case 'toggle-pause': {
          const state = useFocusSessionStore.getState()
          if (state.isActive) {
            togglePause()
          } else {
            const goals = availableGoalsRef.current || []
            const targetGoal =
              goals.find((g) => !g.deletedAt && g.status === 'in_progress') ||
              goals.find((g) => !g.deletedAt && g.status === 'planned') ||
              goals.find((g) => !g.deletedAt && g.status !== 'done') ||
              (goals.length > 0 ? goals[0] : null)
            if (targetGoal) {
              startFocus(targetGoal).catch(() => {})
            } else {
              toast.info('Plan tasks first to start a focus session.', 'No Tasks')
            }
          }
          break
        }
        case 'pause': {
          const state = useFocusSessionStore.getState()
          if (state.isActive && !state.isPaused) {
            pauseFocus()
          }
          break
        }
        case 'resume': {
          const state = useFocusSessionStore.getState()
          if (state.isActive && state.isPaused) {
            void resumeFocus()
          }
          break
        }
      }
    })
    return () => {
      if (typeof cleanup === 'function') cleanup()
    }
  }, [
    togglePause,
    startFocus,
    addMinutes,
    startBreak,
    completeTask,
    restartSession,
    toast,
    pauseFocus,
    resumeFocus,
    startAfkBreak
  ])

  // Auto-manage focus session timer based on in-progress tasks:
  // 1. When tasks are in "in progress": top-most task tracked by default
  // 2. Switching, completing, moving to planned, or deleting cleanly updates/starts timer
  // 3. When in-progress becomes empty (0 tasks): timer stops and waits in idle
  const isSyncingInProgressRef = useRef(false)
  const hasPendingSyncRef = useRef(false)
  const latestAvailableGoalsRef = useRef(availableGoals)
  latestAvailableGoalsRef.current = availableGoals
  const previousGoalsMapRef = useRef<Map<string, DailyGoal['status']>>(new Map())
  const previousTopGoalIdRef = useRef<string | null>(null)
  const hasInitializedGoalsRef = useRef(false)

  useEffect(() => {
    latestAvailableGoalsRef.current = availableGoals
    if (!availableGoals || !isSessionHydrated) return

    const syncTimerWithInProgressTasks = async (): Promise<void> => {
      if (isSyncingInProgressRef.current) {
        hasPendingSyncRef.current = true
        return
      }
      isSyncingInProgressRef.current = true

      try {
        do {
          hasPendingSyncRef.current = false
          const currentGoals = latestAvailableGoalsRef.current
          if (!currentGoals || !isSessionHydrated) break

          const inProgressGoals = currentGoals
            .filter((g) => !g.deletedAt && g.status === 'in_progress')
            .sort((a, b) => {
              const orderA = typeof a.sortOrder === 'number' ? a.sortOrder : DEFAULT_SORT_ORDER
              const orderB = typeof b.sortOrder === 'number' ? b.sortOrder : DEFAULT_SORT_ORDER
              if (orderA !== orderB) return orderA - orderB
              return (a.createdAt || '').localeCompare(b.createdAt || '')
            })

          const state = useFocusSessionStore.getState()
          const prevMap = previousGoalsMapRef.current
          const hadInProgressBefore = Array.from(prevMap.values()).some((s) => s === 'in_progress')

          const commitStateMaps = (): void => {
            const nextMap = new Map<string, DailyGoal['status']>()
            for (const g of currentGoals) {
              if (!g.deletedAt) {
                nextMap.set(g.id, g.status)
              }
            }
            previousGoalsMapRef.current = nextMap
            if (currentGoals.some((g) => !g.deletedAt && g.status === 'in_progress')) {
              const sorted = currentGoals
                .filter((g) => !g.deletedAt && g.status === 'in_progress')
                .sort((a, b) => {
                  const orderA = typeof a.sortOrder === 'number' ? a.sortOrder : DEFAULT_SORT_ORDER
                  const orderB = typeof b.sortOrder === 'number' ? b.sortOrder : DEFAULT_SORT_ORDER
                  if (orderA !== orderB) return orderA - orderB
                  return (a.createdAt || '').localeCompare(b.createdAt || '')
                })
              previousTopGoalIdRef.current = sorted[0]?.id ?? null
            } else {
              previousTopGoalIdRef.current = null
            }
          }

          // On initial render when availableGoals is first provided
          if (!hasInitializedGoalsRef.current) {
            hasInitializedGoalsRef.current = true
            if (inProgressGoals.length > 0) {
              previousTopGoalIdRef.current = inProgressGoals[0].id
              if (emptyInProgressStartEpochRef.current > 0) {
                await logEmptyInProgressBreak()
              }
              if (!state.isActive) {
                await startFocus(inProgressGoals[0])
              }
            } else {
              // Count time as break when no task is in "in progress"
              if (emptyInProgressStartEpochRef.current === 0) {
                const now = Date.now()
                emptyInProgressStartEpochRef.current = now
                useFocusSessionStore.setState({ emptyInProgressStartEpoch: now })
                broadcastTaskbarTimer(false, false, false, 0, 0, null)
              }
            }
            commitStateMaps()
            continue
          }

          // Check if user accidentally moved a task to completed and dragged/moved it back to in progress
          const reopenedToInProgress = inProgressGoals.find((g) => prevMap.get(g.id) === 'done')
          if (reopenedToInProgress) {
            previousTopGoalIdRef.current = inProgressGoals[0].id
            if (emptyInProgressStartEpochRef.current > 0) {
              await logEmptyInProgressBreak()
            }
            await startFocus(reopenedToInProgress)
            commitStateMaps()
            continue
          }

          // When in-progress section becomes empty (0 tasks)
          if (hadInProgressBefore && inProgressGoals.length === 0) {
            previousTopGoalIdRef.current = null
            if (state.isActive && !state.isBreak && state.activeGoal) {
              const currentGoal = currentGoals.find((g) => g.id === state.activeGoal?.id)
              const mode =
                !currentGoal || currentGoal.deletedAt
                  ? 'deleted'
                  : currentGoal.status === 'done'
                    ? 'done'
                    : 'planned'
              await logActiveTaskElapsed(state.activeGoal, mode)
              resetSession()
            }
            // Count time as break when no task is in "in progress"
            if (emptyInProgressStartEpochRef.current === 0) {
              const now = Date.now()
              emptyInProgressStartEpochRef.current = now
              useFocusSessionStore.setState({ emptyInProgressStartEpoch: now })
              broadcastTaskbarTimer(false, false, false, 0, 0, null)
            }
            commitStateMaps()
            continue
          }

          // When session is NOT active, but in-progress tasks exist: start top-most task
          if (!state.isActive) {
            if (inProgressGoals.length > 0) {
              previousTopGoalIdRef.current = inProgressGoals[0].id
              if (emptyInProgressStartEpochRef.current > 0) {
                await logEmptyInProgressBreak()
              }
              await startFocus(inProgressGoals[0])
            }
            commitStateMaps()
            continue
          }

          // When session IS active:
          const currentGoal = state.activeGoal
          if (currentGoal) {
            const currentInGoals = currentGoals.find((g) => g.id === currentGoal.id)
            const activeTaskWasInProgress = Boolean(
              currentGoal.status === 'in_progress' || prevMap.get(currentGoal.id) === 'in_progress'
            )
            const isDeleted = !currentInGoals || Boolean(currentInGoals.deletedAt)
            const isDone = currentInGoals?.status === 'done'
            const isPlanned = currentInGoals?.status === 'planned'

            if (activeTaskWasInProgress && (isDeleted || isDone || isPlanned)) {
              const mode = isDeleted ? 'deleted' : isDone ? 'done' : 'planned'
              await logActiveTaskElapsed(currentGoal, mode)
              resetSession()

              // If another in-progress task exists, auto-start timer on top-most remaining task
              if (inProgressGoals.length > 0) {
                previousTopGoalIdRef.current = inProgressGoals[0].id
                if (emptyInProgressStartEpochRef.current > 0) {
                  await logEmptyInProgressBreak()
                }
                await startFocus(inProgressGoals[0])
              } else {
                // Count time as break when no task is in "in progress"
                const now = Date.now()
                emptyInProgressStartEpochRef.current = now
                useFocusSessionStore.setState({ emptyInProgressStartEpoch: now })
                broadcastTaskbarTimer(false, false, false, 0, 0, null)
              }
              commitStateMaps()
              continue
            }
          }
          commitStateMaps()
        } while (hasPendingSyncRef.current)
      } finally {
        isSyncingInProgressRef.current = false
      }
    }

    void syncTimerWithInProgressTasks()
  }, [
    availableGoals,
    isSessionHydrated,
    startFocus,
    logActiveTaskElapsed,
    resetSession,
    broadcastTaskbarTimer,
    logEmptyInProgressBreak
  ])

  const isGoalFocused = useCallback((goalId: string): boolean => {
    const { isActive, activeGoal } = useFocusSessionStore.getState()
    return isActive && activeGoal?.id === goalId
  }, [])

  const actionsValue = useMemo<FocusSessionActions>(
    () => ({
      startFocus,
      startBreak,
      pauseFocus,
      resumeFocus,
      togglePause,
      addMinutes,
      setSessionNote: handleSetSessionNote,
      openZenMode,
      closeZenMode,
      toggleZenMode,
      setIsMinimized,
      toggleMinimized,
      completeTask,
      endSession,
      isGoalFocused,
      restartSession
    }),
    [
      startFocus,
      startBreak,
      pauseFocus,
      resumeFocus,
      togglePause,
      addMinutes,
      handleSetSessionNote,
      openZenMode,
      closeZenMode,
      toggleZenMode,
      setIsMinimized,
      toggleMinimized,
      completeTask,
      endSession,
      isGoalFocused,
      restartSession
    ]
  )

  const handleZeroReached = useCallback(() => {
    // 1. Play session complete chime sound
    playChime('complete')

    // 2. Pause background timer at 00:00 (designate Main as authoritative master)
    const { targetSeconds, activeGoal, isBreak } = useFocusSessionStore.getState()
    const target = targetSecondsRef.current || targetSeconds || 45 * 60
    secondsRemainingRef.current = 0
    secondsElapsedRef.current = target
    isOvertimeRef.current = false
    const now = Date.now()
    pauseStartEpochRef.current = now

    useFocusSessionStore.setState({
      secondsRemaining: 0,
      secondsElapsed: target,
      isPaused: true,
      isOvertime: false,
      pauseStartEpoch: now
    })
    timerControlRef.current?.setTimer(0, target, target)

    // Authoritatively synchronize zero-crossing transition with Main process
    if (typeof window !== 'undefined' && window.api?.session) {
      if (typeof window.api.session.notifyZeroReached === 'function') {
        window.api.session.notifyZeroReached(true)
      } else {
        broadcastTaskbarTimer(true, true, isBreak, 0, target, activeGoal)
      }
    }

    // 4. Prompt window appears on active monitor (where user cursor is)
    if (typeof window !== 'undefined' && window.api?.scheduler) {
      if (typeof window.api.scheduler.showPrompt === 'function') {
        window.api.scheduler.showPrompt()
      } else if (typeof window.api.scheduler.focusPrompt === 'function') {
        window.api.scheduler.focusPrompt()
      }
    }
    toast.success('Focus session complete! What did you do?', 'Timer Up')
  }, [playChime, broadcastTaskbarTimer, toast])

  const setIsOvertime = useCallback((action: boolean | React.SetStateAction<boolean>) => {
    const next =
      typeof action === 'function' ? action(useFocusSessionStore.getState().isOvertime) : action
    useFocusSessionStore.getState().setIsOvertime(next)
  }, [])

  return (
    <FocusSessionActionsContext.Provider value={actionsValue}>
      <FocusSessionTimerRunner
        sessionStartEpochRef={sessionStartEpochRef}
        afkBreakStartEpochRef={afkBreakStartEpochRef}
        pauseStartEpochRef={pauseStartEpochRef}
        accumulatedPausedMsRef={accumulatedPausedMsRef}
        targetSecondsRef={targetSecondsRef}
        secondsRemainingRef={secondsRemainingRef}
        secondsElapsedRef={secondsElapsedRef}
        isOvertimeRef={isOvertimeRef}
        setIsOvertime={setIsOvertime}
        broadcastTaskbarTimer={broadcastTaskbarTimer}
        onZeroReached={handleZeroReached}
        timerControlRef={timerControlRef}
      />
      {children}
    </FocusSessionActionsContext.Provider>
  )
}

interface FocusSessionTimerRunnerProps {
  sessionStartEpochRef: React.MutableRefObject<number>
  afkBreakStartEpochRef: React.MutableRefObject<number>
  pauseStartEpochRef: React.MutableRefObject<number>
  accumulatedPausedMsRef: React.MutableRefObject<number>
  targetSecondsRef: React.MutableRefObject<number>
  secondsRemainingRef: React.MutableRefObject<number>
  secondsElapsedRef: React.MutableRefObject<number>
  isOvertimeRef: React.MutableRefObject<boolean>
  setIsOvertime: (action: boolean | React.SetStateAction<boolean>) => void
  broadcastTaskbarTimer: (
    active: boolean,
    paused: boolean,
    isBreakSession: boolean,
    remainingSec: number,
    totalSec: number,
    goal?: DailyGoal | null,
    metaOverride?: TaskbarTimerMetadata
  ) => void
  onZeroReached: () => void
  timerControlRef: React.MutableRefObject<{
    setTimer: (remaining: number, elapsed: number, total: number) => void
  } | null>
}

function FocusSessionTimerRunner({
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
}: FocusSessionTimerRunnerProps): null {
  const isActive = useSessionIsActive()
  const isPaused = useSessionIsPaused()
  const isBreak = useSessionIsBreak()
  const isAfk = useSessionIsAfk()
  const totalSeconds = useSessionTotalSeconds()
  const activeGoal = useSessionActiveGoal()

  useFocusSessionTimerEngine({
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
  })

  return null
}
