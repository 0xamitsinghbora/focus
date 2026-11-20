import { useEffect } from 'react'
import { DailyGoal } from '../../../../shared/types'
import { getPreferredGroupColor, getGroupTheme, GroupColorId } from '../../lib/groupTheme'
import { cn } from '../../lib/utils'
import { ColumnId } from './types'

interface GoalsGroupMenuProps {
  menu: {
    groupTag: string
    sourceCol: ColumnId
    goals: DailyGoal[]
    isUntagged?: boolean
    x: number
    y: number
  } | null
  onClose?: () => void
  onEditGroup: (
    groupTag: string,
    isUntagged: boolean,
    taskCount: number,
    color: GroupColorId
  ) => void
  onChangeColor: (groupTag: string, x: number, y: number) => void
  onAddNew: () => void
  onMoveAll: (goals: DailyGoal[], status: DailyGoal['status']) => Promise<void>
  onDissolve: (groupTag: string) => void
  onDelete: (groupTag: string, isUntagged: boolean, taskCount: number) => void
  existingGroups: { tag: string; color: GroupColorId }[]
}

export function GoalsGroupMenu({
  menu,
  onClose,
  onEditGroup,
  onChangeColor,
  onAddNew,
  onMoveAll,
  onDissolve,
  onDelete
}: GoalsGroupMenuProps): React.JSX.Element | null {
  useEffect(() => {
    if (!menu) return
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose?.()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [menu, onClose])

  if (!menu) return null

  return (
    <>
      <div
        className="fixed inset-0 z-[9998]"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault()
          onClose?.()
        }}
      />
      <div
        style={{ left: menu.x, top: menu.y }}
        className="fixed z-9999 min-w-[225px] w-max max-w-[260px] rounded-xl border border-border/80 bg-popover/95 p-1.5 shadow-apple-popover backdrop-blur-md animate-in fade-in zoom-in-95 duration-100 select-none text-[12px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-2 py-1 text-[11px] font-semibold text-muted-foreground truncate border-b border-border/40 mb-1 flex items-center justify-between">
          <span className="truncate">Group: {menu.groupTag}</span>
          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full text-[10px] font-semibold tabular-nums leading-none bg-secondary text-foreground/90 border border-border/70 shadow-2xs">
            {menu.goals.length}
          </span>
        </div>

        {!menu.isUntagged ? (
          <>
            {/* Edit Group (Name, Color Theme, Bulk Status) */}
            <button
              type="button"
              onClick={() => {
                const color = getPreferredGroupColor(menu.groupTag)
                onEditGroup(menu.groupTag, false, menu.goals.length, color)
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-foreground hover:bg-secondary transition-colors whitespace-nowrap"
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
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
              </svg>
              <span className="font-medium">Edit Group</span>
            </button>

            {/* Change Color */}
            <button
              type="button"
              onClick={() => onChangeColor(menu.groupTag, menu.x, menu.y)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-foreground hover:bg-secondary transition-colors whitespace-nowrap"
            >
              <span
                className={cn(
                  'h-2.5 w-2.5 rounded-full shrink-0',
                  getGroupTheme(getPreferredGroupColor(menu.groupTag)).dotClass
                )}
              />
              <span>Change Color Theme</span>
            </button>

            {/* Add New Group */}
            <button
              type="button"
              onClick={() => onAddNew()}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-foreground hover:bg-secondary transition-colors whitespace-nowrap"
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
              <span className="font-medium">Add New Group</span>
            </button>

            <div className="my-1 border-t border-border/40" />

            {/* Move whole group across columns */}
            {menu.sourceCol !== 'planned' && (
              <>
                <button
                  type="button"
                  onClick={() => onMoveAll(menu.goals, 'planned')}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-foreground hover:bg-secondary transition-colors whitespace-nowrap"
                >
                  <div className="h-2 w-2 rounded-full bg-apple-red shrink-0" />
                  <span>Move group to Planned</span>
                </button>
                <div className="my-1 border-t border-border/40" />
              </>
            )}

            {/* Ungroup Tasks (Delete Group Tag, keep tasks) */}
            <button
              type="button"
              onClick={() => onDissolve(menu.groupTag)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-foreground hover:bg-secondary transition-colors whitespace-nowrap"
              title="Remove group tag from all tasks so they become Untagged"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="shrink-0"
              >
                <path d="m15 15 6 6m-6-6v4.8m0-4.8h4.8M9 9 3 3m6 6V4.2M9 9H4.2" />
              </svg>
              <span>Ungroup Tasks (Keep tasks)</span>
            </button>

            {/* Delete Group & Tasks */}
            <button
              type="button"
              onClick={() => onDelete(menu.groupTag, false, menu.goals.length)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-apple-red hover:bg-apple-red/10 transition-colors whitespace-nowrap"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="shrink-0"
              >
                <path d="M3 6h18" />
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
              </svg>
              <span className="font-semibold">Delete Group</span>
            </button>
          </>
        ) : (
          <>
            {/* Name / Edit Untagged Group */}
            <button
              type="button"
              onClick={() => onEditGroup('Untagged', true, menu.goals.length, 'blue')}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-foreground hover:bg-secondary transition-colors whitespace-nowrap"
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
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
              </svg>
              <span className="font-medium">Name Untagged Group</span>
            </button>

            {/* Change Color */}
            <button
              type="button"
              onClick={() => onChangeColor('Untagged', menu.x, menu.y)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-foreground hover:bg-secondary transition-colors whitespace-nowrap"
            >
              <span className="h-2.5 w-2.5 rounded-full bg-slate-500 shrink-0" />
              <span>Change Color Theme</span>
            </button>

            {/* Add New Group */}
            <button
              type="button"
              onClick={() => onAddNew()}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-foreground hover:bg-secondary transition-colors whitespace-nowrap"
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
              <span className="font-medium">Add New Group</span>
            </button>

            <div className="my-1 border-t border-border/40" />

            {/* Untagged Group Options */}
            {menu.sourceCol !== 'planned' && (
              <>
                <button
                  type="button"
                  onClick={() => onMoveAll(menu.goals, 'planned')}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-foreground hover:bg-secondary transition-colors whitespace-nowrap"
                >
                  <div className="h-2 w-2 rounded-full bg-apple-red shrink-0" />
                  <span>Move untagged to Planned</span>
                </button>
                <div className="my-1 border-t border-border/40" />
              </>
            )}

            {/* Delete all untagged */}
            <button
              type="button"
              onClick={() => onDelete('Untagged', true, menu.goals.length)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-apple-red hover:bg-apple-red/10 transition-colors whitespace-nowrap"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="shrink-0"
              >
                <path d="M3 6h18" />
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
              </svg>
              <span>Delete Untagged Tasks</span>
            </button>
          </>
        )}
      </div>
    </>
  )
}
