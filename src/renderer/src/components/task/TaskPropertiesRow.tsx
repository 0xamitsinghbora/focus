import React from 'react'
import { cn, formatDueDateLabel } from '../../lib/utils'
import { getGroupTheme } from '../../lib/groupTheme'

export interface TaskPropertiesRowProps {
  groupTag: string
  setGroupTag: (tag: string) => void
  currentGroupTheme: ReturnType<typeof getGroupTheme>
  dueDate: string | null
  dueTime: string | null
  setDueDate: (date: string | null) => void
  setDueTime: (time: string | null) => void
  dayCutoffHour: number
}

export function TaskPropertiesRow({
  groupTag,
  setGroupTag,
  currentGroupTheme,
  dueDate,
  dueTime,
  setDueDate,
  setDueTime,
  dayCutoffHour
}: TaskPropertiesRowProps): React.JSX.Element | null {
  if (!groupTag && !dueDate) {
    return null
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-border/40">
      {groupTag && (
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium border shadow-2xs transition-all',
            currentGroupTheme.badgeBg,
            currentGroupTheme.badgeText,
            currentGroupTheme.badgeBorder
          )}
        >
          <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', currentGroupTheme.dotClass)} />
          <span>Group: {groupTag}</span>
          <button
            type="button"
            onClick={() => setGroupTag('')}
            className="ml-0.5 opacity-70 hover:opacity-100 hover:text-foreground transition-opacity"
            title="Remove group tag"
          >
            ×
          </button>
        </span>
      )}
      {dueDate && (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-secondary/80 px-2 py-0.5 text-[11px] font-medium text-foreground border border-border">
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
            <line x1="16" x2="16" y1="2" y2="6" />
            <line x1="8" x2="8" y1="2" y2="6" />
            <line x1="3" x2="21" y1="10" y2="10" />
          </svg>
          <span>Due: {formatDueDateLabel(dueDate, dueTime, dayCutoffHour)}</span>
          <button
            type="button"
            onClick={() => {
              setDueDate(null)
              setDueTime(null)
            }}
            className="ml-0.5 hover:text-foreground font-semibold"
            title="Remove due date"
          >
            ×
          </button>
        </span>
      )}
    </div>
  )
}
