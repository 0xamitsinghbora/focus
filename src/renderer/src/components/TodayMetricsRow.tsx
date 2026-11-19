import { memo } from 'react'
import { MetricCard } from './DashboardLayout'
import { ModernAudioPlayer } from './SoundPlayer'
import { formatMinutes } from '../lib/utils'

export interface TodayMetricsRowProps {
  productiveToday: number
  todayFocusHint?: string
  todayDoneGoalsCount: number
  todayGoalsCount: number
  todayTasksHint: string
  logsCount: number
  todaySessionsHint: string
  currentStreak: number
  streakHint: string
  dailyFocusTargetMinutes: number
}

function DailyTargetCard({
  productiveToday,
  targetMinutes
}: {
  productiveToday: number
  targetMinutes: number
}): React.JSX.Element {
  const hasTarget = targetMinutes > 0
  const pct = hasTarget ? Math.min(100, Math.round((productiveToday / targetMinutes) * 100)) : 0
  const isComplete = hasTarget && pct >= 100
  const focusText = formatMinutes(productiveToday)
  const targetText = hasTarget ? `of ${formatMinutes(targetMinutes)}` : 'target'

  return (
    <div className="group relative rounded-2xl border border-border/60 bg-card p-4.5 shadow-apple-subtle apple-card-elevated transition-all duration-200 hover:border-border/90 hover:shadow-apple-card">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/85">
            Daily Focus Target
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-[20px] sm:text-[22px] xl:text-[24px] font-bold tracking-[-0.035em] tabular-nums leading-tight text-foreground truncate">
              {focusText}
            </span>
            <span className="text-[12px] sm:text-[13px] font-medium text-muted-foreground/70 tracking-[-0.01em] shrink-0">
              {targetText}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`text-[13px] font-bold tabular-nums tracking-[-0.01em] ${
              isComplete
                ? 'text-emerald-600 dark:text-emerald-400'
                : pct >= 75
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-muted-foreground'
            }`}
          >
            {hasTarget ? `${pct}%` : '—'}
          </span>
          {isComplete && (
            <div className="flex items-center justify-center h-6 w-6 rounded-full bg-emerald-500/15">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-600 dark:text-emerald-400">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
          )}
        </div>
      </div>
      <div className="mt-3 h-2 rounded-full bg-secondary/80 dark:bg-surface/60 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${
            isComplete
              ? 'bg-emerald-500 dark:bg-emerald-400'
              : pct >= 75
                ? 'bg-amber-500 dark:bg-amber-400'
                : 'bg-primary'
          }`}
          style={{ width: `${hasTarget ? pct : 0}%` }}
        />
      </div>
      <div className="mt-1.5 text-[11px] text-muted-foreground/65 font-normal tracking-[-0.005em] truncate">
        {isComplete
          ? 'Target reached — keep going!'
          : hasTarget
            ? productiveToday > 0
              ? `${formatMinutes(targetMinutes - productiveToday)} remaining`
              : 'Start a focus session to begin'
            : 'Set daily target in Settings'}
      </div>
    </div>
  )
}

export const TodayMetricsRow = memo(function TodayMetricsRow({
  productiveToday,
  todayDoneGoalsCount,
  todayGoalsCount,
  todayTasksHint,
  logsCount,
  todaySessionsHint,
  currentStreak,
  streakHint,
  dailyFocusTargetMinutes
}: TodayMetricsRowProps): React.JSX.Element {
  const sessionCountText = `${logsCount} ${logsCount === 1 ? 'session' : 'sessions'}`
  const focusTimeText = formatMinutes(productiveToday)
  const secondaryTimeHint =
    productiveToday > 0
      ? todaySessionsHint && todaySessionsHint !== 'No sessions logged today'
        ? todaySessionsHint.includes(focusTimeText)
          ? todaySessionsHint
          : `${focusTimeText} focus time`
        : `${focusTimeText} focus time`
      : todaySessionsHint &&
          todaySessionsHint !== 'No sessions logged today' &&
          todaySessionsHint !== '0m focus time'
        ? todaySessionsHint
        : 'No focus time logged'

  return (
    <div className="flex flex-col gap-3 shrink-0 relative z-30">
      {/* Modern Audio Player (Rectangle horizontally above the 4 cubes) */}
      <ModernAudioPlayer />

      {/* The 4 Metrics Cubes */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 relative z-10">
        <DailyTargetCard
          productiveToday={productiveToday}
          targetMinutes={dailyFocusTargetMinutes}
        />
        <MetricCard
          label="Tasks Completed"
          value={`${todayDoneGoalsCount} of ${todayGoalsCount} done`}
          accent={todayDoneGoalsCount > 0}
          hint={todayTasksHint}
        />
        <MetricCard
          label="Focus Sessions"
          value={sessionCountText}
          accent={logsCount > 0 || productiveToday > 0}
          hint={secondaryTimeHint}
        />
        <MetricCard
          label="Current Streak"
          value={
            currentStreak > 0 ? `${currentStreak} ${currentStreak === 1 ? 'day' : 'days'}` : '0 days'
          }
          accent={currentStreak > 0}
          hint={streakHint}
        />
      </div>
    </div>
  )
})
