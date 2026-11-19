import { useCallback } from 'react'
import { DailyGoal, DEFAULT_SORT_ORDER } from '../../../shared/types'
import { calculateFractionalSortOrders, rebalanceGoals } from '../components/goals/fractionalIndex'

interface ToastMethods {
  success: (
    msg: string,
    title?: string,
    options?: { label: string; onClick: () => Promise<void> | void }
  ) => void
  error: (msg: string, title?: string) => void
}

export interface UseGoalOperationsParams {
  getTodayStr: () => string
  todayGoals: DailyGoal[]
  setTodayGoals: React.Dispatch<React.SetStateAction<DailyGoal[]>>
  loadTodayData: () => Promise<void>
  toastRef: React.MutableRefObject<ToastMethods>
  setTab: (tab: 'today' | 'goals' | 'review' | 'settings') => void
  setTriggerAddGoal: React.Dispatch<React.SetStateAction<number>>
  loadHeatmap: () => Promise<void>
  loadDayReview: (date: string) => Promise<void>
  selectedDayDateRef: React.MutableRefObject<string>
  tabRef: React.MutableRefObject<string>
}

export interface UseGoalOperationsResult {
  handleAddGoal: (
    title: string,
    targetMinutes?: number,
    deadline?: string,
    note?: string,
    remindAt?: string,
    repeat?: string,
    groupTag?: string,
    groupColor?: string,
    status?: DailyGoal['status']
  ) => Promise<void>
  handleUpdateGoal: (goal: DailyGoal) => Promise<void>
  handleUpdateGoals: (goals: DailyGoal[]) => Promise<void>
  handlePromoteGoal: (goal: DailyGoal) => Promise<void>
  handleDeleteGoal: (goal: DailyGoal) => Promise<void>
  handleDeleteGoals: (goals: DailyGoal[]) => Promise<void>
  handleGoalRestored: (restoredGoal: DailyGoal) => void
  handleCarryGoal: (goal: DailyGoal) => Promise<void>
  handleCarryAllGoals: (goals: DailyGoal[]) => Promise<void>
  handleReopenGoal: (goal: DailyGoal) => Promise<void>
  handleResetTriggerAdd: () => void
  handleNavigateToToday: () => void
  handleOpenPlanner: () => void
}

export function useGoalOperations({
  getTodayStr,
  todayGoals,
  setTodayGoals,
  loadTodayData,
  toastRef,
  setTab,
  setTriggerAddGoal,
  loadHeatmap,
  loadDayReview,
  selectedDayDateRef,
  tabRef
}: UseGoalOperationsParams): UseGoalOperationsResult {
  const handleAddGoal = useCallback(
    async (
      title: string,
      targetMinutes?: number,
      deadline?: string,
      note?: string,
      remindAt?: string,
      repeat?: string,
      groupTag?: string,
      groupColor?: string,
      status: DailyGoal['status'] = 'planned'
    ): Promise<void> => {
      const today = getTodayStr()
      const cleanTag = groupTag?.trim()
      const addedGoal = await window.api.goals.add({
        date: today,
        title,
        targetMinutes,
        deadline,
        note,
        remindAt,
        repeat,
        groupTag: cleanTag,
        groupColor,
        status
      })
      if (addedGoal) {
        const deadlineDate = addedGoal.deadline
          ? addedGoal.deadline.includes('T')
            ? addedGoal.deadline.split('T')[0]
            : addedGoal.deadline
          : null
        if (addedGoal.status === 'in_progress' || !deadlineDate || deadlineDate <= today) {
          setTodayGoals((prev) => [...prev, addedGoal])
        }
      }
      toastRef.current.success(
        `Task "${title}" added to ${status === 'in_progress' ? "today's focus" : 'planned'}.`,
        'Task Added'
      )
    },
    [getTodayStr, setTodayGoals, toastRef]
  )

  const handleUpdateGoal = useCallback(
    async (goal: DailyGoal): Promise<void> => {
      let previousSingleGoal: DailyGoal | undefined
      let goalExisted = false
      setTodayGoals((prev) => {
        const existing = prev.find((g) => g.id === goal.id)
        goalExisted = Boolean(existing)
        previousSingleGoal = existing
        return existing ? prev.map((g) => (g.id === goal.id ? goal : g)) : [...prev, goal]
      })
      try {
        const today = getTodayStr()
        const saved = await window.api.goals.update(today, goal)
        if (saved) {
          const targetDeadline = saved.deadline
            ? saved.deadline.includes('T')
              ? saved.deadline.split('T')[0]
              : saved.deadline
            : null
          setTodayGoals((prev) => {
            if (saved.status === 'planned' && targetDeadline && targetDeadline > today) {
              return prev.filter((g) => g.id !== saved.id)
            }
            return prev.map((g) => (g.id === saved.id ? saved : g))
          })
        }
      } catch (err) {
        console.error('Failed to update goal:', err)
        // Roll back ONLY the targeted goal to avoid obliterating concurrent edits to other goals
        setTodayGoals((prev) => {
          if (!goalExisted) {
            return prev.filter((g) => g.id !== goal.id)
          }
          if (previousSingleGoal) {
            return prev.map((g) => (g.id === goal.id ? previousSingleGoal! : g))
          }
          return prev
        })
        await loadTodayData().catch(() => {})
        toastRef.current.error('Could not update task.', 'Update Failed')
        throw err
      }
    },
    [getTodayStr, setTodayGoals, loadTodayData, toastRef]
  )

  const handleUpdateGoals = useCallback(
    async (goals: DailyGoal[]): Promise<void> => {
      if (goals.length === 0) return
      const previousItemsMap = new Map<string, DailyGoal>()
      const existingUpdatedIds = new Set<string>()
      setTodayGoals((prev) => {
        const incomingMap = new Map(goals.map((g) => [g.id, g]))
        for (const g of prev) {
          if (incomingMap.has(g.id)) {
            previousItemsMap.set(g.id, g)
            existingUpdatedIds.add(g.id)
          }
        }
        const updated = prev.map((g) => incomingMap.get(g.id) || g)
        const existingIds = new Set(prev.map((g) => g.id))
        const newItems = goals.filter((g) => !existingIds.has(g.id))
        return newItems.length > 0 ? [...updated, ...newItems] : updated
      })
      try {
        let savedGoals: DailyGoal[] | undefined
        const today = getTodayStr()
        if (window.api.goals.updateBatch) {
          savedGoals = await window.api.goals.updateBatch(goals)
        } else {
          savedGoals = await Promise.all(goals.map((g) => window.api.goals.update(today, g)))
        }
        if (Array.isArray(savedGoals) && savedGoals.length > 0) {
          const savedMap = new Map(savedGoals.map((g) => [g.id, g]))
          setTodayGoals((prev) =>
            prev
              .map((g) => savedMap.get(g.id) || g)
              .filter((g) => {
                if (g.status === 'planned' && g.deadline) {
                  const dDate = g.deadline.includes('T') ? g.deadline.split('T')[0] : g.deadline
                  if (dDate > today) return false
                }
                return true
              })
          )
        }
      } catch (err) {
        console.error('Failed to update tasks in batch:', err)
        // Roll back ONLY the affected goals, preserving concurrent edits to other goals
        const targetedIds = new Set(goals.map((g) => g.id))
        setTodayGoals((prev) =>
          prev
            .filter((g) => existingUpdatedIds.has(g.id) || !targetedIds.has(g.id))
            .map((g) => previousItemsMap.get(g.id) || g)
        )
        await loadTodayData().catch(() => {})
        toastRef.current.error('Could not save task changes.', 'Update Failed')
        throw err
      }
    },
    [getTodayStr, setTodayGoals, loadTodayData, toastRef]
  )

  const handlePromoteGoal = useCallback(
    async (goal: DailyGoal): Promise<void> => {
      const inProgressGoals = todayGoals.filter(
        (g) => g.status === 'in_progress' && g.id !== goal.id
      )
      inProgressGoals.sort((a, b) => {
        const orderA = typeof a.sortOrder === 'number' ? a.sortOrder : DEFAULT_SORT_ORDER
        const orderB = typeof b.sortOrder === 'number' ? b.sortOrder : DEFAULT_SORT_ORDER
        if (orderA !== orderB) return orderA - orderB
        return a.createdAt.localeCompare(b.createdAt)
      })
      const orders = calculateFractionalSortOrders(inProgressGoals, inProgressGoals.length, 1)
      const updatedGoal: DailyGoal = {
        ...goal,
        status: 'in_progress',
        updatedAt: new Date().toISOString()
      }
      if (orders && orders.length > 0) {
        updatedGoal.sortOrder = orders[0]
        await handleUpdateGoal(updatedGoal)
      } else {
        const { changedGoals } = rebalanceGoals(inProgressGoals, inProgressGoals.length, [
          updatedGoal
        ])
        await handleUpdateGoals(changedGoals)
      }
    },
    [todayGoals, handleUpdateGoal, handleUpdateGoals]
  )

  const handleDeleteGoal = useCallback(
    async (goal: DailyGoal): Promise<void> => {
      setTodayGoals((prev) => prev.filter((g) => g.id !== goal.id))

      try {
        await window.api.goals.delete(goal.id)
        toastRef.current.success(`Task "${goal.title}" deleted.`, 'Task Deleted', {
          label: 'Undo',
          onClick: async () => {
            try {
              if (window.api.goals.restore) {
                setTodayGoals((prev) => {
                  if (prev.some((g) => g.id === goal.id)) return prev
                  return [...prev, { ...goal, deletedAt: undefined }]
                })
                await window.api.goals.restore(goal.id)
              }
            } catch {
              await loadTodayData()
              toastRef.current.error('Could not undo delete.', 'Undo Failed')
            }
          }
        })
      } catch (e) {
        console.error('Failed to delete goal:', e)
        await loadTodayData()
        toastRef.current.error('Could not delete task.', 'Action Failed')
      }
    },
    [setTodayGoals, loadTodayData, toastRef]
  )

  const handleDeleteGoals = useCallback(
    async (goals: DailyGoal[]): Promise<void> => {
      if (goals.length === 0) return
      const idsToDelete = new Set(goals.map((g) => g.id))
      setTodayGoals((prev) => prev.filter((g) => !idsToDelete.has(g.id)))

      try {
        if (window.api.goals.deleteBatch) {
          await window.api.goals.deleteBatch(goals.map((g) => g.id))
        } else {
          await Promise.all(
            goals.map(async (goal) => {
              try {
                await window.api.goals.delete(goal.id)
              } catch (ipcErr) {
                console.warn('DeleteGoal failed for goal id:', goal.id, ipcErr)
              }
            })
          )
        }
        const deletedGoals = [...goals]
        toastRef.current.success(
          `${goals.length} ${goals.length === 1 ? 'task' : 'tasks'} deleted.`,
          'Tasks Deleted',
          {
            label: 'Undo',
            onClick: async () => {
              try {
                if (window.api.goals.restoreBatch) {
                  setTodayGoals((prev) => {
                    const existingIds = new Set(prev.map((g) => g.id))
                    const toAdd = deletedGoals
                      .filter((g) => !existingIds.has(g.id))
                      .map((g) => ({ ...g, deletedAt: undefined }))
                    return [...prev, ...toAdd]
                  })
                  await window.api.goals.restoreBatch(deletedGoals.map((g) => g.id))
                } else if (window.api.goals.restore) {
                  setTodayGoals((prev) => {
                    const existingIds = new Set(prev.map((g) => g.id))
                    const toAdd = deletedGoals
                      .filter((g) => !existingIds.has(g.id))
                      .map((g) => ({ ...g, deletedAt: undefined }))
                    return [...prev, ...toAdd]
                  })
                  await Promise.all(deletedGoals.map((g) => window.api.goals.restore!(g.id)))
                }
              } catch {
                await loadTodayData()
                toastRef.current.error('Could not undo delete.', 'Undo Failed')
              }
            }
          }
        )
      } catch (e) {
        console.error('Failed to bulk delete goals:', e)
        await loadTodayData()
        toastRef.current.error('Could not delete tasks.', 'Action Failed')
      }
    },
    [setTodayGoals, loadTodayData, toastRef]
  )

  const handleGoalRestored = useCallback(
    (restoredGoal: DailyGoal): void => {
      const today = getTodayStr()
      if (restoredGoal.date === today) {
        setTodayGoals((prev) => {
          const exists = prev.some((g) => g.id === restoredGoal.id)
          return exists
            ? prev.map((g) => (g.id === restoredGoal.id ? restoredGoal : g))
            : [...prev, restoredGoal]
        })
      }
      loadHeatmap()
      if (tabRef.current === 'review') {
        loadDayReview(selectedDayDateRef.current)
      }
    },
    [getTodayStr, setTodayGoals, loadHeatmap, loadDayReview, selectedDayDateRef, tabRef]
  )

  const handleCarryGoal = async (goal: DailyGoal): Promise<void> => {
    try {
      const today = getTodayStr()
      await window.api.goals.carry(goal.date, today, goal.id)
      await Promise.all([loadTodayData(), loadDayReview(selectedDayDateRef.current)])
      toastRef.current.success(`Task "${goal.title}" carried forward to today.`, 'Carried Forward')
    } catch (e) {
      console.error('Failed to carry goal:', e)
      toastRef.current.error('Could not carry goal forward.', 'Action Failed')
    }
  }

  const handleCarryAllGoals = async (goals: DailyGoal[]): Promise<void> => {
    if (!goals || goals.length === 0) return
    try {
      const today = getTodayStr()
      const fromDate = goals[0].date
      const goalIds = goals.map((g) => g.id)
      if (typeof window.api?.goals?.carryBatch === 'function') {
        await window.api.goals.carryBatch(fromDate, today, goalIds)
      } else {
        for (const goal of goals) {
          await window.api.goals.carry(fromDate, today, goal.id)
        }
      }
      await Promise.all([loadTodayData(), loadDayReview(selectedDayDateRef.current)])
      toastRef.current.success(
        `${goals.length} task${goals.length > 1 ? 's' : ''} carried forward to today.`,
        'Tasks Carried Forward'
      )
    } catch (e) {
      console.error('Failed to carry all goals:', e)
      toastRef.current.error('Could not carry goals forward.', 'Action Failed')
    }
  }

  const handleReopenGoal = async (goal: DailyGoal): Promise<void> => {
    try {
      const today = getTodayStr()
      const reopenedGoal: DailyGoal = {
        ...goal,
        date: today,
        status: 'in_progress',
        completedAt: undefined,
        effectiveDate: undefined,
        updatedAt: new Date().toISOString()
      }
      await window.api.goals.update(today, reopenedGoal)
      setTodayGoals((prev) => {
        const filtered = prev.filter((g) => g.id !== goal.id)
        return [...filtered, reopenedGoal]
      })
      await Promise.all([loadTodayData(), loadDayReview(selectedDayDateRef.current)])
      toastRef.current.success(`Task "${goal.title}" reopened and moved to today.`, 'Task Reopened')
    } catch (e) {
      console.error('Failed to reopen goal:', e)
      toastRef.current.error('Could not reopen task.', 'Action Failed')
    }
  }

  const handleResetTriggerAdd = useCallback(() => setTriggerAddGoal(0), [setTriggerAddGoal])
  const handleNavigateToToday = useCallback(() => setTab('today'), [setTab])
  const handleOpenPlanner = useCallback(() => setTab('goals'), [setTab])

  return {
    handleAddGoal,
    handleUpdateGoal,
    handleUpdateGoals,
    handlePromoteGoal,
    handleDeleteGoal,
    handleDeleteGoals,
    handleGoalRestored,
    handleCarryGoal,
    handleCarryAllGoals,
    handleReopenGoal,
    handleResetTriggerAdd,
    handleNavigateToToday,
    handleOpenPlanner
  }
}
