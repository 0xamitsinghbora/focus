import React, { useRef, useEffect } from 'react'
import { cn } from '../../lib/utils'
import { getGroupTheme, getPreferredGroupColor } from '../../lib/groupTheme'
import type { DragState, ColumnId, HoverTarget, GroupHoverTarget } from './types'
import { COLUMNS } from './types'

interface GoalsDragGhostProps {
  drag: DragState | null
  hoverColumn: ColumnId | null
  hoverTarget: HoverTarget | null
  hoverGroupTarget: GroupHoverTarget | null
}

export function GoalsDragGhost({
  drag,
  hoverColumn,
  hoverTarget,
  hoverGroupTarget
}: GoalsDragGhostProps): React.JSX.Element | null {
  const ghostRef = useRef<HTMLDivElement>(null)
  const currentPosRef = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (!drag?.active) {
      currentPosRef.current = null
      return
    }

    const handlePointerMove = (e: PointerEvent): void => {
      currentPosRef.current = { x: e.clientX, y: e.clientY }
      if (ghostRef.current) {
        ghostRef.current.style.transform = `translate3d(${e.clientX + 12}px, ${e.clientY - 14}px, 0)`
      }
    }

    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
    }
  }, [drag?.active])

  if (!drag?.active) return null

  const currentX = currentPosRef.current ? currentPosRef.current.x : drag.x
  const currentY = currentPosRef.current ? currentPosRef.current.y : drag.y

  return (
    <div
      ref={ghostRef}
      className="fixed z-[9999] pointer-events-none select-none top-0 left-0 will-change-transform"
      style={{ transform: `translate3d(${currentX + 12}px, ${currentY - 14}px, 0)` }}
    >
      {drag.type === 'multi' ? (
        <div className="apple-glass rounded-xl px-4 py-2.5 shadow-apple-popover border border-primary/60 flex items-center gap-3 backdrop-blur-md">
          <div className="h-6 w-6 rounded-lg bg-primary text-primary-foreground font-bold text-[11px] flex items-center justify-center shadow-xs">
            {drag.payload.count}
          </div>
          <div className="flex flex-col">
            <span className="text-[13px] font-semibold text-foreground whitespace-nowrap">
              Moving {drag.payload.count} selected tasks
            </span>
            <span className="text-[11px] text-muted-foreground">
              {hoverColumn
                ? `Drop to move to ${COLUMNS.find((c) => c.id === hoverColumn)?.label}`
                : 'Drop onto any column or group'}
            </span>
          </div>
        </div>
      ) : drag.type === 'group' ? (
        <div className="apple-glass rounded-xl px-4 py-2.5 shadow-apple-popover border border-border/80 flex items-center gap-3 backdrop-blur-md">
          <div
            className={cn(
              'h-3.5 w-3.5 rounded-full shrink-0 shadow-sm',
              drag.payload.groupColor
                ? getGroupTheme(drag.payload.groupColor).dotClass
                : 'bg-primary'
            )}
          />
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-foreground whitespace-nowrap">
                {drag.payload.title}
              </span>
              <span className="text-[10px] font-medium px-1.5 py-0.2 rounded-full bg-secondary text-muted-foreground border border-border/50">
                {drag.payload.count} {drag.payload.count === 1 ? 'task' : 'tasks'}
              </span>
            </div>
            <span className="text-[11px] text-muted-foreground">
              {hoverGroupTarget?.type === 'group'
                ? `Place ${hoverGroupTarget.position} "${hoverGroupTarget.targetGroupTag}"`
                : hoverGroupTarget?.type === 'column' && hoverGroupTarget.col !== drag.sourceCol
                  ? `Transfer to ${COLUMNS.find((c) => c.id === hoverGroupTarget.col)?.label}...`
                  : 'Drag to reorder or transfer group...'}
            </span>
          </div>
        </div>
      ) : (
        <div className="apple-glass rounded-xl px-3.5 py-2 shadow-apple-popover border border-border/80 flex items-center gap-2">
          <span
            className={cn(
              'h-2 w-2 rounded-full shrink-0',
              hoverTarget?.type === 'card' && hoverTarget.groupTag !== drag.payload.groupTag
                ? getGroupTheme(
                    hoverTarget.groupColor || getPreferredGroupColor(hoverTarget.groupTag || '')
                  ).dotClass
                : hoverTarget?.type === 'group' && hoverTarget.groupTag !== drag.payload.groupTag
                  ? getGroupTheme(
                      hoverTarget.groupColor || getPreferredGroupColor(hoverTarget.groupTag || '')
                    ).dotClass
                  : drag.payload.groupColor
                    ? getGroupTheme(drag.payload.groupColor).dotClass
                    : 'bg-primary'
            )}
          />
          <div className="text-[13px] font-medium text-foreground whitespace-nowrap max-w-[200px] truncate">
            {drag.payload.title}
          </div>

          {/* Tag transition indicator: Tag A -> Tag B */}
          {hoverTarget &&
            ((hoverTarget.type === 'card' &&
              (hoverTarget.groupTag || '') !== (drag.payload.groupTag || '')) ||
              (hoverTarget.type === 'group' &&
                (hoverTarget.isUntagged ? '' : hoverTarget.groupTag) !==
                  (drag.payload.groupTag || ''))) && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-sky-500/20 text-sky-400 border border-sky-500/30 flex items-center gap-1 shadow-2xs">
                <span>→</span>
                <span>
                  {hoverTarget.type === 'card'
                    ? hoverTarget.groupTag || 'Untagged'
                    : hoverTarget.isUntagged
                      ? 'Untagged'
                      : hoverTarget.groupTag}
                </span>
              </span>
            )}
        </div>
      )}
    </div>
  )
}
