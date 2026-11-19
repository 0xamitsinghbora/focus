import React, { useState, memo } from 'react'
import { DailyGoal } from '../../../shared/types'
import { Panel } from './DashboardLayout'
import { cn, isDeadlineOverdue, formatDeadlineBadge } from '../lib/utils'
import { getGroupTheme, getPreferredGroupColor } from '../lib/groupTheme'

interface DailyGoalsPanelProps {
  goals: DailyGoal[]
  plannedGoals?: DailyGoal[]
  completedGoals?: DailyGoal[]
  onPromoteGoal?: (goal: DailyGoal) => Promise<void>
  onUpdateGoal: (goal: DailyGoal) => Promise<void>
  onDeleteGoal?: (goal: DailyGoal) => Promise<void>
  goalLoggedMinutesMap?: Record<string, number>
  onOpenPlanner?: () => void
}

function DailyGoalsPanelComponent({
  goals,
  plannedGoals = [],
  completedGoals = [],
  onPromoteGoal,
  onUpdateGoal,
  onDeleteGoal,
  goalLoggedMinutesMap = {},
  onOpenPlanner
}: DailyGoalsPanelProps): React.JSX.Element {
  // Task list & planning state
  const [activeTab, setActiveTab] = useState<'today' | 'planned' | 'done'>('today')

  const isCurrentTabEmpty =
    (activeTab === 'today' && goals.length === 0) ||
    (activeTab === 'planned' && plannedGoals.length === 0) ||
    (activeTab === 'done' && completedGoals.length === 0)

  const handleCompleteGoal = async (goal: DailyGoal): Promise<void> => {
    await onUpdateGoal({
      ...goal,
      status: 'done',
      completedAt: goal.completedAt || new Date().toISOString()
    })
  }

  const handleReopenGoal = async (goal: DailyGoal): Promise<void> => {
    await onUpdateGoal({
      ...goal,
      status: 'in_progress',
      completedAt: undefined
    })
  }

  const handleMoveToToday = async (goal: DailyGoal): Promise<void> => {
    if (onPromoteGoal) {
      await onPromoteGoal(goal)
    } else {
      await onUpdateGoal({ ...goal, status: 'in_progress' })
    }
  }

  return (
    <Panel className="p-5 flex flex-col h-full bg-card gap-4 overflow-hidden">
      {/* Main Task List & Planning Section */}
      <div className="flex-1 flex flex-col min-h-0 pt-0">
        <div className="flex items-center justify-between gap-3 mb-4 shrink-0">
          <div>
            <h2 className="text-[15px] font-semibold tracking-[-0.022em] text-foreground">
              Today&apos;s Tasks
            </h2>
            <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground/90 tracking-[-0.005em]">
              Tasks in progress and planned for today
            </p>
          </div>

          <div className="inline-flex h-8 items-center rounded-xl bg-secondary/60 dark:bg-surface/70 p-0.5 border border-border/40 text-[11.5px] shadow-2xs backdrop-blur-xs">
            <button
              type="button"
              onClick={() => setActiveTab('today')}
              className={cn(
                'px-2.5 py-1 rounded-lg transition-all duration-150 cursor-pointer font-medium leading-none tracking-[-0.01em]',
                activeTab === 'today'
                  ? 'bg-card text-foreground font-semibold shadow-xs ring-1 ring-border/30'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('planned')}
              className={cn(
                'px-2.5 py-1 rounded-lg transition-all duration-150 cursor-pointer font-medium leading-none tracking-[-0.01em]',
                activeTab === 'planned'
                  ? 'bg-card text-foreground font-semibold shadow-xs ring-1 ring-border/30'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Planned
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('done')}
              className={cn(
                'px-2.5 py-1 rounded-lg transition-all duration-150 cursor-pointer font-medium leading-none tracking-[-0.01em]',
                activeTab === 'done'
                  ? 'bg-card text-foreground font-semibold shadow-xs ring-1 ring-border/30'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Done
            </button>
          </div>
        </div>

        {/* Task lists / Empty state */}
        <div
          className={cn(
            'flex-1 min-h-0',
            isCurrentTabEmpty
              ? 'flex flex-col'
              : 'overflow-y-auto custom-scrollbar space-y-2 pr-0.5'
          )}
        >
          {activeTab === 'today' &&
            (goals.length === 0 ? (
              <div className="flex-1 min-h-0 flex flex-col items-center justify-center text-center px-4 py-8 rounded-xl border border-dashed border-border/60 bg-surface/30 select-none">
                <div className="h-10 w-10 rounded-2xl bg-surface border border-border/70 flex items-center justify-center text-muted-foreground/60 mb-2.5 shadow-2xs">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </svg>
                </div>
                <span className="text-[13.5px] font-semibold text-foreground/90 block">
                  No tasks scheduled for today
                </span>
                <p className="text-[12px] leading-relaxed text-muted-foreground mt-1 max-w-70">
                  Plan tasks in the Planner or pull from your planned list to start focusing.
                </p>
                {(plannedGoals.length > 0 || onOpenPlanner) && (
                  <div className="flex flex-wrap items-center justify-center gap-2 mt-3.5">
                    {plannedGoals.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setActiveTab('planned')}
                        className="px-3.5 py-1.5 rounded-xl border border-border/80 bg-surface hover:bg-secondary text-[11.5px] font-medium text-foreground shadow-2xs active:scale-95 transition-all cursor-pointer"
                      >
                        View {plannedGoals.length} Planned Tasks →
                      </button>
                    )}
                    {onOpenPlanner && (
                      <button
                        type="button"
                        onClick={onOpenPlanner}
                        className="px-3.5 py-1.5 rounded-xl border border-border/80 bg-surface hover:bg-secondary text-[11.5px] font-medium text-foreground shadow-2xs active:scale-95 transition-all cursor-pointer"
                      >
                        Open Planner →
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              goals.map((goal) => {
                const theme = goal.groupTag
                  ? getGroupTheme(goal.groupColor || getPreferredGroupColor(goal.groupTag))
                  : null
                const loggedMinutes = goalLoggedMinutesMap[goal.id] || 0

                return (
                  <div
                    key={goal.id}
                    role="article"
                    tabIndex={0}
                    aria-label={`Task: ${goal.title}`}
                    className="group flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border transition-all text-xs shadow-apple-subtle apple-card-elevated border-border/60 bg-card hover:border-border/90 hover:shadow-apple-card"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleCompleteGoal(goal)
                        }}
                        className="h-4.5 w-4.5 rounded-full border border-border/80 hover:border-apple-green flex items-center justify-center shrink-0 transition-all cursor-pointer hover:bg-apple-green/10"
                        title="Mark complete"
                        aria-label={`Mark task "${goal.title}" complete`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-foreground font-medium text-[13px] tracking-[-0.01em]">
                            {goal.title}
                          </span>
                          {goal.groupTag && theme && (
                            <span
                              className={cn(
                                'px-1.5 py-0.2 rounded border text-[10px] font-semibold shrink-0 shadow-2xs',
                                theme.badgeBg,
                                theme.badgeText,
                                theme.badgeBorder
                              )}
                            >
                              {goal.groupTag}
                            </span>
                          )}
                        </div>

                        {/* Logged time */}
                        {loggedMinutes > 0 && (
                          <div className="flex items-center gap-1.5 mt-0.5 text-[10.5px] tabular-nums text-muted-foreground">
                            <span className="text-apple-green font-semibold">
                              {loggedMinutes}m logged
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {onDeleteGoal && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            onDeleteGoal(goal)
                          }}
                          className="opacity-0 group-hover:opacity-60 hover:opacity-100! p-1 text-muted-foreground hover:text-apple-red transition-all cursor-pointer rounded"
                          title="Delete task"
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
                        </button>
                      )}
                    </div>
                  </div>
                )
              })
            ))}

          {activeTab === 'planned' &&
            (plannedGoals.length === 0 ? (
              <div className="flex-1 min-h-0 flex flex-col items-center justify-center text-center px-4 py-8 rounded-xl border border-dashed border-border/60 bg-surface/30 select-none">
                <span className="text-[13px] font-medium text-foreground/80">No planned tasks</span>
                <p className="text-[11.5px] text-muted-foreground mt-1 max-w-65">
                  Schedule upcoming items here to stay ahead on your work.
                </p>
                {onOpenPlanner && (
                  <button
                    type="button"
                    onClick={onOpenPlanner}
                    className="mt-3.5 px-3.5 py-1.5 rounded-xl border border-border/80 bg-surface hover:bg-secondary text-[11.5px] font-medium text-foreground shadow-2xs active:scale-95 transition-all cursor-pointer"
                  >
                    Open Planner →
                  </button>
                )}
              </div>
            ) : (
              plannedGoals.map((goal) => {
                const loggedMinutes = goalLoggedMinutesMap[goal.id] || 0
                const isOverdue = isDeadlineOverdue(goal.deadline, false)
                return (
                  <div
                    key={goal.id}
                    className={cn(
                      'group flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border transition-all text-xs shadow-apple-subtle',
                      isOverdue
                        ? 'border-apple-red/70 bg-apple-red/4 dark:bg-apple-red/8'
                        : 'border-border/70 bg-card hover:border-border'
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className="min-w-0 flex-1">
                        <span className="truncate text-foreground font-medium text-[12.5px] block">
                          {goal.title}
                        </span>
                        <div className="flex items-center gap-2 mt-0.5">
                          {loggedMinutes > 0 && (
                            <span className="text-[10px] tabular-nums text-muted-foreground">
                              {loggedMinutes}m logged
                            </span>
                          )}
                          {isOverdue && (
                            <span className="text-[10px] text-apple-red font-semibold">
                              Overdue · {goal.deadline ? formatDeadlineBadge(goal.deadline) : `Due ${goal.date}`}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleMoveToToday(goal)}
                        className="px-2.5 py-1 rounded-lg border border-border/80 bg-surface hover:bg-secondary text-[11px] font-medium text-foreground transition-colors cursor-pointer"
                        title="Move to Today's tasks"
                      >
                        To Today
                      </button>
                      {onDeleteGoal && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            onDeleteGoal(goal)
                          }}
                          className="opacity-0 group-hover:opacity-60 hover:opacity-100! p-1 text-muted-foreground hover:text-apple-red transition-all cursor-pointer rounded"
                          title="Delete task"
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
                        </button>
                      )}
                    </div>
                  </div>
                )
              })
            ))}

          {activeTab === 'done' &&
            (completedGoals.length === 0 ? (
              <div className="flex-1 min-h-0 flex flex-col items-center justify-center text-center px-4 py-8 rounded-xl border border-dashed border-border/60 bg-surface/30 select-none">
                <span className="text-[13px] font-medium text-foreground/80">
                  No completed tasks yet
                </span>
                <p className="text-[11.5px] text-muted-foreground mt-1 max-w-65">
                  Tasks you complete today will be archived and listed here.
                </p>
              </div>
            ) : (
              completedGoals.map((goal) => {
                const loggedMinutes = goalLoggedMinutesMap[goal.id] || 0
                return (
                  <div
                    key={goal.id}
                    className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border border-border/40 bg-surface/30 text-xs transition-all"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => handleReopenGoal(goal)}
                        className="h-4 w-4 rounded-full bg-apple-green text-white flex items-center justify-center shrink-0 cursor-pointer"
                        title="Reopen task"
                      >
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </button>
                      <div className="min-w-0 flex-1">
                        <span className="truncate text-muted-foreground line-through font-medium text-[12.5px] block">
                          {goal.title}
                        </span>
                        {loggedMinutes > 0 && (
                          <span className="text-[10px] tabular-nums text-apple-green font-semibold">
                            {loggedMinutes}m logged
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {onDeleteGoal && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            onDeleteGoal(goal)
                          }}
                          className="p-1 text-muted-foreground/60 hover:text-apple-red transition-all cursor-pointer rounded"
                          title="Delete task"
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
                        </button>
                      )}
                    </div>
                  </div>
                )
              })
            ))}
        </div>
      </div>
    </Panel>
  )
}

export const DailyGoalsPanel = memo(DailyGoalsPanelComponent)
