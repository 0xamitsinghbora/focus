import React from 'react'
import { DailyGoal } from '../../../../shared/types'
import { cn } from '../../lib/utils'
import { getGroupTheme, getPreferredGroupColor } from '../../lib/groupTheme'

export interface PromptTaskSelectorProps {
  goals: DailyGoal[]
  safeSelectedIndex: number
  itemRefs: React.MutableRefObject<(HTMLButtonElement | null)[]>
  status: 'idle' | 'saving' | 'error'
  onSelectOption: (index: number) => void
  onQuickDone?: (index: number) => void
  onSnooze: () => void
  snoozeCount?: number
}

export function PromptTaskSelector({
  goals,
  safeSelectedIndex,
  itemRefs,
  status,
  onSelectOption,
  onQuickDone,
  onSnooze,
  snoozeCount
}: PromptTaskSelectorProps): React.JSX.Element {
  return (
    <>
      <div className="flex items-center justify-between">
        <h3 className="text-[15px] font-semibold text-foreground tracking-[-0.022em] leading-snug">
          What did you do?
        </h3>
        <div className="flex items-center gap-2">
          {typeof snoozeCount === 'number' && snoozeCount > 0 && (
            <span
              className="text-[10.5px] font-medium px-1.5 py-0.5 rounded bg-apple-amber/15 text-apple-amber border border-apple-amber/30"
              title={`This session has been snoozed ${snoozeCount} times`}
            >
              Snoozed {snoozeCount}x
            </span>
          )}
          <span className="text-[11px] text-muted-foreground/80 font-medium">↑↓ Select</span>
        </div>
      </div>

      {/* Today's Tasks List */}
      <div className="space-y-1.5">
        <div className="text-[11px] font-medium text-muted-foreground px-0.5">
          Today&apos;s Tasks
        </div>

        <div className="grid gap-1.5 max-h-[140px] overflow-y-auto custom-scrollbar pr-0.5">
          {goals.map((goal, idx) => {
            const isSelected = safeSelectedIndex === idx
            const theme = goal.groupTag
              ? getGroupTheme(goal.groupColor || getPreferredGroupColor(goal.groupTag))
              : null
            const dotClass = theme ? theme.dotClass : 'bg-apple-green'

            return (
              <div
                key={goal.id}
                className={cn(
                  'w-full text-left px-3 py-2 rounded-xl text-[13px] font-medium tracking-[-0.01em] transition-all duration-150 border flex items-center justify-between group cursor-pointer outline-none',
                  isSelected
                    ? 'bg-primary/10 border-primary ring-2 ring-primary/70 text-foreground shadow-apple-subtle font-semibold'
                    : 'bg-card border-border/70 text-foreground/85 hover:border-border hover:shadow-apple-subtle active:scale-[0.99]'
                )}
                onClick={(e) => {
                  e.stopPropagation()
                  onSelectOption(idx)
                }}
              >
                <button
                  ref={(el) => {
                    itemRefs.current[idx] = el
                  }}
                  type="button"
                  className="flex items-center gap-2 min-w-0 flex-1 text-left bg-transparent border-none p-0 cursor-pointer outline-none"
                  onClick={(e) => {
                    e.stopPropagation()
                    onSelectOption(idx)
                  }}
                >
                  <span
                    className={cn('h-2 w-2 rounded-full shrink-0', dotClass)}
                    aria-hidden="true"
                  />
                  <span className="truncate">{goal.title}</span>
                  {goal.groupTag && theme && (
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 px-1.5 py-0.2 rounded-md font-medium text-[10px] border shadow-2xs shrink-0',
                        theme.badgeBg,
                        theme.badgeText,
                        theme.badgeBorder
                      )}
                    >
                      <span>{goal.groupTag}</span>
                    </span>
                  )}
                </button>
                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  <span
                    className={cn(
                      'text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0',
                      goal.status === 'in_progress'
                        ? 'bg-apple-amber/15 text-apple-amber border border-apple-amber/30'
                        : 'bg-secondary/80 text-muted-foreground border border-border/50'
                    )}
                  >
                    {goal.status === 'in_progress' ? 'In Progress' : 'Planned'}
                  </span>
                  {onQuickDone && (
                    <button
                      type="button"
                      title={`Mark "${goal.title}" done & save`}
                      onClick={(e) => {
                        e.stopPropagation()
                        onQuickDone(idx)
                      }}
                      className="h-6 px-2 rounded-lg bg-apple-green/15 hover:bg-apple-green/25 text-apple-green border border-apple-green/30 text-[11px] font-semibold flex items-center gap-1 transition-all active:scale-95 cursor-pointer shadow-2xs"
                    >
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>Done</span>
                    </button>
                  )}
                </div>
              </div>
            )
          })}
          {goals.length === 0 && (
            <div className="rounded-xl border border-dashed border-border/60 bg-surface/30 px-3 py-2.5 text-center text-[11.5px] text-muted-foreground">
              No active or planned tasks for today
            </div>
          )}
        </div>

        {/* Bottom options: Something Else & Break */}
        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/40">
          <button
            ref={(el) => {
              itemRefs.current[goals.length] = el
            }}
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onSelectOption(goals.length)
            }}
            className={cn(
              'px-3 py-2 rounded-xl text-[12px] font-medium border transition-all active:scale-[0.98] outline-none cursor-pointer flex items-center justify-center gap-1.5',
              safeSelectedIndex === goals.length
                ? 'bg-secondary/90 border-border/90 ring-1 ring-border text-foreground shadow-apple-subtle font-semibold'
                : 'bg-card border-border/70 text-foreground/80 hover:bg-secondary/40 hover:border-border hover:text-foreground'
            )}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0"
            >
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            <span>Something Else</span>
          </button>

          <button
            ref={(el) => {
              itemRefs.current[goals.length + 1] = el
            }}
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onSelectOption(goals.length + 1)
            }}
            className={cn(
              'px-3 py-2 rounded-xl text-[12px] font-medium border transition-all active:scale-[0.98] outline-none cursor-pointer flex items-center justify-center gap-1.5',
              safeSelectedIndex === goals.length + 1
                ? 'bg-apple-red/25 border-apple-red ring-2 ring-apple-red text-apple-red shadow-apple-subtle font-semibold'
                : 'bg-apple-red/10 border-apple-red/20 text-apple-red hover:bg-apple-red/15'
            )}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0"
            >
              <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
              <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
              <line x1="6" y1="1" x2="6" y2="4" />
              <line x1="10" y1="1" x2="10" y2="4" />
              <line x1="14" y1="1" x2="14" y2="4" />
            </svg>
            <span>Break</span>
          </button>
        </div>
      </div>

      {status === 'error' && (
        <div className="text-center text-[12px] font-medium text-apple-red">
          Failed to save. Please try again.
        </div>
      )}

      {/* Action Footer for Step 1 */}
      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          disabled={status === 'saving'}
          onClick={(e) => {
            e.stopPropagation()
            onSnooze()
          }}
          className="px-3.5 py-1.5 text-[12px] font-medium text-foreground bg-card hover:bg-secondary border border-border/80 hover:border-border transition-all rounded-xl shadow-apple-subtle hover:shadow-apple-card flex items-center gap-1.5 cursor-pointer active:scale-95 disabled:opacity-40"
        >
          <span>{typeof snoozeCount === 'number' && snoozeCount > 0 ? `Snooze (${snoozeCount}x)` : 'Snooze'}</span>
          <kbd className="px-1.5 py-0.5 rounded-md bg-secondary text-muted-foreground border border-border/70 text-[10px] font-mono leading-none">
            Esc
          </kbd>
        </button>

        <button
          type="button"
          disabled={status === 'saving'}
          onClick={(e) => {
            e.stopPropagation()
            onSelectOption(safeSelectedIndex)
          }}
          className="px-4 py-1.5 text-[12px] font-semibold rounded-xl transition-all duration-150 bg-secondary/80 hover:bg-secondary text-foreground border border-border/80 hover:border-border shadow-apple-subtle active:scale-95 disabled:opacity-40 flex items-center gap-1.5 cursor-pointer"
        >
          <span>{status === 'saving' ? 'Saving...' : 'Select'}</span>
          <kbd className="px-1.5 py-0.5 rounded-md bg-secondary text-muted-foreground border border-border/70 text-[10px] font-mono leading-none">
            Enter
          </kbd>
        </button>
      </div>
    </>
  )
}
