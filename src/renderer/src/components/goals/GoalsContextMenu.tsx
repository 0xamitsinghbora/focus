import React, { useState } from 'react'
import { DailyGoal } from '../../../../shared/types'
import {
  GROUP_THEMES,
  getGroupTheme,
  getRandomUnusedColor,
  getSavedGroupColors,
  getUsedGroupColorsMap,
  GroupColorId,
  saveGroupColor
} from '../../lib/groupTheme'
import { cn, isDeadlineOverdue } from '../../lib/utils'
import { ColumnId, getReschedulePresetDates } from './types'

export interface GoalsContextMenuProps {
  contextMenu: { goal: DailyGoal; x: number; y: number } | null
  setContextMenu: (menu: GoalsContextMenuProps['contextMenu']) => void
  selectedGoalIds: Set<string>

  // Bulk operations
  onBulkMoveStatus: (status: ColumnId) => Promise<void>
  onBulkReschedule: (deadline?: string) => Promise<void>
  onBulkAssignGroup: (tag?: string, color?: string) => Promise<void>
  onBulkDelete: () => Promise<void>
  onClearSelection: () => void

  // Single card operations
  onToggleSelect: (goalId: string, isShift: boolean, isToggle: boolean) => void
  onStartEdit: (goal: DailyGoal) => void
  onMoveGoal: (goal: DailyGoal, status: DailyGoal['status']) => Promise<void>
  onDeleteGoal: (goal: DailyGoal) => Promise<void>
  onAssignTaskGroup: (goal: DailyGoal, tag?: string, color?: string) => Promise<void>
  onCarryToToday?: (goal: DailyGoal) => Promise<void>
  onRescheduleGoal?: (goal: DailyGoal, deadline?: string) => Promise<void>
  onBreakdownGoal?: (goal: DailyGoal) => void
  dayCutoffHour?: number

  // Group data
  existingGroups: { tag: string; color: string }[]
}

export function GoalsContextMenu({
  contextMenu,
  setContextMenu,
  selectedGoalIds,
  onBulkMoveStatus,
  onBulkReschedule,
  onBulkAssignGroup,
  onBulkDelete,
  onClearSelection,
  onToggleSelect,
  onStartEdit,
  onMoveGoal,
  onDeleteGoal,
  onAssignTaskGroup,
  onCarryToToday,
  onRescheduleGoal,
  onBreakdownGoal,
  dayCutoffHour = 0,
  existingGroups
}: GoalsContextMenuProps): React.ReactElement | null {
  // Group creation submenu state (managed internally)
  const [showGroupAssignMenu, setShowGroupAssignMenu] = useState(false)
  const [showRescheduleMenu, setShowRescheduleMenu] = useState(false)
  const [isCreatingGroupInMenu, setIsCreatingGroupInMenu] = useState(false)
  const [newGroupInput, setNewGroupInput] = useState('')
  const [newGroupColor, setNewGroupColor] = useState<GroupColorId>(() => {
    const saved = getSavedGroupColors()
    return getRandomUnusedColor(Object.values(saved))
  })

  const menuRef = React.useRef<HTMLDivElement>(null)
  const [adjustedPos, setAdjustedPos] = useState<{ x: number; y: number } | null>(null)

  React.useLayoutEffect(() => {
    if (!contextMenu) {
      setAdjustedPos(null)
      return
    }
    const el = menuRef.current
    if (el) {
      const rect = el.getBoundingClientRect()
      let x = contextMenu.x
      let y = contextMenu.y
      const margin = 8
      if (rect.bottom > window.innerHeight - margin) {
        y = Math.max(margin, window.innerHeight - rect.height - margin)
      }
      if (rect.right > window.innerWidth - margin) {
        x = Math.max(margin, window.innerWidth - rect.width - margin)
      }
      if (x !== contextMenu.x || y !== contextMenu.y) {
        setAdjustedPos({ x, y })
      } else {
        setAdjustedPos(null)
      }
    }
  }, [contextMenu, showGroupAssignMenu])

  if (!contextMenu) return null

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Task Actions"
      data-portal="true"
      style={{ left: adjustedPos?.x ?? contextMenu.x, top: adjustedPos?.y ?? contextMenu.y }}
      className="fixed z-9999 min-w-[220px] max-w-[260px] max-h-[calc(100vh-16px)] overflow-y-auto custom-scrollbar rounded-xl border border-border/80 bg-popover/95 p-1.5 shadow-apple-popover backdrop-blur-md animate-in fade-in zoom-in-95 duration-100 select-none text-[12.5px] apple-popover"
      onClick={(e) => e.stopPropagation()}
    >
      {selectedGoalIds.size > 1 && selectedGoalIds.has(contextMenu.goal.id) ? (
        /* Bulk Context Menu */
        <>
          <div className="px-2.5 py-1 text-[11px] font-semibold text-muted-foreground border-b border-border/40 mb-1 flex items-center justify-between">
            <span>{selectedGoalIds.size} tasks selected</span>
            <button
              type="button"
              onClick={() => {
                onClearSelection()
                setContextMenu(null)
              }}
              className="text-[10px] text-muted-foreground hover:text-foreground font-mono"
            >
              Deselect (Esc)
            </button>
          </div>

          {/* Quick status moves */}
          <button
            type="button"
            onClick={() => {
              onBulkMoveStatus('planned')
              setContextMenu(null)
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-foreground hover:bg-secondary transition-colors"
          >
            <div className="h-2 w-2 rounded-full bg-apple-red shrink-0" />
            <span>Move {selectedGoalIds.size} to Planned</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onBulkMoveStatus('in_progress')
              setContextMenu(null)
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-foreground hover:bg-secondary transition-colors"
          >
            <div className="h-2 w-2 rounded-full bg-apple-amber shrink-0" />
            <span>Move {selectedGoalIds.size} to In Progress</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onBulkMoveStatus('done')
              setContextMenu(null)
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-foreground hover:bg-secondary transition-colors"
          >
            <div className="h-2 w-2 rounded-full bg-apple-green shrink-0" />
            <span>Move {selectedGoalIds.size} to Completed</span>
          </button>

          <div className="my-1 border-t border-border/50" />

          {/* Bulk Reschedule action in context menu */}
          <button
            type="button"
            onClick={() => {
              onBulkReschedule()
              setContextMenu(null)
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-foreground hover:bg-secondary transition-colors"
          >
            <svg
              width="13"
              height="13"
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
            <span>Reschedule {selectedGoalIds.size} tasks...</span>
          </button>

          {/* Bulk Group in context menu */}
          <button
            type="button"
            onClick={() => {
              onBulkAssignGroup()
              setContextMenu(null)
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-foreground hover:bg-secondary transition-colors"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" />
              <path d="M7 7h.01" />
            </svg>
            <span>Group {selectedGoalIds.size} tasks...</span>
          </button>

          <div className="my-1 border-t border-border/50" />

          {/* Bulk Delete in context menu */}
          <button
            type="button"
            onClick={() => {
              onBulkDelete()
              setContextMenu(null)
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-apple-red hover:bg-apple-red/10 transition-colors"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M3 6h18" />
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
            <span className="font-medium">Delete {selectedGoalIds.size} tasks</span>
          </button>
        </>
      ) : (
        /* Single Card Context Menu */
        (() => {
          const isCardOverdue = isDeadlineOverdue(
            contextMenu.goal.deadline,
            contextMenu.goal.status === 'done',
            dayCutoffHour
          )
          const presets = getReschedulePresetDates(dayCutoffHour)

          return (
            <>
              {/* Select task toggle */}
              <button
                type="button"
                onClick={() => {
                  onToggleSelect(contextMenu.goal.id, false, true)
                  setContextMenu(null)
                }}
                className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-foreground hover:bg-secondary transition-colors"
              >
                <div className="flex items-center gap-2">
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>
                    {selectedGoalIds.has(contextMenu.goal.id) ? 'Deselect task' : 'Select task'}
                  </span>
                </div>
                <span className="text-[10px] text-muted-foreground font-mono">Shift/Cmd</span>
              </button>

              {/* Edit option */}
              <button
                type="button"
                onClick={() => {
                  onStartEdit(contextMenu.goal)
                  setContextMenu(null)
                }}
                className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-foreground hover:bg-secondary transition-colors"
              >
                <div className="flex items-center gap-2">
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                  </svg>
                  <span className="font-medium">Edit task</span>
                </div>
                <span className="text-[10px] text-muted-foreground font-mono">Double-click</span>
              </button>

              {/* Goal Breakdown AI option */}
              {onBreakdownGoal && (
                <button
                  type="button"
                  onClick={() => {
                    onBreakdownGoal(contextMenu.goal)
                    setContextMenu(null)
                  }}
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-foreground hover:bg-secondary transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z" />
                    </svg>
                    <span className="font-medium">AI Challenge & Breakdown...</span>
                  </div>
                  <span className="text-[10px] text-purple-600 dark:text-purple-400 font-mono font-medium">
                    AI
                  </span>
                </button>
              )}

              {/* Quick Carry to Today for overdue task */}
              {isCardOverdue && onCarryToToday && (
                <button
                  type="button"
                  onClick={() => {
                    onCarryToToday(contextMenu.goal)
                    setContextMenu(null)
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-apple-red hover:bg-apple-red/10 transition-colors font-medium"
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
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                  <span>Carry / Move to Today</span>
                </button>
              )}

              {/* Reschedule Single Task */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setShowRescheduleMenu((v) => !v)
                    setShowGroupAssignMenu(false)
                  }}
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-foreground hover:bg-secondary transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <svg
                      width="13"
                      height="13"
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
                    <span className="font-medium">Reschedule</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {showRescheduleMenu ? '▾' : '›'}
                  </span>
                </button>

                {showRescheduleMenu && (
                  <div
                    className="mt-1 mb-1 rounded-lg border border-border/80 bg-surface/95 backdrop-blur-md p-1.5 space-y-1 shadow-lg"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onRescheduleGoal?.(contextMenu.goal, presets.today)
                        setContextMenu(null)
                      }}
                      className="flex w-full items-center justify-between rounded-md px-2 py-1 text-[11.5px] text-foreground hover:bg-secondary transition-colors"
                    >
                      <span>Today</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onRescheduleGoal?.(contextMenu.goal, presets.tomorrow)
                        setContextMenu(null)
                      }}
                      className="flex w-full items-center justify-between rounded-md px-2 py-1 text-[11.5px] text-foreground hover:bg-secondary transition-colors"
                    >
                      <span>Tomorrow</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onRescheduleGoal?.(contextMenu.goal, presets.thisWeekend)
                        setContextMenu(null)
                      }}
                      className="flex w-full items-center justify-between rounded-md px-2 py-1 text-[11.5px] text-foreground hover:bg-secondary transition-colors"
                    >
                      <span>This Weekend</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onRescheduleGoal?.(contextMenu.goal, presets.nextWeek)
                        setContextMenu(null)
                      }}
                      className="flex w-full items-center justify-between rounded-md px-2 py-1 text-[11.5px] text-foreground hover:bg-secondary transition-colors"
                    >
                      <span>Next Week</span>
                    </button>
                    {contextMenu.goal.deadline && (
                      <button
                        type="button"
                        onClick={() => {
                          onRescheduleGoal?.(contextMenu.goal, undefined)
                          setContextMenu(null)
                        }}
                        className="flex w-full items-center justify-between rounded-md px-2 py-1 text-[11.5px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                      >
                        <span>Clear Due Date</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Assign / Change Group */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setShowGroupAssignMenu((v) => !v)
                    setIsCreatingGroupInMenu(false)
                    setNewGroupInput('')
                  }}
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-foreground hover:bg-secondary transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" />
                      <path d="M7 7h.01" />
                    </svg>
                    <span className="font-medium">Group Tag</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {showGroupAssignMenu ? '▾' : '›'}
                  </span>
                </button>

                {showGroupAssignMenu && (
                  <div
                    className="mt-1 mb-1 rounded-lg border border-border/80 bg-surface/95 backdrop-blur-md p-1.5 space-y-1 shadow-lg max-h-64 overflow-y-auto custom-scrollbar"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {contextMenu.goal.groupTag && (
                      <button
                        type="button"
                        onClick={() => onAssignTaskGroup(contextMenu.goal, undefined)}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-[11.5px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
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
                        <span>Remove from group</span>
                      </button>
                    )}
                    {existingGroups.map((g) => {
                      const theme = getGroupTheme(g.color)
                      const isCurrent =
                        contextMenu.goal.groupTag?.toLowerCase() === g.tag.toLowerCase()
                      return (
                        <button
                          key={g.tag}
                          type="button"
                          onClick={() => onAssignTaskGroup(contextMenu.goal, g.tag, g.color)}
                          className={cn(
                            'flex w-full items-center justify-between rounded-md px-2 py-1 text-[11.5px] transition-colors',
                            isCurrent
                              ? 'font-semibold text-foreground bg-secondary/80'
                              : 'text-foreground/80 hover:bg-secondary'
                          )}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span className={cn('h-2 w-2 rounded-full shrink-0', theme.dotClass)} />
                            <span className="truncate">{g.tag}</span>
                          </div>
                          {isCurrent && (
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              className="text-primary shrink-0"
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </button>
                      )
                    })}

                    <div className="my-1 border-t border-border/50" />

                    {/* Add new group option */}
                    {!isCreatingGroupInMenu ? (
                      <button
                        type="button"
                        onClick={() => {
                          setIsCreatingGroupInMenu(true)
                          setNewGroupInput('')
                          const saved = getSavedGroupColors()
                          setNewGroupColor(getRandomUnusedColor(Object.values(saved)))
                        }}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[11.5px] font-medium text-primary hover:bg-secondary transition-colors"
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
                        <span>Add New Group</span>
                      </button>
                    ) : (
                      <div className="p-1.5 space-y-2 rounded-lg bg-secondary/60 border border-border/60">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              'h-2.5 w-2.5 rounded-full shrink-0',
                              getGroupTheme(newGroupColor).dotClass
                            )}
                          />
                          <input
                            type="text"
                            autoFocus
                            value={newGroupInput}
                            onChange={(e) => setNewGroupInput(e.target.value)}
                            placeholder="New group name..."
                            className="w-full bg-background border border-border/80 rounded-md px-2 py-1 text-[11.5px] text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                const clean = newGroupInput.trim()
                                if (clean) {
                                  saveGroupColor(clean, newGroupColor)
                                  onAssignTaskGroup(contextMenu.goal, clean, newGroupColor)
                                  setIsCreatingGroupInMenu(false)
                                }
                              } else if (e.key === 'Escape') {
                                e.preventDefault()
                                setIsCreatingGroupInMenu(false)
                              }
                            }}
                          />
                        </div>

                        {/* Color picker swatches */}
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
                                    if (!isUsed) setNewGroupColor(t.id)
                                  }}
                                  className={cn(
                                    'relative h-4 w-4 rounded-full flex items-center justify-center transition-transform',
                                    t.dotClass,
                                    isUsed
                                      ? 'opacity-30 cursor-not-allowed'
                                      : newGroupColor === t.id
                                        ? 'ring-2 ring-primary ring-offset-1 ring-offset-background scale-110 cursor-pointer'
                                        : 'opacity-75 hover:opacity-100 hover:scale-105 cursor-pointer'
                                  )}
                                  title={
                                    isUsed ? `${t.name} (Already used by "${usedByGroup}")` : t.name
                                  }
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
                            onClick={() => setIsCreatingGroupInMenu(false)}
                            className="px-2 py-0.5 rounded text-[10.5px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={!newGroupInput.trim()}
                            onClick={() => {
                              const clean = newGroupInput.trim()
                              if (clean) {
                                saveGroupColor(clean, newGroupColor)
                                onAssignTaskGroup(contextMenu.goal, clean, newGroupColor)
                                setIsCreatingGroupInMenu(false)
                              }
                            }}
                            className="px-2.5 py-1 rounded text-[10.5px] font-semibold bg-primary text-primary-foreground disabled:opacity-50 hover:bg-primary/90 transition-colors shadow-2xs"
                          >
                            Create &amp; Assign
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="my-1 border-t border-border/50" />

              {/* Quick status moves */}
              {contextMenu.goal.status !== 'planned' && (
                <button
                  type="button"
                  onClick={() => {
                    onMoveGoal(contextMenu.goal, 'planned')
                    setContextMenu(null)
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-foreground hover:bg-secondary transition-colors"
                >
                  <div className="h-2 w-2 rounded-full bg-apple-red" />
                  <span>Move to Planned</span>
                </button>
              )}

              {contextMenu.goal.status !== 'in_progress' && (
                <button
                  type="button"
                  onClick={() => {
                    onMoveGoal(contextMenu.goal, 'in_progress')
                    setContextMenu(null)
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-foreground hover:bg-secondary transition-colors"
                >
                  <div className="h-2 w-2 rounded-full bg-apple-amber" />
                  <span>Move to In Progress</span>
                </button>
              )}

              {contextMenu.goal.status !== 'done' && (
                <button
                  type="button"
                  onClick={() => {
                    onMoveGoal(contextMenu.goal, 'done')
                    setContextMenu(null)
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-foreground hover:bg-secondary transition-colors"
                >
                  <div className="h-2 w-2 rounded-full bg-apple-green" />
                  <span>Mark as Completed</span>
                </button>
              )}

              <div className="my-1 border-t border-border/50" />

              {/* Delete option */}
              <button
                type="button"
                onClick={() => {
                  onDeleteGoal(contextMenu.goal)
                  setContextMenu(null)
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-apple-red hover:bg-apple-red/10 transition-colors"
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M3 6h18" />
                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                </svg>
                <span className="font-medium">Delete task</span>
              </button>
            </>
          )
        })()
      )}
    </div>
  )
}
