import React from 'react'
import { DailyGoal } from '../../../../shared/types'
import {
  GROUP_THEMES,
  getGroupTheme,
  getUsedGroupColorsMap,
  GroupColorId
} from '../../lib/groupTheme'
import { cn } from '../../lib/utils'
import { useDialogA11y } from '../../lib/useDialogA11y'
import { COLUMNS } from './types'

export interface GoalsModalsProps {
  // Edit Group Modal
  editGroupModal: {
    groupTag: string
    newTag: string
    color: GroupColorId
    taskCount: number
    isUntagged?: boolean
    isNewGroup?: boolean
  } | null
  setEditGroupModal: React.Dispatch<React.SetStateAction<GoalsModalsProps['editGroupModal']>>
  onSaveEditGroup: () => Promise<void>

  // Delete Group Modal
  deleteGroupModal: {
    groupTag: string
    isUntagged: boolean
    taskCount: number
  } | null
  setDeleteGroupModal: React.Dispatch<React.SetStateAction<GoalsModalsProps['deleteGroupModal']>>
  onDissolveGroup: (groupTag: string) => Promise<void>
  onDeleteGroupWithTasks: (groupTag: string, isUntagged: boolean) => Promise<void>

  // Bulk Delete Modal
  bulkDeleteModalOpen: boolean
  setBulkDeleteModalOpen: (open: boolean) => void
  selectedCount: number
  onBulkDelete: () => Promise<void>

  // Shared
  dailyGoals: DailyGoal[]
  onMoveWholeGroup: (goals: DailyGoal[], status: DailyGoal['status']) => Promise<void>
  existingGroups?: { tag: string; color: GroupColorId }[]
}

export function GoalsModals({
  editGroupModal,
  setEditGroupModal,
  onSaveEditGroup,
  deleteGroupModal,
  setDeleteGroupModal,
  onDissolveGroup,
  onDeleteGroupWithTasks,
  bulkDeleteModalOpen,
  setBulkDeleteModalOpen,
  selectedCount,
  onBulkDelete,
  dailyGoals,
  onMoveWholeGroup,
  existingGroups
}: GoalsModalsProps): React.ReactElement | null {
  const editDialogRef = useDialogA11y<HTMLDivElement>({
    isOpen: Boolean(editGroupModal),
    onClose: () => setEditGroupModal(null),
    closeOnEscape: true
  })

  const deleteDialogRef = useDialogA11y<HTMLDivElement>({
    isOpen: Boolean(deleteGroupModal),
    onClose: () => setDeleteGroupModal(null),
    closeOnEscape: true
  })

  const bulkDialogRef = useDialogA11y<HTMLDivElement>({
    isOpen: bulkDeleteModalOpen,
    onClose: () => setBulkDeleteModalOpen(false),
    closeOnEscape: true
  })

  return (
    <>
      {/* --- INLINE MODAL: Edit Group (Rename, Color Theme, Bulk Move, Delete) --- */}
      {editGroupModal && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 backdrop-blur-xs animate-in fade-in duration-100"
          onClick={() => setEditGroupModal(null)}
        >
          <div
            ref={editDialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={
              editGroupModal.isNewGroup
                ? 'Create New Group'
                : editGroupModal.isUntagged
                  ? 'Name Untagged Group'
                  : 'Edit Group'
            }
            tabIndex={-1}
            className="w-[340px] rounded-2xl border border-border/80 bg-popover p-5 shadow-apple-popover text-[13px] space-y-4 focus-visible:outline-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-1 border-b border-border/50">
              <div className="font-semibold text-foreground text-[15px]">
                {editGroupModal.isNewGroup
                  ? 'Create New Group'
                  : editGroupModal.isUntagged
                    ? 'Name Untagged Group'
                    : 'Edit Group'}
              </div>
              {!editGroupModal.isNewGroup && (
                <span className="text-[11px] text-muted-foreground font-mono">
                  {editGroupModal.taskCount} {editGroupModal.taskCount === 1 ? 'task' : 'tasks'}
                </span>
              )}
            </div>

            {/* Group Name input */}
            <div className="space-y-1.5">
              <label className="text-[11.5px] font-medium text-muted-foreground">
                {editGroupModal.isNewGroup
                  ? 'Group Name'
                  : editGroupModal.isUntagged
                    ? 'Assign Group Name'
                    : 'Group Name'}
              </label>
              <input
                type="text"
                value={editGroupModal.newTag}
                onChange={(e) =>
                  setEditGroupModal((prev) => (prev ? { ...prev, newTag: e.target.value } : null))
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onSaveEditGroup()
                  if (e.key === 'Escape') setEditGroupModal(null)
                }}
                autoFocus
                placeholder={
                  editGroupModal.isUntagged
                    ? 'e.g. General, Inbox, Tasks...'
                    : 'e.g. Work, Health, Personal...'
                }
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              {editGroupModal.isUntagged && (
                <p className="text-[11px] text-muted-foreground">
                  Assigns this name and color to all {editGroupModal.taskCount} tasks currently in
                  Untagged.
                </p>
              )}
            </div>

            {/* Color Theme Selector */}
            {(() => {
              const usedColorsMap = getUsedGroupColorsMap(
                editGroupModal.isNewGroup ? undefined : editGroupModal.groupTag,
                existingGroups
              )
              return (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <label className="text-[11.5px] font-medium text-muted-foreground">
                        Color Theme
                      </label>
                      {usedColorsMap.size > 0 && (
                        <span className="text-[10px] text-muted-foreground/75 flex items-center gap-1 font-normal">
                          <svg
                            className="h-2.5 w-2.5 text-muted-foreground stroke-[2.5]"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                          <span>Crossed = Already used</span>
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-medium text-foreground">
                      {getGroupTheme(editGroupModal.color).name}
                    </span>
                  </div>
                  <div className="grid grid-cols-8 gap-1.5">
                    {GROUP_THEMES.map((theme) => {
                      const isSelected = editGroupModal.color === theme.id
                      const usedByGroup = usedColorsMap.get(theme.id)
                      const isUsed = Boolean(usedByGroup)

                      return (
                        <button
                          key={theme.id}
                          type="button"
                          disabled={isUsed}
                          onClick={() => {
                            if (!isUsed) {
                              setEditGroupModal((prev) =>
                                prev ? { ...prev, color: theme.id } : null
                              )
                            }
                          }}
                          title={
                            isUsed ? `${theme.name} (Already used by "${usedByGroup}")` : theme.name
                          }
                          className={cn(
                            'relative h-7 rounded-lg flex items-center justify-center border transition-all',
                            theme.headerBg,
                            theme.headerBorder,
                            isUsed
                              ? 'opacity-35 cursor-not-allowed hover:opacity-35'
                              : isSelected
                                ? 'ring-2 ring-primary scale-105 shadow-xs font-semibold cursor-pointer'
                                : 'opacity-80 hover:opacity-100 hover:scale-105 cursor-pointer'
                          )}
                        >
                          <div className="relative flex items-center justify-center">
                            <span
                              className={cn('h-3.5 w-3.5 rounded-full shadow-2xs', theme.dotClass)}
                            />
                            {isUsed && (
                              <svg
                                className="absolute inset-0 m-auto h-3 w-3 text-foreground/90 drop-shadow-xs pointer-events-none stroke-[3]"
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
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

            {/* Move All Tasks Status in this Group */}
            {!editGroupModal.isNewGroup && (
              <div className="space-y-1.5 pt-1">
                <label className="text-[11.5px] font-medium text-muted-foreground">
                  Move all tasks to
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {COLUMNS.map((col) => (
                    <button
                      key={col.id}
                      type="button"
                      onClick={async () => {
                        const matching = dailyGoals.filter((g) => {
                          if (editGroupModal.isUntagged) return !g.groupTag?.trim()
                          return (
                            g.groupTag &&
                            g.groupTag.trim().toLowerCase() ===
                              editGroupModal.groupTag.toLowerCase()
                          )
                        })
                        await onMoveWholeGroup(matching, col.status)
                        setEditGroupModal(null)
                      }}
                      className="flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg border border-border/80 bg-surface hover:bg-secondary text-[11px] font-medium text-foreground transition-all"
                    >
                      <span className={cn('h-1.5 w-1.5 rounded-full', col.accent)} />
                      <span>{col.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Footer Buttons */}
            <div className="flex items-center justify-between pt-2 border-t border-border/50">
              {!editGroupModal.isNewGroup ? (
                <button
                  type="button"
                  onClick={() => {
                    const gTag = editGroupModal.groupTag
                    const count = editGroupModal.taskCount
                    const isUntagged = Boolean(editGroupModal.isUntagged)
                    setEditGroupModal(null)
                    setDeleteGroupModal({ groupTag: gTag, isUntagged, taskCount: count })
                  }}
                  className="text-[11.5px] text-apple-red hover:underline flex items-center gap-1"
                >
                  <span>Delete group</span>
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditGroupModal(null)}
                  className="px-3 py-1.5 rounded-lg border border-border text-[12px] text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onSaveEditGroup}
                  disabled={!editGroupModal.newTag.trim()}
                  className="px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold text-[12px] disabled:opacity-50 shadow-xs"
                >
                  {editGroupModal.isNewGroup
                    ? 'Create'
                    : editGroupModal.isUntagged
                      ? 'Apply'
                      : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- INLINE MODAL: Delete Group Confirmation --- */}
      {deleteGroupModal && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 backdrop-blur-xs animate-in fade-in duration-100"
          onClick={() => setDeleteGroupModal(null)}
        >
          <div
            ref={deleteDialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={`Delete ${deleteGroupModal.groupTag}`}
            tabIndex={-1}
            className="w-[360px] rounded-2xl border border-border/80 bg-popover p-5 shadow-apple-popover text-[13px] space-y-4 focus-visible:outline-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-xl bg-apple-red/10 text-apple-red flex items-center justify-center shrink-0">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M3 6h18" />
                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-foreground text-[15px]">
                  Delete &ldquo;{deleteGroupModal.groupTag}&rdquo;
                </h3>
                <p className="text-[12px] text-muted-foreground mt-0.5">
                  This group contains{' '}
                  <span className="font-medium text-foreground">{deleteGroupModal.taskCount}</span>{' '}
                  {deleteGroupModal.taskCount === 1 ? 'task' : 'tasks'}. What would you like to do?
                </p>
              </div>
            </div>

            <div className="space-y-2 pt-1">
              {!deleteGroupModal.isUntagged && (
                <button
                  type="button"
                  onClick={async () => {
                    await onDissolveGroup(deleteGroupModal.groupTag)
                    setDeleteGroupModal(null)
                  }}
                  className="w-full text-left rounded-xl border border-border/80 bg-surface p-3 hover:bg-secondary transition-colors group flex items-start gap-3"
                >
                  <div className="h-7 w-7 rounded-lg bg-secondary text-muted-foreground group-hover:text-foreground flex items-center justify-center shrink-0 mt-0.5">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="m15 15 6 6m-6-6v4.8m0-4.8h4.8M9 9 3 3m6 6V4.2M9 9H4.2" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-semibold text-foreground text-[12.5px]">
                      Delete Group Tag Only
                    </div>
                    <div className="text-[11.5px] text-muted-foreground">
                      Remove the &ldquo;{deleteGroupModal.groupTag}&rdquo; tag. All{' '}
                      {deleteGroupModal.taskCount} tasks will be kept as Untagged.
                    </div>
                  </div>
                </button>
              )}

              <button
                type="button"
                onClick={async () => {
                  await onDeleteGroupWithTasks(
                    deleteGroupModal.groupTag,
                    deleteGroupModal.isUntagged
                  )
                  setDeleteGroupModal(null)
                }}
                className="w-full text-left rounded-xl border border-apple-red/30 bg-apple-red/5 p-3 hover:bg-apple-red/10 transition-colors group flex items-start gap-3"
              >
                <div className="h-7 w-7 rounded-lg bg-apple-red/15 text-apple-red flex items-center justify-center shrink-0 mt-0.5">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M3 6h18" />
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                  </svg>
                </div>
                <div>
                  <div className="font-semibold text-apple-red text-[12.5px]">
                    Delete Group & All {deleteGroupModal.taskCount} Tasks
                  </div>
                  <div className="text-[11.5px] text-apple-red/80">
                    Permanently delete this group and all tasks inside it.
                  </div>
                </div>
              </button>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setDeleteGroupModal(null)}
                className="px-3 py-1.5 rounded-lg border border-border text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- INLINE MODAL: Bulk Delete Confirmation --- */}
      {bulkDeleteModalOpen && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 backdrop-blur-xs animate-in fade-in duration-100"
          onClick={() => setBulkDeleteModalOpen(false)}
        >
          <div
            ref={bulkDialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={`Delete ${selectedCount} Tasks`}
            tabIndex={-1}
            className="w-[360px] rounded-2xl border border-border/80 bg-popover p-5 shadow-apple-popover text-[13px] space-y-4 focus-visible:outline-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-xl bg-apple-red/10 text-apple-red flex items-center justify-center shrink-0">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M3 6h18" />
                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-foreground text-[15px]">
                  Delete {selectedCount} {selectedCount === 1 ? 'Task' : 'Tasks'}
                </h3>
                <p className="text-[12px] text-muted-foreground mt-0.5 leading-relaxed">
                  Are you sure you want to permanently delete {selectedCount}{' '}
                  {selectedCount === 1 ? 'task' : 'tasks'}? This action cannot be undone.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/50">
              <button
                type="button"
                onClick={() => setBulkDeleteModalOpen(false)}
                className="px-3 py-1.5 rounded-lg border border-border text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onBulkDelete}
                className="px-3.5 py-1.5 rounded-lg bg-apple-red text-white font-semibold text-[12px] hover:bg-apple-red/90 transition-colors shadow-xs"
              >
                Delete {selectedCount} {selectedCount === 1 ? 'Task' : 'Tasks'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
