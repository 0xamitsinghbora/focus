import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { parseLocalDate, shiftDate, localDateStr, HeatmapData } from '../../../shared/types'
import { cn } from '../lib/utils'

interface HeatmapProps {
  data: HeatmapData
  selectedDate?: string
  onDayClick?: (date: string) => void
  dayCutoffHour?: number
  todayDate?: string
}

interface FlatDay {
  date: string
  count: number
  sessions?: number
  completedGoals?: number
  month: number
}

interface MonthLabel {
  month: string
  colIndex: number
}

interface TooltipData {
  date: string
  count: number
  sessions?: number
  completedGoals?: number
  x: number
  y: number
}

const getColor = (count: number): string => {
  if (count === 0) return 'bg-secondary/70 border-border/40 hover:border-border'
  if (count < 3) return 'bg-apple-green/25 border-apple-green/30 hover:border-apple-green/60'
  if (count < 6) return 'bg-apple-green/50 border-apple-green/60 hover:border-apple-green/80'
  if (count < 10) return 'bg-apple-green/75 border-apple-green/80 hover:border-apple-green'
  return 'bg-apple-green border-apple-green shadow-sm'
}

const getTooltipStyle = (hovered: TooltipData): React.CSSProperties => {
  const padding = 12
  const tooltipHeight = 36

  const style: React.CSSProperties = {}

  let top = hovered.y - tooltipHeight - 16
  if (top < padding) {
    top = hovered.y + 24
  }
  style.top = top

  if (hovered.x > window.innerWidth / 2) {
    style.right = window.innerWidth - hovered.x + 10
  } else {
    style.left = hovered.x + 10
  }

  return style
}

const WEEKDAY_LABELS = (
  <div
    className="grid grid-rows-7 text-[10.5px] font-semibold tracking-[-0.01em] text-muted-foreground/70 text-right pr-1 pt-6"
    style={{ gap: '5px' }}
  >
    <div style={{ visibility: 'hidden', height: '16px' }}>Sun</div>
    <div style={{ height: '16px', lineHeight: '16px' }}>Mon</div>
    <div style={{ visibility: 'hidden', height: '16px' }}>Tue</div>
    <div style={{ height: '16px', lineHeight: '16px' }}>Wed</div>
    <div style={{ visibility: 'hidden', height: '16px' }}>Thu</div>
    <div style={{ height: '16px', lineHeight: '16px' }}>Fri</div>
    <div style={{ visibility: 'hidden', height: '16px' }}>Sat</div>
  </div>
)

const HEATMAP_LEGEND = (
  <div className="flex items-center justify-end gap-2 mt-2.5 pr-2 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/80">
    <span>Less</span>
    <div className="w-3.5 h-3.5 rounded-[3.5px] border bg-secondary/70 border-border/40" />
    <div className="w-3.5 h-3.5 rounded-[3.5px] border bg-apple-green/25 border-apple-green/30" />
    <div className="w-3.5 h-3.5 rounded-[3.5px] border bg-apple-green/50 border-apple-green/60" />
    <div className="w-3.5 h-3.5 rounded-[3.5px] border bg-apple-green/75 border-apple-green/80" />
    <div className="w-3.5 h-3.5 rounded-[3.5px] border bg-apple-green border-apple-green shadow-xs" />
    <span>More</span>
  </div>
)

const MonthLabels = React.memo(function MonthLabels({
  labels,
  colWidth
}: {
  labels: MonthLabel[]
  colWidth: number
}) {
  return (
    <div className="absolute top-0 left-0 right-0 h-5.5 text-[11px] font-semibold text-muted-foreground pointer-events-none">
      {labels.map((ml, i) => (
        <div key={i} className="absolute top-0" style={{ left: `${ml.colIndex * colWidth}px` }}>
          {ml.month}
        </div>
      ))}
    </div>
  )
})

interface HeatmapDaysGridProps {
  flatDays: FlatDay[]
  selectedDate?: string
  onDayClick?: (date: string) => void
  onCellEnter: (e: React.MouseEvent<HTMLDivElement>, day: FlatDay) => void
  onCellLeave: () => void
  onCellFocus: (e: React.FocusEvent<HTMLDivElement>, day: FlatDay) => void
  onCellBlur: () => void
}

const formatAriaLabel = (day: FlatDay): string => {
  const activityWord = day.count === 1 ? 'activity' : 'activities'
  if (day.sessions !== undefined && day.completedGoals !== undefined && day.count > 0) {
    const sWord = day.sessions === 1 ? 'session' : 'sessions'
    const gWord = day.completedGoals === 1 ? 'task' : 'tasks'
    return `${day.date}: ${day.count} ${activityWord} (${day.sessions} ${sWord}, ${day.completedGoals} ${gWord})`
  }
  return `${day.date}: ${day.count} ${activityWord}`
}

const HeatmapDaysGrid = React.memo(function HeatmapDaysGrid({
  flatDays,
  selectedDate,
  onDayClick,
  onCellEnter,
  onCellLeave,
  onCellFocus,
  onCellBlur
}: HeatmapDaysGridProps) {
  const [activeDate, setActiveDate] = React.useState<string | null>(null)
  const cellRefs = React.useRef<(HTMLDivElement | null)[]>([])

  const targetDate =
    activeDate ||
    (selectedDate && flatDays.some((d) => d.date === selectedDate) ? selectedDate : null) ||
    (flatDays.length > 0 ? flatDays[flatDays.length - 1].date : null)

  return (
    <div className="grid grid-rows-7 grid-flow-col" style={{ gap: '5px' }}>
      {flatDays.map((day, idx) => {
        const isSelected = selectedDate === day.date
        const isTabTarget = day.date === targetDate
        return (
          <div
            key={day.date}
            ref={(el) => {
              cellRefs.current[idx] = el
            }}
            tabIndex={isTabTarget ? 0 : -1}
            role="button"
            aria-pressed={isSelected}
            aria-label={formatAriaLabel(day)}
            onClick={() => {
              setActiveDate(day.date)
              onDayClick?.(day.date)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setActiveDate(day.date)
                onDayClick?.(day.date)
              } else if (
                e.key === 'ArrowUp' ||
                e.key === 'ArrowDown' ||
                e.key === 'ArrowLeft' ||
                e.key === 'ArrowRight'
              ) {
                e.preventDefault()
                let nextIdx = idx
                if (e.key === 'ArrowUp') nextIdx = Math.max(0, idx - 1)
                else if (e.key === 'ArrowDown') nextIdx = Math.min(flatDays.length - 1, idx + 1)
                else if (e.key === 'ArrowLeft') nextIdx = Math.max(0, idx - 7)
                else if (e.key === 'ArrowRight') nextIdx = Math.min(flatDays.length - 1, idx + 7)
                if (nextIdx !== idx) {
                  const targetDay = flatDays[nextIdx]
                  if (targetDay) {
                    setActiveDate(targetDay.date)
                  }
                  cellRefs.current[nextIdx]?.focus()
                }
              }
            }}
            onMouseEnter={(e) => onCellEnter(e, day)}
            onMouseLeave={onCellLeave}
            onFocus={(e) => {
              setActiveDate(day.date)
              onCellFocus(e, day)
            }}
            onBlur={onCellBlur}
            className={cn(
              'w-4 h-4 rounded-[3.5px] border transition-colors duration-150 relative cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:z-20',
              getColor(day.count),
              isSelected
                ? 'ring-2 ring-foreground border-transparent z-10 shadow-xs'
                : 'hover:border-foreground/60 hover:brightness-125'
            )}
          />
        )
      })}
    </div>
  )
})

const HeatmapTooltip = React.memo(function HeatmapTooltip({ hovered }: { hovered: TooltipData }) {
  const activityWord = hovered.count === 1 ? 'focus activity' : 'focus activities'
  return createPortal(
    <div
      className="fixed apple-glass text-foreground text-[11px] px-3 py-1.5 rounded-xl shadow-apple-popover pointer-events-none z-9999 flex items-center gap-2 border border-border/80"
      style={getTooltipStyle(hovered)}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-apple-green shrink-0" />
      <span className="whitespace-nowrap tabular-nums font-medium">
        <strong className="font-semibold text-foreground">
          {hovered.count} {activityWord}
        </strong>
        {hovered.sessions !== undefined &&
          hovered.completedGoals !== undefined &&
          hovered.count > 0 && (
            <span className="text-muted-foreground ml-1">
              ({hovered.sessions} {hovered.sessions === 1 ? 'session' : 'sessions'},{' '}
              {hovered.completedGoals} {hovered.completedGoals === 1 ? 'task' : 'tasks'})
            </span>
          )}
      </span>
    </div>,
    document.body
  )
})

export const Heatmap = React.memo(function Heatmap({
  data,
  selectedDate,
  onDayClick,
  dayCutoffHour,
  todayDate
}: HeatmapProps): React.JSX.Element {
  // Generate last 365 days anchored at 12:00 noon to avoid DST day-slip
  const { flatDays, monthLabels } = useMemo(() => {
    const effectiveToday = todayDate ?? localDateStr(new Date(), dayCutoffHour ?? 0)
    const todayNoon = parseLocalDate(effectiveToday)

    // go back 364 days anchored at noon
    const startDateStr = shiftDate(effectiveToday, -364)
    const startDateObj = parseLocalDate(startDateStr)

    // adjust to nearest Sunday before startDate
    while (startDateObj.getDay() !== 0) {
      startDateObj.setDate(startDateObj.getDate() - 1)
    }

    const flatDays: FlatDay[] = []
    const monthLabels: MonthLabel[] = []
    let lastMonth = -1

    const currentDate = new Date(startDateObj.getTime())
    let dayIndex = 0

    while (currentDate.getTime() <= todayNoon.getTime() + 60 * 60 * 1000) {
      const dateStr = localDateStr(currentDate)
      if (dateStr > effectiveToday) break

      const month = currentDate.getMonth()
      if (month !== lastMonth) {
        const colIndex = Math.floor(dayIndex / 7)
        if (lastMonth === -1) {
          if (currentDate.getDate() <= 14) {
            monthLabels.push({
              month: currentDate.toLocaleString('default', { month: 'short' }),
              colIndex
            })
          }
        } else {
          const lastLabel = monthLabels[monthLabels.length - 1]
          if (!lastLabel || colIndex - lastLabel.colIndex >= 2) {
            monthLabels.push({
              month: currentDate.toLocaleString('default', { month: 'short' }),
              colIndex
            })
          }
        }
        lastMonth = month
      }

      const entry = data[dateStr]
      let count = 0
      let sessions: number | undefined
      let completedGoals: number | undefined
      if (typeof entry === 'number') {
        count = entry
      } else if (entry && typeof entry === 'object') {
        count = entry.total ?? 0
        sessions = entry.sessions
        completedGoals = entry.completedGoals
      }

      flatDays.push({
        date: dateStr,
        count,
        sessions,
        completedGoals,
        month
      })

      currentDate.setDate(currentDate.getDate() + 1)
      dayIndex++
    }

    return { flatDays, monthLabels }
  }, [data, dayCutoffHour, todayDate])

  const [hovered, setHovered] = useState<TooltipData | null>(null)
  const rafIdRef = useRef<number | null>(null)
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nextHoverRef = useRef<TooltipData | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const hasAutoScrolledRef = useRef(false)

  // Clean up timers & animation frames on unmount
  useEffect(() => {
    return () => {
      if (leaveTimerRef.current !== null) {
        clearTimeout(leaveTimerRef.current)
      }
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
      }
    }
  }, [])

  // Auto-scroll to end once on initial mount/data load
  useEffect(() => {
    if (!hasAutoScrolledRef.current && scrollRef.current && flatDays.length > 0) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth
      hasAutoScrolledRef.current = true
    }
  }, [flatDays])

  const clearHover = useCallback(() => {
    if (leaveTimerRef.current !== null) {
      clearTimeout(leaveTimerRef.current)
      leaveTimerRef.current = null
    }
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = null
    }
    nextHoverRef.current = null
    setHovered(null)
  }, [])

  // Handle cell enter: throttles rapid scrubbing across 365 cells using requestAnimationFrame
  const handleCellEnter = useCallback((e: React.MouseEvent<HTMLDivElement>, day: FlatDay) => {
    if (leaveTimerRef.current !== null) {
      clearTimeout(leaveTimerRef.current)
      leaveTimerRef.current = null
    }

    const rect = e.currentTarget.getBoundingClientRect()
    const x = rect.width > 0 || rect.height > 0 ? rect.left + rect.width / 2 : e.clientX || 0
    const y = rect.width > 0 || rect.height > 0 ? rect.top : e.clientY || 0

    const target: TooltipData = {
      date: day.date,
      count: day.count,
      x,
      y
    }

    nextHoverRef.current = target

    // If nothing is currently hovered, display immediately for snappy feel
    setHovered((current) => {
      if (!current) {
        return target
      }
      // If transitioning between cells, coalesce updates via requestAnimationFrame
      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(() => {
          rafIdRef.current = null
          if (nextHoverRef.current) {
            setHovered(nextHoverRef.current)
          }
        })
      }
      return current
    })
  }, [])

  // Short grace period on leave so scrubbing across gaps between cells does not flicker
  const handleCellLeave = useCallback(() => {
    if (leaveTimerRef.current !== null) {
      clearTimeout(leaveTimerRef.current)
    }
    leaveTimerRef.current = setTimeout(() => {
      clearHover()
    }, 50)
  }, [clearHover])

  const handleCellFocus = useCallback((e: React.FocusEvent<HTMLDivElement>, day: FlatDay) => {
    if (leaveTimerRef.current !== null) {
      clearTimeout(leaveTimerRef.current)
      leaveTimerRef.current = null
    }
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = null
    }
    const rect = e.currentTarget.getBoundingClientRect()
    const x = rect.width > 0 || rect.height > 0 ? rect.left + rect.width / 2 : 0
    const y = rect.width > 0 || rect.height > 0 ? rect.top : 0
    const target: TooltipData = { ...day, x, y }
    nextHoverRef.current = target
    setHovered(target)
  }, [])

  const handleCellBlur = useCallback(() => {
    clearHover()
  }, [clearHover])

  const handleContainerLeave = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.currentTarget.contains(e.relatedTarget as Node)) {
        return
      }
      clearHover()
    },
    [clearHover]
  )

  const colWidth = 21

  return (
    <div
      ref={scrollRef}
      onScroll={clearHover}
      onMouseLeave={handleContainerLeave}
      className="w-full overflow-x-auto no-scrollbar pb-2 pt-1 relative"
    >
      <div className="min-w-max mx-auto flex gap-3 relative py-1" style={{ width: 'fit-content' }}>
        {WEEKDAY_LABELS}

        <div className="relative pt-6">
          <MonthLabels labels={monthLabels} colWidth={colWidth} />

          <HeatmapDaysGrid
            flatDays={flatDays}
            selectedDate={selectedDate}
            onDayClick={onDayClick}
            onCellEnter={handleCellEnter}
            onCellLeave={handleCellLeave}
            onCellFocus={handleCellFocus}
            onCellBlur={handleCellBlur}
          />
        </div>
      </div>

      {HEATMAP_LEGEND}

      {hovered && <HeatmapTooltip hovered={hovered} />}
    </div>
  )
})
