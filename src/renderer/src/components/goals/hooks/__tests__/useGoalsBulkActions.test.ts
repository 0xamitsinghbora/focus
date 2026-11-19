import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useGoalsBulkActions } from '../useGoalsBulkActions'
import { DailyGoal } from '../../../../../../shared/types'

describe('useGoalsBulkActions Hook', () => {
  const mockGoals: DailyGoal[] = [
    {
      id: '1',
      date: '2026-03-01',
      title: 'Task 1',
      status: 'planned',
      createdAt: '2026-03-01T10:00:00Z'
    },
    {
      id: '2',
      date: '2026-03-01',
      title: 'Task 2',
      status: 'planned',
      createdAt: '2026-03-01T11:00:00Z'
    },
    {
      id: '3',
      date: '2026-03-01',
      title: 'Task 3',
      status: 'planned',
      createdAt: '2026-03-01T12:00:00Z'
    },
    {
      id: '4',
      date: '2026-03-01',
      title: 'Task 4',
      status: 'planned',
      createdAt: '2026-03-01T13:00:00Z'
    }
  ]

  it('selects and deselects individual goals', () => {
    const { result } = renderHook(() => useGoalsBulkActions(mockGoals))

    expect(result.current.isSelected('1')).toBe(false)

    act(() => {
      result.current.toggleSelectGoal('1')
    })

    expect(result.current.isSelected('1')).toBe(true)
    expect(result.current.selectedGoals).toHaveLength(1)

    act(() => {
      result.current.toggleSelectGoal('1')
    })

    expect(result.current.isSelected('1')).toBe(false)
    expect(result.current.selectedGoals).toHaveLength(0)
  })

  it('handles shift-click range selection', () => {
    const { result } = renderHook(() => useGoalsBulkActions(mockGoals))

    // Select first task
    act(() => {
      result.current.toggleSelectGoal('1')
    })

    // Shift select to task 3
    act(() => {
      result.current.toggleSelectGoal('3', true, mockGoals)
    })

    expect(result.current.isSelected('1')).toBe(true)
    expect(result.current.isSelected('2')).toBe(true)
    expect(result.current.isSelected('3')).toBe(true)
    expect(result.current.isSelected('4')).toBe(false)
    expect(result.current.selectedGoals).toHaveLength(3)
  })

  it('performs shift-click range selection across custom sorted visible goals', () => {
    // Custom visible sort order: 4, 2, 1, 3
    const visibleSorted = [mockGoals[3], mockGoals[1], mockGoals[0], mockGoals[2]]
    const { result } = renderHook(() => useGoalsBulkActions(visibleSorted))

    // Select first visible goal (id: 4)
    act(() => {
      result.current.toggleSelectGoal('4')
    })

    // Shift-click third visible goal (id: 1)
    act(() => {
      result.current.toggleSelectGoal('1', true)
    })

    // Should select 4, 2, 1 (range in visible sorted order), but NOT 3
    expect(result.current.isSelected('4')).toBe(true)
    expect(result.current.isSelected('2')).toBe(true)
    expect(result.current.isSelected('1')).toBe(true)
    expect(result.current.isSelected('3')).toBe(false)
  })

  it('selects all goals and clears selection', () => {
    const { result } = renderHook(() => useGoalsBulkActions(mockGoals))

    act(() => {
      result.current.selectAll(mockGoals)
    })

    expect(result.current.selectedGoalIds.size).toBe(4)

    act(() => {
      result.current.clearSelection()
    })

    expect(result.current.selectedGoalIds.size).toBe(0)
    expect(result.current.selectedGoals).toHaveLength(0)
  })

  it('automatically prunes selected goals that are no longer visible when filter changes', () => {
    let currentVisible = [...mockGoals]
    const { result, rerender } = renderHook(() => useGoalsBulkActions(currentVisible))

    act(() => {
      result.current.toggleSelectGoal('1')
      result.current.toggleSelectGoal('2')
    })
    expect(result.current.selectedGoalIds.size).toBe(2)
    expect(result.current.selectedGoals).toHaveLength(2)

    // User filters out Task 2 (only Task 1 and Task 3 are visible)
    currentVisible = [mockGoals[0], mockGoals[2]]
    rerender()

    // Task 2 should be automatically pruned from selection
    expect(result.current.isSelected('1')).toBe(true)
    expect(result.current.isSelected('2')).toBe(false)
    expect(result.current.selectedGoalIds.size).toBe(1)
    expect(result.current.selectedGoals).toHaveLength(1)
  })

  it('preserves selection across visible filter changes when allGoals is provided, but prunes if removed from allGoals', () => {
    let all = [...mockGoals]
    let visible = [...mockGoals]
    const { result, rerender } = renderHook(() => useGoalsBulkActions(visible, all))

    act(() => {
      result.current.toggleSelectGoal('1')
      result.current.toggleSelectGoal('2')
    })
    expect(result.current.selectedGoalIds.size).toBe(2)
    expect(result.current.lastSelectedGoalId).toBe('2')

    // Filter visible down to Task 1 only (e.g. search)
    visible = [mockGoals[0]]
    rerender()

    // Selection should be preserved because allGoals still contains both tasks
    expect(result.current.isSelected('1')).toBe(true)
    expect(result.current.isSelected('2')).toBe(true)
    expect(result.current.selectedGoalIds.size).toBe(2)
    expect(result.current.selectedGoals).toHaveLength(2)

    // Now permanently remove Task 2 from allGoals (e.g. deleted)
    all = [mockGoals[0], mockGoals[2], mockGoals[3]]
    rerender()

    // Task 2 should be pruned and lastSelectedGoalId reset
    expect(result.current.isSelected('1')).toBe(true)
    expect(result.current.isSelected('2')).toBe(false)
    expect(result.current.selectedGoalIds.size).toBe(1)
    expect(result.current.lastSelectedGoalId).toBeNull()
  })
})
