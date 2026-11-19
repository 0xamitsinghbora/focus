import React, { useRef, useState, useCallback, useEffect } from 'react'
import { DailyGoal } from '../../../../shared/types'
import { cn } from '../../lib/utils'
import {
  getGroupTheme,
  getPreferredGroupColor,
  getRandomUnusedColor,
  GroupColorId
} from '../../lib/groupTheme'
import type { ColumnId, SortOption } from './types'
import { GoalsSortMenu } from './GoalsSortMenu'

interface GoalsToolbarProps {
  selectedGroupFilter: string
  setSelectedGroupFilter: (filter: string) => void
  existingGroups: { tag: string; color: GroupColorId }[]
  groupCounts: { counts: Record<string, number>; untagged: number; total: number }
  groupByTag: boolean
  setGroupByTag: (fn: (prev: boolean) => boolean) => void
  sortOption: SortOption
  setSortOption: (opt: SortOption) => void
  dailyGoals: DailyGoal[]
  onOpenGroupMenu: (menu: {
    groupTag: string
    sourceCol: ColumnId
    goals: DailyGoal[]
    isUntagged: boolean
    x: number
    y: number
  }) => void
  onOpenEditGroupModal: (modal: {
    groupTag: string
    newTag: string
    color: GroupColorId
    taskCount: number
    isNewGroup: boolean
  }) => void
  onOpenShortcuts: () => void
  onOpenTrash?: () => void
  onOpenNewTask?: () => void
  shortcutLabel?: string
}

export function GoalsToolbar({
  selectedGroupFilter,
  setSelectedGroupFilter,
  existingGroups,
  groupCounts,
  groupByTag,
  setGroupByTag,
  sortOption,
  setSortOption,
  dailyGoals,
  onOpenGroupMenu,
  onOpenEditGroupModal,
  onOpenShortcuts,
  onOpenTrash
}: GoalsToolbarProps): React.JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const checkScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 4)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }, [])

  useEffect(() => {
    checkScroll()
    const el = scrollRef.current
    if (!el) return

    const observer = new ResizeObserver(() => checkScroll())
    observer.observe(el)
    window.addEventListener('resize', checkScroll)

    const timer = setTimeout(checkScroll, 100)

    return () => {
      clearTimeout(timer)
      observer.disconnect()
      window.removeEventListener('resize', checkScroll)
    }
  }, [checkScroll, existingGroups.length])

  // Map vertical mouse wheel to horizontal scroll
  const handleWheel = (e: React.WheelEvent): void => {
    if (e.deltaY !== 0 && scrollRef.current) {
      scrollRef.current.scrollLeft += e.deltaY
      checkScroll()
    }
  }

  const scrollBy = (offset: number): void => {
    scrollRef.current?.scrollBy({ left: offset, behavior: 'smooth' })
    setTimeout(checkScroll, 220)
  }

  return (
    <div className="flex items-center justify-between gap-3 pb-1 w-full min-w-0">
      {/* Left: Group Filter Pills & New Group */}
      <div className="flex items-center gap-1.5 min-w-0 flex-1 relative">
        {canScrollLeft && (
          <button
            type="button"
            onClick={() => scrollBy(-180)}
            className="h-7 w-6 rounded-lg bg-surface/90 hover:bg-secondary border border-border/80 text-muted-foreground hover:text-foreground flex items-center justify-center shrink-0 shadow-2xs transition-all active:scale-95 cursor-pointer z-10"
            title="Scroll groups left"
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
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        )}

        <div
          ref={scrollRef}
          onScroll={checkScroll}
          onWheel={handleWheel}
          className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth py-0.5 min-w-0 flex-1"
        >
          <button
            type="button"
            onClick={() => setSelectedGroupFilter('all')}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] font-medium tracking-[-0.01em] transition-all shadow-2xs border shrink-0 cursor-pointer apple-press active:scale-[0.97]',
              selectedGroupFilter === 'all'
                ? 'bg-foreground text-background font-semibold border-foreground'
                : 'bg-secondary/70 border-border/80 text-foreground/80 hover:bg-secondary hover:text-foreground'
            )}
          >
            <span>All</span>
            <span
              className={cn(
                'inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full text-[10.5px] font-semibold tabular-nums leading-none transition-colors',
                selectedGroupFilter === 'all'
                  ? 'bg-background/20 text-background'
                  : 'bg-background/80 text-foreground/80 border border-border/70 shadow-2xs'
              )}
            >
              {groupCounts.total}
            </span>
          </button>

          {existingGroups.map((g) => {
            const theme = getGroupTheme(g.color || getPreferredGroupColor(g.tag))
            const isSelected = selectedGroupFilter.toLowerCase() === g.tag.toLowerCase()
            const count = groupCounts.counts[g.tag] || 0
            return (
              <button
                key={g.tag}
                type="button"
                onClick={() => setSelectedGroupFilter(isSelected ? 'all' : g.tag)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  const menuWidth = 240
                  const menuHeight = 280
                  const x = Math.max(8, Math.min(e.clientX, window.innerWidth - menuWidth - 8))
                  const y = Math.max(8, Math.min(e.clientY, window.innerHeight - menuHeight - 8))
                  const matchingGoals = dailyGoals.filter(
                    (goal) =>
                      goal.groupTag && goal.groupTag.trim().toLowerCase() === g.tag.toLowerCase()
                  )
                  onOpenGroupMenu({
                    groupTag: g.tag,
                    sourceCol: 'planned',
                    goals: matchingGoals,
                    isUntagged: false,
                    x,
                    y
                  })
                }}
                title={`Filter by "${g.tag}" · Right-click to edit or delete group`}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] font-medium tracking-[-0.01em] transition-all shadow-2xs border shrink-0 cursor-pointer apple-press active:scale-[0.97]',
                  isSelected
                    ? cn(
                        theme.badgeBg,
                        theme.badgeText,
                        theme.badgeBorder,
                        'ring-1 ring-border font-semibold shadow-xs'
                      )
                    : 'bg-secondary/70 border-border/70 text-foreground/80 hover:bg-secondary hover:text-foreground'
                )}
              >
                <span className={cn('h-2 w-2 rounded-full shrink-0', theme.dotClass)} />
                <span>{g.tag}</span>
                <span
                  className={cn(
                    'inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full text-[10.5px] font-semibold tabular-nums leading-none transition-colors',
                    isSelected
                      ? 'bg-black/10 dark:bg-white/15 text-inherit'
                      : 'bg-background/80 text-foreground/80 border border-border/70 shadow-2xs'
                  )}
                >
                  {count}
                </span>
              </button>
            )
          })}

          {groupCounts.untagged > 0 && (
            <button
              type="button"
              onClick={() =>
                setSelectedGroupFilter(
                  selectedGroupFilter === '__untagged__' ? 'all' : '__untagged__'
                )
              }
              onContextMenu={(e) => {
                e.preventDefault()
                e.stopPropagation()
                const menuWidth = 240
                const menuHeight = 280
                const x = Math.max(8, Math.min(e.clientX, window.innerWidth - menuWidth - 8))
                const y = Math.max(8, Math.min(e.clientY, window.innerHeight - menuHeight - 8))
                const untaggedGoals = dailyGoals.filter((goal) => !goal.groupTag?.trim())
                onOpenGroupMenu({
                  groupTag: 'Untagged',
                  sourceCol: 'planned',
                  goals: untaggedGoals,
                  isUntagged: true,
                  x,
                  y
                })
              }}
              title="Filter by Untagged · Right-click for options"
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] font-medium transition-all shadow-2xs border shrink-0 cursor-pointer',
                selectedGroupFilter === '__untagged__'
                  ? 'bg-foreground text-background font-semibold border-foreground'
                  : 'bg-secondary/70 border-border/70 text-muted-foreground hover:bg-secondary hover:text-foreground'
              )}
            >
              <span>Untagged</span>
              <span
                className={cn(
                  'inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full text-[10.5px] font-semibold tabular-nums leading-none transition-colors',
                  selectedGroupFilter === '__untagged__'
                    ? 'bg-background/20 text-background'
                    : 'bg-background/80 text-foreground/80 border border-border/70 shadow-2xs'
                )}
              >
                {groupCounts.untagged}
              </span>
            </button>
          )}
        </div>

        {canScrollRight && (
          <button
            type="button"
            onClick={() => scrollBy(180)}
            className="h-7 w-6 rounded-lg bg-surface/90 hover:bg-secondary border border-border/80 text-muted-foreground hover:text-foreground flex items-center justify-center shrink-0 shadow-2xs transition-all active:scale-95 cursor-pointer z-10"
            title="Scroll groups right"
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
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        )}

        {/* Create new group button - compact, sleek, dashed border */}
        <button
          type="button"
          onClick={() => {
            const usedColors = existingGroups.map((g) => g.color)
            const randomColor = getRandomUnusedColor(usedColors)
            onOpenEditGroupModal({
              groupTag: '',
              newTag: '',
              color: randomColor,
              taskCount: 0,
              isNewGroup: true
            })
          }}
          title="Create a new group / category to organize tasks"
          className="h-7 px-2 flex items-center gap-1 rounded-lg text-[11px] font-medium border border-dashed border-border/80 hover:border-foreground/40 bg-surface/40 hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-all shadow-2xs shrink-0 active:scale-95 cursor-pointer group"
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0 text-muted-foreground/70 group-hover:text-foreground transition-colors"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span className="whitespace-nowrap">New Group</span>
        </button>
      </div>

      {/* Right: View Mode Toggle, Custom Sort Dropdown & Shortcuts */}
      <div className="flex items-center gap-1.5 shrink-0">
        {existingGroups.length > 0 && (
          <button
            type="button"
            onClick={() => setGroupByTag((v) => !v)}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11.5px] font-medium transition-all border shadow-2xs whitespace-nowrap cursor-pointer',
              groupByTag
                ? 'bg-secondary text-foreground border-border font-semibold'
                : 'bg-surface text-muted-foreground border-border/70 hover:text-foreground'
            )}
            title={
              groupByTag
                ? 'Tasks are grouped by tag (click to ungroup)'
                : 'Tasks are ungrouped (click to group by tag)'
            }
          >
            {groupByTag ? (
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
                <rect width="7" height="7" x="3" y="3" rx="1.5" />
                <rect width="7" height="7" x="14" y="3" rx="1.5" />
                <rect width="7" height="7" x="14" y="14" rx="1.5" />
                <rect width="7" height="7" x="3" y="14" rx="1.5" />
              </svg>
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
                className="shrink-0"
              >
                <line x1="9" x2="21" y1="6" y2="6" />
                <line x1="9" x2="21" y1="12" y2="12" />
                <line x1="9" x2="21" y1="18" y2="18" />
                <circle cx="4.5" cy="6" r="1.5" fill="currentColor" stroke="none" />
                <circle cx="4.5" cy="12" r="1.5" fill="currentColor" stroke="none" />
                <circle cx="4.5" cy="18" r="1.5" fill="currentColor" stroke="none" />
              </svg>
            )}
            <span>{groupByTag ? 'Group by Tag' : 'Ungrouped'}</span>
          </button>
        )}

        {/* Custom Styled Sort Dropdown Menu */}
        <GoalsSortMenu sortOption={sortOption} setSortOption={setSortOption} />

        {/* Keyboard Shortcuts Trigger Button */}
        <button
          type="button"
          onClick={onOpenShortcuts}
          className="flex items-center gap-1.5 rounded-lg border border-border/80 bg-surface px-2.5 py-1 text-[11.5px] font-medium text-foreground hover:bg-secondary transition-colors shadow-2xs cursor-pointer"
          title="Keyboard Shortcuts (?)"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0 text-muted-foreground"
          >
            <rect width="20" height="14" x="2" y="5" rx="2.5" />
            <path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M7 14h10" />
          </svg>
          <span className="hidden md:inline">Shortcuts</span>
          <kbd className="px-1 py-0.2 rounded bg-secondary text-[10px] font-mono text-muted-foreground border border-border/60">
            ?
          </kbd>
        </button>

        {/* Trash & Recovery Trigger Button */}
        {onOpenTrash && (
          <button
            type="button"
            onClick={onOpenTrash}
            className="flex items-center gap-1.5 rounded-lg border border-border/80 bg-surface px-2.5 py-1 text-[11.5px] font-medium text-foreground hover:bg-secondary transition-colors shadow-2xs cursor-pointer"
            title="Trash & Archived Tasks"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0 text-muted-foreground"
            >
              <path d="M3 6h18" />
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
            <span className="hidden md:inline">Trash</span>
          </button>
        )}
      </div>
    </div>
  )
}
