import React from 'react'
import { LogEntry, DailyGoal } from '../../../shared/types'
import { formatTime, formatMinutes, formatDurationMs, cn } from '../lib/utils'
import { getLogThemeConfig } from '../lib/timelineTheme'
import { getLogTime } from '../lib/timelineUtils'

const formatDuration = formatDurationMs

export interface TimelineSessionCardProps {
  log: LogEntry
  goals?: DailyGoal[]
  isSelected: boolean
  isFirst: boolean
  prevLog: LogEntry | null
  onSelect: (id: string) => void
  onHover: (id: string | null) => void
  setRef?: (el: HTMLDivElement | null) => void
}

export const TimelineSessionCard = React.memo(function TimelineSessionCard({
  log,
  goals,
  isSelected,
  isFirst,
  prevLog,
  onSelect,
  onHover,
  setRef
}: TimelineSessionCardProps): React.JSX.Element {
  const config = getLogThemeConfig(log, goals)
  const isBreak = log.productivity === 'break' || log.text?.toLowerCase().includes('break')
  const isTask = Boolean(log.goalId || log.goalTitle)
  const displayMinutes = log.durationMinutes || log.productiveMinutes
  const durationText = displayMinutes && displayMinutes > 0 ? formatMinutes(displayMinutes) : ''

  const clockSpanMinutes =
    log.startedAt && log.endedAt
      ? Math.round(
          (new Date(log.endedAt).getTime() - new Date(log.startedAt).getTime()) / 60000
        )
      : 0
  const idleDeductedMinutes =
    displayMinutes && clockSpanMinutes > displayMinutes + 1
      ? clockSpanMinutes - displayMinutes
      : 0

  const timeCurrent = getLogTime(log)
  const timePrev = !isFirst && prevLog ? getLogTime(prevLog) : null
  const gapMs = timePrev ? Math.max(0, timeCurrent.start - timePrev.end) : 0

  return (
    <div role="listitem">
      {!isFirst && gapMs > 3600000 && (
        <div className="flex items-center gap-2 py-1.5 px-2">
          <div className="flex-1 border-t border-dashed border-border/60" />
          <span className="text-[10px] font-mono tabular-nums text-muted-foreground/60">
            {formatDuration(gapMs)} idle
          </span>
          <div className="flex-1 border-t border-dashed border-border/60" />
        </div>
      )}

      <div
        ref={setRef}
        tabIndex={0}
        role="article"
        aria-label={`${isBreak ? 'Break' : log.goalTitle || log.text || 'Focus session'}: ${
          log.startedAt && log.endedAt
            ? `${formatTime(log.startedAt)} to ${formatTime(log.endedAt)}`
            : formatTime(log.timestamp)
        }${durationText ? `, ${durationText}` : ''}`}
        onMouseEnter={() => onHover(log.id)}
        onMouseLeave={() => onHover(null)}
        onFocus={() => onHover(log.id)}
        onBlur={() => onHover(null)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onSelect(log.id)
          }
        }}
        className={cn(
          'group rounded-xl border border-border/60 bg-card p-3 shadow-apple-subtle apple-card-elevated transition-all duration-150 hover:border-border/90 hover:shadow-apple-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:border-primary',
          isSelected && 'border-accent/60 bg-accent/5 ring-1 ring-accent/30'
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground/80 shrink-0">
              {log.startedAt && log.endedAt
                ? `${formatTime(log.startedAt)} – ${formatTime(log.endedAt)}`
                : formatTime(log.timestamp)}
            </span>
            {durationText && (
              <span
                className="text-[11px] font-medium text-muted-foreground/75 tabular-nums inline-flex items-center gap-1"
                title={
                  idleDeductedMinutes > 0
                    ? `${durationText} active (${formatMinutes(idleDeductedMinutes)} idle deducted)`
                    : undefined
                }
              >
                · {durationText}
                {idleDeductedMinutes > 0 && (
                  <span className="text-[10px] text-muted-foreground/60 font-normal">
                    ({formatMinutes(idleDeductedMinutes)} idle)
                  </span>
                )}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {typeof log.focusQuality === 'number' && log.focusQuality >= 1 && !isBreak && (
              <span
                className={cn(
                  'text-[9.5px] px-1.5 py-0.2 rounded-md font-medium shrink-0 border inline-flex items-center gap-1 select-none',
                  log.focusQuality >= 4
                    ? 'border-apple-green/30 bg-apple-green/10 text-apple-green'
                    : log.focusQuality === 3
                      ? 'border-primary/30 bg-primary/10 text-primary'
                      : 'border-apple-amber/30 bg-apple-amber/10 text-apple-amber'
                )}
                title={`Focus Quality: ${log.focusQuality} / 5`}
              >
                <span aria-hidden="true">
                  {log.focusQuality === 5
                    ? '🚀'
                    : log.focusQuality === 4
                      ? '⚡'
                      : log.focusQuality === 3
                        ? '🎯'
                        : log.focusQuality === 2
                          ? '🌧️'
                          : '🥱'}
                </span>
                <span>{log.focusQuality}/5</span>
              </span>
            )}
            <span
              className={cn(
                'text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 border inline-flex items-center gap-1.5 shadow-2xs',
                config.badge
              )}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', config.dot)} />
              {config.label}
            </span>
          </div>
        </div>

        {isBreak && (
          <div className="mt-1.5 select-text">
            <span className="text-[13.5px] font-semibold text-foreground tracking-[-0.015em] leading-snug">
              Break
            </span>
            {log.note && (
              <p className="mt-0.5 text-[12px] text-muted-foreground/90 leading-relaxed tracking-[-0.005em] line-clamp-2">
                {log.note}
              </p>
            )}
          </div>
        )}

        {isTask && (
          <div className="mt-1.5 select-text">
            <span className="text-[13.5px] font-semibold text-foreground tracking-[-0.015em] leading-snug">
              {log.goalTitle || log.text || 'Task'}
            </span>
            {(log.note || (log.goalTitle && log.text && log.text !== log.goalTitle)) && (
              <p className="mt-0.5 text-[12px] text-muted-foreground/90 leading-relaxed tracking-[-0.005em] line-clamp-2">
                {log.note || log.text}
              </p>
            )}
          </div>
        )}

        {!isBreak && !isTask && (
          <div className="mt-1.5 select-text">
            <p className="text-[13.5px] font-semibold text-foreground tracking-[-0.015em] leading-snug line-clamp-2">
              {(log.note || log.text || 'Other').replace(/^Other:\s*/i, '')}
            </p>
          </div>
        )}
      </div>
    </div>
  )
})
