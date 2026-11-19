import { describe, it, expect } from 'vitest'
import { calculateMergedDurationMs, mergeLogs, autoClipSequentialLogs } from '../lib/timelineUtils'
import { LogEntry } from '../../../shared/types'

describe('TimelineList — calculateMergedDurationMs', () => {
  it('returns 0 for empty intervals list', () => {
    expect(calculateMergedDurationMs([])).toBe(0)
  })

  it('filters out invalid intervals where endMs <= startMs', () => {
    const intervals = [
      { startMs: 1000, endMs: 500 },
      { startMs: 2000, endMs: 2000 },
      { startMs: 3000, endMs: 4000 }
    ]
    expect(calculateMergedDurationMs(intervals)).toBe(1000)
  })

  it('calculates exact duration for non-overlapping disjoint intervals', () => {
    const intervals = [
      { startMs: 1000, endMs: 2000 }, // 1000ms
      { startMs: 3000, endMs: 5000 } // 2000ms
    ]
    expect(calculateMergedDurationMs(intervals)).toBe(3000)
  })

  it('merges overlapping intervals and avoids inflating active duration', () => {
    // Two 30-minute logs with a 15-minute overlap (10:00-10:30 and 10:15-10:45)
    const base = 1700000000000
    const m = 60 * 1000
    const intervals = [
      { startMs: base, endMs: base + 30 * m },
      { startMs: base + 15 * m, endMs: base + 45 * m }
    ]
    // Naive sum = 60m, merged = 45m
    expect(calculateMergedDurationMs(intervals)).toBe(45 * m)
  })

  it('merges completely contained intervals within longer intervals', () => {
    const base = 1700000000000
    const m = 60 * 1000
    const intervals = [
      { startMs: base, endMs: base + 60 * m }, // 60 min session
      { startMs: base + 10 * m, endMs: base + 30 * m }, // 20 min subtask
      { startMs: base + 40 * m, endMs: base + 50 * m } // 10 min subtask
    ]
    expect(calculateMergedDurationMs(intervals)).toBe(60 * m)
  })

  it('merges adjacent intervals that touch at the exact boundary', () => {
    const intervals = [
      { startMs: 1000, endMs: 2000 },
      { startMs: 2000, endMs: 3000 }
    ]
    expect(calculateMergedDurationMs(intervals)).toBe(2000)
  })

  it('correctly sorts and merges out-of-order intervals', () => {
    const intervals = [
      { startMs: 5000, endMs: 7000 },
      { startMs: 1000, endMs: 3000 },
      { startMs: 2500, endMs: 4000 }
    ]
    // [1000-4000] (3000ms) + [5000-7000] (2000ms) = 5000ms
    expect(calculateMergedDurationMs(intervals)).toBe(5000)
  })

  it('safely handles large datasets without call-stack overflow', () => {
    const count = 70000
    const intervals = Array.from({ length: count }, (_, i) => ({
      startMs: i * 1000,
      endMs: i * 1000 + 500
    }))
    expect(() => calculateMergedDurationMs(intervals)).not.toThrow()
    const maxEnd = intervals.reduce((max, p) => (p.endMs > max ? p.endMs : max), 0)
    expect(maxEnd).toBe(count * 1000 - 500)
  })
})

describe('TimelineList — mergeLogs', () => {
  it('preserves full productiveMinutes when merging entry with explicit productiveMinutes and entry with undefined productiveMinutes', () => {
    const logA: LogEntry = {
      id: 'log-1',
      timestamp: '2026-10-31T10:15:00.000Z',
      startedAt: '2026-10-31T10:00:00.000Z',
      endedAt: '2026-10-31T10:15:00.000Z',
      durationMinutes: 15,
      productiveMinutes: 15,
      productivity: 'productive',
      text: 'Deep work on compiler'
    }

    const logB: LogEntry = {
      id: 'log-2',
      timestamp: '2026-10-31T10:30:00.000Z',
      startedAt: '2026-10-31T10:15:00.000Z',
      endedAt: '2026-10-31T10:30:00.000Z',
      durationMinutes: 15,
      // productiveMinutes omitted/undefined
      productivity: 'productive',
      text: 'Deep work on compiler'
    }

    const merged = mergeLogs(logA, logB)
    expect(merged.durationMinutes).toBe(30)
    expect(merged.productiveMinutes).toBe(30)
  })

  it('keeps productiveMinutes undefined for merged break sessions', () => {
    const breakA: LogEntry = {
      id: 'b-1',
      timestamp: '2026-10-31T11:05:00.000Z',
      startedAt: '2026-10-31T11:00:00.000Z',
      endedAt: '2026-10-31T11:05:00.000Z',
      durationMinutes: 5,
      productivity: 'break',
      text: 'Break'
    }

    const breakB: LogEntry = {
      id: 'b-2',
      timestamp: '2026-10-31T11:10:00.000Z',
      startedAt: '2026-10-31T11:05:00.000Z',
      endedAt: '2026-10-31T11:10:00.000Z',
      durationMinutes: 5,
      productivity: 'break',
      text: 'Break'
    }

    const merged = mergeLogs(breakA, breakB)
    expect(merged.durationMinutes).toBe(10)
    expect(merged.productiveMinutes).toBeUndefined()
    expect(merged.productivity).toBe('break')
  })

  it('correctly calculates productiveMinutes and productivity when merging productive entry with break entry', () => {
    const prod: LogEntry = {
      id: 'p-1',
      timestamp: '2026-10-31T11:25:00.000Z',
      startedAt: '2026-10-31T11:00:00.000Z',
      endedAt: '2026-10-31T11:25:00.000Z',
      durationMinutes: 25,
      productiveMinutes: 25,
      productivity: 'productive',
      text: 'Coding session'
    }

    const rest: LogEntry = {
      id: 'b-1',
      timestamp: '2026-10-31T11:30:00.000Z',
      startedAt: '2026-10-31T11:25:00.000Z',
      endedAt: '2026-10-31T11:30:00.000Z',
      durationMinutes: 5,
      productivity: 'break',
      text: 'Quick stretch'
    }

    const merged = mergeLogs(prod, rest)
    expect(merged.durationMinutes).toBe(30)
    expect(merged.productiveMinutes).toBe(25)
    expect(merged.productivity).toBe('productive')
  })
})

describe('TimelineList — autoClipSequentialLogs', () => {
  it('returns empty array when passed empty logs', () => {
    expect(autoClipSequentialLogs([])).toEqual([])
  })

  it('leaves disjoint non-overlapping logs untouched', () => {
    const logs: LogEntry[] = [
      {
        id: 't-1',
        timestamp: '2026-11-07T01:00:00.000Z',
        startedAt: '2026-11-07T00:30:00.000Z',
        endedAt: '2026-11-07T01:00:00.000Z',
        durationMinutes: 30,
        productivity: 'productive',
        text: 'Task 1'
      },
      {
        id: 'b-1',
        timestamp: '2026-11-07T01:15:00.000Z',
        startedAt: '2026-11-07T01:05:00.000Z',
        endedAt: '2026-11-07T01:15:00.000Z',
        durationMinutes: 10,
        productivity: 'break',
        text: 'Break'
      }
    ]
    const result = autoClipSequentialLogs(logs)
    expect(result.length).toBe(2)
    expect(result[0].id).toBe('t-1')
    expect(result[1].id).toBe('b-1')
  })

  it('clips task endedAt to break startedAt when break starts during active task', () => {
    const logs: LogEntry[] = [
      {
        id: 'task-1',
        timestamp: '2026-11-07T01:00:00.000Z',
        startedAt: '2026-11-07T00:30:00.000Z',
        endedAt: '2026-11-07T01:00:00.000Z',
        durationMinutes: 30,
        productivity: 'productive',
        text: 'Feature dev'
      },
      {
        id: 'break-1',
        timestamp: '2026-11-07T01:15:00.000Z',
        startedAt: '2026-11-07T00:45:00.000Z',
        endedAt: '2026-11-07T01:15:00.000Z',
        durationMinutes: 30,
        productivity: 'break',
        text: 'Break'
      }
    ]

    const result = autoClipSequentialLogs(logs)
    expect(result.length).toBe(2)

    // Task should be clipped from 00:30 to 00:45 (15 mins)
    expect(result[0].id).toBe('task-1')
    expect(result[0].startedAt).toBe('2026-11-07T00:30:00.000Z')
    expect(result[0].endedAt).toBe('2026-11-07T00:45:00.000Z')
    expect(result[0].durationMinutes).toBe(15)

    // Break starts exactly at 00:45:00.000Z
    expect(result[1].id).toBe('break-1')
    expect(result[1].startedAt).toBe('2026-11-07T00:45:00.000Z')
    expect(result[1].endedAt).toBe('2026-11-07T01:15:00.000Z')
    expect(result[1].durationMinutes).toBe(30)
  })

  it('splits task around break when break occurs strictly in the middle of a task', () => {
    const logs: LogEntry[] = [
      {
        id: 'task-long',
        timestamp: '2026-11-07T02:00:00.000Z',
        startedAt: '2026-11-07T01:00:00.000Z',
        endedAt: '2026-11-07T02:00:00.000Z',
        durationMinutes: 60,
        productivity: 'productive',
        text: 'Long Focus Session'
      },
      {
        id: 'break-mid',
        timestamp: '2026-11-07T01:30:00.000Z',
        startedAt: '2026-11-07T01:20:00.000Z',
        endedAt: '2026-11-07T01:30:00.000Z',
        durationMinutes: 10,
        productivity: 'break',
        text: 'Break'
      }
    ]

    const result = autoClipSequentialLogs(logs)
    expect(result.length).toBe(3)

    // 1. Task Part 1: 01:00 -> 01:20 (20m)
    expect(result[0].startedAt).toBe('2026-11-07T01:00:00.000Z')
    expect(result[0].endedAt).toBe('2026-11-07T01:20:00.000Z')
    expect(result[0].durationMinutes).toBe(20)

    // 2. Break: 01:20 -> 01:30 (10m)
    expect(result[1].startedAt).toBe('2026-11-07T01:20:00.000Z')
    expect(result[1].endedAt).toBe('2026-11-07T01:30:00.000Z')
    expect(result[1].durationMinutes).toBe(10)

    // 3. Task Part 2: 01:30 -> 02:00 (30m)
    expect(result[2].startedAt).toBe('2026-11-07T01:30:00.000Z')
    expect(result[2].endedAt).toBe('2026-11-07T02:00:00.000Z')
    expect(result[2].durationMinutes).toBe(30)
  })

  it('correctly handles user screenshot scenario (overlapping task and break)', () => {
    // Green task: 12:33 AM -> 12:46 AM (13 mins)
    // Red break: 12:36 AM -> 12:55 AM (19 mins)
    // Green task continuation: 12:55 AM -> 12:56 AM (1 min)
    const logs: LogEntry[] = [
      {
        id: 'task-1',
        timestamp: '2026-11-07T00:46:00.000Z',
        startedAt: '2026-11-07T00:33:00.000Z',
        endedAt: '2026-11-07T00:46:00.000Z',
        durationMinutes: 13,
        productivity: 'productive',
        text: 'test123'
      },
      {
        id: 'break-1',
        timestamp: '2026-11-07T00:55:00.000Z',
        startedAt: '2026-11-07T00:36:00.000Z',
        endedAt: '2026-11-07T00:55:00.000Z',
        durationMinutes: 19,
        productivity: 'break',
        text: 'Break'
      },
      {
        id: 'task-2',
        timestamp: '2026-11-07T00:56:00.000Z',
        startedAt: '2026-11-07T00:55:00.000Z',
        endedAt: '2026-11-07T00:56:00.000Z',
        durationMinutes: 1,
        productivity: 'productive',
        text: 'test123'
      }
    ]

    const result = autoClipSequentialLogs(logs)
    expect(result.length).toBe(3)

    // Segment 1: Task 1 clipped to 00:33 -> 00:36 (3m)
    expect(result[0].id).toBe('task-1')
    expect(result[0].startedAt).toBe('2026-11-07T00:33:00.000Z')
    expect(result[0].endedAt).toBe('2026-11-07T00:36:00.000Z')
    expect(result[0].durationMinutes).toBe(3)

    // Segment 2: Break 00:36 -> 00:55 (19m)
    expect(result[1].id).toBe('break-1')
    expect(result[1].startedAt).toBe('2026-11-07T00:36:00.000Z')
    expect(result[1].endedAt).toBe('2026-11-07T00:55:00.000Z')
    expect(result[1].durationMinutes).toBe(19)

    // Segment 3: Task 2 00:55 -> 00:56 (1m)
    expect(result[2].id).toBe('task-2')
    expect(result[2].startedAt).toBe('2026-11-07T00:55:00.000Z')
    expect(result[2].endedAt).toBe('2026-11-07T00:56:00.000Z')
    expect(result[2].durationMinutes).toBe(1)
  })
})
