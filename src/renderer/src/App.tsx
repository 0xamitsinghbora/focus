import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Heatmap } from './components/Heatmap'
import { Tabs, TabsContent } from './components/ui/tabs'
import { TimelineList } from './components/TimelineList'
import { DailyGoalsPanel } from './components/DailyGoalsPanel'
import { DayReviewPanel } from './components/DayReviewPanel'
import { GoalsPanel } from './components/GoalsPanel'
import { MetricCard, PageShell, Panel, SectionHeader } from './components/DashboardLayout'
import { FocusLogo } from './components/FocusLogo'
import { SettingsPanel } from './components/SettingsPanel'
import { TodayActivityBreakdown } from './components/TodayActivityBreakdown'
import { formatMinutes, cn } from './lib/utils'
import { useTheme } from './lib/theme'
import { useToast } from './lib/useToast'
import { FocusSessionProvider } from './context/FocusSessionProvider'
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useDateRollover } from './hooks/useDateRollover'
import { useTabNavigation } from './hooks/useTabNavigation'
import { useTodayMetrics } from './hooks/useTodayMetrics'
import { useReviewMetrics } from './hooks/useReviewMetrics'
import { useGoalOperations } from './hooks/useGoalOperations'
import { useAppDataOrchestrator } from './hooks/useAppDataOrchestrator'
import { AppHeader } from './components/AppHeader'
import { TodayMetricsRow } from './components/TodayMetricsRow'
import { ReviewDateNavigator } from './components/ReviewDateNavigator'
import { WeeklyInsightsPanel } from './components/WeeklyInsightsPanel'
import { useWeeklyInsights } from './hooks/useWeeklyInsights'
import { MorningRitualModal } from './components/MorningRitualModal'
import { BreakRecoveryModal } from './components/BreakRecoveryModal'
import { OnboardingModal, OnboardingConfig } from './components/OnboardingModal'
import { TratakaModal } from './components/TratakaModal'
import { BreakNudgePayload, AppSettings } from '../../shared/types'
import { playFocusChime } from './lib/audioEngine'

function App(): React.JSX.Element {
  const isMac = useMemo(() => {
    return typeof navigator !== 'undefined' && /Mac|iPhone|iPod|iPad/i.test(navigator.userAgent)
  }, [])

  const [theme, setTheme] = useTheme()
  const toast = useToast()
  const toastRef = useRef(toast)
  useEffect(() => {
    toastRef.current = toast
  }, [toast])

  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false)
  const [isMorningRitualOpen, setIsMorningRitualOpen] = useState(false)
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false)
  const [lastMorningRitualDate, setLastMorningRitualDate] = useState<string>('')
  const [activeBreakNudge, setActiveBreakNudge] = useState<BreakNudgePayload | null>(null)
  const [isTratakaOpen, setIsTratakaOpen] = useState(false)
  const ritualCheckDoneRef = useRef(false)
  const onboardingCheckDoneRef = useRef(false)

  // Listen for remote quick actions (such as dot-reset from widget or prompt)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.api?.session?.onQuickAction) return
    const cleanup = window.api.session.onQuickAction((action) => {
      if (action === 'dot-reset') {
        setIsTratakaOpen(true)
      }
    })
    return cleanup
  }, [])

  // Global hotkey to open shortcuts modal (? or Ctrl+/)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          target.getAttribute?.('role') === 'textbox')

      if (
        !isInput &&
        ((e.key === '?' && !e.ctrlKey && !e.metaKey) || ((e.ctrlKey || e.metaKey) && e.key === '/'))
      ) {
        e.preventDefault()
        setIsShortcutsOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Listen for escalating break nudges from scheduler
  useEffect(() => {
    if (!window.api?.scheduler?.onBreakNudge) return
    const cleanup = window.api.scheduler.onBreakNudge((payload: BreakNudgePayload) => {
      try {
        playFocusChime('break').catch(() => {})
      } catch {
        // ignore audio failure
      }

      if (payload.urgency >= 2) {
        setActiveBreakNudge(payload)
      } else {
        toastRef.current.show(payload.body, {
          title: payload.title,
          type: 'info',
          action: {
            label: 'Resume Focus',
            onClick: () => {
              window.api.session?.quickAction?.('restart-session')
            }
          }
        })
      }
    })
    return () => {
      cleanup?.()
    }
  }, [])

  const rolloverHandlerRef = useRef<(() => void) | null>(null)
  const {
    todayDateStr,
    selectedDayDate,
    selectedDayDateRef,
    setSelectedDayDate,
    dayCutoffHour,
    dayCutoffHourRef,
    setDayCutoffHour,
    hasUserSelectedDateRef,
    getTodayStr,
    checkDateRollover,
    updateCutoffHour
  } = useDateRollover({
    onRollover: () => rolloverHandlerRef.current?.()
  })

  const tabChangeHandlerRef = useRef<
    ((targetTab: 'today' | 'goals' | 'review' | 'settings') => Promise<void>) | null
  >(null)
  const { tab, setTab, visitedTabs, triggerAddGoal, setTriggerAddGoal } = useTabNavigation({
    onTabChange: (targetTab) => tabChangeHandlerRef.current?.(targetTab)
  })

  // Listen for software update availability and ready-to-install notifications
  useEffect(() => {
    if (!window.api?.updater?.onStatusChange) return
    let lastNotifiedVersion = ''
    const cleanup = window.api.updater.onStatusChange((updateState) => {
      if (updateState.status === 'available' && updateState.availableUpdate?.version) {
        const ver = updateState.availableUpdate.version
        if (ver !== lastNotifiedVersion) {
          lastNotifiedVersion = ver
          toastRef.current.show(`Focus v${ver} is now available.`, {
            title: 'Update Available',
            type: 'info',
            action: {
              label: 'View in Settings',
              onClick: () => setTab('settings')
            }
          })
        }
      } else if (updateState.status === 'downloaded' && updateState.availableUpdate?.version) {
        toastRef.current.show(
          `Focus v${updateState.availableUpdate.version} is ready to install.`,
          {
            title: 'Update Ready',
            type: 'success',
            action: {
              label: 'Restart & Install',
              onClick: () => {
                window.api.updater.installUpdate().catch(() => {})
              }
            }
          }
        )
      }
    })
    return () => {
      cleanup?.()
    }
  }, [setTab])

  const {
    loading,
    tabLoading,
    setTabLoading,
    logs,
    heatmapData,
    todayGoals,
    setTodayGoals,
    todayReview,
    selectedDayReview,
    interval,
    setInterval_,
    dailyFocusTargetMinutes,
    persistedLoggedMinutesMap,
    loadLogs,
    loadHeatmap,
    loadDayReview,
    loadTodayData,
    loadReview,
    tabRef
  } = useAppDataOrchestrator({
    getTodayStr,
    selectedDayDateRef,
    dayCutoffHour,
    dayCutoffHourRef,
    setDayCutoffHour,
    updateCutoffHour,
    checkDateRollover,
    setTheme,
    tab
  })

  useEffect(() => {
    rolloverHandlerRef.current = () => {
      ritualCheckDoneRef.current = false
      onboardingCheckDoneRef.current = false
      setLastMorningRitualDate('')
      loadTodayData()
      loadLogs()
      loadHeatmap()
    }
  }, [loadTodayData, loadLogs, loadHeatmap])

  // Automatic detection of onboarding or first daily open for morning planning ritual
  useEffect(() => {
    if (loading || onboardingCheckDoneRef.current) return
    onboardingCheckDoneRef.current = true

    window.api.settings
      .get()
      .then((settings) => {
        setLastMorningRitualDate(settings?.lastMorningRitualDate || '')
        const hasLogs = logs.length > 0
        const hasGoals = todayGoals.length > 0
        const hasHeatmap = heatmapData && Object.keys(heatmapData).length > 0
        const isNewUser = !settings?.hasCompletedOnboarding && !hasLogs && !hasGoals && !hasHeatmap

        if (isNewUser) {
          // Open Planner tab and show Onboarding setup guide
          setTab('goals')
          setIsOnboardingOpen(true)
        } else {
          // Existing user without hasCompletedOnboarding saved yet
          if (!settings?.hasCompletedOnboarding) {
            window.api.settings.patch({ hasCompletedOnboarding: true }).catch(() => {})
          }
          // Only check morning ritual if onboarding is not active
          const today = getTodayStr()
          if (settings && settings.lastMorningRitualDate !== today) {
            setIsMorningRitualOpen(true)
          }
        }
      })
      .catch(() => {})
  }, [loading, logs.length, todayGoals.length, heatmapData, getTodayStr, setTab])

  const handleUpdateTargetMinutes = useCallback(
    async (minutes: number) => {
      try {
        await window.api.settings.patch({ dailyFocusTargetMinutes: minutes })
        await loadTodayData()
      } catch (err) {
        console.error('Failed to update target minutes:', err)
      }
    },
    [loadTodayData]
  )

  const tabChangeSeqRef = useRef(0)
  const handleTabChange = useCallback(
    async (targetTab: 'today' | 'goals' | 'review' | 'settings') => {
      if (targetTab !== 'goals') {
        setTriggerAddGoal(0)
      }
      const seq = ++tabChangeSeqRef.current

      if (targetTab === 'settings') {
        setTabLoading(false)
        return
      }

      setTabLoading(true)
      try {
        if (targetTab === 'today') {
          await loadTodayData()
        } else if (targetTab === 'goals') {
          await loadTodayData()
        } else if (targetTab === 'review') {
          await loadReview()
        }
      } catch (err) {
        console.error('Failed to load tab data:', err)
      } finally {
        if (seq === tabChangeSeqRef.current) {
          setTabLoading(false)
        }
      }
    },
    [loadTodayData, loadReview, setTriggerAddGoal, setTabLoading]
  )

  useEffect(() => {
    tabChangeHandlerRef.current = handleTabChange
  }, [handleTabChange])

  const handleDayClick = useCallback(
    async (dateStr: string): Promise<void> => {
      hasUserSelectedDateRef.current = true
      selectedDayDateRef.current = dateStr
      setSelectedDayDate(dateStr)
      await loadDayReview(dateStr)
    },
    [loadDayReview, hasUserSelectedDateRef, selectedDayDateRef, setSelectedDayDate]
  )

  const handleReviewDateChange = useCallback(
    async (date: string): Promise<void> => {
      hasUserSelectedDateRef.current = true
      selectedDayDateRef.current = date
      setSelectedDayDate(date)
      await loadDayReview(date)
    },
    [loadDayReview, hasUserSelectedDateRef, selectedDayDateRef, setSelectedDayDate]
  )

  const {
    handleAddGoal,
    handleUpdateGoal,
    handleUpdateGoals,
    handlePromoteGoal,
    handleDeleteGoal,
    handleDeleteGoals,
    handleGoalRestored,
    handleCarryGoal,
    handleCarryAllGoals,
    handleReopenGoal,
    handleResetTriggerAdd,
    handleNavigateToToday,
    handleOpenPlanner
  } = useGoalOperations({
    getTodayStr,
    todayGoals,
    setTodayGoals,
    loadTodayData,
    toastRef,
    setTab,
    setTriggerAddGoal,
    loadHeatmap,
    loadDayReview,
    selectedDayDateRef,
    tabRef
  })

  const handleSettingsSaved = useCallback(async () => {
    try {
      const settings = await window.api.settings.get()
      if (typeof settings?.dayCutoffHour === 'number') {
        updateCutoffHour(settings.dayCutoffHour)
      }
      if (typeof settings?.reminderIntervalMinutes === 'number') {
        setInterval_(settings.reminderIntervalMinutes)
      }
    } catch (e) {
      console.error('Failed to reload settings after save:', e)
    }
  }, [updateCutoffHour, setInterval_])

  const handleSyncComplete = useCallback(async () => {
    await loadTodayData()
  }, [loadTodayData])

  const handleIntervalChange = useCallback(
    (n: number) => {
      setInterval_(n)
    },
    [setInterval_]
  )

  const handleCompleteOnboarding = useCallback(
    async (config: OnboardingConfig) => {
      try {
        const patch: Partial<AppSettings> = {
          hasCompletedOnboarding: true,
          reminderIntervalMinutes: config.intervalMinutes,
          dailyFocusTargetMinutes: config.dailyTargetMinutes
        }
        await window.api.settings.patch(patch)
        setInterval_(config.intervalMinutes)

        if (config.initialGoalTitle?.trim()) {
          await handleAddGoal(
            config.initialGoalTitle.trim(),
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            'in_progress'
          )
          try {
            window.api.session?.quickAction?.('restart-session')
          } catch {
            // ignore session error
          }
        }

        setIsOnboardingOpen(false)
        setTab('goals')
        await loadTodayData()
        playFocusChime('complete').catch(() => {})
        toastRef.current.show('Welcome to Focus! Your daily planner is set up and ready.', {
          type: 'success',
          title: 'Setup Complete'
        })
      } catch (err) {
        console.error('Failed to complete onboarding:', err)
      }
    },
    [handleAddGoal, loadTodayData, setInterval_, setTab]
  )

  const {
    activeTodayGoals,
    plannedTodayGoals,
    todayDoneGoals,
    productiveToday,
    goalLoggedMinutesMap,
    todayFocusHint,
    todayTasksHint,
    todaySessionsHint,
    heatmapStats,
    streakHint
  } = useTodayMetrics({
    todayGoals,
    logs,
    todayReview,
    persistedLoggedMinutesMap,
    heatmapData,
    todayDateStr
  })

  const { reviewLogs, reviewProductiveMins, reviewFocusHint, reviewSessionsHint } =
    useReviewMetrics({
      selectedDayDate,
      todayDateStr: getTodayStr(),
      selectedDayReview,
      todayReview,
      productiveToday
    })

  const weeklyInsights = useWeeklyInsights(getTodayStr(), tab === 'review')

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background text-muted-foreground">
        <div className="flex flex-col items-center gap-4">
          <FocusLogo size={52} variant="tile" animated />
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold tracking-tight text-foreground/80">
              Focus
            </span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <FocusSessionProvider
      onUpdateDailyGoal={handleUpdateGoal}
      onDataRefresh={loadTodayData}
      availableGoals={todayGoals}
      dayCutoffHour={dayCutoffHour}
      defaultIntervalMinutes={interval}
    >
      <Tabs
        value={tab}
        onValueChange={(v) => {
          setTab(v as 'today' | 'goals' | 'review' | 'settings')
        }}
        className="flex h-screen w-screen flex-col overflow-hidden bg-background font-sans text-foreground"
      >
        <a href="#main-content" className="skip-to-content">
          Skip to content
        </a>

        {/* Native Window Drag Region (offset on macOS to avoid occluding window traffic light controls) */}
        <div
          className={cn('absolute right-0 top-0 z-20 h-8.5', isMac ? 'left-20' : 'left-0')}
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        />
        {/* macOS Traffic Lights Protection Area */}
        {isMac && (
          <div
            className="absolute left-0 top-0 z-50 h-8.5 w-20"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            aria-hidden="true"
          />
        )}

        <AppHeader
          onOpenMorningRitual={
            lastMorningRitualDate !== todayDateStr ? () => setIsMorningRitualOpen(true) : undefined
          }
          onOpenTrataka={() => setIsTratakaOpen(true)}
        />

        <div id="main-content" role="main" className="relative z-10 min-h-0 flex-1 overflow-hidden">
          {tabLoading && (
            <div className="absolute top-0 left-0 right-0 z-40 h-0.5 overflow-hidden">
              <div
                className="h-full w-1/3 bg-primary/70 rounded-full animate-[shimmer_1s_ease-in-out_infinite]"
                style={{ animation: 'shimmer 1s ease-in-out infinite' }}
              />
            </div>
          )}
          {/* Today Tab */}
          <TabsContent
            value="today"
            className="h-full mt-0 data-[state=inactive]:hidden outline-none"
          >
            <ErrorBoundary fallbackTitle="Today panel encountered an error">
              <PageShell className="overflow-y-auto custom-scrollbar md:overflow-hidden md:flex md:flex-col gap-3">
                {/* Today's Summary Metrics Row */}
                <TodayMetricsRow
                  productiveToday={productiveToday}
                  todayFocusHint={todayFocusHint}
                  todayDoneGoalsCount={todayDoneGoals.length}
                  todayGoalsCount={todayGoals.length}
                  todayTasksHint={todayTasksHint}
                  logsCount={logs.length}
                  todaySessionsHint={todaySessionsHint}
                  currentStreak={heatmapStats.currentStreak}
                  streakHint={streakHint}
                  dailyFocusTargetMinutes={dailyFocusTargetMinutes}
                />

                {/* 2-Column Task Management & Activity Summary Grid */}
                <div className="grid gap-4 md:grid-cols-2 md:flex-1 md:min-h-0">
                  <DailyGoalsPanel
                    goals={activeTodayGoals}
                    plannedGoals={plannedTodayGoals}
                    completedGoals={todayDoneGoals}
                    onPromoteGoal={handlePromoteGoal}
                    onUpdateGoal={handleUpdateGoal}
                    onDeleteGoal={handleDeleteGoal}
                    goalLoggedMinutesMap={goalLoggedMinutesMap}
                    onOpenPlanner={handleOpenPlanner}
                  />

                  <Panel className="flex flex-col overflow-hidden min-h-0 lg:h-full p-5 gap-3">
                    <SectionHeader
                      title="Today's Activity"
                      subtitle="Summary of focus sessions logged today"
                    />

                    {/* Breakdown of time spent across tasks today */}
                    <TodayActivityBreakdown logs={logs} goals={todayGoals} />

                    <div className="mt-1 flex-1 min-h-0 overflow-hidden rounded-xl border border-border/70 bg-surface/30">
                      <TimelineList
                        logs={logs}
                        goals={todayGoals}
                        emptyMessage="No focus sessions recorded today."
                        emptySubtitle="Focus sessions appear here chronologically as you work on tasks."
                        showTimelineBar={false}
                      />
                    </div>
                  </Panel>
                </div>
              </PageShell>
            </ErrorBoundary>
          </TabsContent>

          {/* Goals Tab */}
          <TabsContent
            value="goals"
            className="h-full mt-0 data-[state=inactive]:hidden outline-none"
          >
            {visitedTabs.has('goals') && (
              <ErrorBoundary fallbackTitle="Goals panel encountered an error">
                <PageShell className="overflow-hidden h-full flex flex-col">
                  <GoalsPanel
                    dailyGoals={todayGoals}
                    dayCutoffHour={dayCutoffHour}
                    onAddDailyGoal={handleAddGoal}
                    onUpdateDailyGoal={handleUpdateGoal}
                    onUpdateDailyGoals={handleUpdateGoals}
                    onDeleteDailyGoal={handleDeleteGoal}
                    onDeleteDailyGoals={handleDeleteGoals}
                    onGoalRestored={handleGoalRestored}
                    onCarryDailyGoal={handleCarryGoal}
                    triggerAdd={triggerAddGoal}
                    onResetTriggerAdd={handleResetTriggerAdd}
                    isActive={tab === 'goals'}
                    goalLoggedMinutesMap={goalLoggedMinutesMap}
                    onNavigateToToday={handleNavigateToToday}
                  />
                </PageShell>
              </ErrorBoundary>
            )}
          </TabsContent>

          {/* Review Tab */}
          <TabsContent
            value="review"
            className="h-full mt-0 data-[state=inactive]:hidden outline-none"
          >
            {visitedTabs.has('review') && (
              <ErrorBoundary fallbackTitle="Review panel encountered an error">
                <PageShell className="overflow-y-auto custom-scrollbar space-y-4">
                  <Panel className="p-3 overflow-visible relative z-20">
                    <ReviewDateNavigator
                      selectedDayDate={selectedDayDate}
                      todayStr={getTodayStr()}
                      dayCutoffHour={dayCutoffHour}
                      onDateChange={handleReviewDateChange}
                      onJumpToToday={() => handleReviewDateChange(getTodayStr())}
                    />
                  </Panel>

                  <div className="grid gap-3 md:grid-cols-3 shrink-0">
                    <MetricCard
                      label="Focus Time"
                      value={formatMinutes(reviewProductiveMins)}
                      accent={reviewProductiveMins > 0}
                      hint={reviewFocusHint}
                    />
                    <MetricCard
                      label="Focus Sessions"
                      value={`${reviewLogs.length} ${reviewLogs.length === 1 ? 'session' : 'sessions'}`}
                      hint={
                        selectedDayReview?.averageFocusQuality
                          ? `⚡ ${selectedDayReview.averageFocusQuality}/5 quality · ${reviewSessionsHint}`
                          : reviewSessionsHint
                      }
                    />
                    <MetricCard
                      label="Current Streak"
                      value={
                        heatmapStats.currentStreak > 0
                          ? `${heatmapStats.currentStreak} ${heatmapStats.currentStreak === 1 ? 'day' : 'days'}`
                          : '0 days'
                      }
                      accent={heatmapStats.currentStreak > 0}
                      hint={streakHint}
                    />
                  </div>

                  <Panel className="p-4">
                    <SectionHeader title="Activity Heatmap" />
                    <div className="mt-3">
                      <Heatmap
                        data={heatmapData}
                        selectedDate={selectedDayDate}
                        onDayClick={handleDayClick}
                        dayCutoffHour={dayCutoffHour}
                      />
                    </div>
                  </Panel>

                  <WeeklyInsightsPanel insights={weeklyInsights} />

                  <Panel className="min-h-80 overflow-hidden">
                    <DayReviewPanel
                      review={selectedDayReview}
                      today={getTodayStr()}
                      dayCutoffHour={dayCutoffHour}
                      onCarryGoal={handleCarryGoal}
                      onCarryAllGoals={handleCarryAllGoals}
                      onReopenGoal={handleReopenGoal}
                    />
                  </Panel>
                </PageShell>
              </ErrorBoundary>
            )}
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent
            value="settings"
            className="h-full mt-0 data-[state=inactive]:hidden outline-none"
          >
            {tab === 'settings' && (
              <ErrorBoundary fallbackTitle="Settings panel encountered an error">
                <SettingsPanel
                  theme={theme}
                  setTheme={setTheme}
                  onSettingsSaved={handleSettingsSaved}
                  onSyncComplete={handleSyncComplete}
                  onIntervalChange={handleIntervalChange}
                  onOpenShortcuts={() => setIsShortcutsOpen(true)}
                  onOpenOnboarding={() => setIsOnboardingOpen(true)}
                  onOpenMorningRitual={() => setIsMorningRitualOpen(true)}
                />
              </ErrorBoundary>
            )}
          </TabsContent>
        </div>
      </Tabs>
      <KeyboardShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
        isMac={isMac}
      />
      <MorningRitualModal
        isOpen={isMorningRitualOpen}
        onClose={() => setIsMorningRitualOpen(false)}
        todayStr={todayDateStr}
        todayGoals={todayGoals}
        dailyFocusTargetMinutes={dailyFocusTargetMinutes}
        onUpdateTargetMinutes={handleUpdateTargetMinutes}
        onCarryGoal={handleCarryGoal}
        onPromoteGoal={handlePromoteGoal}
        onAddGoal={handleAddGoal}
        onRitualCompleted={async () => {
          setLastMorningRitualDate(todayDateStr)
          await loadTodayData()
        }}
      />
      <BreakRecoveryModal
        nudge={activeBreakNudge}
        onClose={() => setActiveBreakNudge(null)}
        onResumeFocus={() => {
          window.api.session?.quickAction?.('restart-session')
          setActiveBreakNudge(null)
        }}
        onStartMicroSession={() => {
          window.api.session?.quickAction?.('restart-session')
          setActiveBreakNudge(null)
        }}
        onExtendBreak={() => {
          window.api.session?.quickAction?.('add-5m')
          setActiveBreakNudge(null)
        }}
      />
      <OnboardingModal
        isOpen={isOnboardingOpen}
        onClose={() => setIsOnboardingOpen(false)}
        defaultIntervalMinutes={interval}
        defaultDailyTargetMinutes={dailyFocusTargetMinutes}
        onComplete={handleCompleteOnboarding}
      />
      <TratakaModal isOpen={isTratakaOpen} onClose={() => setIsTratakaOpen(false)} />
    </FocusSessionProvider>
  )
}

export default App
