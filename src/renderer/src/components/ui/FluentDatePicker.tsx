import { useState, useMemo, useRef, useEffect, KeyboardEvent } from 'react'
import { localDateStr } from '../../../../shared/types'
import { cn } from '../../lib/utils'

export interface FluentDatePickerProps {
  value?: string // YYYY-MM-DD
  onSelect: (dateStr: string) => void
  onCancel?: () => void
  className?: string
  hideFooter?: boolean
  tabIndex?: number
  dayCutoffHour?: number
  autoSelectOnArrow?: boolean
  onTabNext?: () => void
  onTabPrev?: () => void
  containerRef?: React.RefObject<HTMLDivElement | null>
}

type ViewMode = 'day' | 'month' | 'year'

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
]

const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec'
]

const WEEKDAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

export function FluentDatePicker({
  value,
  onSelect,
  onCancel,
  className,
  hideFooter = false,
  tabIndex = 0,
  dayCutoffHour = 0,
  autoSelectOnArrow = false,
  onTabNext,
  onTabPrev,
  containerRef
}: FluentDatePickerProps): React.JSX.Element {
  const { effectiveTodayStr, effectiveTodayDate } = useMemo(() => {
    const todayStr = localDateStr(new Date(), dayCutoffHour)
    const [y, m, d] = todayStr.split('-').map(Number)
    return {
      effectiveTodayStr: todayStr,
      effectiveTodayDate: new Date(y, m - 1, d)
    }
  }, [dayCutoffHour])

  // Parse initial selected date or null if no value
  const parsedValueDate = useMemo((): Date | null => {
    if (!value) return null
    const datePart = value.includes('T') ? value.split('T')[0] : value
    if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
      const [y, m, d] = datePart.split('-').map(Number)
      return new Date(y, m - 1, d)
    }
    return null
  }, [value])

  const [selectedDate, setSelectedDate] = useState<Date | null>(parsedValueDate)
  const [focusedDate, setFocusedDate] = useState<Date>(() => parsedValueDate || effectiveTodayDate)
  const [viewYear, setViewYear] = useState<number>(() =>
    (parsedValueDate || effectiveTodayDate).getFullYear()
  )
  const [viewMonth, setViewMonth] = useState<number>(() =>
    (parsedValueDate || effectiveTodayDate).getMonth()
  )
  const [viewMode, setViewMode] = useState<ViewMode>('day')

  const internalRef = useRef<HTMLDivElement>(null)
  const domRef = (containerRef || internalRef) as React.RefObject<HTMLDivElement>

  // Sync state if value prop changes
  useEffect(() => {
    setSelectedDate(parsedValueDate)
    if (parsedValueDate) {
      setFocusedDate(parsedValueDate)
      setViewYear(parsedValueDate.getFullYear())
      setViewMonth(parsedValueDate.getMonth())
    }
  }, [parsedValueDate])

  // Decade calculation for Year view (e.g. 2020 for 2026)
  const decadeStart = Math.floor(viewYear / 10) * 10

  // --- Navigation Handlers ---
  const handlePrev = (): void => {
    if (viewMode === 'day') {
      if (viewMonth === 0) {
        setViewMonth(11)
        setViewYear((y) => y - 1)
      } else {
        setViewMonth((m) => m - 1)
      }
    } else if (viewMode === 'month') {
      setViewYear((y) => y - 1)
    } else if (viewMode === 'year') {
      setViewYear((y) => y - 10)
    }
  }

  const handleNext = (): void => {
    if (viewMode === 'day') {
      if (viewMonth === 11) {
        setViewMonth(0)
        setViewYear((y) => y + 1)
      } else {
        setViewMonth((m) => m + 1)
      }
    } else if (viewMode === 'month') {
      setViewYear((y) => y + 1)
    } else if (viewMode === 'year') {
      setViewYear((y) => y + 10)
    }
  }

  const handleHeaderClick = (): void => {
    if (viewMode === 'day') {
      setViewMode('month')
    } else if (viewMode === 'month') {
      setViewMode('year')
    } else {
      setViewMode('day')
    }
  }

  const handleToday = (): void => {
    setSelectedDate(effectiveTodayDate)
    setFocusedDate(effectiveTodayDate)
    setViewYear(effectiveTodayDate.getFullYear())
    setViewMonth(effectiveTodayDate.getMonth())
    setViewMode('day')
    onSelect(effectiveTodayStr)
  }

  const handleSave = (): void => {
    const target = focusedDate || selectedDate || effectiveTodayDate
    setSelectedDate(target)
    onSelect(localDateStr(target))
  }

  const changeFocusedDay = (offsetDays: number): void => {
    const next = new Date(focusedDate.getTime())
    next.setDate(next.getDate() + offsetDays)
    setFocusedDate(next)
    setViewYear(next.getFullYear())
    setViewMonth(next.getMonth())
    if (autoSelectOnArrow) {
      setSelectedDate(next)
      onSelect(localDateStr(next))
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    // Tab key cycles through: Day -> Month -> Year -> Done (or backwards with Shift)
    if (e.key === 'Tab') {
      e.stopPropagation()
      if (!e.shiftKey) {
        if (viewMode === 'day') {
          e.preventDefault()
          setViewMode('month')
          return
        }
        if (viewMode === 'month') {
          e.preventDefault()
          setViewMode('year')
          return
        }
        if (viewMode === 'year') {
          if (onTabNext) {
            e.preventDefault()
            onTabNext()
            return
          }
          e.preventDefault()
          setViewMode('day')
          return
        }
      } else {
        if (viewMode === 'year') {
          e.preventDefault()
          setViewMode('month')
          return
        }
        if (viewMode === 'month') {
          e.preventDefault()
          setViewMode('day')
          return
        }
        if (viewMode === 'day') {
          if (onTabPrev) {
            e.preventDefault()
            onTabPrev()
            return
          }
        }
      }
    }

    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      if (viewMode === 'year') {
        setViewMode('month')
      } else if (viewMode === 'month') {
        setViewMode('day')
      } else {
        onCancel?.()
      }
      return
    }

    // Keyboard shortcuts to switch views:
    // 'v' or 'V' cycles Day -> Month -> Year -> Day
    // 'm' direct to Month view, 'y' direct to Year view, 'd' direct to Day view
    const keyLower = e.key.toLowerCase()
    if (keyLower === 'v') {
      e.preventDefault()
      e.stopPropagation()
      if (viewMode === 'day') setViewMode('month')
      else if (viewMode === 'month') setViewMode('year')
      else setViewMode('day')
      return
    }
    if (keyLower === 'm') {
      e.preventDefault()
      e.stopPropagation()
      setViewMode('month')
      return
    }
    if (keyLower === 'y') {
      e.preventDefault()
      e.stopPropagation()
      setViewMode('year')
      return
    }
    if (keyLower === 'd') {
      e.preventDefault()
      e.stopPropagation()
      setViewMode('day')
      return
    }

    if (e.key === 'Enter' || e.key === ' ') {
      e.stopPropagation()
      if (viewMode === 'year') {
        e.preventDefault()
        const targetDay = selectedDate ? selectedDate.getDate() : 1
        const d = new Date(viewYear, viewMonth, targetDay)
        setFocusedDate(d)
        setViewMode('month')
        return
      }
      if (viewMode === 'month') {
        e.preventDefault()
        const targetDay = selectedDate ? selectedDate.getDate() : 1
        const d = new Date(viewYear, viewMonth, targetDay)
        setFocusedDate(d)
        if (autoSelectOnArrow) {
          setSelectedDate(d)
          onSelect(localDateStr(d))
        }
        setViewMode('day')
        return
      }
      e.preventDefault()
      handleSave()
      return
    }

    if (viewMode === 'day') {
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        e.stopPropagation()
        changeFocusedDay(-1)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        e.stopPropagation()
        changeFocusedDay(1)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        e.stopPropagation()
        changeFocusedDay(-7)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        e.stopPropagation()
        changeFocusedDay(7)
      } else if (e.key === 'PageUp') {
        e.preventDefault()
        e.stopPropagation()
        handlePrev()
      } else if (e.key === 'PageDown') {
        e.preventDefault()
        e.stopPropagation()
        handleNext()
      } else if (e.key === 'Home') {
        e.preventDefault()
        e.stopPropagation()
        handleToday()
      }
    } else if (viewMode === 'month') {
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        e.stopPropagation()
        setViewMonth((m) => Math.max(0, m - 1))
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        e.stopPropagation()
        setViewMonth((m) => Math.min(11, m + 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        e.stopPropagation()
        setViewMonth((m) => Math.max(0, m - 3))
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        e.stopPropagation()
        setViewMonth((m) => Math.min(11, m + 3))
      }
    } else if (viewMode === 'year') {
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        e.stopPropagation()
        setViewYear((y) => y - 1)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        e.stopPropagation()
        setViewYear((y) => y + 1)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        e.stopPropagation()
        setViewYear((y) => y - 3)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        e.stopPropagation()
        setViewYear((y) => y + 3)
      }
    }
  }

  // --- Calendar Day Cells Generation (6 rows x 7 days = 42 cells) ---
  const dayCells = useMemo(() => {
    const days: { date: Date; isCurrentMonth: boolean }[] = []
    const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay()
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate()
    const daysInCurrentMonth = new Date(viewYear, viewMonth + 1, 0).getDate()

    // Previous month padding
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i
      days.push({
        date: new Date(viewYear, viewMonth - 1, d),
        isCurrentMonth: false
      })
    }

    // Current month days
    for (let d = 1; d <= daysInCurrentMonth; d++) {
      days.push({
        date: new Date(viewYear, viewMonth, d),
        isCurrentMonth: true
      })
    }

    // Next month padding to fill 42 cells
    const remaining = 42 - days.length
    for (let d = 1; d <= remaining; d++) {
      days.push({
        date: new Date(viewYear, viewMonth + 1, d),
        isCurrentMonth: false
      })
    }

    return days
  }, [viewYear, viewMonth])

  // --- Year View Cells (12 years: decadeStart - 1 to decadeStart + 10) ---
  const yearCells = useMemo(() => {
    const years: { year: number; isCurrentDecade: boolean }[] = []
    for (let i = -1; i <= 10; i++) {
      const y = decadeStart + i
      years.push({
        year: y,
        isCurrentDecade: y >= decadeStart && y <= decadeStart + 9
      })
    }
    return years
  }, [decadeStart])

  const isSameDay = (d1: Date, d2: Date | null): boolean => {
    if (!d2) return false
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    )
  }

  const isToday = (d: Date): boolean => isSameDay(d, effectiveTodayDate)

  return (
    <div
      ref={domRef}
      tabIndex={tabIndex}
      role="region"
      aria-label="Date Picker Calendar"
      onKeyDown={handleKeyDown}
      className={cn(
        'w-[264px] select-none rounded-2xl border border-border/80 bg-popover/95 p-3 text-foreground shadow-apple-popover backdrop-blur-md animate-in fade-in zoom-in-95 duration-100 focus:outline-none focus-visible:ring-1.5 focus-visible:ring-apple-blue/50',
        className
      )}
    >
      {/* Header Bar */}
      <div className="flex items-center justify-between pb-2 pt-0.5">
        <button
          type="button"
          tabIndex={-1}
          onClick={handleHeaderClick}
          className="group flex items-center gap-1 rounded-lg px-2 py-1 -ml-1 text-[13.5px] font-semibold tracking-tight text-foreground hover:bg-secondary transition-colors focus:outline-none focus-visible:ring-1.5 focus-visible:ring-apple-blue"
          title="Click to change month or year (or press V)"
        >
          <span>
            {viewMode === 'day' && `${MONTH_NAMES[viewMonth]} ${viewYear}`}
            {viewMode === 'month' && `${viewYear}`}
            {viewMode === 'year' && `${decadeStart} - ${decadeStart + 9}`}
          </span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-muted-foreground group-hover:text-foreground transition-transform"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {/* Prev / Next Month or Year Buttons */}
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            tabIndex={-1}
            onClick={handlePrev}
            aria-label="Previous"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors cursor-pointer focus:outline-none focus-visible:ring-1.5 focus-visible:ring-apple-blue"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button
            type="button"
            tabIndex={-1}
            onClick={handleNext}
            aria-label="Next"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors cursor-pointer focus:outline-none focus-visible:ring-1.5 focus-visible:ring-apple-blue"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      </div>

      {/* --- 1. DAY VIEW --- */}
      {viewMode === 'day' && (
        <div className="space-y-1">
          {/* Weekday labels */}
          <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-muted-foreground/75 pb-1">
            {WEEKDAY_NAMES.map((name) => (
              <div key={name}>{name}</div>
            ))}
          </div>

          {/* 7 x 6 Days grid with roving accessibility (single tabStop) */}
          <div className="grid grid-cols-7 gap-y-1 text-center text-[12.5px]" role="grid">
            {dayCells.map(({ date, isCurrentMonth }, idx) => {
              const isSelected = isSameDay(date, selectedDate)
              const isFocused = isSameDay(date, focusedDate)
              const today = isToday(date)
              return (
                <button
                  key={idx}
                  type="button"
                  tabIndex={-1}
                  role="gridcell"
                  aria-selected={isSelected}
                  aria-label={date.toLocaleDateString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric'
                  })}
                  onClick={() => {
                    setSelectedDate(date)
                    setFocusedDate(date)
                    onSelect(localDateStr(date))
                  }}
                  className={cn(
                    'relative flex h-7 w-7 mx-auto items-center justify-center rounded-full text-[12px] font-medium tabular-nums tracking-[-0.01em] transition-all cursor-pointer',
                    // Selected Day: High contrast solid Apple Blue circle
                    isSelected &&
                      'bg-apple-blue font-bold text-white shadow-2xs scale-105 ring-2 ring-apple-blue/50 z-10',
                    // Focused Day (when navigated via arrow keys but not yet selected)
                    !isSelected && isFocused && 'ring-2 ring-primary ring-offset-1 z-10',
                    // Today (when NOT selected): outline ring only, never solid blue fill
                    !isSelected &&
                      today &&
                      'text-apple-blue font-bold ring-1.5 ring-apple-blue/60 hover:bg-apple-blue/15',
                    // Normal Current Month Day
                    !isSelected && !today && isCurrentMonth && 'text-foreground hover:bg-secondary',
                    // Non-Current Month Day (adjacent month)
                    !isSelected &&
                      !today &&
                      !isCurrentMonth &&
                      'text-muted-foreground/30 hover:text-muted-foreground/70 hover:bg-secondary/40'
                  )}
                >
                  {date.getDate()}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* --- 2. MONTH VIEW --- */}
      {viewMode === 'month' && (
        <div className="grid grid-cols-3 gap-2 py-1 text-center text-[12.5px]">
          {MONTH_SHORT.map((name, idx) => {
            const isSelected =
              selectedDate !== null &&
              selectedDate.getFullYear() === viewYear &&
              selectedDate.getMonth() === idx
            const isViewing = viewMonth === idx
            return (
              <button
                key={name}
                type="button"
                tabIndex={-1}
                onClick={() => {
                  setViewMonth(idx)
                  const targetDay = selectedDate ? selectedDate.getDate() : 1
                  const d = new Date(viewYear, idx, targetDay)
                  setFocusedDate(d)
                  if (autoSelectOnArrow) {
                    setSelectedDate(d)
                    onSelect(localDateStr(d))
                  }
                  setViewMode('day')
                }}
                className={cn(
                  'flex h-9 items-center justify-center rounded-xl font-medium transition-all cursor-pointer',
                  isSelected && 'bg-apple-blue font-semibold text-white shadow-2xs scale-105',
                  !isSelected && isViewing && 'bg-secondary ring-1.5 ring-primary font-semibold text-foreground',
                  !isSelected && !isViewing && 'text-foreground hover:bg-secondary'
                )}
              >
                {name}
              </button>
            )
          })}
        </div>
      )}

      {/* --- 3. YEAR / DECADE VIEW --- */}
      {viewMode === 'year' && (
        <div className="grid grid-cols-3 gap-2 py-1 text-center text-[12.5px]">
          {yearCells.map(({ year, isCurrentDecade }) => {
            const isSelected = selectedDate !== null && selectedDate.getFullYear() === year
            const isViewing = viewYear === year
            return (
              <button
                key={year}
                type="button"
                tabIndex={-1}
                onClick={() => {
                  setViewYear(year)
                  const targetDay = selectedDate ? selectedDate.getDate() : 1
                  const d = new Date(year, viewMonth, targetDay)
                  setFocusedDate(d)
                  setViewMode('month')
                }}
                className={cn(
                  'flex h-9 items-center justify-center rounded-xl font-medium transition-all cursor-pointer',
                  isSelected && 'bg-apple-blue font-semibold text-white shadow-2xs scale-105',
                  !isSelected && isViewing && 'bg-secondary ring-1.5 ring-primary font-semibold text-foreground',
                  !isSelected && !isViewing && isCurrentDecade && 'text-foreground hover:bg-secondary',
                  !isSelected &&
                    !isViewing &&
                    !isCurrentDecade &&
                    'text-muted-foreground/35 hover:text-muted-foreground/75 hover:bg-secondary/40'
                )}
              >
                {year}
              </button>
            )
          })}
        </div>
      )}

      {/* --- Bottom Actions: Today shortcut on left, Cancel & Save on right --- */}
      {!hideFooter && (
        <div className="mt-3 flex items-center justify-between pt-2.5 border-t border-border/50">
          <button
            type="button"
            onClick={handleToday}
            className="text-[12px] font-medium text-apple-blue hover:text-apple-blue/80 hover:underline transition-colors"
          >
            Today
          </button>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onCancel}
              className="h-7 px-2.5 rounded-lg text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="h-7 px-3 rounded-lg bg-apple-blue hover:bg-apple-blue/90 text-[12px] font-semibold text-white shadow-2xs active:scale-95 transition-all"
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
