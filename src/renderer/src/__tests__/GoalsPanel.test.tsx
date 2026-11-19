import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { GoalsPanel } from '../components/GoalsPanel'
import { FocusSessionProvider } from '../context/FocusSessionProvider'
import { DailyGoal } from '../../../shared/types'

vi.mock('../lib/audioEngine', () => ({
  playFocusChime: vi.fn(),
  useAudioEngine: () => ({
    playing: false,
    noiseType: 'off',
    volume: 0.5,
    setVolume: vi.fn(),
    toggle: vi.fn()
  })
}))

vi.mock('../lib/useToast', () => ({
  useToast: () => ({
    success: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  })
}))

describe('GoalsPanel Component - Group Deletion', () => {
  const mockGoals: DailyGoal[] = [
    {
      id: 'g-1',
      title: 'Design user profile screen',
      targetMinutes: 30,
      groupTag: 'Design',
      groupColor: 'blue',
      date: '2026-10-28',
      status: 'planned',
      createdAt: new Date().toISOString()
    },
    {
      id: 'g-2',
      title: 'Design settings modal',
      targetMinutes: 45,
      groupTag: 'Design',
      groupColor: 'blue',
      date: '2026-10-28',
      status: 'in_progress',
      createdAt: new Date().toISOString()
    },
    {
      id: 'g-3',
      title: 'Write API documentation',
      targetMinutes: 60,
      groupTag: 'Backend',
      groupColor: 'emerald',
      date: '2026-10-28',
      status: 'planned',
      createdAt: new Date().toISOString()
    }
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    window.api = {
      goals: {
        renameGroup: vi.fn().mockResolvedValue(undefined)
      }
    } as any
  })

  it('uses onDeleteDailyGoals for bulk deletion when deleting a group with tasks', async () => {
    const onDeleteDailyGoals = vi.fn().mockResolvedValue(undefined)
    const onDeleteDailyGoal = vi.fn().mockResolvedValue(undefined)
    const onUpdateDailyGoal = vi.fn().mockResolvedValue(undefined)

    render(
      <FocusSessionProvider>
        <GoalsPanel
          dailyGoals={mockGoals}
          onAddDailyGoal={vi.fn().mockResolvedValue(undefined)}
          onUpdateDailyGoal={onUpdateDailyGoal}
          onDeleteDailyGoal={onDeleteDailyGoal}
          onDeleteDailyGoals={onDeleteDailyGoals}
        />
      </FocusSessionProvider>
    )

    // Find the group options button for Design group
    const groupOptionButtons = screen.getAllByTitle('Group options')
    expect(groupOptionButtons.length).toBeGreaterThan(0)

    // Click group options on first group header
    fireEvent.click(groupOptionButtons[0])

    // In the opened group menu, click "Delete Group"
    const deleteGroupBtn = screen.getByText('Delete Group')
    fireEvent.click(deleteGroupBtn)

    // Confirm deletion modal should now appear with button "Delete Group & All 1 Tasks" (in that column)
    const confirmDeleteBtn = screen.getByRole('button', {
      name: /Delete Group & All/i
    })
    expect(confirmDeleteBtn).toBeDefined()
    fireEvent.click(confirmDeleteBtn)

    await waitFor(() => {
      // onDeleteDailyGoals should be called once with all matching Design goals (g-1 and g-2)
      expect(onDeleteDailyGoals).toHaveBeenCalledTimes(1)
      const deletedGoals = onDeleteDailyGoals.mock.calls[0][0]
      expect(deletedGoals).toHaveLength(2)
      expect(deletedGoals.map((g: DailyGoal) => g.id).sort()).toEqual(['g-1', 'g-2'])

      // onDeleteDailyGoal (single delete) should NOT be called sequentially
      expect(onDeleteDailyGoal).not.toHaveBeenCalled()
    })
  })

  it('falls back to onDeleteDailyGoal sequentially if onDeleteDailyGoals is not provided', async () => {
    const onDeleteDailyGoal = vi.fn().mockResolvedValue(undefined)
    const onUpdateDailyGoal = vi.fn().mockResolvedValue(undefined)

    render(
      <FocusSessionProvider>
        <GoalsPanel
          dailyGoals={mockGoals}
          onAddDailyGoal={vi.fn().mockResolvedValue(undefined)}
          onUpdateDailyGoal={onUpdateDailyGoal}
          onDeleteDailyGoal={onDeleteDailyGoal}
        />
      </FocusSessionProvider>
    )

    const groupOptionButtons = screen.getAllByTitle('Group options')
    fireEvent.click(groupOptionButtons[0])

    const deleteGroupBtn = screen.getByText('Delete Group')
    fireEvent.click(deleteGroupBtn)

    const confirmDeleteBtn = screen.getByRole('button', {
      name: /Delete Group & All/i
    })
    fireEvent.click(confirmDeleteBtn)

    await waitFor(() => {
      expect(onDeleteDailyGoal).toHaveBeenCalledTimes(2)
      const deletedIds = onDeleteDailyGoal.mock.calls
        .map((call) => (call[0] as DailyGoal).id)
        .sort()
      expect(deletedIds).toEqual(['g-1', 'g-2'])
    })
  })

  it('uses onDeleteDailyGoals for deleting untagged tasks', async () => {
    const untaggedGoals: DailyGoal[] = [
      {
        id: 'u-1',
        title: 'Untagged task 1',
        targetMinutes: 20,
        groupTag: undefined,
        date: '2026-10-28',
        status: 'planned',
        createdAt: new Date().toISOString()
      },
      {
        id: 'u-2',
        title: 'Untagged task 2',
        targetMinutes: 25,
        groupTag: '',
        date: '2026-10-28',
        status: 'in_progress',
        createdAt: new Date().toISOString()
      },
      {
        id: 'u-3',
        title: 'Untagged task 3 (explicit tag)',
        targetMinutes: 15,
        groupTag: 'untagged',
        date: '2026-10-28',
        status: 'planned',
        createdAt: new Date().toISOString()
      }
    ]

    const onDeleteDailyGoals = vi.fn().mockResolvedValue(undefined)
    const onDeleteDailyGoal = vi.fn().mockResolvedValue(undefined)

    render(
      <FocusSessionProvider>
        <GoalsPanel
          dailyGoals={untaggedGoals}
          onAddDailyGoal={vi.fn().mockResolvedValue(undefined)}
          onUpdateDailyGoal={vi.fn()}
          onDeleteDailyGoal={onDeleteDailyGoal}
          onDeleteDailyGoals={onDeleteDailyGoals}
        />
      </FocusSessionProvider>
    )

    const groupOptionButtons = screen.getAllByTitle('Group options')
    fireEvent.click(groupOptionButtons[0])

    // For untagged group, menu button is "Delete Untagged Tasks"
    const deleteUntaggedBtn = screen.getByText('Delete Untagged Tasks')
    fireEvent.click(deleteUntaggedBtn)

    const confirmDeleteBtn = screen.getByRole('button', {
      name: /Delete Group & All/i
    })
    fireEvent.click(confirmDeleteBtn)

    await waitFor(() => {
      expect(onDeleteDailyGoals).toHaveBeenCalledTimes(1)
      const deletedGoals = onDeleteDailyGoals.mock.calls[0][0]
      expect(deletedGoals).toHaveLength(3)
      expect(deletedGoals.map((g: DailyGoal) => g.id).sort()).toEqual(['u-1', 'u-2', 'u-3'])
      expect(onDeleteDailyGoal).not.toHaveBeenCalled()
    })
  })

  it('allows renaming group casing (e.g. "design" to "Design") in Edit Group modal', async () => {
    const goalsWithLowerTag: DailyGoal[] = [
      {
        id: 'g-lower',
        title: 'Design user profile screen',
        targetMinutes: 30,
        groupTag: 'design',
        groupColor: 'blue',
        date: '2026-10-28',
        status: 'planned',
        createdAt: new Date().toISOString()
      }
    ]

    const onUpdateDailyGoals = vi.fn().mockResolvedValue(undefined)
    const renameGroupMock = vi.fn().mockResolvedValue({ success: true })
    window.api = {
      goals: {
        renameGroup: renameGroupMock
      }
    } as any

    render(
      <FocusSessionProvider>
        <GoalsPanel
          dailyGoals={goalsWithLowerTag}
          onAddDailyGoal={vi.fn().mockResolvedValue(undefined)}
          onUpdateDailyGoal={vi.fn()}
          onUpdateDailyGoals={onUpdateDailyGoals}
          onDeleteDailyGoal={vi.fn()}
        />
      </FocusSessionProvider>
    )

    // Find and click the group options button (3 dots)
    const groupOptionButtons = screen.getAllByTitle('Group options')
    expect(groupOptionButtons.length).toBeGreaterThan(0)
    fireEvent.click(groupOptionButtons[0])

    // In group menu, click "Edit Group"
    const editGroupBtn = screen.getByText('Edit Group')
    fireEvent.click(editGroupBtn)

    // Edit group modal should appear with input for group name
    const input = screen.getByPlaceholderText(/e\.g\. Work, Health/i) as HTMLInputElement
    expect(input.value.toLowerCase()).toBe('design')

    // Change input value to capitalized 'Design'
    fireEvent.change(input, { target: { value: 'Design' } })

    // Click Save button
    const saveBtn = screen.getByRole('button', { name: /^Save$/i })
    fireEvent.click(saveBtn)

    await waitFor(() => {
      // renameGroup IPC should be called with oldTag 'design' and newTag 'Design'
      expect(renameGroupMock).toHaveBeenCalledWith('design', 'Design', expect.any(String))

      // onUpdateDailyGoals should update the matching goal to 'Design'
      expect(onUpdateDailyGoals).toHaveBeenCalledTimes(1)
      const updated = onUpdateDailyGoals.mock.calls[0][0]
      expect(updated[0].groupTag).toBe('Design')
    })
  })

  it('computes correct destination sort order when moving a goal between columns', async () => {
    const onUpdateDailyGoal = vi.fn().mockResolvedValue(undefined)
    const existingGoals: DailyGoal[] = [
      {
        id: 'g-in-prog',
        title: 'Existing In Progress Task',
        date: '2026-10-28',
        status: 'in_progress',
        sortOrder: 5000,
        createdAt: '2026-10-28T09:00:00Z'
      },
      {
        id: 'g-plan',
        title: 'Task to move',
        date: '2026-10-28',
        status: 'planned',
        sortOrder: 1500,
        createdAt: '2026-10-28T09:01:00Z'
      }
    ]

    render(
      <FocusSessionProvider>
        <GoalsPanel
          dailyGoals={existingGoals}
          onAddDailyGoal={vi.fn().mockResolvedValue(undefined)}
          onUpdateDailyGoal={onUpdateDailyGoal}
          onDeleteDailyGoal={vi.fn()}
          isActive={true}
        />
      </FocusSessionProvider>
    )

    // Select the planned task card
    const cardTitle = screen.getByText('Task to move')
    fireEvent.click(cardTitle)

    // Press '2' or 's' hotkey to move to In Progress
    fireEvent.keyDown(window, { key: '2' })

    await waitFor(() => {
      expect(onUpdateDailyGoal).toHaveBeenCalledTimes(1)
      const updated = onUpdateDailyGoal.mock.calls[0][0]
      expect(updated.id).toBe('g-plan')
      expect(updated.status).toBe('in_progress')
      // Destination in_progress has 5000; moving card is appended with > 5000 (e.g. 6000)
      expect(updated.sortOrder).toBeGreaterThan(5000)
    })
  })

  it('only attaches window scroll listeners when isActive is true', () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener')
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')

    const { rerender } = render(
      <FocusSessionProvider>
        <GoalsPanel
          dailyGoals={[]}
          onAddDailyGoal={vi.fn().mockResolvedValue(undefined)}
          onUpdateDailyGoal={vi.fn().mockResolvedValue(undefined)}
          onDeleteDailyGoal={vi.fn()}
          isActive={false}
        />
      </FocusSessionProvider>
    )

    // When isActive is false, scroll listener should not be attached for menu closing
    const scrollCallsInactive = addEventListenerSpy.mock.calls.filter(
      ([event]) => event === 'scroll'
    )
    expect(scrollCallsInactive.length).toBe(0)

    // When switching tab to active (isActive = true), scroll listener should attach
    rerender(
      <FocusSessionProvider>
        <GoalsPanel
          dailyGoals={[]}
          onAddDailyGoal={vi.fn().mockResolvedValue(undefined)}
          onUpdateDailyGoal={vi.fn().mockResolvedValue(undefined)}
          onDeleteDailyGoal={vi.fn()}
          isActive={true}
        />
      </FocusSessionProvider>
    )

    const scrollCallsActive = addEventListenerSpy.mock.calls.filter(([event]) => event === 'scroll')
    expect(scrollCallsActive.length).toBeGreaterThan(0)

    addEventListenerSpy.mockRestore()
    removeEventListenerSpy.mockRestore()
  })

  it('calculates destination sortOrder using full goals list when moving a goal while filtered', async () => {
    const onUpdateDailyGoal = vi.fn().mockResolvedValue(undefined)
    const goalsWithFilter: DailyGoal[] = [
      {
        id: 'g-plan-work',
        title: 'Work task in planned',
        groupTag: 'Work',
        status: 'planned',
        sortOrder: 1000,
        date: '2026-10-28',
        createdAt: '2026-10-28T10:00:00Z'
      },
      {
        id: 'g-prog-personal',
        title: 'Hidden Personal task in in_progress',
        groupTag: 'Personal',
        status: 'in_progress',
        sortOrder: 7000,
        date: '2026-10-28',
        createdAt: '2026-10-28T10:01:00Z'
      }
    ]

    render(
      <FocusSessionProvider>
        <GoalsPanel
          dailyGoals={goalsWithFilter}
          onAddDailyGoal={vi.fn().mockResolvedValue(undefined)}
          onUpdateDailyGoal={onUpdateDailyGoal}
          onDeleteDailyGoal={vi.fn()}
          isActive={true}
        />
      </FocusSessionProvider>
    )

    // Select the planned task card
    const cardTitle = screen.getByText('Work task in planned')
    fireEvent.click(cardTitle)

    // Press '2' to move to In Progress
    fireEvent.keyDown(window, { key: '2' })

    await waitFor(() => {
      expect(onUpdateDailyGoal).toHaveBeenCalledTimes(1)
      const updated = onUpdateDailyGoal.mock.calls[0][0]
      expect(updated.id).toBe('g-plan-work')
      expect(updated.status).toBe('in_progress')
      // Destination has hidden personal task at 7000, so new sortOrder must be > 7000 (appended after it)
      expect(updated.sortOrder).toBeGreaterThan(7000)
    })
  })

  it('opens task creation form in Planned column and calls onResetTriggerAdd when mounted with triggerAdd > 0', async () => {
    const onResetTriggerAdd = vi.fn()
    render(
      <FocusSessionProvider>
        <GoalsPanel
          dailyGoals={mockGoals}
          onAddDailyGoal={vi.fn().mockResolvedValue(undefined)}
          onUpdateDailyGoal={vi.fn()}
          onDeleteDailyGoal={vi.fn()}
          isActive={true}
          triggerAdd={1}
          onResetTriggerAdd={onResetTriggerAdd}
        />
      </FocusSessionProvider>
    )

    await waitFor(() => {
      // The task creation form (AddTaskCard) should be open with input placeholder or title input
      expect(screen.getByPlaceholderText(/what do you want to accomplish/i)).toBeTruthy()
      expect(onResetTriggerAdd).toHaveBeenCalledTimes(1)
    })
  })

  it('opens task creation form when triggerAdd is incremented after mounting', async () => {
    const onResetTriggerAdd = vi.fn()
    const { rerender } = render(
      <FocusSessionProvider>
        <GoalsPanel
          dailyGoals={mockGoals}
          onAddDailyGoal={vi.fn().mockResolvedValue(undefined)}
          onUpdateDailyGoal={vi.fn()}
          onDeleteDailyGoal={vi.fn()}
          isActive={true}
          triggerAdd={0}
          onResetTriggerAdd={onResetTriggerAdd}
        />
      </FocusSessionProvider>
    )

    expect(screen.queryByPlaceholderText(/what do you want to accomplish/i)).toBeNull()

    rerender(
      <FocusSessionProvider>
        <GoalsPanel
          dailyGoals={mockGoals}
          onAddDailyGoal={vi.fn().mockResolvedValue(undefined)}
          onUpdateDailyGoal={vi.fn()}
          onDeleteDailyGoal={vi.fn()}
          isActive={true}
          triggerAdd={1}
          onResetTriggerAdd={onResetTriggerAdd}
        />
      </FocusSessionProvider>
    )

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/what do you want to accomplish/i)).toBeTruthy()
      expect(onResetTriggerAdd).toHaveBeenCalledTimes(1)
    })
  })

  it('does not open add form on Ctrl+N when isActive is false', () => {
    render(
      <FocusSessionProvider>
        <GoalsPanel
          dailyGoals={mockGoals}
          onAddDailyGoal={vi.fn().mockResolvedValue(undefined)}
          onUpdateDailyGoal={vi.fn()}
          onDeleteDailyGoal={vi.fn()}
          isActive={false}
        />
      </FocusSessionProvider>
    )

    fireEvent.keyDown(window, { key: 'n', ctrlKey: true })
    expect(screen.queryByPlaceholderText(/what do you want to accomplish/i)).toBeNull()
  })
})
