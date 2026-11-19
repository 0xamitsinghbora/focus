import React, { useState, useMemo } from 'react'
import { LogEntry, DailyGoal } from '../../../shared/types'
import { formatTime, formatDurationMs, formatMinutes, cn } from '../lib/utils'
import { getLogThemeConfig } from '../lib/timelineTheme'
import { autoClipSequentialLogs } from '../lib/timelineUtils'

const formatDuration = formatDurationMs

export interface TimelineBarProps {
  logs: LogEntry[]
  goals?: DailyGoal[]
  activeLogId: string | null
  onHoverLog: (id: string | null) => void
  onSelectLog: (id: string) => void
}

interface ParsedSegment {
  log: LogEntry
  startMs: number
  endMs: number
  left: number
  width: number
  touchesPrev: boolean
  touchesNext: boolean
  lane: number
  totalLanes: number
}

export function TimelineBar({
  logs,
  goals,
  activeLogId,
  onHoverLog,
  onSelectLog
}: TimelineBarProps): React.JSX.Element | null {
  const [hoveredSegment, setHoveredSegment] = useState<ParsedSegment | null>(null)

  const parsedLogs = useMemo(() => {
    const sequential = autoClipSequentialLogs(logs)
    return sequential
      .map((log) => {
        const startMs = log.startedAt
          ? new Date(log.startedAt).getTime()
          : log.durationMinutes
            ? new Date(log.timestamp).getTime() - log.durationMinutes * 60000
            : new Date(log.timestamp).getTime()
        const endMs = log.endedAt
          ? new Date(log.endedAt).getTime()
          : new Date(log.timestamp).getTime()
        return {
          log,
          startMs,
          endMs: Math.max(endMs, startMs + 1000)
        }
      })
      .filter((item) => !isNaN(item.startMs) && !isNaN(item.endMs) && item.endMs > item.startMs)
      .sort((a, b) => a.startMs - b.startMs)
  }, [logs])

  const { timelineStartMs, timelineEndMs, hourMarks } = useMemo(() => {
    if (parsedLogs.length === 0) {
      return { timelineStartMs: 0, timelineEndMs: 0, hourMarks: [] }
    }

    const minMs = parsedLogs[0].startMs
    const maxMs = parsedLogs.reduce(
      (max, p) => (p.endMs > max ? p.endMs : max),
      parsedLogs[0].endMs
    )

    // Exactly span from start of the session to end of the session
    const startMs = minMs
    const endMs = Math.max(maxMs, minMs + 60000)
    const totalSpan = endMs - startMs

    const marks: { hour?: number; label: string; pos: number }[] = []

    const formatMs = (ms: number): string => formatTime(new Date(ms).toISOString())

    // 1. Start boundary mark (0%)
    marks.push({
      label: formatMs(startMs),
      pos: 0
    })

    // 2. Intermediate ticks depending on the session duration
    if (totalSpan <= 15 * 60000) {
      // Short session (<= 15m): Only start and end boundary
    } else if (totalSpan <= 60 * 60000) {
      // 15m - 60m: every 15 minutes if spaced out
      const stepMs = totalSpan > 35 * 60000 ? 15 * 60000 : 10 * 60000
      let t = Math.ceil(startMs / stepMs) * stepMs
      while (t < endMs) {
        const pos = ((t - startMs) / totalSpan) * 100
        if (pos > 18 && pos < 82) {
          marks.push({ label: formatMs(t), pos })
        }
        t += stepMs
      }
    } else if (totalSpan <= 4 * 3600000) {
      // 1h - 4h: on each whole clock hour
      const nextHour = new Date(startMs)
      nextHour.setMinutes(0, 0, 0)
      if (nextHour.getTime() <= startMs) {
        nextHour.setHours(nextHour.getHours() + 1)
      }
      let t = nextHour.getTime()
      while (t < endMs) {
        const pos = ((t - startMs) / totalSpan) * 100
        if (pos > 15 && pos < 85) {
          const d = new Date(t)
          const h = d.getHours()
          const h12 = h % 12 === 0 ? 12 : h % 12
          const ampm = h < 12 ? 'AM' : 'PM'
          marks.push({ label: `${h12} ${ampm}`, pos })
        }
        t += 3600000
      }
    } else {
      // > 4h: on every 2 or 4 clock hours
      const stepHours = totalSpan > 12 * 3600000 ? 4 : 2
      const nextHour = new Date(startMs)
      nextHour.setMinutes(0, 0, 0)
      if (nextHour.getTime() <= startMs) {
        nextHour.setHours(nextHour.getHours() + 1)
      }
      let t = nextHour.getTime()
      while (t < endMs) {
        const d = new Date(t)
        if (d.getHours() % stepHours === 0) {
          const pos = ((t - startMs) / totalSpan) * 100
          if (pos > 12 && pos < 88) {
            const h = d.getHours()
            const h12 = h % 12 === 0 ? 12 : h % 12
            const ampm = h < 12 ? 'AM' : 'PM'
            marks.push({ label: `${h12} ${ampm}`, pos })
          }
        }
        t += 3600000
      }
    }

    // 3. End boundary mark (100%)
    marks.push({
      label: formatMs(endMs),
      pos: 100
    })

    return { timelineStartMs: startMs, timelineEndMs: endMs, hourMarks: marks }
  }, [parsedLogs])

  const totalTimelineSpan = timelineEndMs - timelineStartMs

  const segments: ParsedSegment[] = useMemo(() => {
    if (totalTimelineSpan <= 0) return []

    // 1. Group into connected components (clusters) of overlapping intervals
    const clusters: (typeof parsedLogs)[] = []
    let currentCluster: typeof parsedLogs = []
    let clusterMaxEnd = -1

    for (let i = 0; i < parsedLogs.length; i++) {
      const item = parsedLogs[i]
      if (currentCluster.length === 0) {
        currentCluster.push(item)
        clusterMaxEnd = item.endMs
      } else if (item.startMs < clusterMaxEnd) {
        currentCluster.push(item)
        clusterMaxEnd = Math.max(clusterMaxEnd, item.endMs)
      } else {
        clusters.push(currentCluster)
        currentCluster = [item]
        clusterMaxEnd = item.endMs
      }
    }
    if (currentCluster.length > 0) {
      clusters.push(currentCluster)
    }

    const result: ParsedSegment[] = []
    const itemIndexMap = new Map<(typeof parsedLogs)[0], number>()
    for (let i = 0; i < parsedLogs.length; i++) {
      itemIndexMap.set(parsedLogs[i], i)
    }

    // 2. Assign consistent lanes and heights across each connected component
    for (const cluster of clusters) {
      const laneEnds: number[] = []
      const clusterSegments: {
        item: (typeof parsedLogs)[0]
        lane: number
        touchesPrev: boolean
        touchesNext: boolean
        left: number
        width: number
      }[] = []

      for (let i = 0; i < cluster.length; i++) {
        const item = cluster[i]
        const globalIdx = itemIndexMap.get(item) ?? -1
        const prev = globalIdx > 0 ? parsedLogs[globalIdx - 1] : undefined
        const next =
          globalIdx >= 0 && globalIdx < parsedLogs.length - 1
            ? parsedLogs[globalIdx + 1]
            : undefined

        const touchesPrev = Boolean(prev && Math.abs(item.startMs - prev.endMs) <= 90000)
        const touchesNext = Boolean(next && Math.abs(next.startMs - item.endMs) <= 90000)

        const left = ((item.startMs - timelineStartMs) / totalTimelineSpan) * 100
        const rawWidth = ((item.endMs - item.startMs) / totalTimelineSpan) * 100
        const width = touchesNext ? rawWidth : Math.max(rawWidth, 0.6)

        let assignedLane = -1
        for (let l = 0; l < laneEnds.length; l++) {
          if (laneEnds[l] <= item.startMs) {
            assignedLane = l
            laneEnds[l] = item.endMs
            break
          }
        }
        if (assignedLane === -1) {
          assignedLane = laneEnds.length
          laneEnds.push(item.endMs)
        }

        clusterSegments.push({
          item,
          lane: assignedLane,
          touchesPrev,
          touchesNext,
          left,
          width
        })
      }

      const totalLanes = Math.max(1, laneEnds.length)

      for (const seg of clusterSegments) {
        result.push({
          ...seg.item,
          touchesPrev: seg.touchesPrev,
          touchesNext: seg.touchesNext,
          left: seg.left,
          width: seg.width,
          lane: totalLanes === 1 ? 0 : seg.lane,
          totalLanes
        })
      }
    }

    return result
  }, [parsedLogs, timelineStartMs, totalTimelineSpan])

  const totalLoggedMinutes = useMemo(() => {
    return logs.reduce((sum, log) => {
      const mins =
        typeof log.durationMinutes === 'number'
          ? log.durationMinutes
          : Math.max(
              1,
              Math.round(
                ((log.endedAt
                  ? new Date(log.endedAt).getTime()
                  : new Date(log.timestamp).getTime()) -
                  (log.startedAt
                    ? new Date(log.startedAt).getTime()
                    : new Date(log.timestamp).getTime())) /
                  60000
              )
            )
      return sum + mins
    }, 0)
  }, [logs])

  const productiveMinutes = useMemo(() => {
    return logs.reduce((sum, log) => {
      if (log.productivity === 'break') return sum
      const mins =
        typeof log.productiveMinutes === 'number'
          ? log.productiveMinutes
          : log.productivity === 'productive' || !log.productivity
            ? log.durationMinutes || 0
            : 0
      return sum + mins
    }, 0)
  }, [logs])

  if (segments.length === 0) return null

  const earliestStart = parsedLogs[0].startMs
  const latestEnd = parsedLogs.reduce(
    (max, p) => (p.endMs > max ? p.endMs : max),
    parsedLogs[0].endMs
  )

  return (
    <div className="relative px-4 pt-3 pb-2.5 border-b border-border/50 bg-surface/20 shrink-0">
      {/* Timeline Header Info & Legend */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2 text-[11px]">
        <div className="flex items-center gap-1.5 font-medium">
          <span className="text-[11px] font-medium text-muted-foreground">Session</span>
          <span className="font-mono text-foreground font-semibold">
            {formatTime(new Date(earliestStart).toISOString())} –{' '}
            {formatTime(new Date(latestEnd).toISOString())}
          </span>
        </div>
        <div className="flex items-center gap-2.5 text-[10.5px]">
          <div className="flex items-center gap-1 text-muted-foreground font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-apple-green" /> Tasks
          </div>
          <div className="flex items-center gap-1 text-muted-foreground font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-apple-red" /> Break
          </div>
          <div className="flex items-center gap-1 text-muted-foreground font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-apple-amber" /> Other
          </div>
          <div className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground pl-1 border-l border-border/60">
            <span className="tabular-nums font-semibold text-foreground">
              {formatMinutes(totalLoggedMinutes)}
            </span>
            <span>logged</span>
            {productiveMinutes > 0 && (
              <>
                <span className="text-border">·</span>
                <span className="text-apple-green font-medium tabular-nums">
                  {formatMinutes(productiveMinutes)}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Floating Hover Tooltip */}
      {hoveredSegment && (
        <div
          className="absolute bottom-full mb-1.5 z-40 pointer-events-none transition-all duration-75"
          style={{
            left: `${Math.min(Math.max(hoveredSegment.left + hoveredSegment.width / 2, 10), 90)}%`,
            transform: 'translateX(-50%)'
          }}
        >
          <div className="bg-popover/95 backdrop-blur-md border border-border px-2.5 py-1.5 rounded-lg shadow-apple-card text-left text-foreground whitespace-nowrap min-w-[150px]">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[11px] font-semibold tabular-nums text-foreground">
                {hoveredSegment.log.startedAt && hoveredSegment.log.endedAt
                  ? `${formatTime(hoveredSegment.log.startedAt)} – ${formatTime(hoveredSegment.log.endedAt)}`
                  : formatTime(hoveredSegment.log.timestamp)}
              </span>
              <span
                className={cn(
                  'text-[9.5px] px-1.5 py-0.5 rounded-full font-medium border inline-flex items-center gap-1',
                  getLogThemeConfig(hoveredSegment.log, goals).badge
                )}
              >
                <span
                  className={cn(
                    'h-1 w-1 rounded-full',
                    getLogThemeConfig(hoveredSegment.log, goals).dot
                  )}
                />
                {getLogThemeConfig(hoveredSegment.log, goals).label}
              </span>
            </div>
            <div className="mt-0.5 text-[10.5px] text-muted-foreground font-mono">
              {formatDuration(hoveredSegment.endMs - hoveredSegment.startMs)}
            </div>
            {(() => {
              const segLog = hoveredSegment.log
              const isSegBreak =
                segLog.productivity === 'break' || segLog.text?.toLowerCase().includes('break')
              const isSegTask = Boolean(segLog.goalId || segLog.goalTitle)

              if (isSegBreak) {
                return (
                  <p className="mt-1 text-[11.5px] font-medium text-foreground max-w-[240px] truncate leading-tight">
                    Break{segLog.note ? ` · ${segLog.note}` : ''}
                  </p>
                )
              }
              if (isSegTask) {
                const title = segLog.goalTitle || segLog.text || 'Task'
                const note =
                  segLog.note ||
                  (segLog.goalTitle && segLog.text && segLog.text !== segLog.goalTitle
                    ? segLog.text
                    : null)
                return (
                  <div className="mt-1 max-w-[240px]">
                    <p className="text-[11.5px] font-medium text-foreground truncate leading-tight">
                      {title}
                    </p>
                    {note && (
                      <p className="text-[10.5px] text-muted-foreground truncate leading-tight mt-0.5">
                        {note}
                      </p>
                    )}
                  </div>
                )
              }
              return (
                <p className="mt-1 text-[11.5px] text-foreground max-w-[240px] truncate leading-tight">
                  {(segLog.note || segLog.text || 'Other').replace(/^Other:\s*/i, '')}
                </p>
              )
            })()}
          </div>
        </div>
      )}

      {/* Timeline Track */}
      <div
        className={cn(
          'relative rounded-lg bg-secondary/50 border border-border/60 overflow-hidden shadow-2xs transition-all duration-150',
          segments.some((s) => s.totalLanes >= 3)
            ? 'h-9'
            : segments.some((s) => s.totalLanes === 2)
              ? 'h-7'
              : 'h-7'
        )}
      >
        {/* Hour vertical gridlines */}
        {hourMarks
          .filter((mark) => mark.pos > 2 && mark.pos < 98)
          .map((mark, i) => (
            <div
              key={i}
              className="absolute top-0 bottom-0 w-px bg-border/40 pointer-events-none z-0"
              style={{ left: `${mark.pos}%` }}
            />
          ))}

        {/* Activity Sessions */}
        {segments.map((seg) => {
          const config = getLogThemeConfig(seg.log, goals)
          const isSelected = activeLogId === seg.log.id

          // Elimination of pinched dumbbells:
          // Touching edges become square, outer edges stay rounded
          const roundedClass = cn(
            seg.touchesPrev ? 'rounded-l-none' : 'rounded-l-[5px]',
            seg.touchesNext ? 'rounded-r-none' : 'rounded-r-[5px]'
          )

          // Crisp 1px hairline separation line between touching segments
          const borderDivider = seg.touchesNext ? 'border-r border-background/70' : ''

          const isMultiLane = seg.totalLanes > 1
          const laneHeightPercent = 100 / seg.totalLanes
          const topPercent = seg.lane * laneHeightPercent

          return (
            <div
              key={seg.log.id}
              onClick={() => onSelectLog(seg.log.id)}
              onMouseEnter={() => {
                setHoveredSegment(seg)
                onHoverLog(seg.log.id)
              }}
              onMouseLeave={() => {
                setHoveredSegment(null)
                onHoverLog(null)
              }}
              className={cn(
                `absolute cursor-pointer transition-all duration-100 ${config.bar}`,
                roundedClass,
                borderDivider,
                isSelected
                  ? 'ring-2 ring-foreground/90 brightness-125 z-20 scale-y-105'
                  : 'opacity-90 hover:opacity-100 hover:brightness-110 hover:z-10'
              )}
              style={{
                left: `${seg.left}%`,
                width: `${seg.width}%`,
                minWidth: seg.touchesNext ? undefined : '4px',
                ...(isMultiLane
                  ? {
                      top: `calc(${topPercent}% + 1px)`,
                      height: `calc(${laneHeightPercent}% - 2px)`
                    }
                  : {
                      top: '4px',
                      bottom: '4px'
                    })
              }}
              title={`${formatTime(seg.log.startedAt)} – ${formatTime(seg.log.endedAt)}: ${seg.log.note || seg.log.text}`}
            />
          )
        })}
      </div>

      {/* Hour Marks Labels Below Track */}
      <div className="relative mt-1 h-3.5">
        {hourMarks.map((mark, i) => {
          let alignStyle = '-translate-x-1/2'
          if (mark.pos <= 3) alignStyle = 'translate-x-0'
          else if (mark.pos >= 97) alignStyle = '-translate-x-full'

          return (
            <span
              key={i}
              className={`absolute text-[10px] font-mono tabular-nums text-muted-foreground/75 select-none ${alignStyle}`}
              style={{ left: `${mark.pos}%` }}
            >
              {mark.label}
            </span>
          )
        })}
      </div>
    </div>
  )
}
