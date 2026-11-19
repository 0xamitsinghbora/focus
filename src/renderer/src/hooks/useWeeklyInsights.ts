import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { DayReviewData, shiftDate, AppSettings, SyncTarget } from '../../../shared/types'

export interface HourBucket {
  hour: number
  minutes: number
}

export interface WeeklyInsightsData {
  loading: boolean
  totalFocusMinutes: number
  avgDailyFocusMinutes: number
  activeDays: number
  bestDay: { date: string; minutes: number } | null
  bestHours: HourBucket[]
  peakHourLabel: string
  dailyTargetMinutes: number
  targetHitDays: number
  targetHitRate: number
  dailyBreakdown: { date: string; minutes: number; goalsDone: number; goalsTotal: number }[]
  longestSession: number
}

export function useWeeklyInsights(todayDateStr: string, isActive: boolean): WeeklyInsightsData {
  const [reviews, setReviews] = useState<(DayReviewData | null)[]>([])
  const [dailyTargetMinutes, setDailyTargetMinutes] = useState(480)
  const [loading, setLoading] = useState(true)

  const weekDates = useMemo(() => {
    const dates: string[] = []
    for (let i = 6; i >= 0; i--) {
      dates.push(shiftDate(todayDateStr, -i))
    }
    return dates
  }, [todayDateStr])

  const weekDatesRef = useRef<string[]>(weekDates)
  weekDatesRef.current = weekDates

  const reviewsRef = useRef<(DayReviewData | null)[]>(reviews)
  reviewsRef.current = reviews

  const fetchWeekData = useCallback(
    async (showLoading = true) => {
      if (!isActive) return
      if (typeof window === 'undefined' || !window.api) return
      if (showLoading) setLoading(true)
      try {
        const [reviewResults, settings] = await Promise.all([
          Promise.all(weekDates.map((d) => window.api.logs.getDayReview(d).catch(() => null))),
          window.api.settings.get().catch(() => null as AppSettings | null)
        ])
        setReviews(reviewResults)
        setDailyTargetMinutes(
          typeof settings?.dailyFocusTargetMinutes === 'number'
            ? settings.dailyFocusTargetMinutes
            : 480
        )
      } catch {
        // ignore
      } finally {
        if (showLoading) setLoading(false)
      }
    },
    [weekDates, isActive]
  )

  const fetchPartialWeekData = useCallback(
    async (datesToFetch: string[]) => {
      if (!isActive || datesToFetch.length === 0) return
      if (typeof window === 'undefined' || !window.api?.logs?.getDayReview) return
      const currentWeekDates = weekDatesRef.current
      if (reviewsRef.current.length !== currentWeekDates.length) {
        await fetchWeekData(false)
        return
      }

      try {
        const results = await Promise.all(
          datesToFetch.map(async (d) => {
            const review = await window.api.logs.getDayReview(d).catch(() => null)
            return { date: d, review }
          })
        )

        setReviews((prev) => {
          if (prev.length !== currentWeekDates.length) return prev
          const next = [...prev]
          for (const { date, review } of results) {
            const idx = currentWeekDates.indexOf(date)
            if (idx !== -1) {
              next[idx] = review
            }
          }
          return next
        })
      } catch {
        // ignore
      }
    },
    [isActive, fetchWeekData]
  )

  useEffect(() => {
    fetchWeekData(true)
  }, [fetchWeekData])

  useEffect(() => {
    if (!isActive) return
    if (typeof window === 'undefined' || !window.api?.events?.onDataUpdated) return

    const cleanup = window.api.events.onDataUpdated(async (target?: SyncTarget) => {
      if (!target || target.syncPurged) {
        fetchWeekData(false)
        return
      }

      if (target.syncSettings) {
        try {
          const settings = await window.api.settings.get()
          if (typeof settings?.dailyFocusTargetMinutes === 'number') {
            setDailyTargetMinutes(settings.dailyFocusTargetMinutes)
          }
        } catch {
          // ignore
        }
      }

      const currentWeekDates = weekDatesRef.current
      const affected = new Set<string>([...(target.logDates || []), ...(target.goalDates || [])])

      let datesToFetch: string[] = []
      if (affected.size > 0) {
        datesToFetch = currentWeekDates.filter((d) => affected.has(d))
      } else if (
        target.todayMinutes !== undefined ||
        (!target.syncSettings && !target.syncInbox && !target.syncRecurring)
      ) {
        if (currentWeekDates.includes(todayDateStr)) {
          datesToFetch = [todayDateStr]
        }
      }

      if (datesToFetch.length > 0) {
        fetchPartialWeekData(datesToFetch)
      }
    })

    return () => {
      if (typeof cleanup === 'function') cleanup()
    }
  }, [isActive, todayDateStr, fetchWeekData, fetchPartialWeekData])

  return useMemo(() => {
    if (loading || reviews.length === 0) {
      return {
        loading,
        totalFocusMinutes: 0,
        avgDailyFocusMinutes: 0,
        activeDays: 0,
        bestDay: null,
        bestHours: [],
        peakHourLabel: '',
        dailyTargetMinutes,
        targetHitDays: 0,
        targetHitRate: 0,
        dailyBreakdown: [],
        longestSession: 0
      }
    }

    let totalMins = 0
    let activeDays = 0
    let bestDay: { date: string; minutes: number } | null = null
    let targetHitDays = 0
    let longestSession = 0
    const hourBuckets = new Array(24).fill(0)
    const dailyBreakdown: {
      date: string
      minutes: number
      goalsDone: number
      goalsTotal: number
    }[] = []

    for (let i = 0; i < weekDates.length; i++) {
      const review = reviews[i]
      const date = weekDates[i]
      const mins = review?.totalProductiveMinutes || 0
      const goals = review?.goals || []
      const goalsDone = goals.filter((g) => g.status === 'done' && !g.deletedAt).length
      const goalsTotal = goals.filter((g) => !g.deletedAt).length
      const logs = review?.logs || []

      totalMins += mins
      dailyBreakdown.push({ date, minutes: mins, goalsDone, goalsTotal })

      if (mins > 0) {
        activeDays++
        if (!bestDay || mins > bestDay.minutes) {
          bestDay = { date, minutes: mins }
        }
        if (dailyTargetMinutes > 0 && mins >= dailyTargetMinutes) {
          targetHitDays++
        }
      }

      for (const log of logs) {
        if (log.productivity === 'break' || !log.startedAt) continue
        const prodMins =
          typeof log.productiveMinutes === 'number'
            ? log.productiveMinutes
            : log.durationMinutes || 0
        if (prodMins > longestSession) longestSession = prodMins

        const start = new Date(log.startedAt)
        if (isNaN(start.getTime())) continue
        const endTime = log.endedAt ? new Date(log.endedAt) : null
        const durationMs =
          endTime && !isNaN(endTime.getTime())
            ? endTime.getTime() - start.getTime()
            : (prodMins || 0) * 60000

        if (durationMs <= 0) continue

        const startHour = start.getHours()
        const startMinInHour = start.getMinutes()
        const totalDurMins = Math.round(durationMs / 60000)

        let remaining = totalDurMins
        let currentHour = startHour
        let minutesLeftInCurrentHour = 60 - startMinInHour

        while (remaining > 0 && currentHour < 24) {
          const allocated = Math.min(remaining, minutesLeftInCurrentHour)
          hourBuckets[currentHour] += allocated
          remaining -= allocated
          currentHour++
          minutesLeftInCurrentHour = 60
        }
      }
    }

    const avgDaily = activeDays > 0 ? Math.round(totalMins / 7) : 0
    const targetHitRate = dailyTargetMinutes > 0 ? Math.round((targetHitDays / 7) * 100) : 0

    const bestHours: HourBucket[] = hourBuckets
      .map((minutes, hour) => ({ hour, minutes }))
      .filter((b) => b.minutes > 0)

    let peakHourLabel = ''
    if (bestHours.length > 0) {
      const sorted = [...bestHours].sort((a, b) => b.minutes - a.minutes)
      const peak = sorted[0]
      const formatHour = (h: number): string => {
        if (h === 0) return '12 AM'
        if (h === 12) return '12 PM'
        return h < 12 ? `${h} AM` : `${h - 12} PM`
      }
      peakHourLabel = `${formatHour(peak.hour)} – ${formatHour((peak.hour + 1) % 24)}`
    }

    return {
      loading: false,
      totalFocusMinutes: totalMins,
      avgDailyFocusMinutes: avgDaily,
      activeDays,
      bestDay,
      bestHours,
      peakHourLabel,
      dailyTargetMinutes,
      targetHitDays,
      targetHitRate,
      dailyBreakdown,
      longestSession
    }
  }, [loading, reviews, weekDates, dailyTargetMinutes])
}
