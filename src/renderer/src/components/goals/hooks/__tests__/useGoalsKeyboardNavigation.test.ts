import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useGoalsKeyboardNavigation } from '../useGoalsKeyboardNavigation'
import { DailyGoal } from '../../../../../../shared/types'

// Mock useToast
vi.mock('../../../../lib/useToast', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    show: vi.fn()
  })
}))

describe('useGoalsKeyboardNavigation Hook', () => {
  const mockGoals: DailyGoal[] = [
    {
      id: 'g1',
      date: '2026-03-01',
      title: 'Task 1',
      status: 'planned',
      createdAt: '2026-03-01T10:00:00Z'
    },
    {
      id: 'g2',
      date: '2026-03-01',
      title: 'Task 2',
      status: 'planned',
      createdAt: '2026-03-01T11:00:00Z'
    },
    {
      id: 'g3',
      date: '2026-03-01',
      title: 'Task 3',
      status: 'in_progress',
      createdAt: '2026-03-01T12:00:00Z'
    }
  ]

  let onCloseOverlays: () => boolean
  let toggleFocusMode: () => void
  let toggleCollapse: (colId: any) => void
  let toggleSelectGoal: (goalId: string, isShift: boolean, isSpace: boolean) => void
  let startEdit: (goal: DailyGoal) => void
  let deleteGoal: (goal: DailyGoal) => void
  let moveGoal: (goal: DailyGoal, newStatus: any) => void
  let handleBulkMoveStatus: (status: any) => void
  let setBulkDeleteModalOpen: (open: boolean) => void

  beforeEach(() => {
    onCloseOverlays = vi.fn(() => false)
    toggleFocusMode = vi.fn()
    toggleCollapse = vi.fn()
    toggleSelectGoal = vi.fn()
    startEdit = vi.fn()
    deleteGoal = vi.fn()
    moveGoal = vi.fn()
    handleBulkMoveStatus = vi.fn()
    setBulkDeleteModalOpen = vi.fn()
  })

  it('navigates through cards with down/up arrows or j/k', () => {
    let selectedGoalIds = new Set<string>()
    const setSelectedGoalIds = vi.fn((val) => {
      selectedGoalIds = typeof val === 'function' ? val(selectedGoalIds) : val
    })
    let editingId: string | null = null
    const setEditingId = vi.fn((val) => {
      editingId = typeof val === 'function' ? val(editingId) : val
    })
    let showAddCol: 'planned' | 'in_progress' | null = null
    const setShowAddCol = vi.fn((val) => {
      showAddCol = typeof val === 'function' ? val(showAddCol) : val
    })

    const { result } = renderHook(() =>
      useGoalsKeyboardNavigation({
        isActive: true,
        isDragging: false,
        hasOpenModal: false,
        onCloseOverlays,
        visibleGoals: mockGoals,
        dailyGoals: mockGoals,
        selectedGoalIds,
        setSelectedGoalIds,
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
        handleBulkMoveStatus,
        setBulkDeleteModalOpen
      })
    )

    // Press 'j' to move to next card
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' }))
    })
    expect(result.current.activeGoalId).toBe('g1')

    // Press 'ArrowDown' to move to next card
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    })
    expect(result.current.activeGoalId).toBe('g2')

    // Press 'k' to move back
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k' }))
    })
    expect(result.current.activeGoalId).toBe('g1')

    // Press 'ArrowUp' to stay at g1
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }))
    })
    expect(result.current.activeGoalId).toBe('g1')
  })

  it('switches columns with h/l or left/right arrows', () => {
    const selectedGoalIds = new Set<string>()
    const setSelectedGoalIds = vi.fn()
    const setEditingId = vi.fn()
    const setShowAddCol = vi.fn()

    const { result } = renderHook(() =>
      useGoalsKeyboardNavigation({
        isActive: true,
        isDragging: false,
        hasOpenModal: false,
        onCloseOverlays,
        visibleGoals: mockGoals,
        dailyGoals: mockGoals,
        selectedGoalIds,
        setSelectedGoalIds,
        editingId: null,
        setEditingId,
        showAddCol: null,
        setShowAddCol,
        toggleFocusMode,
        toggleCollapse,
        toggleSelectGoal,
        startEdit,
        deleteGoal,
        moveGoal,
        handleBulkMoveStatus,
        setBulkDeleteModalOpen
      })
    )

    // Set active goal to g1 in 'planned' column
    act(() => {
      result.current.setActiveGoalId('g1')
    })

    // Press 'l' to switch to next column ('in_progress')
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l' }))
    })
    expect(result.current.activeGoalId).toBe('g3')

    // Press 'h' to switch back to previous column ('planned')
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h' }))
    })
    expect(result.current.activeGoalId).toBe('g1')

    // Press 'ArrowRight' to switch column right
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    })
    expect(result.current.activeGoalId).toBe('g3')

    // Press 'ArrowLeft' to switch column left
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))
    })
    expect(result.current.activeGoalId).toBe('g1')
  })

  it('triggers startEdit when e, i, or Enter is pressed', () => {
    const selectedGoalIds = new Set<string>()
    const setSelectedGoalIds = vi.fn()
    const setEditingId = vi.fn()
    const setShowAddCol = vi.fn()

    const { result } = renderHook(() =>
      useGoalsKeyboardNavigation({
        isActive: true,
        isDragging: false,
        hasOpenModal: false,
        onCloseOverlays,
        visibleGoals: mockGoals,
        dailyGoals: mockGoals,
        selectedGoalIds,
        setSelectedGoalIds,
        editingId: null,
        setEditingId,
        showAddCol: null,
        setShowAddCol,
        toggleFocusMode,
        toggleCollapse,
        toggleSelectGoal,
        startEdit,
        deleteGoal,
        moveGoal,
        handleBulkMoveStatus,
        setBulkDeleteModalOpen
      })
    )

    // Set active goal to g1
    act(() => {
      result.current.setActiveGoalId('g1')
    })

    // Press 'e'
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' }))
    })
    expect(startEdit).toHaveBeenCalledWith(mockGoals[0])

    vi.clearAllMocks()

    // Press 'i' (Vim insert / edit mode)
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'i' }))
    })
    expect(startEdit).toHaveBeenCalledWith(mockGoals[0])

    vi.clearAllMocks()

    // Press 'Enter'
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    })
    expect(startEdit).toHaveBeenCalledWith(mockGoals[0])
  })

  it('triggers quick move on active card when a/s/d or 1/2/3 is pressed', () => {
    const selectedGoalIds = new Set<string>()
    const setSelectedGoalIds = vi.fn()
    const setEditingId = vi.fn()
    const setShowAddCol = vi.fn()

    const { result } = renderHook(() =>
      useGoalsKeyboardNavigation({
        isActive: true,
        isDragging: false,
        hasOpenModal: false,
        onCloseOverlays,
        visibleGoals: mockGoals,
        dailyGoals: mockGoals,
        selectedGoalIds,
        setSelectedGoalIds,
        editingId: null,
        setEditingId,
        showAddCol: null,
        setShowAddCol,
        toggleFocusMode,
        toggleCollapse,
        toggleSelectGoal,
        startEdit,
        deleteGoal,
        moveGoal,
        handleBulkMoveStatus,
        setBulkDeleteModalOpen
      })
    )

    // Select g1 as active
    act(() => {
      result.current.setActiveGoalId('g1')
    })

    // Press 's' to move to in_progress
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 's' }))
    })

    expect(moveGoal).toHaveBeenCalledWith(mockGoals[0], 'in_progress')
  })

  it('invokes onAnnounce for screen reader live region when card status is changed via keyboard', () => {
    const selectedGoalIds = new Set<string>()
    const setSelectedGoalIds = vi.fn()
    const setEditingId = vi.fn()
    const setShowAddCol = vi.fn()
    const onAnnounce = vi.fn()

    const { result } = renderHook(() =>
      useGoalsKeyboardNavigation({
        isActive: true,
        isDragging: false,
        hasOpenModal: false,
        onCloseOverlays,
        visibleGoals: mockGoals,
        dailyGoals: mockGoals,
        selectedGoalIds,
        setSelectedGoalIds,
        editingId: null,
        setEditingId,
        showAddCol: null,
        setShowAddCol,
        toggleFocusMode,
        toggleCollapse,
        toggleSelectGoal,
        startEdit,
        deleteGoal,
        moveGoal,
        handleBulkMoveStatus,
        setBulkDeleteModalOpen,
        onAnnounce
      })
    )

    act(() => {
      result.current.setActiveGoalId('g1')
    })

    // Press 'd' to move to done
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }))
    })

    expect(moveGoal).toHaveBeenCalledWith(mockGoals[0], 'done')
    expect(onAnnounce).toHaveBeenCalledWith('Moved "Task 1" to Completed')
  })

  it('dismisses overlays or active card when Escape is pressed', () => {
    const selectedGoalIds = new Set<string>(['g1'])
    const setSelectedGoalIds = vi.fn()
    const setEditingId = vi.fn()
    const setShowAddCol = vi.fn()

    renderHook(() =>
      useGoalsKeyboardNavigation({
        isActive: true,
        isDragging: false,
        hasOpenModal: false,
        onCloseOverlays,
        visibleGoals: mockGoals,
        dailyGoals: mockGoals,
        selectedGoalIds,
        setSelectedGoalIds,
        editingId: null,
        setEditingId,
        showAddCol: null,
        setShowAddCol,
        toggleFocusMode,
        toggleCollapse,
        toggleSelectGoal,
        startEdit,
        deleteGoal,
        moveGoal,
        handleBulkMoveStatus,
        setBulkDeleteModalOpen
      })
    )

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })

    expect(onCloseOverlays).toHaveBeenCalled()
    expect(setSelectedGoalIds).toHaveBeenCalledWith(new Set())
  })

  it('ignores shortcuts when user is typing in an input element', () => {
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    const selectedGoalIds = new Set<string>()
    const setSelectedGoalIds = vi.fn()
    const setEditingId = vi.fn()
    const setShowAddCol = vi.fn()

    const { result } = renderHook(() =>
      useGoalsKeyboardNavigation({
        isActive: true,
        isDragging: false,
        hasOpenModal: false,
        onCloseOverlays,
        visibleGoals: mockGoals,
        dailyGoals: mockGoals,
        selectedGoalIds,
        setSelectedGoalIds,
        editingId: null,
        setEditingId,
        showAddCol: null,
        setShowAddCol,
        toggleFocusMode,
        toggleCollapse,
        toggleSelectGoal,
        startEdit,
        deleteGoal,
        moveGoal,
        handleBulkMoveStatus,
        setBulkDeleteModalOpen
      })
    )

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' }))
    })

    // Should NOT have moved cursor because input was focused
    expect(result.current.activeGoalId).toBeNull()

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k' }))
    })

    // Should still NOT have moved cursor
    expect(result.current.activeGoalId).toBeNull()

    document.body.removeChild(input)
  })

  it('ignores board shortcuts when an interactive button is focused', () => {
    const button = document.createElement('button')
    document.body.appendChild(button)
    button.focus()

    const selectedGoalIds = new Set<string>()
    const setSelectedGoalIds = vi.fn()
    const setEditingId = vi.fn()
    const setShowAddCol = vi.fn()

    const { result } = renderHook(() =>
      useGoalsKeyboardNavigation({
        isActive: true,
        isDragging: false,
        hasOpenModal: false,
        onCloseOverlays,
        visibleGoals: mockGoals,
        dailyGoals: mockGoals,
        selectedGoalIds,
        setSelectedGoalIds,
        editingId: null,
        setEditingId,
        showAddCol: null,
        setShowAddCol,
        toggleFocusMode,
        toggleCollapse,
        toggleSelectGoal,
        startEdit,
        deleteGoal,
        moveGoal,
        handleBulkMoveStatus,
        setBulkDeleteModalOpen
      })
    )

    // Press Space on button - should not select goal
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }))
    })
    expect(toggleSelectGoal).not.toHaveBeenCalled()

    // Press 's' (move to in progress) on button - should not move goal
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 's' }))
    })
    expect(moveGoal).not.toHaveBeenCalled()

    // Press ArrowDown on button - should not move active goal
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    })
    expect(result.current.activeGoalId).toBeNull()

    document.body.removeChild(button)
  })

  it('allows board shortcuts when focusing card buttons or card container', () => {
    // Create card container with action buttons
    const card = document.createElement('div')
    card.setAttribute('data-task-card', 'true')
    card.setAttribute('data-goal-id', 'g1')

    const cardButton = document.createElement('button')
    cardButton.textContent = 'Start Focus'
    card.appendChild(cardButton)
    document.body.appendChild(card)

    cardButton.focus()

    const selectedGoalIds = new Set<string>()
    const setSelectedGoalIds = vi.fn()
    const setEditingId = vi.fn()
    const setShowAddCol = vi.fn()

    const { result } = renderHook(() =>
      useGoalsKeyboardNavigation({
        isActive: true,
        isDragging: false,
        hasOpenModal: false,
        onCloseOverlays,
        visibleGoals: mockGoals,
        dailyGoals: mockGoals,
        selectedGoalIds,
        setSelectedGoalIds,
        editingId: null,
        setEditingId,
        showAddCol: null,
        setShowAddCol,
        toggleFocusMode,
        toggleCollapse,
        toggleSelectGoal,
        startEdit,
        deleteGoal,
        moveGoal,
        handleBulkMoveStatus,
        setBulkDeleteModalOpen
      })
    )

    // Press 'j' while card button has focus -> navigates to next card g2 without dropping focus to document.body
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' }))
    })
    expect(result.current.activeGoalId).toBe('g2')
    expect(document.activeElement).not.toBe(document.body)
    expect(document.activeElement).toBe(card)

    // Press 'k' while card button has focus -> navigates back to g1
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k' }))
    })
    expect(result.current.activeGoalId).toBe('g1')

    // Refocus card button on g1
    cardButton.focus()

    // Press 's' (quick move) while card button has focus -> moves goal to in_progress
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 's' }))
    })
    expect(moveGoal).toHaveBeenCalledWith(mockGoals[0], 'in_progress')

    // Press 'Space' while card button has focus -> preserves native button activation, does NOT select goal
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }))
    })
    expect(toggleSelectGoal).not.toHaveBeenCalled()

    // Press 'Enter' while card button has focus -> preserves native button activation, does NOT start edit
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    })
    expect(startEdit).not.toHaveBeenCalled()

    // Press 'e' while card button has focus -> starts editing goal
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' }))
    })
    expect(startEdit).toHaveBeenCalledWith(mockGoals[0])

    // Focus the card container itself
    card.focus()

    // Press 'Space' while card container has focus -> selects goal
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }))
    })
    expect(toggleSelectGoal).toHaveBeenCalledWith('g1', false, true)

    document.body.removeChild(card)
  })

  it('reorders tasks within a column using Alt+Up and Alt+Down shortcuts', async () => {
    const onReorderGoal = vi.fn()
    const orderedGoals: DailyGoal[] = [
      {
        id: 'g1',
        date: '2026-03-01',
        title: 'Task 1',
        status: 'planned',
        sortOrder: 1000,
        createdAt: '2026-03-01T10:00:00Z'
      },
      {
        id: 'g2',
        date: '2026-03-01',
        title: 'Task 2',
        status: 'planned',
        sortOrder: 2000,
        createdAt: '2026-03-01T10:01:00Z'
      },
      {
        id: 'g3',
        date: '2026-03-01',
        title: 'Task 3',
        status: 'planned',
        sortOrder: 3000,
        createdAt: '2026-03-01T10:02:00Z'
      }
    ]

    const { result } = renderHook(() =>
      useGoalsKeyboardNavigation({
        isActive: true,
        isDragging: false,
        hasOpenModal: false,
        onCloseOverlays,
        visibleGoals: orderedGoals,
        dailyGoals: orderedGoals,
        selectedGoalIds: new Set(),
        setSelectedGoalIds: vi.fn(),
        editingId: null,
        setEditingId: vi.fn(),
        showAddCol: null,
        setShowAddCol: vi.fn(),
        toggleFocusMode,
        toggleCollapse,
        toggleSelectGoal,
        startEdit,
        deleteGoal,
        moveGoal,
        onReorderGoal,
        handleBulkMoveStatus,
        setBulkDeleteModalOpen
      })
    )

    // Select second task g2
    act(() => {
      result.current.setActiveGoalId('g2')
    })

    // Press Alt+ArrowUp to move g2 above g1
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true }))
    })

    expect(onReorderGoal).toHaveBeenCalled()
    const movedCall = onReorderGoal.mock.calls[0][0]
    expect(movedCall[0].id).toBe('g2')
    expect(movedCall[0].sortOrder).toBeLessThan(1000)

    onReorderGoal.mockClear()

    // Press Alt+ArrowDown to move g2 down
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true }))
    })

    expect(onReorderGoal).toHaveBeenCalled()
  })

  it('correctly calculates reorder sort order when visible goals are filtered by tag without colliding with hidden tasks', () => {
    const onReorderGoal = vi.fn()
    const allGoals: DailyGoal[] = [
      {
        id: 'hidden-1',
        date: '2026-03-01',
        title: 'Hidden Personal 1',
        groupTag: 'Personal',
        status: 'planned',
        sortOrder: 1000,
        createdAt: '2026-03-01T10:00:00Z'
      },
      {
        id: 'work-1',
        date: '2026-03-01',
        title: 'Work 1',
        groupTag: 'Work',
        status: 'planned',
        sortOrder: 2000,
        createdAt: '2026-03-01T10:01:00Z'
      },
      {
        id: 'hidden-2',
        date: '2026-03-01',
        title: 'Hidden Personal 2',
        groupTag: 'Personal',
        status: 'planned',
        sortOrder: 3000,
        createdAt: '2026-03-01T10:02:00Z'
      },
      {
        id: 'work-2',
        date: '2026-03-01',
        title: 'Work 2',
        groupTag: 'Work',
        status: 'planned',
        sortOrder: 4000,
        createdAt: '2026-03-01T10:03:00Z'
      }
    ]

    // Visible goals only contain 'Work' tasks
    const visibleGoals = allGoals.filter((g) => g.groupTag === 'Work')

    const { result } = renderHook(() =>
      useGoalsKeyboardNavigation({
        isActive: true,
        isDragging: false,
        hasOpenModal: false,
        onCloseOverlays,
        visibleGoals,
        dailyGoals: allGoals,
        selectedGoalIds: new Set(),
        setSelectedGoalIds: vi.fn(),
        editingId: null,
        setEditingId: vi.fn(),
        showAddCol: null,
        setShowAddCol: vi.fn(),
        toggleFocusMode,
        toggleCollapse,
        toggleSelectGoal,
        startEdit,
        deleteGoal,
        moveGoal,
        onReorderGoal,
        handleBulkMoveStatus,
        setBulkDeleteModalOpen
      })
    )

    // Select work-2
    act(() => {
      result.current.setActiveGoalId('work-2')
    })

    // Press Alt+ArrowUp to move work-2 above work-1 in the visible list
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true }))
    })

    expect(onReorderGoal).toHaveBeenCalled()
    const movedCall = onReorderGoal.mock.calls[0][0]
    expect(movedCall[0].id).toBe('work-2')
    // In full column [hidden-1 (1000), work-1 (2000), hidden-2 (3000)],
    // work-2 is placed before work-1 (targetIdx = 1), so sortOrder should be between 1000 and 2000
    expect(movedCall[0].sortOrder).toBeGreaterThan(1000)
    expect(movedCall[0].sortOrder).toBeLessThan(2000)
  })

  it('does not intercept Escape key or call onCloseOverlays when isActive is false', () => {
    const mockOnCloseOverlays = vi.fn(() => false)
    const mockSetSelected = vi.fn()

    renderHook(() =>
      useGoalsKeyboardNavigation({
        isActive: false,
        isDragging: false,
        hasOpenModal: false,
        onCloseOverlays: mockOnCloseOverlays,
        visibleGoals: mockGoals,
        dailyGoals: mockGoals,
        selectedGoalIds: new Set(['g1']),
        setSelectedGoalIds: mockSetSelected,
        editingId: null,
        setEditingId: vi.fn(),
        showAddCol: null,
        setShowAddCol: vi.fn(),
        toggleFocusMode,
        toggleCollapse,
        toggleSelectGoal,
        startEdit,
        deleteGoal,
        moveGoal,
        handleBulkMoveStatus,
        setBulkDeleteModalOpen
      })
    )

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })

    expect(mockOnCloseOverlays).not.toHaveBeenCalled()
    expect(mockSetSelected).not.toHaveBeenCalled()
  })

  it('cycles card status through planned -> in_progress -> done -> planned when m is pressed', () => {
    const selectedGoalIds = new Set<string>()
    const setSelectedGoalIds = vi.fn()
    const { result } = renderHook(() =>
      useGoalsKeyboardNavigation({
        isActive: true,
        isDragging: false,
        hasOpenModal: false,
        onCloseOverlays,
        visibleGoals: mockGoals,
        dailyGoals: mockGoals,
        selectedGoalIds,
        setSelectedGoalIds,
        editingId: null,
        setEditingId: vi.fn(),
        showAddCol: null,
        setShowAddCol: vi.fn(),
        toggleFocusMode,
        toggleCollapse,
        toggleSelectGoal,
        startEdit,
        deleteGoal,
        moveGoal,
        handleBulkMoveStatus,
        setBulkDeleteModalOpen
      })
    )

    // Focus g1 (status: 'planned')
    act(() => {
      result.current.setActiveGoalId('g1')
    })

    // Press 'm' -> should cycle to 'in_progress'
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm' }))
    })
    expect(moveGoal).toHaveBeenCalledWith(mockGoals[0], 'in_progress')

    vi.clearAllMocks()

    // Focus g3 (status: 'in_progress')
    act(() => {
      result.current.setActiveGoalId('g3')
    })

    // Press 'm' -> should cycle to 'done'
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm' }))
    })
    expect(moveGoal).toHaveBeenCalledWith(mockGoals[2], 'done')
  })

  it('triggers quick estimate popover when e is pressed and setQuickEstimatePopover is provided', () => {
    const setQuickEstimatePopover = vi.fn()
    const { result } = renderHook(() =>
      useGoalsKeyboardNavigation({
        isActive: true,
        isDragging: false,
        hasOpenModal: false,
        onCloseOverlays,
        visibleGoals: mockGoals,
        dailyGoals: mockGoals,
        selectedGoalIds: new Set<string>(),
        setSelectedGoalIds: vi.fn(),
        editingId: null,
        setEditingId: vi.fn(),
        showAddCol: null,
        setShowAddCol: vi.fn(),
        toggleFocusMode,
        toggleCollapse,
        toggleSelectGoal,
        startEdit,
        deleteGoal,
        moveGoal,
        handleBulkMoveStatus,
        setBulkDeleteModalOpen,
        setQuickEstimatePopover
      })
    )

    act(() => {
      result.current.setActiveGoalId('g1')
    })

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' }))
    })

    expect(setQuickEstimatePopover).toHaveBeenCalledWith(
      expect.objectContaining({
        goal: mockGoals[0]
      })
    )
    expect(startEdit).not.toHaveBeenCalled()
  })

  it('marks card complete when d is pressed', () => {
    const { result } = renderHook(() =>
      useGoalsKeyboardNavigation({
        isActive: true,
        isDragging: false,
        hasOpenModal: false,
        onCloseOverlays,
        visibleGoals: mockGoals,
        dailyGoals: mockGoals,
        selectedGoalIds: new Set<string>(),
        setSelectedGoalIds: vi.fn(),
        editingId: null,
        setEditingId: vi.fn(),
        showAddCol: null,
        setShowAddCol: vi.fn(),
        toggleFocusMode,
        toggleCollapse,
        toggleSelectGoal,
        startEdit,
        deleteGoal,
        moveGoal,
        handleBulkMoveStatus,
        setBulkDeleteModalOpen
      })
    )

    act(() => {
      result.current.setActiveGoalId('g1')
    })

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }))
    })

    expect(moveGoal).toHaveBeenCalledWith(mockGoals[0], 'done')
  })
})
