import { useMemo } from 'react'
import { DailyGoal, LogEntry, DayReviewData, HeatmapData } from '../../../shared/types'
import { formatMinutes, calculateStreakStats } from '../lib/utils'

export interface UseTodayMetricsParams {
  todayGoals: DailyGoal[]
  logs: LogEntry[]
  todayReview: DayReviewData | null
  persistedLoggedMinutesMap: Record<string, number>
  heatmapData: HeatmapData
  todayDateStr: string
}

export interface TodayMetricsResult {
  activeTodayGoals: DailyGoal[]
  plannedTodayGoals: DailyGoal[]
  todayDoneGoals: DailyGoal[]
  productiveToday: number
  goalLoggedMinutesMap: Record<string, number>
  todayTotalTargetMinutes: number
  todayBreakMins: number
  todaySessionStats: { avg: number; longest: number }
  todayFocusHint: string
  todayTasksHint: string
  todaySessionsHint: string
  heatmapStats: { currentStreak: number; longestStreak: number }
  streakHint: string
}

export function useTodayMetrics({
  todayGoals,
  logs,
  todayReview,
  persistedLoggedMinutesMap,
  heatmapData,
  todayDateStr
}: UseTodayMetricsParams): TodayMetricsResult {
  const activeTodayGoals = useMemo(
    () => todayGoals.filter((goal) => goal.status === 'in_progress'),
    [todayGoals]
  )

  const plannedTodayGoals = useMemo(
    () => todayGoals.filter((goal) => goal.status === 'planned'),
    [todayGoals]
  )

  const todayDoneGoals = useMemo(() => todayGoals.filter((g) => g.status === 'done'), [todayGoals])

  const productiveToday = todayReview?.totalProductiveMinutes || 0

  const goalLoggedMinutesMap = useMemo(() => {
    const map: Record<string, number> = { ...persistedLoggedMinutesMap }

    // If persisted map has not loaded or today's logs contain un-persisted minutes,
    // take the maximum of persisted minutes vs local sum of today's logs to prevent double-counting.
    const todayLogsMap: Record<string, number> = {}
    for (const log of logs) {
      if (log.goalId) {
        const mins =
          typeof log.productiveMinutes === 'number'
            ? log.productiveMinutes
            : log.durationMinutes || 0
        todayLogsMap[log.goalId] = (todayLogsMap[log.goalId] || 0) + mins
      }
    }

    for (const [goalId, todayMins] of Object.entries(todayLogsMap)) {
      if (!map[goalId] || map[goalId] < todayMins) {
        map[goalId] = todayMins
      }
    }

    if (todayReview?.goalBreakdown) {
      for (const item of todayReview.goalBreakdown) {
        if (item.productiveMinutes > (map[item.goalId] || 0)) {
          map[item.goalId] = item.productiveMinutes
        }
      }
    }

    // Ensure carried tasks include their ancestor chain's minutes plus any time logged directly today
    for (const g of todayGoals) {
      if (g.carriedFromGoalId) {
        const ancestorMins = map[g.carriedFromGoalId] || 0
        const directTodayMins = todayLogsMap[g.id] || 0
        const total = ancestorMins + directTodayMins
        if (!map[g.id] || map[g.id] < total) {
          map[g.id] = total
        }
      }
    }
    return map
  }, [logs, todayReview, persistedLoggedMinutesMap, todayGoals])

  const heatmapStats = useMemo(() => {
    return calculateStreakStats(heatmapData, todayDateStr)
  }, [heatmapData, todayDateStr])

  const streakHint = useMemo(() => {
    if (heatmapStats.currentStreak > 0) {
      if (heatmapStats.longestStreak > heatmapStats.currentStreak) {
        return `Longest: ${heatmapStats.longestStreak} days`
      }
      return 'All-time best streak'
    }
    return 'No active streak'
  }, [heatmapStats])

  const todayTotalTargetMinutes = useMemo(
    () => todayGoals.reduce((acc, g) => acc + (g.targetMinutes || 0), 0),
    [todayGoals]
  )

  const todayBreakMins = useMemo(
    () =>
      logs
        .filter((l) => l.productivity === 'break')
        .reduce((acc, l) => acc + (l.durationMinutes || 0), 0),
    [logs]
  )

  const todaySessionStats = useMemo(() => {
    if (logs.length === 0) return { avg: 0, longest: 0 }
    const durations = logs
      .map((l) =>
        typeof l.productiveMinutes === 'number' ? l.productiveMinutes : l.durationMinutes || 0
      )
      .filter((d) => d > 0)
    const longest = durations.length > 0 ? durations.reduce((max, d) => (d > max ? d : max), 0) : 0
    const avg = Math.round(productiveToday / logs.length)
    return { avg, longest }
  }, [logs, productiveToday])

  const todayFocusHint = useMemo(() => {
    if (todayTotalTargetMinutes > 0) {
      const pct = Math.min(100, Math.round((productiveToday / todayTotalTargetMinutes) * 100))
      return `${pct}% of ${formatMinutes(todayTotalTargetMinutes)} daily target`
    }
    if (todayBreakMins > 0) {
      return `${formatMinutes(todayBreakMins)} break time`
    }
    if (productiveToday > 0) {
      return 'Consistent focus'
    }
    return 'Pick a task below to begin'
  }, [todayTotalTargetMinutes, productiveToday, todayBreakMins])

  const todayTasksHint = useMemo(() => {
    if (todayGoals.length === 0) {
      return 'No tasks planned yet'
    }
    if (todayDoneGoals.length === todayGoals.length && todayGoals.length > 0) {
      return "All today's tasks completed! 🎉"
    }
    const remaining = todayGoals.length - todayDoneGoals.length
    return `${remaining} ${remaining === 1 ? 'task' : 'tasks'} remaining`
  }, [todayGoals.length, todayDoneGoals.length])

  const todaySessionsHint = useMemo(() => {
    if (productiveToday === 0 && logs.length === 0) {
      return 'No focus time logged'
    }
    const focusTimeStr = formatMinutes(productiveToday)
    if (todayTotalTargetMinutes > 0) {
      const pct = Math.min(100, Math.round((productiveToday / todayTotalTargetMinutes) * 100))
      if (logs.length > 1) {
        return `${focusTimeStr} focus time · ${pct}% of target · Avg ~${todaySessionStats.avg}m`
      }
      return `${focusTimeStr} focus time · ${pct}% of target`
    }
    if (logs.length > 1) {
      return `${focusTimeStr} focus time · Avg ~${todaySessionStats.avg}m`
    }
    return `${focusTimeStr} focus time`
  }, [logs.length, productiveToday, todaySessionStats, todayTotalTargetMinutes])

  return {
    activeTodayGoals,
    plannedTodayGoals,
    todayDoneGoals,
    productiveToday,
    goalLoggedMinutesMap,
    todayTotalTargetMinutes,
    todayBreakMins,
    todaySessionStats,
    todayFocusHint,
    todayTasksHint,
    todaySessionsHint,
    heatmapStats,
    streakHint
  }
}
