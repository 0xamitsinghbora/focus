import React from 'react'
import { DailyGoal, localDateStr } from '../../../../shared/types'
import { AddTaskCard } from '../AddTaskCard'
import { cn, formatDeadlineBadge, isDeadlineOverdue } from '../../lib/utils'
import { getGroupTheme, getPreferredGroupColor, getLearningStageTheme } from '../../lib/groupTheme'
import type { ColumnId } from './types'
import { useGoalsContext } from './GoalsContext'

export interface GoalCardProps {
  goal: DailyGoal
  col: ColumnId
}

const GoalCardInner: React.FC<GoalCardProps> = ({ goal, col }) => {
  const ctx = useGoalsContext()
  if (!ctx) {
    throw new Error('GoalCard must be rendered within a GoalsContextProvider')
  }

  const isEditing = ctx.editingId === goal.id
  const isSelected = ctx.selectedGoalIds.has(goal.id)
  const isFocused = ctx.activeGoalId === goal.id
  const isSelectionMode = ctx.selectedGoalIds.size > 0

  const groupByTag = ctx.groupByTag
  const existingGroups = ctx.existingGroups
  const dayCutoffHour = ctx.dayCutoffHour

  const onPointerDown = ctx.onPointerDownCard
  const onSetActiveGoalId = ctx.setActiveGoalId
  const onToggleSelect = ctx.toggleSelectGoal
  const onSelectOnly = ctx.selectSingle
  const onStartEdit = ctx.startEdit
  const onSaveEdit = ctx.handleSaveEdit
  const onCancelEdit = ctx.cancelEdit
  const onContextMenu = (g: DailyGoal, x: number, y: number): void =>
    ctx.setContextMenu({ goal: g, x, y })

  const longPressTriggeredRef = ctx.longPressTriggeredRef
  const didDragOccurRef = ctx.didDragOccurRef

  const drag = ctx.drag
  const isDragging = Boolean(
    drag?.active &&
    ((drag.type === 'card' && drag.payload.id === goal.id) ||
      (drag.type === 'multi' && (drag.payload.sourceGoalIds?.includes(goal.id) ?? false)))
  )

  const hoverTarget = ctx.hoverTarget
  const dragActive = Boolean(drag?.active)
  const dragPayloadId = drag?.payload.id
  const dragSourceGoalIds = drag?.payload.sourceGoalIds

  const dropPosition =
    hoverTarget?.type === 'card' &&
    hoverTarget.targetGoalId === goal.id &&
    dragActive &&
    dragPayloadId !== goal.id &&
    !dragSourceGoalIds?.includes(goal.id)
      ? hoverTarget.position
      : null
  const isHoverTargetCard = Boolean(dropPosition)
  const todayDateStr = localDateStr(new Date(), dayCutoffHour)
  // If user carries an overdue task forward to today, the red status clears immediately
  const isCarriedToToday = Boolean(
    goal.carriedFromDate &&
    goal.date === todayDateStr &&
    goal.deadline &&
    goal.deadline.slice(0, 10) <= goal.carriedFromDate
  )
  const isOverdue =
    !isCarriedToToday && isDeadlineOverdue(goal.deadline, goal.status === 'done', dayCutoffHour)
  const isOverduePlanned = isOverdue && (col === 'planned' || goal.status === 'planned')
  const learningStage = goal.learningStage
  const theme = learningStage
    ? getLearningStageTheme(learningStage)
    : goal.groupTag
      ? getGroupTheme(goal.groupColor || getPreferredGroupColor(goal.groupTag))
      : null

  // Re-render immediately once an exact deadline time passes
  const [, setDeadlineTick] = React.useState(0)
  React.useEffect(() => {
    if (!goal.deadline || goal.status === 'done' || !goal.deadline.includes('T')) {
      return
    }
    const deadlineMs = new Date(goal.deadline).getTime()
    if (isNaN(deadlineMs)) return

    const now = Date.now()
    const diff = deadlineMs - now
    if (diff <= 0) {
      return
    }

    const timer = setTimeout(
      () => {
        setDeadlineTick((t) => t + 1)
      },
      Math.min(diff + 50, 2147483647)
    )

    return () => clearTimeout(timer)
  }, [goal.deadline, goal.status])

  if (isEditing) {
    return (
      <div key={goal.id} className="animate-in fade-in duration-150">
        <AddTaskCard
          key={goal.id}
          mode="edit"
          isExpanded={true}
          existingGroups={existingGroups}
          dayCutoffHour={dayCutoffHour}
          initialData={{
            title: goal.title,
            note: goal.note,
            deadline: goal.deadline,
            remindAt: goal.remindAt,
            repeat: goal.repeat,
            groupTag: goal.groupTag,
            groupColor: goal.groupColor,
            targetMinutes: goal.targetMinutes,
            goalType: goal.goalType || 'deep'
          }}
          submitLabel="Save"
          onAdd={(data) => onSaveEdit(goal, data)}
          onCancel={onCancelEdit}
        />
      </div>
    )
  }

  return (
    <div
      key={goal.id}
      data-task-card="true"
      data-goal-card="true"
      data-goal-id={goal.id}
      data-column={col}
      data-group-tag={goal.groupTag || ''}
      data-group-color={goal.groupColor || ''}
      tabIndex={0}
      role="article"
      aria-label={`Task: ${goal.title}`}
      onFocus={() => {
        onSetActiveGoalId(goal.id)
      }}
      onPointerDown={(e) => {
        onSetActiveGoalId(goal.id)
        onPointerDown(e, goal, col)
      }}
      onDragStart={(e) => e.preventDefault()}
      onClick={(e) => {
        onSetActiveGoalId(goal.id)
        if (longPressTriggeredRef?.current) {
          e.preventDefault()
          e.stopPropagation()
          return
        }
        if (didDragOccurRef?.current) {
          e.preventDefault()
          e.stopPropagation()
          return
        }
        // After select is showing (after hold, Shift+Click, etc.), user can click anywhere on the task card to toggle!
        if (isSelectionMode) {
          e.stopPropagation()
          onToggleSelect(goal.id, e.shiftKey, true)
          return
        }
      }}
      onDoubleClick={(e) => {
        e.stopPropagation()
        onStartEdit(goal)
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        if (!isSelected && isSelectionMode) {
          if (onSelectOnly) {
            onSelectOnly(goal.id)
          } else {
            onToggleSelect(goal.id, false, false)
          }
        }
        const menuWidth = 260
        const menuHeight = 460
        const margin = 8
        const viewportWidth = window.innerWidth || 1024
        const viewportHeight = window.innerHeight || 768
        const x = Math.max(margin, Math.min(e.clientX, viewportWidth - menuWidth - margin))
        const y = Math.max(margin, Math.min(e.clientY, viewportHeight - menuHeight - margin))
        onContextMenu(goal, x, y)
      }}
      title={
        isSelectionMode
          ? isSelected
            ? 'Click anywhere to deselect · Drag to move'
            : 'Click anywhere to select · Shift+Click for range · Drag to move'
          : 'Click to highlight · 1/2/3 to move column · Alt+↑/↓ to reorder · e to edit · Del to delete'
      }
      className={cn(
        'group relative rounded-xl border p-3 select-none touch-none transition-all duration-150 apple-card-elevated',
        isSelectionMode ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing',
        isSelected
          ? 'ring-2 ring-primary border-primary bg-primary/[0.04] dark:bg-primary/[0.08] shadow-apple-card'
          : isSelectionMode
            ? 'border-border/60 bg-card hover:border-primary/60 hover:bg-primary/[0.02] shadow-apple-subtle'
            : 'border-border/60 bg-card hover:border-border/90 hover:shadow-apple-card shadow-apple-subtle',
        isFocused &&
          !isSelected &&
          'ring-2 ring-primary ring-offset-2 ring-offset-background border-primary/70 bg-primary/[0.03] shadow-apple-card',
        isFocused &&
          isSelected &&
          'ring-2 ring-primary ring-offset-2 ring-offset-background border-primary bg-primary/[0.08] shadow-apple-card',
        isOverduePlanned &&
          !isSelected &&
          'border-apple-red/70 bg-apple-red/[0.04] dark:bg-apple-red/[0.08] shadow-[0_0_0_1px_rgba(239,68,68,0.25)] hover:border-apple-red',
        isDragging && 'opacity-25 pointer-events-none',
        theme && cn('hover:border-opacity-60'),
        isHoverTargetCard && 'ring-1 ring-sky-500/70 border-sky-500/70'
      )}
    >
      {/* Drop Insertion Bar (Before) */}
      {isHoverTargetCard && dropPosition === 'before' && (
        <div className="absolute -top-1.5 left-1 right-1 h-1 rounded-full bg-sky-500 shadow-[0_0_8px_rgba(56,189,248,0.9)] z-30 pointer-events-none flex items-center justify-between animate-in fade-in duration-75">
          <div className="h-2.5 w-2.5 rounded-full bg-sky-500 -ml-0.5 shadow-sm" />
          <div className="h-2.5 w-2.5 rounded-full bg-sky-500 -mr-0.5 shadow-sm" />
        </div>
      )}

      {/* Drop Insertion Bar (After) */}
      {isHoverTargetCard && dropPosition === 'after' && (
        <div className="absolute -bottom-1.5 left-1 right-1 h-1 rounded-full bg-sky-500 shadow-[0_0_8px_rgba(56,189,248,0.9)] z-30 pointer-events-none flex items-center justify-between animate-in fade-in duration-75">
          <div className="h-2.5 w-2.5 rounded-full bg-sky-500 -ml-0.5 shadow-sm" />
          <div className="h-2.5 w-2.5 rounded-full bg-sky-500 -mr-0.5 shadow-sm" />
        </div>
      )}
      {/* Indicator bar on left edge (red for overdue in planned, prominent R-Y-G bar for learning revision, or theme group color) */}
      {isOverduePlanned ? (
        <div className="absolute left-0 top-2 bottom-2 w-1.5 rounded-r-full bg-apple-red shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
      ) : learningStage && theme ? (
        <div
          className={cn(
            'absolute left-0 top-2 bottom-2 w-1.5 rounded-r-full shadow-xs',
            theme.barBg
          )}
          title={`Spaced Revision Stage ${learningStage}`}
        />
      ) : theme ? (
        <div className={cn('absolute left-0 top-2 bottom-2 w-1 rounded-r-full', theme.barBg)} />
      ) : null}

      <div className={cn('flex items-start gap-2', (theme || isOverduePlanned) && 'pl-1.5')}>
        {/* Multi-select Checkbox & Grip Handle */}
        <div className="flex items-center gap-1 shrink-0 mt-0.5">
          {/* Multi-select Checkbox: visible when selected, active, or on card hover */}
          <button
            type="button"
            role="checkbox"
            aria-checked={isSelected}
            aria-label={
              isSelected ? `Deselect task "${goal.title}"` : `Select task "${goal.title}"`
            }
            onClick={(e) => {
              e.stopPropagation()
              onToggleSelect(goal.id, e.shiftKey, true)
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className={cn(
              'h-4 w-4 rounded-md border flex items-center justify-center transition-all',
              isSelected
                ? 'bg-primary border-primary text-primary-foreground shadow-2xs opacity-100'
                : isSelectionMode
                  ? 'border-border/80 bg-background/80 opacity-60 hover:opacity-100 hover:border-primary/80 hover:bg-primary/10'
                  : 'border-border/80 bg-background/80 opacity-0 group-hover:opacity-100 hover:border-primary/80 hover:bg-primary/10 focus-visible:opacity-100'
            )}
            title={isSelected ? 'Deselect task' : 'Select task (Shift+click for range)'}
          >
            {isSelected && (
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </button>

          <div
            className="text-muted-foreground/30 group-hover:text-muted-foreground/60 shrink-0"
            aria-hidden="true"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
              <circle cx="3" cy="2.5" r="1" />
              <circle cx="7" cy="2.5" r="1" />
              <circle cx="3" cy="5" r="1" />
              <circle cx="7" cy="5" r="1" />
              <circle cx="3" cy="7.5" r="1" />
              <circle cx="7" cy="7.5" r="1" />
            </svg>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-1.5">
            <div
              className={cn(
                'text-[13px] font-medium leading-snug break-words flex-1',
                goal.status === 'done' ? 'text-muted-foreground line-through' : 'text-foreground',
                'line-clamp-2 group-hover:line-clamp-none transition-all'
              )}
            >
              {goal.title}
            </div>
          </div>

          {goal.note && (
            <div
              onPointerDown={(e) => {
                onSetActiveGoalId(goal.id)
                e.stopPropagation()
              }}
              className="mt-1 text-[11.5px] text-muted-foreground/80 line-clamp-2 group-hover:line-clamp-none break-words whitespace-pre-wrap leading-relaxed transition-all select-text cursor-text"
            >
              {goal.note}
            </div>
          )}

          {/* Tags & Metadata Badges */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
            {/* Learning Spaced Repetition Revision Badge */}
            {learningStage && theme && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-semibold text-[10.5px] border shadow-2xs',
                  theme.badgeBg,
                  theme.badgeText,
                  theme.badgeBorder
                )}
                title={`Spaced Revision: ${
                  learningStage === 1
                    ? '1st Day (Urgent Decay Window)'
                    : learningStage === 2
                      ? '7th Day (Intermediate Stabilization)'
                      : '30th Day (Long-Term Mastery)'
                }`}
              >
                <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', theme.dotClass)} />
                <span>
                  {learningStage === 1
                    ? 'Day 1 Revise'
                    : learningStage === 2
                      ? 'Day 7 Revise'
                      : 'Day 30 Revise'}
                </span>
                <span className="font-mono text-[9px] opacity-80 tracking-tighter ml-0.5 font-bold">
                  {learningStage === 1 ? '●○○' : learningStage === 2 ? '●●○' : '●●●'}
                </span>
              </span>
            )}

            {/* Initial #learning track badge before first revision */}
            {!learningStage && goal.groupTag?.toLowerCase() === 'learning' && (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-medium text-[10.5px] border shadow-2xs bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30"
                title="Learning track: Complete this session to schedule Day 1, Day 7, and Day 30 revisions"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0" />
                <span>#learning</span>
                <span className="text-[9.5px] opacity-75 font-mono">1/7/30d</span>
              </span>
            )}

            {/* Group Tag badge (only shown in flat list view, hidden when grouped since group header already shows tag name) */}
            {!groupByTag && !learningStage && goal.groupTag && theme && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-medium text-[10.5px] border shadow-2xs',
                  theme.badgeBg,
                  theme.badgeText,
                  theme.badgeBorder
                )}
                title={`Group: ${goal.groupTag}`}
              >
                <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', theme.dotClass)} />
                <span className="truncate max-w-[120px]">{goal.groupTag}</span>
              </span>
            )}

            {/* Goal Type Badge */}
            {goal.goalType === 'routine' ? (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-medium text-[10px] border shadow-2xs bg-secondary/80 text-muted-foreground border-border/60"
                title="Routine Task — music keeps your pace up"
              >
                <span>⚡ Routine</span>
              </span>
            ) : (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-medium text-[10px] border shadow-2xs bg-primary/10 text-primary border-primary/20"
                title="Deep Focus Task — silence or rain recommended"
              >
                <span>🎯 Deep</span>
              </span>
            )}

            {(goal.deadline || isOverduePlanned) && (
              <div className="inline-flex items-center gap-1.5 flex-wrap">
                <span
                  className={cn(
                    'inline-flex items-center gap-1 font-medium',
                    isOverdue ? 'text-apple-red font-semibold' : 'text-muted-foreground'
                  )}
                >
                  <svg
                    width="10"
                    height="10"
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
                  {isOverdue && 'Overdue · '}
                  {goal.deadline ? formatDeadlineBadge(goal.deadline) : `Due ${goal.date}`}
                </span>
                {isOverduePlanned && ctx.onCarryToToday && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      ctx.onCarryToToday?.(goal)
                    }}
                    className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-apple-red/10 text-apple-red hover:bg-apple-red/20 border border-apple-red/30 transition-colors shadow-2xs active:scale-95 cursor-pointer"
                    title="Carry overdue task to today"
                  >
                    Carry to Today
                  </button>
                )}
              </div>
            )}

            {goal.remindAt && (
              <span className="inline-flex items-center gap-1 text-apple-amber font-medium">
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <span>
                  {new Date(goal.remindAt).toLocaleTimeString(undefined, {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
              </span>
            )}

            {goal.repeat && (
              <span className="inline-flex items-center gap-1 text-apple-green font-medium capitalize">
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="m17 2 4 4-4 4" />
                  <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
                  <path d="m7 22-4-4 4-4" />
                  <path d="M21 13v1a4 4 0 0 1-4 4H3" />
                </svg>
                <span>{goal.repeat.replace(/_/g, ' ')}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Keyboard shortcut action strip on focused card */}
      {isFocused && (
        <div className="mt-2.5 pt-2 border-t border-border/40 flex items-center justify-between text-[10px] text-muted-foreground animate-in fade-in duration-100 font-mono">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-medium text-foreground/85 flex items-center gap-1">
              <span className="flex items-center gap-0.5">
                <kbd className="px-1 py-0.2 rounded bg-surface border border-border/70 text-[9.5px]">
                  1
                </kbd>
                <kbd className="px-1 py-0.2 rounded bg-surface border border-border/70 text-[9.5px]">
                  2
                </kbd>
                <kbd className="px-1 py-0.2 rounded bg-surface border border-border/70 text-[9.5px]">
                  3
                </kbd>
              </span>{' '}
              Move
            </span>
            <span className="text-border">·</span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.2 rounded bg-surface border border-border/70 text-[9.5px]">
                Alt+↑/↓
              </kbd>{' '}
              Reorder
            </span>
            <span className="text-border">·</span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.2 rounded bg-surface border border-border/70 text-[9.5px]">
                e
              </kbd>{' '}
              Edit
            </span>
            <span className="text-border">·</span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.2 rounded bg-surface border border-border/70 text-[9.5px]">
                Del
              </kbd>{' '}
              Delete
            </span>
          </div>
          <div className="flex items-center gap-1 text-[9.5px]">
            <kbd className="px-1 py-0.2 rounded bg-surface border border-border/70">Space</kbd>{' '}
            {isSelected ? 'Deselect' : 'Select'}
          </div>
        </div>
      )}
    </div>
  )
}

export const GoalCard = React.memo(GoalCardInner)
