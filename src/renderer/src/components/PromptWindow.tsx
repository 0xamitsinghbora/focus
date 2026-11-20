import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import {
  DailyGoal,
  ProductivityLevel,
  ReminderStatus,
  SyncTarget,
  localDateStr,
  DEFAULT_SORT_ORDER,
  LogEntry,
  AudioMode
} from '../../../shared/types'
import { formatTime } from '../lib/utils'
import { FocusLogo } from './FocusLogo'
import { calculateFractionalSortOrders } from './goals/fractionalIndex'
import {
  PromptOption,
  PromptStep,
  PromptTaskSelector,
  PromptDetailInput,
  PromptAfkBreak,
  usePromptNavigation
} from './prompt'

export function PromptWindow(): React.JSX.Element {
  const [goals, setGoals] = useState<DailyGoal[]>([])
  const [reminderStatus, setReminderStatus] = useState<ReminderStatus | null>(null)
  const [step, setStep] = useState<PromptStep>('select')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [note, setNote] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle')
  const [afkSecondsLeft, setAfkSecondsLeft] = useState<number>(40)
  const [afkBreakSeconds, setAfkBreakSeconds] = useState<number>(0)
  const [markCompleted, setMarkCompleted] = useState<boolean>(false)
  const [addToPlanner, setAddToPlanner] = useState<boolean>(false)
  const [focusQuality, setFocusQuality] = useState<number>(4)
  const [audioMode, setAudioMode] = useState<AudioMode | null>(null)

  const detailInputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const inFlightEntryIdRef = useRef<string | null>(null)
  const priorSessionLoggedRef = useRef<boolean>(false)
  const goalsRef = useRef<DailyGoal[]>(goals)
  const stepRef = useRef<PromptStep>(step)
  const noteRef = useRef(note)
  const statusRef = useRef(status)
  const afkSecondsLeftRef = useRef<number>(afkSecondsLeft)
  const focusQualityRef = useRef<number>(focusQuality)
  const loadRequestIdRef = useRef(0)
  const isMountedRef = useRef(true)
  const promptAppearedAtRef = useRef<number>(
    typeof process !== 'undefined' && process.env.NODE_ENV === 'test' ? 0 : Date.now()
  )
  const afkBreakStartEpochRef = useRef<number>(0)

  // Synchronously update refs during render so event handlers never see stale state
  goalsRef.current = goals
  stepRef.current = step
  noteRef.current = note
  statusRef.current = status
  afkSecondsLeftRef.current = afkSecondsLeft
  focusQualityRef.current = focusQuality

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const loadPromptData = useCallback(async () => {
    const requestId = ++loadRequestIdRef.current
    try {
      const schedulerStatus = (await window.api.scheduler.getStatus()) as ReminderStatus
      const cutoff = schedulerStatus?.dayCutoffHour || 0
      const today = localDateStr(new Date(), cutoff)
      const dailyGoals = await window.api.goals.get(today)

      if (!isMountedRef.current || requestId !== loadRequestIdRef.current) return

      const activeGoals = (dailyGoals || [])
        .filter((goal: DailyGoal) => goal.status === 'in_progress' || goal.status === 'planned')
        .sort((a: DailyGoal, b: DailyGoal) => {
          if (a.status === 'in_progress' && b.status !== 'in_progress') return -1
          if (b.status === 'in_progress' && a.status !== 'in_progress') return 1
          const orderA = typeof a.sortOrder === 'number' ? a.sortOrder : DEFAULT_SORT_ORDER
          const orderB = typeof b.sortOrder === 'number' ? b.sortOrder : DEFAULT_SORT_ORDER
          if (orderA !== orderB) return orderA - orderB
          return (a.createdAt || '').localeCompare(b.createdAt || '')
        })
      setGoals(activeGoals)
      setReminderStatus(schedulerStatus)
    } catch (err) {
      if (requestId === loadRequestIdRef.current) {
        console.error('Failed to load prompt data:', err)
      }
    }
  }, [])

  const resetPrompt = useCallback(() => {
    inFlightEntryIdRef.current = null
    priorSessionLoggedRef.current = false
    if (typeof process === 'undefined' || process.env.NODE_ENV !== 'test') {
      promptAppearedAtRef.current = Date.now()
    }
    setStatus('idle')
    setStep('select')
    setSelectedIndex(0)
    setNote('')
    setValidationError(null)
    setMarkCompleted(false)
    setAddToPlanner(false)
    setFocusQuality(4)
    setAudioMode(null)
    setAfkSecondsLeft(40)
    afkBreakStartEpochRef.current = 0
    setAfkBreakSeconds(0)
    loadPromptData()
  }, [loadPromptData])

  // Initial load
  useEffect(() => {
    resetPrompt()
  }, [resetPrompt])

  // User activity resets the 40s AFK timer while in select step
  const handleUserActivity = useCallback(() => {
    if (stepRef.current === 'select') {
      setAfkSecondsLeft(40)
    }
  }, [])

  useEffect(() => {
    window.addEventListener('mousemove', handleUserActivity)
    window.addEventListener('keydown', handleUserActivity)
    window.addEventListener('pointerdown', handleUserActivity)
    return () => {
      window.removeEventListener('mousemove', handleUserActivity)
      window.removeEventListener('keydown', handleUserActivity)
      window.removeEventListener('pointerdown', handleUserActivity)
    }
  }, [handleUserActivity])

  // Focus management: detail input when in detail step, container when in select step
  useEffect(() => {
    if (typeof document === 'undefined' || !document.hasFocus()) return
    if (step === 'detail') {
      detailInputRef.current?.focus()
    } else {
      containerRef.current?.focus()
    }
  }, [step])

  // Listen for prompt:shown from main process to refresh data non-intrusively
  useEffect(() => {
    const cleanup = window.api.scheduler.onPromptShown(() => {
      promptAppearedAtRef.current = Date.now()
      if (
        stepRef.current === 'detail' ||
        stepRef.current === 'afk' ||
        noteRef.current.trim().length > 0 ||
        statusRef.current === 'saving'
      ) {
        loadPromptData()
      } else {
        resetPrompt()
      }
    })
    const handleWindowFocus = (): void => {
      // Note: Do NOT reset promptAppearedAtRef here. Resetting on DOM window focus drops keystrokes
      // when user clicks into the text input field. promptAppearedAtRef is only set on initial show/mount.
      if (statusRef.current !== 'saving' && stepRef.current !== 'afk') {
        loadPromptData()
      }
    }
    window.addEventListener('focus', handleWindowFocus)
    return () => {
      cleanup?.()
      window.removeEventListener('focus', handleWindowFocus)
    }
  }, [resetPrompt, loadPromptData])

  // Listen for data:updated broadcast to keep prompt window synchronized with dashboard changes
  useEffect(() => {
    if (typeof window === 'undefined' || !window.api?.events?.onDataUpdated) return
    const cleanup = window.api.events.onDataUpdated((target?: SyncTarget) => {
      if (target?.syncSettings && !target?.logDates?.length && !target?.goalDates?.length) {
        return
      }
      loadPromptData()
    })
    return () => {
      cleanup?.()
    }
  }, [loadPromptData])

  // Auto-resize window to fit content
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    let lastSentHeight = 0
    let resizeTimer: NodeJS.Timeout | null = null

    const sendResize = (): void => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const neededHeight =
        Math.ceil(
          Math.max(
            containerRef.current.scrollHeight,
            containerRef.current.offsetHeight,
            rect.height
          )
        ) + 16
      // Jitter dampening: only notify main process if height delta is at least 6px
      if (Math.abs(neededHeight - lastSentHeight) >= 6) {
        lastSentHeight = neededHeight
        window.api.scheduler.resizePrompt(neededHeight)
      }
    }

    const debouncedSendResize = (): void => {
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(sendResize, 60)
    }

    const observer = new ResizeObserver(() => {
      debouncedSendResize()
    })
    observer.observe(el)

    sendResize()

    return () => {
      if (resizeTimer) clearTimeout(resizeTimer)
      observer.disconnect()
    }
  }, [step, goals.length])

  const options = useMemo<PromptOption[]>(() => {
    const list: PromptOption[] = goals.map((goal) => ({
      type: 'goal',
      goal,
      id: goal.id,
      title: goal.title
    }))
    list.push({ type: 'other', id: 'other', title: 'Something Else' })
    list.push({ type: 'break', id: 'break', title: 'Break' })
    return list
  }, [goals])

  const submitOption = useCallback(
    async (
      optIndex: number,
      customNote: string = '',
      optionsOverride?: { markCompleted?: boolean; addToPlanner?: boolean }
    ): Promise<void> => {
      if (status === 'saving') return

      const opt = options[optIndex]
      const trimmedNote = customNote.trim()

      // For "something else", detail is mandatory
      if (opt?.type === 'other' && !trimmedNote) {
        setValidationError('Please describe what you worked on.')
        detailInputRef.current?.focus()
        return
      }

      const isBreak = opt?.type === 'break'
      const finalProductivity: ProductivityLevel = isBreak ? 'break' : 'productive'
      const shouldMarkCompleted =
        optionsOverride?.markCompleted !== undefined ? optionsOverride.markCompleted : markCompleted
      const shouldAddToPlanner =
        optionsOverride?.addToPlanner !== undefined ? optionsOverride.addToPlanner : addToPlanner

      let text = ''
      let goalId: string | undefined
      let goalTitle: string | undefined

      if (opt?.type === 'goal') {
        goalId = opt.goal.id
        goalTitle = opt.goal.title
        text = trimmedNote ? `${opt.goal.title}: ${trimmedNote}` : opt.goal.title
      } else if (opt?.type === 'break') {
        text = 'Break'
      } else {
        text = trimmedNote || 'Other'
      }

      setStatus('saving')

      try {
        if (!inFlightEntryIdRef.current) {
          inFlightEntryIdRef.current = crypto.randomUUID()
        }
        const entryId = inFlightEntryIdRef.current

        const now = Date.now()
        const intervalMins = reminderStatus?.intervalMinutes || 45
        const startIso =
          reminderStatus?.currentBlockStartedAt ||
          new Date(now - intervalMins * 60 * 1000).toISOString()
        const endIso = new Date(now).toISOString()
        const durationMins = Math.max(1, Math.round((now - new Date(startIso).getTime()) / 60000))

        const entry: LogEntry = {
          id: entryId,
          timestamp: endIso,
          startedAt: startIso,
          endedAt: endIso,
          text,
          goalId,
          goalTitle,
          goalType: opt?.type === 'goal' ? opt.goal.goalType : undefined,
          audioMode: audioMode ?? undefined,
          note: trimmedNote || undefined,
          productivity: finalProductivity,
          durationMinutes: durationMins,
          productiveMinutes: isBreak ? 0 : durationMins,
          focusQuality: isBreak ? undefined : focusQualityRef.current
        }

        const cutoff = reminderStatus?.dayCutoffHour || 0
        const sessionEffectiveDate =
          opt?.type === 'goal' && opt.goal.date
            ? opt.goal.date
            : localDateStr(new Date(startIso), cutoff)
        const today = sessionEffectiveDate
        await window.api.logs.append(sessionEffectiveDate, entry, true)

        if (opt?.type === 'goal') {
          if (shouldMarkCompleted) {
            // Prompt offers quick checkbox: "Mark task as completed" to move task to completed section without manual dragging
            try {
              await window.api.goals.update(opt.goal.date || sessionEffectiveDate, {
                ...opt.goal,
                status: 'done',
                completedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              })
            } catch (updateErr) {
              console.warn('Failed to mark task as completed:', updateErr)
            }
          } else if (opt.goal.status === 'planned') {
            // If user logged work to a planned goal, automatically promote it to in_progress
            try {
              const inProgressGoals = goalsRef.current.filter((g) => g.status === 'in_progress')
              const orders = calculateFractionalSortOrders(
                inProgressGoals,
                inProgressGoals.length,
                1
              )
              const nextSortOrder = orders && orders.length > 0 ? orders[0] : undefined

              await window.api.goals.update(opt.goal.date || sessionEffectiveDate, {
                ...opt.goal,
                date: opt.goal.date || today,
                status: 'in_progress',
                sortOrder: nextSortOrder !== undefined ? nextSortOrder : opt.goal.sortOrder,
                updatedAt: new Date().toISOString()
              })
            } catch (updateErr) {
              console.warn('Failed to promote planned goal to in_progress:', updateErr)
            }
          } else if (opt.goal.status === 'in_progress') {
            // If user worked on a different in-progress task than original, picking it logs to that task and sets it active for next session
            try {
              const inProgressGoals = goalsRef.current.filter(
                (g) => g.status === 'in_progress' && !g.deletedAt
              )
              if (inProgressGoals.length > 1 && opt.goal.id !== inProgressGoals[0]?.id) {
                const minSortOrder = Math.min(
                  ...inProgressGoals.map((g) =>
                    typeof g.sortOrder === 'number' ? g.sortOrder : DEFAULT_SORT_ORDER
                  )
                )
                await window.api.goals.update(opt.goal.date || today, {
                  ...opt.goal,
                  sortOrder: minSortOrder - 1000,
                  updatedAt: new Date().toISOString()
                })
              }
            } catch (reorderErr) {
              console.warn('Failed to set picked task as active in-progress task:', reorderErr)
            }
          }
        } else if (opt?.type === 'other' && shouldAddToPlanner) {
          // Prompt offers optional checkbox: "Add as task to planner" so spontaneous work is captured
          try {
            if (window.api?.goals?.add) {
              await window.api.goals.add({
                date: today,
                title: trimmedNote,
                status: 'planned'
              })
            }
          } catch (addErr) {
            console.warn('Failed to add spontaneous work to planner:', addErr)
          }
        }

        inFlightEntryIdRef.current = null
        window.api.scheduler.submit()
        window.api.session?.quickAction?.('restart-session')
        resetPrompt()
      } catch (err) {
        console.error('Failed to save entry:', err)
        setStatus('error')
        setTimeout(() => setStatus('idle'), 2000)
      }
    },
    [options, status, resetPrompt, reminderStatus, markCompleted, addToPlanner, audioMode]
  )

  const handleSelectOption = useCallback(
    (index: number) => {
      setSelectedIndex(index)
      const opt = options[index]
      if (opt?.type === 'break') {
        submitOption(index, '')
        return
      }
      setStep('detail')
    },
    [options, submitOption]
  )

  const handleSnooze = useCallback((): void => {
    const interval = reminderStatus?.intervalMinutes || 45
    window.api.scheduler.snooze(interval)
    window.api.session?.quickAction?.('restart-session')
    resetPrompt()
  }, [resetPrompt, reminderStatus?.intervalMinutes])

  const handleStartDotReset = useCallback((): void => {
    window.api.scheduler.snooze(2)
    window.api.session?.quickAction?.('dot-reset')
    resetPrompt()
  }, [resetPrompt])

  // 1. AFK 40s countdown effect (only while in select step and not saving)
  useEffect(() => {
    if (step !== 'select' || status === 'saving') {
      return
    }

    const interval = setInterval(() => {
      setAfkSecondsLeft((prev) => {
        if (prev <= 1) {
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      clearInterval(interval)
    }
  }, [step, status])

  // 2. Trigger AFK mode when 40 seconds expire
  const handleTriggerAfkBreak = useCallback(async () => {
    if (priorSessionLoggedRef.current) return
    priorSessionLoggedRef.current = true

    const afkStart = Date.now()
    // Clip the preceding session to (afkStart - 40s) so it ends exactly where the 40s break begins
    const taskEndEpoch = afkStart - 40 * 1000

    try {
      const inProgressGoal = goalsRef.current.find((g) => g.status === 'in_progress')
      if (inProgressGoal) {
        const cutoff = reminderStatus?.dayCutoffHour || 0
        const today = localDateStr(new Date(taskEndEpoch), cutoff)
        const entryId = crypto.randomUUID()
        const intervalMins = reminderStatus?.intervalMinutes || 45
        const startIso =
          reminderStatus?.currentBlockStartedAt ||
          new Date(taskEndEpoch - intervalMins * 60 * 1000).toISOString()
        const endIso = new Date(taskEndEpoch).toISOString()
        const durationMins = Math.max(
          1,
          Math.round((taskEndEpoch - new Date(startIso).getTime()) / 60000)
        )

        const entry: LogEntry = {
          id: entryId,
          timestamp: endIso,
          startedAt: startIso,
          endedAt: endIso,
          text: inProgressGoal.title,
          goalId: inProgressGoal.id,
          goalTitle: inProgressGoal.title,
          productivity: 'productive',
          durationMinutes: durationMins,
          productiveMinutes: durationMins
        }
        await window.api.logs.append(today, entry, true)
      }
    } catch (err) {
      console.error('Failed to log completed session on AFK:', err)
    }

    // Switch session, taskbar, and desktop widget to red AFK break mode and pause ambient music
    afkBreakStartEpochRef.current = afkStart
    window.api.session?.quickAction?.('start-afk-break', String(afkStart))
    setStep('afk')
    setAfkBreakSeconds(0)
  }, [reminderStatus])

  useEffect(() => {
    if (afkSecondsLeft === 0 && step === 'select' && status !== 'saving') {
      void handleTriggerAfkBreak()
    }
  }, [afkSecondsLeft, step, status, handleTriggerAfkBreak])

  // 3. Count up AFK break timer in seconds from 0, strictly synchronized with taskbar deskband
  useEffect(() => {
    if (step !== 'afk') return

    const updateAfkTimer = (): void => {
      const start = afkBreakStartEpochRef.current || Date.now()
      const elapsed = Math.max(0, Math.floor((Date.now() - start) / 1000))
      setAfkBreakSeconds(elapsed)
    }

    updateAfkTimer()
    const interval = setInterval(updateAfkTimer, 500)

    return () => {
      clearInterval(interval)
    }
  }, [step])

  // 4. Return from AFK break: log break in red, submit, and restart focus session timer
  const handleReturnFromAfk = useCallback(async (): Promise<void> => {
    if (status === 'saving') return
    setStatus('saving')

    try {
      const now = Date.now()
      const start = afkBreakStartEpochRef.current || now - afkBreakSeconds * 1000
      const elapsed = Math.max(0, Math.floor((now - start) / 1000))
      const totalBreakSec = 40 + elapsed
      const breakMinutes = Math.round(totalBreakSec / 60)
      // If break was less than 1 minute, discard trivial break to keep timeline clean
      if (breakMinutes >= 1) {
        const startIso = new Date(now - totalBreakSec * 1000).toISOString()
        const endIso = new Date(now).toISOString()

        const cutoff = reminderStatus?.dayCutoffHour || 0
        const today = localDateStr(new Date(), cutoff)

        const breakEntry: LogEntry = {
          id: crypto.randomUUID(),
          timestamp: endIso,
          startedAt: startIso,
          endedAt: endIso,
          text: 'Break',
          productivity: 'break',
          durationMinutes: breakMinutes,
          productiveMinutes: 0
        }

        await window.api.logs.append(today, breakEntry, false)
      }

      window.api.scheduler.submit()
      window.api.session?.quickAction?.('restart-session')
      resetPrompt()
    } catch (err) {
      console.error('Failed to log AFK break:', err)
      setStatus('error')
      setTimeout(() => setStatus('idle'), 2000)
    }
  }, [status, afkBreakSeconds, reminderStatus?.dayCutoffHour, resetPrompt])

  // Listen for session timer updates to stay in lockstep synchronization with authoritative session and taskbar widget
  useEffect(() => {
    if (typeof window === 'undefined' || !window.api?.session?.onSessionUpdate) return
    const cleanup = window.api.session.onSessionUpdate((payload) => {
      if (payload?.isAfk && payload.afkBreakStartEpoch) {
        afkBreakStartEpochRef.current = payload.afkBreakStartEpoch
        const elapsed = Math.max(0, Math.floor((Date.now() - payload.afkBreakStartEpoch) / 1000))
        setAfkBreakSeconds(elapsed)
        if (stepRef.current !== 'afk') {
          setStep('afk')
        }
      }
    })
    return () => {
      if (typeof cleanup === 'function') cleanup()
    }
  }, [])

  const safeSelectedIndexMemo = useMemo(() => {
    if (options.length === 0) return 0
    return Math.min(Math.max(0, selectedIndex), options.length - 1)
  }, [selectedIndex, options.length])

  const currentOption = options[safeSelectedIndexMemo]

  const handleSubmit = useCallback(async (): Promise<void> => {
    if (currentOption?.type === 'other' && !note.trim()) {
      setValidationError('Please describe what you worked on.')
      detailInputRef.current?.focus()
      return
    }
    setValidationError(null)
    await submitOption(safeSelectedIndexMemo, note)
  }, [currentOption, submitOption, safeSelectedIndexMemo, note])

  const { safeSelectedIndex, handleKeyDown } = usePromptNavigation({
    step,
    setStep,
    options,
    goalsCount: goals.length,
    selectedIndex,
    setSelectedIndex,
    isSaving: status === 'saving',
    onSelectOption: handleSelectOption,
    onSnooze: handleSnooze,
    onSubmit: handleSubmit,
    onReturnAfk: handleReturnFromAfk,
    onSetFocusQuality: setFocusQuality,
    detailInputRef,
    promptAppearedAtRef
  })

  // Ensure active option is scrolled into view in select step
  useEffect(() => {
    if (step === 'select' && itemRefs.current[safeSelectedIndex]) {
      itemRefs.current[safeSelectedIndex]?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth'
      })
    }
  }, [safeSelectedIndex, step])

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      onClick={() => {
        if (step === 'detail') {
          detailInputRef.current?.focus()
        }
      }}
      className="apple-glass rounded-2xl p-4.5 flex flex-col space-y-3.5 shadow-apple-popover border border-border/70 text-foreground outline-none select-none cursor-default"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-0.5">
        <div className="flex items-center gap-2">
          <FocusLogo size={16} variant="tile" />
          <span className="text-[10.5px] font-semibold tracking-[0.06em] uppercase text-muted-foreground">
            {step === 'afk'
              ? 'Break Session'
              : goals.some((g) => g.status === 'in_progress')
                ? 'Focus Session'
                : 'Check-in'}
          </span>
        </div>
        <span className="text-[11px] font-mono tabular-nums text-muted-foreground/80">
          {step === 'afk'
            ? 'AFK Active'
            : `${formatTime(reminderStatus?.currentBlockStartedAt, '--')} – now`}
        </span>
      </div>

      {step === 'select' && (
        <PromptTaskSelector
          goals={goals}
          safeSelectedIndex={safeSelectedIndex}
          itemRefs={itemRefs}
          status={status}
          onSelectOption={handleSelectOption}
          onQuickDone={(idx) => submitOption(idx, '', { markCompleted: true })}
          onSnooze={handleSnooze}
          snoozeCount={reminderStatus?.snoozeCount}
          onStartDotReset={handleStartDotReset}
        />
      )}

      {step === 'detail' && (
        <PromptDetailInput
          currentOption={currentOption}
          note={note}
          setNote={setNote}
          focusQuality={focusQuality}
          setFocusQuality={setFocusQuality}
          audioMode={audioMode}
          setAudioMode={setAudioMode}
          validationError={validationError}
          setValidationError={setValidationError}
          status={status}
          detailInputRef={detailInputRef}
          markCompleted={markCompleted}
          setMarkCompleted={setMarkCompleted}
          addToPlanner={addToPlanner}
          setAddToPlanner={setAddToPlanner}
          onBack={() => setStep('select')}
          onSubmit={handleSubmit}
          onKeyDown={handleKeyDown}
        />
      )}

      {step === 'afk' && (
        <PromptAfkBreak afkBreakSeconds={afkBreakSeconds} onReturn={handleReturnFromAfk} />
      )}
    </div>
  )
}
