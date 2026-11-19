import { useState, useCallback, useMemo, useEffect } from 'react'
import { DailyGoal } from '../../../../../shared/types'

export interface UseGoalsBulkActionsReturn {
  selectedGoalIds: Set<string>
  setSelectedGoalIds: React.Dispatch<React.SetStateAction<Set<string>>>
  lastSelectedGoalId: string | null
  setLastSelectedGoalId: React.Dispatch<React.SetStateAction<string | null>>
  toggleSelectGoal: (
    goalId: string,
    isShift?: boolean,
    isToggleOrList?: boolean | DailyGoal[],
    customList?: DailyGoal[]
  ) => void
  selectSingle: (goalId: string) => void
  selectAll: (goals: DailyGoal[]) => void
  clearSelection: () => void
  isSelected: (goalId: string) => boolean
  selectedGoals: DailyGoal[]
}

export function useGoalsBulkActions(
  visibleGoals: DailyGoal[],
  allGoals?: DailyGoal[]
): UseGoalsBulkActionsReturn {
  const [selectedGoalIds, setSelectedGoalIds] = useState<Set<string>>(new Set())
  const [lastSelectedGoalId, setLastSelectedGoalId] = useState<string | null>(null)

  const activeGoals = allGoals || visibleGoals

  // Automatically prune any selected IDs that no longer exist in active dataset (e.g. deleted)
  useEffect(() => {
    const activeSet = new Set(activeGoals.map((g) => g.id))
    setSelectedGoalIds((prev) => {
      if (prev.size === 0) return prev
      let hasRemoved = false
      const next = new Set<string>()
      for (const id of prev) {
        if (activeSet.has(id)) {
          next.add(id)
        } else {
          hasRemoved = true
        }
      }
      return hasRemoved ? next : prev
    })

    setLastSelectedGoalId((prevLast) => {
      if (prevLast && !activeSet.has(prevLast)) {
        return null
      }
      return prevLast
    })
  }, [activeGoals])

  const isSelected = useCallback(
    (goalId: string): boolean => {
      return selectedGoalIds.has(goalId)
    },
    [selectedGoalIds]
  )

  const clearSelection = useCallback(() => {
    setSelectedGoalIds(new Set())
    setLastSelectedGoalId(null)
  }, [])

  const selectSingle = useCallback((goalId: string) => {
    setSelectedGoalIds(new Set([goalId]))
    setLastSelectedGoalId(goalId)
  }, [])

  const selectAll = useCallback((goals: DailyGoal[]) => {
    setSelectedGoalIds(new Set(goals.map((g) => g.id)))
  }, [])

  const toggleSelectGoal = useCallback(
    (
      goalId: string,
      isShift = false,
      isToggleOrList: boolean | DailyGoal[] = true,
      customList?: DailyGoal[]
    ) => {
      const isToggle = typeof isToggleOrList === 'boolean' ? isToggleOrList : true
      const targetList = Array.isArray(isToggleOrList)
        ? isToggleOrList
        : Array.isArray(customList)
          ? customList
          : visibleGoals

      setSelectedGoalIds((prev) => {
        const next = new Set(prev)

        if (isShift && lastSelectedGoalId && targetList.length > 0) {
          const fromIndex = targetList.findIndex((g) => g.id === lastSelectedGoalId)
          const toIndex = targetList.findIndex((g) => g.id === goalId)

          if (fromIndex !== -1 && toIndex !== -1) {
            const start = Math.min(fromIndex, toIndex)
            const end = Math.max(fromIndex, toIndex)
            for (let i = start; i <= end; i++) {
              next.add(targetList[i].id)
            }
            return next
          }
        }

        if (isToggle) {
          if (next.has(goalId)) {
            next.delete(goalId)
          } else {
            next.add(goalId)
          }
        } else {
          next.add(goalId)
        }
        return next
      })
      setLastSelectedGoalId(goalId)
    },
    [visibleGoals, lastSelectedGoalId]
  )

  const selectedGoals = useMemo(() => {
    if (selectedGoalIds.size === 0) return []
    return activeGoals.filter((g) => selectedGoalIds.has(g.id))
  }, [activeGoals, selectedGoalIds])

  return {
    selectedGoalIds,
    setSelectedGoalIds,
    lastSelectedGoalId,
    setLastSelectedGoalId,
    toggleSelectGoal,
    selectSingle,
    selectAll,
    clearSelection,
    isSelected,
    selectedGoals
  }
}
