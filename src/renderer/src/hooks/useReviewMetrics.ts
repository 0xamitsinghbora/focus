import { useMemo } from 'react'
import { DayReviewData, LogEntry, DailyGoal } from '../../../shared/types'
import { formatMinutes } from '../lib/utils'

export interface UseReviewMetricsParams {
  selectedDayDate: string
  todayDateStr: string
  selectedDayReview: DayReviewData | null
  todayReview: DayReviewData | null
  productiveToday: number
}

export interface ReviewMetricsResult {
  activeReview: DayReviewData | null
  reviewLogs: LogEntry[]
  reviewGoals: DailyGoal[]
  reviewProductiveMins: number
  reviewBreakMins: number
  sessionStats: { avg: number; longest: number }
  totalTargetMinutes: number
  reviewFocusHint: string
  reviewSessionsHint: string
}

export function useReviewMetrics({
  selectedDayDate,
  todayDateStr,
  selectedDayReview,
  todayReview,
  productiveToday
}: UseReviewMetricsParams): ReviewMetricsResult {
  const activeReview =
    selectedDayDate === todayDateStr ? selectedDayReview || todayReview : selectedDayReview

  const reviewLogs = useMemo(() => activeReview?.logs || [], [activeReview])
  const reviewGoals = useMemo(() => activeReview?.goals || [], [activeReview])
  const reviewProductiveMins =
    activeReview?.totalProductiveMinutes ?? (selectedDayDate === todayDateStr ? productiveToday : 0)

  const reviewBreakMins = useMemo(() => {
    return reviewLogs
      .filter((log) => log.productivity === 'break')
      .reduce((acc, log) => acc + (log.durationMinutes || 0), 0)
  }, [reviewLogs])

  const sessionStats = useMemo(() => {
    if (reviewLogs.length === 0) return { avg: 0, longest: 0 }
    const durations = reviewLogs
      .map((l) =>
        typeof l.productiveMinutes === 'number' ? l.productiveMinutes : l.durationMinutes || 0
      )
      .filter((d) => d > 0)
    const longest = durations.length > 0 ? durations.reduce((max, d) => (d > max ? d : max), 0) : 0
    const avg = Math.round(reviewProductiveMins / reviewLogs.length)
    return { avg, longest }
  }, [reviewLogs, reviewProductiveMins])

  const totalTargetMinutes = useMemo(() => {
    return reviewGoals.reduce((acc, g) => acc + (g.targetMinutes || 0), 0)
  }, [reviewGoals])

  const reviewFocusHint = useMemo(() => {
    if (totalTargetMinutes > 0) {
      const pct = Math.min(100, Math.round((reviewProductiveMins / totalTargetMinutes) * 100))
      return `${pct}% of ${formatMinutes(totalTargetMinutes)} daily target`
    }
    if (reviewBreakMins > 0) {
      return `${formatMinutes(reviewBreakMins)} break time`
    }
    if (reviewProductiveMins > 0) {
      return 'No breaks'
    }
    return 'No focus time logged'
  }, [totalTargetMinutes, reviewProductiveMins, reviewBreakMins])

  const reviewSessionsHint = useMemo(() => {
    if (reviewLogs.length > 1) {
      return `Avg ~${sessionStats.avg}m · Longest: ${sessionStats.longest}m`
    }
    if (reviewLogs.length === 1) {
      return `Duration: ${sessionStats.longest}m`
    }
    return 'No sessions logged'
  }, [reviewLogs.length, sessionStats])

  return {
    activeReview,
    reviewLogs,
    reviewGoals,
    reviewProductiveMins,
    reviewBreakMins,
    sessionStats,
    totalTargetMinutes,
    reviewFocusHint,
    reviewSessionsHint
  }
}
