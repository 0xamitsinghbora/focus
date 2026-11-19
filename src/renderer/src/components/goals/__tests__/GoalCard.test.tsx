import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { GoalCard } from '../GoalCard'
import { GoalsContextProvider, GoalsContextType } from '../GoalsContext'
import { DailyGoal, localDateStr } from '../../../../../shared/types'
import { ColumnId } from '../types'

describe('GoalCard Accessibility & Context Integration', () => {
  const mockGoal: DailyGoal = {
    id: 'goal-1',
    title: 'Write accessibility tests',
    date: '2026-10-29',
    status: 'in_progress',
    createdAt: new Date().toISOString()
  }

  function renderGoalCard(
    goal: DailyGoal = mockGoal,
    col: ColumnId = 'in_progress',
    contextOverrides: Partial<GoalsContextType> = {}
  ) {
    const contextValue: GoalsContextType = {
      dailyGoals: [goal],
      selectedGoalIds: new Set<string>(),
      activeGoalId: null,
      editingId: null,
      goalLoggedMinutesMap: {},
      groupByTag: false,
      existingGroups: [],
      dayCutoffHour: 0,
      drag: null,
      hoverColumn: null,
      hoverTarget: null,
      hoverGroupTarget: null,
      onPointerDownCard: vi.fn(),
      setActiveGoalId: vi.fn(),
      toggleSelectGoal: vi.fn(),
      selectSingle: vi.fn(),
      startEdit: vi.fn(),
      handleSaveEdit: vi.fn(),
      cancelEdit: vi.fn(),
      setContextMenu: vi.fn(),
      isGoalFocused: vi.fn().mockReturnValue(false),
      startFocus: vi.fn(),
      togglePause: vi.fn(),
      moveGoal: vi.fn(),
      longPressTriggeredRef: { current: false },
      didDragOccurRef: { current: false },
      ...contextOverrides
    }

    const utils = render(
      <GoalsContextProvider value={contextValue}>
        <GoalCard goal={goal} col={col} />
      </GoalsContextProvider>
    )

    return {
      ...utils,
      context: contextValue
    }
  }

  it('renders with article role, tabIndex=0, and aria-label', () => {
    renderGoalCard()
    const card = screen.getByRole('article', { name: /Task: Write accessibility tests/i })
    expect(card).toBeDefined()
    expect(card.getAttribute('tabindex')).toBe('0')
  })

  it('renders select checkbox with role="checkbox", aria-checked and aria-label when multi-selection is active', () => {
    renderGoalCard(mockGoal, 'in_progress', { selectedGoalIds: new Set(['goal-1']) })
    const checkbox = screen.getByRole('checkbox', {
      name: /Deselect task "Write accessibility tests"/i
    })
    expect(checkbox).toBeDefined()
    expect(checkbox.getAttribute('aria-checked')).toBe('true')
  })

  it('renders select checkbox in DOM ready for hover when zero items are selected', () => {
    renderGoalCard(mockGoal, 'in_progress', { selectedGoalIds: new Set() })
    const checkbox = screen.getByRole('checkbox', {
      name: /Select task "Write accessibility tests"/i
    })
    expect(checkbox).toBeDefined()
    expect(checkbox.getAttribute('aria-checked')).toBe('false')
    expect(checkbox.className).toContain('group-hover:opacity-100')
  })

  it('allows pointerdown on title to bubble to card root to enable kanban dragging', () => {
    const onPointerDownCard = vi.fn()
    const setActiveGoalId = vi.fn()
    renderGoalCard(mockGoal, 'in_progress', {
      onPointerDownCard,
      setActiveGoalId
    })
    const titleEl = screen.getByText('Write accessibility tests')

    const event = new MouseEvent('pointerdown', { bubbles: true })
    titleEl.dispatchEvent(event)

    expect(setActiveGoalId).toHaveBeenCalledWith('goal-1')
    expect(onPointerDownCard).toHaveBeenCalledTimes(1)
  })

  it('clamps context menu coordinates against viewport to prevent bottom and right overflow', () => {
    const setContextMenu = vi.fn()
    renderGoalCard(mockGoal, 'in_progress', { setContextMenu })
    const card = screen.getByRole('article')

    // Simulate right-click near bottom-right corner of a 1024x768 viewport
    window.innerWidth = 1000
    window.innerHeight = 700

    const contextEvent = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 950,
      clientY: 680
    })
    card.dispatchEvent(contextEvent)

    expect(setContextMenu).toHaveBeenCalled()
    const [{ goal: calledGoal, x, y }] = setContextMenu.mock.calls[0]
    expect(calledGoal.id).toBe('goal-1')
    // Max x: 1000 - 260 - 8 = 732
    expect(x).toBeLessThanOrEqual(732)
    // Max y: 700 - 460 - 8 = 232
    expect(y).toBeLessThanOrEqual(232)
    expect(x).toBeGreaterThanOrEqual(8)
    expect(y).toBeGreaterThanOrEqual(8)
  })

  it('calls selectSingle to deselect other cards when right-clicking an unselected card', () => {
    const selectSingle = vi.fn()
    const setContextMenu = vi.fn()
    renderGoalCard(mockGoal, 'in_progress', {
      selectedGoalIds: new Set(['goal-2', 'goal-3']),
      selectSingle,
      setContextMenu
    })
    const card = screen.getByRole('article')
    const contextEvent = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 200,
      clientY: 200
    })
    card.dispatchEvent(contextEvent)

    expect(selectSingle).toHaveBeenCalledWith('goal-1')
    expect(setContextMenu).toHaveBeenCalled()
  })

  it('renders overdue planned task with red border, background tint, and overdue indicator when date or deadline has passed', () => {
    const overduePlannedGoal: DailyGoal = {
      id: 'goal-overdue',
      title: 'Fix urgent critical bug',
      date: '2026-01-01',
      deadline: '2026-01-01T10:00:00.000Z',
      status: 'planned',
      createdAt: '2026-01-01T08:00:00.000Z'
    }

    renderGoalCard(overduePlannedGoal, 'planned')
    const card = screen.getByRole('article', { name: /Task: Fix urgent critical bug/i })
    expect(card).toBeDefined()
    expect(card.className).toContain('border-apple-red/70')
    expect(card.className).toContain('bg-apple-red/[0.04]')
    expect(screen.getByText(/Overdue/i)).toBeDefined()
  })

  it('tasks without any due date do NOT show as red even if created in the past', () => {
    const pastUnscheduledGoal: DailyGoal = {
      id: 'goal-unscheduled-past',
      title: 'Long-running backlog idea',
      date: '2025-01-01', // Past creation date
      deadline: undefined, // No due date
      status: 'planned',
      createdAt: '2025-01-01T08:00:00.000Z'
    }

    renderGoalCard(pastUnscheduledGoal, 'planned')
    const card = screen.getByRole('article', { name: /Task: Long-running backlog idea/i })
    expect(card).toBeDefined()
    expect(card.className).not.toContain('border-apple-red/70')
    expect(card.className).not.toContain('bg-apple-red/[0.04]')
    expect(screen.queryByText(/Overdue/i)).toBeNull()
  })

  it('shows task as red immediately once an exact deadline time passes', () => {
    vi.useFakeTimers()
    try {
      const now = new Date('2026-11-06T14:59:00.000Z')
      vi.setSystemTime(now)

      const futureTimeGoal: DailyGoal = {
        id: 'goal-exact-time',
        title: 'Submit report by 3pm',
        date: '2026-11-06',
        deadline: '2026-11-06T15:00:00.000Z',
        status: 'planned',
        createdAt: '2026-11-06T10:00:00.000Z'
      }

      const { rerender } = render(
        <GoalsContextProvider
          value={{
            dailyGoals: [futureTimeGoal],
            selectedGoalIds: new Set<string>(),
            activeGoalId: null,
            editingId: null,
            goalLoggedMinutesMap: {},
            groupByTag: false,
            existingGroups: [],
            dayCutoffHour: 0,
            drag: null,
            hoverColumn: null,
            hoverTarget: null,
            hoverGroupTarget: null,
            onPointerDownCard: vi.fn(),
            setActiveGoalId: vi.fn(),
            toggleSelectGoal: vi.fn(),
            startEdit: vi.fn(),
            handleSaveEdit: vi.fn(),
            cancelEdit: vi.fn(),
            setContextMenu: vi.fn(),
            isGoalFocused: vi.fn().mockReturnValue(false),
            startFocus: vi.fn(),
            togglePause: vi.fn(),
            moveGoal: vi.fn()
          }}
        >
          <GoalCard goal={futureTimeGoal} col="planned" />
        </GoalsContextProvider>
      )

      let card = screen.getByRole('article', { name: /Task: Submit report by 3pm/i })
      // Before 3:00 PM: not red
      expect(card.className).not.toContain('border-apple-red/70')
      expect(screen.queryByText(/Overdue/i)).toBeNull()

      // Advance time past 3:00 PM (e.g. 15:00:01)
      act(() => {
        vi.advanceTimersByTime(61 * 1000)
      })

      rerender(
        <GoalsContextProvider
          value={{
            dailyGoals: [futureTimeGoal],
            selectedGoalIds: new Set<string>(),
            activeGoalId: null,
            editingId: null,
            goalLoggedMinutesMap: {},
            groupByTag: false,
            existingGroups: [],
            dayCutoffHour: 0,
            drag: null,
            hoverColumn: null,
            hoverTarget: null,
            hoverGroupTarget: null,
            onPointerDownCard: vi.fn(),
            setActiveGoalId: vi.fn(),
            toggleSelectGoal: vi.fn(),
            startEdit: vi.fn(),
            handleSaveEdit: vi.fn(),
            cancelEdit: vi.fn(),
            setContextMenu: vi.fn(),
            isGoalFocused: vi.fn().mockReturnValue(false),
            startFocus: vi.fn(),
            togglePause: vi.fn(),
            moveGoal: vi.fn()
          }}
        >
          <GoalCard goal={futureTimeGoal} col="planned" />
        </GoalsContextProvider>
      )

      card = screen.getByRole('article', { name: /Task: Submit report by 3pm/i })
      // After 3:00 PM: immediately red
      expect(card.className).toContain('border-apple-red/70')
      expect(screen.getByText(/Overdue/i)).toBeDefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('clears red status immediately when task is carried forward to today', () => {
    const today = localDateStr(new Date())
    const carriedGoal: DailyGoal = {
      id: 'goal-carried',
      title: 'Carried forward task',
      date: today,
      carriedFromDate: '2026-01-01',
      deadline: '2026-01-01', // Old past deadline before carry
      status: 'planned',
      createdAt: '2026-01-01T08:00:00.000Z'
    }

    renderGoalCard(carriedGoal, 'planned')
    const card = screen.getByRole('article', { name: /Task: Carried forward task/i })
    expect(card).toBeDefined()
    // Red status cleared
    expect(card.className).not.toContain('border-apple-red/70')
    expect(card.className).not.toContain('bg-apple-red/[0.04]')
    expect(screen.queryByText(/Overdue/i)).toBeNull()
  })

  it('renders Carry to Today button on overdue task and triggers onCarryToToday', () => {
    const onCarryToToday = vi.fn()
    const overduePlannedGoal: DailyGoal = {
      id: 'goal-overdue-carry',
      title: 'Urgent task to carry',
      date: '2026-01-01',
      deadline: '2026-01-01T10:00:00.000Z',
      status: 'planned',
      createdAt: '2026-01-01T08:00:00.000Z'
    }

    renderGoalCard(overduePlannedGoal, 'planned', { onCarryToToday })
    const carryButton = screen.getByRole('button', { name: /Carry to Today/i })
    expect(carryButton).toBeDefined()

    carryButton.click()
    expect(onCarryToToday).toHaveBeenCalledWith(overduePlannedGoal)
  })

  it('clicking an in-progress task card does not trigger single-task focus', () => {
    const startFocus = vi.fn()
    const inProgressGoal: DailyGoal = {
      id: 'goal-inprogress-click',
      title: 'Build user settings page',
      date: '2026-11-06',
      status: 'in_progress',
      createdAt: '2026-11-06T09:00:00.000Z'
    }

    renderGoalCard(inProgressGoal, 'in_progress', {
      startFocus,
      isGoalFocused: vi.fn().mockReturnValue(false)
    })
    const card = screen.getByRole('article', { name: /Task: Build user settings page/i })
    expect(card).toBeDefined()

    card.click()
    expect(startFocus).not.toHaveBeenCalled()
  })

  it('does NOT display a single-task Focusing badge or green accent ring on in-progress cards', () => {
    const inProgressGoal: DailyGoal = {
      id: 'goal-inprogress-active',
      title: 'Active deep work session',
      date: '2026-11-06',
      status: 'in_progress',
      createdAt: '2026-11-06T09:00:00.000Z'
    }

    renderGoalCard(inProgressGoal, 'in_progress', {
      isGoalFocused: (id) => id === inProgressGoal.id
    })
    const card = screen.getByRole('article', { name: /Task: Active deep work session/i })
    expect(card).toBeDefined()
    expect(card.className).not.toContain('border-apple-green/60')
    expect(card.className).not.toContain('ring-apple-green/40')
    expect(screen.queryByText('Focusing')).toBeNull()
  })
})
