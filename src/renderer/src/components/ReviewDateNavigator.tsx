import { memo, useState, useRef, useEffect } from 'react'
import { shiftDate, parseLocalDate, localDateStr } from '../../../shared/types'
import { FluentDatePicker } from './ui/FluentDatePicker'

const formatReviewDateTitle = (dateStr: string, todayStr?: string): string => {
  const today = todayStr || localDateStr()
  const d = parseLocalDate(dateStr)
  const currentYear = new Date().getFullYear()
  const isDiffYear = d.getFullYear() !== currentYear

  if (dateStr === today) {
    const monthDay = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    return `Today · ${monthDay}`
  }

  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: isDiffYear ? 'numeric' : undefined
  })
}

export interface ReviewDateNavigatorProps {
  selectedDayDate: string
  todayStr: string
  dayCutoffHour: number
  onDateChange: (date: string) => void
  onJumpToToday: () => void
}

export const ReviewDateNavigator = memo(function ReviewDateNavigator({
  selectedDayDate,
  todayStr,
  dayCutoffHour,
  onDateChange,
  onJumpToToday
}: ReviewDateNavigatorProps): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e: MouseEvent): void => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    const handleKeyDown = (e: globalThis.KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onDateChange(shiftDate(selectedDayDate, -1))}
          className="h-8 w-8 shrink-0 rounded-lg border border-border/60 bg-surface flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-border transition-colors active:scale-95 cursor-pointer"
          title="Previous day"
          aria-label="Previous day"
        >
          ←
        </button>

        {/* Interactive Date Selector with popover anchored FluentDatePicker */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            className="flex items-center justify-center gap-2 w-46.25 h-8 shrink-0 rounded-xl border border-border/60 bg-surface/60 hover:bg-surface hover:border-border transition-all cursor-pointer group select-none shadow-2xs"
            title="Click to jump to a specific date"
            aria-label="Choose date"
            aria-expanded={isOpen}
          >
            <svg
              className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
              <line x1="16" x2="16" y1="2" y2="6" />
              <line x1="8" x2="8" y1="2" y2="6" />
              <line x1="3" x2="21" y1="10" y2="10" />
            </svg>
            <span className="text-[13px] font-semibold text-foreground tracking-tight tabular-nums truncate">
              {formatReviewDateTitle(selectedDayDate, todayStr)}
            </span>
          </button>

          {isOpen && (
            <div
              ref={popoverRef}
              className="absolute left-0 top-full mt-2 z-50 rounded-2xl border border-border/70 shadow-apple-popover apple-glass backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-150 p-2"
            >
              <FluentDatePicker
                value={selectedDayDate}
                dayCutoffHour={dayCutoffHour}
                onSelect={(newDate) => {
                  if (newDate <= todayStr) {
                    onDateChange(newDate)
                  }
                  setIsOpen(false)
                }}
                onCancel={() => setIsOpen(false)}
              />
            </div>
          )}
        </div>

        <button
          onClick={() => onDateChange(shiftDate(selectedDayDate, 1))}
          disabled={selectedDayDate >= todayStr}
          className="h-8 w-8 shrink-0 rounded-lg border border-border/60 bg-surface flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-border transition-colors active:scale-95 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
          title="Next day"
          aria-label="Next day"
        >
          →
        </button>
      </div>

      <div className="flex items-center gap-2">
        {selectedDayDate !== todayStr && (
          <button
            onClick={onJumpToToday}
            className="h-8 px-3 rounded-lg border border-border/70 bg-surface/80 text-[12px] font-semibold text-foreground hover:bg-secondary active:scale-95 transition-all shadow-2xs cursor-pointer tracking-[-0.01em]"
          >
            Jump to Today
          </button>
        )}
      </div>
    </div>
  )
})
