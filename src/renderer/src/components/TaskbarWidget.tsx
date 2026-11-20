import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  DailyGoal,
  ReminderStatus,
  SessionTimerPayload,
  SyncTarget,
  HeatmapData,
  localDateStr,
  shiftDate
} from '../../../shared/types'
import { formatSeconds, formatMinutes } from '../lib/utils'

export function TaskbarWidget(): React.JSX.Element {
  const [session, setSession] = useState<SessionTimerPayload | null>(null)
  const [reminderStatus, setReminderStatus] = useState<ReminderStatus | null>(null)
  const [dailyGoals, setDailyGoals] = useState<DailyGoal[]>([])
  const [displaySeconds, setDisplaySeconds] = useState<number>(0)
  const [pauseSeconds, setPauseSeconds] = useState<number>(0)
  const [emptyInProgressSeconds, setEmptyInProgressSeconds] = useState<number>(0)
  const [todayProductiveMinutes, setTodayProductiveMinutes] = useState<number>(0)
  const [dailyFocusTargetMinutes, setDailyFocusTargetMinutes] = useState<number>(480)
  const targetEpochRef = useRef<number>(0)
  const emptyInProgressStartEpochRef = useRef<number>(0)
  const dailyGoalsRef = useRef<DailyGoal[]>([])
  dailyGoalsRef.current = dailyGoals

  // Drag tracking refs
  const isDraggingRef = useRef(false)
  const hasMovedRef = useRef(false)
  const dragOriginRef = useRef<{ mouseX: number; mouseY: number; winX: number; winY: number }>({
    mouseX: 0,
    mouseY: 0,
    winX: 0,
    winY: 0
  })
  const pendingPosRef = useRef<{ x: number; y: number } | null>(null)
  const rafIdRef = useRef<number | null>(null)

  // Synchronized window position
  const posRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const reminderStatusRef = useRef<ReminderStatus | null>(null)

  // Fetch today's productive time
  const fetchTodayMinutes = async (statusOverride?: ReminderStatus | null): Promise<void> => {
    if (typeof window !== 'undefined' && window.api?.logs) {
      try {
        const cutoff =
          (statusOverride !== undefined ? statusOverride : reminderStatusRef.current)
            ?.dayCutoffHour || 0
        const todayStr = localDateStr(new Date(), cutoff)
        const review = await window.api.logs.getDayReview(todayStr)
        if (review && typeof review.totalProductiveMinutes === 'number') {
          setTodayProductiveMinutes(review.totalProductiveMinutes)
          return
        }
        const logs = await window.api.logs.get(todayStr)
        if (Array.isArray(logs)) {
          let mins = 0
          for (const l of logs) {
            if (l.productivity === 'break') continue
            if (typeof l.productiveMinutes === 'number') {
              mins += Math.max(0, Math.round(l.productiveMinutes))
            } else if (l.productivity === 'productive') {
              mins += Math.max(0, Math.round(l.durationMinutes || 0))
            }
          }
          setTodayProductiveMinutes(mins)
        }
      } catch {
        // ignore
      }
    }
  }

  // Fetch today's kanban goals
  const fetchGoals = useCallback(async (statusOverride?: ReminderStatus | null): Promise<void> => {
    if (typeof window !== 'undefined' && window.api?.goals?.get) {
      try {
        const cutoff =
          (statusOverride !== undefined ? statusOverride : reminderStatusRef.current)
            ?.dayCutoffHour || 0
        const todayStr = localDateStr(new Date(), cutoff)
        const goals = await window.api.goals.get(todayStr)
        if (Array.isArray(goals)) {
          setDailyGoals(goals)
        }
      } catch {
        // ignore
      }
    }
  }, [])

  // Fetch current focus session state
  const fetchSession = useCallback(async (): Promise<void> => {
    if (typeof window !== 'undefined' && window.api?.session?.getState) {
      try {
        const state = await window.api.session.getState()
        if (state) {
          setSession(state)
        }
      } catch {
        // ignore
      }
    }
  }, [])

  // Fetch daily target and streak
  const fetchDailyTarget = useCallback(async (): Promise<void> => {
    if (typeof window !== 'undefined' && window.api?.settings) {
      try {
        const settings = await window.api.settings.get()
        if (typeof settings?.dailyFocusTargetMinutes === 'number') {
          setDailyFocusTargetMinutes(settings.dailyFocusTargetMinutes)
        }
      } catch {
        // ignore
      }
    }
  }, [])

  const lastStreakDateRef = useRef<string>('')

  const fetchStreak = useCallback(async (): Promise<void> => {
    if (typeof window !== 'undefined' && window.api?.logs?.getHeatmap) {
      try {
        const cutoff = reminderStatusRef.current?.dayCutoffHour || 0
        const todayStr = localDateStr(new Date(), cutoff)
        const startDate = shiftDate(todayStr, -60)
        const data: HeatmapData = await window.api.logs.getHeatmap(startDate)
        if (data) {
          lastStreakDateRef.current = todayStr
        }
      } catch {
        // ignore
      }
    }
  }, [])

  const checkDayRollover = useCallback((): boolean => {
    const cutoff = reminderStatusRef.current?.dayCutoffHour || 0
    const todayStr = localDateStr(new Date(), cutoff)
    if (lastStreakDateRef.current && todayStr !== lastStreakDateRef.current) {
      lastStreakDateRef.current = todayStr
      fetchStreak()
      fetchTodayMinutes()
      fetchGoals()
      return true
    }
    return false
  }, [fetchStreak, fetchGoals])

  const fetchStatus = useCallback(async (): Promise<void> => {
    if (typeof window !== 'undefined' && window.api?.scheduler) {
      try {
        const status = await window.api.scheduler.getStatus()
        reminderStatusRef.current = status
        setReminderStatus(status)
        fetchTodayMinutes(status)
        fetchGoals(status)
        fetchSession()
        fetchDailyTarget()
        checkDayRollover()
        if (status?.nextPromptTime) {
          targetEpochRef.current = new Date(status.nextPromptTime).getTime()
        }
      } catch {
        // ignore
      }
    }
  }, [fetchGoals, fetchSession, fetchDailyTarget, checkDayRollover])

  useEffect(() => {
    fetchStatus()
    fetchSession()
    fetchStreak()

    const onVisibilityStatus = (): void => {
      if (!document.hidden) {
        fetchStatus()
        fetchSession()
        checkDayRollover()
      }
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityStatus)
    }

    return () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityStatus)
      }
    }
  }, [fetchStatus, fetchSession, fetchStreak, checkDayRollover])

  // Listen to data update events to refresh daily total, goals, and scheduler status
  useEffect(() => {
    if (typeof window === 'undefined' || !window.api?.events) return
    const cleanup = window.api.events.onDataUpdated((target?: SyncTarget) => {
      if (typeof target?.todayMinutes === 'number') {
        setTodayProductiveMinutes(target.todayMinutes)
      } else if (!target?.syncSettings) {
        fetchTodayMinutes()
      }

      if (target?.syncSettings) {
        fetchStatus()
        fetchDailyTarget()
      } else {
        fetchGoals()
          .then(() => updateCountdown())
          .catch(() => {})
        fetchSession()
          .then(() => updateCountdown())
          .catch(() => {})
      }
    })
    return () => {
      if (typeof cleanup === 'function') cleanup()
    }
  }, [fetchStatus, fetchGoals, fetchSession])

  // Listen to session timer broadcasts from main/renderer
  useEffect(() => {
    fetchSession()
    if (typeof window === 'undefined' || !window.api?.session) return

    const cleanup = window.api.session.onSessionUpdate((payload) => {
      setSession(payload)
    })

    return () => {
      if (typeof cleanup === 'function') cleanup()
    }
  }, [fetchSession])

  const sessionRef = useRef<SessionTimerPayload | null>(session)
  sessionRef.current = session
  reminderStatusRef.current = reminderStatus

  const updateCountdown = useCallback((): void => {
    if (typeof document !== 'undefined' && document.hidden) return
    const curSession = sessionRef.current
    const curGoals = dailyGoalsRef.current
    const hasInProgress = Boolean(
      (curGoals && curGoals.some((g) => !g.deletedAt && g.status === 'in_progress')) ||
      (curSession && curSession.isActive)
    )

    if (curSession && curSession.isActive) {
      emptyInProgressStartEpochRef.current = 0
      setEmptyInProgressSeconds(0)

      if (curSession.isAfk) {
        const afkStart =
          curSession.afkBreakStartEpoch ||
          (curSession.startedAt ? new Date(curSession.startedAt).getTime() : 0) ||
          Date.now()
        const elapsedSec = Math.max(0, Math.floor((Date.now() - afkStart) / 1000))
        setDisplaySeconds(elapsedSec)
        setPauseSeconds(0)
      } else if (curSession.isPaused) {
        setDisplaySeconds(curSession.secondsRemaining)
        const pauseStart = curSession.pauseStartEpoch
        if (pauseStart && pauseStart > 0) {
          const pauseElapsedSec = Math.max(0, Math.floor((Date.now() - pauseStart) / 1000))
          setPauseSeconds(pauseElapsedSec)
        } else {
          setPauseSeconds(0)
        }
      } else if (curSession.startedAt) {
        const startMs = new Date(curSession.startedAt).getTime()
        if (!isNaN(startMs) && startMs > 0 && curSession.totalSeconds > 0) {
          const pausedMs = curSession.accumulatedPausedMs || 0
          const elapsedSec = Math.floor((Date.now() - startMs - pausedMs) / 1000)
          const remainingSec = curSession.totalSeconds - elapsedSec
          setDisplaySeconds(remainingSec)
        } else {
          setDisplaySeconds(curSession.secondsRemaining)
        }
        setPauseSeconds(0)
      } else {
        setDisplaySeconds(curSession.secondsRemaining)
        setPauseSeconds(0)
      }
    } else {
      setDisplaySeconds(0)
      setPauseSeconds(0)

      if (!hasInProgress) {
        if (curSession?.emptyInProgressStartEpoch && curSession.emptyInProgressStartEpoch > 0) {
          emptyInProgressStartEpochRef.current = curSession.emptyInProgressStartEpoch
        } else if (!emptyInProgressStartEpochRef.current) {
          emptyInProgressStartEpochRef.current = Date.now()
        }
        const breakElapsedSec = Math.max(
          0,
          Math.floor((Date.now() - emptyInProgressStartEpochRef.current) / 1000)
        )
        setEmptyInProgressSeconds(breakElapsedSec)
      } else {
        emptyInProgressStartEpochRef.current = 0
        setEmptyInProgressSeconds(0)
      }
    }
  }, [])

  // Immediately refresh countdown whenever session, status, or dailyGoals changes
  useEffect(() => {
    updateCountdown()
  }, [session, reminderStatus, dailyGoals, updateCountdown])

  // Persistent ticking countdown timer mounted once without thrashing
  useEffect(() => {
    updateCountdown()
    checkDayRollover()
    const timer = setInterval(() => {
      updateCountdown()
      checkDayRollover()
    }, 500)

    const onVisibilityTimer = (): void => {
      if (!document.hidden) {
        updateCountdown()
        checkDayRollover()
      }
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityTimer)
    }

    return () => {
      clearInterval(timer)
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityTimer)
      }
    }
  }, [updateCountdown, checkDayRollover])

  // Initialize and sync current bounds on mount, and setup mouse event pass-through
  useEffect(() => {
    if (typeof window !== 'undefined' && window.api?.widget) {
      window.api.widget
        .getBounds()
        .then((bounds) => {
          if (bounds && typeof bounds.x === 'number' && typeof bounds.y === 'number') {
            posRef.current = { x: bounds.x, y: bounds.y }
          }
        })
        .catch(() => {})

      // Set initial mouse event handling
      window.api.widget.setIgnoreMouseEvents?.(false)
    }

    const handleWindowMouseMove = (): void => {
      if (typeof window !== 'undefined' && window.api?.widget?.setIgnoreMouseEvents) {
        window.api.widget.setIgnoreMouseEvents(false)
      }
    }

    const handleDocumentMouseLeave = (): void => {
      if (
        !isDraggingRef.current &&
        typeof window !== 'undefined' &&
        window.api?.widget?.setIgnoreMouseEvents
      ) {
        window.api.widget.setIgnoreMouseEvents(true)
      }
    }

    window.addEventListener('mousemove', handleWindowMouseMove)
    document.addEventListener('mouseleave', handleDocumentMouseLeave)

    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove)
      document.removeEventListener('mouseleave', handleDocumentMouseLeave)
    }
  }, [])

  // Listen for position updates from main process (e.g. Snap to Taskbar or monitor changes)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.api?.widget) return

    const cleanup = window.api.widget.onPositionUpdated((pos) => {
      if (!isDraggingRef.current && pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
        posRef.current = pos
      }
    })

    return () => {
      if (typeof cleanup === 'function') cleanup()
    }
  }, [])

  // Pointer-based dragging with requestAnimationFrame for 60/120/144 FPS smooth movement
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return // Left mouse only
    if ((e.target as HTMLElement)?.closest('button')) return // Do not drag on button clicks

    isDraggingRef.current = true
    hasMovedRef.current = false
    dragOriginRef.current = {
      mouseX: e.screenX,
      mouseY: e.screenY,
      winX: posRef.current.x,
      winY: posRef.current.y
    }

    if (window.api?.widget) {
      window.api.widget
        .getBounds()
        .then((bounds) => {
          if (bounds && typeof bounds.x === 'number' && typeof bounds.y === 'number') {
            if (!isDraggingRef.current) {
              posRef.current = { x: bounds.x, y: bounds.y }
            } else if (!hasMovedRef.current) {
              posRef.current = { x: bounds.x, y: bounds.y }
              dragOriginRef.current.winX = bounds.x
              dragOriginRef.current.winY = bounds.y
            }
          }
        })
        .catch(() => {})
    }

    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // ignore
    }
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!isDraggingRef.current) return

    const deltaX = e.screenX - dragOriginRef.current.mouseX
    const deltaY = e.screenY - dragOriginRef.current.mouseY

    if (Math.hypot(deltaX, deltaY) > 2) {
      hasMovedRef.current = true
    }

    if (hasMovedRef.current) {
      const targetX = Math.round(dragOriginRef.current.winX + deltaX)
      const targetY = Math.round(dragOriginRef.current.winY + deltaY)

      pendingPosRef.current = { x: targetX, y: targetY }

      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(() => {
          rafIdRef.current = null
          if (pendingPosRef.current && window.api?.widget) {
            posRef.current = pendingPosRef.current
            window.api.widget.setPosition(pendingPosRef.current)
          }
        })
      }
    }
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!isDraggingRef.current) return
    isDraggingRef.current = false

    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = null
    }

    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }

    if (hasMovedRef.current && window.api?.widget) {
      window.api.widget
        .savePosition()
        .then((saved) => {
          if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
            posRef.current = saved
          }
        })
        .catch(() => {})
    }
  }

  const handleClick = (e?: React.MouseEvent | React.KeyboardEvent): void => {
    if ((e?.target as HTMLElement)?.closest('button')) return
    // Only open app if mouse was not dragged
    if (hasMovedRef.current) {
      e?.preventDefault()
      return
    }
    if (typeof window !== 'undefined' && window.api?.widget) {
      window.api.widget.showApp()
    }
  }

  const hasInProgressTasks = Boolean(
    (dailyGoals && dailyGoals.some((g) => !g.deletedAt && g.status === 'in_progress')) ||
    (session && session.isActive)
  )

  const handleTogglePause = (e?: React.SyntheticEvent): void => {
    e?.stopPropagation()
    e?.preventDefault()
    if (session?.isAfk) {
      if (typeof window !== 'undefined' && window.api?.session?.quickAction) {
        window.api.session.quickAction('restart-session')
      }
      if (typeof window !== 'undefined' && window.api?.scheduler?.submit) {
        window.api.scheduler.submit()
      }
      return
    }
    if (!hasInProgressTasks) {
      if (typeof window !== 'undefined' && window.api?.widget) {
        window.api.widget.showApp()
      }
      return
    }
    if (typeof window !== 'undefined' && window.api?.widget) {
      window.api.widget.toggleSession()
    }
  }

  const handleContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault()
    if (typeof window !== 'undefined' && window.api?.widget) {
      window.api.widget.contextMenu()
    }
  }

  const isDeepFocus = session && session.isActive
  const isPaused = Boolean(session?.isPaused)
  const isOvertime = Boolean(session?.isOvertime)
  const isBreak = Boolean(session?.isBreak)

  const defaultIntervalMins = reminderStatus?.intervalMinutes || 25
  const defaultIntervalSeconds = defaultIntervalMins * 60

  // Daily productive time for tooltip
  const todayMins = Math.max(0, Math.floor(todayProductiveMinutes))
  const line2Value =
    dailyFocusTargetMinutes > 0
      ? `${formatMinutes(todayMins)} / ${formatMinutes(dailyFocusTargetMinutes)}`
      : formatMinutes(todayMins)

  // Daily target progress fraction
  const dailyTargetPct =
    dailyFocusTargetMinutes > 0 ? Math.min(1, todayMins / dailyFocusTargetMinutes) : 0
  const dailyTargetComplete = dailyTargetPct >= 1

  // Focus Ring progress calculation
  const ringRadius = 11
  const ringCircumference = 2 * Math.PI * ringRadius

  let timerText = formatSeconds(defaultIntervalSeconds)
  let timerColorClass = 'text-emerald-600 dark:text-emerald-400 font-bold'
  let ringColor = '#10b981'
  let progressFraction = 0
  let actionTitle = 'Start Focus'
  let tooltipText = 'Focus · Click to open · Drag to move'

  // 1. Paused state (Rule: during pause, note time of green task and start red timer of pause)
  if (isPaused) {
    timerText = formatSeconds(pauseSeconds)
    timerColorClass = 'text-rose-600 dark:text-rose-400 font-bold'
    ringColor = '#f43f5e'
    const pauseTargetSeconds = 300
    progressFraction = Math.min(1, Math.max(0, pauseSeconds / pauseTargetSeconds))
    actionTitle = 'Resume Focus'
    tooltipText = `Focus Paused (counts as break): ${formatSeconds(pauseSeconds)} · Noted focus time (${formatSeconds(displaySeconds)} left) · Today: ${line2Value} · Click to resume`
  }
  // 2. No tasks in In Progress (when no tasks in progress, count up break time in red)
  else if (!hasInProgressTasks) {
    timerText = formatSeconds(emptyInProgressSeconds)
    timerColorClass = 'text-rose-600 dark:text-rose-400 font-bold'
    ringColor = '#f43f5e'
    const breakTargetSeconds = 300
    progressFraction = Math.min(1, Math.max(0, emptyInProgressSeconds / breakTargetSeconds))
    actionTitle = 'No Tasks in Progress'
    tooltipText = `No tasks in progress · Break: ${formatSeconds(emptyInProgressSeconds)} · Today: ${line2Value} · Click to open`
  }
  // 3. Tasks in In Progress (widget runs session timer and green)
  else {
    if (isDeepFocus) {
      if (isOvertime) {
        timerText = `+${formatSeconds(Math.abs(displaySeconds))}`
        timerColorClass = 'text-rose-600 dark:text-rose-400 font-bold'
        ringColor = '#f43f5e'
        progressFraction = 1
        actionTitle = 'Pause Focus'
        tooltipText = `Focus Overtime: +${formatSeconds(Math.abs(displaySeconds))} · Today: ${line2Value} · Click to open`
      } else if (session?.isAfk) {
        timerText = formatSeconds(displaySeconds)
        timerColorClass = 'text-rose-600 dark:text-rose-400 font-bold'
        ringColor = '#f43f5e'
        const referenceTarget = 300
        progressFraction = Math.min(1, Math.max(0, displaySeconds / referenceTarget))
        actionTitle = 'Resume Focus'
        tooltipText = `AFK Break: ${formatSeconds(displaySeconds)} · Today: ${line2Value} · Click to resume`
      } else if (isBreak) {
        timerText = formatSeconds(displaySeconds)
        timerColorClass = 'text-rose-600 dark:text-rose-400 font-bold'
        ringColor = '#f43f5e'
        const total = Math.max(1, session?.totalSeconds || 300)
        const remaining = Math.max(0, displaySeconds)
        const elapsed = Math.max(0, total - remaining)
        progressFraction = Math.min(1, Math.max(0, elapsed / total))
        actionTitle = 'Pause Focus'
        tooltipText = `Break: ${formatSeconds(displaySeconds)} left · Today: ${line2Value} · Click to open`
      } else {
        timerText = formatSeconds(displaySeconds)
        timerColorClass = 'text-emerald-600 dark:text-emerald-400 font-bold'
        ringColor = '#10b981'
        const total = Math.max(1, session?.totalSeconds || 1500)
        const remaining = Math.max(0, displaySeconds)
        const elapsed = Math.max(0, total - remaining)
        progressFraction = Math.min(1, Math.max(0, elapsed / total))
        actionTitle = 'Pause Focus'
        const snoozeBadge =
          reminderStatus?.snoozeCount && reminderStatus.snoozeCount > 0
            ? ` · Snoozed ${reminderStatus.snoozeCount}x`
            : ''
        tooltipText = `Focusing: ${formatSeconds(displaySeconds)} left${snoozeBadge} · Today: ${line2Value} · Click to open`
      }
    } else {
      const remaining = reminderStatus?.isPendingPrompt ? 0 : defaultIntervalSeconds
      timerText = formatSeconds(remaining)
      timerColorClass = 'text-emerald-600 dark:text-emerald-400 font-bold'
      ringColor = '#10b981'
      progressFraction = 0
      actionTitle = 'Start Focus'
      tooltipText = `Focus Ready · Today: ${line2Value} · Click to open · Right-click for options`
    }
  }

  const strokeDashoffset = ringCircumference * (1 - progressFraction)

  // Dynamic layout & typography scaling based on timer length (prevents overflow for long strings like "+1:01:36")
  const isExtraLong = timerText.length >= 9 // e.g. "+10:01:36"
  const isCompact = timerText.length === 8 // e.g. "+1:01:36"
  const isMedium = timerText.length === 7 // e.g. "1:01:36"
  const isSlightlyLong = timerText.length === 6 // e.g. "+02:05"

  let fontSizeClass = 'text-[14.5px]'
  let paddingClass = 'pl-1 pr-2'
  let trackingClass = 'tracking-tight'
  let ringSize = 22
  let buttonSize = 'w-[18px] h-[18px]'
  let iconSize = 10

  if (isExtraLong) {
    fontSizeClass = 'text-[11.5px]'
    paddingClass = 'px-1'
    trackingClass = 'tracking-tighter'
    ringSize = 20
    buttonSize = 'w-[16px] h-[16px]'
    iconSize = 8
  } else if (isCompact) {
    fontSizeClass = 'text-[13px]'
    paddingClass = 'px-1.5'
    trackingClass = 'tracking-tight'
    ringSize = 20
    buttonSize = 'w-[18px] h-[18px]'
    iconSize = 9
  } else if (isMedium) {
    fontSizeClass = 'text-[13px]'
    paddingClass = 'pl-1 pr-1.5'
    trackingClass = 'tracking-tight'
    ringSize = 20
    buttonSize = 'w-[18px] h-[18px]'
    iconSize = 9
  } else if (isSlightlyLong) {
    fontSizeClass = 'text-[14px]'
    paddingClass = 'pl-1 pr-2'
    trackingClass = 'tracking-tight'
    ringSize = 22
    buttonSize = 'w-[18px] h-[18px]'
    iconSize = 10
  }

  // Daily target progress bar color
  const targetBarColor = dailyTargetComplete
    ? 'bg-emerald-500 dark:bg-emerald-400'
    : dailyTargetPct >= 0.75
      ? 'bg-amber-500 dark:bg-amber-400'
      : 'bg-blue-500 dark:bg-blue-400'

  // Outer container dimensions: fixed deskband size
  const outerWidth = 100
  const outerHeight = 32
  const innerWidth = 96
  const innerHeight = 28

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onMouseEnter={() => {
        if (typeof window !== 'undefined' && window.api?.widget?.setIgnoreMouseEvents) {
          window.api.widget.setIgnoreMouseEvents(false)
        }
      }}
      onMouseLeave={() => {
        if (
          !isDraggingRef.current &&
          typeof window !== 'undefined' &&
          window.api?.widget?.setIgnoreMouseEvents
        ) {
          window.api.widget.setIgnoreMouseEvents(true)
        }
      }}
      style={{ width: outerWidth, height: outerHeight, maxHeight: outerHeight }}
      className="relative overflow-hidden flex items-center justify-center select-none bg-transparent cursor-pointer"
    >
      <div
        tabIndex={0}
        role="button"
        aria-label={tooltipText}
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key.toLowerCase() === 'p') {
            e.preventDefault()
            handleTogglePause(e)
          } else if (e.key === 'Enter') {
            e.preventDefault()
            handleClick()
          }
        }}
        style={{ width: innerWidth, height: innerHeight, maxHeight: innerHeight }}
        className={`group relative flex min-w-0 shrink-0 box-border items-center rounded-full border border-black/10 dark:border-white/10 bg-white/80 dark:bg-zinc-950/80 ${paddingClass} py-0.5 backdrop-blur-md shadow-sm transition-all duration-200 ease-out hover:bg-white/95 dark:hover:bg-zinc-900/90 hover:border-black/20 dark:hover:border-white/20 active:bg-zinc-100 dark:active:bg-zinc-900 cursor-pointer select-none text-foreground overflow-hidden`}
        title={tooltipText}
      >
        {/* Play/Pause Focus Button with Progress Ring */}
        <div
          style={{ width: ringSize, height: ringSize }}
          className="relative shrink-0 flex items-center justify-center"
        >
          <svg
            width={ringSize}
            height={ringSize}
            viewBox="0 0 26 26"
            className="-rotate-90 pointer-events-none absolute inset-0"
          >
            {/* Background Track */}
            <circle
              cx="13"
              cy="13"
              r={ringRadius}
              stroke="currentColor"
              className="text-black/10 dark:text-white/10"
              strokeWidth="2.5"
              fill="none"
            />
            {/* Dynamic Progress Fill */}
            <circle
              cx="13"
              cy="13"
              r={ringRadius}
              stroke={ringColor}
              strokeWidth="2.5"
              strokeDasharray={ringCircumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="none"
              className="transition-all duration-300"
            />
          </svg>

          {/* Quick Action Button in Center of Ring */}
          <button
            type="button"
            onClick={handleTogglePause}
            onPointerDown={(e) => {
              e.stopPropagation()
            }}
            onPointerUp={(e) => {
              e.stopPropagation()
            }}
            onMouseDown={(e) => {
              e.stopPropagation()
            }}
            className={`z-10 relative ${buttonSize} flex items-center justify-center rounded-full cursor-pointer focus:outline-none transition-transform duration-150 hover:scale-110 active:scale-95`}
            title={actionTitle}
            aria-label={actionTitle}
          >
            {session?.isAfk ? (
              <svg
                width={iconSize}
                height={iconSize}
                viewBox="0 0 24 24"
                fill="currentColor"
                className="text-rose-500 dark:text-rose-400 translate-x-[0.5px]"
              >
                <polygon points="6 4 20 12 6 20" />
              </svg>
            ) : isPaused ? (
              <svg
                width={iconSize}
                height={iconSize}
                viewBox="0 0 24 24"
                fill="currentColor"
                className="text-rose-500 dark:text-rose-400 translate-x-[0.5px]"
              >
                <polygon points="6 4 20 12 6 20" />
              </svg>
            ) : !hasInProgressTasks ? (
              <svg
                width={iconSize}
                height={iconSize}
                viewBox="0 0 24 24"
                fill="currentColor"
                className="text-rose-500 dark:text-rose-400 hover:text-rose-600 dark:hover:text-rose-300 translate-x-[0.5px] transition-colors"
              >
                <polygon points="6 4 20 12 6 20" />
              </svg>
            ) : isDeepFocus ? (
              isOvertime || isBreak ? (
                <svg
                  width={iconSize}
                  height={iconSize}
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="text-rose-500 dark:text-rose-400"
                >
                  <rect x="5" y="4" width="4" height="16" rx="1.5" />
                  <rect x="15" y="4" width="4" height="16" rx="1.5" />
                </svg>
              ) : (
                <svg
                  width={iconSize}
                  height={iconSize}
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="text-emerald-600 dark:text-emerald-400"
                >
                  <rect x="5" y="4" width="4" height="16" rx="1.5" />
                  <rect x="15" y="4" width="4" height="16" rx="1.5" />
                </svg>
              )
            ) : (
              <svg
                width={iconSize}
                height={iconSize}
                viewBox="0 0 24 24"
                fill="currentColor"
                className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 dark:hover:text-emerald-300 translate-x-[0.5px] transition-colors"
              >
                <polygon points="6 4 20 12 6 20" />
              </svg>
            )}
          </button>
        </div>

        {/* Timer + optional task name */}
        <div className="flex-1 flex items-center justify-center gap-1 min-w-0 overflow-hidden">
          <span
            className={`font-mono ${fontSizeClass} ${trackingClass} font-bold tabular-nums leading-none select-none whitespace-nowrap shrink-0 ${timerColorClass}`}
          >
            {timerText}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              if (typeof window !== 'undefined' && window.api?.session?.quickAction) {
                window.api.session.quickAction('dot-reset')
              }
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className="h-3.5 w-3.5 rounded-full flex items-center justify-center text-amber-500/80 hover:text-amber-500 transition-all hover:scale-110 active:scale-95 cursor-pointer shrink-0 opacity-50 hover:opacity-100"
            title="90s Mind Reset (Trataka)"
            aria-label="90s Mind Reset"
          >
            <span className="text-[10px] leading-none">◉</span>
          </button>
        </div>

        {/* Daily target progress bar — thin bottom edge strip */}
        {dailyFocusTargetMinutes > 0 && (
          <div className="absolute bottom-0 left-1.5 right-1.5 h-0.5 rounded-full bg-black/5 dark:bg-white/5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ease-out ${targetBarColor}`}
              style={{ width: `${Math.round(dailyTargetPct * 100)}%` }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
