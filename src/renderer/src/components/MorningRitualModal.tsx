import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { DailyGoal, shiftDate } from '../../../shared/types'
import { formatMinutes, cn } from '../lib/utils'
import { useDialogA11y } from '../lib/useDialogA11y'
import { playFocusChime } from '../lib/audioEngine'
import { getGroupTheme, getPreferredGroupColor } from '../lib/groupTheme'

export interface MorningRitualModalProps {
  isOpen: boolean
  onClose: () => void
  todayStr: string
  todayGoals: DailyGoal[]
  dailyFocusTargetMinutes: number
  onUpdateTargetMinutes: (minutes: number) => Promise<void>
  onCarryGoal: (goal: DailyGoal) => Promise<void>
  onPromoteGoal: (goal: DailyGoal) => Promise<void>
  onAddGoal?: (
    title: string,
    targetMinutes?: number,
    deadline?: string,
    note?: string,
    remindAt?: string,
    repeat?: string,
    groupTag?: string,
    groupColor?: string,
    status?: DailyGoal['status']
  ) => Promise<void>
  onRitualCompleted: () => void
}

const PRESET_TARGETS = [
  { label: '2 Hours', minutes: 120 },
  { label: '4 Hours', minutes: 240 },
  { label: '5 Hours', minutes: 300 },
  { label: '6 Hours', minutes: 360 },
  { label: '8 Hours', minutes: 480 }
]

export function MorningRitualModal({
  isOpen,
  onClose,
  todayStr,
  todayGoals,
  dailyFocusTargetMinutes,
  onUpdateTargetMinutes,
  onCarryGoal,
  onPromoteGoal,
  onAddGoal,
  onRitualCompleted
}: MorningRitualModalProps): React.JSX.Element | null {
  const [selectedTarget, setSelectedTarget] = useState<number>(dailyFocusTargetMinutes || 480)
  const [pastUnfinishedGoals, setPastUnfinishedGoals] = useState<DailyGoal[]>([])
  const [selectedToCarry, setSelectedToCarry] = useState<Set<string>>(new Set())
  const [anchorGoalId, setAnchorGoalId] = useState<string>('')
  const [newAnchorTitle, setNewAnchorTitle] = useState('')
  const [isCommitting, setIsCommitting] = useState(false)
  const [loadingPast, setLoadingPast] = useState(true)

  const initialFocusRef = useRef<HTMLButtonElement | null>(null)
  const dialogRef = useDialogA11y<HTMLDivElement>({
    isOpen,
    onClose,
    initialFocusRef
  })

  // Load unfinished tasks from yesterday and past days
  useEffect(() => {
    if (!isOpen) return
    let isCancelled = false

    const loadPastTasks = async (): Promise<void> => {
      setLoadingPast(true)
      try {
        const yesterday = shiftDate(todayStr, -1)
        const pastGoals = (await window.api.goals.get(yesterday)) || []
        if (isCancelled) return

        // Unfinished past goals: not done, not deleted, not carried to today yet
        const unfinished = pastGoals.filter(
          (g: DailyGoal) =>
            g.status !== 'done' &&
            !g.deletedAt &&
            (!g.carriedToDate || g.carriedToDate === todayStr)
        )

        setPastUnfinishedGoals(unfinished)
        // Default: pre-select all unfinished tasks to carry forward
        setSelectedToCarry(new Set(unfinished.map((g) => g.id)))
      } catch (err) {
        console.warn('Failed to load past goals for morning ritual:', err)
      } finally {
        if (!isCancelled) {
          setLoadingPast(false)
        }
      }
    }

    void loadPastTasks()
    return () => {
      isCancelled = true
    }
  }, [isOpen, todayStr])

  // Current active/planned goals for today
  const availableTodayGoals = useMemo(() => {
    return todayGoals.filter((g) => g.status !== 'done' && !g.deletedAt)
  }, [todayGoals])

  // Pick default anchor goal
  useEffect(() => {
    if (!anchorGoalId && availableTodayGoals.length > 0) {
      // Prefer existing in-progress task or first planned task
      const inProg = availableTodayGoals.find((g) => g.status === 'in_progress')
      setAnchorGoalId(inProg ? inProg.id : availableTodayGoals[0].id)
    }
  }, [availableTodayGoals, anchorGoalId])

  const toggleCarry = (id: string): void => {
    setSelectedToCarry((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSelectAllCarry = (): void => {
    if (selectedToCarry.size === pastUnfinishedGoals.length) {
      setSelectedToCarry(new Set())
    } else {
      setSelectedToCarry(new Set(pastUnfinishedGoals.map((g) => g.id)))
    }
  }

  const handleCommit = useCallback(async (): Promise<void> => {
    if (isCommitting) return
    setIsCommitting(true)

    try {
      // 1. Update daily target if changed
      if (selectedTarget !== dailyFocusTargetMinutes) {
        await onUpdateTargetMinutes(selectedTarget)
      }

      // 2. Carry forward selected past goals
      const goalsToCarry = pastUnfinishedGoals.filter((g) => selectedToCarry.has(g.id))
      for (const goal of goalsToCarry) {
        await onCarryGoal(goal)
      }

      // 3. Anchor goal commitment:
      // If user typed a new anchor task, create it directly in in_progress
      if (newAnchorTitle.trim() && onAddGoal) {
        await onAddGoal(
          newAnchorTitle.trim(),
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          'in_progress'
        )
      } else if (anchorGoalId) {
        // Move selected anchor goal to in_progress
        const targetGoal =
          availableTodayGoals.find((g) => g.id === anchorGoalId) ||
          goalsToCarry.find((g) => g.id === anchorGoalId)
        if (targetGoal && targetGoal.status !== 'in_progress') {
          await onPromoteGoal(targetGoal)
        }
      }

      // 4. Mark morning ritual completed for today in settings
      await window.api.settings.patch({
        lastMorningRitualDate: todayStr,
        dailyFocusTargetMinutes: selectedTarget
      })

      // 5. Play motivating chime
      try {
        await playFocusChime('complete')
      } catch {
        // ignore audio failure
      }

      onRitualCompleted()
      onClose()
    } catch (err) {
      console.error('Failed to complete morning planning ritual:', err)
    } finally {
      setIsCommitting(false)
    }
  }, [
    isCommitting,
    selectedTarget,
    dailyFocusTargetMinutes,
    pastUnfinishedGoals,
    selectedToCarry,
    newAnchorTitle,
    anchorGoalId,
    availableTodayGoals,
    todayStr,
    onUpdateTargetMinutes,
    onCarryGoal,
    onAddGoal,
    onPromoteGoal,
    onRitualCompleted,
    onClose
  ])

  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="morning-ritual-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="relative flex flex-col w-full max-w-xl max-h-[88vh] overflow-hidden rounded-2xl border border-border/80 bg-card shadow-apple-popover text-foreground outline-none"
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 pb-3 border-b border-border/60 bg-surface/30">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-500 flex items-center justify-center shrink-0 text-xl shadow-2xs">
              🌅
            </div>
            <div>
              <h2
                id="morning-ritual-title"
                className="text-[17px] font-bold tracking-tight text-foreground"
              >
                Morning Planning Ritual
              </h2>
              <p className="text-[12px] text-muted-foreground tracking-tight">
                Set intention, carry forward, commit — your psychological anchor for today.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[12px] text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-secondary/70 transition-colors cursor-pointer"
            title="Skip for now"
          >
            Skip
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-5 space-y-5">
          {/* Section 1: Set Intention & Focus Target */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
                1. Set Daily Focus Target
              </label>
              <span className="text-[12px] font-bold text-primary tabular-nums">
                {formatMinutes(selectedTarget)} target
              </span>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {PRESET_TARGETS.map((preset) => {
                const isSelected = selectedTarget === preset.minutes
                return (
                  <button
                    key={preset.minutes}
                    type="button"
                    onClick={() => setSelectedTarget(preset.minutes)}
                    className={cn(
                      'py-2 px-1 rounded-xl border text-[11px] font-medium transition-all duration-150 cursor-pointer select-none text-center',
                      isSelected
                        ? 'bg-primary border-primary text-primary-foreground font-semibold shadow-apple-subtle'
                        : 'bg-card hover:bg-secondary/70 border-border text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {preset.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Section 2: Carry Forward Tasks */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
                  2. Carry Forward Past Tasks
                </span>
                {pastUnfinishedGoals.length > 0 && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded-full bg-apple-amber/15 text-apple-amber border border-apple-amber/30">
                    {pastUnfinishedGoals.length} pending
                  </span>
                )}
              </div>
              {pastUnfinishedGoals.length > 1 && (
                <button
                  type="button"
                  onClick={handleSelectAllCarry}
                  className="text-[11px] font-medium text-primary hover:underline cursor-pointer"
                >
                  {selectedToCarry.size === pastUnfinishedGoals.length
                    ? 'Deselect All'
                    : 'Select All'}
                </button>
              )}
            </div>

            {loadingPast ? (
              <div className="p-4 text-center text-[12px] text-muted-foreground">
                Checking yesterday&apos;s tasks...
              </div>
            ) : pastUnfinishedGoals.length === 0 ? (
              <div className="p-3.5 rounded-xl border border-dashed border-border/80 bg-surface/20 flex items-center gap-2.5 text-[12px] text-muted-foreground">
                <span className="text-base">🎉</span>
                <span>No unfinished tasks carried from yesterday. Clean slate!</span>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-40 overflow-y-auto custom-scrollbar p-0.5">
                {pastUnfinishedGoals.map((goal) => {
                  const isChecked = selectedToCarry.has(goal.id)
                  return (
                    <label
                      key={goal.id}
                      className={cn(
                        'flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer select-none text-[12.5px]',
                        isChecked
                          ? 'bg-card border-border shadow-2xs text-foreground font-medium'
                          : 'bg-surface/20 border-border/50 text-muted-foreground hover:bg-surface/40'
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleCarry(goal.id)}
                          className="h-4 w-4 rounded border-border text-primary focus:ring-primary/60 cursor-pointer accent-primary"
                        />
                        <span className="truncate">{goal.title}</span>
                      </div>
                      {goal.groupTag && (
                        <span
                          className={cn(
                            'text-[9.5px] px-1.5 py-0.2 rounded-md font-medium border shrink-0',
                            getGroupTheme(goal.groupColor || getPreferredGroupColor(goal.groupTag))
                              .badgeBg,
                            getGroupTheme(goal.groupColor || getPreferredGroupColor(goal.groupTag))
                              .badgeText,
                            getGroupTheme(goal.groupColor || getPreferredGroupColor(goal.groupTag))
                              .badgeBorder
                          )}
                        >
                          {goal.groupTag}
                        </span>
                      )}
                    </label>
                  )
                })}
              </div>
            )}
          </div>

          {/* Section 3: Commit to the Anchor Task */}
          <div className="space-y-2">
            <label className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
              3. Anchor Commitment: What is your #1 task to start?
            </label>
            <p className="text-[11px] text-muted-foreground/80">
              Pick the single most important task. It will be moved to &quot;In Progress&quot; and
              ready for your first focus session.
            </p>

            {availableTodayGoals.length > 0 && (
              <div className="space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar p-0.5">
                {availableTodayGoals.map((goal) => {
                  const isAnchor = anchorGoalId === goal.id
                  return (
                    <button
                      key={goal.id}
                      type="button"
                      onClick={() => {
                        setAnchorGoalId(goal.id)
                        setNewAnchorTitle('')
                      }}
                      className={cn(
                        'w-full flex items-center justify-between p-2.5 rounded-xl border text-left transition-all cursor-pointer select-none text-[12.5px]',
                        isAnchor
                          ? 'bg-apple-green/10 border-apple-green/40 text-apple-green font-semibold shadow-2xs'
                          : 'bg-card hover:bg-secondary/60 border-border/70 text-foreground'
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={cn(
                            'h-2 w-2 rounded-full shrink-0',
                            isAnchor ? 'bg-apple-green animate-pulse' : 'bg-muted-foreground/40'
                          )}
                        />
                        <span className="truncate">{goal.title}</span>
                      </div>
                      {isAnchor && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded-md bg-apple-green/20 text-apple-green border border-apple-green/30 uppercase tracking-wider shrink-0">
                          Anchor Focus
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}

            <div className="pt-1">
              <input
                type="text"
                placeholder={
                  availableTodayGoals.length > 0
                    ? 'Or enter a new priority anchor task...'
                    : 'Enter your #1 priority anchor task for today...'
                }
                value={newAnchorTitle}
                onChange={(e) => {
                  setNewAnchorTitle(e.target.value)
                  if (e.target.value.trim()) setAnchorGoalId('')
                }}
                className="w-full px-3.5 py-2 rounded-xl text-[12.5px] border border-input bg-card shadow-apple-subtle focus:ring-2 focus:ring-primary/60 focus:border-primary outline-none transition-all placeholder:text-muted-foreground/60 select-text"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 px-5 border-t border-border/60 bg-surface/30">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer rounded-xl hover:bg-secondary/60"
          >
            I&apos;ll plan later
          </button>

          <button
            ref={initialFocusRef}
            type="button"
            disabled={isCommitting}
            onClick={handleCommit}
            className="px-5 py-2 text-[12.5px] font-semibold rounded-xl transition-all duration-150 bg-primary text-primary-foreground hover:opacity-90 shadow-apple-subtle active:scale-95 disabled:opacity-50 flex items-center gap-2 cursor-pointer"
          >
            <span>{isCommitting ? 'Committing...' : 'Commit to Today'}</span>
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </div>
  )
}
