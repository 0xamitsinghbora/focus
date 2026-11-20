import React, { useMemo, useState } from 'react'
import { DailyGoal, DayReviewData, localDateStr, shiftDate } from '../../../shared/types'
import { TimelineList } from './TimelineList'
import { EmptyState } from './DashboardLayout'

interface DayReviewPanelProps {
  review: DayReviewData | null
  today: string
  dayCutoffHour?: number
  onCarryGoal?: (goal: DailyGoal) => Promise<void>
  onCarryAllGoals?: (goals: DailyGoal[]) => Promise<void>
  onReopenGoal?: (goal: DailyGoal) => Promise<void>
}

export function DayReviewPanel({
  review,
  today,
  dayCutoffHour = 0,
  onCarryGoal,
  onCarryAllGoals,
  onReopenGoal
}: DayReviewPanelProps): React.JSX.Element {
  const [carryingGoalId, setCarryingGoalId] = useState<string | null>(null)
  const [reopeningGoalId, setReopeningGoalId] = useState<string | null>(null)
  const [isCarryingAll, setIsCarryingAll] = useState(false)
  const logs = review?.logs
  const reviewDate = review?.date

  const effectiveToday = today || localDateStr(new Date(), dayCutoffHour)
  const isToday = reviewDate === effectiveToday

  const handleCarry = async (goal: DailyGoal): Promise<void> => {
    if (carryingGoalId || isCarryingAll || !onCarryGoal) return
    setCarryingGoalId(goal.id)
    try {
      await onCarryGoal(goal)
    } finally {
      setCarryingGoalId(null)
    }
  }

  const handleReopen = async (goal: DailyGoal): Promise<void> => {
    if (reopeningGoalId || !onReopenGoal) return
    setReopeningGoalId(goal.id)
    try {
      await onReopenGoal(goal)
    } finally {
      setReopeningGoalId(null)
    }
  }

  const handleCarryAll = async (goalsToCarry: DailyGoal[]): Promise<void> => {
    if (isCarryingAll || carryingGoalId || goalsToCarry.length === 0) return
    setIsCarryingAll(true)
    try {
      if (onCarryAllGoals) {
        await onCarryAllGoals(goalsToCarry)
      } else if (onCarryGoal) {
        for (const goal of goalsToCarry) {
          await onCarryGoal(goal)
        }
      }
    } finally {
      setIsCarryingAll(false)
    }
  }

  const incompleteGoals = useMemo((): DailyGoal[] => {
    if (isToday || !review?.goals) return []
    return review.goals.filter((g) => g.status !== 'done' && !g.deletedAt && !g.carriedToDate)
  }, [isToday, review?.goals])

  const completedGoals = useMemo((): DailyGoal[] => {
    if (!review?.goals) return []
    return review.goals.filter((g) => g.status === 'done' && !g.deletedAt)
  }, [review?.goals])

  const activeTimeSpan = useMemo((): string | null => {
    if (!logs || logs.length === 0) return null
    const timestamps = logs
      .map((l) => {
        const start = l.startedAt
          ? new Date(l.startedAt).getTime()
          : l.durationMinutes
            ? new Date(l.timestamp).getTime() - l.durationMinutes * 60000
            : new Date(l.timestamp).getTime()
        const end = l.endedAt ? new Date(l.endedAt).getTime() : new Date(l.timestamp).getTime()
        return { start, end }
      })
      .filter((t) => !isNaN(t.start) && !isNaN(t.end))

    if (timestamps.length === 0) return null
    let minStart = Infinity
    let maxEnd = -Infinity
    for (const t of timestamps) {
      if (t.start < minStart) minStart = t.start
      if (t.end > maxEnd) maxEnd = t.end
    }

    const startDate = new Date(minStart)
    const endDate = new Date(maxEnd)
    const formatHourMin = (d: Date): string =>
      d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

    const startDay = new Date(
      startDate.getFullYear(),
      startDate.getMonth(),
      startDate.getDate()
    ).getTime()
    const endDay = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()).getTime()
    const dayDiff = Math.round((endDay - startDay) / 86400000)
    const suffix = dayDiff > 0 ? ` (+${dayDiff}d)` : ''

    return `${formatHourMin(startDate)} – ${formatHourMin(endDate)}${suffix}`
  }, [logs])

  const isYesterday = useMemo((): boolean => {
    if (!reviewDate) return false
    return reviewDate === shiftDate(effectiveToday, -1)
  }, [reviewDate, effectiveToday])

  const formattedDate = useMemo((): string => {
    if (!reviewDate) return ''
    try {
      const [y, m, d] = reviewDate.split('-').map(Number)
      const dateObj = new Date(y, m - 1, d)
      const currentEffectiveYear = effectiveToday
        ? parseInt(effectiveToday.split('-')[0], 10)
        : new Date().getFullYear()
      const isDiffYear = dateObj.getFullYear() !== currentEffectiveYear
      return dateObj.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: isDiffYear ? 'numeric' : undefined
      })
    } catch {
      return reviewDate
    }
  }, [reviewDate, effectiveToday])

  const audioInsights = useMemo(() => {
    if (!logs || logs.length === 0) return null

    // Sessions with audio logged
    const audioLogs = logs.filter(
      (l) => l.audioMode === 'silence' || l.audioMode === 'focus_sound' || l.audioMode === 'music'
    )
    if (audioLogs.length < 3) return null

    const soundLogs = audioLogs.filter(
      (l) => l.audioMode === 'silence' || l.audioMode === 'focus_sound'
    )
    const musicLogs = audioLogs.filter((l) => l.audioMode === 'music')

    const calcAvgQuality = (list: typeof audioLogs): number | null => {
      const scored = list.filter((l) => typeof l.focusQuality === 'number' && l.focusQuality > 0)
      if (scored.length === 0) return null
      const sum = scored.reduce((acc, l) => acc + (l.focusQuality || 0), 0)
      return sum / scored.length
    }

    const soundAvgQuality = calcAvgQuality(soundLogs)
    const musicAvgQuality = calcAvgQuality(musicLogs)

    // Deep focus completion
    const deepSoundLogs = soundLogs.filter((l) => (l.goalType || 'deep') === 'deep')
    const deepMusicLogs = musicLogs.filter((l) => (l.goalType || 'deep') === 'deep')

    const goalsMap = new Map<string, DailyGoal>()
    review?.goals?.forEach((g) => goalsMap.set(g.id, g))

    const getCompletion = (
      list: typeof audioLogs
    ): { rate: number; total: number; done: number } | null => {
      const goalIds = new Set(list.map((l) => l.goalId).filter((id): id is string => Boolean(id)))
      if (goalIds.size === 0) return null
      let done = 0
      goalIds.forEach((id) => {
        const goal = goalsMap.get(id)
        if (goal && goal.status === 'done') done++
      })
      return {
        rate: Math.round((done / goalIds.size) * 100),
        total: goalIds.size,
        done
      }
    }

    const soundCompletion = getCompletion(deepSoundLogs)
    const musicCompletion = getCompletion(deepMusicLogs)

    let insightHeadline = ''
    if (
      soundCompletion &&
      musicCompletion &&
      soundCompletion.total > 0 &&
      musicCompletion.total > 0
    ) {
      if (soundCompletion.rate >= musicCompletion.rate) {
        insightHeadline = `You completed ${soundCompletion.rate}% of deep focus goals when listening to rain/silence, compared to ${musicCompletion.rate}% with music.`
      } else {
        insightHeadline = `You completed ${musicCompletion.rate}% of deep focus goals with music, compared to ${soundCompletion.rate}% in silence/focus sounds.`
      }
    } else if (soundAvgQuality !== null && musicAvgQuality !== null) {
      if (soundAvgQuality >= musicAvgQuality) {
        insightHeadline = `Deep focus quality averaged ${soundAvgQuality.toFixed(1)}/5 in rain/silence compared to ${musicAvgQuality.toFixed(1)}/5 with music.`
      } else {
        insightHeadline = `Deep focus quality averaged ${musicAvgQuality.toFixed(1)}/5 with music compared to ${soundAvgQuality.toFixed(1)}/5 in silence.`
      }
    } else if (soundLogs.length > musicLogs.length) {
      insightHeadline = `You spent most of your focus time in silence or focus sounds (${soundLogs.length} sessions).`
    } else {
      insightHeadline = `You logged ${audioLogs.length} sessions with soundtrack tracking on this day.`
    }

    return {
      totalAudioSessions: audioLogs.length,
      soundLogsCount: soundLogs.length,
      musicLogsCount: musicLogs.length,
      soundAvgQuality,
      musicAvgQuality,
      soundCompletion,
      musicCompletion,
      insightHeadline
    }
  }, [logs, review?.goals])

  if (!review) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-[13px] py-16">
        Loading day review...
      </div>
    )
  }

  const title = isToday ? 'Today' : isYesterday ? 'Yesterday' : formattedDate
  const subtitle = isToday || isYesterday ? `· ${formattedDate}` : ''

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-5 py-3.5 shrink-0 border-b border-border/60 bg-card">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-[15px] font-semibold tracking-[-0.022em] text-foreground">
              {title}
            </h3>
            {subtitle && (
              <span className="text-[12px] font-medium text-muted-foreground/80 tracking-[-0.005em]">
                {subtitle}
              </span>
            )}
          </div>
          {activeTimeSpan && (
            <div className="text-[12px] font-medium text-muted-foreground/90 tabular-nums">
              Active {activeTimeSpan}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-4 space-y-4">
        {incompleteGoals.length > 0 && (
          <div className="rounded-2xl border border-apple-amber/25 bg-apple-amber/5 dark:bg-apple-amber/8 p-4 space-y-3 apple-card-elevated">
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="text-[13px] font-semibold text-apple-amber tracking-[-0.015em]">
                  Incomplete Tasks ({incompleteGoals.length})
                </span>
                <p className="text-[11px] text-muted-foreground/80">
                  Carry forward tasks left unfinished on this day
                </p>
              </div>
              {incompleteGoals.length > 1 && (onCarryAllGoals || onCarryGoal) && (
                <button
                  type="button"
                  disabled={isCarryingAll || Boolean(carryingGoalId)}
                  onClick={() => handleCarryAll(incompleteGoals)}
                  className="shrink-0 px-2.5 py-1 text-[11.5px] font-semibold rounded-lg bg-apple-amber text-white hover:brightness-105 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-apple-subtle active:scale-95 flex items-center gap-1.5 cursor-pointer"
                >
                  {isCarryingAll ? (
                    <>
                      <div className="h-3 w-3 animate-spin rounded-full border border-white border-t-transparent" />
                      <span>Carrying all...</span>
                    </>
                  ) : (
                    <span>Carry All ({incompleteGoals.length})</span>
                  )}
                </button>
              )}
            </div>
            <div className="space-y-1.5">
              {incompleteGoals.map((goal) => (
                <div
                  key={goal.id}
                  className="flex items-center justify-between gap-3 px-3.5 py-2 rounded-xl bg-card border border-border/60 text-[13px] shadow-2xs apple-card-elevated"
                >
                  <span className="truncate font-medium text-foreground tracking-[-0.01em]">
                    {goal.title}
                  </span>
                  {onCarryGoal && (
                    <button
                      type="button"
                      disabled={isCarryingAll || Boolean(carryingGoalId)}
                      onClick={() => handleCarry(goal)}
                      className="shrink-0 px-2.5 py-1 text-[11.5px] font-semibold rounded-lg bg-primary text-primary-foreground hover:brightness-105 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-apple-subtle active:scale-95 flex items-center gap-1.5 cursor-pointer"
                    >
                      {carryingGoalId === goal.id ? (
                        <>
                          <div className="h-3 w-3 animate-spin rounded-full border border-primary-foreground border-t-transparent" />
                          <span>Carrying...</span>
                        </>
                      ) : (
                        <span>Carry to Today</span>
                      )}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {completedGoals.length > 0 && (
          <div className="rounded-2xl border border-apple-green/25 bg-apple-green/4 dark:bg-apple-green/7 p-4 space-y-3 apple-card-elevated">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-apple-green shadow-xs" />
                <span className="text-[13px] font-semibold text-apple-green tracking-[-0.015em]">
                  Completed Tasks ({completedGoals.length})
                </span>
              </div>
              <span className="text-[11px] text-muted-foreground/80">
                Tasks completed on this day
              </span>
            </div>
            <div className="space-y-1.5">
              {completedGoals.map((goal) => (
                <div
                  key={goal.id}
                  className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-card border border-border/60 text-[13px] shadow-2xs apple-card-elevated"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="h-4.5 w-4.5 rounded-full bg-apple-green/15 border border-apple-green/30 flex items-center justify-center text-apple-green shrink-0">
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                    <span className="truncate font-medium text-foreground tracking-[-0.01em]">
                      {goal.title}
                    </span>
                    {goal.groupTag && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-secondary text-muted-foreground border border-border/50 shrink-0">
                        {goal.groupTag}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    {goal.completedAt && (
                      <span className="text-[11.5px] font-mono tabular-nums text-muted-foreground">
                        {new Date(goal.completedAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    )}
                    {onReopenGoal && (
                      <button
                        type="button"
                        disabled={reopeningGoalId === goal.id}
                        onClick={() => handleReopen(goal)}
                        className="px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-border/80 bg-surface hover:bg-secondary text-foreground hover:border-border transition-all shadow-apple-subtle active:scale-95 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        title="Reopen task and move to today"
                        aria-label={`Reopen task "${goal.title}" and move to today`}
                      >
                        {reopeningGoalId === goal.id ? (
                          <>
                            <div className="h-3 w-3 animate-spin rounded-full border border-foreground border-t-transparent" />
                            <span>Reopening...</span>
                          </>
                        ) : (
                          <>
                            <svg
                              width="11"
                              height="11"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                              <path d="M3 3v5h5" />
                            </svg>
                            <span>Reopen / Move to Today</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {audioInsights && (
          <div className="rounded-2xl border border-primary/20 bg-primary/3 dark:bg-primary/6 p-4 space-y-3 apple-card-elevated">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold text-foreground tracking-[-0.015em] flex items-center gap-1.5">
                  <span>🎧</span>
                  <span>Audio & Deep Focus Correlation</span>
                </span>
              </div>
              <span className="text-[11px] font-medium text-muted-foreground/80">
                {audioInsights.totalAudioSessions} audio-tracked sessions
              </span>
            </div>

            <div className="p-3 rounded-xl bg-card border border-border/60 shadow-2xs">
              <div className="text-[12.5px] font-medium text-foreground leading-snug">
                {audioInsights.insightHeadline}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-0.5">
              <div className="p-3 rounded-xl bg-card border border-border/50 space-y-1.5">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                  <span>🔇 Silence & Focus Sounds</span>
                </div>
                <div className="flex items-baseline justify-between pt-1">
                  <span className="text-[10.5px] text-muted-foreground">Completion</span>
                  <span className="text-[14px] font-semibold text-foreground tabular-nums">
                    {audioInsights.soundCompletion ? `${audioInsights.soundCompletion.rate}%` : '—'}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-[10.5px] text-muted-foreground">Avg Focus</span>
                  <span className="text-[12px] font-medium text-foreground tabular-nums">
                    {audioInsights.soundAvgQuality
                      ? `${audioInsights.soundAvgQuality.toFixed(1)} / 5`
                      : '—'}
                  </span>
                </div>
                <div className="text-[10px] text-muted-foreground/70 text-right">
                  {audioInsights.soundLogsCount} session
                  {audioInsights.soundLogsCount === 1 ? '' : 's'}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-card border border-border/50 space-y-1.5">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                  <span>🎵 Music</span>
                </div>
                <div className="flex items-baseline justify-between pt-1">
                  <span className="text-[10.5px] text-muted-foreground">Completion</span>
                  <span className="text-[14px] font-semibold text-foreground tabular-nums">
                    {audioInsights.musicCompletion ? `${audioInsights.musicCompletion.rate}%` : '—'}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-[10.5px] text-muted-foreground">Avg Focus</span>
                  <span className="text-[12px] font-medium text-foreground tabular-nums">
                    {audioInsights.musicAvgQuality
                      ? `${audioInsights.musicAvgQuality.toFixed(1)} / 5`
                      : '—'}
                  </span>
                </div>
                <div className="text-[10px] text-muted-foreground/70 text-right">
                  {audioInsights.musicLogsCount} session
                  {audioInsights.musicLogsCount === 1 ? '' : 's'}
                </div>
              </div>
            </div>
          </div>
        )}

        {review.logs.length === 0 && completedGoals.length === 0 ? (
          <EmptyState
            icon={
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                <line x1="16" x2="16" y1="2" y2="6" />
                <line x1="8" x2="8" y1="2" y2="6" />
                <line x1="3" x2="21" y1="10" y2="10" />
              </svg>
            }
            title="No activity recorded for this day"
            description="When focus sessions or breaks are logged, they will appear here on your day timeline."
            className="h-full py-12"
          />
        ) : (
          <div className="rounded-xl border border-border/70 bg-card overflow-hidden shadow-apple-subtle">
            <TimelineList
              logs={review.logs}
              goals={review.goals}
              emptyMessage="No sessions logged."
            />
          </div>
        )}
      </div>
    </div>
  )
}
