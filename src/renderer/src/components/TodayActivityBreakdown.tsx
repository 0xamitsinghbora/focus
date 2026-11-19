import React, { useMemo } from 'react'
import { DailyGoal, LogEntry } from '../../../shared/types'
import { cn, formatMinutes } from '../lib/utils'
import { getGroupTheme, getPreferredGroupColor } from '../lib/groupTheme'

interface BreakdownItem {
  key: string
  title: string
  minutes: number
  percentage: number
  percentageWidth: number
  colorClass: string
  dotClass: string
  badgeText: string
  badgeBg: string
  badgeBorder: string
  isBreak: boolean
}

interface TodayActivityBreakdownProps {
  logs: LogEntry[]
  goals: DailyGoal[]
}

export function TodayActivityBreakdown({
  logs,
  goals
}: TodayActivityBreakdownProps): React.JSX.Element | null {
  const items = useMemo<BreakdownItem[]>(() => {
    if (logs.length === 0) return []

    const goalsById = new Map<string, DailyGoal>()
    const goalsByTitle = new Map<string, DailyGoal>()
    for (const g of goals) {
      if (g.id) goalsById.set(g.id, g)
      if (g.title) goalsByTitle.set(g.title.trim().toLowerCase(), g)
    }

    const map = new Map<
      string,
      {
        title: string
        minutes: number
        groupTag?: string
        groupColor?: string
        isBreak: boolean
        isTask: boolean
      }
    >()

    let totalMins = 0

    for (const log of logs) {
      const isBreak =
        log.productivity === 'break' ||
        (log.productivity !== 'productive' && /\bbreak\b/i.test(log.text || ''))
      const mins =
        typeof log.productiveMinutes === 'number' ? log.productiveMinutes : log.durationMinutes || 0

      if (mins <= 0 && (log.durationMinutes || 0) <= 0) continue
      const effectiveMins = mins > 0 ? mins : log.durationMinutes || 1
      totalMins += effectiveMins

      let key: string
      let matchedGoal: DailyGoal | undefined

      if (isBreak) {
        key = '__break__'
      } else {
        matchedGoal =
          (log.goalId ? goalsById.get(log.goalId) : undefined) ||
          (log.goalTitle ? goalsByTitle.get(log.goalTitle.trim().toLowerCase()) : undefined) ||
          (log.text ? goalsByTitle.get(log.text.trim().toLowerCase()) : undefined)
        key =
          matchedGoal?.id ||
          log.goalId ||
          (log.goalTitle
            ? log.goalTitle.trim().toLowerCase()
            : log.text?.trim().toLowerCase() || 'Other')
      }

      const existing = map.get(key)
      if (existing) {
        existing.minutes += effectiveMins
        if (!existing.isTask && (matchedGoal || log.goalId || log.goalTitle)) {
          existing.isTask = true
          if (matchedGoal?.title || log.goalTitle) {
            existing.title = matchedGoal?.title || log.goalTitle!
          }
          if (matchedGoal?.groupTag) existing.groupTag = matchedGoal.groupTag
          if (matchedGoal?.groupColor) existing.groupColor = matchedGoal.groupColor
        }
      } else {
        const groupTag = matchedGoal?.groupTag
        const groupColor =
          matchedGoal?.groupColor || (groupTag ? getPreferredGroupColor(groupTag) : undefined)

        const isTask = Boolean(matchedGoal || log.goalId || log.goalTitle)
        map.set(key, {
          title: isBreak
            ? 'Break Time'
            : matchedGoal?.title || log.goalTitle || log.text || 'Other',
          minutes: effectiveMins,
          groupTag,
          groupColor,
          isBreak,
          isTask
        })
      }
    }

    if (totalMins === 0) return []

    const result: BreakdownItem[] = []

    for (const [key, val] of map.entries()) {
      const percentageWidth = totalMins > 0 ? (val.minutes / totalMins) * 100 : 0
      const percentage = Math.round(percentageWidth)

      if (val.isBreak) {
        result.push({
          key,
          title: val.title,
          minutes: val.minutes,
          percentage,
          percentageWidth,
          colorClass: 'bg-apple-red',
          dotClass: 'bg-apple-red',
          badgeText: 'text-apple-red',
          badgeBg: 'bg-apple-red/10',
          badgeBorder: 'border-apple-red/20',
          isBreak: true
        })
        continue
      }

      if (!val.isTask) {
        // Something Else -> Yellow (Amber)
        result.push({
          key,
          title: val.title,
          minutes: val.minutes,
          percentage,
          percentageWidth,
          colorClass: 'bg-apple-amber',
          dotClass: 'bg-apple-amber',
          badgeText: 'text-apple-amber',
          badgeBg: 'bg-apple-amber/10',
          badgeBorder: 'border-apple-amber/20',
          isBreak: false
        })
        continue
      }

      const color =
        val.groupColor || (val.groupTag ? getPreferredGroupColor(val.groupTag) : undefined)
      if (color || val.groupTag) {
        const theme = getGroupTheme(color || getPreferredGroupColor(val.groupTag!))
        result.push({
          key,
          title: val.title,
          minutes: val.minutes,
          percentage,
          percentageWidth,
          colorClass: theme.barBg,
          dotClass: theme.dotClass,
          badgeText: theme.badgeText,
          badgeBg: theme.badgeBg,
          badgeBorder: theme.badgeBorder,
          isBreak: false
        })
      } else {
        result.push({
          key,
          title: val.title,
          minutes: val.minutes,
          percentage,
          percentageWidth,
          colorClass: 'bg-apple-green',
          dotClass: 'bg-apple-green',
          badgeText: 'text-apple-green',
          badgeBg: 'bg-apple-green/10',
          badgeBorder: 'border-apple-green/20',
          isBreak: false
        })
      }
    }

    return result.sort((a, b) => b.minutes - a.minutes)
  }, [logs, goals])

  const tasksWorkedOnCount = useMemo(
    () => items.filter((item) => !item.isBreak && item.key !== '__break__').length,
    [items]
  )

  if (items.length === 0) return null

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-3.5 shadow-apple-subtle apple-card-elevated space-y-3">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-foreground tracking-[-0.02em] text-[13.5px]">
          Focus Breakdown
        </span>
        <span className="text-[11px] tabular-nums text-muted-foreground/80">
          {tasksWorkedOnCount} {tasksWorkedOnCount === 1 ? 'task' : 'tasks'} worked on
        </span>
      </div>

      {/* Stacked multi-color progress bar */}
      <div className="h-2.5 w-full rounded-full bg-secondary/80 overflow-hidden flex shadow-inner">
        {items.map((item) => (
          <div
            key={item.key}
            className={cn(
              'h-full transition-all duration-300 first:rounded-l-full last:rounded-r-full',
              item.colorClass
            )}
            style={{ width: `${item.percentageWidth}%` }}
            title={`${item.title}: ${formatMinutes(item.minutes)} (${item.percentage}%)`}
          />
        ))}
      </div>

      {/* Task pills list */}
      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
        {items.map((item) => (
          <div
            key={item.key}
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg border text-[11px] font-medium transition-all shadow-2xs',
              item.badgeBg,
              item.badgeBorder
            )}
          >
            <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', item.dotClass)} />
            <span
              className={cn(
                'font-medium truncate max-w-[140px] tracking-[-0.01em]',
                item.badgeText
              )}
            >
              {item.title}
            </span>
            <span className="tabular-nums text-[10.5px] text-muted-foreground font-normal">
              {formatMinutes(item.minutes)}
            </span>
            <span className="tabular-nums text-[9.5px] opacity-75">{item.percentage}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
