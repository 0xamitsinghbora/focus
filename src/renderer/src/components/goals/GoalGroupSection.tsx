import React from 'react'
import type { DailyGoal } from '../../../../shared/types'
import type { ColumnId, HoverTarget, GroupHoverTarget } from './types'
import { cn } from '../../lib/utils'
import { getGroupTheme, GroupColorId } from '../../lib/groupTheme'

export interface GoalGroupSectionProps {
  group: {
    tag: string
    isUntagged: boolean
    goals: DailyGoal[]
    colorTheme: ReturnType<typeof getGroupTheme>
  }
  col: ColumnId
  isCollapsed: boolean
  onToggleCollapse: (groupKey: string) => void

  // Drag state
  dragActive: boolean
  dragType: string | null
  dragPayloadGroupTag?: string
  hoverTarget: HoverTarget | null
  hoverGroupTarget: GroupHoverTarget | null

  // Inline editing
  inlineEditingGroup: { originalTag: string; currentTag: string; isUntagged?: boolean } | null
  setInlineEditingGroup: (
    state:
      | GoalGroupSectionProps['inlineEditingGroup']
      | ((
          prev: GoalGroupSectionProps['inlineEditingGroup']
        ) => GoalGroupSectionProps['inlineEditingGroup'])
  ) => void
  onInlineRenameConfirm: () => Promise<void>

  // Actions
  onPointerDownGroup: (
    e: React.PointerEvent,
    groupTag: string,
    goals: DailyGoal[],
    col: ColumnId,
    color?: string,
    isUntagged?: boolean
  ) => void
  onOpenColorPicker: (groupTag: string, x: number, y: number) => void
  onOpenGroupMenu: (menu: {
    groupTag: string
    sourceCol: ColumnId
    goals: DailyGoal[]
    isUntagged?: boolean
    x: number
    y: number
  }) => void
  onOpenEditGroupModal: (modal: {
    groupTag: string
    newTag: string
    color: GroupColorId
    taskCount: number
    isUntagged?: boolean
  }) => void

  // Children (the rendered cards)
  children: React.ReactNode

  // For group data access
  dailyGoals: DailyGoal[]
}

export function GoalGroupSection({
  group,
  col,
  isCollapsed,
  onToggleCollapse,
  dragActive,
  dragType,
  dragPayloadGroupTag,
  hoverTarget,
  hoverGroupTarget,
  inlineEditingGroup,
  setInlineEditingGroup,
  onInlineRenameConfirm,
  onPointerDownGroup,
  onOpenColorPicker,
  onOpenGroupMenu,
  onOpenEditGroupModal,
  children,
  dailyGoals
}: GoalGroupSectionProps): React.JSX.Element {
  const isDraggingGroup =
    dragActive &&
    dragType === 'group' &&
    (group.isUntagged
      ? !dragPayloadGroupTag || dragPayloadGroupTag.toLowerCase() === 'untagged'
      : dragPayloadGroupTag?.toLowerCase() === group.tag.toLowerCase())
  const theme = group.colorTheme

  const isHoverTargetGroup =
    hoverTarget?.type === 'group' &&
    hoverTarget.col === col &&
    dragActive &&
    dragType === 'card' &&
    (group.isUntagged
      ? hoverTarget.isUntagged
      : hoverTarget.groupTag.toLowerCase() === group.tag.toLowerCase())

  const isHoverGroupBefore =
    hoverGroupTarget?.type === 'group' &&
    hoverGroupTarget.col === col &&
    hoverGroupTarget.position === 'before' &&
    dragActive &&
    dragType === 'group' &&
    (group.isUntagged
      ? hoverGroupTarget.isUntagged
      : hoverGroupTarget.targetGroupTag.toLowerCase() === group.tag.toLowerCase())

  const isHoverGroupAfter =
    hoverGroupTarget?.type === 'group' &&
    hoverGroupTarget.col === col &&
    hoverGroupTarget.position === 'after' &&
    dragActive &&
    dragType === 'group' &&
    (group.isUntagged
      ? hoverGroupTarget.isUntagged
      : hoverGroupTarget.targetGroupTag.toLowerCase() === group.tag.toLowerCase())

  return (
    <div key={group.tag} className="relative">
      {/* Glowing Group Insertion Line (Before) */}
      {isHoverGroupBefore && (
        <div className="absolute -top-1.5 left-1 right-1 z-30 pointer-events-none animate-in fade-in duration-75">
          <div className="h-1.5 rounded-full bg-sky-500 shadow-[0_0_12px_rgba(56,189,248,0.9)] flex items-center justify-between">
            <div className="h-3 w-3 rounded-full bg-sky-500 -ml-1 shadow-sm" />
            <div className="h-3 w-3 rounded-full bg-sky-500 -mr-1 shadow-sm" />
          </div>
        </div>
      )}

      <div
        data-group-container="true"
        data-group-tag={group.tag}
        data-group-is-untagged={group.isUntagged ? 'true' : 'false'}
        data-group-color={theme.id}
        data-column={col}
        className={cn(
          'rounded-xl border transition-all duration-200 overflow-visible',
          group.isUntagged
            ? 'border-border/60 bg-surface/30'
            : cn(theme.headerBorder, theme.headerBg),
          isDraggingGroup && 'opacity-30 border-dashed scale-[0.99] pointer-events-none',
          isHoverTargetGroup && 'ring-2 ring-sky-500/80 border-sky-500/80 bg-sky-500/10 shadow-sm'
        )}
      >
        {/* Group Header Bar with Drag Handle & Theme Controls */}
        <div
          data-group-header="true"
          onPointerDown={(e) => {
            onPointerDownGroup(e, group.tag, group.goals, col, theme.id, group.isUntagged)
          }}
          onContextMenu={(e) => {
            e.preventDefault()
            e.stopPropagation()
            const menuWidth = 240
            const menuHeight = 280
            const x = Math.max(8, Math.min(e.clientX, window.innerWidth - menuWidth - 8))
            const y = Math.max(8, Math.min(e.clientY, window.innerHeight - menuHeight - 8))
            onOpenGroupMenu({
              groupTag: group.tag,
              sourceCol: col,
              goals: group.goals,
              isUntagged: group.isUntagged,
              x,
              y
            })
          }}
          className="flex items-center justify-between px-2.5 py-1.5 select-none transition-colors cursor-grab active:cursor-grabbing hover:bg-black/5 dark:hover:bg-white/5 rounded-t-xl"
          title="Drag group to reorder or move across columns · Double-click to rename · Right-click for options"
        >
          {/* Left: Drag grip, Color theme swatch dot, Group name, Task count */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div
              className="text-muted-foreground/50 hover:text-foreground cursor-grab active:cursor-grabbing flex items-center p-0.5"
              title="Drag entire group"
            >
              <svg width="10" height="12" viewBox="0 0 8 12" fill="currentColor">
                <circle cx="2" cy="2" r="1.2" />
                <circle cx="6" cy="2" r="1.2" />
                <circle cx="2" cy="6" r="1.2" />
                <circle cx="6" cy="6" r="1.2" />
                <circle cx="2" cy="10" r="1.2" />
                <circle cx="6" cy="10" r="1.2" />
              </svg>
            </div>

            {/* Clickable color dot to change whole group color */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                const rect = e.currentTarget.getBoundingClientRect()
                const pickerWidth = 240
                const pickerHeight = 160
                const x = Math.max(8, Math.min(rect.left, window.innerWidth - pickerWidth - 8))
                const y = Math.max(
                  8,
                  Math.min(rect.bottom + 6, window.innerHeight - pickerHeight - 8)
                )
                onOpenColorPicker(group.isUntagged ? 'Untagged' : group.tag, x, y)
              }}
              className="relative group/dot flex items-center justify-center p-0.5 rounded-full hover:scale-125 transition-transform shrink-0"
              title={`Change color theme (current: ${theme.name})`}
            >
              <span className={cn('h-2.5 w-2.5 rounded-full shadow-2xs', theme.dotClass)} />
            </button>

            {/* Inline Editable Group Title */}
            {inlineEditingGroup &&
            inlineEditingGroup.originalTag.toLowerCase() === group.tag.toLowerCase() ? (
              <div
                className="flex items-center gap-1 min-w-0"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <input
                  type="text"
                  value={inlineEditingGroup.currentTag}
                  onChange={(e) =>
                    setInlineEditingGroup((prev) =>
                      prev ? { ...prev, currentTag: e.target.value } : null
                    )
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onInlineRenameConfirm()
                    if (e.key === 'Escape') setInlineEditingGroup(null)
                  }}
                  autoFocus
                  placeholder={group.isUntagged ? 'Group name...' : undefined}
                  className="h-6 px-1.5 text-[12px] rounded-md border border-primary bg-background text-foreground focus:outline-none ring-1 ring-primary/40 font-semibold max-w-[130px]"
                />
                <button
                  type="button"
                  onClick={onInlineRenameConfirm}
                  disabled={!inlineEditingGroup.currentTag.trim()}
                  className="h-6 w-6 rounded-md bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50 shadow-2xs hover:opacity-90 shrink-0"
                  title="Save name (Enter)"
                >
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => setInlineEditingGroup(null)}
                  className="h-6 w-6 rounded-md bg-secondary text-muted-foreground hover:text-foreground flex items-center justify-center shrink-0"
                  title="Cancel (Esc)"
                >
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ) : (
              <div
                className="flex items-center gap-1.5 group/title min-w-0"
                onDoubleClick={(e) => {
                  e.stopPropagation()
                  setInlineEditingGroup({
                    originalTag: group.tag,
                    currentTag: group.isUntagged ? '' : group.tag,
                    isUntagged: group.isUntagged
                  })
                }}
                title={
                  group.isUntagged
                    ? 'Double-click to name this group'
                    : 'Double-click to rename group'
                }
              >
                <span className="text-[12.5px] font-semibold tracking-[-0.012em] text-foreground/90 truncate cursor-text">
                  {group.tag}
                </span>

                {/* Task count badge directly next to group title */}
                <span
                  className={cn(
                    'inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-semibold tabular-nums leading-none border shadow-2xs shrink-0 select-none transition-colors',
                    group.goals.length > 0
                      ? 'bg-secondary text-foreground border-border/80'
                      : 'bg-secondary/60 text-muted-foreground/80 border-border/50'
                  )}
                >
                  {group.goals.length}
                </span>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    const totalCount = group.isUntagged
                      ? dailyGoals.filter((g) => !g.groupTag?.trim()).length
                      : dailyGoals.filter(
                          (g) =>
                            g.groupTag &&
                            g.groupTag.trim().toLowerCase() === group.tag.toLowerCase()
                        ).length
                    onOpenEditGroupModal({
                      groupTag: group.tag,
                      newTag: group.isUntagged ? '' : group.tag,
                      color: theme.id,
                      taskCount: totalCount,
                      isUntagged: group.isUntagged
                    })
                  }}
                  className="opacity-0 group-hover/title:opacity-100 hover:!opacity-100 text-muted-foreground/60 hover:text-foreground p-0.5 rounded transition-opacity"
                  title={
                    group.isUntagged
                      ? 'Name this group (assign tag & color to untagged tasks)'
                      : 'Edit group (name, color, bulk status)'
                  }
                >
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                  </svg>
                </button>
              </div>
            )}
          </div>

          {/* Right: Actions Menu & Collapse Chevron */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Group Options Menu (3 dots) */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                const rect = e.currentTarget.getBoundingClientRect()
                const menuWidth = 240
                const menuHeight = 280
                const x = Math.max(
                  8,
                  Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8)
                )
                const y = Math.max(
                  8,
                  Math.min(rect.bottom + 6, window.innerHeight - menuHeight - 8)
                )
                onOpenGroupMenu({
                  groupTag: group.tag,
                  sourceCol: col,
                  goals: group.goals,
                  isUntagged: group.isUntagged,
                  x,
                  y
                })
              }}
              className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              title="Group options"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="12" r="2.5" />
                <circle cx="19" cy="12" r="2.5" />
                <circle cx="5" cy="12" r="2.5" />
              </svg>
            </button>

            {/* Collapse toggle */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onToggleCollapse(group.tag)
              }}
              className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              title={isCollapsed ? 'Expand group' : 'Collapse group'}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={cn('transition-transform duration-150', isCollapsed && '-rotate-90')}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          </div>
        </div>

        {/* Group Cards */}
        {!isCollapsed && (
          <div className="p-1.5 space-y-1.5 pt-0">
            {children}
            {/* If hovering directly over the group container rather than a specific card */}
            {isHoverTargetGroup && (
              <div className="rounded-lg border border-dashed border-sky-500/80 bg-sky-500/15 py-1.5 px-3 text-center text-[11px] font-semibold text-sky-600 dark:text-sky-300 animate-in fade-in duration-100 flex items-center justify-center gap-1.5 shadow-2xs">
                <span className={cn('h-1.5 w-1.5 rounded-full', theme.dotClass)} />
                <span>Drop to move to {group.tag}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Glowing Group Insertion Line (After) */}
      {isHoverGroupAfter && (
        <div className="absolute -bottom-1.5 left-1 right-1 z-30 pointer-events-none animate-in fade-in duration-75">
          <div className="h-1.5 rounded-full bg-sky-500 shadow-[0_0_12px_rgba(56,189,248,0.9)] flex items-center justify-between">
            <div className="h-3 w-3 rounded-full bg-sky-500 -ml-1 shadow-sm" />
            <div className="h-3 w-3 rounded-full bg-sky-500 -mr-1 shadow-sm" />
          </div>
        </div>
      )}
    </div>
  )
}
