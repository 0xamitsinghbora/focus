import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { TaskbarWidget } from '../components/TaskbarWidget'

describe('TaskbarWidget Component (Focus Taskbar Deskband)', () => {
  let sessionCallback: ((payload: any) => void) | null = null
  let dataUpdatedCallback: ((target?: any) => void) | null = null

  const mockApi = {
    scheduler: {
      getStatus: vi.fn().mockResolvedValue({
        intervalMinutes: 25,
        currentBlockStartedAt: new Date().toISOString(),
        nextPromptTime: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        isPendingPrompt: false
      })
    },
    session: {
      getState: vi.fn().mockResolvedValue(null),
      onSessionUpdate: vi.fn((cb) => {
        sessionCallback = cb
        return () => {
          sessionCallback = null
        }
      })
    },
    widget: {
      getBounds: vi.fn().mockResolvedValue({ x: 1200, y: 820 }),
      onPositionUpdated: vi.fn(() => () => {}),
      setPosition: vi.fn(),
      savePosition: vi.fn().mockResolvedValue({ x: 1200, y: 820 }),
      showApp: vi.fn(),
      toggleSession: vi.fn(),
      contextMenu: vi.fn(),
      setIgnoreMouseEvents: vi.fn(),
      setExpanded: vi.fn()
    },
    logs: {
      get: vi.fn().mockResolvedValue([
        { id: '1', productiveMinutes: 45, productivity: 'productive' },
        { id: '2', productiveMinutes: 30, productivity: 'productive' }
      ]),
      getDayReview: vi.fn().mockResolvedValue(null),
      getHeatmap: vi.fn().mockResolvedValue({})
    },
    goals: {
      get: vi
        .fn()
        .mockResolvedValue([{ id: 'goal-1', title: 'Default active task', status: 'in_progress' }])
    },
    events: {
      onDataUpdated: vi.fn((cb) => {
        dataUpdatedCallback = cb
        return () => {
          dataUpdatedCallback = null
        }
      })
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(window as any).api = mockApi
  })

  it('renders minimal Focus taskbar widget with play/pause button and timer, without cluttered labels', async () => {
    const { container } = render(<TaskbarWidget />)

    // Wait for initial logs & scheduler to resolve
    await act(async () => {
      await Promise.resolve()
    })

    // Verify absolutely NO internet speed arrows
    expect(screen.queryByText('↑')).toBeNull()
    expect(screen.queryByText('↓')).toBeNull()

    // Verify PROMPT, TODAY, and FOCUS badges are removed for minimal design
    expect(screen.queryByText('TODAY')).toBeNull()
    expect(screen.queryByText('PROMPT')).toBeNull()
    expect(screen.queryByText('FOCUS')).toBeNull()

    // Verify streak flame is not displayed in the widget
    expect(screen.queryByText('🔥')).toBeNull()

    // Check for Focus countdown timer
    expect(screen.getByText(/14:59|15:00|25:00/)).toBeTruthy()

    // Check for Play/Pause Focus button
    expect(screen.getByRole('button', { name: /start focus/i })).toBeTruthy()

    // Verify Focus circular progress ring SVG
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()

    // Verify outer container transparency
    const outerContainer = container.querySelector('.relative')
    expect(outerContainer).toBeTruthy()
    expect(outerContainer?.className).toContain('bg-transparent')

    // Daily productive time is cleanly preserved in tooltip/aria-label
    expect(screen.getByLabelText(/Today: 1h 15m/)).toBeTruthy()
  })

  it('applies adaptive theme classes for light and dark support', async () => {
    const { container } = render(<TaskbarWidget />)

    await act(async () => {
      await Promise.resolve()
    })

    const widgetBox = container.querySelector('.group')
    expect(widgetBox?.className).toContain('bg-white/80')
    expect(widgetBox?.className).toContain('dark:bg-zinc-950/80')
    expect(widgetBox?.className).toContain('border-black/10')
    expect(widgetBox?.className).toContain('dark:border-white/10')
    expect(widgetBox?.className).toContain('rounded-full')
  })

  it('updates timer and play/pause button when session updates broadcast', async () => {
    render(<TaskbarWidget />)

    await act(async () => {
      await Promise.resolve()
    })

    // Broadcast active deep focus session
    act(() => {
      if (sessionCallback) {
        sessionCallback({
          isActive: true,
          isPaused: false,
          isBreak: false,
          isOvertime: false,
          secondsRemaining: 1475,
          totalSeconds: 1500
        })
      }
    })

    // 1475s = 24:35
    expect(screen.getByText('24:35')).toBeTruthy()
    // Play/Pause button switches to Pause Focus
    expect(screen.getByRole('button', { name: /pause focus/i })).toBeTruthy()
    expect(screen.queryByText('FOCUS')).toBeNull()
  })

  it('displays active focus timer in tooltip when provided in session update', async () => {
    render(<TaskbarWidget />)

    await act(async () => {
      await Promise.resolve()
    })

    act(() => {
      if (sessionCallback) {
        sessionCallback({
          isActive: true,
          isPaused: false,
          isBreak: false,
          isOvertime: false,
          goalTitle: 'Ship Feature X',
          secondsRemaining: 1200,
          totalSeconds: 1500
        })
      }
    })

    expect(screen.getByText('20:00')).toBeTruthy()
    expect(screen.getByLabelText(/Focusing: 20:00 left/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /pause focus/i })).toBeTruthy()
    expect(screen.queryByText('FOCUS')).toBeNull()
  })

  it('displays overtime timer format (+mm:ss) when focus session goes into overtime', async () => {
    render(<TaskbarWidget />)

    await act(async () => {
      await Promise.resolve()
    })

    act(() => {
      if (sessionCallback) {
        sessionCallback({
          isActive: true,
          isPaused: false,
          isBreak: false,
          isOvertime: true,
          secondsRemaining: -125,
          totalSeconds: 1500
        })
      }
    })

    // Overtime +02:05
    expect(screen.getByText('+02:05')).toBeTruthy()
    expect(screen.queryByText('OVER')).toBeNull()
  })

  it('renders hour-plus overtime format (+1:01:36) with compact typography and layout without overflowing', async () => {
    const { container } = render(<TaskbarWidget />)

    await act(async () => {
      await Promise.resolve()
    })

    act(() => {
      if (sessionCallback) {
        sessionCallback({
          isActive: true,
          isPaused: false,
          isBreak: false,
          isOvertime: true,
          secondsRemaining: -3696, // 1h 1m 36s overtime
          totalSeconds: 1500
        })
      }
    })

    const timer = screen.getByText('+1:01:36')
    expect(timer).toBeTruthy()
    expect(timer.className).toContain('text-[13px]')
    expect(timer.className).toContain('tracking-tight')

    // Inner pill maintains box-border dimensions
    const pill = container.querySelector('.group.relative')
    expect(pill).toBeTruthy()
    expect(pill?.className).toContain('box-border')
    expect(pill?.className).toContain('px-1.5')
  })

  it('changes back to starting session timer and green after logging/completing overtime session', async () => {
    const { container } = render(<TaskbarWidget />)

    await act(async () => {
      await Promise.resolve()
    })

    // 1. Session goes into overtime (+17:12) with red ring
    act(() => {
      if (sessionCallback) {
        sessionCallback({
          isActive: true,
          isPaused: false,
          isBreak: false,
          isOvertime: true,
          secondsRemaining: -1032,
          totalSeconds: 1500
        })
      }
    })

    const redTimer = screen.getByText('+17:12')
    expect(redTimer).toBeTruthy()
    expect(redTimer.className).toContain('text-rose-600')
    const circles = container.querySelectorAll('circle')
    expect(circles[1].getAttribute('stroke')).toBe('#f43f5e')

    // 2. User logs what they did -> session is completed / reset (isActive: false)
    act(() => {
      if (sessionCallback) {
        sessionCallback({
          isActive: false,
          isPaused: false,
          isBreak: false,
          isOvertime: false,
          secondsRemaining: 0,
          totalSeconds: 0
        })
      }
    })

    // 3. Widget changes back to starting session timer and green
    const greenTimer = screen.getByText(/14:59|15:00|25:00/)
    expect(greenTimer).toBeTruthy()
    expect(greenTimer.className).toContain('text-emerald-600')
    const updatedCircles = container.querySelectorAll('circle')
    expect(updatedCircles[1].getAttribute('stroke')).toBe('#10b981')
    expect(screen.getByTitle('Start Focus')).toBeTruthy()
  })

  it('triggers showApp when clicking widget and contextMenu on right-click', async () => {
    const { container } = render(<TaskbarWidget />)

    await act(async () => {
      await Promise.resolve()
    })

    const widgetDiv = container.querySelector('.group')
    expect(widgetDiv).toBeTruthy()

    // Left click
    fireEvent.click(widgetDiv!)
    expect(mockApi.widget.showApp).toHaveBeenCalledTimes(1)

    // Right click
    fireEvent.contextMenu(widgetDiv!)
    expect(mockApi.widget.contextMenu).toHaveBeenCalledTimes(1)
  })

  it('toggles session pause/resume when clicking the action button', async () => {
    render(<TaskbarWidget />)

    await act(async () => {
      await Promise.resolve()
    })

    const actionButton = screen.getByRole('button', {
      name: /start focus|pause focus|resume focus/i
    })
    expect(actionButton).toBeTruthy()

    fireEvent.pointerDown(actionButton, { button: 0 })
    fireEvent.pointerUp(actionButton, { button: 0 })
    fireEvent.click(actionButton)
    expect(mockApi.widget.toggleSession).toHaveBeenCalledTimes(1)
    expect(mockApi.widget.showApp).not.toHaveBeenCalled()
  })

  it('refreshes daily productive minutes in tooltip when onDataUpdated triggers', async () => {
    render(<TaskbarWidget />)

    await act(async () => {
      await Promise.resolve()
    })

    expect(screen.getByLabelText(/Today: 1h 15m/)).toBeTruthy()

    // Mock logs returning more time
    mockApi.logs.get.mockResolvedValueOnce([
      { id: '1', productiveMinutes: 60, productivity: 'productive' },
      { id: '2', productiveMinutes: 60, productivity: 'productive' }
    ])

    await act(async () => {
      if (dataUpdatedCallback) {
        dataUpdatedCallback()
      }
      await Promise.resolve()
    })

    // 120 mins = 2h
    expect(screen.getByLabelText(/Today: 2h/)).toBeTruthy()
  })

  it('immediately updates daily productive minutes without round-trip query when target contains todayMinutes', async () => {
    render(<TaskbarWidget />)

    await act(async () => {
      await Promise.resolve()
    })

    expect(screen.getByLabelText(/Today: 1h 15m/)).toBeTruthy()

    await act(async () => {
      if (dataUpdatedCallback) {
        dataUpdatedCallback({ todayMinutes: 180 })
      }
      await Promise.resolve()
    })

    // 180 mins = 3h
    expect(screen.getByLabelText(/Today: 3h/)).toBeTruthy()
  })

  it('counts productive tasks containing the word "break" in title towards productive time in tooltip', async () => {
    mockApi.logs.get.mockResolvedValueOnce([
      { id: '1', productiveMinutes: 30, productivity: 'productive', text: 'Fix breakpoint crash' },
      { id: '2', productiveMinutes: 20, productivity: 'break', text: 'Coffee break' }
    ])

    render(<TaskbarWidget />)

    await act(async () => {
      await Promise.resolve()
    })

    // Only 30m should be counted, not 0m
    expect(screen.getByLabelText(/Today: 30m/)).toBeTruthy()
  })

  it('excludes unproductive logs from today productive minutes in tooltip', async () => {
    mockApi.logs.get.mockResolvedValueOnce([
      { id: '1', durationMinutes: 25, productivity: 'unproductive', text: 'Social media browsing' },
      { id: '2', durationMinutes: 40, productivity: 'productive', text: 'Writing documentation' }
    ])

    render(<TaskbarWidget />)

    await act(async () => {
      await Promise.resolve()
    })

    // Only 40m should be counted, not 65m
    expect(screen.getByLabelText(/Today: 40m/)).toBeTruthy()
  })

  it('displays 00:00 timer without PROMPT badge when check-in prompt is pending', async () => {
    mockApi.scheduler.getStatus.mockResolvedValueOnce({
      intervalMinutes: 45,
      currentBlockStartedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      nextPromptTime: new Date(Date.now() - 1000).toISOString(),
      isPendingPrompt: true
    })

    render(<TaskbarWidget />)

    await act(async () => {
      await Promise.resolve()
    })

    expect(screen.getByText('00:00')).toBeTruthy()
    expect(screen.queryByText('PROMPT')).toBeNull()
  })

  it('displays configured interval (e.g. 45:00) instead of hardcoded 25:00 in idle state', async () => {
    mockApi.scheduler.getStatus.mockResolvedValueOnce({
      intervalMinutes: 45,
      currentBlockStartedAt: new Date().toISOString(),
      nextPromptTime: '',
      isPendingPrompt: false
    })

    render(<TaskbarWidget />)

    await act(async () => {
      await Promise.resolve()
    })

    expect(screen.getByText('45:00')).toBeTruthy()
    expect(screen.queryByText('FOCUS')).toBeNull()
  })

  it('queries window.api.logs.getDayReview on mount and uses totalProductiveMinutes in tooltip', async () => {
    mockApi.logs.getDayReview.mockResolvedValueOnce({
      totalProductiveMinutes: 75,
      date: '2026-10-29'
    })

    render(<TaskbarWidget />)

    await act(async () => {
      await Promise.resolve()
    })

    expect(mockApi.logs.getDayReview).toHaveBeenCalled()
    // Should render the progress text showing 1h 15m in tooltip
    expect(screen.getByLabelText(/Today: 1h 15m/)).toBeTruthy()
  })

  it('renders widget in red with 00:00 when NO tasks in kanban', async () => {
    mockApi.goals.get.mockResolvedValue([])

    const { container } = render(<TaskbarWidget />)

    await act(async () => {
      await Promise.resolve()
    })

    // Timer text is 00:00 with red / rose color
    const timerSpan = screen.getByText('00:00')
    expect(timerSpan.className).toContain('text-rose-600')
    expect(timerSpan.className).not.toContain('text-amber-600')
    expect(timerSpan.className).not.toContain('text-emerald-600')

    // Ring stroke is red (#f43f5e)
    const circles = container.querySelectorAll('circle')
    const progressRing = circles[1]
    expect(progressRing.getAttribute('stroke')).toBe('#f43f5e')

    // Tooltip and button indicate no tasks in progress
    expect(screen.getAllByLabelText(/No tasks in/i).length).toBeGreaterThan(0)
    const actionBtn = container.querySelector('button[title="No Tasks in Progress"]')
    expect(actionBtn).toBeTruthy()
    // Icon is red
    const icon = actionBtn?.querySelector('svg')
    expect(icon?.getAttribute('class')).toContain('text-rose-500')
  })

  it('actively counts up break time in red when no tasks are in progress', async () => {
    mockApi.goals.get.mockResolvedValue([])

    const startMs = 1700000000000
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(startMs)

    render(<TaskbarWidget />)

    await act(async () => {
      await Promise.resolve()
    })

    // Initially 00:00 in red
    expect(screen.getByText('00:00')).toBeTruthy()

    // Simulate 35 seconds passing with no tasks in progress
    nowSpy.mockReturnValue(startMs + 35000)

    await act(async () => {
      dataUpdatedCallback?.()
      await Promise.resolve()
    })

    // Actively counts up to 00:35 in red!
    const timerSpan = screen.getByText('00:35')
    expect(timerSpan.className).toContain('text-rose-600')

    nowSpy.mockRestore()
  })

  it('renders widget in red with 00:00 when tasks exist only in planned (not in progress)', async () => {
    mockApi.goals.get.mockResolvedValue([
      { id: 'goal-1', title: 'Complete presentation', status: 'planned' }
    ])

    const { container } = render(<TaskbarWidget />)

    await act(async () => {
      await Promise.resolve()
    })

    const timerSpan = screen.getByText('00:00')
    expect(timerSpan.className).toContain('text-rose-600')
    const circles = container.querySelectorAll('circle')
    expect(circles[1].getAttribute('stroke')).toBe('#f43f5e')
    expect(screen.getAllByLabelText(/No tasks in/i).length).toBeGreaterThan(0)
    expect(container.querySelector('button[title="No Tasks in Progress"]')).toBeTruthy()
  })

  it('runs session timer and renders green when tasks are in in_progress', async () => {
    mockApi.goals.get.mockResolvedValue([
      { id: 'goal-1', title: 'Complete presentation', status: 'in_progress' }
    ])

    const { container } = render(<TaskbarWidget />)

    await act(async () => {
      await Promise.resolve()
    })

    // Timer text is running countdown with emerald green color
    const timerSpan = screen.getByText(/14:59|15:00|25:00/)
    expect(timerSpan.className).toContain('text-emerald-600')
    expect(timerSpan.className).not.toContain('text-rose-600')
    expect(timerSpan.className).not.toContain('text-amber-600')

    // Ring stroke is emerald green (#10b981)
    const circles = container.querySelectorAll('circle')
    const progressRing = circles[1]
    expect(progressRing.getAttribute('stroke')).toBe('#10b981')

    // Tooltip displays focus ready
    expect(screen.getAllByLabelText(/Focus Ready/i).length).toBeGreaterThan(0)
    const actionBtn = container.querySelector('button[title="Start Focus"]')
    expect(actionBtn).toBeTruthy()
    const icon = actionBtn?.querySelector('svg')
    expect(icon?.getAttribute('class')).toContain('text-emerald-600')
  })

  it('runs active session timer and renders green when focus session is running on a task even if dailyGoals was initially empty', async () => {
    mockApi.goals.get.mockResolvedValue([])
    mockApi.session.getState.mockResolvedValueOnce({
      isActive: true,
      isPaused: false,
      isBreak: false,
      isOvertime: false,
      goalTitle: 'test',
      secondsRemaining: 477,
      totalSeconds: 1500
    })

    const { container } = render(<TaskbarWidget />)

    await act(async () => {
      await Promise.resolve()
    })

    // Timer text is 07:57 with emerald green color
    const timerSpan = screen.getByText('07:57')
    expect(timerSpan.className).toContain('text-emerald-600')
    expect(timerSpan.className).not.toContain('text-rose-600')
    expect(timerSpan.className).not.toContain('text-amber-600')

    // Ring stroke is emerald green (#10b981)
    const circles = container.querySelectorAll('circle')
    const progressRing = circles[1]
    expect(progressRing.getAttribute('stroke')).toBe('#10b981')

    // Action button is Pause Focus with emerald green icon
    const actionBtn = container.querySelector('button[title="Pause Focus"]')
    expect(actionBtn).toBeTruthy()
    const icon = actionBtn?.querySelector('svg')
    expect(icon?.getAttribute('class')).toContain('text-emerald-600')
    expect(screen.getAllByLabelText(/Focusing: 07:57 left/i).length).toBeGreaterThan(0)
  })

  it('renders widget in red with paused time when widget timer is paused (time counts as break)', async () => {
    mockApi.goals.get.mockResolvedValue([
      { id: 'goal-1', title: 'Active task', status: 'in_progress' }
    ])

    const { container } = render(<TaskbarWidget />)

    await act(async () => {
      await Promise.resolve()
    })

    // Broadcast paused session
    act(() => {
      if (sessionCallback) {
        sessionCallback({
          isActive: true,
          isPaused: true,
          isBreak: false,
          isOvertime: false,
          goalTitle: 'Active task',
          secondsRemaining: 1200,
          totalSeconds: 1500
        })
      }
    })

    // Timer text starts red timer of pause (00:00) with red color
    const timerSpan = screen.getByText('00:00')
    expect(timerSpan.className).toContain('text-rose-600')
    expect(timerSpan.className).not.toContain('text-emerald-600')

    // Ring stroke is red (#f43f5e)
    const circles = container.querySelectorAll('circle')
    const progressRing = circles[1]
    expect(progressRing.getAttribute('stroke')).toBe('#f43f5e')

    // Action button is Resume Focus with rose/red icon
    const actionBtn = container.querySelector('button[title="Resume Focus"]')
    expect(actionBtn).toBeTruthy()
    const icon = actionBtn?.querySelector('svg')
    expect(icon?.getAttribute('class')).toContain('text-rose-500')

    // Tooltip shows paused timer and notes focus remaining time
    expect(
      screen.getAllByLabelText(
        /Focus Paused \(counts as break\): 00:00 · Noted focus time \(20:00 left\)/i
      ).length
    ).toBeGreaterThan(0)
  })

  it('renders widget in red with 00:00 when all kanban tasks are marked done', async () => {
    mockApi.goals.get.mockResolvedValue([{ id: 'goal-1', title: 'Finished task', status: 'done' }])

    const { container } = render(<TaskbarWidget />)

    await act(async () => {
      await Promise.resolve()
    })

    const timerSpan = screen.getByText('00:00')
    expect(timerSpan.className).toContain('text-rose-600')

    const circles = container.querySelectorAll('circle')
    const progressRing = circles[1]
    expect(progressRing.getAttribute('stroke')).toBe('#f43f5e')
    expect(screen.getAllByLabelText(/No tasks in/i).length).toBeGreaterThan(0)
    expect(container.querySelector('button[title="No Tasks in Progress"]')).toBeTruthy()
  })

  it('dynamically switches from red 00:00 to green running timer when task is added to in_progress via onDataUpdated', async () => {
    mockApi.goals.get.mockResolvedValueOnce([])

    const { container } = render(<TaskbarWidget />)

    await act(async () => {
      await Promise.resolve()
    })

    // Initially red 00:00 (no tasks)
    expect(screen.getByText('00:00').className).toContain('text-rose-600')
    let circles = container.querySelectorAll('circle')
    expect(circles[1].getAttribute('stroke')).toBe('#f43f5e')
    expect(container.querySelector('button[title="No Tasks in Progress"]')).toBeTruthy()

    // User adds a task to kanban
    mockApi.goals.get.mockResolvedValueOnce([
      { id: 'goal-2', title: 'Review pull requests', status: 'in_progress' }
    ])

    await act(async () => {
      if (dataUpdatedCallback) {
        dataUpdatedCallback({ goalDates: ['2026-11-04'] })
      }
      await Promise.resolve()
    })

    // Transitions to green running session timer
    const timerSpan = screen.getByText(/14:59|15:00|25:00/)
    expect(timerSpan.className).toContain('text-emerald-600')
    expect(timerSpan.className).not.toContain('text-rose-600')
    circles = container.querySelectorAll('circle')
    expect(circles[1].getAttribute('stroke')).toBe('#10b981')
    expect(container.querySelector('button[title="Start Focus"]')).toBeTruthy()
  })

  it('dynamically switches from red 00:00 to green when onDataUpdated includes todayMinutes payload', async () => {
    mockApi.goals.get.mockResolvedValueOnce([])

    const { container } = render(<TaskbarWidget />)

    await act(async () => {
      await Promise.resolve()
    })

    // Initially red 00:00 (no tasks)
    expect(screen.getByText('00:00').className).toContain('text-rose-600')
    expect(container.querySelector('button[title="No Tasks in Progress"]')).toBeTruthy()

    // Main process broadcasts dataUpdated with todayMinutes and goalDates
    mockApi.goals.get.mockResolvedValueOnce([
      { id: 'goal-inprogress', title: 'Task in progress', status: 'in_progress' }
    ])

    await act(async () => {
      if (dataUpdatedCallback) {
        dataUpdatedCallback({ goalDates: ['2026-11-05'], todayMinutes: 30 })
      }
      await Promise.resolve()
    })

    // Transitions to green running/ready session timer
    const timerSpan = screen.getByText(/14:59|15:00|25:00/)
    expect(timerSpan.className).toContain('text-emerald-600')
    expect(timerSpan.className).not.toContain('text-rose-600')
    const circles = container.querySelectorAll('circle')
    expect(circles[1].getAttribute('stroke')).toBe('#10b981')
    expect(container.querySelector('button[title="Start Focus"]')).toBeTruthy()
  })

  it('dynamically transitions from green to yellow on pause and back to green on resume', async () => {
    mockApi.goals.get.mockResolvedValue([
      { id: 'goal-1', title: 'Feature development', status: 'in_progress' }
    ])

    const { container } = render(<TaskbarWidget />)

    await act(async () => {
      await Promise.resolve()
    })

    // 1. Running session (green)
    act(() => {
      if (sessionCallback) {
        sessionCallback({
          isActive: true,
          isPaused: false,
          isBreak: false,
          isOvertime: false,
          secondsRemaining: 1500,
          totalSeconds: 1500
        })
      }
    })

    expect(screen.getByText('25:00').className).toContain('text-emerald-600')
    let circles = container.querySelectorAll('circle')
    expect(circles[1].getAttribute('stroke')).toBe('#10b981')

    // 2. Pause session (red, counts as break)
    act(() => {
      if (sessionCallback) {
        sessionCallback({
          isActive: true,
          isPaused: true,
          isBreak: false,
          isOvertime: false,
          secondsRemaining: 1400,
          totalSeconds: 1500
        })
      }
    })

    expect(screen.getByText('00:00').className).toContain('text-rose-600')
    circles = container.querySelectorAll('circle')
    expect(circles[1].getAttribute('stroke')).toBe('#f43f5e')

    // 3. Resume session (green)
    act(() => {
      if (sessionCallback) {
        sessionCallback({
          isActive: true,
          isPaused: false,
          isBreak: false,
          isOvertime: false,
          secondsRemaining: 1390,
          totalSeconds: 1500
        })
      }
    })

    expect(screen.getByText('23:10').className).toContain('text-emerald-600')
    circles = container.querySelectorAll('circle')
    expect(circles[1].getAttribute('stroke')).toBe('#10b981')
  })

  it('starts and ticks red timer of pause and notes green task remaining time when paused with pauseStartEpoch', async () => {
    mockApi.goals.get.mockResolvedValue([
      { id: 'goal-1', title: 'Code Refactor', status: 'in_progress' }
    ])

    render(<TaskbarWidget />)

    await act(async () => {
      await Promise.resolve()
    })

    const fifteenSecondsAgo = Date.now() - 15 * 1000

    act(() => {
      if (sessionCallback) {
        sessionCallback({
          isActive: true,
          isPaused: true,
          isBreak: false,
          isOvertime: false,
          goalTitle: 'Code Refactor',
          secondsRemaining: 900,
          totalSeconds: 1500,
          pauseStartEpoch: fifteenSecondsAgo
        })
      }
    })

    // Red pause timer displays 00:15
    const timerSpan = screen.getByText('00:15')
    expect(timerSpan.className).toContain('text-rose-600')

    // Tooltip notes the focus remaining seconds
    expect(
      screen.getAllByLabelText(
        /Focus Paused \(counts as break\): 00:15 · Noted focus time \(15:00 left\)/i
      ).length
    ).toBeGreaterThan(0)
  })

  it('only fetches 60 days heatmap on mount and does NOT re-fetch heatmap on data update events', async () => {
    mockApi.logs.getHeatmap.mockClear()

    render(<TaskbarWidget />)

    await act(async () => {
      await Promise.resolve()
    })

    // fetchStreak runs once on mount
    expect(mockApi.logs.getHeatmap).toHaveBeenCalledTimes(1)

    // Trigger onDataUpdated multiple times (~15x/day)
    await act(async () => {
      if (dataUpdatedCallback) {
        dataUpdatedCallback()
        dataUpdatedCallback({ todayMinutes: 60 })
        dataUpdatedCallback({ goalDates: ['2026-11-06'] })
        dataUpdatedCallback({ logDates: ['2026-11-06'] })
      }
      await Promise.resolve()
    })

    // getHeatmap must NOT be re-called on data update events
    expect(mockApi.logs.getHeatmap).toHaveBeenCalledTimes(1)
  })

  it('re-fetches heatmap streak when date rolls over', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockApi.logs.getHeatmap.mockClear()

    render(<TaskbarWidget />)

    await act(async () => {
      await Promise.resolve()
    })

    expect(mockApi.logs.getHeatmap).toHaveBeenCalledTimes(1)

    // Advance time past midnight / day cutoff to trigger day rollover
    await act(async () => {
      vi.advanceTimersByTime(25 * 60 * 60 * 1000)
      await Promise.resolve()
    })

    // Should have re-fetched streak on day rollover
    expect(mockApi.logs.getHeatmap.mock.calls.length).toBeGreaterThanOrEqual(2)

    vi.useRealTimers()
  })

  it('renders identical synchronized count-up timer in red during AFK break', async () => {
    const afkStartEpoch = Date.now() - 370 * 1000 // 6 minutes 10 seconds ago (06:10)
    mockApi.session.getState = vi.fn().mockResolvedValue({
      isActive: true,
      isBreak: true,
      isAfk: true,
      isPaused: false,
      isOvertime: false,
      secondsRemaining: 370,
      totalSeconds: 0,
      afkBreakStartEpoch: afkStartEpoch,
      startedAt: new Date(afkStartEpoch).toISOString()
    })

    render(<TaskbarWidget />)

    await act(async () => {
      await Promise.resolve()
    })

    // Verify timer displays 06:10 (exactly matching PromptWindow AFK dialog)
    expect(screen.getByText('06:10')).toBeTruthy()

    // Verify red timer styling
    const timerEl = screen.getByText('06:10')
    expect(timerEl.className).toContain('text-rose-600')

    // Verify play button is displayed for resuming
    const button = screen.getByRole('button', { name: /afk break: 06:10/i })
    expect(button).toBeTruthy()
  })
})
