import React, { memo, useMemo } from 'react'
import { parseLocalDate } from '../../../shared/types'
import { formatMinutes } from '../lib/utils'
import { WeeklyInsightsData, HourBucket } from '../hooks/useWeeklyInsights'

interface WeeklyInsightsPanelProps {
  insights: WeeklyInsightsData
}

function HourlyHeatmap({ buckets }: { buckets: HourBucket[] }): React.JSX.Element {
  const maxMinutes = useMemo(() => {
    let max = 0
    for (const b of buckets) {
      if (b.minutes > max) max = b.minutes
    }
    return max
  }, [buckets])

  const hours = useMemo(() => {
    const all: { hour: number; minutes: number; intensity: number }[] = []
    const bucketMap = new Map(buckets.map((b) => [b.hour, b.minutes]))
    for (let h = 5; h <= 23; h++) {
      const mins = bucketMap.get(h) || 0
      all.push({ hour: h, minutes: mins, intensity: maxMinutes > 0 ? mins / maxMinutes : 0 })
    }
    return all
  }, [buckets, maxMinutes])

  const formatHour = (h: number): string => {
    if (h === 0) return '12a'
    if (h === 12) return '12p'
    return h < 12 ? `${h}a` : `${h - 12}p`
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-end gap-[3px] h-[52px]">
        {hours.map((h) => (
          <div
            key={h.hour}
            className="flex-1 flex flex-col items-center justify-end h-full"
            title={`${formatHour(h.hour)}: ${formatMinutes(h.minutes)}`}
          >
            <div
              className={`w-full rounded-sm transition-all duration-300 ${
                h.intensity > 0.7
                  ? 'bg-emerald-500 dark:bg-emerald-400'
                  : h.intensity > 0.4
                    ? 'bg-emerald-400/70 dark:bg-emerald-500/60'
                    : h.intensity > 0
                      ? 'bg-emerald-300/50 dark:bg-emerald-600/40'
                      : 'bg-secondary/50 dark:bg-surface/40'
              }`}
              style={{
                height: `${Math.max(h.intensity > 0 ? 12 : 4, h.intensity * 100)}%`,
                minHeight: h.intensity > 0 ? 6 : 2
              }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-[3px]">
        {hours.map((h) => (
          <div
            key={h.hour}
            className="flex-1 text-center text-[8px] text-muted-foreground/50 tabular-nums leading-none"
          >
            {h.hour % 3 === 0 ? formatHour(h.hour) : ''}
          </div>
        ))}
      </div>
    </div>
  )
}

function DailyBarChart({
  breakdown
}: {
  breakdown: { date: string; minutes: number; goalsDone: number; goalsTotal: number }[]
}): React.JSX.Element {
  const maxMinutes = useMemo(() => {
    let max = 0
    for (const d of breakdown) {
      if (d.minutes > max) max = d.minutes
    }
    return Math.max(max, 1)
  }, [breakdown])

  const dayLabel = (dateStr: string): string => {
    const d = parseLocalDate(dateStr)
    return d.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 2)
  }

  return (
    <div className="flex items-end gap-1.5 h-[48px]">
      {breakdown.map((d) => {
        const pct = (d.minutes / maxMinutes) * 100
        return (
          <div
            key={d.date}
            className="flex-1 flex flex-col items-center gap-1"
            title={`${dayLabel(d.date)}: ${formatMinutes(d.minutes)} · ${d.goalsDone}/${d.goalsTotal} tasks`}
          >
            <div className="w-full flex items-end h-[32px]">
              <div
                className={`w-full rounded-sm transition-all duration-300 ${
                  d.minutes > 0
                    ? 'bg-primary/70 dark:bg-primary/60'
                    : 'bg-secondary/40 dark:bg-surface/30'
                }`}
                style={{
                  height: `${Math.max(d.minutes > 0 ? 10 : 4, pct)}%`,
                  minHeight: d.minutes > 0 ? 4 : 2
                }}
              />
            </div>
            <span className="text-[9px] font-medium text-muted-foreground/60 leading-none tabular-nums">
              {dayLabel(d.date)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function InsightStat({
  label,
  value,
  detail,
  accent
}: {
  label: string
  value: string
  detail?: string
  accent?: boolean
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[10px] font-semibold uppercase tracking-[0.05em] text-muted-foreground/70 truncate">
        {label}
      </span>
      <span
        className={`text-[16px] font-bold tracking-[-0.025em] tabular-nums leading-tight truncate ${accent ? 'text-foreground' : 'text-foreground/85'}`}
      >
        {value}
      </span>
      {detail && (
        <span className="text-[10.5px] text-muted-foreground/60 leading-tight truncate">
          {detail}
        </span>
      )}
    </div>
  )
}

export const WeeklyInsightsPanel = memo(function WeeklyInsightsPanel({
  insights
}: WeeklyInsightsPanelProps): React.JSX.Element | null {
  const {
    loading,
    totalFocusMinutes,
    avgDailyFocusMinutes,
    activeDays,
    bestDay,
    bestHours,
    peakHourLabel,
    dailyTargetMinutes,
    targetHitDays,
    targetHitRate,
    dailyBreakdown,
    longestSession
  } = insights

  const bestDayLabel = useMemo(() => {
    if (!bestDay) return ''
    const d = parseLocalDate(bestDay.date)
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  }, [bestDay])

  if (loading) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-apple-subtle apple-card-elevated">
        <div className="flex items-center gap-2 text-muted-foreground text-[13px]">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Loading weekly insights...
        </div>
      </div>
    )
  }

  if (totalFocusMinutes === 0 && activeDays === 0) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card shadow-apple-subtle apple-card-elevated overflow-hidden">
        <div className="px-5 pt-4 pb-3 border-b border-border/40">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-lg bg-apple-indigo/10 text-apple-indigo flex items-center justify-center shrink-0">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 20v-6" />
                  <path d="M6 20V10" />
                  <path d="M18 20V4" />
                </svg>
              </div>
              <div>
                <h3 className="text-[14px] font-semibold tracking-[-0.02em] text-foreground">
                  Weekly Insights
                </h3>
                <p className="text-[11px] text-muted-foreground/70 tracking-[-0.005em]">
                  Last 7 days summary
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border border-muted-foreground/20 bg-muted/40 text-muted-foreground select-none">
              0/7 active days
            </div>
          </div>
        </div>

        <div className="p-8 flex flex-col items-center justify-center text-center">
          <div className="h-12 w-12 rounded-2xl bg-apple-indigo/10 border border-apple-indigo/20 text-apple-indigo flex items-center justify-center mb-3.5 shadow-2xs">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
          </div>
          <h4 className="text-[14.5px] font-semibold text-foreground tracking-[-0.015em]">
            Ready to build your focus rhythm?
          </h4>
          <p className="mt-1.5 max-w-sm text-[12px] leading-relaxed text-muted-foreground/80 tracking-[-0.005em]">
            Complete focus sessions this week to unlock insights into your peak hours, daily
            averages, and productivity trends.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-[11px] text-muted-foreground/70">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-secondary/50 border border-border/40">
              <span className="h-1.5 w-1.5 rounded-full bg-apple-indigo" />
              Daily Focus Breakdown
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-secondary/50 border border-border/40">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Peak Productive Hours
            </span>
            {dailyTargetMinutes > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-secondary/50 border border-border/40">
                <span className="h-1.5 w-1.5 rounded-full bg-apple-green" />
                Target Progress
              </span>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-card shadow-apple-subtle apple-card-elevated overflow-hidden">
      <div className="px-5 pt-4 pb-3 border-b border-border/40">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-apple-indigo/10 text-apple-indigo flex items-center justify-center shrink-0">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 20v-6" />
                <path d="M6 20V10" />
                <path d="M18 20V4" />
              </svg>
            </div>
            <div>
              <h3 className="text-[14px] font-semibold tracking-[-0.02em] text-foreground">
                Weekly Insights
              </h3>
              <p className="text-[11px] text-muted-foreground/70 tracking-[-0.005em]">
                Last 7 days summary
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border border-primary/20 bg-primary/5 text-primary select-none">
            {activeDays}/7 active days
          </div>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Key Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <InsightStat
            label="Total Focus"
            value={formatMinutes(totalFocusMinutes)}
            detail={`${activeDays} active ${activeDays === 1 ? 'day' : 'days'}`}
            accent
          />
          <InsightStat
            label="Daily Average"
            value={formatMinutes(avgDailyFocusMinutes)}
            detail="across 7 days"
          />
          <InsightStat
            label="Best Day"
            value={bestDay ? formatMinutes(bestDay.minutes) : '—'}
            detail={bestDayLabel}
            accent={Boolean(bestDay)}
          />
          {dailyTargetMinutes > 0 ? (
            <InsightStat
              label="Target Hit Rate"
              value={`${targetHitRate}%`}
              detail={`${targetHitDays}/7 days hit ${formatMinutes(dailyTargetMinutes)}`}
              accent={targetHitRate >= 70}
            />
          ) : (
            <InsightStat
              label="Longest Session"
              value={formatMinutes(longestSession)}
              detail={longestSession > 0 ? 'single session record' : 'no sessions'}
            />
          )}
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Daily Breakdown */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground/70">
                Daily Focus
              </span>
              <span className="text-[10px] text-muted-foreground/50">
                {formatMinutes(totalFocusMinutes)} total
              </span>
            </div>
            <DailyBarChart breakdown={dailyBreakdown} />
          </div>

          {/* Hourly Heatmap */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground/70">
                Best Hours
              </span>
              {peakHourLabel && (
                <span className="text-[10px] text-muted-foreground/50">Peak: {peakHourLabel}</span>
              )}
            </div>
            <HourlyHeatmap buckets={bestHours} />
          </div>
        </div>

        {/* Target Hit Rate bar (only if target is set) */}
        {dailyTargetMinutes > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground/70">
                Daily Target Progress
              </span>
              <span className="text-[10px] text-muted-foreground/50">
                {formatMinutes(dailyTargetMinutes)} / day target
              </span>
            </div>
            <div className="flex items-center gap-1">
              {dailyBreakdown.map((d) => {
                const pct =
                  dailyTargetMinutes > 0
                    ? Math.min(100, Math.round((d.minutes / dailyTargetMinutes) * 100))
                    : 0
                const isHit = pct >= 100
                const dayLabel = parseLocalDate(d.date)
                  .toLocaleDateString(undefined, { weekday: 'short' })
                  .slice(0, 2)
                return (
                  <div
                    key={d.date}
                    className="flex-1 flex flex-col items-center gap-1"
                    title={`${dayLabel}: ${formatMinutes(d.minutes)} (${pct}%)`}
                  >
                    <div className="w-full h-3 rounded-sm bg-secondary/60 dark:bg-surface/40 overflow-hidden">
                      <div
                        className={`h-full rounded-sm transition-all duration-300 ${
                          isHit
                            ? 'bg-emerald-500 dark:bg-emerald-400'
                            : pct >= 75
                              ? 'bg-amber-500/80 dark:bg-amber-400/70'
                              : pct > 0
                                ? 'bg-primary/60'
                                : ''
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-[9px] font-medium text-muted-foreground/50 tabular-nums leading-none">
                      {dayLabel}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
})
