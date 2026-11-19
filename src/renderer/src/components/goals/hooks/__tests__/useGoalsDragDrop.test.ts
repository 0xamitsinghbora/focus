import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useGoalsDragDrop } from '../useGoalsDragDrop'
import { DailyGoal } from '../../../../../../shared/types'

describe('useGoalsDragDrop Hook - Fractional Reordering & Bulk Updates', () => {
  const goal1: DailyGoal = {
    id: 'g1',
    date: '2026-10-29',
    title: 'Task 1',
    status: 'planned',
    createdAt: '2026-10-29T10:00:00.000Z',
    sortOrder: 1000
  }
  const goal2: DailyGoal = {
    id: 'g2',
    date: '2026-10-29',
    title: 'Task 2',
    status: 'planned',
    createdAt: '2026-10-29T10:01:00.000Z',
    sortOrder: 2000
  }
  const goal3: DailyGoal = {
    id: 'g3',
    date: '2026-10-29',
    title: 'Task 3',
    status: 'planned',
    createdAt: '2026-10-29T10:02:00.000Z',
    sortOrder: 3000
  }

  const initialGoals = [goal1, goal2, goal3]

  it('updates ONLY the moved card with a fractional sortOrder when dragging between two items', async () => {
    const updateMultipleGoals = vi.fn().mockResolvedValue(undefined)
    const setSortOption = vi.fn()
    const setSelectedGoalIds = vi.fn()

    const { result } = renderHook(() =>
      useGoalsDragDrop({
        dailyGoals: initialGoals,
        processedGoalsByColumn: {
          planned: [goal1, goal2, goal3],
          in_progress: [],
          done: []
        },
        groupByTag: false,
        selectedGoalIds: new Set(),
        setSelectedGoalIds,
        toggleSelectGoal: vi.fn(),
        updateMultipleGoals,
        moveWholeGroup: vi.fn(),
        setSortOption
      })
    )

    // Simulate mouse drag start on goal3
    act(() => {
      result.current.onPointerDownCard(
        {
          button: 0,
          clientX: 100,
          clientY: 100,
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
          target: document.createElement('div')
        } as unknown as React.PointerEvent,
        goal3,
        'planned'
      )
    })

    // Drag beyond threshold
    act(() => {
      window.dispatchEvent(
        new PointerEvent('pointermove', {
          clientX: 100,
          clientY: 150
        })
      )
    })

    // Mock document.elementFromPoint to return an element representing goal1 with drop target
    const targetElement = document.createElement('div')
    targetElement.setAttribute('data-task-card', 'true')
    targetElement.dataset.goalId = goal1.id
    targetElement.dataset.column = 'planned'
    // Target position: 'after' goal1 (between goal1 and goal2)
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(targetElement)
    vi.spyOn(targetElement, 'getBoundingClientRect').mockReturnValue({
      top: 100,
      bottom: 200,
      height: 100,
      left: 0,
      right: 100,
      width: 100,
      x: 0,
      y: 100,
      toJSON: () => {}
    })

    // Move pointer over bottom half of goal1 -> position: 'after'
    act(() => {
      window.dispatchEvent(
        new PointerEvent('pointermove', {
          clientX: 50,
          clientY: 175 // > 150 midpoint => position: 'after'
        })
      )
    })

    // Release mouse
    await act(async () => {
      window.dispatchEvent(
        new PointerEvent('pointerup', {
          clientX: 50,
          clientY: 175
        })
      )
    })

    // Verify updateMultipleGoals was called with ONLY 1 item (goal3), NOT all 3 items!
    expect(updateMultipleGoals).toHaveBeenCalledTimes(1)
    const updatedGoals = updateMultipleGoals.mock.calls[0][0]
    expect(updatedGoals).toHaveLength(1)
    expect(updatedGoals[0].id).toBe(goal3.id)
    // Between goal1 (1000) and goal2 (2000) -> fractional midpoint 1500!
    expect(updatedGoals[0].sortOrder).toBe(1500)
    expect(setSortOption).toHaveBeenCalledWith('manual')
    expect(result.current.announcement).toContain('Moved')
  })

  it('triggers rebalance and updates in a single batch when sort orders are uninitialized', async () => {
    const uninitGoal1: DailyGoal = { ...goal1, sortOrder: undefined }
    const uninitGoal2: DailyGoal = { ...goal2, sortOrder: undefined }
    const uninitGoal3: DailyGoal = { ...goal3, sortOrder: undefined }

    const updateMultipleGoals = vi.fn().mockResolvedValue(undefined)
    const setSortOption = vi.fn()

    const { result } = renderHook(() =>
      useGoalsDragDrop({
        dailyGoals: [uninitGoal1, uninitGoal2, uninitGoal3],
        processedGoalsByColumn: {
          planned: [uninitGoal1, uninitGoal2, uninitGoal3],
          in_progress: [],
          done: []
        },
        groupByTag: false,
        selectedGoalIds: new Set(),
        setSelectedGoalIds: vi.fn(),
        toggleSelectGoal: vi.fn(),
        updateMultipleGoals,
        moveWholeGroup: vi.fn(),
        setSortOption
      })
    )

    act(() => {
      result.current.onPointerDownCard(
        {
          button: 0,
          clientX: 100,
          clientY: 100,
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
          target: document.createElement('div')
        } as unknown as React.PointerEvent,
        uninitGoal3,
        'planned'
      )
    })

    act(() => {
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, clientY: 150 }))
    })

    const targetElement = document.createElement('div')
    targetElement.setAttribute('data-task-card', 'true')
    targetElement.dataset.goalId = uninitGoal1.id
    targetElement.dataset.column = 'planned'
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(targetElement)
    vi.spyOn(targetElement, 'getBoundingClientRect').mockReturnValue({
      top: 100,
      bottom: 200,
      height: 100,
      left: 0,
      right: 100,
      width: 100,
      x: 0,
      y: 100,
      toJSON: () => {}
    })

    // Move pointer over top half of goal1 -> position: 'before'
    act(() => {
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 50, clientY: 120 }))
    })

    await act(async () => {
      window.dispatchEvent(new PointerEvent('pointerup', { clientX: 50, clientY: 120 }))
    })

    // Since items had undefined sortOrders, rebalancing assigns 1000, 2000, 3000
    // and sends them in a single batch
    expect(updateMultipleGoals).toHaveBeenCalledTimes(1)
    const updatedGoals = updateMultipleGoals.mock.calls[0][0]
    expect(updatedGoals.map((g: DailyGoal) => g.id)).toEqual(['g3', 'g1', 'g2'])
    expect(updatedGoals.map((g: DailyGoal) => g.sortOrder)).toEqual([1000, 2000, 3000])
  })

  it('clears completedAt when dragging a goal from done to planned', async () => {
    const updateMultipleGoals = vi.fn().mockResolvedValue(undefined)
    const setSortOption = vi.fn()
    const setSelectedGoalIds = vi.fn()

    const doneGoal: DailyGoal = {
      id: 'g-done',
      date: '2026-10-29',
      title: 'Done Task',
      status: 'done',
      createdAt: '2026-10-29T10:00:00.000Z',
      completedAt: '2026-10-29T11:00:00.000Z',
      sortOrder: 1000
    }

    const { result } = renderHook(() =>
      useGoalsDragDrop({
        dailyGoals: [doneGoal],
        processedGoalsByColumn: {
          planned: [],
          in_progress: [],
          done: [doneGoal]
        },
        groupByTag: false,
        selectedGoalIds: new Set(),
        setSelectedGoalIds,
        toggleSelectGoal: vi.fn(),
        updateMultipleGoals,
        moveWholeGroup: vi.fn(),
        setSortOption
      })
    )

    act(() => {
      result.current.onPointerDownCard(
        {
          button: 0,
          clientX: 100,
          clientY: 100,
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
          target: document.createElement('div')
        } as unknown as React.PointerEvent,
        doneGoal,
        'done'
      )
    })

    act(() => {
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, clientY: 150 }))
    })

    const columnElement = document.createElement('div')
    columnElement.dataset.column = 'planned'
    vi.spyOn(columnElement, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      bottom: 200,
      left: 0,
      right: 100,
      height: 200,
      width: 100,
      x: 0,
      y: 0,
      toJSON: () => {}
    })
    result.current.registerColumn('planned')(columnElement as HTMLDivElement)
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(columnElement)

    act(() => {
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 50, clientY: 120 }))
    })

    await act(async () => {
      window.dispatchEvent(new PointerEvent('pointerup', { clientX: 50, clientY: 120 }))
    })

    expect(updateMultipleGoals).toHaveBeenCalledTimes(1)
    const updatedGoals = updateMultipleGoals.mock.calls[0][0]
    expect(updatedGoals[0].id).toBe('g-done')
    expect(updatedGoals[0].status).toBe('planned')
    expect(updatedGoals[0].completedAt).toBeUndefined()
  })

  it('triggers edge auto-scrolling when dragging near top or bottom boundary', async () => {
    let rafCb: FrameRequestCallback | null = null
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCb = cb
      return 123
    })
    const { result } = renderHook(() =>
      useGoalsDragDrop({
        dailyGoals: initialGoals,
        processedGoalsByColumn: {
          planned: initialGoals,
          in_progress: [],
          done: []
        },
        groupByTag: false,
        selectedGoalIds: new Set(),
        setSelectedGoalIds: vi.fn(),
        toggleSelectGoal: vi.fn(),
        updateMultipleGoals: vi.fn(),
        moveWholeGroup: vi.fn(),
        setSortOption: vi.fn()
      })
    )

    const columnSection = document.createElement('section')
    vi.spyOn(columnSection, 'getBoundingClientRect').mockReturnValue({
      top: 100,
      bottom: 500,
      left: 0,
      right: 300,
      height: 400,
      width: 300,
      x: 0,
      y: 100,
      toJSON: () => {}
    })
    const scrollContainer = document.createElement('div')
    scrollContainer.className = 'flex-1 overflow-y-auto space-y-2.5 custom-scrollbar pr-0.5'
    columnSection.appendChild(scrollContainer)

    vi.spyOn(scrollContainer, 'getBoundingClientRect').mockReturnValue({
      top: 100,
      bottom: 500,
      left: 0,
      right: 300,
      height: 400,
      width: 300,
      x: 0,
      y: 100,
      toJSON: () => {}
    })
    Object.defineProperty(scrollContainer, 'clientHeight', { value: 400, configurable: true })
    Object.defineProperty(scrollContainer, 'scrollHeight', { value: 1000, configurable: true })
    let currentScrollTop = 0
    Object.defineProperty(scrollContainer, 'scrollTop', {
      get: () => currentScrollTop,
      set: (val) => {
        currentScrollTop = val
      },
      configurable: true
    })

    result.current.registerColumn('planned')(columnSection)

    // Start drag
    act(() => {
      result.current.onPointerDownCard(
        {
          button: 0,
          clientX: 150,
          clientY: 200,
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
          target: document.createElement('div')
        } as unknown as React.PointerEvent,
        goal1,
        'planned'
      )
    })

    // Move past drag threshold into bottom edge boundary (clientY = 480, near bottom = 500)
    act(() => {
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 150, clientY: 480 }))
    })

    // Advance RAF frames
    act(() => {
      rafCb?.(0)
    })

    // Verify container scrolled downwards
    expect(scrollContainer.scrollTop).toBeGreaterThan(0)

    // Move pointer back to middle (clientY = 300)
    const scrolledTop = scrollContainer.scrollTop
    act(() => {
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 150, clientY: 300 }))
    })
    act(() => {
      rafCb?.(0)
    })
    // In middle: does not continue auto-scrolling
    expect(scrollContainer.scrollTop).toBe(scrolledTop)

    // Release drag
    await act(async () => {
      window.dispatchEvent(new PointerEvent('pointerup', { clientX: 150, clientY: 300 }))
    })
  })

  it('clears group tags when multi-selected tasks are dropped onto an untagged group zone', async () => {
    const updateMultipleGoals = vi.fn().mockResolvedValue(undefined)
    const setSortOption = vi.fn()
    const setSelectedGoalIds = vi.fn()

    const taggedGoal1: DailyGoal = {
      id: 'tg1',
      date: '2026-10-29',
      title: 'Tagged Task 1',
      status: 'planned',
      groupTag: 'Backend',
      groupColor: 'blue',
      createdAt: '2026-10-29T10:00:00.000Z',
      sortOrder: 1000
    }
    const taggedGoal2: DailyGoal = {
      id: 'tg2',
      date: '2026-10-29',
      title: 'Tagged Task 2',
      status: 'planned',
      groupTag: 'Backend',
      groupColor: 'blue',
      createdAt: '2026-10-29T10:01:00.000Z',
      sortOrder: 2000
    }

    const { result } = renderHook(() =>
      useGoalsDragDrop({
        dailyGoals: [taggedGoal1, taggedGoal2],
        processedGoalsByColumn: {
          planned: [taggedGoal1, taggedGoal2],
          in_progress: [],
          done: []
        },
        groupByTag: true,
        selectedGoalIds: new Set(['tg1', 'tg2']),
        setSelectedGoalIds,
        toggleSelectGoal: vi.fn(),
        updateMultipleGoals,
        moveWholeGroup: vi.fn(),
        setSortOption
      })
    )

    // Start multi drag on taggedGoal1
    act(() => {
      result.current.onPointerDownCard(
        {
          button: 0,
          clientX: 100,
          clientY: 100,
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
          target: document.createElement('div')
        } as unknown as React.PointerEvent,
        taggedGoal1,
        'planned'
      )
    })

    // Move past drag threshold
    act(() => {
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, clientY: 150 }))
    })

    // Create untagged group drop target element
    const untaggedDropZone = document.createElement('div')
    untaggedDropZone.setAttribute('data-group-drop-zone', 'true')
    untaggedDropZone.dataset.column = 'in_progress'
    untaggedDropZone.dataset.groupTag = ''
    untaggedDropZone.dataset.groupIsUntagged = 'true'
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(untaggedDropZone)

    act(() => {
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 200, clientY: 200 }))
    })

    await act(async () => {
      window.dispatchEvent(new PointerEvent('pointerup', { clientX: 200, clientY: 200 }))
    })

    expect(updateMultipleGoals).toHaveBeenCalledTimes(1)
    const updatedGoals = updateMultipleGoals.mock.calls[0][0] as DailyGoal[]
    expect(updatedGoals).toHaveLength(2)
    expect(updatedGoals[0].status).toBe('in_progress')
    expect(updatedGoals[0].groupTag).toBeUndefined()
    expect(updatedGoals[0].groupColor).toBeUndefined()
    expect(updatedGoals[1].status).toBe('in_progress')
    expect(updatedGoals[1].groupTag).toBeUndefined()
    expect(updatedGoals[1].groupColor).toBeUndefined()
  })

  it('avoids sortOrder collision with hidden filtered cards when dragging under a group filter', async () => {
    const updateMultipleGoals = vi.fn().mockResolvedValue(undefined)
    const setSortOption = vi.fn()

    const gWork1: DailyGoal = {
      id: 'gw1',
      date: '2026-10-29',
      title: 'Work 1',
      status: 'planned',
      groupTag: 'Work',
      createdAt: '2026-10-29T10:00:00.000Z',
      sortOrder: 1000
    }
    const gPersonal: DailyGoal = {
      id: 'gp1',
      date: '2026-10-29',
      title: 'Personal Task',
      status: 'planned',
      groupTag: 'Personal',
      createdAt: '2026-10-29T10:01:00.000Z',
      sortOrder: 2000
    }
    const gWork2: DailyGoal = {
      id: 'gw2',
      date: '2026-10-29',
      title: 'Work 2',
      status: 'planned',
      groupTag: 'Work',
      createdAt: '2026-10-29T10:02:00.000Z',
      sortOrder: 3000
    }
    const gWork3: DailyGoal = {
      id: 'gw3',
      date: '2026-10-29',
      title: 'Work 3',
      status: 'planned',
      groupTag: 'Work',
      createdAt: '2026-10-29T10:03:00.000Z',
      sortOrder: 4000
    }

    const { result } = renderHook(() =>
      useGoalsDragDrop({
        dailyGoals: [gWork1, gPersonal, gWork2, gWork3],
        processedGoalsByColumn: {
          planned: [gWork1, gWork2, gWork3], // filtered subset
          in_progress: [],
          done: []
        },
        groupByTag: true,
        selectedGoalIds: new Set(),
        setSelectedGoalIds: vi.fn(),
        toggleSelectGoal: vi.fn(),
        updateMultipleGoals,
        moveWholeGroup: vi.fn(),
        setSortOption
      })
    )

    // Start dragging gw3
    act(() => {
      result.current.onPointerDownCard(
        {
          clientX: 100,
          clientY: 100,
          button: 0,
          target: document.createElement('div'),
          currentTarget: document.createElement('div'),
          preventDefault: vi.fn(),
          stopPropagation: vi.fn()
        } as unknown as React.PointerEvent,
        gWork3,
        'planned'
      )
    })

    // Move past drag threshold
    act(() => {
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, clientY: 150 }))
    })

    // Target gw2 with position 'before'
    const cardDropEl = document.createElement('div')
    cardDropEl.setAttribute('data-task-card', 'true')
    cardDropEl.dataset.goalId = 'gw2'
    cardDropEl.dataset.column = 'planned'
    vi.spyOn(cardDropEl, 'getBoundingClientRect').mockReturnValue({
      top: 100,
      bottom: 200,
      left: 50,
      right: 250,
      width: 200,
      height: 100,
      x: 50,
      y: 100,
      toJSON: () => {}
    })
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(cardDropEl)

    // Hover top half -> position 'before'
    act(() => {
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, clientY: 120 }))
    })

    await act(async () => {
      window.dispatchEvent(new PointerEvent('pointerup', { clientX: 100, clientY: 120 }))
    })

    expect(updateMultipleGoals).toHaveBeenCalledTimes(1)
    const updated = updateMultipleGoals.mock.calls[0][0] as DailyGoal[]
    expect(updated).toHaveLength(1)
    expect(updated[0].id).toBe('gw3')
    // Midpoint between gPersonal (2000) and gWork2 (3000) is 2500, NOT 2000!
    expect(updated[0].sortOrder).toBe(2500)
  })

  it('clears selection and announces group move when dragging a group onto another group', async () => {
    const updateMultipleGoals = vi.fn().mockResolvedValue(undefined)
    const setSortOption = vi.fn()
    const setSelectedGoalIds = vi.fn()

    const gWork1: DailyGoal = {
      id: 'gw1',
      date: '2026-10-29',
      title: 'Work Task 1',
      status: 'planned',
      groupTag: 'Work',
      createdAt: '2026-10-29T10:00:00.000Z',
      sortOrder: 1000
    }
    const gWork2: DailyGoal = {
      id: 'gw2',
      date: '2026-10-29',
      title: 'Work Task 2',
      status: 'planned',
      groupTag: 'Work',
      createdAt: '2026-10-29T10:01:00.000Z',
      sortOrder: 2000
    }
    const gPers1: DailyGoal = {
      id: 'gp1',
      date: '2026-10-29',
      title: 'Personal Task 1',
      status: 'in_progress',
      groupTag: 'Personal',
      createdAt: '2026-10-29T10:02:00.000Z',
      sortOrder: 1000
    }

    const { result } = renderHook(() =>
      useGoalsDragDrop({
        dailyGoals: [gWork1, gWork2, gPers1],
        processedGoalsByColumn: {
          planned: [gWork1, gWork2],
          in_progress: [gPers1],
          done: []
        },
        groupByTag: true,
        selectedGoalIds: new Set(['gw1']),
        setSelectedGoalIds,
        toggleSelectGoal: vi.fn(),
        updateMultipleGoals,
        moveWholeGroup: vi.fn(),
        setSortOption
      })
    )

    // Start dragging Work group
    act(() => {
      result.current.onPointerDownGroup(
        {
          clientX: 100,
          clientY: 100,
          button: 0,
          target: document.createElement('div'),
          currentTarget: document.createElement('div'),
          preventDefault: vi.fn(),
          stopPropagation: vi.fn()
        } as unknown as React.PointerEvent,
        'Work',
        [gWork1, gWork2],
        'planned'
      )
    })

    // Move past drag threshold
    act(() => {
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, clientY: 150 }))
    })

    // Mock target group container element for Personal in in_progress
    const groupDropEl = document.createElement('div')
    groupDropEl.setAttribute('data-group-container', 'true')
    groupDropEl.dataset.column = 'in_progress'
    groupDropEl.dataset.groupTag = 'Personal'
    groupDropEl.dataset.groupIsUntagged = 'false'
    vi.spyOn(groupDropEl, 'getBoundingClientRect').mockReturnValue({
      top: 100,
      bottom: 200,
      left: 50,
      right: 250,
      width: 200,
      height: 100,
      x: 50,
      y: 100,
      toJSON: () => {}
    })
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(groupDropEl)

    // Hover on group element (clientY: 120 -> top half, position: 'before')
    act(() => {
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, clientY: 120 }))
    })

    // Drop
    await act(async () => {
      window.dispatchEvent(new PointerEvent('pointerup', { clientX: 100, clientY: 120 }))
    })

    expect(updateMultipleGoals).toHaveBeenCalledTimes(1)
    expect(setSelectedGoalIds).toHaveBeenCalledWith(new Set())
    expect(result.current.announcement).toBe('Moved "Work" group to In Progress')
  })

  it('locks drag interactions and prevents concurrent drags while rebalance or drop is in flight', async () => {
    let resolveUpdate: () => void = () => {}
    const updatePromise = new Promise<void>((resolve) => {
      resolveUpdate = resolve
    })
    const updateMultipleGoals = vi.fn().mockReturnValue(updatePromise)
    const setSelectedGoalIds = vi.fn()

    const { result } = renderHook(() =>
      useGoalsDragDrop({
        dailyGoals: initialGoals,
        processedGoalsByColumn: {
          planned: [goal1, goal2, goal3],
          in_progress: [],
          done: []
        },
        groupByTag: false,
        selectedGoalIds: new Set(),
        setSelectedGoalIds,
        toggleSelectGoal: vi.fn(),
        updateMultipleGoals,
        moveWholeGroup: vi.fn(),
        setSortOption: vi.fn()
      })
    )

    // Start drag on goal3
    act(() => {
      result.current.onPointerDownCard(
        {
          button: 0,
          clientX: 100,
          clientY: 100,
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
          target: document.createElement('div')
        } as unknown as React.PointerEvent,
        goal3,
        'planned'
      )
    })

    // Move past threshold
    act(() => {
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, clientY: 150 }))
    })

    const targetElement = document.createElement('div')
    targetElement.setAttribute('data-task-card', 'true')
    targetElement.dataset.goalId = goal1.id
    targetElement.dataset.column = 'planned'
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(targetElement)
    vi.spyOn(targetElement, 'getBoundingClientRect').mockReturnValue({
      top: 100,
      bottom: 200,
      height: 100,
      left: 0,
      right: 100,
      width: 100,
      x: 0,
      y: 100,
      toJSON: () => {}
    })

    act(() => {
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 50, clientY: 175 }))
    })

    // Trigger drop - this starts the async updateMultipleGoals call
    act(() => {
      window.dispatchEvent(new PointerEvent('pointerup', { clientX: 50, clientY: 175 }))
    })

    // While updateMultipleGoals is STILL in flight:
    // Attempting to start a second drag on goal2 should be rejected/locked!
    act(() => {
      result.current.onPointerDownCard(
        {
          button: 0,
          clientX: 100,
          clientY: 100,
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
          target: document.createElement('div')
        } as unknown as React.PointerEvent,
        goal2,
        'planned'
      )
    })

    // Drag must remain null because interactions are locked during in-flight drop processing
    expect(result.current.drag).toBeNull()

    // Now resolve the in-flight rebalance/update promise
    await act(async () => {
      resolveUpdate()
    })

    // After resolution, new drags can proceed normally
    act(() => {
      result.current.onPointerDownCard(
        {
          button: 0,
          clientX: 100,
          clientY: 100,
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
          target: document.createElement('div')
        } as unknown as React.PointerEvent,
        goal2,
        'planned'
      )
    })
    expect(result.current.drag).not.toBeNull()
    expect(result.current.drag?.payload.id).toBe(goal2.id)
  })
})
