import { describe, it, expect } from 'vitest'
import { getLogThemeConfig } from '../lib/timelineTheme'
import { LogEntry, DailyGoal } from '../../../shared/types'

describe('getLogThemeConfig', () => {
  it('returns red for break sessions', () => {
    const breakLog: LogEntry = {
      id: '1',
      timestamp: new Date().toISOString(),
      text: 'Taking a 15-min coffee break',
      productivity: 'break'
    }
    const config = getLogThemeConfig(breakLog)
    expect(config.bar).toBe('bg-apple-red')
    expect(config.dot).toBe('bg-apple-red')
    expect(config.label).toBe('Break')
    expect(config.badge).toContain('text-apple-red')
  })

  it('returns yellow (apple-amber) for unassigned / general sessions', () => {
    const generalLog: LogEntry = {
      id: '2',
      timestamp: new Date().toISOString(),
      text: 'Surfing references and miscellaneous reading'
    }
    const config = getLogThemeConfig(generalLog)
    expect(config.bar).toBe('bg-apple-amber')
    expect(config.dot).toBe('bg-apple-amber')
    expect(config.label).toBe('Other')
    expect(config.badge).toContain('text-apple-amber')
  })

  it('returns default task green for goals without custom group theme', () => {
    const taskLog: LogEntry = {
      id: '3',
      timestamp: new Date().toISOString(),
      text: 'Working on frontend',
      goalId: 'g1',
      goalTitle: 'Frontend task'
    }
    const goals: DailyGoal[] = [
      {
        id: 'g1',
        title: 'Frontend task',
        date: '2026-10-27',
        status: 'in_progress',
        createdAt: new Date().toISOString()
      }
    ]
    const config = getLogThemeConfig(taskLog, goals)
    expect(config.bar).toBe('bg-apple-green')
    expect(config.dot).toBe('bg-apple-green')
    expect(config.label).toBe('Task')
  })

  it('returns task group color scheme when goal has a group theme', () => {
    const taskLog: LogEntry = {
      id: '4',
      timestamp: new Date().toISOString(),
      text: 'Writing unit tests',
      goalId: 'g2',
      goalTitle: 'Unit Testing'
    }
    const goals: DailyGoal[] = [
      {
        id: 'g2',
        title: 'Unit Testing',
        groupTag: 'Backend',
        groupColor: 'purple',
        date: '2026-10-27',
        status: 'in_progress',
        createdAt: new Date().toISOString()
      }
    ]
    const config = getLogThemeConfig(taskLog, goals)
    expect(config.bar).toBe('bg-purple-500')
    expect(config.dot).toBe('bg-purple-500')
    expect(config.badge).toContain('text-purple-700')
    expect(config.label).toBe('Backend')
  })

  it('does not classify tasks containing substring break (e.g. Breakfast, breakpoint) as break', () => {
    const breakfastLog: LogEntry = {
      id: '5',
      timestamp: new Date().toISOString(),
      text: 'Breakfast with the team',
      productivity: 'productive'
    }
    const config = getLogThemeConfig(breakfastLog)
    expect(config.label).not.toBe('Break')
    expect(config.bar).not.toBe('bg-apple-red')

    const breakpointLog: LogEntry = {
      id: '6',
      timestamp: new Date().toISOString(),
      text: 'Fix breakpoint issue in layout'
    }
    const config2 = getLogThemeConfig(breakpointLog)
    expect(config2.label).not.toBe('Break')
    expect(config2.bar).not.toBe('bg-apple-red')
  })

  it('respects productivity: productive even if text contains whole word break', () => {
    const productiveLog: LogEntry = {
      id: '7',
      timestamp: new Date().toISOString(),
      text: 'Analyze circuit break pattern in microservices',
      productivity: 'productive'
    }
    const config = getLogThemeConfig(productiveLog)
    expect(config.label).not.toBe('Break')
    expect(config.bar).not.toBe('bg-apple-red')
  })

  it('matches user flow rules: task done -> task color, something else -> yellow, break / paused -> red', () => {
    const doneTask: DailyGoal = {
      id: 'done-task-1',
      title: 'Deploy to production',
      groupTag: 'Ops',
      groupColor: 'indigo',
      status: 'done',
      date: '2026-11-04',
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString()
    }
    const doneTaskLog: LogEntry = {
      id: 'log-done',
      timestamp: new Date().toISOString(),
      text: 'Deploy to production',
      goalId: 'done-task-1',
      productivity: 'productive'
    }
    const doneConfig = getLogThemeConfig(doneTaskLog, [doneTask])
    expect(doneConfig.bar).toBe('bg-indigo-500')

    const otherLog: LogEntry = {
      id: 'log-other',
      timestamp: new Date().toISOString(),
      text: 'Spontaneous client sync',
      productivity: 'productive'
    }
    const otherConfig = getLogThemeConfig(otherLog, [doneTask])
    expect(otherConfig.bar).toBe('bg-apple-amber')
    expect(otherConfig.badge).toContain('text-apple-amber')

    const breakLog: LogEntry = {
      id: 'log-break',
      timestamp: new Date().toISOString(),
      text: 'Break',
      productivity: 'break'
    }
    const breakConfig = getLogThemeConfig(breakLog, [doneTask])
    expect(breakConfig.bar).toBe('bg-apple-red')
    expect(breakConfig.badge).toContain('text-apple-red')

    const pausedBreakLog: LogEntry = {
      id: 'log-paused-break',
      timestamp: new Date().toISOString(),
      text: 'Break',
      productivity: 'break',
      durationMinutes: 10
    }
    const pausedConfig = getLogThemeConfig(pausedBreakLog, [doneTask])
    expect(pausedConfig.bar).toBe('bg-apple-red')
  })

  it('returns white color scheme for meditation and didDotReset logs', () => {
    const tratakaLog: LogEntry = {
      id: 'log-dot',
      timestamp: new Date().toISOString(),
      text: 'Meditation',
      didDotReset: true
    }
    const config1 = getLogThemeConfig(tratakaLog)
    expect(config1.bar).toBe('bg-white')
    expect(config1.dot).toContain('bg-white')
    expect(config1.label).toBe('Meditation')

    const meditationLog: LogEntry = {
      id: 'log-meditation',
      timestamp: new Date().toISOString(),
      text: 'Meditation'
    }
    const config2 = getLogThemeConfig(meditationLog)
    expect(config2.bar).toBe('bg-white')
    expect(config2.label).toBe('Meditation')
  })
})
