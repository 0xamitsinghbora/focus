import { useCallback, useEffect, useRef, useState } from 'react'
import { DailyGoal, DEFAULT_SORT_ORDER } from '../../../../../shared/types'
import { getPreferredGroupColor } from '../../../lib/groupTheme'
import type { ColumnId, DragState, HoverTarget, GroupHoverTarget, SortOption } from '../types'
import { COLUMNS, DRAG_THRESHOLD } from '../types'
import { calculateFractionalSortOrders, rebalanceGoals } from '../fractionalIndex'

export interface UseGoalsDragDropProps {
  dailyGoals: DailyGoal[]
  processedGoalsByColumn: Record<ColumnId, DailyGoal[]>
  groupByTag: boolean
  selectedGoalIds: Set<string>
  setSelectedGoalIds: React.Dispatch<React.SetStateAction<Set<string>>>
  toggleSelectGoal: (goalId: string, isShift: boolean, isSpace: boolean) => void
  updateMultipleGoals: (goals: DailyGoal[]) => Promise<void>
  moveWholeGroup: (goals: DailyGoal[], newStatus: DailyGoal['status']) => Promise<void>
  setSortOption: (opt: SortOption) => void
}

export interface UseGoalsDragDropReturn {
  drag: DragState | null
  hoverColumn: ColumnId | null
  hoverTarget: HoverTarget | null
  hoverGroupTarget: GroupHoverTarget | null
  registerColumn: (column: ColumnId) => (el: HTMLElement | null) => void
  isValidTarget: (col: ColumnId) => boolean
  isHovering: (col: ColumnId) => boolean
  onPointerDownCard: (e: React.PointerEvent, goal: DailyGoal, sourceCol: ColumnId) => void
  onPointerDownGroup: (
    e: React.PointerEvent,
    groupTag: string,
    groupGoals: DailyGoal[],
    sourceCol: ColumnId,
    color?: string,
    isUntagged?: boolean
  ) => void
  longPressTriggeredRef: React.MutableRefObject<boolean>
  didDragOccurRef: React.MutableRefObject<boolean>
  announcement: string | null
}

function isSameHoverTarget(a: HoverTarget | null, b: HoverTarget | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  if (a.type !== b.type || a.col !== b.col) return false
  if (a.type === 'card' && b.type === 'card') {
    return (
      a.targetGoalId === b.targetGoalId &&
      a.position === b.position &&
      a.groupTag === b.groupTag &&
      a.groupColor === b.groupColor
    )
  }
  if (a.type === 'group' && b.type === 'group') {
    return (
      a.groupTag === b.groupTag && a.isUntagged === b.isUntagged && a.groupColor === b.groupColor
    )
  }
  return true
}

function isSameGroupHoverTarget(a: GroupHoverTarget | null, b: GroupHoverTarget | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  if (a.type !== b.type || a.col !== b.col) return false
  if (a.type === 'group' && b.type === 'group') {
    return (
      a.targetGroupTag === b.targetGroupTag &&
      a.isUntagged === b.isUntagged &&
      a.position === b.position
    )
  }
  return true
}

export function useGoalsDragDrop({
  dailyGoals,
  processedGoalsByColumn,
  groupByTag,
  selectedGoalIds,
  setSelectedGoalIds,
  toggleSelectGoal,
  updateMultipleGoals,
  moveWholeGroup,
  setSortOption
}: UseGoalsDragDropProps): UseGoalsDragDropReturn {
  const [drag, setDrag] = useState<DragState | null>(null)
  const [hoverColumn, setHoverColumn] = useState<ColumnId | null>(null)
  const [hoverTarget, setHoverTarget] = useState<HoverTarget | null>(null)
  const [hoverGroupTarget, setHoverGroupTarget] = useState<GroupHoverTarget | null>(null)
  const [announcement, setAnnouncement] = useState<string | null>(null)

  const dragRef = useRef<DragState | null>(null)
  const hoverColumnRef = useRef<ColumnId | null>(null)
  const hoverTargetRef = useRef<HoverTarget | null>(null)
  const hoverGroupTargetRef = useRef<GroupHoverTarget | null>(null)
  const columnRefs = useRef<Map<ColumnId, HTMLElement>>(new Map())

  const updateHoverTarget = useCallback((target: HoverTarget | null): void => {
    if (!isSameHoverTarget(hoverTargetRef.current, target)) {
      hoverTargetRef.current = target
      setHoverTarget(target)
    }
  }, [])

  const updateHoverColumn = useCallback((col: ColumnId | null): void => {
    if (hoverColumnRef.current !== col) {
      hoverColumnRef.current = col
      setHoverColumn(col)
      if (col) {
        const colTitle = COLUMNS.find((c) => c.id === col)?.label || col
        setAnnouncement(`Hovering over ${colTitle} column`)
      }
    }
  }, [])

  const updateHoverGroupTarget = useCallback((target: GroupHoverTarget | null): void => {
    if (!isSameGroupHoverTarget(hoverGroupTargetRef.current, target)) {
      hoverGroupTargetRef.current = target
      setHoverGroupTarget(target)
    }
  }, [])

  const dailyGoalsRef = useRef(dailyGoals)
  useEffect(() => {
    dailyGoalsRef.current = dailyGoals
  }, [dailyGoals])

  const processedGoalsRef = useRef(processedGoalsByColumn)
  useEffect(() => {
    processedGoalsRef.current = processedGoalsByColumn
  }, [processedGoalsByColumn])

  const getFullGoalsForColumn = useCallback((col: ColumnId, excludeIds?: string[]): DailyGoal[] => {
    const targetStatus = COLUMNS.find((c) => c.id === col)?.status || 'planned'
    const goals = dailyGoalsRef.current.filter(
      (g) => g.status === targetStatus && (!excludeIds || !excludeIds.includes(g.id))
    )
    goals.sort((a, b) => {
      const orderA = typeof a.sortOrder === 'number' ? a.sortOrder : DEFAULT_SORT_ORDER
      const orderB = typeof b.sortOrder === 'number' ? b.sortOrder : DEFAULT_SORT_ORDER
      if (orderA !== orderB) return orderA - orderB
      return a.createdAt.localeCompare(b.createdAt)
    })
    return goals
  }, [])

  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null)
  const longPressTriggeredRef = useRef<boolean>(false)
  const didDragOccurRef = useRef<boolean>(false)
  const cachedColumnRectsRef = useRef<Map<ColumnId, DOMRect>>(new Map())
  const isRebalancingRef = useRef<boolean>(false)
  const isDropProcessingRef = useRef<boolean>(false)

  const applyLocalUpdates = useCallback((updatedGoals: DailyGoal[]): void => {
    if (!updatedGoals || updatedGoals.length === 0) return
    const updatedMap = new Map(updatedGoals.map((g) => [g.id, g]))
    dailyGoalsRef.current = dailyGoalsRef.current.map((g) => updatedMap.get(g.id) || g)
  }, [])

  const updateCachedColumnRects = useCallback((): void => {
    const map = new Map<ColumnId, DOMRect>()
    for (const [id, el] of columnRefs.current) {
      if (el && typeof el.getBoundingClientRect === 'function') {
        map.set(id, el.getBoundingClientRect())
      }
    }
    cachedColumnRectsRef.current = map
  }, [])

  const detectColumn = useCallback(
    (x: number, y: number): ColumnId | null => {
      if (cachedColumnRectsRef.current.size === 0) {
        updateCachedColumnRects()
      }
      const rects = cachedColumnRectsRef.current
      for (const [id, rect] of rects) {
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
          return id
        }
      }
      for (const [id, rect] of rects) {
        if (x >= rect.left && x <= rect.right && y >= rect.top - 120 && y <= rect.bottom + 120) {
          return id
        }
      }
      return null
    },
    [updateCachedColumnRects]
  )

  const registerColumn = useCallback((column: ColumnId) => {
    return (el: HTMLElement | null): void => {
      if (el) columnRefs.current.set(column, el)
      else columnRefs.current.delete(column)
    }
  }, [])

  const isValidTarget = (col: ColumnId): boolean => Boolean(drag?.active && col !== drag.sourceCol)
  const isHovering = (col: ColumnId): boolean => hoverColumn === col && isValidTarget(col)

  const onPointerDownCard = useCallback(
    (e: React.PointerEvent, goal: DailyGoal, sourceCol: ColumnId) => {
      if (isRebalancingRef.current || isDropProcessingRef.current) return
      if (e.button !== 0) return
      if (
        (e.target as HTMLElement).closest('button') ||
        (e.target as HTMLElement).closest('input') ||
        (e.target as HTMLElement).closest('.select-text')
      )
        return

      if (e.shiftKey) {
        e.preventDefault()
        toggleSelectGoal(goal.id, true, true)
        return
      }

      try {
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      } catch {
        // ignore
      }

      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current)
        longPressTimerRef.current = null
      }
      longPressTriggeredRef.current = false
      if (selectedGoalIds.size === 0 && e.pointerType === 'touch') {
        longPressTimerRef.current = setTimeout(() => {
          longPressTriggeredRef.current = true
          toggleSelectGoal(goal.id, false, true)
        }, 500)
      }

      const isMulti = selectedGoalIds.has(goal.id) && selectedGoalIds.size > 1

      const state: DragState = {
        type: isMulti ? 'multi' : 'card',
        payload: {
          id: goal.id,
          title: goal.title,
          groupTag: goal.groupTag,
          groupColor: goal.groupColor,
          count: isMulti ? selectedGoalIds.size : 1,
          sourceGoalIds: isMulti ? Array.from(selectedGoalIds) : [goal.id]
        },
        sourceCol,
        originX: e.clientX,
        originY: e.clientY,
        x: e.clientX,
        y: e.clientY,
        active: false
      }
      dragRef.current = state
      setDrag(state)
    },
    [selectedGoalIds, toggleSelectGoal]
  )

  const onPointerDownGroup = useCallback(
    (
      e: React.PointerEvent,
      groupTag: string,
      groupGoals: DailyGoal[],
      sourceCol: ColumnId,
      color?: string,
      isUntagged = false
    ) => {
      if (isRebalancingRef.current || isDropProcessingRef.current) return
      if (e.button !== 0) return
      if (
        (e.target as HTMLElement).closest('button') ||
        (e.target as HTMLElement).closest('input') ||
        (e.target as HTMLElement).closest('.select-text')
      )
        return
      try {
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      } catch {
        // ignore
      }

      const state: DragState = {
        type: 'group',
        payload: {
          id: groupTag,
          title: groupTag,
          groupTag,
          groupColor: color,
          count: groupGoals.length,
          sourceGoalIds: groupGoals.map((g) => g.id),
          isUntagged
        },
        sourceCol,
        originX: e.clientX,
        originY: e.clientY,
        x: e.clientX,
        y: e.clientY,
        active: false
      }
      dragRef.current = state
      setDrag(state)
    },
    []
  )

  const isDragging = Boolean(drag)

  useEffect(() => {
    if (!isDragging || !drag) return

    let rafId: number | null = null
    let autoScrollRafId: number | null = null
    let latestMoveEvent: PointerEvent | null = null
    const lastPointerPos = { x: drag.x, y: drag.y }
    let cachedColumnCards: {
      col: ColumnId
      timestamp: number
      cards: {
        el: HTMLElement
        goalId: string
        groupTag?: string
        groupColor?: string
        rect: DOMRect
      }[]
    } | null = null

    const stopAutoScroll = (): void => {
      if (autoScrollRafId !== null) {
        cancelAnimationFrame(autoScrollRafId)
        autoScrollRafId = null
      }
    }

    const autoScrollStep = (): void => {
      const d = dragRef.current
      if (!d || !d.active) {
        autoScrollRafId = null
        return
      }

      const col = hoverColumnRef.current || detectColumn(lastPointerPos.x, lastPointerPos.y)
      const colEl = col ? columnRefs.current.get(col) : null
      const scrollEl = (colEl?.querySelector('.overflow-y-auto') as HTMLElement) || colEl

      if (scrollEl) {
        const rect = scrollEl.getBoundingClientRect()
        const threshold = 55
        const maxSpeed = 14
        const py = lastPointerPos.y
        const px = lastPointerPos.x

        if (px >= rect.left - 40 && px <= rect.right + 40) {
          let scrolled = false
          if (py <= rect.top + threshold && py >= rect.top - 100) {
            const intensity = Math.min(1, Math.max(0, (rect.top + threshold - py) / threshold))
            const speed = Math.max(2, Math.round(intensity * maxSpeed))
            if (scrollEl.scrollTop > 0) {
              scrollEl.scrollTop = Math.max(0, scrollEl.scrollTop - speed)
              scrolled = true
            }
          } else if (py >= rect.bottom - threshold && py <= rect.bottom + 100) {
            const intensity = Math.min(1, Math.max(0, (py - (rect.bottom - threshold)) / threshold))
            const speed = Math.max(2, Math.round(intensity * maxSpeed))
            const maxScroll = scrollEl.scrollHeight - scrollEl.clientHeight
            if (scrollEl.scrollTop < maxScroll) {
              scrollEl.scrollTop = Math.min(maxScroll, scrollEl.scrollTop + speed)
              scrolled = true
            }
          }
          if (scrolled) {
            cachedColumnCards = null
            processMove({ clientX: px, clientY: py } as PointerEvent)
          }
        }
      }

      autoScrollRafId = requestAnimationFrame(autoScrollStep)
    }

    const startAutoScroll = (): void => {
      if (autoScrollRafId === null) {
        autoScrollRafId = requestAnimationFrame(autoScrollStep)
      }
    }

    const processMove = (e: PointerEvent): void => {
      const d = dragRef.current
      if (!d) return

      const moveDist = Math.abs(e.clientX - d.originX) + Math.abs(e.clientY - d.originY)
      if (moveDist > 3 && longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current)
        longPressTimerRef.current = null
      }

      if (!d.active && moveDist < DRAG_THRESHOLD) return

      const wasActive = d.active
      if (!wasActive) {
        const title =
          d.payload.title ||
          (d.payload.sourceGoalIds?.length ? `${d.payload.sourceGoalIds.length} tasks` : 'task')
        setAnnouncement(`Picked up ${title}. Drag to reorder or move between columns.`)
      }

      const next: DragState = { ...d, x: e.clientX, y: e.clientY, active: true }
      dragRef.current = next
      if (!wasActive) {
        setDrag(next)
      }

      if (d.type === 'card' || d.type === 'multi') {
        const el = document.elementFromPoint(e.clientX, e.clientY)

        // 1. Check if hovering directly over an empty group drop zone
        const groupDropZone = el?.closest('[data-group-drop-zone="true"]') as HTMLElement | null
        if (groupDropZone) {
          const col = (groupDropZone.dataset.column || 'planned') as ColumnId
          const groupTag = groupDropZone.dataset.groupTag || ''
          const isUntagged = groupDropZone.dataset.groupIsUntagged === 'true'
          const groupColor = groupDropZone.dataset.groupColor || undefined
          const target: HoverTarget = {
            type: 'group',
            groupTag,
            isUntagged,
            col,
            groupColor
          }
          updateHoverTarget(target)
          updateHoverColumn(col)
          return
        }

        // 2. Check if hovering directly over another group's header bar
        const groupHeaderEl = el?.closest('[data-group-header="true"]') as HTMLElement | null
        if (groupHeaderEl) {
          const groupContainer = groupHeaderEl.closest(
            '[data-group-container="true"]'
          ) as HTMLElement | null
          if (groupContainer) {
            const col = (groupContainer.dataset.column || 'planned') as ColumnId
            const groupTag = groupContainer.dataset.groupTag || ''
            const isUntagged = groupContainer.dataset.groupIsUntagged === 'true'
            const groupColor = groupContainer.dataset.groupColor || undefined
            const isSameGroupSameCol =
              col === d.sourceCol &&
              (d.payload.groupTag?.toLowerCase() === groupTag.toLowerCase() ||
                (!d.payload.groupTag && isUntagged))
            if (!isSameGroupSameCol) {
              const target: HoverTarget = {
                type: 'group',
                groupTag,
                isUntagged,
                col,
                groupColor
              }
              updateHoverTarget(target)
              updateHoverColumn(col)
              return
            }
          }
        }

        // 3. Card detection: direct card hit
        let cardEl = el?.closest('[data-task-card="true"]') as HTMLElement | null
        if (
          cardEl &&
          cardEl.dataset.goalId &&
          (cardEl.dataset.goalId === d.payload.id ||
            d.payload.sourceGoalIds?.includes(cardEl.dataset.goalId))
        ) {
          cardEl = null
        }

        const col = (cardEl?.dataset.column as ColumnId) || detectColumn(e.clientX, e.clientY)
        updateHoverColumn(col)

        if (cardEl && cardEl.dataset.goalId) {
          const rect = cardEl.getBoundingClientRect()
          const midY = rect.top + rect.height / 2
          const position: 'before' | 'after' = e.clientY < midY ? 'before' : 'after'
          const targetGoalId = cardEl.dataset.goalId
          const groupTag = cardEl.dataset.groupTag || undefined
          const groupColor = cardEl.dataset.groupColor || undefined
          const target: HoverTarget = {
            type: 'card',
            targetGoalId,
            position,
            col: (cardEl.dataset.column || col || 'planned') as ColumnId,
            groupTag,
            groupColor
          }
          updateHoverTarget(target)
          return
        }

        // 4. In a column (e.g. between cards, padding, or empty space)
        if (col) {
          const now = Date.now()
          let cards =
            cachedColumnCards &&
            cachedColumnCards.col === col &&
            now - cachedColumnCards.timestamp < 100
              ? cachedColumnCards.cards
              : null

          if (!cards) {
            const rawCards = Array.from(
              document.querySelectorAll<HTMLElement>(
                `[data-task-card="true"][data-column="${col}"]`
              )
            ).filter(
              (c) =>
                c.dataset.goalId &&
                c.dataset.goalId !== d.payload.id &&
                !d.payload.sourceGoalIds?.includes(c.dataset.goalId)
            )

            cards = rawCards.map((c) => ({
              el: c,
              goalId: c.dataset.goalId!,
              groupTag: c.dataset.groupTag || undefined,
              groupColor: c.dataset.groupColor || undefined,
              rect: c.getBoundingClientRect()
            }))

            cachedColumnCards = {
              col,
              timestamp: now,
              cards
            }
          }

          if (cards.length > 0) {
            const firstRect = cards[0].rect
            const lastRect = cards[cards.length - 1].rect

            let bestCard = cards[0]
            let position: 'before' | 'after' = 'before'

            if (e.clientY <= firstRect.top + 8) {
              bestCard = cards[0]
              position = 'before'
            } else if (e.clientY >= lastRect.bottom - 8) {
              bestCard = cards[cards.length - 1]
              position = 'after'
            } else {
              let minDistance = Infinity
              for (const c of cards) {
                const midY = c.rect.top + c.rect.height / 2
                const dist = Math.abs(e.clientY - midY)
                if (dist < minDistance) {
                  minDistance = dist
                  bestCard = c
                  position = e.clientY < midY ? 'before' : 'after'
                }
              }
            }

            const target: HoverTarget = {
              type: 'card',
              targetGoalId: bestCard.goalId,
              position,
              col,
              groupTag: bestCard.groupTag,
              groupColor: bestCard.groupColor
            }
            updateHoverTarget(target)
            return
          } else {
            const target: HoverTarget = { type: 'column', col }
            updateHoverTarget(target)
            return
          }
        }

        updateHoverTarget(null)
      } else if (d.type === 'group') {
        const el = document.elementFromPoint(e.clientX, e.clientY)

        const groupEl = el?.closest('[data-group-container="true"]') as HTMLElement | null
        if (groupEl) {
          const col = (groupEl.dataset.column || 'planned') as ColumnId
          const groupTag = groupEl.dataset.groupTag || ''
          const isUntagged = groupEl.dataset.groupIsUntagged === 'true'

          const isSameGroupSameCol =
            col === d.sourceCol &&
            (d.payload.isUntagged
              ? isUntagged
              : groupTag.toLowerCase() === d.payload.title.toLowerCase())

          if (!isSameGroupSameCol) {
            const rect = groupEl.getBoundingClientRect()
            const midY = rect.top + rect.height / 2
            const position: 'before' | 'after' = e.clientY < midY ? 'before' : 'after'
            const target: GroupHoverTarget = {
              type: 'group',
              targetGroupTag: groupTag,
              isUntagged,
              col,
              position
            }
            updateHoverGroupTarget(target)
            updateHoverColumn(col)
            return
          }
        }

        const colEl = el?.closest('[data-column-surface="true"]') as HTMLElement | null
        const detectedCol =
          (colEl?.dataset.column as ColumnId) || detectColumn(e.clientX, e.clientY)
        updateHoverColumn(detectedCol)
        if (detectedCol) {
          const target: GroupHoverTarget = { type: 'column', col: detectedCol }
          updateHoverGroupTarget(target)
        } else {
          updateHoverGroupTarget(null)
        }
      }
    }

    const flushMove = (): void => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
        rafId = null
      }
      if (latestMoveEvent) {
        processMove(latestMoveEvent)
        latestMoveEvent = null
      }
    }

    const onMove = (e: PointerEvent): void => {
      const d = dragRef.current
      if (!d) return

      lastPointerPos.x = e.clientX
      lastPointerPos.y = e.clientY

      const moveDist = Math.abs(e.clientX - d.originX) + Math.abs(e.clientY - d.originY)
      if (moveDist > 3 && longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current)
        longPressTimerRef.current = null
      }

      if (!d.active && moveDist < DRAG_THRESHOLD) return

      // Transition to active immediately so drag begins without jitter
      if (!d.active) {
        processMove(e)
        startAutoScroll()
        return
      }

      startAutoScroll()

      // Subsequent moves throttled to animation frame rate
      latestMoveEvent = e
      if (rafId === null) {
        rafId = requestAnimationFrame(() => {
          rafId = null
          if (latestMoveEvent) {
            processMove(latestMoveEvent)
            latestMoveEvent = null
          }
        })
      }
    }

    const onUp = async (e: PointerEvent): Promise<void> => {
      stopAutoScroll()
      flushMove()
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current)
        longPressTimerRef.current = null
      }
      try {
        if (e.target && (e.target as HTMLElement).hasPointerCapture?.(e.pointerId)) {
          ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
        }
      } catch {
        // ignore
      }

      const d = dragRef.current
      const ht = hoverTargetRef.current
      const hgt = hoverGroupTargetRef.current

      if (d && d.active) {
        didDragOccurRef.current = true
        setTimeout(() => {
          didDragOccurRef.current = false
        }, 120)
      }

      cachedColumnCards = null
      cachedColumnRectsRef.current.clear()
      dragRef.current = null
      hoverTargetRef.current = null
      hoverGroupTargetRef.current = null
      setDrag(null)
      setHoverColumn(null)
      setHoverTarget(null)
      setHoverGroupTarget(null)

      if (!d || !d.active) {
        if (longPressTriggeredRef.current) {
          setTimeout(() => {
            longPressTriggeredRef.current = false
          }, 80)
        }
        return
      }

      isDropProcessingRef.current = true
      try {
        // Single card drop
        if (d.type === 'card' && d.payload.id) {
          const draggedGoal = dailyGoalsRef.current.find((g) => g.id === d.payload.id)
          if (!draggedGoal) return

          if (ht?.type === 'card') {
            const targetGoal = dailyGoalsRef.current.find((g) => g.id === ht.targetGoalId)
            if (!targetGoal) return

            const targetCol = ht.col
            const targetStatus =
              COLUMNS.find((c) => c.id === targetCol)?.status || targetGoal.status
            const targetTag = ht.groupTag?.trim() || undefined
            const targetColor = targetTag
              ? ht.groupColor || targetGoal.groupColor || getPreferredGroupColor(targetTag)
              : undefined

            const currentGoalsInCol = getFullGoalsForColumn(targetCol, [draggedGoal.id])
            const targetIndex = currentGoalsInCol.findIndex((g) => g.id === targetGoal.id)
            const insertIndex =
              targetIndex >= 0
                ? ht.position === 'before'
                  ? targetIndex
                  : targetIndex + 1
                : currentGoalsInCol.length

            const now = new Date().toISOString()
            const updatedDragged: DailyGoal = {
              ...draggedGoal,
              status: targetStatus,
              groupTag: targetTag,
              groupColor: targetColor,
              completedAt: targetStatus === 'done' ? draggedGoal.completedAt || now : undefined
            }

            const fractionalOrder = calculateFractionalSortOrders(currentGoalsInCol, insertIndex, 1)

            setSortOption('manual')
            if (fractionalOrder !== null) {
              updatedDragged.sortOrder = fractionalOrder[0]
              applyLocalUpdates([updatedDragged])
              await updateMultipleGoals([updatedDragged])
            } else {
              isRebalancingRef.current = true
              const { changedGoals } = rebalanceGoals(currentGoalsInCol, insertIndex, [
                updatedDragged
              ])
              applyLocalUpdates(changedGoals)
              await updateMultipleGoals(changedGoals)
            }
            setSelectedGoalIds(new Set())
            const targetColTitle = COLUMNS.find((c) => c.id === targetCol)?.label || targetCol
            setAnnouncement(`Moved "${draggedGoal.title}" to ${targetColTitle}`)
            return
          }

          if (ht?.type === 'group') {
            const targetCol = ht.col
            const targetStatus =
              COLUMNS.find((c) => c.id === targetCol)?.status || draggedGoal.status
            const targetTag = ht.isUntagged ? undefined : ht.groupTag.trim()
            const targetColor = targetTag
              ? ht.groupColor || getPreferredGroupColor(targetTag)
              : undefined

            const currentGoalsInCol = getFullGoalsForColumn(targetCol, [draggedGoal.id])

            let insertIndex = currentGoalsInCol.length
            for (let i = currentGoalsInCol.length - 1; i >= 0; i--) {
              const gTag = currentGoalsInCol[i].groupTag?.trim()
              if (
                (targetTag && gTag && gTag.toLowerCase() === targetTag.toLowerCase()) ||
                (!targetTag && (!gTag || gTag.toLowerCase() === 'untagged'))
              ) {
                insertIndex = i + 1
                break
              }
            }

            const now = new Date().toISOString()
            const updatedDragged: DailyGoal = {
              ...draggedGoal,
              status: targetStatus,
              groupTag: targetTag,
              groupColor: targetColor,
              completedAt: targetStatus === 'done' ? draggedGoal.completedAt || now : undefined
            }

            const fractionalOrder = calculateFractionalSortOrders(currentGoalsInCol, insertIndex, 1)

            setSortOption('manual')
            if (fractionalOrder !== null) {
              updatedDragged.sortOrder = fractionalOrder[0]
              applyLocalUpdates([updatedDragged])
              await updateMultipleGoals([updatedDragged])
            } else {
              isRebalancingRef.current = true
              const { changedGoals } = rebalanceGoals(currentGoalsInCol, insertIndex, [
                updatedDragged
              ])
              applyLocalUpdates(changedGoals)
              await updateMultipleGoals(changedGoals)
            }
            setSelectedGoalIds(new Set())
            const targetColTitle = COLUMNS.find((c) => c.id === targetCol)?.label || targetCol
            setAnnouncement(`Moved "${draggedGoal.title}" to ${targetColTitle}`)
            return
          }

          const col =
            ht?.type === 'column' ? ht.col : detectColumn(e.clientX, e.clientY) || d.sourceCol
          if (col) {
            const targetStatus = COLUMNS.find((c) => c.id === col)?.status || draggedGoal.status

            const currentGoalsInCol = getFullGoalsForColumn(col, [draggedGoal.id])

            const now = new Date().toISOString()
            const updatedDragged: DailyGoal = {
              ...draggedGoal,
              status: targetStatus,
              completedAt: targetStatus === 'done' ? draggedGoal.completedAt || now : undefined
            }

            const insertIndex = currentGoalsInCol.length
            const fractionalOrder = calculateFractionalSortOrders(currentGoalsInCol, insertIndex, 1)

            if (d.sourceCol === col) {
              setSortOption('manual')
            }
            if (fractionalOrder !== null) {
              updatedDragged.sortOrder = fractionalOrder[0]
              applyLocalUpdates([updatedDragged])
              await updateMultipleGoals([updatedDragged])
            } else {
              isRebalancingRef.current = true
              const { changedGoals } = rebalanceGoals(currentGoalsInCol, insertIndex, [
                updatedDragged
              ])
              applyLocalUpdates(changedGoals)
              await updateMultipleGoals(changedGoals)
            }
            setSelectedGoalIds(new Set())
            const targetColTitle = COLUMNS.find((c) => c.id === col)?.label || col
            setAnnouncement(`Moved "${draggedGoal.title}" to ${targetColTitle}`)
            return
          }
        } else if (d.type === 'multi' && d.payload.sourceGoalIds) {
          const goalsToMove = dailyGoalsRef.current.filter((g) =>
            d.payload.sourceGoalIds?.includes(g.id)
          )
          if (goalsToMove.length === 0) return

          const targetCol: ColumnId = ht?.col || detectColumn(e.clientX, e.clientY) || d.sourceCol
          const targetStatus = COLUMNS.find((c) => c.id === targetCol)?.status || 'planned'
          const hasExplicitTargetGroup = ht?.type === 'card' || ht?.type === 'group'
          const isTargetUntagged = ht?.type === 'group' && Boolean(ht.isUntagged)
          const targetTag = hasExplicitTargetGroup
            ? isTargetUntagged
              ? undefined
              : ht.type === 'card' || ht.type === 'group'
                ? ht.groupTag?.trim()
                : undefined
            : undefined
          const targetColor =
            targetTag && (ht?.type === 'card' || ht?.type === 'group')
              ? ht.groupColor || getPreferredGroupColor(targetTag)
              : undefined

          const currentGoalsInCol = getFullGoalsForColumn(targetCol, d.payload.sourceGoalIds)

          let insertIndex = currentGoalsInCol.length
          if (ht?.type === 'card') {
            const targetIdx = currentGoalsInCol.findIndex((g) => g.id === ht.targetGoalId)
            if (targetIdx >= 0) {
              insertIndex = ht.position === 'before' ? targetIdx : targetIdx + 1
            }
          }

          const now = new Date().toISOString()
          const updatedDraggedTasks = goalsToMove.map((g) => ({
            ...g,
            status: targetStatus,
            completedAt: targetStatus === 'done' ? g.completedAt || now : undefined,
            ...(hasExplicitTargetGroup ? { groupTag: targetTag, groupColor: targetColor } : {})
          }))

          const fractionalOrders = calculateFractionalSortOrders(
            currentGoalsInCol,
            insertIndex,
            updatedDraggedTasks.length
          )

          setSortOption('manual')
          if (fractionalOrders !== null) {
            const goalsWithOrders = updatedDraggedTasks.map((g, idx) => ({
              ...g,
              sortOrder: fractionalOrders[idx]
            }))
            applyLocalUpdates(goalsWithOrders)
            await updateMultipleGoals(goalsWithOrders)
          } else {
            isRebalancingRef.current = true
            const { changedGoals } = rebalanceGoals(
              currentGoalsInCol,
              insertIndex,
              updatedDraggedTasks
            )
            applyLocalUpdates(changedGoals)
            await updateMultipleGoals(changedGoals)
          }
          setSelectedGoalIds(new Set())
          const targetColTitle = COLUMNS.find((c) => c.id === targetCol)?.label || targetCol
          setAnnouncement(
            `Moved ${updatedDraggedTasks.length === 1 ? `"${updatedDraggedTasks[0].title}"` : `${updatedDraggedTasks.length} tasks`} to ${targetColTitle}`
          )
          return
        } else if (d.type === 'group' && d.payload.sourceGoalIds) {
          const goalsToMove = dailyGoalsRef.current.filter((g) =>
            d.payload.sourceGoalIds?.includes(g.id)
          )
          if (goalsToMove.length === 0) return

          if (hgt?.type === 'group') {
            const targetCol = hgt.col
            const targetStatus = COLUMNS.find((c) => c.id === targetCol)?.status || 'planned'
            const now = new Date().toISOString()

            const updatedDraggedTasks = goalsToMove.map((g) => ({
              ...g,
              status: targetStatus,
              completedAt: targetStatus === 'done' ? g.completedAt || now : undefined
            }))

            const currentGoalsInTargetCol = getFullGoalsForColumn(
              targetCol,
              d.payload.sourceGoalIds
            )

            let insertIndex = currentGoalsInTargetCol.length
            if (hgt.position === 'before') {
              const firstIdx = currentGoalsInTargetCol.findIndex((g) =>
                hgt.isUntagged
                  ? !g.groupTag?.trim() || g.groupTag.trim().toLowerCase() === 'untagged'
                  : g.groupTag?.trim().toLowerCase() === hgt.targetGroupTag.toLowerCase()
              )
              if (firstIdx >= 0) insertIndex = firstIdx
            } else {
              let lastIdx = -1
              for (let i = currentGoalsInTargetCol.length - 1; i >= 0; i--) {
                const g = currentGoalsInTargetCol[i]
                const match = hgt.isUntagged
                  ? !g.groupTag?.trim() || g.groupTag.trim().toLowerCase() === 'untagged'
                  : g.groupTag?.trim().toLowerCase() === hgt.targetGroupTag.toLowerCase()
                if (match) {
                  lastIdx = i
                  break
                }
              }
              if (lastIdx >= 0) insertIndex = lastIdx + 1
            }

            const fractionalOrders = calculateFractionalSortOrders(
              currentGoalsInTargetCol,
              insertIndex,
              updatedDraggedTasks.length
            )

            setSortOption('manual')
            if (fractionalOrders !== null) {
              const goalsWithOrders = updatedDraggedTasks.map((g, idx) => ({
                ...g,
                sortOrder: fractionalOrders[idx]
              }))
              applyLocalUpdates(goalsWithOrders)
              await updateMultipleGoals(goalsWithOrders)
            } else {
              isRebalancingRef.current = true
              const { changedGoals } = rebalanceGoals(
                currentGoalsInTargetCol,
                insertIndex,
                updatedDraggedTasks
              )
              applyLocalUpdates(changedGoals)
              await updateMultipleGoals(changedGoals)
            }
            setSelectedGoalIds(new Set())
            const targetColTitle = COLUMNS.find((c) => c.id === targetCol)?.label || targetCol
            const groupTitle = d.payload.isUntagged
              ? 'Untagged'
              : d.payload.title || d.payload.groupTag || 'group'
            setAnnouncement(`Moved "${groupTitle}" group to ${targetColTitle}`)
            return
          }

          const targetCol = hgt?.type === 'column' ? hgt.col : detectColumn(e.clientX, e.clientY)
          if (targetCol && targetCol !== d.sourceCol) {
            const targetStatus = COLUMNS.find((c) => c.id === targetCol)?.status
            if (!targetStatus) return
            setSortOption('manual')
            applyLocalUpdates(goalsToMove.map((g) => ({ ...g, status: targetStatus })))
            await moveWholeGroup(goalsToMove, targetStatus)
            setSelectedGoalIds(new Set())
            const targetColTitle = COLUMNS.find((c) => c.id === targetCol)?.label || targetCol
            const groupTitle = d.payload.isUntagged
              ? 'Untagged'
              : d.payload.title || d.payload.groupTag || 'group'
            setAnnouncement(`Moved "${groupTitle}" group to ${targetColTitle}`)
          }
        }
      } finally {
        isDropProcessingRef.current = false
        isRebalancingRef.current = false
      }
    }

    const onCancel = (e: PointerEvent): void => {
      stopAutoScroll()
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current)
        longPressTimerRef.current = null
      }
      try {
        if (e.target && (e.target as HTMLElement).hasPointerCapture?.(e.pointerId)) {
          ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
        }
      } catch {
        // ignore
      }
      cachedColumnCards = null
      cachedColumnRectsRef.current.clear()
      dragRef.current = null
      hoverTargetRef.current = null
      hoverGroupTargetRef.current = null
      setDrag(null)
      setHoverColumn(null)
      setHoverTarget(null)
      setHoverGroupTarget(null)
      longPressTriggeredRef.current = false
      didDragOccurRef.current = false
      setAnnouncement('Drag cancelled.')
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    return () => {
      stopAutoScroll()
      cachedColumnCards = null
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
        rafId = null
      }
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- drag movement is tracked via dragRef to prevent re-binding listeners on each pixel moved
  }, [
    isDragging,
    detectColumn,
    moveWholeGroup,
    updateMultipleGoals,
    groupByTag,
    setSortOption,
    setSelectedGoalIds,
    updateHoverColumn,
    updateHoverGroupTarget,
    updateHoverTarget
  ])

  return {
    drag,
    hoverColumn,
    hoverTarget,
    hoverGroupTarget,
    registerColumn,
    isValidTarget,
    isHovering,
    onPointerDownCard,
    onPointerDownGroup,
    longPressTriggeredRef,
    didDragOccurRef,
    announcement
  }
}
