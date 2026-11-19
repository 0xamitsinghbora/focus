import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TaskbarManager } from '../taskbarManager'
import { SessionTimerPayload } from '../../shared/types'

describe('TaskbarManager', () => {
  let mockWindow: any
  let mockTrayGenerator: any
  let mockScheduler: any
  let manager: TaskbarManager

  beforeEach(() => {
    mockWindow = {
      isDestroyed: vi.fn().mockReturnValue(false),
      setTitle: vi.fn(),
      setProgressBar: vi.fn(),
      setThumbnailToolTip: vi.fn(),
      setOverlayIcon: vi.fn(),
      flashFrame: vi.fn(),
      on: vi.fn(),
      removeListener: vi.fn()
    }

    mockTrayGenerator = {
      updateStatus: vi.fn()
    }

    mockScheduler = {
      getStatus: vi.fn().mockReturnValue({
        intervalMinutes: 15,
        currentBlockStartedAt: new Date(Date.now() - 300000).toISOString(),
        nextPromptTime: new Date(Date.now() + 600000).toISOString(),
        isPendingPrompt: false
      })
    }

    manager = new TaskbarManager(mockWindow, mockTrayGenerator, mockScheduler)
  })

  afterEach(() => {
    manager.destroy()
    vi.restoreAllMocks()
  })

  it('updates taskbar and tray when active focus session is received', () => {
    const payload: SessionTimerPayload = {
      isActive: true,
      isPaused: false,
      isBreak: false,
      isOvertime: false,
      goalTitle: 'Code Review',
      secondsRemaining: 1200,
      totalSeconds: 1500
    }

    manager.updateSession(payload)

    expect(mockWindow.setTitle).toHaveBeenCalledWith('20:00 - Code Review | focus')
    expect(mockWindow.setProgressBar).toHaveBeenCalledWith(0.2, { mode: 'normal' })
    expect(mockTrayGenerator.updateStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        tooltip: 'Focus: 20:00 remaining - Code Review',
        menuLabel: 'Focusing: Code Review (20:00)'
      })
    )
  })

  it('sets paused mode on taskbar progress and pauses title', () => {
    const payload: SessionTimerPayload = {
      isActive: true,
      isPaused: true,
      isBreak: false,
      isOvertime: false,
      goalTitle: 'Code Review',
      secondsRemaining: 1200,
      totalSeconds: 1500
    }

    manager.updateSession(payload)

    expect(mockWindow.setTitle).toHaveBeenCalledWith('20:00 (Paused) - Code Review | focus')
    expect(mockWindow.setProgressBar).toHaveBeenCalledWith(0.2, { mode: 'paused' })
  })

  it('sets error mode on taskbar progress when overtime', () => {
    const payload: SessionTimerPayload = {
      isActive: true,
      isPaused: false,
      isBreak: false,
      isOvertime: true,
      goalTitle: 'Code Review',
      secondsRemaining: -90,
      totalSeconds: 1500
    }

    manager.updateSession(payload)

    expect(mockWindow.setTitle).toHaveBeenCalledWith('+01:30 (Overtime) - Code Review | focus')
    expect(mockWindow.setProgressBar).toHaveBeenCalledWith(1, { mode: 'error' })
  })

  it('sets error mode (red) on taskbar progress when in break mode', () => {
    const payload: SessionTimerPayload = {
      isActive: true,
      isPaused: false,
      isBreak: true,
      isOvertime: false,
      secondsRemaining: 240,
      totalSeconds: 300
    }

    manager.updateSession(payload)

    expect(mockWindow.setTitle).toHaveBeenCalledWith('04:00 - Break | focus')
    expect(mockWindow.setProgressBar).toHaveBeenCalledWith(0.2, { mode: 'error' })
  })

  it('flashes window frame when seconds reach zero', () => {
    const payload: SessionTimerPayload = {
      isActive: true,
      isPaused: false,
      isBreak: false,
      isOvertime: true,
      goalTitle: 'Code Review',
      secondsRemaining: 0,
      totalSeconds: 1500
    }

    manager.updateSession(payload)

    expect(mockWindow.flashFrame).toHaveBeenCalledWith(true)
  })

  it('displays live idle check-in timer on taskbar title and tray while clearing progress bar when session is inactive', () => {
    const payload: SessionTimerPayload = {
      isActive: false,
      isPaused: false,
      isBreak: false,
      isOvertime: false,
      secondsRemaining: 0,
      totalSeconds: 0
    }

    manager.updateSession(payload)

    expect(mockWindow.setTitle).toHaveBeenCalledWith(expect.stringContaining('Next session'))
    expect(mockWindow.setProgressBar).toHaveBeenCalledWith(-1)
    if (process.platform === 'win32') {
      expect(mockWindow.setOverlayIcon).toHaveBeenCalledWith(null, '')
    }
    expect(mockTrayGenerator.updateStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        tooltip: expect.stringContaining('Next session in'),
        icon: null
      })
    )
  })

  it('falls back cleanly to default title when scheduler is not available', () => {
    const noSchedulerManager = new TaskbarManager(mockWindow, mockTrayGenerator, undefined)
    noSchedulerManager.applyIdle()

    expect(mockWindow.setTitle).toHaveBeenCalledWith('focus')
    expect(mockWindow.setProgressBar).toHaveBeenCalledWith(-1)
    noSchedulerManager.destroy()
  })

  it('deduplicates title and progress updates when session state is identical', () => {
    const payload: SessionTimerPayload = {
      isActive: true,
      isPaused: false,
      isBreak: false,
      isOvertime: false,
      goalTitle: 'Code Review',
      secondsRemaining: 1200,
      totalSeconds: 1500
    }

    manager.updateSession(payload)
    expect(mockWindow.setTitle).toHaveBeenCalledTimes(1)
    expect(mockWindow.setProgressBar).toHaveBeenCalledTimes(1)

    // Second identical update should NOT invoke native setTitle or setProgressBar again
    manager.updateSession(payload)
    expect(mockWindow.setTitle).toHaveBeenCalledTimes(1)
    expect(mockWindow.setProgressBar).toHaveBeenCalledTimes(1)
  })

  it('supports dynamic window getter and survives window closing or recreation', () => {
    let currentWin: any = mockWindow
    const dynamicManager = new TaskbarManager(() => currentWin, mockTrayGenerator, mockScheduler)

    const payload: SessionTimerPayload = {
      isActive: true,
      isPaused: false,
      isBreak: false,
      isOvertime: false,
      goalTitle: 'Architecture Sync',
      secondsRemaining: 900,
      totalSeconds: 1500
    }

    dynamicManager.updateSession(payload)
    expect(mockWindow.setTitle).toHaveBeenCalledWith('15:00 - Architecture Sync | focus')

    // Simulate window destruction
    currentWin = null
    expect(() => dynamicManager.updateSession(payload)).not.toThrow()

    // Simulate recreated window
    const newWindow = {
      isDestroyed: vi.fn().mockReturnValue(false),
      setTitle: vi.fn(),
      setProgressBar: vi.fn(),
      setThumbnailToolTip: vi.fn(),
      setOverlayIcon: vi.fn(),
      flashFrame: vi.fn(),
      on: vi.fn(),
      removeListener: vi.fn()
    }
    currentWin = newWindow

    dynamicManager.updateSession({ ...payload, secondsRemaining: 840 })
    expect(newWindow.setTitle).toHaveBeenCalledWith('14:00 - Architecture Sync | focus')
    expect(mockWindow.removeListener).toHaveBeenCalledWith('focus', expect.any(Function))
    expect(newWindow.on).toHaveBeenCalledWith('focus', expect.any(Function))

    // Verify focus event triggers flashFrame(false)
    const focusCallback = newWindow.on.mock.calls.find((c: any[]) => c[0] === 'focus')?.[1]
    expect(focusCallback).toBeDefined()
    focusCallback()
    expect(newWindow.flashFrame).toHaveBeenCalledWith(false)

    dynamicManager.destroy()
    expect(newWindow.removeListener).toHaveBeenCalledWith('focus', expect.any(Function))
  })
})
