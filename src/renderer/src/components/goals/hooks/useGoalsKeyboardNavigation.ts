import { useCallback, useEffect, useRef, useState } from 'react'
import { DailyGoal, DEFAULT_SORT_ORDER } from '../../../../../shared/types'
import { ColumnId, COLUMNS } from '../types'
import { useToast } from '../../../lib/useToast'
import { calculateFractionalSortOrders, rebalanceGoals } from '../fractionalIndex'

export interface UseGoalsKeyboardNavigationProps {
  isActive?: boolean
  isDragging?: boolean
  hasOpenModal?: boolean
  onCloseOverlays: () => boolean
  visibleGoals: DailyGoal[]
  dailyGoals: DailyGoal[]
  selectedGoalIds: Set<string>
  setSelectedGoalIds: React.Dispatch<React.SetStateAction<Set<string>>>
  setLastSelectedGoalId?: React.Dispatch<React.SetStateAction<string | null>>
  editingId: string | null
  setEditingId: React.Dispatch<React.SetStateAction<string | null>>
  showAddCol: 'planned' | 'in_progress' | null
  setShowAddCol: React.Dispatch<React.SetStateAction<'planned' | 'in_progress' | null>>
  toggleFocusMode: () => void
  toggleCollapse: (colId: ColumnId) => void
  toggleSelectGoal: (goalId: string, isShift: boolean, isSpace: boolean) => void
  startEdit: (goal: DailyGoal) => void
  deleteGoal: (goal: DailyGoal) => void
  moveGoal: (goal: DailyGoal, newStatus: DailyGoal['status']) => void
  onReorderGoal?: (goalsToUpdate: DailyGoal[]) => Promise<void> | void
  handleBulkMoveStatus: (status: ColumnId) => void
  setBulkDeleteModalOpen: (open: boolean) => void
  onAnnounce?: (message: string) => void
  setQuickEstimatePopover?: (popover: { goal: DailyGoal; x: number; y: number } | null) => void
}

export interface UseGoalsKeyboardNavigationReturn {
  activeGoalId: string | null
  setActiveGoalId: React.Dispatch<React.SetStateAction<string | null>>
  showShortcutsHelp: boolean
  setShowShortcutsHelp: React.Dispatch<React.SetStateAction<boolean>>
  scrollCardIntoView: (goalId: string) => void
}

export function useGoalsKeyboardNavigation({
  isActive = true,
  isDragging = false,
  hasOpenModal = false,
  onCloseOverlays,
  visibleGoals,
  dailyGoals,
  selectedGoalIds,
  setSelectedGoalIds,
  setLastSelectedGoalId,
  editingId,
  setEditingId,
  showAddCol,
  setShowAddCol,
  toggleFocusMode,
  toggleCollapse,
  toggleSelectGoal,
  startEdit,
  deleteGoal,
  moveGoal,
  onReorderGoal,
  handleBulkMoveStatus,
  setBulkDeleteModalOpen,
  onAnnounce,
  setQuickEstimatePopover
}: UseGoalsKeyboardNavigationProps): UseGoalsKeyboardNavigationReturn {
  const toast = useToast()
  const [activeGoalId, setActiveGoalId] = useState<string | null>(null)
  const [showShortcutsHelp, setShowShortcutsHelp] = useState<boolean>(false)

  const onAnnounceRef = useRef(onAnnounce)
  useEffect(() => {
    onAnnounceRef.current = onAnnounce
  }, [onAnnounce])

  const onReorderGoalRef = useRef(onReorderGoal)
  useEffect(() => {
    onReorderGoalRef.current = onReorderGoal
  }, [onReorderGoal])

  // Refs to prevent stale closures in event listeners
  const visibleGoalsRef = useRef<DailyGoal[]>(visibleGoals)
  useEffect(() => {
    visibleGoalsRef.current = visibleGoals
  }, [visibleGoals])

  const dailyGoalsRef = useRef<DailyGoal[]>(dailyGoals)
  useEffect(() => {
    dailyGoalsRef.current = dailyGoals
  }, [dailyGoals])

  const getFullGoalsForColumn = useCallback((col: ColumnId): DailyGoal[] => {
    const targetStatus = COLUMNS.find((c) => c.id === col)?.status || col
    const goals = dailyGoalsRef.current.filter((g) => g.status === targetStatus)
    goals.sort((a, b) => {
      const orderA = typeof a.sortOrder === 'number' ? a.sortOrder : DEFAULT_SORT_ORDER
      const orderB = typeof b.sortOrder === 'number' ? b.sortOrder : DEFAULT_SORT_ORDER
      if (orderA !== orderB) return orderA - orderB
      return a.createdAt.localeCompare(b.createdAt)
    })
    return goals
  }, [])

  const activeGoalIdRef = useRef<string | null>(activeGoalId)
  useEffect(() => {
    activeGoalIdRef.current = activeGoalId
  }, [activeGoalId])

  const selectedGoalIdsRef = useRef<Set<string>>(selectedGoalIds)
  useEffect(() => {
    selectedGoalIdsRef.current = selectedGoalIds
  }, [selectedGoalIds])

  const editingIdRef = useRef<string | null>(editingId)
  useEffect(() => {
    editingIdRef.current = editingId
  }, [editingId])

  const showAddColRef = useRef<'planned' | 'in_progress' | null>(showAddCol)
  useEffect(() => {
    showAddColRef.current = showAddCol
  }, [showAddCol])

  const showShortcutsHelpRef = useRef<boolean>(showShortcutsHelp)
  useEffect(() => {
    showShortcutsHelpRef.current = showShortcutsHelp
  }, [showShortcutsHelp])

  // Smooth scroll and focus helper for keyboard focused card
  const scrollCardIntoView = useCallback((goalId: string) => {
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-goal-id="${goalId}"]`)
      if (el) {
        el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
        if (typeof el.focus === 'function') {
          if (!el.hasAttribute('tabindex')) {
            el.setAttribute('tabindex', '0')
          }
          el.focus({ preventScroll: true })
        }
      }
    })
  }, [])

  // Auto-clear activeGoalId if the focused task no longer exists
  useEffect(() => {
    if (activeGoalId && !dailyGoals.some((g) => g.id === activeGoalId)) {
      setActiveGoalId(null)
    }
  }, [dailyGoals, activeGoalId])

  const callbacksRef = useRef({
    isActive,
    isDragging,
    hasOpenModal,
    onCloseOverlays,
    getFullGoalsForColumn,
    toggleFocusMode,
    toggleCollapse,
    toggleSelectGoal,
    startEdit,
    deleteGoal,
    moveGoal,
    handleBulkMoveStatus,
    setBulkDeleteModalOpen,
    scrollCardIntoView,
    setEditingId,
    setShowAddCol,
    setSelectedGoalIds,
    setLastSelectedGoalId,
    setQuickEstimatePopover,
    toast
  })

  useEffect(() => {
    callbacksRef.current = {
      isActive,
      isDragging,
      hasOpenModal,
      onCloseOverlays,
      getFullGoalsForColumn,
      toggleFocusMode,
      toggleCollapse,
      toggleSelectGoal,
      startEdit,
      deleteGoal,
      moveGoal,
      handleBulkMoveStatus,
      setBulkDeleteModalOpen,
      scrollCardIntoView,
      setEditingId,
      setShowAddCol,
      setSelectedGoalIds,
      setLastSelectedGoalId,
      setQuickEstimatePopover,
      toast
    }
  })

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      const {
        isActive: activeState,
        isDragging: draggingState,
        hasOpenModal: modalState,
        onCloseOverlays,
        getFullGoalsForColumn,
        toggleFocusMode,
        toggleCollapse,
        toggleSelectGoal,
        startEdit,
        deleteGoal,
        moveGoal,
        handleBulkMoveStatus,
        setBulkDeleteModalOpen,
        scrollCardIntoView,
        setEditingId,
        setShowAddCol,
        setSelectedGoalIds,
        setLastSelectedGoalId,
        toast
      } = callbacksRef.current

      // Early exit if board is not active (e.g. user is on Today, Review, or Settings tab)
      if (!activeState) return

      // 1. Escape key has top priority for dismissal
      if (e.key === 'Escape') {
        if (showShortcutsHelpRef.current) {
          setShowShortcutsHelp(false)
          return
        }

        const hadOpenOverlay = onCloseOverlays()

        if (!hadOpenOverlay) {
          if (editingIdRef.current) {
            setEditingId(null)
          } else if (showAddColRef.current) {
            setShowAddCol(null)
          } else if (selectedGoalIdsRef.current.size > 0) {
            setSelectedGoalIds(new Set())
            setLastSelectedGoalId?.(null)
          } else if (activeGoalIdRef.current) {
            setActiveGoalId(null)
          }
        }
        return
      }

      // Ignore keystrokes when typing inside text inputs, textareas, or contentEditable elements
      const target =
        typeof (e.target as Element | null)?.closest === 'function'
          ? (e.target as HTMLElement)
          : (document.activeElement as HTMLElement | null)
      const targetTag = (target?.tagName || '').toLowerCase()
      const isEditable =
        targetTag === 'input' ||
        targetTag === 'textarea' ||
        targetTag === 'select' ||
        Boolean(target?.isContentEditable) ||
        Boolean(
          typeof target?.closest === 'function' &&
          target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')
        )

      if (isEditable) return

      // Check if active target is inside a goal card or the card container itself
      const cardElement =
        typeof target?.closest === 'function'
          ? target.closest<HTMLElement>('[data-goal-card], [data-task-card], [data-goal-id]')
          : null
      const isCardElement = Boolean(cardElement)
      const cardGoalId =
        cardElement?.getAttribute('data-goal-id') ||
        (typeof target?.closest === 'function'
          ? target.closest<HTMLElement>('[data-goal-id]')?.getAttribute('data-goal-id')
          : null) ||
        null

      // Check whether target itself is an interactive UI control (button, link, menu, etc.)
      const isInteractiveControl =
        targetTag === 'button' ||
        targetTag === 'summary' ||
        targetTag === 'a' ||
        Boolean(
          typeof target?.closest === 'function' &&
          target.closest(
            'button, [role="button"], summary, a, [role="tab"], [role="menuitem"], [role="combobox"], [role="slider"]'
          )
        )

      // Prevent hijacking interactive UI controls outside goal cards
      if (!isCardElement && isInteractiveControl) return

      const blurCardButtonIfFocused = (): void => {
        if (
          isCardElement &&
          target &&
          (targetTag === 'button' || Boolean(target.closest('button, [role="button"]')))
        ) {
          if (cardElement && typeof cardElement.focus === 'function') {
            if (!cardElement.hasAttribute('tabindex')) {
              cardElement.setAttribute('tabindex', '0')
            }
            cardElement.focus({ preventScroll: true })
          } else if (typeof target.blur === 'function') {
            target.blur()
          }
        }
      }

      // Ignore if dragging or if any modal dialog is currently open
      if (
        draggingState ||
        modalState ||
        Boolean(document.querySelector('[role="dialog"][aria-modal="true"]'))
      )
        return

      // Ctrl+A / Cmd+A: Select all visible cards
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        const allVisibleIds = visibleGoalsRef.current.map((g) => g.id)
        setSelectedGoalIds(new Set(allVisibleIds))
        return
      }

      // '?' or Shift+'/': Toggle Keyboard Shortcuts Sheet
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault()
        setShowShortcutsHelp((prev) => !prev)
        return
      }

      // If shortcuts dialog is open, don't execute other board shortcuts
      if (showShortcutsHelpRef.current) return

      // Focus Mode & Column Collapsing (Shift+F for Focus Mode, Shift+A/S/D for column collapse)
      if (!e.ctrlKey && !e.metaKey && !e.altKey && e.shiftKey) {
        const keyLower = e.key.toLowerCase()
        if (keyLower === 'f') {
          e.preventDefault()
          toggleFocusMode()
          return
        } else if (keyLower === 'a') {
          e.preventDefault()
          toggleCollapse('planned')
          return
        } else if (keyLower === 's') {
          e.preventDefault()
          toggleCollapse('in_progress')
          return
        } else if (keyLower === 'd') {
          e.preventDefault()
          toggleCollapse('done')
          return
        }
      }

      // Reorder: Alt+ArrowUp or Alt+k (Move card up in column)
      if (
        e.altKey &&
        (e.key === 'ArrowUp' || e.key.toLowerCase() === 'k') &&
        !e.ctrlKey &&
        !e.metaKey
      ) {
        blurCardButtonIfFocused()
        e.preventDefault()
        const currId = activeGoalIdRef.current || cardGoalId
        if (!currId) return
        const goal = dailyGoalsRef.current.find((g) => g.id === currId)
        if (!goal) return

        const col = goal.status as ColumnId
        const visibleColGoals = visibleGoalsRef.current.filter((g) => g.status === col)
        const visibleIdx = visibleColGoals.findIndex((g) => g.id === goal.id)
        if (visibleIdx <= 0) {
          toast.info(
            `"${goal.title}" is already at top of ${col.replace('_', ' ')}`,
            'Already at Top'
          )
          return
        }

        const prevVisibleGoal = visibleColGoals[visibleIdx - 1]
        const allColGoals = getFullGoalsForColumn(col)
        const remainingAll = allColGoals.filter((g) => g.id !== goal.id)
        const targetIdxInAll = remainingAll.findIndex((g) => g.id === prevVisibleGoal.id)
        const targetIdx = targetIdxInAll >= 0 ? targetIdxInAll : Math.max(0, visibleIdx - 1)

        const newOrders = calculateFractionalSortOrders(remainingAll, targetIdx, 1)

        if (newOrders && newOrders.length === 1) {
          const updated = { ...goal, sortOrder: newOrders[0] }
          onReorderGoalRef.current?.([updated])
          toast.success(`Moved "${goal.title}" up`, 'Task Reordered')
          onAnnounceRef.current?.(`Moved "${goal.title}" up`)
        } else {
          const rebalanced = rebalanceGoals(remainingAll, targetIdx, [goal])
          onReorderGoalRef.current?.(rebalanced.changedGoals)
          toast.success(`Moved "${goal.title}" up`, 'Task Reordered')
          onAnnounceRef.current?.(`Moved "${goal.title}" up`)
        }
        scrollCardIntoView(goal.id)
        return
      }

      // Reorder: Alt+ArrowDown or Alt+j (Move card down in column)
      if (
        e.altKey &&
        (e.key === 'ArrowDown' || e.key.toLowerCase() === 'j') &&
        !e.ctrlKey &&
        !e.metaKey
      ) {
        blurCardButtonIfFocused()
        e.preventDefault()
        const currId = activeGoalIdRef.current || cardGoalId
        if (!currId) return
        const goal = dailyGoalsRef.current.find((g) => g.id === currId)
        if (!goal) return

        const col = goal.status as ColumnId
        const visibleColGoals = visibleGoalsRef.current.filter((g) => g.status === col)
        const visibleIdx = visibleColGoals.findIndex((g) => g.id === goal.id)
        if (visibleIdx === -1 || visibleIdx >= visibleColGoals.length - 1) {
          toast.info(
            `"${goal.title}" is already at bottom of ${col.replace('_', ' ')}`,
            'Already at Bottom'
          )
          return
        }

        const nextVisibleGoal = visibleColGoals[visibleIdx + 1]
        const allColGoals = getFullGoalsForColumn(col)
        const remainingAll = allColGoals.filter((g) => g.id !== goal.id)
        const targetIdxInAll = remainingAll.findIndex((g) => g.id === nextVisibleGoal.id)
        const targetIdx = targetIdxInAll >= 0 ? targetIdxInAll + 1 : remainingAll.length

        const newOrders = calculateFractionalSortOrders(remainingAll, targetIdx, 1)

        if (newOrders && newOrders.length === 1) {
          const updated = { ...goal, sortOrder: newOrders[0] }
          onReorderGoalRef.current?.([updated])
          toast.success(`Moved "${goal.title}" down`, 'Task Reordered')
          onAnnounceRef.current?.(`Moved "${goal.title}" down`)
        } else {
          const rebalanced = rebalanceGoals(remainingAll, targetIdx, [goal])
          onReorderGoalRef.current?.(rebalanced.changedGoals)
          toast.success(`Moved "${goal.title}" down`, 'Task Reordered')
          onAnnounceRef.current?.(`Moved "${goal.title}" down`)
        }
        scrollCardIntoView(goal.id)
        return
      }

      // Navigation: 'j' or Down Arrow (Next Card)
      if (
        (e.key.toLowerCase() === 'j' || e.key === 'ArrowDown') &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        blurCardButtonIfFocused()
        e.preventDefault()
        const list = visibleGoalsRef.current
        if (list.length === 0) return

        let nextIdx = 0
        const currId = activeGoalIdRef.current || cardGoalId
        if (currId) {
          const currIdx = list.findIndex((g) => g.id === currId)
          if (currIdx !== -1) {
            nextIdx = Math.min(currIdx + 1, list.length - 1)
          }
        }
        const nextGoal = list[nextIdx]
        if (nextGoal) {
          setActiveGoalId(nextGoal.id)
          if (e.shiftKey) {
            toggleSelectGoal(nextGoal.id, true, false)
          }
          scrollCardIntoView(nextGoal.id)
        }
        return
      }

      // Navigation: 'k' or Up Arrow (Previous Card)
      if (
        (e.key.toLowerCase() === 'k' || e.key === 'ArrowUp') &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        blurCardButtonIfFocused()
        e.preventDefault()
        const list = visibleGoalsRef.current
        if (list.length === 0) return

        let nextIdx = list.length - 1
        const currId = activeGoalIdRef.current || cardGoalId
        if (currId) {
          const currIdx = list.findIndex((g) => g.id === currId)
          if (currIdx !== -1) {
            nextIdx = Math.max(currIdx - 1, 0)
          }
        }
        const nextGoal = list[nextIdx]
        if (nextGoal) {
          setActiveGoalId(nextGoal.id)
          if (e.shiftKey) {
            toggleSelectGoal(nextGoal.id, true, false)
          }
          scrollCardIntoView(nextGoal.id)
        }
        return
      }

      // Navigation: 'l' or Right Arrow (Switch Column Right)
      if (
        (e.key.toLowerCase() === 'l' || e.key === 'ArrowRight') &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        blurCardButtonIfFocused()
        e.preventDefault()
        const list = visibleGoalsRef.current
        if (list.length === 0) return
        const colOrder: ColumnId[] = ['planned', 'in_progress', 'done']

        const currId = activeGoalIdRef.current || cardGoalId
        const currGoal = list.find((g) => g.id === currId)
        if (!currGoal) {
          setActiveGoalId(list[0].id)
          scrollCardIntoView(list[0].id)
          return
        }

        const currCol = currGoal.status as ColumnId
        const currColIdx = colOrder.indexOf(currCol)
        if (currColIdx === -1) return

        for (let nextColIdx = currColIdx + 1; nextColIdx < colOrder.length; nextColIdx++) {
          const targetCol = colOrder[nextColIdx]
          const targetGoals = list.filter((g) => g.status === targetCol)
          if (targetGoals.length > 0) {
            const currColGoals = list.filter((g) => g.status === currCol)
            const currIdxInCol = currColGoals.findIndex((g) => g.id === currGoal.id)
            const targetIdx = Math.min(Math.max(0, currIdxInCol), targetGoals.length - 1)
            const targetGoal = targetGoals[targetIdx]
            setActiveGoalId(targetGoal.id)
            if (e.shiftKey) {
              toggleSelectGoal(targetGoal.id, true, false)
            }
            scrollCardIntoView(targetGoal.id)
            break
          }
        }
        return
      }

      // Navigation: 'h' or Left Arrow (Switch Column Left)
      if (
        (e.key.toLowerCase() === 'h' || e.key === 'ArrowLeft') &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        blurCardButtonIfFocused()
        e.preventDefault()
        const list = visibleGoalsRef.current
        if (list.length === 0) return
        const colOrder: ColumnId[] = ['planned', 'in_progress', 'done']

        const currId = activeGoalIdRef.current || cardGoalId
        const currGoal = list.find((g) => g.id === currId)
        if (!currGoal) {
          setActiveGoalId(list[0].id)
          scrollCardIntoView(list[0].id)
          return
        }

        const currCol = currGoal.status as ColumnId
        const currColIdx = colOrder.indexOf(currCol)
        if (currColIdx === -1) return

        for (let prevColIdx = currColIdx - 1; prevColIdx >= 0; prevColIdx--) {
          const targetCol = colOrder[prevColIdx]
          const targetGoals = list.filter((g) => g.status === targetCol)
          if (targetGoals.length > 0) {
            const currColGoals = list.filter((g) => g.status === currCol)
            const currIdxInCol = currColGoals.findIndex((g) => g.id === currGoal.id)
            const targetIdx = Math.min(Math.max(0, currIdxInCol), targetGoals.length - 1)
            const targetGoal = targetGoals[targetIdx]
            setActiveGoalId(targetGoal.id)
            if (e.shiftKey) {
              toggleSelectGoal(targetGoal.id, true, false)
            }
            scrollCardIntoView(targetGoal.id)
            break
          }
        }
        return
      }

      // Navigation: Home / End (First / Last Card)
      if (e.key === 'Home') {
        blurCardButtonIfFocused()
        e.preventDefault()
        const list = visibleGoalsRef.current
        if (list.length > 0) {
          setActiveGoalId(list[0].id)
          scrollCardIntoView(list[0].id)
        }
        return
      }
      if (e.key === 'End') {
        blurCardButtonIfFocused()
        e.preventDefault()
        const list = visibleGoalsRef.current
        if (list.length > 0) {
          setActiveGoalId(list[list.length - 1].id)
          scrollCardIntoView(list[list.length - 1].id)
        }
        return
      }

      // Selection: Space (Toggle Selection)
      if (e.key === ' ' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (isInteractiveControl) return
        e.preventDefault()
        const currId = activeGoalIdRef.current || cardGoalId
        if (currId) {
          toggleSelectGoal(currId, e.shiftKey, true)
        } else {
          const list = visibleGoalsRef.current
          if (list.length > 0) {
            setActiveGoalId(list[0].id)
            toggleSelectGoal(list[0].id, false, true)
          }
        }
        return
      }

      // Focus Bulk Actions Toolbar: 'b' or 'Alt+b' when cards are selected
      const keyLower = e.key.toLowerCase()
      if (
        (keyLower === 'b' || (e.altKey && keyLower === 'b')) &&
        !e.ctrlKey &&
        !e.metaKey &&
        selectedGoalIdsRef.current.size > 0
      ) {
        e.preventDefault()
        const toolbar = document.getElementById('goals-bulk-actions-toolbar')
        if (toolbar) {
          const firstInteractive = toolbar.querySelector(
            'button, [role="button"], input'
          ) as HTMLElement | null
          firstInteractive?.focus()
        }
        return
      }

      // Quick Moves: 'a'/'1' -> Planned, 's'/'2' -> In Progress, 'd'/'3' -> Completed
      if (
        (keyLower === 'a' ||
          keyLower === 's' ||
          keyLower === 'd' ||
          e.key === '1' ||
          e.key === '2' ||
          e.key === '3') &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !e.shiftKey
      ) {
        e.preventDefault()
        const statusMap: Record<string, ColumnId> = {
          a: 'planned',
          '1': 'planned',
          s: 'in_progress',
          '2': 'in_progress',
          d: 'done',
          '3': 'done'
        }
        const labelMap: Record<ColumnId, string> = {
          planned: 'Planned',
          in_progress: 'In Progress',
          done: 'Completed'
        }
        const targetStatus = statusMap[keyLower] || statusMap[e.key]
        const selected = selectedGoalIdsRef.current

        if (selected.size > 0) {
          const count = selected.size
          handleBulkMoveStatus(targetStatus)
          toast.success(
            `Moved ${count} ${count === 1 ? 'task' : 'tasks'} to ${labelMap[targetStatus]}`,
            'Tasks Moved'
          )
          onAnnounceRef.current?.(
            `Moved ${count} ${count === 1 ? 'task' : 'tasks'} to ${labelMap[targetStatus]}`
          )
        } else {
          const currId = activeGoalIdRef.current || cardGoalId
          if (currId) {
            const goal = dailyGoalsRef.current.find((g) => g.id === currId)
            if (goal && goal.status !== targetStatus) {
              moveGoal(goal, targetStatus)
              toast.success(`Moved "${goal.title}" to ${labelMap[targetStatus]}`, 'Status Updated')
              onAnnounceRef.current?.(`Moved "${goal.title}" to ${labelMap[targetStatus]}`)
            }
          }
        }
        return
      }

      // Cycle Column / Move: 'm' (Cycle planned -> in_progress -> done -> planned)
      if (keyLower === 'm' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        e.preventDefault()
        const cycleMap: Record<ColumnId, ColumnId> = {
          planned: 'in_progress',
          in_progress: 'done',
          done: 'planned'
        }
        const labelMap: Record<ColumnId, string> = {
          planned: 'Planned',
          in_progress: 'In Progress',
          done: 'Completed'
        }
        const selected = selectedGoalIdsRef.current
        if (selected.size > 0) {
          const firstId = Array.from(selected)[0]
          const firstGoal = dailyGoalsRef.current.find((g) => g.id === firstId)
          const targetStatus = firstGoal ? cycleMap[firstGoal.status as ColumnId] : 'in_progress'
          const count = selected.size
          handleBulkMoveStatus(targetStatus)
          toast.success(
            `Moved ${count} ${count === 1 ? 'task' : 'tasks'} to ${labelMap[targetStatus]}`,
            'Tasks Moved'
          )
          onAnnounceRef.current?.(
            `Moved ${count} ${count === 1 ? 'task' : 'tasks'} to ${labelMap[targetStatus]}`
          )
        } else {
          const currId = activeGoalIdRef.current || cardGoalId
          if (currId) {
            const goal = dailyGoalsRef.current.find((g) => g.id === currId)
            if (goal) {
              const targetStatus = cycleMap[goal.status as ColumnId] || 'in_progress'
              moveGoal(goal, targetStatus)
              toast.success(`Moved "${goal.title}" to ${labelMap[targetStatus]}`, 'Column Cycled')
              onAnnounceRef.current?.(`Moved "${goal.title}" to ${labelMap[targetStatus]}`)
            }
          }
        }
        return
      }

      // Quick Estimate: 'e'
      if (keyLower === 'e' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        if (editingIdRef.current) return
        e.preventDefault()
        const currId = activeGoalIdRef.current || cardGoalId
        const selected = selectedGoalIdsRef.current
        let targetId = currId
        if (!targetId && selected.size === 1) {
          targetId = Array.from(selected)[0]
        }
        if (targetId) {
          const goal = dailyGoalsRef.current.find((g) => g.id === targetId)
          if (goal) {
            if (callbacksRef.current.setQuickEstimatePopover) {
              const cardEl = document.querySelector<HTMLElement>(`[data-goal-id="${goal.id}"]`)
              if (cardEl) {
                const rect = cardEl.getBoundingClientRect()
                callbacksRef.current.setQuickEstimatePopover({
                  goal,
                  x: Math.max(16, rect.left + 20),
                  y: Math.min(window.innerHeight - 180, rect.bottom + 6)
                })
              } else {
                callbacksRef.current.setQuickEstimatePopover({
                  goal,
                  x: Math.round(window.innerWidth / 2 - 100),
                  y: Math.round(window.innerHeight / 2 - 50)
                })
              }
            } else {
              startEdit(goal)
            }
          }
        }
        return
      }

      // Actions: 'i' or Enter (Edit Card)
      if (
        (keyLower === 'i' || e.key === 'Enter') &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !e.shiftKey
      ) {
        if (e.key === 'Enter' && isInteractiveControl) return
        if (editingIdRef.current) return
        e.preventDefault()
        const currId = activeGoalIdRef.current || cardGoalId
        const selected = selectedGoalIdsRef.current
        let targetId = currId
        if (!targetId && selected.size === 1) {
          targetId = Array.from(selected)[0]
        }
        if (targetId) {
          const goal = dailyGoalsRef.current.find((g) => g.id === targetId)
          if (goal) {
            startEdit(goal)
          }
        }
        return
      }

      // Actions: Delete or Backspace (Remove Card)
      if ((e.key === 'Delete' || e.key === 'Backspace') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (isInteractiveControl) return
        if (editingIdRef.current) return
        e.preventDefault()
        const selected = selectedGoalIdsRef.current
        if (selected.size > 1) {
          setBulkDeleteModalOpen(true)
        } else if (selected.size === 1) {
          const targetId = Array.from(selected)[0]
          const goal = dailyGoalsRef.current.find((g) => g.id === targetId)
          if (goal) {
            const list = visibleGoalsRef.current
            const currIdx = list.findIndex((g) => g.id === targetId)
            const next = list[currIdx + 1] || list[currIdx - 1]
            setActiveGoalId(next ? next.id : null)
            setSelectedGoalIds(new Set())
            deleteGoal(goal)
            onAnnounceRef.current?.(`Deleted "${goal.title}"`)
          }
        } else {
          const currId = activeGoalIdRef.current || cardGoalId
          if (currId) {
            const goal = dailyGoalsRef.current.find((g) => g.id === currId)
            if (goal) {
              const list = visibleGoalsRef.current
              const currIdx = list.findIndex((g) => g.id === currId)
              const next = list[currIdx + 1] || list[currIdx - 1]
              setActiveGoalId(next ? next.id : null)
              deleteGoal(goal)
              onAnnounceRef.current?.(`Deleted "${goal.title}"`)
            }
          }
        }
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  return {
    activeGoalId,
    setActiveGoalId,
    showShortcutsHelp,
    setShowShortcutsHelp,
    scrollCardIntoView
  }
}
