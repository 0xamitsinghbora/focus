import React, { useState, useEffect } from 'react'
import {
  GoalBreakdownResult,
  TaskBreakdownItem,
  GoalComplexityLevel
} from '../../../../shared/types'
import { useDialogA11y } from '../../lib/useDialogA11y'
import { cn } from '../../lib/utils'

export interface GoalBreakdownModalProps {
  isOpen: boolean
  onClose: () => void
  breakdownResult: GoalBreakdownResult | null
  isLoading?: boolean
  onApplyBreakdown: (tasks: TaskBreakdownItem[], groupTag?: string) => Promise<void> | void
  onAdoptStep1?: (firstTask: TaskBreakdownItem) => void
  existingGoalTitle?: string
}

export function GoalBreakdownModal({
  isOpen,
  onClose,
  breakdownResult,
  isLoading = false,
  onApplyBreakdown,
  onAdoptStep1,
  existingGoalTitle
}: GoalBreakdownModalProps): React.JSX.Element | null {
  const dialogRef = useDialogA11y<HTMLDivElement>({
    isOpen,
    onClose,
    closeOnEscape: true
  })

  const [tasks, setTasks] = useState<TaskBreakdownItem[]>([])
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set())
  const [groupTag, setGroupTag] = useState<string>('')
  const [showQuestions, setShowQuestions] = useState<boolean>(true)

  useEffect(() => {
    if (breakdownResult?.suggestedTasks) {
      setTasks(breakdownResult.suggestedTasks)
      setSelectedTaskIds(new Set(breakdownResult.suggestedTasks.map((t) => t.id)))
      setGroupTag(breakdownResult.suggestedGroupTag || '')
    }
  }, [breakdownResult])

  if (!isOpen) return null

  const analysis = breakdownResult?.analysis
  const complexity = analysis?.complexity || 'vague'
  const targetTitle = existingGoalTitle || breakdownResult?.originalTitle || 'Task'

  const toggleSelectTask = (id: string): void => {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        if (next.size > 1) {
          next.delete(id)
        }
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleUpdateTaskTitle = (id: string, newTitle: string): void => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, title: newTitle } : t)))
  }

  const handleUpdateTaskMinutes = (id: string, mins: number): void => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, targetMinutes: mins } : t)))
  }

  const handleDeleteTask = (id: string): void => {
    if (tasks.length <= 1) return
    setTasks((prev) => prev.filter((t) => t.id !== id))
    setSelectedTaskIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  const handleAddCustomTask = (): void => {
    const newItem: TaskBreakdownItem = {
      id: `custom-${Date.now()}`,
      title: 'New focused sprint',
      targetMinutes: 25,
      goalType: 'deep',
      rationale: 'Additional decomposed focus milestone',
      order: tasks.length + 1
    }
    setTasks((prev) => [...prev, newItem])
    setSelectedTaskIds((prev) => new Set([...prev, newItem.id]))
  }

  const selectedTasks = tasks.filter((t) => selectedTaskIds.has(t.id))
  const totalSelectedMinutes = selectedTasks.reduce((acc, t) => acc + (t.targetMinutes || 0), 0)

  const handleApply = async (): Promise<void> => {
    if (selectedTasks.length === 0) return
    await onApplyBreakdown(selectedTasks, groupTag.trim() || undefined)
    onClose()
  }

  const handleAdoptFirst = (): void => {
    if (tasks.length > 0 && onAdoptStep1) {
      onAdoptStep1(tasks[0])
      onClose()
    }
  }

  const getBadgeDetails = (level: GoalComplexityLevel): { label: string; classes: string } => {
    switch (level) {
      case 'vague_and_too_big':
        return {
          label: 'Vague & Oversized Scope',
          classes: 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30'
        }
      case 'vague':
        return {
          label: 'Ambiguous Finish Line',
          classes: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30'
        }
      case 'too_big':
        return {
          label: 'Too Big to Digest in 1 Session',
          classes: 'bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30'
        }
      case 'digestible':
      default:
        return {
          label: 'Digestible Milestone',
          classes: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
        }
    }
  }

  const badge = getBadgeDetails(complexity)

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150 select-none"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Goal Breakdown AI"
        className="relative w-full max-w-2xl max-h-[92vh] flex flex-col rounded-2xl border border-border/80 bg-card text-card-foreground shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/60 bg-surface/40">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500/20 to-amber-500/20 border border-purple-500/30 text-purple-600 dark:text-purple-400 shadow-2xs">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z" />
              </svg>
            </div>
            <div>
              <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-foreground flex items-center gap-2">
                Goal Breakdown AI
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                  Sprint Architect
                </span>
              </h2>
              <p className="text-[11.5px] text-muted-foreground/90">
                Challenging ambiguity & decomposing into high-momentum sprints
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors cursor-pointer"
            aria-label="Close"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mb-3" />
              <p className="text-sm font-medium text-foreground">Analyzing task boundaries...</p>
              <p className="text-xs text-muted-foreground mt-0.5">Evaluating scope and clarity</p>
            </div>
          ) : (
            <>
              {/* Target Task Summary Card */}
              <div className="rounded-xl border border-border/70 bg-surface/50 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Target Goal
                  </span>
                  <span
                    className={cn(
                      'inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-medium border shadow-2xs',
                      badge.classes
                    )}
                  >
                    {badge.label}
                  </span>
                </div>
                <div className="text-[14px] font-semibold text-foreground tracking-[-0.01em]">
                  &ldquo;{targetTitle}&rdquo;
                </div>

                {/* Score Indicators */}
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/40 text-[11.5px]">
                  <div>
                    <div className="flex justify-between items-center text-muted-foreground mb-1">
                      <span>Clarity Assessment</span>
                      <span className="font-mono font-semibold text-foreground">
                        {analysis?.clarityScore ?? 50}/100
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all duration-300',
                          (analysis?.clarityScore ?? 50) < 50
                            ? 'bg-rose-500'
                            : (analysis?.clarityScore ?? 50) < 75
                              ? 'bg-amber-500'
                              : 'bg-emerald-500'
                        )}
                        style={{ width: `${analysis?.clarityScore ?? 50}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center text-muted-foreground mb-1">
                      <span>Scope Magnitude</span>
                      <span className="font-mono font-semibold text-foreground">
                        {analysis?.scopeScore ?? 4}/10{' '}
                        <span className="text-[10px] text-muted-foreground font-normal">
                          {(analysis?.scopeScore ?? 4) >= 7 ? '(Epic)' : '(Digestible)'}
                        </span>
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all duration-300',
                          (analysis?.scopeScore ?? 4) >= 7
                            ? 'bg-purple-500'
                            : (analysis?.scopeScore ?? 4) >= 5
                              ? 'bg-amber-500'
                              : 'bg-emerald-500'
                        )}
                        style={{
                          width: `${Math.min(100, ((analysis?.scopeScore ?? 4) / 10) * 100)}%`
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* AI Challenge & Probing Questions */}
              <div className="rounded-xl border border-purple-500/20 bg-purple-500/[0.03] dark:bg-purple-500/[0.06] p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[12px] font-semibold text-purple-700 dark:text-purple-300">
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="16" x2="12" y2="12" />
                      <line x1="12" y1="8" x2="12.01" y2="8" />
                    </svg>
                    <span>The Focus Challenge: {analysis?.challengeHeading}</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowQuestions((prev) => !prev)}
                    className="text-[10.5px] text-purple-600 dark:text-purple-400 hover:underline cursor-pointer"
                  >
                    {showQuestions ? 'Hide questions' : 'Show questions'}
                  </button>
                </div>

                <p className="text-[12px] text-foreground/85 leading-relaxed">
                  {analysis?.challengeCritique}
                </p>

                {showQuestions &&
                  analysis?.probingQuestions &&
                  analysis.probingQuestions.length > 0 && (
                    <div className="pt-2 border-t border-purple-500/15 space-y-1">
                      <span className="text-[10.5px] font-semibold text-purple-700/80 dark:text-purple-300/80 uppercase tracking-wider block">
                        Clarifying Probing Questions:
                      </span>
                      <ul className="space-y-1 text-[11.5px] text-muted-foreground pl-3 list-disc">
                        {analysis.probingQuestions.map((q, idx) => (
                          <li key={idx} className="leading-snug">
                            {q}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
              </div>

              {/* Proposed Breakdown Sprints */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-[13px] font-semibold text-foreground">
                      Actionable Focus Sprints
                    </h3>
                    <p className="text-[11px] text-muted-foreground">
                      {selectedTasks.length} of {tasks.length} sprints selected · ~
                      {totalSelectedMinutes}m total
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddCustomTask}
                    className="inline-flex items-center gap-1 text-[11.5px] font-medium text-primary hover:underline cursor-pointer"
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    <span>Add step</span>
                  </button>
                </div>

                {/* Subtask items list */}
                <div className="space-y-2">
                  {tasks.map((task, index) => {
                    const isChecked = selectedTaskIds.has(task.id)
                    return (
                      <div
                        key={task.id}
                        className={cn(
                          'group rounded-xl border p-3 transition-all duration-150',
                          isChecked
                            ? 'border-border/80 bg-card shadow-xs'
                            : 'border-border/40 bg-surface/30 opacity-60'
                        )}
                      >
                        <div className="flex items-start gap-2.5">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleSelectTask(task.id)}
                            className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer accent-primary"
                          />

                          <div className="flex-1 min-w-0 space-y-1.5">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[10px] font-semibold text-muted-foreground/80 shrink-0">
                                Step {index + 1}
                              </span>
                              <input
                                type="text"
                                value={task.title}
                                onChange={(e) => handleUpdateTaskTitle(task.id, e.target.value)}
                                className="flex-1 bg-transparent text-[12.5px] font-medium text-foreground outline-none border-b border-transparent hover:border-border/60 focus:border-primary transition-colors py-0.5"
                              />
                            </div>

                            {task.rationale && (
                              <p className="text-[11px] text-muted-foreground/80 leading-relaxed italic">
                                &rarr; {task.rationale}
                              </p>
                            )}

                            {/* Duration pills & Goal Type */}
                            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                              <span className="text-[10px] text-muted-foreground mr-1">Time:</span>
                              {[15, 25, 35, 45, 60].map((mins) => (
                                <button
                                  key={mins}
                                  type="button"
                                  onClick={() => handleUpdateTaskMinutes(task.id, mins)}
                                  className={cn(
                                    'px-1.5 py-0.5 rounded text-[10px] font-mono font-medium transition-all cursor-pointer',
                                    task.targetMinutes === mins
                                      ? 'bg-primary text-primary-foreground font-semibold shadow-2xs'
                                      : 'bg-secondary/70 hover:bg-secondary text-muted-foreground hover:text-foreground'
                                  )}
                                >
                                  {mins}m
                                </button>
                              ))}

                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface border border-border/50 text-muted-foreground font-medium ml-auto">
                                {task.goalType === 'deep' ? '🧠 Deep Focus' : '📋 Routine'}
                              </span>

                              {tasks.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteTask(task.id)}
                                  className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive transition-all cursor-pointer rounded"
                                  title="Remove sprint"
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
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-t border-border/60 bg-surface/40">
          <div>
            {onAdoptStep1 && tasks.length > 0 && (
              <button
                type="button"
                onClick={handleAdoptFirst}
                className="px-3 py-1.5 rounded-xl border border-border/70 hover:bg-secondary text-[11.5px] font-medium text-foreground transition-all cursor-pointer shadow-2xs active:scale-95"
                title="Adopt Step 1 as your primary focus task now"
              >
                🎯 Adopt Step 1 Only
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-xl text-[12px] font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={selectedTasks.length === 0 || isLoading}
              className="px-4 py-1.5 rounded-xl bg-primary text-primary-foreground text-[12px] font-semibold shadow-sm hover:opacity-90 disabled:opacity-40 transition-all cursor-pointer active:scale-95 flex items-center gap-1.5"
            >
              <span>Add {selectedTasks.length} Sprints</span>
              <span className="font-mono text-[11px] opacity-80">({totalSelectedMinutes}m)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
