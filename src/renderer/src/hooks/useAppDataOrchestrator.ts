import { useState, useEffect, useCallback, useRef } from 'react'
import {
  AppSettings,
  LogEntry,
  DailyGoal,
  DayReviewData,
  HeatmapData,
  SyncTarget,
  ThemeMode,
  shiftDate
} from '../../../shared/types'
import { hydrateSavedGroupColors, syncGroupColorsFromGoals } from '../lib/groupTheme'

export interface UseAppDataOrchestratorParams {
  getTodayStr: () => string
  selectedDayDateRef: React.MutableRefObject<string>
  dayCutoffHour: number
  dayCutoffHourRef: React.MutableRefObject<number>
  setDayCutoffHour: (hour: number) => void
  updateCutoffHour: (hour: number) => void
  checkDateRollover: () => void
  setTheme: (theme: ThemeMode, broadcast?: boolean) => void
  tab: 'today' | 'goals' | 'review' | 'settings'
}

export interface AppDataOrchestratorResult {
  loading: boolean
  tabLoading: boolean
  setTabLoading: React.Dispatch<React.SetStateAction<boolean>>
  logs: LogEntry[]
  setLogs: React.Dispatch<React.SetStateAction<LogEntry[]>>
  heatmapData: HeatmapData
  setHeatmapData: React.Dispatch<React.SetStateAction<HeatmapData>>
  todayGoals: DailyGoal[]
  setTodayGoals: React.Dispatch<React.SetStateAction<DailyGoal[]>>
  todayReview: DayReviewData | null
  selectedDayReview: DayReviewData | null
  setSelectedDayReview: React.Dispatch<React.SetStateAction<DayReviewData | null>>
  interval: number
  setInterval_: React.Dispatch<React.SetStateAction<number>>
  dailyFocusTargetMinutes: number
  tratakaDurationSeconds: number
  setTratakaDurationSeconds: React.Dispatch<React.SetStateAction<number>>
  persistedLoggedMinutesMap: Record<string, number>
  loadLogs: () => Promise<void>
  loadHeatmap: () => Promise<void>
  loadDayReview: (date: string) => Promise<void>
  loadTodayData: () => Promise<void>
  loadReview: () => Promise<void>
  runCoordinatedRefresh: () => Promise<void>
  tabRef: React.MutableRefObject<'today' | 'goals' | 'review' | 'settings'>
}

export function useAppDataOrchestrator({
  getTodayStr,
  selectedDayDateRef,
  dayCutoffHour,
  dayCutoffHourRef,
  setDayCutoffHour,
  updateCutoffHour,
  checkDateRollover,
  setTheme,
  tab
}: UseAppDataOrchestratorParams): AppDataOrchestratorResult {
  const [loading, setLoading] = useState(true)
  const [tabLoading, setTabLoading] = useState(false)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [heatmapData, setHeatmapData] = useState<HeatmapData>({})
  const [todayGoals, setTodayGoals] = useState<DailyGoal[]>([])
  const [todayReview, setTodayReview] = useState<DayReviewData | null>(null)
  const [selectedDayReview, setSelectedDayReview] = useState<DayReviewData | null>(null)
  const [interval, setInterval_] = useState(45)
  const [dailyFocusTargetMinutes, setDailyFocusTargetMinutes] = useState(480)
  const [tratakaDurationSeconds, setTratakaDurationSeconds] = useState(60)
  const [persistedLoggedMinutesMap, setPersistedLoggedMinutesMap] = useState<
    Record<string, number>
  >({})

  const tabRef = useRef(tab)
  tabRef.current = tab
  useEffect(() => {
    tabRef.current = tab
  }, [tab])

  const loadLogs = useCallback(async () => {
    try {
      const today = getTodayStr()
      const todayLogs = await window.api.logs.get(today)
      setLogs(todayLogs || [])
    } catch (err) {
      console.error('Failed to load logs:', err)
    }
  }, [getTodayStr])

  const loadHeatmap = useCallback(async () => {
    try {
      const startDate = shiftDate(getTodayStr(), -380)
      const data = await window.api.logs.getHeatmap(startDate)
      setHeatmapData(data || {})
    } catch (err) {
      console.error('Failed to load heatmap:', err)
    }
  }, [getTodayStr])

  const loadDayReview = useCallback(async (date: string) => {
    try {
      const data = await window.api.logs.getDayReview(date)
      setSelectedDayReview(data)
    } catch (err) {
      console.error('Failed to load day review:', err)
    }
  }, [])

  const loadTodayData = useCallback(async () => {
    try {
      const today = getTodayStr()
      const goalsData = await window.api.goals.get(today)
      const goalIds = goalsData && goalsData.length > 0 ? goalsData.map((g: DailyGoal) => g.id) : []
      const [reviewData, loggedMinutesMap] = await Promise.all([
        window.api.logs.getDayReview(today),
        goalIds.length > 0
          ? window.api.goals.getLoggedMinutes(goalIds).catch(() => ({}))
          : Promise.resolve({})
      ])
      if (goalsData && goalsData.length > 0) {
        syncGroupColorsFromGoals(goalsData)
      }
      setTodayGoals(goalsData || [])
      setTodayReview(reviewData)
      if (reviewData?.logs) {
        setLogs(reviewData.logs)
      }
      if (loggedMinutesMap) {
        setPersistedLoggedMinutesMap(loggedMinutesMap)
      }
      if (selectedDayDateRef.current === today) setSelectedDayReview(reviewData)
    } catch (err) {
      console.error('Failed to load today data:', err)
    }
  }, [getTodayStr, selectedDayDateRef])

  const loadReview = useCallback(async () => {
    await Promise.all([loadHeatmap(), loadDayReview(selectedDayDateRef.current)])
  }, [loadHeatmap, loadDayReview, selectedDayDateRef])

  const runCoordinatedRefresh = useCallback(async (): Promise<void> => {
    await Promise.all([
      loadLogs(),
      loadTodayData(),
      tabRef.current === 'review' ? loadDayReview(selectedDayDateRef.current) : Promise.resolve(),
      window.api.settings
        .get()
        .then((settings: AppSettings) => {
          if (settings.theme) {
            setTheme(settings.theme, false)
          }
          if (settings.groupColors) {
            hydrateSavedGroupColors(settings.groupColors, true)
          }
          if (typeof settings.reminderIntervalMinutes === 'number') {
            setInterval_(settings.reminderIntervalMinutes)
          }
          if (typeof settings.dailyFocusTargetMinutes === 'number') {
            setDailyFocusTargetMinutes(settings.dailyFocusTargetMinutes)
          }
          if (typeof settings.dayCutoffHour === 'number') {
            updateCutoffHour(settings.dayCutoffHour)
          }
        })
        .catch(() => {})
    ])
  }, [loadLogs, loadTodayData, loadDayReview, selectedDayDateRef, setTheme, updateCutoffHour])

  useEffect(() => {
    let isCancelled = false

    const initApp = async (): Promise<void> => {
      try {
        const [settings] = await Promise.all([
          window.api.settings.get(),
          loadLogs(),
          loadTodayData(),
          loadHeatmap()
        ])
        if (isCancelled) return

        if (settings) {
          if (settings.theme) {
            setTheme(settings.theme, false)
          }
          setInterval_(settings.reminderIntervalMinutes || 45)
          setTratakaDurationSeconds(settings.tratakaDurationSeconds || 60)
          setDailyFocusTargetMinutes(
            typeof settings.dailyFocusTargetMinutes === 'number'
              ? settings.dailyFocusTargetMinutes
              : 480
          )
          if (typeof settings.dayCutoffHour === 'number') {
            updateCutoffHour(settings.dayCutoffHour)
          }
          if (settings.groupColors) {
            hydrateSavedGroupColors(settings.groupColors, true)
          }
        }
      } catch (err) {
        console.error('Failed to initialize app data:', err)
      } finally {
        if (!isCancelled) {
          setLoading(false)
        }
      }
    }

    void initApp()

    return () => {
      isCancelled = true
    }
  }, [
    loadLogs,
    loadTodayData,
    loadHeatmap,
    setTheme,
    setInterval_,
    setDailyFocusTargetMinutes,
    updateCutoffHour
  ])

  useEffect(() => {
    let debounceTimer: NodeJS.Timeout | null = null
    let isRefreshing = false
    let pendingRefresh = false

    const executeRefresh = async (): Promise<void> => {
      if (isRefreshing) {
        pendingRefresh = true
        return
      }
      isRefreshing = true
      try {
        await runCoordinatedRefresh()
      } finally {
        isRefreshing = false
        if (pendingRefresh) {
          pendingRefresh = false
          executeRefresh()
        }
      }
    }

    const onDataUpdated = (target?: SyncTarget): void => {
      if (!target) {
        if (debounceTimer) clearTimeout(debounceTimer)
        debounceTimer = setTimeout(() => {
          executeRefresh()
        }, 150)
        return
      }

      // Settings only change
      if (
        target.syncSettings &&
        !target.logDates?.length &&
        !target.goalDates?.length &&
        !target.syncInbox &&
        !target.syncRecurring &&
        !target.syncPurged
      ) {
        window.api.settings
          .get()
          .then((settings: AppSettings) => {
            if (settings.theme) {
              setTheme(settings.theme, false)
            }
            if (settings.groupColors) {
              hydrateSavedGroupColors(settings.groupColors, true)
            }
            if (typeof settings.reminderIntervalMinutes === 'number') {
              setInterval_(settings.reminderIntervalMinutes)
            }
            if (typeof settings.dailyFocusTargetMinutes === 'number') {
              setDailyFocusTargetMinutes(settings.dailyFocusTargetMinutes)
            }
            if (typeof settings.dayCutoffHour === 'number') {
              setDayCutoffHour(settings.dayCutoffHour)
              dayCutoffHourRef.current = settings.dayCutoffHour
            }
          })
          .catch(() => {})
        return
      }

      const hasGoalChanges = Boolean(
        target.goalDates?.length || target.syncInbox || target.syncRecurring || target.syncPurged
      )
      const hasLogChanges = Boolean(target.logDates?.length || target.syncPurged)

      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        if (hasGoalChanges && !hasLogChanges) {
          loadTodayData()
          loadHeatmap()
          if (
            tabRef.current === 'review' &&
            target.goalDates &&
            target.goalDates.includes(selectedDayDateRef.current)
          ) {
            loadDayReview(selectedDayDateRef.current)
          }
          return
        }

        if (hasLogChanges && !hasGoalChanges) {
          loadLogs()
          loadHeatmap()
          if (
            tabRef.current === 'review' &&
            target.logDates &&
            target.logDates.includes(selectedDayDateRef.current)
          ) {
            loadDayReview(selectedDayDateRef.current)
          }
          return
        }

        executeRefresh()
      }, 150)
    }

    const cleanup = window.api.events.onDataUpdated(onDataUpdated)

    const fallbackTimer = window.setInterval(() => {
      checkDateRollover()
      if (tabRef.current === 'review') loadDayReview(selectedDayDateRef.current)
    }, 30000)

    const handleFocus = (): void => {
      checkDateRollover()
    }
    window.addEventListener('focus', handleFocus)

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      cleanup()
      window.clearInterval(fallbackTimer)
      window.removeEventListener('focus', handleFocus)
    }
  }, [
    loadLogs,
    loadTodayData,
    loadHeatmap,
    loadDayReview,
    runCoordinatedRefresh,
    setTheme,
    checkDateRollover,
    dayCutoffHourRef,
    selectedDayDateRef,
    setDayCutoffHour,
    updateCutoffHour
  ])

  // React to dynamic changes in dayCutoffHour without re-mounting the primary app lifecycle listeners
  const isFirstCutoffMountRef = useRef(true)
  useEffect(() => {
    if (isFirstCutoffMountRef.current) {
      isFirstCutoffMountRef.current = false
      return
    }
    updateCutoffHour(dayCutoffHour)
    loadTodayData()
    loadLogs()
  }, [dayCutoffHour, updateCutoffHour, loadTodayData, loadLogs])

  return {
    loading,
    tabLoading,
    setTabLoading,
    logs,
    setLogs,
    heatmapData,
    setHeatmapData,
    todayGoals,
    setTodayGoals,
    todayReview,
    selectedDayReview,
    setSelectedDayReview,
    interval,
    setInterval_,
    dailyFocusTargetMinutes,
    tratakaDurationSeconds,
    setTratakaDurationSeconds,
    persistedLoggedMinutesMap,
    loadLogs,
    loadHeatmap,
    loadDayReview,
    loadTodayData,
    loadReview,
    runCoordinatedRefresh,
    tabRef
  }
}
