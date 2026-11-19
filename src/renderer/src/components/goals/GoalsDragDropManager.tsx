import React from 'react'
import { cn } from '../../lib/utils'
import { getGroupTheme } from '../../lib/groupTheme'
import type { ColumnId, ColumnDef, DragState, HoverTarget, ColumnGroup } from './types'
import type { ExistingGroup } from './hooks/useGoalsOrganize'

/**
 * Drop target indicator banner displayed when dragging an entire group over a column.
 */
export function GoalsGroupTransferBanner({
  drag,
  col,
  hoverColumn
}: {
  drag: DragState | null
  col: ColumnDef
  hoverColumn: ColumnId | null
}): React.JSX.Element | null {
  if (!drag?.active || drag.type !== 'group' || col.id === drag.sourceCol) {
    return null
  }

  return (
    <div
      className={cn(
        'rounded-xl border border-dashed p-2.5 text-center transition-all duration-150 animate-in fade-in flex items-center justify-center gap-2 mb-2 select-none',
        hoverColumn === col.id
          ? 'border-sky-500 bg-sky-500/15 ring-2 ring-sky-500/50 text-sky-600 dark:text-sky-300 scale-[1.01] shadow-xs'
          : 'border-border/70 bg-surface/40 text-muted-foreground'
      )}
    >
      <span
        className={cn(
          'h-2 w-2 rounded-full shrink-0',
          drag.payload.groupColor ? getGroupTheme(drag.payload.groupColor).dotClass : 'bg-primary'
        )}
      />
      <span className="text-[12px] font-semibold truncate">
        Drop to transfer all {drag.payload.count} tasks of &ldquo;
        {drag.payload.title}&rdquo; to {col.label}
      </span>
    </div>
  )
}

/**
 * Empty group drop targets rendered at the bottom of a column when dragging a card.
 */
export function GoalsEmptyGroupDropZones({
  colId,
  drag,
  hoverTarget,
  existingGroups,
  columnGroups
}: {
  colId: ColumnId
  drag: DragState | null
  hoverTarget: HoverTarget | null
  existingGroups: ExistingGroup[]
  columnGroups: ColumnGroup[]
}): React.JSX.Element | null {
  if (!drag?.active || drag.type !== 'card') {
    return null
  }

  const missingGroups = existingGroups.filter(
    (eg) =>
      !columnGroups.some((cg) => !cg.isUntagged && cg.tag.toLowerCase() === eg.tag.toLowerCase())
  )

  const showUntaggedDropZone = drag.payload.groupTag && !columnGroups.some((cg) => cg.isUntagged)

  if (missingGroups.length === 0 && !showUntaggedDropZone) {
    return null
  }

  return (
    <div className="space-y-1.5 pt-1.5 animate-in fade-in duration-100">
      {missingGroups.map((eg) => {
        const egTheme = getGroupTheme(eg.color)
        const isHovered =
          hoverTarget?.type === 'group' &&
          hoverTarget.col === colId &&
          hoverTarget.groupTag.toLowerCase() === eg.tag.toLowerCase()
        return (
          <div
            key={eg.tag}
            data-group-container="true"
            data-group-drop-zone="true"
            data-group-tag={eg.tag}
            data-group-is-untagged="false"
            data-group-color={eg.color}
            data-column={colId}
            className={cn(
              'rounded-xl border border-dashed px-3 py-2 text-[12px] flex items-center justify-between transition-all duration-150',
              egTheme.headerBg,
              isHovered
                ? 'border-sky-500 ring-2 ring-sky-500/50 bg-sky-500/10 scale-[1.01] shadow-xs'
                : 'border-border/60 opacity-60 hover:opacity-100'
            )}
          >
            <div className="flex items-center gap-2">
              <span className={cn('h-2 w-2 rounded-full', egTheme.dotClass)} />
              <span className="font-medium text-foreground/90">{eg.tag}</span>
            </div>
            <span className="text-[10.5px] text-muted-foreground font-medium">
              Drop into &ldquo;{eg.tag}&rdquo;
            </span>
          </div>
        )
      })}

      {showUntaggedDropZone && (
        <div
          data-group-container="true"
          data-group-drop-zone="true"
          data-group-is-untagged="true"
          data-column={colId}
          className={cn(
            'rounded-xl border border-dashed px-3 py-2 text-[12px] flex items-center justify-between transition-all duration-150 border-border/60 bg-surface/30',
            hoverTarget?.type === 'group' &&
              hoverTarget.col === colId &&
              hoverTarget.isUntagged &&
              'border-sky-500 ring-2 ring-sky-500/50 bg-sky-500/10 scale-[1.01] shadow-xs'
          )}
        >
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
            <span className="font-medium text-foreground/80">Untagged</span>
          </div>
          <span className="text-[10.5px] text-muted-foreground font-medium">
            Drop to remove tag
          </span>
        </div>
      )}
    </div>
  )
}
