import { useMemo, useRef, useEffect, KeyboardEvent, WheelEvent } from 'react'
import { localDateStr, parseLocalDate, shiftDate } from '../../../../shared/types'
import { cn } from '../../lib/utils'
import { FluentDatePicker } from './FluentDatePicker'

export interface DueDateTimePickerProps {
  dueDate: string | null
  dueTime: string | null
  onDateChange: (date: string | null) => void
  onTimeChange: (time: string | null) => void
  onClearAll?: () => void
  onClose?: (returnFocusTo?: 'trigger' | 'note') => void
  className?: string
  dayCutoffHour?: number
}

export function DueDateTimePicker({
  dueDate,
  dueTime,
  onDateChange,
  onTimeChange,
  onClearAll,
  onClose,
  className,
  dayCutoffHour = 0
}: DueDateTimePickerProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const hourRef = useRef<HTMLDivElement>(null)
  const minuteRef = useRef<HTMLDivElement>(null)
  const periodRef = useRef<HTMLButtonElement>(null)
  const calendarRef = useRef<HTMLDivElement>(null)
  const doneButtonRef = useRef<HTMLButtonElement>(null)

  // Typing buffers for hours and minutes
  const hourTypingRef = useRef<{ buffer: string; timer: ReturnType<typeof setTimeout> | null }>({
    buffer: '',
    timer: null
  })
  const minuteTypingRef = useRef<{ buffer: string; timer: ReturnType<typeof setTimeout> | null }>({
    buffer: '',
    timer: null
  })

  // Auto-focus Hour control on mount so the user can immediately set hours with ↑/↓ or typing
  useEffect(() => {
    const timer = setTimeout(() => {
      hourRef.current?.focus()
    }, 20)
    return () => clearTimeout(timer)
  }, [])

  const todayStr = useMemo(() => localDateStr(new Date(), dayCutoffHour), [dayCutoffHour])

  // Shortcuts: Today, Tomorrow, Next Week
  const presets = useMemo(() => {
    const now = new Date()
    const tStr = localDateStr(now, dayCutoffHour)
    const todayDate = parseLocalDate(tStr)
    const todayDay = todayDate.toLocaleDateString(undefined, { weekday: 'short' })

    const tomorrowStr = shiftDate(tStr, 1)
    const tomorrowDate = parseLocalDate(tomorrowStr)
    const tomorrowDay = tomorrowDate.toLocaleDateString(undefined, { weekday: 'short' })

    const nextWeekStr = shiftDate(tStr, 7)
    const nextWeekDate = parseLocalDate(nextWeekStr)
    const nextWeekDay = nextWeekDate.toLocaleDateString(undefined, { weekday: 'short' })

    return {
      today: { date: tStr, day: todayDay },
      tomorrow: { date: tomorrowStr, day: tomorrowDay },
      nextWeek: { date: nextWeekStr, day: nextWeekDay }
    }
  }, [dayCutoffHour])

  const handlePresetDate = (dateStr: string): void => {
    onDateChange(dateStr)
    if (dateStr === presets.today.date && dueTime) {
      const [h, m] = dueTime.split(':').map(Number)
      const now = new Date()
      if (h < now.getHours() || (h === now.getHours() && m <= now.getMinutes())) {
        onTimeChange(null)
      }
    }
  }

  // Time calculations
  const hasTime = Boolean(dueTime)

  const { hour12, isPm, minute } = useMemo(() => {
    if (!dueTime) {
      return { hour12: 9, isPm: false, minute: 0 }
    }
    const [hStr, mStr] = dueTime.split(':')
    const h24 = parseInt(hStr, 10) || 0
    const m = parseInt(mStr, 10) || 0
    const pm = h24 >= 12
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12
    return { hour12: h12, isPm: pm, minute: m }
  }, [dueTime])

  const hour12Str = String(hour12).padStart(2, '0')
  const minuteStr = String(minute).padStart(2, '0')

  const to24h = (h12Val: number, pm: boolean): number => {
    if (h12Val === 12) return pm ? 12 : 0
    return pm ? h12Val + 12 : h12Val
  }

  const setTime24h = (h24: number, min: number): void => {
    const hh = String(Math.max(0, Math.min(23, h24))).padStart(2, '0')
    const mm = String(Math.max(0, Math.min(59, min))).padStart(2, '0')
    onTimeChange(`${hh}:${mm}`)
    if (!dueDate) onDateChange(todayStr)
  }

  const togglePeriod = (): void => {
    if (!dueTime) {
      onTimeChange('09:00')
      if (!dueDate) onDateChange(todayStr)
      return
    }
    const [hStr, mStr] = dueTime.split(':')
    const h = parseInt(hStr, 10) || 0
    const m = parseInt(mStr, 10) || 0
    const nextH = (h + 12) % 24
    const hh = String(nextH).padStart(2, '0')
    const mm = String(m).padStart(2, '0')
    onTimeChange(`${hh}:${mm}`)
  }

  const setAmPm = (pm: boolean): void => {
    let h = 9
    let m = 0
    if (dueTime) {
      const [hStr, mStr] = dueTime.split(':')
      h = parseInt(hStr, 10) || 0
      m = parseInt(mStr, 10) || 0
    }
    const isCurrentPm = h >= 12
    if (pm && !isCurrentPm) {
      h = (h + 12) % 24
    } else if (!pm && isCurrentPm) {
      h = (h - 12 + 24) % 24
    }
    const hh = String(h).padStart(2, '0')
    const mm = String(m).padStart(2, '0')
    onTimeChange(`${hh}:${mm}`)
    if (!dueDate) onDateChange(todayStr)
  }

  const handleHourDigit = (digit: number): void => {
    if (hourTypingRef.current.timer) clearTimeout(hourTypingRef.current.timer)
    const newBuffer = (hourTypingRef.current.buffer + digit).slice(-2)
    hourTypingRef.current.buffer = newBuffer

    hourTypingRef.current.timer = setTimeout(() => {
      hourTypingRef.current.buffer = ''
    }, 1000)

    const val = parseInt(newBuffer, 10)
    if (val >= 1 && val <= 12) {
      setTime24h(to24h(val, isPm), minute)
      if (newBuffer.length === 2 || val >= 2) {
        minuteRef.current?.focus()
      }
    } else if (digit >= 1 && digit <= 9) {
      setTime24h(to24h(digit, isPm), minute)
    }
  }

  const handleMinuteDigit = (digit: number): void => {
    if (minuteTypingRef.current.timer) clearTimeout(minuteTypingRef.current.timer)
    const newBuffer = (minuteTypingRef.current.buffer + digit).slice(-2)
    minuteTypingRef.current.buffer = newBuffer

    minuteTypingRef.current.timer = setTimeout(() => {
      minuteTypingRef.current.buffer = ''
    }, 1000)

    const val = parseInt(newBuffer, 10)
    if (!isNaN(val) && val >= 0 && val <= 59) {
      setTime24h(to24h(hour12, isPm), val)
      if (newBuffer.length === 2) {
        periodRef.current?.focus()
      }
    }
  }

  // 1. Hour KeyDown
  const handleHourKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      onClose?.()
      return
    }

    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onClose?.()
      return
    }

    if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      onClose?.()
      return
    }

    // Tab -> move to Minute
    if (e.key === 'Tab') {
      e.preventDefault()
      e.stopPropagation()
      if (!e.shiftKey) {
        minuteRef.current?.focus()
      } else {
        onClose?.('note')
      }
      return
    }

    // Arrow keys: change Hour only
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      e.stopPropagation()
      const nextH12 = (hour12 % 12) + 1
      setTime24h(to24h(nextH12, isPm), minute)
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      e.stopPropagation()
      const prevH12 = hour12 === 1 ? 12 : hour12 - 1
      setTime24h(to24h(prevH12, isPm), minute)
      return
    }

    // Digits 0-9
    if (e.key >= '0' && e.key <= '9') {
      e.preventDefault()
      e.stopPropagation()
      handleHourDigit(parseInt(e.key, 10))
      return
    }

    if (e.key === 'Delete' || e.key === 'Backspace' || e.key.toLowerCase() === 'c') {
      e.preventDefault()
      e.stopPropagation()
      onTimeChange(null)
      return
    }
  }

  const handleHourWheel = (e: WheelEvent<HTMLDivElement>): void => {
    e.preventDefault()
    e.stopPropagation()
    const nextH12 = e.deltaY < 0 ? (hour12 % 12) + 1 : hour12 === 1 ? 12 : hour12 - 1
    setTime24h(to24h(nextH12, isPm), minute)
  }

  // 2. Minute KeyDown
  const handleMinuteKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      onClose?.()
      return
    }

    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onClose?.()
      return
    }

    if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      onClose?.()
      return
    }

    // Tab -> move to AM/PM (or back to Hour with Shift)
    if (e.key === 'Tab') {
      e.preventDefault()
      e.stopPropagation()
      if (!e.shiftKey) {
        periodRef.current?.focus()
      } else {
        hourRef.current?.focus()
      }
      return
    }

    // Arrow keys: step minute (15 min interval)
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      e.stopPropagation()
      const step = e.shiftKey ? 5 : 15
      const nextMin = (Math.floor(minute / step) * step + step) % 60
      setTime24h(to24h(hour12, isPm), nextMin)
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      e.stopPropagation()
      const step = e.shiftKey ? 5 : 15
      const prevMin = (Math.ceil(minute / step) * step - step + 60) % 60
      setTime24h(to24h(hour12, isPm), prevMin)
      return
    }

    // Digits 0-9
    if (e.key >= '0' && e.key <= '9') {
      e.preventDefault()
      e.stopPropagation()
      handleMinuteDigit(parseInt(e.key, 10))
      return
    }

    if (e.key === 'Delete' || e.key === 'Backspace' || e.key.toLowerCase() === 'c') {
      e.preventDefault()
      e.stopPropagation()
      onTimeChange(null)
      return
    }
  }

  const handleMinuteWheel = (e: WheelEvent<HTMLDivElement>): void => {
    e.preventDefault()
    e.stopPropagation()
    const step = e.shiftKey ? 5 : 15
    const nextMin =
      e.deltaY < 0
        ? (Math.floor(minute / step) * step + step) % 60
        : (Math.ceil(minute / step) * step - step + 60) % 60
    setTime24h(to24h(hour12, isPm), nextMin)
  }

  // 3. AM/PM KeyDown
  const handlePeriodKeyDown = (e: KeyboardEvent<HTMLButtonElement>): void => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      onClose?.()
      return
    }

    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onClose?.()
      return
    }

    // Tab -> move to Calendar (Date only!)
    if (e.key === 'Tab') {
      e.preventDefault()
      e.stopPropagation()
      if (!e.shiftKey) {
        calendarRef.current?.focus()
      } else {
        minuteRef.current?.focus()
      }
      return
    }

    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      e.stopPropagation()
      togglePeriod()
      return
    }

    const lower = e.key.toLowerCase()
    if (lower === 'a') {
      e.preventDefault()
      e.stopPropagation()
      setAmPm(false)
      return
    }
    if (lower === 'p') {
      e.preventDefault()
      e.stopPropagation()
      setAmPm(true)
      return
    }
  }

  const handleContainerKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      onClose?.()
      return
    }

    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onClose?.()
      return
    }

    if (e.key === 'Enter') {
      if (e.target instanceof HTMLButtonElement && e.target !== doneButtonRef.current) {
        return
      }
      e.preventDefault()
      e.stopPropagation()
      onClose?.()
      return
    }

    const lower = e.key.toLowerCase()
    if (lower === 't' || e.key === '1') {
      e.preventDefault()
      handlePresetDate(presets.today.date)
    } else if (lower === 'm' || e.key === '2') {
      e.preventDefault()
      handlePresetDate(presets.tomorrow.date)
    } else if (lower === 'w' || e.key === '3') {
      e.preventDefault()
      handlePresetDate(presets.nextWeek.date)
    } else if (lower === 'c') {
      e.preventDefault()
      onClearAll?.()
    }
  }

  const handleDoneKeyDown = (e: KeyboardEvent<HTMLButtonElement>): void => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      onClose?.()
      return
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      e.stopPropagation()
      onClose?.()
      return
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      e.stopPropagation()
      if (e.shiftKey) {
        calendarRef.current?.focus()
      } else {
        hourRef.current?.focus()
      }
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onClose?.()
      return
    }
  }

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      onKeyDown={handleContainerKeyDown}
      className={cn(
        'w-[276px] select-none rounded-2xl border border-border/80 bg-popover/98 p-3 text-foreground shadow-apple-popover apple-glass backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100 focus:outline-none text-[12px]',
        className
      )}
    >
      {/* 1. Header: Compact title and Clear button */}
      <div className="flex items-center justify-between pb-1.5 border-b border-border/40">
        <div className="flex items-center gap-1.5 font-semibold text-[12px] text-foreground">
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-foreground/80 shrink-0"
          >
            <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
            <line x1="16" x2="16" y1="2" y2="6" />
            <line x1="8" x2="8" y1="2" y2="6" />
            <line x1="3" x2="21" y1="10" y2="10" />
          </svg>
          <span>Due Date & Time</span>
        </div>

        {(dueDate || dueTime) && onClearAll && (
          <button
            type="button"
            tabIndex={-1}
            onClick={onClearAll}
            className="px-1.5 py-0.5 rounded text-[11px] font-medium text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
            title="Clear date and time"
          >
            Clear
          </button>
        )}
      </div>

      {/* 2. Scrollable Time Control (Hours -> Tab -> Minutes -> Tab -> AM/PM) */}
      <div className="mt-2 flex items-center justify-between gap-1.5 p-1 bg-secondary/40 rounded-xl border border-border/60">
        <div className="flex items-center gap-1.5 px-1.5">
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={cn('shrink-0 mr-0.5', hasTime ? 'text-primary' : 'text-muted-foreground/60')}
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>

          {/* 1. Hours */}
          <div
            ref={hourRef}
            role="spinbutton"
            tabIndex={0}
            aria-label="Hour"
            aria-valuenow={hour12}
            aria-valuemin={1}
            aria-valuemax={12}
            onKeyDown={handleHourKeyDown}
            onWheel={handleHourWheel}
            className={cn(
              'w-8 h-7 rounded-lg flex items-center justify-center text-[13px] font-bold tabular-nums cursor-pointer transition-all border',
              'focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary',
              hasTime
                ? 'bg-card text-foreground border-border/80 shadow-2xs'
                : 'bg-card/50 text-foreground border-border/40'
            )}
            title="Hour (↑/↓ or scroll, then Tab to min)"
          >
            {hour12Str}
          </div>

          <span className="text-muted-foreground/60 font-bold select-none">:</span>

          {/* 2. Minutes */}
          <div
            ref={minuteRef}
            role="spinbutton"
            tabIndex={0}
            aria-label="Minute"
            aria-valuenow={minute}
            aria-valuemin={0}
            aria-valuemax={59}
            onKeyDown={handleMinuteKeyDown}
            onWheel={handleMinuteWheel}
            className={cn(
              'w-8 h-7 rounded-lg flex items-center justify-center text-[13px] font-bold tabular-nums cursor-pointer transition-all border',
              'focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary',
              hasTime
                ? 'bg-card text-foreground border-border/80 shadow-2xs'
                : 'bg-card/50 text-foreground border-border/40'
            )}
            title="Minute (↑/↓ or scroll, then Tab to AM/PM)"
          >
            {minuteStr}
          </div>

          {/* 3. AM / PM */}
          <button
            ref={periodRef}
            type="button"
            tabIndex={0}
            aria-label="AM or PM"
            onClick={togglePeriod}
            onKeyDown={handlePeriodKeyDown}
            className={cn(
              'h-7 px-2 rounded-lg text-[11.5px] font-bold cursor-pointer transition-all border select-none',
              'focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary',
              hasTime
                ? 'bg-card text-foreground border-border/80 shadow-2xs hover:bg-card/80'
                : 'bg-card/50 text-foreground border-border/40 hover:bg-card/80'
            )}
            title="Click or press Space/A/P to toggle, then Tab to date"
          >
            {isPm ? 'PM' : 'AM'}
          </button>
        </div>

        {/* Clear Time button if time is set */}
        {hasTime && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => onTimeChange(null)}
            className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-secondary text-[12px] transition-colors cursor-pointer mr-0.5 shrink-0"
            title="Clear time"
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {/* 3. Quick Date Presets */}
      <div className="grid grid-cols-3 gap-1 mt-2">
        <button
          type="button"
          tabIndex={-1}
          onClick={() => handlePresetDate(presets.today.date)}
          className={cn(
            'py-1 px-1 rounded-lg text-[11px] font-medium border transition-all text-center flex flex-col items-center justify-center cursor-pointer focus:outline-none',
            dueDate === presets.today.date
              ? 'bg-secondary text-foreground border-primary font-semibold ring-1 ring-primary shadow-2xs'
              : 'bg-secondary/40 hover:bg-secondary border-border/40 text-foreground'
          )}
          title="Today (T or 1)"
        >
          <span>Today</span>
          <span
            className={cn(
              'text-[9px]',
              dueDate === presets.today.date ? 'text-primary font-medium' : 'text-muted-foreground'
            )}
          >
            {presets.today.day}
          </span>
        </button>

        <button
          type="button"
          tabIndex={-1}
          onClick={() => handlePresetDate(presets.tomorrow.date)}
          className={cn(
            'py-1 px-1 rounded-lg text-[11px] font-medium border transition-all text-center flex flex-col items-center justify-center cursor-pointer focus:outline-none',
            dueDate === presets.tomorrow.date
              ? 'bg-secondary text-foreground border-primary font-semibold ring-1 ring-primary shadow-2xs'
              : 'bg-secondary/40 hover:bg-secondary border-border/40 text-foreground'
          )}
          title="Tomorrow (M or 2)"
        >
          <span>Tomorrow</span>
          <span
            className={cn(
              'text-[9px]',
              dueDate === presets.tomorrow.date
                ? 'text-primary font-medium'
                : 'text-muted-foreground'
            )}
          >
            {presets.tomorrow.day}
          </span>
        </button>

        <button
          type="button"
          tabIndex={-1}
          onClick={() => handlePresetDate(presets.nextWeek.date)}
          className={cn(
            'py-1 px-1 rounded-lg text-[11px] font-medium border transition-all text-center flex flex-col items-center justify-center cursor-pointer focus:outline-none',
            dueDate === presets.nextWeek.date
              ? 'bg-secondary text-foreground border-primary font-semibold ring-1 ring-primary shadow-2xs'
              : 'bg-secondary/40 hover:bg-secondary border-border/40 text-foreground'
          )}
          title="Next week (W or 3)"
        >
          <span>Next week</span>
          <span
            className={cn(
              'text-[9px]',
              dueDate === presets.nextWeek.date
                ? 'text-primary font-medium'
                : 'text-muted-foreground'
            )}
          >
            {presets.nextWeek.day}
          </span>
        </button>
      </div>

      {/* 4. Unified Calendar View (Date only!) */}
      <div className="mt-2">
        <FluentDatePicker
          containerRef={calendarRef}
          value={dueDate || undefined}
          dayCutoffHour={dayCutoffHour}
          autoSelectOnArrow={true}
          onSelect={(dateStr) => onDateChange(dateStr)}
          onCancel={onClose}
          onTabNext={() => doneButtonRef.current?.focus()}
          onTabPrev={() => periodRef.current?.focus()}
          hideFooter={true}
          tabIndex={0}
          className="w-full border-0 shadow-none p-0 bg-transparent animate-none backdrop-blur-none rounded-xl focus-visible:ring-1.5 focus-visible:ring-primary/60"
        />
      </div>

      {/* 5. Compact Footer */}
      {onClose && (
        <div className="mt-2 pt-2 border-t border-border/40 flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground/60 select-none flex items-center gap-1.5 flex-wrap">
            <span>
              <kbd className="font-mono text-[9px] bg-secondary/80 px-1 py-0.5 rounded border border-border/50 text-foreground/80">
                ↑↓
              </kbd>{' '}
              Adjust
            </span>
            <span>
              <kbd className="font-mono text-[9px] bg-secondary/80 px-1 py-0.5 rounded border border-border/50 text-foreground/80">
                Tab
              </kbd>{' '}
              Next
            </span>
            <span>
              <kbd className="font-mono text-[9px] bg-secondary/80 px-1 py-0.5 rounded border border-border/50 text-foreground/80">
                ↵
              </kbd>{' '}
              Done
            </span>
          </span>
          <button
            ref={doneButtonRef}
            type="button"
            onClick={() => onClose()}
            onKeyDown={handleDoneKeyDown}
            className="h-6 px-2.5 rounded-lg bg-secondary text-foreground text-[11px] font-semibold hover:bg-secondary/80 border border-border/70 shadow-2xs active:scale-95 transition-all cursor-pointer focus:outline-none focus:ring-1.5 focus:ring-primary"
          >
            Done
          </button>
        </div>
      )}
    </div>
  )
}
