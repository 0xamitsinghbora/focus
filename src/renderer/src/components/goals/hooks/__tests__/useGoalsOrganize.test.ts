import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useGoalsOrganize } from '../useGoalsOrganize'
import { DailyGoal } from '../../../../../../shared/types'

describe('useGoalsOrganize Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mockGoals: DailyGoal[] = [
    {
      id: 'g1',
      date: '2026-03-01',
      title: 'Zebra Task',
      status: 'planned',
      createdAt: '2026-03-01T10:00:00Z',
      groupTag: 'Backend',
      groupColor: 'blue',
      sortOrder: 2
    },
    {
      id: 'g2',
      date: '2026-03-01',
      title: 'Alpha Task',
      status: 'planned',
      createdAt: '2026-03-01T11:00:00Z',
      groupTag: 'Frontend',
      groupColor: 'purple',
      sortOrder: 1
    },
    {
      id: 'g3',
      date: '2026-03-01',
      title: 'In Progress Work',
      status: 'in_progress',
      createdAt: '2026-03-01T09:00:00Z',
      deadline: '2026-03-01T18:00:00Z'
    },
    {
      id: 'g4',
      date: '2026-03-01',
      title: 'Done Work',
      status: 'done',
      createdAt: '2026-03-01T08:00:00Z',
      completedAt: '2026-03-01T12:00:00Z'
    }
  ]

  it('correctly partitions goals into planned, in_progress, and done columns', () => {
    const { result } = renderHook(() => useGoalsOrganize(mockGoals))

    expect(result.current.processedGoalsByColumn.planned).toHaveLength(2)
    expect(result.current.processedGoalsByColumn.in_progress).toHaveLength(1)
    expect(result.current.processedGoalsByColumn.done).toHaveLength(1)
  })

  it('computes group counts and existing groups', () => {
    const { result } = renderHook(() => useGoalsOrganize(mockGoals))

    expect(result.current.groupCounts.total).toBe(4)
    expect(result.current.groupCounts.untagged).toBe(2)
    expect(result.current.groupCounts.counts['Backend']).toBe(1)
    expect(result.current.groupCounts.counts['Frontend']).toBe(1)
    expect(result.current.existingGroups.map((g) => g.tag)).toEqual(
      expect.arrayContaining(['Backend', 'Frontend'])
    )
  })

  it('filters goals when a specific group tag is selected', () => {
    const { result } = renderHook(() => useGoalsOrganize(mockGoals))

    act(() => {
      result.current.setSelectedGroupFilter('Backend')
    })

    expect(result.current.processedGoalsByColumn.planned).toHaveLength(1)
    expect(result.current.processedGoalsByColumn.planned[0].id).toBe('g1')
    expect(result.current.processedGoalsByColumn.in_progress).toHaveLength(0)
  })

  it('filters goals when __untagged__ filter is selected', () => {
    const { result } = renderHook(() => useGoalsOrganize(mockGoals))

    act(() => {
      result.current.setSelectedGroupFilter('__untagged__')
    })

    expect(result.current.processedGoalsByColumn.planned).toHaveLength(0)
    expect(result.current.processedGoalsByColumn.in_progress).toHaveLength(1)
    expect(result.current.processedGoalsByColumn.done).toHaveLength(1)
  })

  it('sorts alphabetically ascending when alpha-asc is chosen', () => {
    const { result } = renderHook(() => useGoalsOrganize(mockGoals))

    act(() => {
      result.current.setSortOption('alpha-asc')
    })

    const plannedTitles = result.current.processedGoalsByColumn.planned.map((g) => g.title)
    expect(plannedTitles).toEqual(['Alpha Task', 'Zebra Task'])
  })

  it('toggles focus mode collapsing planned and done', () => {
    const { result } = renderHook(() => useGoalsOrganize(mockGoals))

    expect(result.current.collapsedCols.planned).toBe(false)
    expect(result.current.collapsedCols.done).toBe(false)

    act(() => {
      result.current.toggleFocusMode()
    })

    expect(result.current.collapsedCols.planned).toBe(true)
    expect(result.current.collapsedCols.in_progress).toBe(false)
    expect(result.current.collapsedCols.done).toBe(true)

    // Toggling again restores all columns
    act(() => {
      result.current.toggleFocusMode()
    })

    expect(result.current.collapsedCols.planned).toBe(false)
    expect(result.current.collapsedCols.done).toBe(false)
  })

  it('toggles single column collapse', () => {
    const { result } = renderHook(() => useGoalsOrganize(mockGoals))

    act(() => {
      result.current.toggleCollapse('planned')
    })

    expect(result.current.collapsedCols.planned).toBe(true)
    expect(result.current.collapsedCols.in_progress).toBe(false)
  })

  it('hydrates preferences from api.settings and persists changes via api.settings.patch', async () => {
    let patched: any = {}
    ;(window as any).api = {
      settings: {
        get: async () => ({
          reminderIntervalMinutes: 45,
          openAtLogin: true,
          sortOption: 'alpha-asc',
          collapsedColumns: { planned: true, in_progress: false, done: true }
        }),
        patch: async (partial: any) => {
          patched = { ...patched, ...partial }
        }
      }
    }

    const { result } = renderHook(() => useGoalsOrganize(mockGoals))

    await act(async () => {
      await Promise.resolve()
    })

    expect(result.current.sortOption).toBe('alpha-asc')
    expect(result.current.collapsedCols).toEqual({
      planned: true,
      in_progress: false,
      done: true
    })

    // Changing sort option updates state and dispatches patch to api.settings
    act(() => {
      result.current.setSortOption('manual')
    })
    expect(patched.sortOption).toBe('manual')
    expect(result.current.sortOption).toBe('manual')

    // Toggling collapse updates state and dispatches patch to api.settings
    act(() => {
      result.current.toggleCollapse('planned')
    })
    expect(patched.collapsedColumns).toEqual({
      planned: false,
      in_progress: false,
      done: true
    })

    delete (window as any).api
  })

  it('deduplicates case-variant groups and computes aggregate counts case-insensitively', () => {
    const goalsWithCaseVariants: DailyGoal[] = [
      {
        id: 'c1',
        date: '2026-03-01',
        title: 'Task 1',
        status: 'planned',
        createdAt: '2026-03-01T10:00:00Z',
        groupTag: 'design'
      },
      {
        id: 'c2',
        date: '2026-03-01',
        title: 'Task 2',
        status: 'planned',
        createdAt: '2026-03-01T11:00:00Z',
        groupTag: 'Design'
      },
      {
        id: 'c3',
        date: '2026-03-01',
        title: 'Task 3',
        status: 'in_progress',
        createdAt: '2026-03-01T12:00:00Z',
        groupTag: 'DESIGN'
      },
      {
        id: 'c4',
        date: '2026-03-01',
        title: 'Task 4',
        status: 'planned',
        createdAt: '2026-03-01T13:00:00Z',
        groupTag: 'Untagged'
      }
    ]

    const { result } = renderHook(() => useGoalsOrganize(goalsWithCaseVariants))

    // Existing groups should deduplicate 'design', 'Design', 'DESIGN' into a single entry with preferred casing
    expect(result.current.existingGroups).toHaveLength(1)
    expect(result.current.existingGroups[0].tag).toBe('Design')

    // groupCounts should accurately aggregate all 3 tasks under both canonical and lowercase keys
    expect(result.current.groupCounts.counts['Design']).toBe(3)
    expect(result.current.groupCounts.counts['design']).toBe(3)
    expect(result.current.groupCounts.untagged).toBe(1)
    expect(result.current.groupCounts.total).toBe(4)

    // Filtering by 'design' or 'Design' should return all 3 tasks across status columns
    act(() => {
      result.current.setSelectedGroupFilter('design')
    })
    expect(result.current.processedGoalsByColumn.planned).toHaveLength(2)
    expect(result.current.processedGoalsByColumn.in_progress).toHaveLength(1)

    // Filtering by '__untagged__' should match 'Untagged'
    act(() => {
      result.current.setSelectedGroupFilter('__untagged__')
    })
    expect(result.current.processedGoalsByColumn.planned).toHaveLength(1)
    expect(result.current.processedGoalsByColumn.planned[0].id).toBe('c4')
  })

  it('sorts due-date correctly treating date-only deadlines as end-of-day and tie-breaking by createdAt', () => {
    const dueDateGoals: DailyGoal[] = [
      {
        id: 'no-due-1',
        date: '2026-03-01',
        title: 'No Due Date Task',
        status: 'planned',
        createdAt: '2026-03-01T08:00:00Z'
      },
      {
        id: 'date-only',
        date: '2026-03-01',
        title: 'All-Day March 1st Task',
        status: 'planned',
        createdAt: '2026-03-01T07:00:00Z',
        deadline: '2026-03-01'
      },
      {
        id: 'morning-time',
        date: '2026-03-01',
        title: 'Morning March 1st Task',
        status: 'planned',
        createdAt: '2026-03-01T06:00:00Z',
        deadline: '2026-03-01T09:30:00'
      },
      {
        id: 'next-day',
        date: '2026-03-01',
        title: 'March 2nd Morning Task',
        status: 'planned',
        createdAt: '2026-03-01T05:00:00Z',
        deadline: '2026-03-02T08:00:00'
      }
    ]

    const { result } = renderHook(() => useGoalsOrganize(dueDateGoals))

    act(() => {
      result.current.setSortOption('due-date')
    })

    const plannedIds = result.current.processedGoalsByColumn.planned.map((g) => g.id)
    // Morning 9:30 AM should come before All-Day (end of day 23:59:59),
    // which should come before Next Day 8:00 AM,
    // which should come before task with no deadline.
    expect(plannedIds).toEqual(['morning-time', 'date-only', 'next-day', 'no-due-1'])
  })

  it('correctly sorts deadlines across different timezone offsets chronologically', () => {
    const tzGoals: DailyGoal[] = [
      {
        id: 'later-in-utc',
        date: '2026-03-01',
        title: 'Later UTC Time (09:00 PST = 17:00 UTC)',
        status: 'planned',
        createdAt: '2026-03-01T01:00:00Z',
        deadline: '2026-03-01T09:00:00-08:00' // 17:00:00Z
      },
      {
        id: 'earlier-in-utc',
        date: '2026-03-01',
        title: 'Earlier UTC Time (12:00 UTC)',
        status: 'planned',
        createdAt: '2026-03-01T02:00:00Z',
        deadline: '2026-03-01T12:00:00Z' // 12:00:00Z
      }
    ]

    const { result } = renderHook(() => useGoalsOrganize(tzGoals))
    act(() => {
      result.current.setSortOption('due-date')
    })

    const plannedIds = result.current.processedGoalsByColumn.planned.map((g) => g.id)
    // 12:00 UTC should come before 17:00 UTC even though "09:00" is lexicographically smaller than "12:00"
    expect(plannedIds).toEqual(['earlier-in-utc', 'later-in-utc'])
  })

  it('synchronizes sortOption and collapsedColumns with window.api.settings', async () => {
    const mockSetSettings = vi.fn().mockResolvedValue(undefined)
    const mockGetSettings = vi.fn().mockResolvedValue({
      sortOption: 'newest',
      collapsedColumns: { planned: true, in_progress: false, done: false }
    })
    ;(window as any).api = {
      settings: {
        get: mockGetSettings,
        set: mockSetSettings
      }
    }

    const { result } = renderHook(() => useGoalsOrganize(mockGoals))

    expect(mockGetSettings).toHaveBeenCalled()

    await act(async () => {
      result.current.setSortOption('alpha-asc')
    })

    expect(mockSetSettings).toHaveBeenCalledWith(
      expect.objectContaining({ sortOption: 'alpha-asc' })
    )

    await act(async () => {
      result.current.toggleCollapse('done')
    })

    expect(mockSetSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        collapsedColumns: expect.objectContaining({ done: true })
      })
    )
  })
})
