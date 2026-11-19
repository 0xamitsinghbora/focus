import { useState } from 'react'
import { FluentDatePicker } from '../ui/FluentDatePicker'
import {
  GROUP_THEMES,
  getGroupTheme,
  getRandomUnusedColor,
  getSavedGroupColors,
  getUsedGroupColorsMap,
  GroupColorId
} from '../../lib/groupTheme'
import { cn } from '../../lib/utils'
import { ColumnId, getReschedulePresetDates } from './types'

export interface GoalsBulkActionsBarProps {
  selectedGoalIds: Set<string>
  totalVisibleCount: number
  onSelectAll: () => void
  onClearSelection: () => void
  onBulkMoveStatus: (status: ColumnId) => Promise<void>
  onBulkReschedule: (deadline?: string) => Promise<void>
  onBulkAssignGroup: (tag?: string, color?: string) => Promise<void>
  onBulkDelete: () => void

  existingGroups: { tag: string; color: string }[]
  dayCutoffHour?: number
}

export function GoalsBulkActionsBar({
  selectedGoalIds,
  totalVisibleCount,
  onSelectAll,
  onClearSelection,
  onBulkMoveStatus,
  onBulkReschedule,
  onBulkAssignGroup,
  onBulkDelete,
  existingGroups,
  dayCutoffHour = 0
}: GoalsBulkActionsBarProps): React.JSX.Element | null {
  // --- Internal popover state ---
  const [bulkRescheduleOpen, setBulkRescheduleOpen] = useState(false)
  const [bulkRescheduleCustomOpen, setBulkRescheduleCustomOpen] = useState(false)
  const [bulkGroupOpen, setBulkGroupOpen] = useState(false)
  const [isCreatingBulkGroup, setIsCreatingBulkGroup] = useState(false)
  const [newBulkGroupInput, setNewBulkGroupInput] = useState('')
  const [newBulkGroupColor, setNewBulkGroupColor] = useState<GroupColorId>('blue')

  if (selectedGoalIds.size === 0) return null

  const count = selectedGoalIds.size

  // --- Internal handlers that delegate + close popovers ---
  const handleReschedule = async (deadline?: string): Promise<void> => {
    await onBulkReschedule(deadline)
    setBulkRescheduleOpen(false)
    setBulkRescheduleCustomOpen(false)
  }

  const handleAssignGroup = async (tag?: string, color?: string): Promise<void> => {
    await onBulkAssignGroup(tag, color)
    setBulkGroupOpen(false)
    setIsCreatingBulkGroup(false)
  }

  return (
    <div
      id="goals-bulk-actions-toolbar"
      role="toolbar"
      aria-label="Bulk task actions"
      tabIndex={-1}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9000] flex items-center gap-1.5 p-1.5 pl-3 rounded-2xl border border-border/80 bg-popover/95 shadow-apple-popover backdrop-blur-xl animate-in fade-in slide-in-from-bottom-4 duration-200 select-none text-[12.5px] whitespace-nowrap max-w-[95vw]"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Selected count and Select all / Deselect */}
      <div className="flex items-center gap-2 pr-1 shrink-0" aria-live="polite" aria-atomic="true">
        <span className="flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-primary text-primary-foreground text-[11px] font-bold tabular-nums shadow-2xs shrink-0">
          {count}
        </span>
        <span className="font-semibold text-foreground whitespace-nowrap">
          {count === 1 ? 'task selected' : 'tasks selected'}
        </span>
        <button
          type="button"
          onClick={onSelectAll}
          className="text-[11px] text-muted-foreground hover:text-foreground hover:underline ml-0.5 font-medium whitespace-nowrap cursor-pointer"
        >
          {count === totalVisibleCount ? 'Deselect all' : 'Select all'}
        </button>
      </div>

      <div className="h-5 w-px bg-border/60 mx-0.5 shrink-0" />

      {/* Bulk Move (Status) */}
      <div className="flex items-center gap-1 shrink-0" role="group" aria-label="Change status">
        <span className="text-[11px] font-medium text-muted-foreground mr-0.5 whitespace-nowrap">
          Move:
        </span>
        <button
          type="button"
          onClick={() => onBulkMoveStatus('planned')}
          className="h-7 flex items-center gap-1.5 px-2.5 rounded-lg border border-border/60 bg-surface hover:bg-secondary text-foreground text-[11.5px] font-medium transition-colors shadow-2xs whitespace-nowrap shrink-0 cursor-pointer"
          title="Move selected to Planned (1)"
          aria-label="Move selected tasks to Planned (1)"
        >
          <span className="h-2 w-2 rounded-full bg-apple-red shrink-0" />
          <span className="whitespace-nowrap">Planned</span>
          <kbd className="px-1 py-0.2 rounded bg-muted/80 border border-border/60 text-[9.5px] font-mono text-muted-foreground">
            1
          </kbd>
        </button>
        <button
          type="button"
          onClick={() => onBulkMoveStatus('in_progress')}
          className="h-7 flex items-center gap-1.5 px-2.5 rounded-lg border border-border/60 bg-surface hover:bg-secondary text-foreground text-[11.5px] font-medium transition-colors shadow-2xs whitespace-nowrap shrink-0 cursor-pointer"
          title="Move selected to In Progress (2)"
          aria-label="Move selected tasks to In Progress (2)"
        >
          <span className="h-2 w-2 rounded-full bg-apple-amber shrink-0" />
          <span className="whitespace-nowrap">In Progress</span>
          <kbd className="px-1 py-0.2 rounded bg-muted/80 border border-border/60 text-[9.5px] font-mono text-muted-foreground">
            2
          </kbd>
        </button>
        <button
          type="button"
          onClick={() => onBulkMoveStatus('done')}
          className="h-7 flex items-center gap-1.5 px-2.5 rounded-lg border border-border/60 bg-surface hover:bg-secondary text-foreground text-[11.5px] font-medium transition-colors shadow-2xs whitespace-nowrap shrink-0 cursor-pointer"
          title="Move selected to Completed (3)"
          aria-label="Move selected tasks to Completed (3)"
        >
          <span className="h-2 w-2 rounded-full bg-apple-green shrink-0" />
          <span className="whitespace-nowrap">Completed</span>
          <kbd className="px-1 py-0.2 rounded bg-muted/80 border border-border/60 text-[9.5px] font-mono text-muted-foreground">
            3
          </kbd>
        </button>
      </div>

      <div className="h-5 w-px bg-border/60 mx-0.5 shrink-0" />

      {/* Bulk Reschedule */}
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => {
            setBulkRescheduleOpen((v) => !v)
            setBulkGroupOpen(false)
          }}
          className={cn(
            'h-7 flex items-center gap-1.5 px-2.5 rounded-lg border text-[11.5px] font-medium transition-colors shadow-2xs whitespace-nowrap shrink-0 cursor-pointer',
            bulkRescheduleOpen
              ? 'border-primary ring-1 ring-primary/40 bg-secondary text-foreground'
              : 'border-border/60 bg-surface hover:bg-secondary text-foreground'
          )}
          title="Reschedule due dates"
          aria-label="Reschedule due dates"
          aria-haspopup="dialog"
          aria-expanded={bulkRescheduleOpen}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0"
          >
            <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
            <line x1="16" x2="16" y1="2" y2="6" />
            <line x1="8" x2="8" y1="2" y2="6" />
            <line x1="3" x2="21" y1="10" y2="10" />
          </svg>
          <span className="whitespace-nowrap">Reschedule</span>
          <span className="text-[10px] text-muted-foreground shrink-0">&#9662;</span>
        </button>

        {/* Bulk Reschedule Popover */}
        {bulkRescheduleOpen && (
          <div
            className={cn(
              'absolute bottom-full mb-2.5 left-1/2 -translate-x-1/2 rounded-xl border border-border/80 bg-popover/95 p-1.5 shadow-apple-popover backdrop-blur-md animate-in fade-in zoom-in-95 duration-100 text-[12px] z-[9999]',
              bulkRescheduleCustomOpen ? 'w-[280px]' : 'min-w-[215px]'
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-2 py-1 text-[11px] font-semibold text-muted-foreground border-b border-border/40 mb-1 flex items-center justify-between">
              <span>Reschedule Due Date</span>
              <span className="text-[10px] font-mono opacity-70">
                {count} {count === 1 ? 'task' : 'tasks'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => handleReschedule(getReschedulePresetDates(dayCutoffHour).today)}
              className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-foreground hover:bg-secondary transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-apple-amber" />
                <span>Today</span>
              </div>
              <span className="text-[10.5px] font-mono text-muted-foreground">
                {new Date().toLocaleDateString(undefined, { weekday: 'short' })}
              </span>
            </button>
            <button
              type="button"
              onClick={() => handleReschedule(getReschedulePresetDates(dayCutoffHour).tomorrow)}
              className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-foreground hover:bg-secondary transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-sky-500" />
                <span>Tomorrow</span>
              </div>
              <span className="text-[10.5px] font-mono text-muted-foreground">
                {new Date(Date.now() + 86400000).toLocaleDateString(undefined, {
                  weekday: 'short'
                })}
              </span>
            </button>
            <button
              type="button"
              onClick={() => handleReschedule(getReschedulePresetDates(dayCutoffHour).thisWeekend)}
              className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-foreground hover:bg-secondary transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-purple-500" />
                <span>This Weekend</span>
              </div>
              <span className="text-[10.5px] font-mono text-muted-foreground">Sat</span>
            </button>
            <button
              type="button"
              onClick={() => handleReschedule(getReschedulePresetDates(dayCutoffHour).nextWeek)}
              className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-foreground hover:bg-secondary transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-indigo-500" />
                <span>Next Week</span>
              </div>
              <span className="text-[10.5px] font-mono text-muted-foreground">Mon</span>
            </button>

            <div className="my-1 border-t border-border/40" />

            <button
              type="button"
              onClick={() => setBulkRescheduleCustomOpen((v) => !v)}
              className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-foreground hover:bg-secondary transition-colors font-medium"
            >
              <div className="flex items-center gap-2">
                <svg
                  width="12"
                  height="12"
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
                <span>Custom Date...</span>
              </div>
              <span className="text-[10.5px] text-muted-foreground">
                {bulkRescheduleCustomOpen ? '▾' : '›'}
              </span>
            </button>

            {bulkRescheduleCustomOpen && (
              <div className="p-1 pt-1.5 border-t border-border/40 mt-1">
                <FluentDatePicker
                  className="w-full border-0 shadow-none p-1 bg-transparent"
                  dayCutoffHour={dayCutoffHour}
                  onSelect={(dateStr: string) => {
                    handleReschedule(dateStr)
                  }}
                  onCancel={() => setBulkRescheduleCustomOpen(false)}
                />
              </div>
            )}

            <div className="my-1 border-t border-border/40" />

            <button
              type="button"
              onClick={() => handleReschedule(undefined)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
              <span>Remove Due Date</span>
            </button>
          </div>
        )}
      </div>

      <div className="h-5 w-px bg-border/60 mx-0.5" />

      {/* Bulk Group Tag */}
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => {
            setBulkGroupOpen((v) => !v)
            setBulkRescheduleOpen(false)
          }}
          className={cn(
            'h-7 flex items-center gap-1.5 px-2.5 rounded-lg border text-[11.5px] font-medium transition-colors shadow-2xs whitespace-nowrap shrink-0',
            bulkGroupOpen
              ? 'border-primary ring-1 ring-primary/40 bg-secondary text-foreground'
              : 'border-border/60 bg-surface hover:bg-secondary text-foreground'
          )}
          title="Assign or change group tags"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="shrink-0"
          >
            <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" />
            <path d="M7 7h.01" />
          </svg>
          <span className="whitespace-nowrap">Group</span>
          <span className="text-[10px] text-muted-foreground shrink-0">&#9662;</span>
        </button>

        {/* Bulk Group Popover */}
        {bulkGroupOpen && (
          <div
            className="absolute bottom-full mb-2.5 left-1/2 -translate-x-1/2 min-w-[220px] max-w-[260px] rounded-xl border border-border/80 bg-popover/95 p-1.5 shadow-apple-popover backdrop-blur-md animate-in fade-in zoom-in-95 duration-100 text-[12px] z-[9999]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-2 py-1 text-[11px] font-semibold text-muted-foreground border-b border-border/40 mb-1 flex items-center justify-between">
              <span>Assign Group Tag</span>
              <span className="text-[10px] font-mono opacity-70">
                {count} {count === 1 ? 'task' : 'tasks'}
              </span>
            </div>
            <div className="max-h-56 overflow-y-auto custom-scrollbar space-y-0.5">
              <button
                type="button"
                onClick={() => handleAssignGroup(undefined)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
                <span>Remove from group (Untagged)</span>
              </button>

              {existingGroups.map((g) => {
                const theme = getGroupTheme(g.color)
                return (
                  <button
                    key={g.tag}
                    type="button"
                    onClick={() => handleAssignGroup(g.tag, g.color)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-foreground hover:bg-secondary transition-colors truncate"
                  >
                    <span className={cn('h-2 w-2 rounded-full shrink-0', theme.dotClass)} />
                    <span className="truncate">{g.tag}</span>
                  </button>
                )
              })}
            </div>

            <div className="my-1 border-t border-border/40" />

            {!isCreatingBulkGroup ? (
              <button
                type="button"
                onClick={() => {
                  setIsCreatingBulkGroup(true)
                  setNewBulkGroupInput('')
                  const saved = getSavedGroupColors()
                  setNewBulkGroupColor(getRandomUnusedColor(Object.values(saved)))
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-primary hover:bg-secondary font-medium transition-colors"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" />
                  <path d="M7 7h.01" />
                </svg>
                <span>Add New Group...</span>
              </button>
            ) : (
              <div className="p-1.5 space-y-2 rounded-lg bg-secondary/60 border border-border/60">
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      'h-2.5 w-2.5 rounded-full shrink-0',
                      getGroupTheme(newBulkGroupColor).dotClass
                    )}
                  />
                  <input
                    type="text"
                    autoFocus
                    value={newBulkGroupInput}
                    onChange={(e) => setNewBulkGroupInput(e.target.value)}
                    placeholder="New group name..."
                    className="w-full bg-background border border-border/80 rounded-md px-2 py-1 text-[11.5px] text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        const clean = newBulkGroupInput.trim()
                        if (clean) {
                          handleAssignGroup(clean, newBulkGroupColor)
                        }
                      } else if (e.key === 'Escape') {
                        e.preventDefault()
                        setIsCreatingBulkGroup(false)
                      }
                    }}
                  />
                </div>
                <div className="flex items-center gap-1 flex-wrap pt-0.5">
                  {(() => {
                    const usedColorsMap = getUsedGroupColorsMap(undefined, existingGroups)
                    return GROUP_THEMES.map((t) => {
                      const usedByGroup = usedColorsMap.get(t.id)
                      const isUsed = Boolean(usedByGroup)
                      return (
                        <button
                          key={t.id}
                          type="button"
                          disabled={isUsed}
                          onClick={() => {
                            if (!isUsed) setNewBulkGroupColor(t.id)
                          }}
                          className={cn(
                            'relative h-4 w-4 rounded-full flex items-center justify-center transition-transform',
                            t.dotClass,
                            isUsed
                              ? 'opacity-30 cursor-not-allowed'
                              : newBulkGroupColor === t.id
                                ? 'ring-2 ring-primary ring-offset-1 ring-offset-background scale-110 cursor-pointer'
                                : 'opacity-75 hover:opacity-100 hover:scale-105 cursor-pointer'
                          )}
                          title={isUsed ? `${t.name} (Already used by "${usedByGroup}")` : t.name}
                        >
                          {isUsed && (
                            <svg
                              className="h-2.5 w-2.5 text-foreground/90 stroke-[3] pointer-events-none drop-shadow-xs"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          )}
                        </button>
                      )
                    })
                  })()}
                </div>
                <div className="flex items-center justify-end gap-1.5 pt-0.5">
                  <button
                    type="button"
                    onClick={() => setIsCreatingBulkGroup(false)}
                    className="px-2 py-0.5 rounded text-[10.5px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!newBulkGroupInput.trim()}
                    onClick={() => {
                      const clean = newBulkGroupInput.trim()
                      if (clean) {
                        handleAssignGroup(clean, newBulkGroupColor)
                      }
                    }}
                    className="px-2.5 py-1 rounded text-[10.5px] font-semibold bg-primary text-primary-foreground disabled:opacity-50 hover:bg-primary/90 transition-colors shadow-2xs"
                  >
                    Create &amp; Apply
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bulk Delete */}
      <button
        type="button"
        onClick={onBulkDelete}
        className="h-7 flex items-center gap-1.5 px-2.5 rounded-lg border border-apple-red/30 bg-apple-red/10 text-apple-red hover:bg-apple-red/20 text-[11.5px] font-semibold transition-colors shadow-2xs whitespace-nowrap shrink-0"
        title="Delete selected tasks (Del)"
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="shrink-0"
        >
          <path d="M3 6h18" />
          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
        </svg>
        <span className="whitespace-nowrap">Delete</span>
        <kbd className="px-1 py-0.2 rounded bg-apple-red/20 border border-apple-red/30 text-[9.5px] font-mono">
          Del
        </kbd>
      </button>

      {/* Dismiss button */}
      <button
        type="button"
        onClick={onClearSelection}
        className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary flex items-center justify-center transition-colors ml-0.5 shrink-0"
        title="Clear selection (Esc)"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  )
}
