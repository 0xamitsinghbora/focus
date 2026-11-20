import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { DailyGoal } from '../../../../shared/types'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { useToast } from '../../lib/useToast'
import { getGroupTheme, GroupColorId } from '../../lib/groupTheme'
import { useDialogA11y } from '../../lib/useDialogA11y'

interface TrashArchiveModalProps {
  isOpen: boolean
  onClose: () => void
  onGoalRestored?: (goal: DailyGoal) => void
}

const PAGE_SIZE = 50

export function TrashArchiveModal({
  isOpen,
  onClose,
  onGoalRestored
}: TrashArchiveModalProps): React.JSX.Element | null {
  const toast = useToast()
  const toastRef = useRef(toast)
  useEffect(() => {
    toastRef.current = toast
  }, [toast])

  const [deletedGoals, setDeletedGoals] = useState<DailyGoal[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [confirmEmptyTrashOpen, setConfirmEmptyTrashOpen] = useState(false)
  const [goalToDeletePermanently, setGoalToDeletePermanently] = useState<DailyGoal | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const loadDeletedGoals = useCallback(async (query?: string) => {
    if (!window.api?.goals?.getDeleted) return
    setIsLoading(true)
    try {
      const q = typeof query === 'string' ? query.trim() || undefined : undefined
      const res = q
        ? await window.api.goals.getDeleted(PAGE_SIZE, 0, q)
        : await window.api.goals.getDeleted(PAGE_SIZE, 0)
      if (Array.isArray(res)) {
        setDeletedGoals(res)
        setTotalCount(res.length)
      } else if (res && Array.isArray(res.goals)) {
        setDeletedGoals(res.goals)
        setTotalCount(typeof res.totalCount === 'number' ? res.totalCount : res.goals.length)
      } else {
        setDeletedGoals([])
        setTotalCount(0)
      }
    } catch (err) {
      console.error('Failed to load deleted goals:', err)
      toastRef.current.error('Could not load trash items.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const handleLoadMore = async (): Promise<void> => {
    if (isLoadingMore || !window.api?.goals?.getDeleted || deletedGoals.length >= totalCount) return
    setIsLoadingMore(true)
    try {
      const q = searchQuery.trim() || undefined
      const currentOffset = deletedGoals.length
      const res = q
        ? await window.api.goals.getDeleted(PAGE_SIZE, currentOffset, q)
        : await window.api.goals.getDeleted(PAGE_SIZE, currentOffset)
      if (Array.isArray(res)) {
        setDeletedGoals((prev) => {
          const ids = new Set(prev.map((g) => g.id))
          const additions = res.filter((g) => !ids.has(g.id))
          const next = [...prev, ...additions]
          setTotalCount((currentTotal) => Math.max(currentTotal, next.length))
          return next
        })
      } else if (res && Array.isArray(res.goals)) {
        setDeletedGoals((prev) => {
          const ids = new Set(prev.map((g) => g.id))
          const additions = res.goals.filter((g) => !ids.has(g.id))
          return [...prev, ...additions]
        })
        if (typeof res.totalCount === 'number') {
          setTotalCount(res.totalCount)
        }
      }
    } catch (err) {
      console.error('Failed to load more deleted goals:', err)
      toastRef.current.error('Could not load more trash items.')
    } finally {
      setIsLoadingMore(false)
    }
  }

  const isFirstMountRef = useRef(true)
  useEffect(() => {
    if (!isOpen) {
      isFirstMountRef.current = true
      return
    }
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false
      setSearchQuery('')
      loadDeletedGoals()
      return
    }
    const timer = setTimeout(() => {
      loadDeletedGoals(searchQuery)
    }, 200)
    return () => clearTimeout(timer)
  }, [isOpen, searchQuery, loadDeletedGoals])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        if (confirmEmptyTrashOpen) {
          setConfirmEmptyTrashOpen(false)
          return
        }
        if (goalToDeletePermanently) {
          setGoalToDeletePermanently(null)
          return
        }
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose, confirmEmptyTrashOpen, goalToDeletePermanently])

  const handleRestore = async (goal: DailyGoal): Promise<void> => {
    if (!window.api?.goals?.restore) return
    setRestoringId(goal.id)
    try {
      const restored = await window.api.goals.restore(goal.id)
      if (restored) {
        setDeletedGoals((prev) => prev.filter((g) => g.id !== goal.id))
        setTotalCount((prev) => Math.max(0, prev - 1))
        toast.success(`Task "${restored.title}" restored.`, 'Task Restored')
        onGoalRestored?.(restored)
      }
    } catch (err) {
      console.error('Failed to restore goal:', err)
      toast.error('Could not restore task.')
    } finally {
      setRestoringId(null)
    }
  }

  const handleEmptyTrash = async (): Promise<void> => {
    if (!window.api?.goals?.emptyTrash) return
    setIsDeleting(true)
    try {
      const res = await window.api.goals.emptyTrash()
      setDeletedGoals([])
      setTotalCount(0)
      setConfirmEmptyTrashOpen(false)
      toast.success(
        res?.count ? `Permanently removed ${res.count} tasks.` : 'Trash emptied.',
        'Trash Emptied'
      )
    } catch (err) {
      console.error('Failed to empty trash:', err)
      toast.error('Could not empty trash.')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleHardDelete = async (goal: DailyGoal): Promise<void> => {
    if (!window.api?.goals?.hardDelete) return
    setIsDeleting(true)
    try {
      const res = await window.api.goals.hardDelete(goal.id)
      if (res.success) {
        setDeletedGoals((prev) => prev.filter((g) => g.id !== goal.id))
        setTotalCount((prev) => Math.max(0, prev - 1))
        setGoalToDeletePermanently(null)
        toast.success(`Task "${goal.title}" permanently deleted.`, 'Task Deleted')
      }
    } catch (err) {
      console.error('Failed to permanently delete task:', err)
      toast.error('Could not permanently delete task.')
    } finally {
      setIsDeleting(false)
    }
  }

  const filteredGoals = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return deletedGoals
    return deletedGoals.filter(
      (g) =>
        g.title.toLowerCase().includes(q) ||
        g.date.toLowerCase().includes(q) ||
        (g.groupTag && g.groupTag.toLowerCase().includes(q)) ||
        (g.note && g.note.toLowerCase().includes(q))
    )
  }, [deletedGoals, searchQuery])

  const dialogRef = useDialogA11y<HTMLDivElement>({
    isOpen,
    onClose,
    closeOnEscape: true
  })

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-9999 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-150 p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="trash-archive-title"
        tabIndex={-1}
        className="w-full max-w-2xl rounded-2xl border border-border/80 bg-popover p-6 shadow-2xl backdrop-blur-xl animate-in zoom-in-95 duration-150 flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-border/60 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center justify-center text-destructive">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 6h18" />
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                <line x1="10" x2="10" y1="11" y2="17" />
                <line x1="14" x2="14" y1="11" y2="17" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3
                  id="trash-archive-title"
                  className="text-[16px] font-bold tracking-tight text-foreground"
                >
                  Trash & Archived Tasks
                </h3>
                <span
                  className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                  title={`${totalCount} total tasks in trash`}
                >
                  {totalCount > deletedGoals.length
                    ? `${deletedGoals.length} of ${totalCount}`
                    : totalCount}
                </span>
              </div>
              <p className="text-[12px] text-muted-foreground">
                Recover previously deleted tasks back to your workspace.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {totalCount > 0 && (
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={() => setConfirmEmptyTrashOpen(true)}
                className="h-8 px-2.5 text-xs gap-1.5 shadow-2xs cursor-pointer"
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
                  <path d="M3 6h18" />
                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                </svg>
                <span>Empty Trash</span>
              </Button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors cursor-pointer"
              aria-label="Close"
            >
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
                <line x1="18" x2="6" y1="6" y2="18" />
                <line x1="6" x2="18" y1="6" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Filter Input */}
        <div className="py-3 shrink-0">
          <Input
            placeholder="Search deleted tasks by title, date, or tag..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 text-[13px]"
          />
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[220px]">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <p className="text-xs">Loading deleted tasks...</p>
            </div>
          ) : filteredGoals.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="opacity-40"
              >
                <path d="M3 6h18" />
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              </svg>
              <p className="text-sm font-medium">
                {searchQuery ? 'No matching deleted tasks' : 'Trash is empty'}
              </p>
              <p className="text-xs opacity-70">
                {searchQuery
                  ? 'Try a different search query'
                  : 'Tasks you delete will appear here for recovery'}
              </p>
            </div>
          ) : (
            filteredGoals.map((goal) => {
              const groupTheme = goal.groupColor
                ? getGroupTheme((goal.groupColor as GroupColorId) || 'slate')
                : null
              const isRestoring = restoringId === goal.id

              return (
                <div
                  key={goal.id}
                  className="group flex items-center justify-between gap-3 p-3 rounded-xl border border-border/60 bg-surface/50 hover:bg-secondary/40 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-foreground truncate">
                        {goal.title}
                      </span>
                      {goal.groupTag && groupTheme && (
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10.5px] font-medium border ${groupTheme.badgeBg} ${groupTheme.badgeText} ${groupTheme.badgeBorder}`}
                        >
                          {goal.groupTag}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                      <span>Date: {goal.date}</span>
                      {goal.deletedAt && (
                        <span>
                          Deleted: {new Date(goal.deletedAt).toLocaleDateString()}{' '}
                          {new Date(goal.deletedAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isRestoring || isDeleting}
                      onClick={() => handleRestore(goal)}
                      className="gap-1.5 text-xs h-8 px-3 border-border hover:border-primary/50 hover:bg-primary/10 hover:text-primary transition-all cursor-pointer"
                    >
                      {isRestoring ? (
                        <div className="h-3 w-3 animate-spin rounded-full border border-primary border-t-transparent" />
                      ) : (
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
                          <polyline points="1 4 1 10 7 10" />
                          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                        </svg>
                      )}
                      <span>Restore</span>
                    </Button>

                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isRestoring || isDeleting}
                      onClick={() => setGoalToDeletePermanently(goal)}
                      className="h-8 px-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                      title="Delete permanently"
                      aria-label={`Permanently delete "${goal.title}"`}
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
                        <path d="M3 6h18" />
                        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                      </svg>
                    </Button>
                  </div>
                </div>
              )
            })
          )}

          {deletedGoals.length < totalCount && (
            <div className="pt-2 pb-1 flex flex-col items-center gap-1.5 text-center">
              {searchQuery && (
                <p className="text-[11px] text-muted-foreground">
                  Showing matches from {deletedGoals.length} loaded tasks (
                  {totalCount - deletedGoals.length} older tasks not searched yet).
                </p>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isLoadingMore}
                onClick={handleLoadMore}
                className="gap-2 text-xs"
              >
                {isLoadingMore ? (
                  <>
                    <div className="h-3 w-3 animate-spin rounded-full border border-primary border-t-transparent" />
                    <span>Loading more...</span>
                  </>
                ) : (
                  <>
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
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                    <span>Load More Tasks ({totalCount - deletedGoals.length} remaining)</span>
                  </>
                )}
              </Button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-4 mt-2 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground shrink-0">
          <span>Press Esc to close</span>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Done
          </Button>
        </div>

        {/* Confirm Empty Trash Modal */}
        {confirmEmptyTrashOpen && (
          <div
            className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/50 backdrop-blur-xs animate-in fade-in duration-100 p-4"
            onClick={() => setConfirmEmptyTrashOpen(false)}
          >
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="confirm-empty-trash-title"
              aria-describedby="confirm-empty-trash-desc"
              className="w-full max-w-sm rounded-2xl border border-border/80 bg-popover p-5 shadow-apple-popover text-[13px] space-y-4 focus-visible:outline-none"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
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
                    <path d="M3 6h18" />
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <h4
                    id="confirm-empty-trash-title"
                    className="font-semibold text-foreground text-[15px]"
                  >
                    Empty Trash?
                  </h4>
                  <p
                    id="confirm-empty-trash-desc"
                    className="text-[12px] text-muted-foreground mt-0.5 leading-relaxed"
                  >
                    Are you sure you want to permanently delete all {totalCount} tasks in the trash
                    {totalCount > deletedGoals.length
                      ? ` (including ${totalCount - deletedGoals.length} unloaded tasks)`
                      : ''}
                    ? This will permanently purge all deleted records. This action cannot be undone.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1 border-t border-border/40">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirmEmptyTrashOpen(false)}
                  disabled={isDeleting}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleEmptyTrash}
                  disabled={isDeleting}
                  className="gap-1.5"
                >
                  {isDeleting && (
                    <div className="h-3 w-3 animate-spin rounded-full border border-white border-t-transparent" />
                  )}
                  <span>Empty Trash</span>
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Confirm Delete Single Goal Modal */}
        {goalToDeletePermanently && (
          <div
            className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/50 backdrop-blur-xs animate-in fade-in duration-100 p-4"
            onClick={() => setGoalToDeletePermanently(null)}
          >
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="confirm-delete-goal-title"
              aria-describedby="confirm-delete-goal-desc"
              className="w-full max-w-sm rounded-2xl border border-border/80 bg-popover p-5 shadow-apple-popover text-[13px] space-y-4 focus-visible:outline-none"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
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
                    <path d="M3 6h18" />
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <h4
                    id="confirm-delete-goal-title"
                    className="font-semibold text-foreground text-[15px]"
                  >
                    Delete Task Permanently?
                  </h4>
                  <p
                    id="confirm-delete-goal-desc"
                    className="text-[12px] text-muted-foreground mt-0.5 leading-relaxed truncate"
                  >
                    Permanently delete &ldquo;{goalToDeletePermanently.title}&rdquo;? This cannot be
                    undone.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1 border-t border-border/40">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setGoalToDeletePermanently(null)}
                  disabled={isDeleting}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleHardDelete(goalToDeletePermanently)}
                  disabled={isDeleting}
                  className="gap-1.5"
                >
                  {isDeleting && (
                    <div className="h-3 w-3 animate-spin rounded-full border border-white border-t-transparent" />
                  )}
                  <span>Delete Permanently</span>
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
