import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useGoalsGroupManagement } from '../useGoalsGroupManagement'
import type { DailyGoal } from '../../../../../../shared/types'

describe('useGoalsGroupManagement Hook', () => {
  const mockGoals: DailyGoal[] = [
    {
      id: 'g1',
      date: '2026-11-01',
      title: 'Goal 1',
      status: 'planned',
      groupTag: 'Backend',
      groupColor: 'blue',
      createdAt: '2026-11-01T10:00:00Z'
    },
    {
      id: 'g2',
      date: '2026-11-01',
      title: 'Goal 2',
      status: 'planned',
      groupTag: 'Backend',
      groupColor: 'blue',
      createdAt: '2026-11-01T10:05:00Z'
    },
    {
      id: 'g3',
      date: '2026-11-01',
      title: 'Goal 3',
      status: 'in_progress',
      createdAt: '2026-11-01T10:10:00Z'
    }
  ]

  it('updates group color theme for all matching goals', async () => {
    const updateMultipleGoals = vi.fn().mockResolvedValue(undefined)
    const deleteMultipleGoals = vi.fn().mockResolvedValue(undefined)
    const onUpdateDailyGoal = vi.fn().mockResolvedValue(undefined)

    const { result } = renderHook(() =>
      useGoalsGroupManagement({
        dailyGoals: mockGoals,
        updateMultipleGoals,
        deleteMultipleGoals,
        onUpdateDailyGoal
      })
    )

    await act(async () => {
      await result.current.updateGroupColorTheme('Backend', 'teal')
    })

    expect(updateMultipleGoals).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'g1', groupColor: 'teal' }),
      expect.objectContaining({ id: 'g2', groupColor: 'teal' })
    ])
  })

  it('moves whole group to a different status', async () => {
    const updateMultipleGoals = vi.fn().mockResolvedValue(undefined)
    const deleteMultipleGoals = vi.fn().mockResolvedValue(undefined)
    const onUpdateDailyGoal = vi.fn().mockResolvedValue(undefined)

    const { result } = renderHook(() =>
      useGoalsGroupManagement({
        dailyGoals: mockGoals,
        updateMultipleGoals,
        deleteMultipleGoals,
        onUpdateDailyGoal
      })
    )

    await act(async () => {
      await result.current.moveWholeGroup([mockGoals[0], mockGoals[1]], 'done')
    })

    expect(updateMultipleGoals).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'g1', status: 'done', completedAt: expect.any(String) }),
      expect.objectContaining({ id: 'g2', status: 'done', completedAt: expect.any(String) })
    ])
  })

  it('dissolves a group removing the tag from goals', async () => {
    const updateMultipleGoals = vi.fn().mockResolvedValue(undefined)
    const deleteMultipleGoals = vi.fn().mockResolvedValue(undefined)
    const onUpdateDailyGoal = vi.fn().mockResolvedValue(undefined)
    const onFilterChange = vi.fn()

    const { result } = renderHook(() =>
      useGoalsGroupManagement({
        dailyGoals: mockGoals,
        getSelectedGroupFilter: () => 'Backend',
        onFilterChange,
        updateMultipleGoals,
        deleteMultipleGoals,
        onUpdateDailyGoal
      })
    )

    await act(async () => {
      await result.current.handleDissolveGroup('Backend')
    })

    expect(updateMultipleGoals).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'g1', groupTag: undefined, groupColor: undefined }),
      expect.objectContaining({ id: 'g2', groupTag: undefined, groupColor: undefined })
    ])
    expect(onFilterChange).toHaveBeenCalledWith('all')
  })

  it('deletes group with all tasks', async () => {
    const updateMultipleGoals = vi.fn().mockResolvedValue(undefined)
    const deleteMultipleGoals = vi.fn().mockResolvedValue(undefined)
    const onUpdateDailyGoal = vi.fn().mockResolvedValue(undefined)

    const { result } = renderHook(() =>
      useGoalsGroupManagement({
        dailyGoals: mockGoals,
        updateMultipleGoals,
        deleteMultipleGoals,
        onUpdateDailyGoal
      })
    )

    await act(async () => {
      await result.current.handleDeleteGroupWithTasks('Backend')
    })

    expect(deleteMultipleGoals).toHaveBeenCalledWith([mockGoals[0], mockGoals[1]])
  })

  it('assigns a goal to a group and updates contextMenu', async () => {
    const updateMultipleGoals = vi.fn().mockResolvedValue(undefined)
    const deleteMultipleGoals = vi.fn().mockResolvedValue(undefined)
    const onUpdateDailyGoal = vi.fn().mockResolvedValue(undefined)
    const setContextMenu = vi.fn()

    const { result } = renderHook(() =>
      useGoalsGroupManagement({
        dailyGoals: mockGoals,
        updateMultipleGoals,
        deleteMultipleGoals,
        onUpdateDailyGoal,
        setContextMenu
      })
    )

    await act(async () => {
      await result.current.handleAssignTaskGroup(mockGoals[2], 'Frontend', 'purple')
    })

    expect(onUpdateDailyGoal).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'g3',
        groupTag: 'Frontend',
        groupColor: 'purple'
      })
    )
    expect(setContextMenu).toHaveBeenCalledWith(null)
  })
})
