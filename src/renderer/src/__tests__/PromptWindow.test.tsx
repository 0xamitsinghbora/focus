import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { PromptWindow } from '../components/PromptWindow'
import { DailyGoal } from '../../../shared/types'

describe('PromptWindow Component', () => {
  const mockPlannedGoal: DailyGoal = {
    id: 'goal-planned-1',
    title: 'Morning Planned Architecture Task',
    status: 'planned',
    date: '2026-10-29',
    createdAt: '2026-10-29T08:00:00Z',
    groupTag: 'Engineering',
    groupColor: 'blue'
  }

  const mockInProgressGoal: DailyGoal = {
    id: 'goal-active-1',
    title: 'Active Code Review Task',
    status: 'in_progress',
    date: '2026-10-29',
    createdAt: '2026-10-29T09:00:00Z',
    groupTag: 'Reviews',
    groupColor: 'purple'
  }

  const mockDoneGoal: DailyGoal = {
    id: 'goal-done-1',
    title: 'Completed Task Yesterday',
    status: 'done',
    date: '2026-10-29',
    createdAt: '2026-10-29T07:00:00Z'
  }

  let getGoalsMock: ReturnType<typeof vi.fn>
  let updateGoalMock: ReturnType<typeof vi.fn>
  let appendLogMock: ReturnType<typeof vi.fn>
  let schedulerSubmitMock: ReturnType<typeof vi.fn>
  let schedulerSnoozeMock: ReturnType<typeof vi.fn>
  let getStatusMock: ReturnType<typeof vi.fn>
  let onPromptShownMock: ReturnType<typeof vi.fn>
  let resizePromptMock: ReturnType<typeof vi.fn>
  let quickActionMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()

    // Polyfill ResizeObserver and scrollIntoView if missing in test environment
    if (typeof global.ResizeObserver === 'undefined') {
      global.ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      } as any
    }

    if (!Element.prototype.scrollIntoView) {
      Element.prototype.scrollIntoView = vi.fn()
    }

    getGoalsMock = vi.fn().mockResolvedValue([mockInProgressGoal, mockPlannedGoal, mockDoneGoal])
    updateGoalMock = vi.fn().mockResolvedValue({ ...mockPlannedGoal, status: 'in_progress' })
    appendLogMock = vi.fn().mockResolvedValue(undefined)
    schedulerSubmitMock = vi.fn()
    schedulerSnoozeMock = vi.fn()
    quickActionMock = vi.fn()
    getStatusMock = vi.fn().mockResolvedValue({
      currentBlockStartedAt: new Date(Date.now() - 25 * 60000).toISOString(),
      intervalMinutes: 45
    })
    onPromptShownMock = vi.fn().mockReturnValue(() => {})
    resizePromptMock = vi.fn()

    window.api = {
      goals: {
        get: getGoalsMock,
        update: updateGoalMock
      },
      logs: {
        append: appendLogMock
      },
      session: {
        quickAction: quickActionMock
      },
      scheduler: {
        getStatus: getStatusMock,
        onPromptShown: onPromptShownMock,
        resizePrompt: resizePromptMock,
        submit: schedulerSubmitMock,
        snooze: schedulerSnoozeMock,
        focusPrompt: vi.fn()
      }
    } as any
  })

  it('renders both planned and in-progress tasks, excluding done tasks', async () => {
    render(<PromptWindow />)

    // Heading and tasks list section
    await waitFor(() => {
      expect(screen.getByText('Active Code Review Task')).toBeDefined()
    })

    expect(screen.getByText("Today's Tasks")).toBeDefined()
    // Both planned and in-progress tasks should be rendered
    expect(screen.getByText('Morning Planned Architecture Task')).toBeDefined()

    // Completed task should NOT be rendered
    expect(screen.queryByText('Completed Task Yesterday')).toBeNull()

    // Status badges should be displayed
    expect(screen.getByText('In Progress')).toBeDefined()
    expect(screen.getByText('Planned')).toBeDefined()

    // Task count badge is removed
    expect(screen.queryByText('2 tasks')).toBeNull()
  })

  it('prioritizes in-progress tasks before planned tasks', async () => {
    // Return planned goal first in the mock array
    getGoalsMock.mockResolvedValue([mockPlannedGoal, mockInProgressGoal])

    render(<PromptWindow />)

    await waitFor(() => {
      expect(screen.getByText('Active Code Review Task')).toBeDefined()
    })

    const taskButtons = screen
      .getAllByRole('button')
      .filter((b) => b.textContent?.includes('Engineering') || b.textContent?.includes('Reviews'))

    expect(taskButtons.length).toBe(2)
    // First should be the in_progress task even though planned was first in API response
    expect(taskButtons[0].textContent).toContain('Active Code Review Task')
    expect(taskButtons[1].textContent).toContain('Morning Planned Architecture Task')
  })

  it('displays empty state message when no active or planned tasks exist', async () => {
    getGoalsMock.mockResolvedValue([mockDoneGoal])

    render(<PromptWindow />)

    await waitFor(() => {
      expect(screen.getByText('No active or planned tasks for today')).toBeDefined()
    })
  })

  it('promotes planned task to in_progress upon logging work from prompt', async () => {
    getGoalsMock.mockResolvedValue([mockPlannedGoal])

    render(<PromptWindow />)

    await waitFor(() => {
      expect(screen.getByText('Morning Planned Architecture Task')).toBeDefined()
    })

    // Click the planned goal to transition to detail step
    fireEvent.click(screen.getByText('Morning Planned Architecture Task'))

    await waitFor(() => {
      expect(screen.getByText('Planned Task')).toBeDefined()
    })

    // Detail input field
    const input = screen.getByPlaceholderText(
      /What did you work on "Morning Planned Architecture Task"/i
    )
    fireEvent.change(input, { target: { value: 'Created initial schema diagram' } })

    // Click Submit
    const submitBtn = screen.getByRole('button', { name: /Submit/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      // 1. Log appended with goal info
      expect(appendLogMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          goalId: 'goal-planned-1',
          goalTitle: 'Morning Planned Architecture Task',
          note: 'Created initial schema diagram',
          productivity: 'productive'
        }),
        true
      )

      // 2. Goal automatically updated to in_progress
      expect(updateGoalMock).toHaveBeenCalledWith(
        '2026-10-29',
        expect.objectContaining({
          id: 'goal-planned-1',
          status: 'in_progress'
        })
      )

      // 3. Scheduler submitted
      expect(schedulerSubmitMock).toHaveBeenCalled()
    })
  })

  it('does not call goals.update when logging work to an already in_progress task', async () => {
    getGoalsMock.mockResolvedValue([mockInProgressGoal])

    render(<PromptWindow />)

    await waitFor(() => {
      expect(screen.getByText('Active Code Review Task')).toBeDefined()
    })

    // Click in-progress task
    fireEvent.click(screen.getByText('Active Code Review Task'))

    await waitFor(() => {
      expect(screen.getByText('In-Progress Task')).toBeDefined()
    })

    // Submit
    const submitBtn = screen.getByRole('button', { name: /Submit/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(appendLogMock).toHaveBeenCalled()
      expect(updateGoalMock).not.toHaveBeenCalled()
      expect(schedulerSubmitMock).toHaveBeenCalled()
    })
  })

  it('does not aggressively steal window focus on onPromptShown', async () => {
    let promptShownHandler: (() => void) | undefined
    onPromptShownMock.mockImplementation((handler: () => void) => {
      promptShownHandler = handler
      return () => {}
    })
    const windowFocusSpy = vi.spyOn(window, 'focus')

    render(<PromptWindow />)

    await waitFor(() => {
      expect(screen.getByText("Today's Tasks")).toBeDefined()
    })

    // Simulate onPromptShown trigger from main process
    act(() => {
      promptShownHandler?.()
    })

    await waitFor(() => {
      // Neither window.focus nor scheduler.focusPrompt should be called
      expect(windowFocusSpy).not.toHaveBeenCalled()
      expect(window.api.scheduler.focusPrompt).not.toHaveBeenCalled()
    })
  })

  it('displays validation feedback when submitting Something Else with an empty note', async () => {
    render(<PromptWindow />)

    await waitFor(() => {
      expect(screen.getByText('Something Else')).toBeDefined()
    })

    // Click "Something Else"
    fireEvent.click(screen.getByText('Something Else'))

    await waitFor(() => {
      expect(screen.getByPlaceholderText('What did you do?')).toBeDefined()
    })

    // Click Submit with empty input
    const submitBtn = screen.getByRole('button', { name: /Submit/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(screen.getByText('Please describe what you worked on.')).toBeDefined()
    })

    expect(appendLogMock).not.toHaveBeenCalled()
    expect(schedulerSubmitMock).not.toHaveBeenCalled()
  })

  it('promotes planned goal to in_progress with computed destination sort order', async () => {
    // Existing in_progress task has sortOrder 1000
    const inProgress = { ...mockInProgressGoal, sortOrder: 1000 }
    // Planned task has sortOrder 500
    const planned = { ...mockPlannedGoal, sortOrder: 500 }
    getGoalsMock.mockResolvedValue([inProgress, planned])

    render(<PromptWindow />)

    await waitFor(() => {
      expect(screen.getByText('Morning Planned Architecture Task')).toBeDefined()
    })

    // Click on the planned task
    fireEvent.click(screen.getByText('Morning Planned Architecture Task'))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Submit/i })).toBeDefined()
    })

    // Submit log for the planned task
    fireEvent.click(screen.getByRole('button', { name: /Submit/i }))

    await waitFor(() => {
      expect(updateGoalMock).toHaveBeenCalled()
    })

    const updatedPayload = updateGoalMock.mock.calls[0][1]
    expect(updatedPayload.status).toBe('in_progress')
    // Appended after sortOrder 1000 -> 2000
    expect(updatedPayload.sortOrder).toBe(2000)
  })

  it('navigates sequentially with ArrowUp and ArrowDown without skipping Something Else', async () => {
    getGoalsMock.mockResolvedValue([mockInProgressGoal])

    render(<PromptWindow />)

    await waitFor(() => {
      expect(screen.getByText('Active Code Review Task')).toBeDefined()
    })

    // options: [0: InProgressGoal, 1: Something Else, 2: Break]
    // Press ArrowDown -> 1 (Something Else)
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    // Press ArrowDown -> 2 (Break)
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    // Press ArrowUp -> MUST move to 1 (Something Else), NOT skip to 0
    fireEvent.keyDown(window, { key: 'ArrowUp' })

    // Pressing Enter on "Something Else" transitions to details view
    fireEvent.keyDown(window, { key: 'Enter' })

    await waitFor(() => {
      expect(screen.getByPlaceholderText('What did you do?')).toBeDefined()
    })
  })

  it('preserves user draft note and step when onPromptShown triggers externally', async () => {
    let promptShownHandler: (() => void) | null = null
    onPromptShownMock.mockImplementation((cb: () => void) => {
      promptShownHandler = cb
      return () => {}
    })

    getGoalsMock.mockResolvedValue([mockInProgressGoal])

    render(<PromptWindow />)

    await waitFor(() => {
      expect(screen.getByText('Active Code Review Task')).toBeDefined()
    })

    // Navigate to Something Else and press Enter to enter detail step
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    fireEvent.keyDown(window, { key: 'Enter' })

    const input = await screen.findByPlaceholderText('What did you do?')
    fireEvent.change(input, { target: { value: 'Drafting design specification' } })
    expect((input as HTMLInputElement).value).toBe('Drafting design specification')

    // Simulate external prompt:shown IPC event
    expect(promptShownHandler).not.toBeNull()
    promptShownHandler!()

    // Should NOT reset step to select or wipe the typed text
    await waitFor(() => {
      expect(screen.getByPlaceholderText('What did you do?')).toBeDefined()
      expect((screen.getByPlaceholderText('What did you do?') as HTMLInputElement).value).toBe(
        'Drafting design specification'
      )
    })
  })

  it('snooze invokes scheduler.snooze with interval minutes and sends restart-session quick action', async () => {
    render(<PromptWindow />)

    await waitFor(() => {
      expect(screen.getByText('Active Code Review Task')).toBeDefined()
    })

    const snoozeBtn = screen.getByRole('button', { name: /Snooze/i })
    fireEvent.click(snoozeBtn)

    expect(schedulerSnoozeMock).toHaveBeenCalledWith(45)
    expect(quickActionMock).toHaveBeenCalledWith('restart-session')
  })

  it('logging work to an in-progress task invokes logs.append and restarts session timer', async () => {
    render(<PromptWindow />)

    await waitFor(() => {
      expect(screen.getByText('Active Code Review Task')).toBeDefined()
    })

    // Select first task (Active Code Review Task)
    fireEvent.keyDown(window, { key: 'Enter' })

    // In detail step, submit with enter
    const input = await screen.findByPlaceholderText(/What did you work on/i)
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(appendLogMock).toHaveBeenCalled()
      expect(schedulerSubmitMock).toHaveBeenCalled()
      expect(quickActionMock).toHaveBeenCalledWith('restart-session')
    })
  })

  it('does not render focus quality rating in prompt detail and submits cleanly', async () => {
    render(<PromptWindow />)

    await waitFor(() => {
      expect(screen.getByText('Active Code Review Task')).toBeDefined()
    })

    // Select first task
    fireEvent.keyDown(window, { key: 'Enter' })

    // Verify Focus Quality rating is NOT rendered
    expect(screen.queryByRole('radiogroup', { name: /Focus Quality Rating/i })).toBeNull()
    expect(screen.queryByText(/Deep Flow/i)).toBeNull()

    // Submit with enter
    const input = await screen.findByPlaceholderText(/What did you work on/i)
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(appendLogMock).toHaveBeenCalled()
      const calls = appendLogMock.mock.calls
      const lastCall = calls[calls.length - 1]
      expect(lastCall[1].focusQuality).toBeUndefined()
    })
  })

  it('transitions to AFK break after 40 seconds of inactivity, logs focus session, and returning logs break and restarts session', async () => {
    vi.useFakeTimers()

    try {
      render(<PromptWindow />)

      // Advance to resolve promises
      await act(async () => {
        await Promise.resolve()
        await Promise.resolve()
      })

      expect(screen.getByText('Active Code Review Task')).toBeDefined()

      // Fast-forward 40 seconds of AFK time
      await act(async () => {
        vi.advanceTimersByTime(40000)
        await Promise.resolve()
      })

      // Prior session should be logged automatically
      expect(appendLogMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          productivity: 'productive',
          text: 'Active Code Review Task'
        }),
        true
      )

      // Prompt transitions to AFK Break screen with red timer
      expect(screen.getByText(/AFK Break Active/i)).toBeDefined()
      expect(screen.getByText('00:00')).toBeDefined()

      // Advance timer by 5 seconds in AFK
      await act(async () => {
        vi.advanceTimersByTime(5000)
      })
      expect(screen.getByText('00:05')).toBeDefined()

      // User returns and clicks the return button
      const returnBtn = screen.getByRole('button', { name: /I'm Back — Start Focus Session/i })
      await act(async () => {
        fireEvent.click(returnBtn)
        await Promise.resolve()
      })

      // Break log should be recorded in red (productivity: 'break')
      expect(appendLogMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          productivity: 'break',
          text: 'Break',
          durationMinutes: 1
        }),
        false
      )

      // Scheduler submitted and fresh session restarted
      expect(schedulerSubmitMock).toHaveBeenCalled()
      expect(quickActionMock).toHaveBeenCalledWith('restart-session')
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not render "Mark task as completed" checkbox in detail step', async () => {
    render(<PromptWindow />)

    await waitFor(() => {
      expect(screen.getByText('Active Code Review Task')).toBeDefined()
    })

    // Click on the task to go to detail step
    fireEvent.click(screen.getByText('Active Code Review Task'))

    // In detail step, verify checkbox is absent
    expect(screen.queryByRole('checkbox', { name: /Mark task as completed/i })).toBeNull()

    // Submit
    const submitBtn = screen.getByRole('button', { name: /Submit/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(appendLogMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          goalId: mockInProgressGoal.id,
          productivity: 'productive'
        }),
        true
      )
      expect(quickActionMock).toHaveBeenCalledWith('restart-session')
    })
  })

  it('submits Something Else and logs session without rendering "Add as task to planner" checkbox', async () => {
    render(<PromptWindow />)

    await waitFor(() => {
      expect(screen.getByText('Something Else')).toBeDefined()
    })

    // Click Something Else
    fireEvent.click(screen.getByText('Something Else'))

    // Verify "Add as task to planner" checkbox is absent
    expect(screen.queryByRole('checkbox', { name: /Add as task to planner/i })).toBeNull()

    // In detail step, type description
    const input = await screen.findByPlaceholderText(/What did you do/i)
    fireEvent.change(input, { target: { value: 'Ad-hoc debugging' } })

    // Submit
    const submitBtn = screen.getByRole('button', { name: /Submit/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(appendLogMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          text: 'Ad-hoc debugging',
          productivity: 'productive'
        }),
        true
      )
      expect(quickActionMock).toHaveBeenCalledWith('restart-session')
    })
  })

  it('logs Break in red and restarts session timer when Break is chosen', async () => {
    render(<PromptWindow />)

    await waitFor(() => {
      expect(screen.getByText('Break')).toBeDefined()
    })

    fireEvent.click(screen.getByText('Break'))

    await waitFor(() => {
      expect(appendLogMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          text: 'Break',
          productivity: 'break'
        }),
        true
      )
      expect(schedulerSubmitMock).toHaveBeenCalled()
      expect(quickActionMock).toHaveBeenCalledWith('restart-session')
    })
  })

  it('displays snooze badge in prompt selector when session was snoozed', async () => {
    getStatusMock.mockResolvedValueOnce({
      currentBlockStartedAt: new Date(Date.now() - 45 * 60000).toISOString(),
      intervalMinutes: 45,
      snoozeCount: 2
    })

    render(<PromptWindow />)

    await waitFor(() => {
      expect(screen.getByText('Snoozed 2x')).toBeDefined()
      expect(screen.getByText(/Snooze \(2x\)/i)).toBeDefined()
    })
  })
})
