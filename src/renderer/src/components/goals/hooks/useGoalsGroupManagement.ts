import { useState, useCallback, useRef, useEffect } from 'react'
import type { DailyGoal } from '../../../../../shared/types'
import { DEFAULT_SORT_ORDER } from '../../../../../shared/types'
import type { GroupColorId } from '../../../lib/groupTheme'
import {
  saveGroupColor,
  deleteSavedGroupColor,
  getPreferredGroupColor
} from '../../../lib/groupTheme'
import { calculateFractionalSortOrders, rebalanceGoals } from '../fractionalIndex'
import type { ColumnId } from '../types'

interface ActiveGroupColorPickerState {
  groupTag: string
  x: number
  y: number
}

interface ActiveGroupMenuState {
  groupTag: string
  sourceCol: ColumnId
  goals: DailyGoal[]
  isUntagged?: boolean
  x: number
  y: number
}

interface EditGroupModalState {
  groupTag: string
  newTag: string
  color: GroupColorId
  taskCount: number
  isUntagged?: boolean
  isNewGroup?: boolean
}

interface DeleteGroupModalState {
  groupTag: string
  isUntagged: boolean
  taskCount: number
}

interface InlineEditingGroupState {
  originalTag: string
  currentTag: string
  isUntagged?: boolean
}

export interface UseGoalsGroupManagementProps {
  dailyGoals: DailyGoal[]
  getSelectedGroupFilter?: () => string
  onFilterChange?: (filter: string) => void
  updateMultipleGoals: (goals: DailyGoal[]) => Promise<void>
  deleteMultipleGoals: (goals: DailyGoal[]) => Promise<void>
  onUpdateDailyGoal: (goal: DailyGoal) => Promise<void>
  setContextMenu?: (menu: { goal: DailyGoal; x: number; y: number } | null) => void
  toast?: { error: (msg: string, title?: string) => void }
}

export interface UseGoalsGroupManagementReturn {
  groupRegistryVersion: number
  setGroupRegistryVersion: React.Dispatch<React.SetStateAction<number>>
  customCreatedGroups: Record<string, GroupColorId>
  activeGroupColorPicker: ActiveGroupColorPickerState | null
  setActiveGroupColorPicker: React.Dispatch<
    React.SetStateAction<ActiveGroupColorPickerState | null>
  >
  activeGroupMenu: ActiveGroupMenuState | null
  setActiveGroupMenu: React.Dispatch<React.SetStateAction<ActiveGroupMenuState | null>>
  editGroupModal: EditGroupModalState | null
  setEditGroupModal: React.Dispatch<React.SetStateAction<EditGroupModalState | null>>
  deleteGroupModal: DeleteGroupModalState | null
  setDeleteGroupModal: React.Dispatch<React.SetStateAction<DeleteGroupModalState | null>>
  inlineEditingGroup: InlineEditingGroupState | null
  setInlineEditingGroup: React.Dispatch<React.SetStateAction<InlineEditingGroupState | null>>
  updateGroupColorTheme: (groupTag: string, colorId: GroupColorId) => Promise<void>
  moveWholeGroup: (goalsToMove: DailyGoal[], newStatus: DailyGoal['status']) => Promise<void>
  handleSaveEditGroup: () => Promise<void>
  handleInlineRenameConfirm: () => Promise<void>
  handleDissolveGroup: (groupTag: string) => Promise<void>
  handleDeleteGroupWithTasks: (groupTag: string, isUntagged?: boolean) => Promise<void>
  handleAssignTaskGroup: (goal: DailyGoal, tag?: string, color?: string) => Promise<void>
}

export function useGoalsGroupManagement({
  dailyGoals,
  getSelectedGroupFilter,
  onFilterChange,
  updateMultipleGoals,
  deleteMultipleGoals,
  onUpdateDailyGoal,
  setContextMenu,
  toast
}: UseGoalsGroupManagementProps): UseGoalsGroupManagementReturn {
  const getFilter = useCallback(() => {
    return getSelectedGroupFilter?.() || 'all'
  }, [getSelectedGroupFilter])

  const onFilterChangeRef = useRef(onFilterChange)
  useEffect(() => {
    onFilterChangeRef.current = onFilterChange
  }, [onFilterChange])

  const [groupRegistryVersion, setGroupRegistryVersion] = useState(0)
  const [customCreatedGroups, setCustomCreatedGroups] = useState<Record<string, GroupColorId>>({})

  const [activeGroupColorPicker, setActiveGroupColorPicker] =
    useState<ActiveGroupColorPickerState | null>(null)
  const [activeGroupMenu, setActiveGroupMenu] = useState<ActiveGroupMenuState | null>(null)
  const [editGroupModal, setEditGroupModal] = useState<EditGroupModalState | null>(null)
  const [deleteGroupModal, setDeleteGroupModal] = useState<DeleteGroupModalState | null>(null)
  const [inlineEditingGroup, setInlineEditingGroup] = useState<InlineEditingGroupState | null>(null)

  // Update color theme for a whole group
  const updateGroupColorTheme = useCallback(
    async (groupTag: string, colorId: GroupColorId) => {
      const cleanTag = groupTag.trim()
      if (!cleanTag) return
      saveGroupColor(cleanTag, colorId)

      const isUntagged = cleanTag.toLowerCase() === 'untagged'
      const matchingGoals = dailyGoals.filter((g) => {
        if (isUntagged) return !g.groupTag?.trim() || g.groupTag.trim().toLowerCase() === 'untagged'
        return g.groupTag && g.groupTag.trim().toLowerCase() === cleanTag.toLowerCase()
      })
      if (matchingGoals.length > 0) {
        const updated = matchingGoals.map((g) => ({ ...g, groupColor: colorId }))
        await updateMultipleGoals(updated)
      }
      setActiveGroupColorPicker(null)
    },
    [dailyGoals, updateMultipleGoals]
  )

  // Status update for a whole group of goals
  const moveWholeGroup = useCallback(
    async (goalsToMove: DailyGoal[], newStatus: DailyGoal['status']) => {
      const now = new Date().toISOString()
      const movingIds = new Set(goalsToMove.map((g) => g.id))
      const destGoals = dailyGoals.filter((g) => g.status === newStatus && !movingIds.has(g.id))
      destGoals.sort((a, b) => {
        const orderA = typeof a.sortOrder === 'number' ? a.sortOrder : DEFAULT_SORT_ORDER
        const orderB = typeof b.sortOrder === 'number' ? b.sortOrder : DEFAULT_SORT_ORDER
        if (orderA !== orderB) return orderA - orderB
        return a.createdAt.localeCompare(b.createdAt)
      })
      const orders = calculateFractionalSortOrders(destGoals, destGoals.length, goalsToMove.length)
      const updatedGoals = goalsToMove.map((g, idx) => ({
        ...g,
        status: newStatus,
        sortOrder: orders?.[idx],
        completedAt: newStatus === 'done' ? g.completedAt || now : undefined
      }))
      try {
        if (orders !== null) {
          await updateMultipleGoals(updatedGoals)
        } else {
          const { changedGoals } = rebalanceGoals(destGoals, destGoals.length, updatedGoals)
          await updateMultipleGoals(changedGoals)
        }
      } catch (err) {
        console.error('Failed to move group of goals:', err)
        toast?.error('Failed to move group tasks.', 'Group Move Error')
      }
    },
    [dailyGoals, updateMultipleGoals, toast]
  )

  // Save changes from Edit Group modal (Rename tag and/or change color theme)
  const handleSaveEditGroup = useCallback(async () => {
    if (!editGroupModal) return
    const { groupTag, newTag, color, isUntagged, isNewGroup } = editGroupModal
    const cleanNew = newTag.trim()
    if (!cleanNew) return

    saveGroupColor(cleanNew, color)
    const isTagRenamed = !isUntagged && groupTag.trim() !== cleanNew
    if (isNewGroup) {
      setCustomCreatedGroups((prev) => ({ ...prev, [cleanNew]: color }))
    } else if (isTagRenamed) {
      if (groupTag.trim().toLowerCase() !== cleanNew.toLowerCase()) {
        deleteSavedGroupColor(groupTag.trim())
      }
      setCustomCreatedGroups((prev) => {
        const next = { ...prev }
        for (const k of Object.keys(next)) {
          if (k.toLowerCase() === groupTag.trim().toLowerCase()) delete next[k]
        }
        next[cleanNew] = color
        return next
      })
    }
    setGroupRegistryVersion((v) => v + 1)

    if (!isNewGroup) {
      if (isTagRenamed) {
        window.api?.goals?.renameGroup?.(groupTag.trim(), cleanNew, color)?.catch(() => {})
      }
      const matchingGoals = dailyGoals.filter((g) => {
        if (isUntagged) return !g.groupTag?.trim() || g.groupTag.trim().toLowerCase() === 'untagged'
        return g.groupTag && g.groupTag.trim().toLowerCase() === groupTag.trim().toLowerCase()
      })
      if (matchingGoals.length > 0) {
        const updated = matchingGoals.map((g) => ({
          ...g,
          groupTag: cleanNew,
          groupColor: color
        }))
        await updateMultipleGoals(updated)
      }

      const currentFilter = getFilter()
      if (
        (isUntagged && currentFilter === '__untagged__') ||
        (!isUntagged && currentFilter.toLowerCase() === groupTag.trim().toLowerCase())
      ) {
        onFilterChangeRef.current?.(cleanNew)
      }
    }

    setEditGroupModal(null)
  }, [editGroupModal, dailyGoals, updateMultipleGoals, getFilter])

  // Save changes from inline header rename
  const handleInlineRenameConfirm = useCallback(async () => {
    if (!inlineEditingGroup) return
    const { originalTag, currentTag, isUntagged } = inlineEditingGroup
    const cleanNew = currentTag.trim()
    if (!cleanNew || (!isUntagged && cleanNew === originalTag.trim())) {
      setInlineEditingGroup(null)
      return
    }

    const prefColor = getPreferredGroupColor(cleanNew)
    saveGroupColor(cleanNew, prefColor)
    if (!isUntagged && cleanNew !== originalTag.trim()) {
      window.api?.goals?.renameGroup?.(originalTag.trim(), cleanNew, prefColor)?.catch(() => {})
      if (cleanNew.toLowerCase() !== originalTag.trim().toLowerCase()) {
        deleteSavedGroupColor(originalTag.trim())
      }
      setCustomCreatedGroups((prev) => {
        const next = { ...prev }
        for (const k of Object.keys(next)) {
          if (k.toLowerCase() === originalTag.trim().toLowerCase()) delete next[k]
        }
        next[cleanNew] = prefColor
        return next
      })
    }

    const matchingGoals = dailyGoals.filter((g) => {
      if (isUntagged) return !g.groupTag?.trim() || g.groupTag.trim().toLowerCase() === 'untagged'
      return g.groupTag && g.groupTag.trim().toLowerCase() === originalTag.trim().toLowerCase()
    })
    if (matchingGoals.length > 0) {
      const updated = matchingGoals.map((g) => ({
        ...g,
        groupTag: cleanNew,
        groupColor: prefColor
      }))
      await updateMultipleGoals(updated)
    }

    const currentFilter = getFilter()
    if (
      (isUntagged && currentFilter === '__untagged__') ||
      (!isUntagged && currentFilter.toLowerCase() === originalTag.trim().toLowerCase())
    ) {
      onFilterChangeRef.current?.(cleanNew)
    }

    setInlineEditingGroup(null)
  }, [inlineEditingGroup, dailyGoals, updateMultipleGoals, getFilter])

  // Dissolve/ungroup: Remove group tag from tasks so they remain as Untagged
  const handleDissolveGroup = useCallback(
    async (groupTag: string) => {
      const cleanTag = groupTag.trim()
      deleteSavedGroupColor(cleanTag)
      setCustomCreatedGroups((prev) => {
        const next = { ...prev }
        for (const k of Object.keys(next)) {
          if (k.toLowerCase() === cleanTag.toLowerCase()) delete next[k]
        }
        return next
      })
      setGroupRegistryVersion((v) => v + 1)

      const matchingGoals = dailyGoals.filter(
        (g) => g.groupTag && g.groupTag.trim().toLowerCase() === cleanTag.toLowerCase()
      )
      if (matchingGoals.length === 0) return

      const updated = matchingGoals.map((g) => ({
        ...g,
        groupTag: undefined,
        groupColor: undefined
      }))
      await updateMultipleGoals(updated)

      if (getFilter().toLowerCase() === cleanTag.toLowerCase()) {
        onFilterChangeRef.current?.('all')
      }
      setActiveGroupMenu(null)
    },
    [dailyGoals, updateMultipleGoals, getFilter]
  )

  // Permanently delete all tasks in a group (or untagged tasks)
  const handleDeleteGroupWithTasks = useCallback(
    async (groupTag: string, isUntagged = false) => {
      const cleanTag = groupTag.trim()
      if (!isUntagged) {
        deleteSavedGroupColor(cleanTag)
        setCustomCreatedGroups((prev) => {
          const next = { ...prev }
          for (const k of Object.keys(next)) {
            if (k.toLowerCase() === cleanTag.toLowerCase()) delete next[k]
          }
          return next
        })
        setGroupRegistryVersion((v) => v + 1)
      }

      const matchingGoals = dailyGoals.filter((g) => {
        if (isUntagged) return !g.groupTag?.trim() || g.groupTag.trim().toLowerCase() === 'untagged'
        return g.groupTag && g.groupTag.trim().toLowerCase() === cleanTag.toLowerCase()
      })

      if (matchingGoals.length > 0) {
        await deleteMultipleGoals(matchingGoals)
      }

      const currentFilter = getFilter()
      if (
        (isUntagged && currentFilter === '__untagged__') ||
        (!isUntagged && currentFilter.toLowerCase() === cleanTag.toLowerCase())
      ) {
        onFilterChangeRef.current?.('all')
      }
      setActiveGroupMenu(null)
    },
    [dailyGoals, deleteMultipleGoals, getFilter]
  )

  // Assign task to a group or remove it
  const handleAssignTaskGroup = useCallback(
    async (goal: DailyGoal, tag?: string, color?: string) => {
      const cleanTag = tag?.trim() || undefined
      const resolvedColor = cleanTag
        ? color || goal.groupColor || getPreferredGroupColor(cleanTag)
        : undefined

      if (cleanTag && resolvedColor) {
        saveGroupColor(cleanTag, resolvedColor as GroupColorId)
        setGroupRegistryVersion((v) => v + 1)
      }

      await onUpdateDailyGoal({
        ...goal,
        groupTag: cleanTag,
        groupColor: resolvedColor
      })
      setContextMenu?.(null)
    },
    [onUpdateDailyGoal, setContextMenu]
  )

  return {
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
  }
}
