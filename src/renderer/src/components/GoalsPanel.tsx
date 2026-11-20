import { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react'
import { DailyGoal, DEFAULT_SORT_ORDER, localDateStr } from '../../../shared/types'
import { useFocusSessionActions } from '../context/FocusSessionContext'
import { useToast } from '../lib/useToast'

import {
  getPreferredGroupColor,
  saveGroupColor,
  ensureUniqueGroupColors,
  getRandomUnusedColor,
  GroupColorId
} from '../lib/groupTheme'

import type { ColumnId, GoalsPanelProps } from './goals/types'
import { COLUMNS, partitionColumnGroups } from './goals/types'
import { KeyboardShortcutsModal } from './KeyboardShortcutsModal'
import { GoalsColorPicker } from './goals/GoalsColorPicker'
import { GoalsGroupMenu } from './goals/GoalsGroupMenu'
import { GoalsToolbar } from './goals/GoalsToolbar'
import { TrashArchiveModal } from './goals/TrashArchiveModal'
import { GoalsModals } from './goals/GoalsModals'
import { GoalsContextMenu } from './goals/GoalsContextMenu'
import { GoalsBulkActionsBar } from './goals/GoalsBulkActionsBar'
import { useGoalsOrganize } from './goals/hooks/useGoalsOrganize'
import { useGoalsGroupManagement } from './goals/hooks/useGoalsGroupManagement'
import { useGoalsBulkActions } from './goals/hooks/useGoalsBulkActions'
import { useGoalsKeyboardNavigation } from './goals/hooks/useGoalsKeyboardNavigation'
import { useGoalsDragDrop } from './goals/hooks/useGoalsDragDrop'
import { GoalsDragGhost } from './goals/GoalsDragGhost'
import { GoalsKanbanView } from './goals/GoalsKanbanView'
import { GoalsContextProvider } from './goals/GoalsContext'
import { calculateFractionalSortOrders, rebalanceGoals } from './goals/fractionalIndex'

function GoalsPanelComponent({
  dailyGoals,
  onAddDailyGoal,
  onUpdateDailyGoal,
  onUpdateDailyGoals,
  onDeleteDailyGoal,
  onDeleteDailyGoals,
  onGoalRestored,
  onCarryDailyGoal,
  triggerAdd,
  onResetTriggerAdd,
  isActive = true,
  goalLoggedMinutesMap = {},
  onNavigateToToday,
  dayCutoffHour = 0
}: GoalsPanelProps): React.JSX.Element {
  const toast = useToast()
  const { startFocus, isGoalFocused, togglePause } = useFocusSessionActions()

  const handleStartFocus = useCallback(
    async (goal: DailyGoal) => {
      if (goal.status === 'planned') {
        const promoted = { ...goal, status: 'in_progress' as const }
        await onUpdateDailyGoal(promoted)
        await startFocus(promoted)
        onNavigateToToday?.()
      } else {
        await startFocus(goal)
      }
    },
    [startFocus, onUpdateDailyGoal, onNavigateToToday]
  )
  const [showAddCol, setShowAddCol] = useState<'planned' | 'in_progress' | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{
    goal: DailyGoal
    x: number
    y: number
  } | null>(null)

  // Multi-goal updater helper
  const updateMultipleGoals = useCallback(
    async (goalsToUpdate: DailyGoal[]) => {
      try {
        if (onUpdateDailyGoals) {
          await onUpdateDailyGoals(goalsToUpdate)
        } else {
          for (const g of goalsToUpdate) {
            await onUpdateDailyGoal(g)
          }
        }
      } catch (err) {
        console.error('Failed to update goals:', err)
        toast.error('Failed to save task updates. Please try again.', 'Task Update Error')
        throw err
      }
    },
    [onUpdateDailyGoals, onUpdateDailyGoal, toast]
  )

  // Multi-goal deleter helper
  const deleteMultipleGoals = useCallback(
    async (goalsToDelete: DailyGoal[]) => {
      if (goalsToDelete.length === 0) return
      try {
        if (onDeleteDailyGoals) {
          await onDeleteDailyGoals(goalsToDelete)
        } else if (onDeleteDailyGoal) {
          for (const g of goalsToDelete) {
            await onDeleteDailyGoal(g)
          }
        }
      } catch (err) {
        console.error('Failed to delete goals:', err)
        toast.error('Failed to delete selected tasks.', 'Deletion Error')
      }
    },
    [onDeleteDailyGoals, onDeleteDailyGoal, toast]
  )

  // Status update for single goal
  const moveGoal = useCallback(
    async (goal: DailyGoal, newStatus: DailyGoal['status']) => {
      if (goal.status === newStatus) return
      const now = new Date().toISOString()
      const destGoals = dailyGoals.filter((g) => g.status === newStatus && g.id !== goal.id)
      destGoals.sort((a, b) => {
        const orderA = typeof a.sortOrder === 'number' ? a.sortOrder : DEFAULT_SORT_ORDER
        const orderB = typeof b.sortOrder === 'number' ? b.sortOrder : DEFAULT_SORT_ORDER
        if (orderA !== orderB) return orderA - orderB
        return a.createdAt.localeCompare(b.createdAt)
      })
      const orders = calculateFractionalSortOrders(destGoals, destGoals.length, 1)
      const updatedGoal: DailyGoal = {
        ...goal,
        status: newStatus,
        completedAt: newStatus === 'done' ? goal.completedAt || now : undefined
      }
      try {
        if (orders !== null && orders.length > 0) {
          updatedGoal.sortOrder = orders[0]
          await onUpdateDailyGoal(updatedGoal)
        } else {
          const { changedGoals } = rebalanceGoals(destGoals, destGoals.length, [updatedGoal])
          await updateMultipleGoals(changedGoals)
        }
      } catch (err) {
        console.error('Failed to move goal:', err)
        toast.error(`Failed to move "${goal.title}".`, 'Task Move Error')
      }
    },
    [onUpdateDailyGoal, updateMultipleGoals, dailyGoals, toast]
  )

  const selectedGroupFilterRef = useRef('all')

  // Group tag menu & color management hook
  const {
    groupRegistryVersion,
    setGroupRegistryVersion,
    customCreatedGroups,
    activeGroupColorPicker,
    setActiveGroupColorPicker,
    activeGroupMenu,
    setActiveGroupMenu,
    editGroupModal,
    setEditGroupModal,
    deleteGroupModal,
    setDeleteGroupModal,
    inlineEditingGroup,
    setInlineEditingGroup,
    updateGroupColorTheme,
    moveWholeGroup,
    handleSaveEditGroup,
    handleInlineRenameConfirm,
    handleDissolveGroup,
    handleDeleteGroupWithTasks,
    handleAssignTaskGroup
  } = useGoalsGroupManagement({
    dailyGoals,
    getSelectedGroupFilter: () => selectedGroupFilterRef.current,
    onFilterChange: (filter) => setSelectedGroupFilter(filter),
    updateMultipleGoals,
    deleteMultipleGoals,
    onUpdateDailyGoal,
    setContextMenu,
    toast
  })

  // Organizing & Sorting state hook (backed by SQLite AppSettings)
  const {
    selectedGroupFilter,
    setSelectedGroupFilter,
    sortOption,
    setSortOption,
    groupByTag,
    setGroupByTag,
    collapsedGroups,
    setCollapsedGroups,
    collapsedCols,
    setCollapsedCols,
    persistCollapsedColumns,
    toggleCollapse,
    toggleFocusMode,
    existingGroups,
    groupCounts,
    processedGoalsByColumn
  } = useGoalsOrganize(dailyGoals, customCreatedGroups, groupRegistryVersion)

  selectedGroupFilterRef.current = selectedGroupFilter

  // Flattened visible goals in current board display order
  const visibleGoalsInOrder = useMemo(() => {
    const list: DailyGoal[] = []
    for (const col of COLUMNS) {
      if (collapsedCols[col.id]) continue
      const goals = processedGoalsByColumn[col.id] || []
      if (groupByTag) {
        const groups = partitionColumnGroups(goals)
        for (const g of groups) {
          list.push(...g.goals)
        }
      } else {
        list.push(...goals)
      }
    }
    return list
  }, [processedGoalsByColumn, groupByTag, collapsedCols])

  // Multi-Select & Bulk Actions hook
  const {
    selectedGoalIds,
    setSelectedGoalIds,
    setLastSelectedGoalId,
    toggleSelectGoal,
    selectSingle,
    selectAll,
    clearSelection,
    selectedGoals
  } = useGoalsBulkActions(visibleGoalsInOrder, dailyGoals)

  // Platform detection & shortcuts
  const isMac = useMemo(() => {
    return typeof navigator !== 'undefined' && /Mac|iPhone|iPod|iPad/i.test(navigator.userAgent)
  }, [])
  const shortcutLabel = isMac ? '⌘N' : 'Ctrl+N'

  // Floating Bulk Actions Bar popover states
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false)

  // Ensure unique colors for active groups on the board without pruning historical tags
  useEffect(() => {
    const activeTags = dailyGoals.filter((g) => g.groupTag?.trim()).map((g) => g.groupTag!.trim())
    const combined = [...activeTags, ...Object.keys(customCreatedGroups)]
    ensureUniqueGroupColors(combined, customCreatedGroups)
  }, [dailyGoals, customCreatedGroups])

  // Close menus on outside interactions
  useEffect(() => {
    if (!isActive) return

    const handleClose = (): void => {
      setContextMenu(null)
      setActiveGroupColorPicker(null)
      setActiveGroupMenu(null)
    }

    window.addEventListener('click', handleClose)
    window.addEventListener('contextmenu', handleClose)
    window.addEventListener('scroll', handleClose, true)
    return () => {
      window.removeEventListener('click', handleClose)
      window.removeEventListener('contextmenu', handleClose)
      window.removeEventListener('scroll', handleClose, true)
    }
  }, [isActive, setActiveGroupColorPicker, setActiveGroupMenu])

  const openAddForm = useCallback(
    (targetCol: 'planned' | 'in_progress' = 'planned'): void => {
      setCollapsedCols((prev) => {
        if (prev[targetCol]) {
          const next = { ...prev, [targetCol]: false }
          persistCollapsedColumns(next)
          return next
        }
        return prev
      })
      setShowAddCol(targetCol)
    },
    [setCollapsedCols, persistCollapsedColumns]
  )

  const prevTriggerAddRef = useRef(0)
  useEffect(() => {
    if (triggerAdd && triggerAdd > 0 && triggerAdd > prevTriggerAddRef.current) {
      prevTriggerAddRef.current = triggerAdd
      openAddForm()
      onResetTriggerAdd?.()
    } else {
      prevTriggerAddRef.current = triggerAdd || 0
    }
  }, [triggerAdd, openAddForm, onResetTriggerAdd])

  useEffect(() => {
    if (!isActive) return
    const handleKeyDown = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        if (
          e.target instanceof HTMLElement &&
          (e.target.isContentEditable || ['INPUT', 'TEXTAREA'].includes(e.target.tagName))
        ) {
          return
        }
        e.preventDefault()
        openAddForm()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isActive, openAddForm])

  // Edit task handlers
  const startEdit = useCallback((goal: DailyGoal): void => {
    setEditingId(goal.id)
  }, [])

  const cancelEdit = (): void => {
    setEditingId(null)
  }

  const handleSaveEdit = async (
    goal: DailyGoal,
    data: {
      title: string
      note?: string
      deadline?: string
      remindAt?: string
      repeat?: string
      groupTag?: string
      groupColor?: string
      targetMinutes?: number
      goalType?: 'deep' | 'routine'
    }
  ): Promise<void> => {
    const todayStr = localDateStr(new Date(), dayCutoffHour)
    const newDeadline = data.deadline ?? ''
    const isNewDeadlineToToday = newDeadline === todayStr || newDeadline.startsWith(`${todayStr}T`)
    await onUpdateDailyGoal({
      ...goal,
      date: isNewDeadlineToToday || (goal.date && goal.date < todayStr) ? todayStr : goal.date,
      title: data.title,
      note: data.note ?? '',
      deadline: newDeadline,
      remindAt: data.remindAt ?? '',
      repeat: data.repeat ?? '',
      groupTag: data.groupTag?.trim() ?? '',
      groupColor: data.groupTag ? data.groupColor || goal.groupColor : '',
      targetMinutes: data.targetMinutes,
      goalType: data.goalType ?? goal.goalType ?? 'deep'
    })
    setEditingId(null)
  }

  const handleCarryToToday = useCallback(
    async (goal: DailyGoal) => {
      const todayStr = localDateStr(new Date(), dayCutoffHour)
      try {
        if (goal.date !== todayStr && onCarryDailyGoal) {
          await onCarryDailyGoal(goal)
        } else {
          await onUpdateDailyGoal({
            ...goal,
            date: todayStr,
            deadline: todayStr
          })
        }
        toast.success(`Task "${goal.title}" carried forward to today.`, 'Carried Forward')
      } catch (err) {
        console.error('Failed to carry task to today:', err)
        toast.error('Failed to carry task forward.', 'Task Update Error')
      }
    },
    [dayCutoffHour, onCarryDailyGoal, onUpdateDailyGoal, toast]
  )

  const handleRescheduleGoal = useCallback(
    async (goal: DailyGoal, deadline?: string) => {
      const todayStr = localDateStr(new Date(), dayCutoffHour)
      const isDeadlineToToday =
        deadline === todayStr || (deadline && deadline.startsWith(`${todayStr}T`))
      try {
        await onUpdateDailyGoal({
          ...goal,
          date: isDeadlineToToday || (goal.date && goal.date < todayStr) ? todayStr : goal.date,
          deadline: deadline || undefined
        })
        toast.success(
          deadline
            ? `Task "${goal.title}" rescheduled to ${deadline.split('T')[0]}.`
            : `Due date cleared for "${goal.title}".`,
          'Task Rescheduled'
        )
      } catch (err) {
        console.error('Failed to reschedule task:', err)
        toast.error('Failed to reschedule task.', 'Task Update Error')
      }
    },
    [dayCutoffHour, onUpdateDailyGoal, toast]
  )

  const deleteGoal = useCallback(
    async (goal: DailyGoal): Promise<void> => {
      if (onDeleteDailyGoal) {
        await onDeleteDailyGoal(goal)
      }
    },
    [onDeleteDailyGoal]
  )

  const handleSelectAllVisible = useCallback(() => {
    if (selectedGoalIds.size === visibleGoalsInOrder.length && visibleGoalsInOrder.length > 0) {
      clearSelection()
    } else {
      selectAll(visibleGoalsInOrder)
    }
  }, [selectedGoalIds, visibleGoalsInOrder, clearSelection, selectAll])

  const handleClearSelection = useCallback(() => {
    clearSelection()
    setBulkDeleteModalOpen(false)
  }, [clearSelection])

  // Bulk Move (Status)
  const handleBulkMoveStatus = useCallback(
    async (newStatus: ColumnId) => {
      if (selectedGoals.length === 0) return
      const now = new Date().toISOString()
      const destGoals = dailyGoals.filter(
        (g) => g.status === newStatus && !selectedGoalIds.has(g.id)
      )
      destGoals.sort((a, b) => {
        const orderA = typeof a.sortOrder === 'number' ? a.sortOrder : DEFAULT_SORT_ORDER
        const orderB = typeof b.sortOrder === 'number' ? b.sortOrder : DEFAULT_SORT_ORDER
        if (orderA !== orderB) return orderA - orderB
        return a.createdAt.localeCompare(b.createdAt)
      })
      const orders = calculateFractionalSortOrders(
        destGoals,
        destGoals.length,
        selectedGoals.length
      )
      const updated = selectedGoals.map((g, idx) => ({
        ...g,
        status: newStatus,
        sortOrder: orders?.[idx],
        completedAt: newStatus === 'done' ? g.completedAt || now : undefined
      }))
      if (orders !== null) {
        await updateMultipleGoals(updated)
      } else {
        const { changedGoals } = rebalanceGoals(destGoals, destGoals.length, updated)
        await updateMultipleGoals(changedGoals)
      }
    },
    [selectedGoals, selectedGoalIds, dailyGoals, updateMultipleGoals]
  )

  // Bulk Reschedule (Due Date)
  const handleBulkReschedule = useCallback(
    async (deadline?: string) => {
      if (selectedGoals.length === 0) return
      const todayStr = localDateStr(new Date(), dayCutoffHour)
      const updated = selectedGoals.map((g) => {
        const isDeadlineToToday =
          deadline === todayStr || (deadline && deadline.startsWith(`${todayStr}T`))
        return {
          ...g,
          date: isDeadlineToToday || (g.date && g.date < todayStr) ? todayStr : g.date,
          deadline: deadline || undefined
        }
      })
      await updateMultipleGoals(updated)
    },
    [selectedGoals, updateMultipleGoals, dayCutoffHour]
  )

  // Bulk Group Tag
  const handleBulkAssignGroup = useCallback(
    async (groupTag?: string, groupColor?: string) => {
      const cleanTag = groupTag?.trim() || undefined
      const resolvedColor = cleanTag
        ? (groupColor as GroupColorId) || getPreferredGroupColor(cleanTag)
        : undefined

      if (cleanTag && resolvedColor) {
        saveGroupColor(cleanTag, resolvedColor)
        setGroupRegistryVersion((v) => v + 1)
      }

      if (selectedGoals.length === 0) return

      const updated = selectedGoals.map((g) => ({
        ...g,
        groupTag: cleanTag,
        groupColor: resolvedColor
      }))
      await updateMultipleGoals(updated)
    },
    [selectedGoals, updateMultipleGoals, setGroupRegistryVersion]
  )

  // Bulk Delete
  const handleBulkDelete = useCallback(async () => {
    if (selectedGoals.length === 0) return

    await deleteMultipleGoals(selectedGoals)

    clearSelection()
    setBulkDeleteModalOpen(false)
  }, [selectedGoals, deleteMultipleGoals, clearSelection])

  // Drag and drop manager hook
  const {
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
  } = useGoalsDragDrop({
    dailyGoals,
    processedGoalsByColumn,
    groupByTag,
    selectedGoalIds,
    setSelectedGoalIds,
    toggleSelectGoal,
    updateMultipleGoals,
    moveWholeGroup,
    setSortOption
  })

  // Keyboard navigation & shortcuts hook
  const onCloseOverlays = useCallback((): boolean => {
    const hadOpenOverlay = Boolean(
      contextMenu ||
      activeGroupColorPicker ||
      activeGroupMenu ||
      editGroupModal ||
      deleteGroupModal ||
      inlineEditingGroup ||
      bulkDeleteModalOpen
    )

    setContextMenu(null)
    setActiveGroupColorPicker(null)
    setActiveGroupMenu(null)
    setEditGroupModal(null)
    setDeleteGroupModal(null)
    setInlineEditingGroup(null)
    setBulkDeleteModalOpen(false)

    return hadOpenOverlay
  }, [
    contextMenu,
    activeGroupColorPicker,
    activeGroupMenu,
    editGroupModal,
    deleteGroupModal,
    inlineEditingGroup,
    bulkDeleteModalOpen,
    setActiveGroupColorPicker,
    setActiveGroupMenu,
    setEditGroupModal,
    setDeleteGroupModal,
    setInlineEditingGroup
  ])

  const [showTrashModal, setShowTrashModal] = useState(false)
  const [keyboardAnnouncement, setKeyboardAnnouncement] = useState<string | null>(null)
  const activeAnnouncement = announcement || keyboardAnnouncement

  const { activeGoalId, setActiveGoalId, showShortcutsHelp, setShowShortcutsHelp } =
    useGoalsKeyboardNavigation({
      isActive,
      isDragging: Boolean(drag?.active),
      hasOpenModal: Boolean(
        editGroupModal || deleteGroupModal || bulkDeleteModalOpen || showTrashModal
      ),
      onCloseOverlays,
      visibleGoals: visibleGoalsInOrder,
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
      onReorderGoal: updateMultipleGoals,
      handleBulkMoveStatus,
      setBulkDeleteModalOpen,
      onAnnounce: setKeyboardAnnouncement
    })

  // Toggle group collapse
  const toggleCollapseGroup = (groupKey: string): void => {
    setCollapsedGroups((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }))
  }

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      <GoalsToolbar
        selectedGroupFilter={selectedGroupFilter}
        setSelectedGroupFilter={setSelectedGroupFilter}
        existingGroups={existingGroups}
        groupCounts={groupCounts}
        groupByTag={groupByTag}
        setGroupByTag={setGroupByTag}
        sortOption={sortOption}
        setSortOption={setSortOption}
        dailyGoals={dailyGoals}
        onOpenGroupMenu={setActiveGroupMenu}
        onOpenEditGroupModal={(modal) => setEditGroupModal(modal)}
        onOpenShortcuts={() => setShowShortcutsHelp(true)}
        onOpenTrash={() => setShowTrashModal(true)}
        onOpenNewTask={openAddForm}
        shortcutLabel={shortcutLabel}
      />

      <GoalsDragGhost
        drag={drag}
        hoverColumn={hoverColumn}
        hoverTarget={hoverTarget}
        hoverGroupTarget={hoverGroupTarget}
      />

      {/* --- KANBAN VIEW --- */}
      <GoalsContextProvider
        value={{
          dailyGoals,
          selectedGoalIds,
          activeGoalId,
          editingId,
          goalLoggedMinutesMap,
          groupByTag,
          existingGroups,
          dayCutoffHour,
          drag,
          hoverColumn,
          hoverTarget,
          hoverGroupTarget,
          onPointerDownCard,
          onPointerDownGroup,
          setActiveGoalId,
          toggleSelectGoal,
          selectSingle,
          startEdit,
          handleSaveEdit,
          cancelEdit,
          setContextMenu,
          isGoalFocused,
          startFocus: handleStartFocus,
          togglePause,
          moveGoal,
          onCarryToToday: handleCarryToToday,
          onRescheduleGoal: handleRescheduleGoal,
          longPressTriggeredRef,
          didDragOccurRef
        }}
      >
        <GoalsKanbanView
          processedGoalsByColumn={processedGoalsByColumn}
          collapsedCols={collapsedCols}
          toggleCollapse={toggleCollapse}
          openAddForm={openAddForm}
          showAddCol={showAddCol}
          setShowAddCol={setShowAddCol}
          onAddDailyGoal={onAddDailyGoal}
          triggerAdd={triggerAdd}
          shortcutLabel={shortcutLabel}
          isMac={isMac}
          registerColumn={registerColumn}
          isValidTarget={isValidTarget}
          isHovering={isHovering}
          collapsedGroups={collapsedGroups}
          toggleCollapseGroup={toggleCollapseGroup}
          inlineEditingGroup={inlineEditingGroup}
          setInlineEditingGroup={setInlineEditingGroup}
          handleInlineRenameConfirm={handleInlineRenameConfirm}
          announcement={activeAnnouncement}
          setActiveGroupColorPicker={setActiveGroupColorPicker}
          setActiveGroupMenu={setActiveGroupMenu}
          setEditGroupModal={setEditGroupModal}
        />
      </GoalsContextProvider>

      <GoalsColorPicker
        picker={activeGroupColorPicker}
        onSelectColor={updateGroupColorTheme}
        onClose={() => setActiveGroupColorPicker(null)}
        existingGroups={existingGroups}
      />

      <GoalsGroupMenu
        menu={activeGroupMenu}
        onClose={() => setActiveGroupMenu(null)}
        onEditGroup={(groupTag, isUntagged, _colTaskCount, color) => {
          const totalCount = isUntagged
            ? dailyGoals.filter(
                (g) => !g.groupTag?.trim() || g.groupTag.trim().toLowerCase() === 'untagged'
              ).length
            : dailyGoals.filter(
                (g) => g.groupTag && g.groupTag.trim().toLowerCase() === groupTag.toLowerCase()
              ).length
          setEditGroupModal({
            groupTag,
            newTag: isUntagged ? '' : groupTag,
            color,
            taskCount: totalCount,
            isUntagged,
            isNewGroup: false
          })
          setActiveGroupMenu(null)
        }}
        onChangeColor={(groupTag, x, y) => {
          setActiveGroupColorPicker({ groupTag, x, y })
          setActiveGroupMenu(null)
        }}
        onAddNew={() => {
          const usedColors = existingGroups.map((g) => g.color)
          const randomColor = getRandomUnusedColor(usedColors)
          setEditGroupModal({
            groupTag: '',
            newTag: '',
            color: randomColor,
            taskCount: 0,
            isNewGroup: true
          })
          setActiveGroupMenu(null)
        }}
        onMoveAll={async (goals, status) => {
          await moveWholeGroup(goals, status)
          setActiveGroupMenu(null)
        }}
        onDissolve={(groupTag) => {
          handleDissolveGroup(groupTag)
          setActiveGroupMenu(null)
        }}
        onDelete={(groupTag, isUntagged, taskCount) => {
          setDeleteGroupModal({ groupTag, isUntagged, taskCount })
          setActiveGroupMenu(null)
        }}
        existingGroups={existingGroups}
      />

      <GoalsContextMenu
        contextMenu={contextMenu}
        setContextMenu={setContextMenu}
        selectedGoalIds={selectedGoalIds}
        onBulkMoveStatus={handleBulkMoveStatus}
        onBulkReschedule={handleBulkReschedule}
        onBulkAssignGroup={handleBulkAssignGroup}
        onBulkDelete={handleBulkDelete}
        onClearSelection={handleClearSelection}
        onToggleSelect={toggleSelectGoal}
        onStartEdit={startEdit}
        onMoveGoal={moveGoal}
        onDeleteGoal={deleteGoal}
        onAssignTaskGroup={handleAssignTaskGroup}
        onCarryToToday={handleCarryToToday}
        onRescheduleGoal={handleRescheduleGoal}
        dayCutoffHour={dayCutoffHour}
        existingGroups={existingGroups}
      />

      <GoalsBulkActionsBar
        selectedGoalIds={selectedGoalIds}
        totalVisibleCount={visibleGoalsInOrder.length}
        onSelectAll={handleSelectAllVisible}
        onClearSelection={handleClearSelection}
        onBulkMoveStatus={handleBulkMoveStatus}
        onBulkReschedule={handleBulkReschedule}
        onBulkAssignGroup={handleBulkAssignGroup}
        onBulkDelete={() => setBulkDeleteModalOpen(true)}
        existingGroups={existingGroups}
        dayCutoffHour={dayCutoffHour}
      />

      <GoalsModals
        editGroupModal={editGroupModal}
        setEditGroupModal={setEditGroupModal}
        onSaveEditGroup={handleSaveEditGroup}
        deleteGroupModal={deleteGroupModal}
        setDeleteGroupModal={setDeleteGroupModal}
        onDissolveGroup={handleDissolveGroup}
        onDeleteGroupWithTasks={handleDeleteGroupWithTasks}
        bulkDeleteModalOpen={bulkDeleteModalOpen}
        setBulkDeleteModalOpen={setBulkDeleteModalOpen}
        selectedCount={selectedGoals.length}
        onBulkDelete={handleBulkDelete}
        dailyGoals={dailyGoals}
        onMoveWholeGroup={moveWholeGroup}
        existingGroups={existingGroups}
      />

      <KeyboardShortcutsModal
        isOpen={showShortcutsHelp}
        onClose={() => setShowShortcutsHelp(false)}
        isMac={isMac}
      />

      <TrashArchiveModal
        isOpen={showTrashModal}
        onClose={() => setShowTrashModal(false)}
        onGoalRestored={onGoalRestored}
      />
    </div>
  )
}

export const GoalsPanel = memo(GoalsPanelComponent)
