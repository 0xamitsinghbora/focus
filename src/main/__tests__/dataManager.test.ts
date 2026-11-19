import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import os from 'os'
import path from 'path'
import fs from 'fs'
import { AppSettings } from '../../shared/types'

let testDir: string

beforeEach(() => {
  testDir = path.join(
    os.tmpdir(),
    `focus-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  )
  fs.mkdirSync(testDir, { recursive: true })
  vi.stubEnv('FOCUS_TEST_USER_DATA', testDir)
})

afterEach(() => {
  if (dm) dm.getDb().close()
  try {
    fs.rmSync(testDir, { recursive: true, force: true })
  } catch {}
})

// Re-mock app.getPath to use the unique test dir
vi.mock('electron', () => ({
  app: {
    getPath: () => testDir,
    setLoginItemSettings: () => {}
  },
  ipcMain: { handle: () => {}, on: () => {} },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (s: string) => Buffer.from(s),
    decryptString: (b: Buffer) => b.toString()
  }
}))

import { DataManager } from '../dataManager'

let dm: DataManager

beforeEach(() => {
  dm = new DataManager()
})

describe('DataManager — Settings', () => {
  it('returns default settings when none are saved', () => {
    const s = dm.getSettings()
    expect(s.reminderIntervalMinutes).toBe(45)
    expect(s.openAtLogin).toBe(true)
    expect(s.theme).toBe('system')
  })

  it('persists and retrieves settings', () => {
    dm.setSettings({ reminderIntervalMinutes: 30, openAtLogin: false, theme: 'dark' })
    const s = dm.getSettings()
    expect(s.reminderIntervalMinutes).toBe(30)
    expect(s.openAtLogin).toBe(false)
    expect(s.theme).toBe('dark')
  })

  it('merges partial settings with defaults', () => {
    dm.setSettings({ reminderIntervalMinutes: 15, openAtLogin: true })
    const s = dm.getSettings()
    expect(s.reminderIntervalMinutes).toBe(15)
    expect(s.theme).toBe('system')
  })

  it('sanitizes and clamps settings boundaries and ignores unknown keys', () => {
    // Non-positive interval should be sanitized to default (45)
    dm.setSettings({
      reminderIntervalMinutes: 0,
      dayCutoffHour: 25,
      openAtLogin: true,
      unknownArbitraryKey: 'malicious'
    } as unknown as AppSettings)
    const s = dm.getSettings()
    expect(s.reminderIntervalMinutes).toBe(45)
    expect(s.dayCutoffHour).toBe(0)
    expect((s as Record<string, unknown>).unknownArbitraryKey).toBeUndefined()

    // Valid boundary values
    dm.setSettings({
      reminderIntervalMinutes: 10,
      dayCutoffHour: 4,
      openAtLogin: false
    })
    const s2 = dm.getSettings()
    expect(s2.reminderIntervalMinutes).toBe(10)
    expect(s2.dayCutoffHour).toBe(4)
  })

  it('patchSettings atomically updates only specified fields while preserving existing settings', () => {
    dm.setSettings({
      reminderIntervalMinutes: 25,
      openAtLogin: false,
      theme: 'dark',
      collapsedColumns: { planned: true, in_progress: false, done: false }
    })

    const patched = dm.patchSettings({
      collapsedColumns: { planned: false, in_progress: false, done: false }
    })

    expect(patched.collapsedColumns).toEqual({ planned: false, in_progress: false, done: false })
    expect(patched.reminderIntervalMinutes).toBe(25)
    expect(patched.openAtLogin).toBe(false)
    expect(patched.theme).toBe('dark')

    const reloaded = dm.getSettings()
    expect(reloaded.collapsedColumns).toEqual({ planned: false, in_progress: false, done: false })
    expect(reloaded.reminderIntervalMinutes).toBe(25)
  })

  it('patchSettings deeply merges nested dictionaries like collapsedColumns and groupColors', () => {
    dm.setSettings({
      reminderIntervalMinutes: 30,
      openAtLogin: true,
      collapsedColumns: { planned: true, in_progress: false, done: true },
      groupColors: { frontend: 'blue', backend: 'purple' }
    })

    const patched = dm.patchSettings({
      collapsedColumns: { in_progress: true } as any,
      groupColors: { mobile: 'teal' } as any
    })

    expect(patched.collapsedColumns).toEqual({ planned: true, in_progress: true, done: true })
    expect(patched.groupColors).toEqual({
      frontend: 'blue',
      backend: 'purple',
      mobile: 'teal'
    })
    expect(patched.reminderIntervalMinutes).toBe(30)
    expect(patched.openAtLogin).toBe(true)

    const reloaded = dm.getSettings()
    expect(reloaded.collapsedColumns).toEqual({ planned: true, in_progress: true, done: true })
    expect(reloaded.groupColors).toEqual({
      frontend: 'blue',
      backend: 'purple',
      mobile: 'teal'
    })
  })
})

describe('DataManager — Logs', () => {
  it('appends and retrieves logs', async () => {
    await dm.appendLog('2026-01-15', {
      id: 'log-1',
      timestamp: '2026-01-15T10:00:00Z',
      text: 'Working on code'
    })

    const logs = await dm.getLogs('2026-01-15')
    expect(logs).toHaveLength(1)
    expect(logs[0].id).toBe('log-1')
    expect(logs[0].text).toBe('Working on code')
  })

  it('returns empty array for dates with no logs', async () => {
    const logs = await dm.getLogs('2099-12-31')
    expect(logs).toEqual([])
  })

  it('setLogs upserts and removes stale entries', async () => {
    await dm.appendLog('2026-01-15', {
      id: 'log-1',
      timestamp: '2026-01-15T10:00:00Z',
      text: 'First'
    })
    await dm.appendLog('2026-01-15', {
      id: 'log-2',
      timestamp: '2026-01-15T11:00:00Z',
      text: 'Second'
    })

    await dm.setLogs('2026-01-15', [
      { id: 'log-2', timestamp: '2026-01-15T11:00:00Z', text: 'Updated second' },
      { id: 'log-3', timestamp: '2026-01-15T12:00:00Z', text: 'Third' }
    ])

    const logs = await dm.getLogs('2026-01-15')
    expect(logs).toHaveLength(2)
    expect(logs.map((l) => l.id).sort()).toEqual(['log-2', 'log-3'])
    expect(logs.find((l) => l.id === 'log-2')!.text).toBe('Updated second')
  })

  it('validates date format on write', async () => {
    await expect(
      dm.appendLog('not-a-date', {
        id: 'x',
        timestamp: '2026-01-15T10:00:00Z',
        text: 'test'
      })
    ).rejects.toThrow('Invalid date')
  })

  it('preserves zero values for durationMinutes', async () => {
    await dm.appendLog('2026-01-15', {
      id: 'log-zero',
      timestamp: '2026-01-15T10:00:00Z',
      text: 'Zero duration',
      durationMinutes: 0,
      productiveMinutes: 0
    })

    const logs = await dm.getLogs('2026-01-15')
    const log = logs.find((l) => l.id === 'log-zero')!
    expect(log.durationMinutes).toBe(0)
    expect(log.productiveMinutes).toBe(0)
  })
})

describe('DataManager — Daily Goals', () => {
  it('adds and retrieves goals', async () => {
    const goal = await dm.addGoal('2026-01-15', 'Write tests', 60)
    expect(goal.id).toBeDefined()
    expect(goal.title).toBe('Write tests')
    expect(goal.status).toBe('planned')
    expect(goal.targetMinutes).toBe(60)

    const goals = await dm.getGoals('2026-01-15')
    expect(goals).toHaveLength(1)
    expect(goals[0].id).toBe(goal.id)
  })

  it('assigns strictly ascending sortOrder by default when not specified', async () => {
    const g1 = await dm.addGoal('2026-01-15', 'Goal 1')
    const g2 = await dm.addGoal('2026-01-15', 'Goal 2')
    const g3 = await dm.addGoal('2026-01-15', 'Goal 3')
    const gCustom = await dm.addGoal(
      '2026-01-15',
      'Goal Custom',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      5000
    )

    expect(g1.sortOrder).toBe(1000)
    expect(g2.sortOrder).toBe(2000)
    expect(g3.sortOrder).toBe(3000)
    expect(gCustom.sortOrder).toBe(5000)

    const gNext = await dm.addGoal('2026-01-15', 'Goal Next')
    expect(gNext.sortOrder).toBe(6000)
  })

  it('updates goal status', async () => {
    const goal = await dm.addGoal('2026-01-15', 'Test goal')
    const updated = await dm.updateGoal('2026-01-15', { ...goal, status: 'done' })
    expect(updated.status).toBe('done')
    expect(updated.completedAt).toBeDefined()

    const goals = await dm.getGoals('2026-01-15')
    expect(goals[0].status).toBe('done')
  })

  it('updates multiple goals in a single transaction with updateGoals', async () => {
    const g1 = await dm.addGoal('2026-01-15', 'Task 1')
    const g2 = await dm.addGoal('2026-01-15', 'Task 2')
    const g3 = await dm.addGoal('2026-01-15', 'Task 3')

    const updatedBatch = await dm.updateGoals([
      { ...g1, sortOrder: 1500, status: 'in_progress' },
      { ...g2, sortOrder: 500 },
      { ...g3, sortOrder: 2500, groupTag: 'Urgent' }
    ])

    expect(updatedBatch).toHaveLength(3)
    expect(updatedBatch[0].sortOrder).toBe(1500)
    expect(updatedBatch[0].status).toBe('in_progress')
    expect(updatedBatch[1].sortOrder).toBe(500)
    expect(updatedBatch[2].groupTag).toBe('Urgent')

    const persisted = await dm.getGoals('2026-01-15')
    // Remember SQLite orders by COALESCE(sortOrder, 1000000000) ASC
    expect(persisted.map((g) => g.id)).toEqual([g2.id, g1.id, g3.id])
    expect(persisted[0].sortOrder).toBe(500)
    expect(persisted[1].sortOrder).toBe(1500)
    expect(persisted[2].sortOrder).toBe(2500)
  })

  it('ensures tasks with explicit sort orders greater than 1,000,000 sort before unassigned sort order tasks', async () => {
    const unassigned = await dm.addGoal('2026-01-16', 'Unassigned Task')
    dm.getDb().prepare('UPDATE daily_goals SET sortOrder = NULL WHERE id = ?').run(unassigned.id)
    const explicitHigh = await dm.addGoal('2026-01-16', 'High Sort Order Task')
    await dm.updateGoals([{ ...explicitHigh, sortOrder: 5_000_000 }])

    const goals = await dm.getGoals('2026-01-16')
    expect(goals.map((g) => g.id)).toEqual([explicitHigh.id, unassigned.id])
  })

  it('handles updateGoals with empty array', async () => {
    const result = await dm.updateGoals([])
    expect(result).toEqual([])
  })

  it('deletes goals', async () => {
    const goal = await dm.addGoal('2026-01-15', 'To delete')
    await dm.deleteGoal(goal.id)
    const goals = await dm.getGoals('2026-01-15')
    expect(goals).toHaveLength(0)
  })

  it('preserves soft-deleted state when updateGoal is called without restore', async () => {
    const goal = await dm.addGoal('2026-01-15', 'Soft deleted goal')
    await dm.deleteGoal(goal.id)

    // Attempting to update a soft-deleted goal without explicit restore should retain deletedAt
    const updated = await dm.updateGoal('2026-01-15', { ...goal, title: 'Attempted resurrection' })
    expect(updated.deletedAt).toBeDefined()

    // It should not appear in active goals
    const activeGoals = await dm.getGoals('2026-01-15')
    expect(activeGoals.find((g) => g.id === goal.id)).toBeUndefined()

    // It should still appear in deleted goals
    const deletedGoals = await dm.getDeletedGoals()
    expect(deletedGoals.find((g) => g.id === goal.id)).toBeDefined()
  })

  it('preserves soft-deleted state when updateGoals is called without restore', async () => {
    const goal = await dm.addGoal('2026-01-15', 'Batch soft deleted goal')
    await dm.deleteGoal(goal.id)

    const updated = await dm.updateGoals([{ ...goal, title: 'Batch resurrection attempt' }])
    expect(updated[0].deletedAt).toBeDefined()

    const activeGoals = await dm.getGoals('2026-01-15')
    expect(activeGoals.find((g) => g.id === goal.id)).toBeUndefined()

    const deletedGoals = await dm.getDeletedGoals()
    expect(deletedGoals.find((g) => g.id === goal.id)).toBeDefined()
  })

  it('deletes multiple goals in a single transaction with deleteGoals', async () => {
    const g1 = await dm.addGoal('2026-01-15', 'Batch 1')
    const g2 = await dm.addGoal('2026-01-15', 'Batch 2')
    const affected = await dm.deleteGoals([g1.id, g2.id])
    expect(affected).toContain('2026-01-15')
    const goals = await dm.getGoals('2026-01-15')
    expect(goals).toHaveLength(0)
  })

  it('handles deleteGoals with empty array', async () => {
    const affected = await dm.deleteGoals([])
    expect(affected).toEqual([])
  })

  it('carries goals to a new date and soft-deletes source goal to prevent duplicates', async () => {
    const goal = await dm.addGoal(
      '2026-01-15',
      'Carry me',
      45,
      undefined,
      '2026-01-15T18:00:00',
      'Important notes here',
      '2026-01-15T17:00:00',
      'daily',
      'work',
      'blue',
      1000
    )
    const carried = await dm.carryGoal('2026-01-15', '2026-01-16', goal.id)
    expect(carried.date).toBe('2026-01-16')
    expect(carried.title).toBe('Carry me')
    expect(carried.carriedFromDate).toBe('2026-01-15')
    expect(carried.carriedFromGoalId).toBe(goal.id)
    expect(carried.id).not.toBe(goal.id)
    expect(carried.note).toBe('Important notes here')
    expect(carried.deadline).toBe('2026-01-15T18:00:00')
    expect(carried.remindAt).toBe('2026-01-15T17:00:00')
    expect(carried.repeat).toBe('daily')
    expect(carried.groupTag).toBe('work')
    expect(carried.groupColor).toBe('blue')
    expect(carried.sortOrder).toBe(1000)

    const sourceGoals = await dm.getGoals('2026-01-15')
    expect(sourceGoals).toHaveLength(0)

    // Verify carried goal does not pollute trash
    const trash = await dm.getDeletedGoals()
    expect(trash.map((g) => g.id)).not.toContain(goal.id)

    // Verify emptyTrash does not purge carried goals
    await dm.emptyTrash()
    const rawGoal = dm.getDb().prepare('SELECT * FROM daily_goals WHERE id = ?').get(goal.id) as {
      carriedToDate?: string
    }
    expect(rawGoal).toBeDefined()
    expect(rawGoal.carriedToDate).toBe('2026-01-16')

    // Calling carryGoal again is idempotent
    const carriedAgain = await dm.carryGoal('2026-01-15', '2026-01-16', goal.id)
    expect(carriedAgain.id).toBe(carried.id)
    const targetGoals = await dm.getGoals('2026-01-16')
    expect(targetGoals).toHaveLength(1)
  })

  it('carries multiple goals atomically in a single batch with carryGoals', async () => {
    const g1 = await dm.addGoal('2026-01-20', 'Batch Task 1', 30)
    const g2 = await dm.addGoal('2026-01-20', 'Batch Task 2', 45)
    const g3 = await dm.addGoal('2026-01-20', 'Batch Task 3', 60)

    const carried = await dm.carryGoals('2026-01-20', '2026-01-21', [g1.id, g2.id])
    expect(carried).toHaveLength(2)
    expect(carried[0].title).toBe('Batch Task 1')
    expect(carried[0].date).toBe('2026-01-21')
    expect(carried[0].carriedFromGoalId).toBe(g1.id)
    expect(carried[1].title).toBe('Batch Task 2')
    expect(carried[1].date).toBe('2026-01-21')
    expect(carried[1].carriedFromGoalId).toBe(g2.id)
    expect(carried[1].sortOrder).toBeGreaterThan(carried[0].sortOrder || 0)

    // Source date should now only have g3 remaining as active
    const sourceGoals = await dm.getGoals('2026-01-20')
    expect(sourceGoals).toHaveLength(1)
    expect(sourceGoals[0].id).toBe(g3.id)

    // Target date should have the 2 carried goals
    const targetGoals = await dm.getGoals('2026-01-21')
    expect(targetGoals).toHaveLength(2)

    // Idempotency: re-carrying should return existing targets without duplicating
    const reCarried = await dm.carryGoals('2026-01-20', '2026-01-21', [g1.id, g2.id])
    expect(reCarried).toHaveLength(2)
    const targetGoalsAfter = await dm.getGoals('2026-01-21')
    expect(targetGoalsAfter).toHaveLength(2)

    // Empty list returns empty array
    const empty = await dm.carryGoals('2026-01-20', '2026-01-21', [])
    expect(empty).toEqual([])
  })

  it('aggregates logged focus minutes across carried goal ancestor chains', async () => {
    // Day 1: create goal 1, log 30 minutes
    const goal1 = await dm.addGoal('2026-02-01', 'Multi-day feature')
    await dm.appendLog('2026-02-01', {
      id: 'log-1',
      timestamp: '2026-02-01T10:00:00Z',
      text: 'Working on feature part 1',
      goalId: goal1.id,
      goalTitle: goal1.title,
      productivity: 'productive',
      durationMinutes: 30,
      productiveMinutes: 30
    })

    // Carry goal 1 to Day 2 -> goal 2
    const goal2 = await dm.carryGoal('2026-02-01', '2026-02-02', goal1.id)
    expect(goal2.carriedFromGoalId).toBe(goal1.id)

    // Day 2: log 15 minutes on goal 2
    await dm.appendLog('2026-02-02', {
      id: 'log-2',
      timestamp: '2026-02-02T11:00:00Z',
      text: 'Working on feature part 2',
      goalId: goal2.id,
      goalTitle: goal2.title,
      productivity: 'productive',
      durationMinutes: 15,
      productiveMinutes: 15
    })

    // Carry goal 2 to Day 3 -> goal 3
    const goal3 = await dm.carryGoal('2026-02-02', '2026-02-03', goal2.id)
    expect(goal3.carriedFromGoalId).toBe(goal2.id)

    const minutesMap = await dm.getGoalLoggedMinutesMap()
    // goal 1: 30
    expect(minutesMap[goal1.id]).toBe(30)
    // goal 2: 30 (from goal 1) + 15 = 45
    expect(minutesMap[goal2.id]).toBe(45)
    // goal 3: 45 (from goal 1 + goal 2) + 0 = 45
    expect(minutesMap[goal3.id]).toBe(45)

    // Updating goals via setGoals (e.g. from cloud sync) invalidates the cache
    const goal4 = { ...goal3, id: 'goal-sync-4', carriedFromGoalId: goal1.id }
    await dm.setGoals('2026-02-03', [goal3, goal4], true)
    const refreshedMap = await dm.getGoalLoggedMinutesMap()
    expect(refreshedMap[goal4.id]).toBe(30)
  })

  it('excludes break logs from goal logged minutes in getGoalLoggedMinutesMap', async () => {
    const goal = await dm.addGoal('2026-02-05', 'Feature implementation')
    await dm.appendLog('2026-02-05', {
      id: 'log-feat-1',
      timestamp: '2026-02-05T10:00:00.000Z',
      text: 'Working on feature',
      goalId: goal.id,
      productivity: 'productive',
      durationMinutes: 40,
      productiveMinutes: 40
    })

    // Log a break associated with the same goal
    await dm.appendLog('2026-02-05', {
      id: 'log-break-1',
      timestamp: '2026-02-05T10:45:00.000Z',
      text: 'Coffee break',
      goalId: goal.id,
      productivity: 'break',
      durationMinutes: 20
    })

    const minutesMap = await dm.getGoalLoggedMinutesMap()
    // Break must not be counted; only 40 productive minutes
    expect(minutesMap[goal.id]).toBe(40)
  })

  it('computes logged minutes scoped to specific target goal IDs', async () => {
    const goalA = await dm.addGoal('2026-02-06', 'Task Alpha')
    const goalB = await dm.addGoal('2026-02-06', 'Task Beta')
    await dm.appendLog('2026-02-06', {
      id: 'log-alpha',
      timestamp: '2026-02-06T10:00:00.000Z',
      text: 'Alpha work',
      goalId: goalA.id,
      productivity: 'productive',
      productiveMinutes: 25
    })
    await dm.appendLog('2026-02-06', {
      id: 'log-beta',
      timestamp: '2026-02-06T11:00:00.000Z',
      text: 'Beta work',
      goalId: goalB.id,
      productivity: 'productive',
      productiveMinutes: 50
    })

    const scopedMap = await dm.getGoalLoggedMinutesMap([goalA.id])
    expect(scopedMap[goalA.id]).toBe(25)
    expect(scopedMap[goalB.id]).toBeUndefined()
  })

  it('marking an older goal done on today board keeps it on the board with current completedAt', async () => {
    const today = dm.getTodayDate()
    const oldGoal = await dm.addGoal('2025-11-15', 'Old task completed today')
    const updated = await dm.updateGoal(today, {
      ...oldGoal,
      status: 'done'
    })
    expect(updated.completedAt).toBeDefined()
    const board = await dm.getBoardGoals(today)
    expect(board.map((g) => g.id)).toContain(oldGoal.id)
  })

  it('updateGoal tracks targetDate and existingDate in dirty targets without undefined', async () => {
    const today = dm.getTodayDate()
    const oldGoal = await dm.addGoal('2025-11-15', 'Old task date tracking')
    dm.consumeDirtySyncTargets() // clear dirty targets
    await dm.updateGoal(today, {
      ...oldGoal,
      title: 'Old task updated title'
    })
    const dirty = dm.getDirtySyncTargets()
    expect(dirty.goalDates).toContain(today)
    expect(dirty.goalDates).toContain('2025-11-15')
    expect(dirty.goalDates).not.toContain(undefined as any)
  })

  it('marking an older goal done via batch updateGoals keeps it on the board with current completedAt', async () => {
    const today = dm.getTodayDate()
    const oldGoal = await dm.addGoal('2025-11-15', 'Old task batch completed today')
    const updated = await dm.updateGoals([
      {
        ...oldGoal,
        status: 'done'
      }
    ])
    expect(updated[0].completedAt).toBeDefined()
    expect(new Date(updated[0].completedAt!).getFullYear()).toBe(new Date().getFullYear())
    const board = await dm.getBoardGoals(today)
    expect(board.map((g) => g.id)).toContain(oldGoal.id)
  })

  it('getBoardGoals keeps active goals regardless of age while only showing done goals completed today', async () => {
    // 60-day old unfinished goal
    const oldGoal = await dm.addGoal('2025-11-15', 'Old unfinished project')
    // 60-day old completed goal
    const oldDoneGoal = await dm.addGoal(
      '2025-11-15',
      'Old completed project',
      30,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'done'
    )
    // Goal completed today
    const doneToday = await dm.addGoal(
      '2026-01-15',
      'Done today',
      20,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'done'
    )
    await dm.updateGoal('2026-01-15', { ...doneToday, completedAt: '2026-01-15T14:00:00.000Z' })

    const boardGoals = await dm.getBoardGoals('2026-01-15')
    const boardGoalIds = boardGoals.map((g) => g.id)

    expect(boardGoalIds).toContain(oldGoal.id)
    expect(boardGoalIds).toContain(doneToday.id)
    expect(boardGoalIds).not.toContain(oldDoneGoal.id)
  })

  it('getBoardGoals keeps active goals older than 365 days', async () => {
    // 500-day old unfinished goal
    const veryOldGoal = await dm.addGoal('2024-08-01', 'Very old planned task')
    const boardGoals = await dm.getBoardGoals('2026-01-15')
    const ids = boardGoals.map((g) => g.id)
    expect(ids).toContain(veryOldGoal.id)
  })

  it('getBoardGoals respects configurable boardHistoryHorizonDays to bound old task scan', async () => {
    // Goal from 120 days ago and goal from 30 days ago
    const ancientGoal = await dm.addGoal('2025-09-15', 'Ancient unfinished task')
    const recentGoal = await dm.addGoal('2025-12-15', 'Recent unfinished task')

    // Set horizon to 60 days
    dm.setSettings({
      reminderIntervalMinutes: 45,
      openAtLogin: false,
      boardHistoryHorizonDays: 60
    })

    const boardGoals = await dm.getBoardGoals('2026-01-15')
    const ids = boardGoals.map((g) => g.id)

    expect(ids).toContain(recentGoal.id)
    expect(ids).not.toContain(ancientGoal.id)

    // Reset settings
    dm.setSettings({
      reminderIntervalMinutes: 45,
      openAtLogin: false,
      boardHistoryHorizonDays: undefined
    })
  })

  it('getBoardGoals does not include future-dated goals on today board', async () => {
    const todayGoal = await dm.addGoal('2026-01-15', 'Today active task')
    const futureGoal = await dm.addGoal('2026-01-16', 'Tomorrow task')
    const nextWeekGoal = await dm.addGoal('2026-01-22', 'Next week task')

    const boardGoals = await dm.getBoardGoals('2026-01-15')
    const ids = boardGoals.map((g) => g.id)

    expect(ids).toContain(todayGoal.id)
    expect(ids).not.toContain(futureGoal.id)
    expect(ids).not.toContain(nextWeekGoal.id)
  })

  it('getBoardGoals respects dayCutoffHour for goals completed after midnight', async () => {
    dm.setSettings({ reminderIntervalMinutes: 45, openAtLogin: false, dayCutoffHour: 4 })
    // Goal completed at 2:30 AM on 2026-01-16 (falls into 2026-01-15 day session when cutoff is 4)
    const lateGoal = await dm.addGoal(
      '2026-01-15',
      'Late night task',
      30,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'done'
    )
    const lateTime = new Date('2026-01-16T02:30:00')
    await dm.updateGoal('2026-01-15', { ...lateGoal, completedAt: lateTime.toISOString() })

    const boardGoals = await dm.getBoardGoals('2026-01-15')
    const ids = boardGoals.map((g) => g.id)
    expect(ids).toContain(lateGoal.id)
  })

  it('rejects empty goal titles', async () => {
    await expect(dm.addGoal('2026-01-15', '   ')).rejects.toThrow('Goal title is required')
  })

  it('validates date on addGoal', async () => {
    await expect(dm.addGoal('bad', 'test')).rejects.toThrow('Invalid date')
  })

  it('validates date on updateGoal', async () => {
    const goal = await dm.addGoal('2026-01-15', 'Valid Goal')
    await expect(dm.updateGoal('bad-date', goal)).rejects.toThrow('Invalid date')
    await expect(dm.updateGoal('2026-01-15', { ...goal, date: 'not-a-date' })).rejects.toThrow(
      'Invalid goal.date'
    )
  })

  it('preserves targetMinutes of zero', async () => {
    const goal = await dm.addGoal('2026-01-15', 'Zero target', 0)
    expect(goal.targetMinutes).toBeUndefined()
  })

  it('setGoals upserts and removes stale entries', async () => {
    const g1 = await dm.addGoal('2026-01-15', 'Goal 1')
    await dm.addGoal('2026-01-15', 'Goal 2')

    await dm.setGoals('2026-01-15', [
      {
        ...g1,
        title: 'Goal 1 Updated',
        status: 'in_progress',
        date: '2026-01-15',
        createdAt: g1.createdAt
      }
    ])

    const goals = await dm.getGoals('2026-01-15')
    expect(goals).toHaveLength(1)
    expect(goals[0].title).toBe('Goal 1 Updated')
    expect(goals[0].status).toBe('in_progress')
  })

  it('retrieves deleted goals and restores soft-deleted goals', async () => {
    const goal1 = await dm.addGoal('2026-01-15', 'Goal to delete')
    const goal2 = await dm.addGoal('2026-01-15', 'Goal to keep')

    await dm.deleteGoal(goal1.id)

    const activeGoals = await dm.getGoals('2026-01-15')
    expect(activeGoals.map((g) => g.id)).not.toContain(goal1.id)
    expect(activeGoals.map((g) => g.id)).toContain(goal2.id)

    const deletedGoals = await dm.getDeletedGoals()
    expect(deletedGoals.map((g) => g.id)).toContain(goal1.id)
    expect(deletedGoals.find((g) => g.id === goal1.id)?.deletedAt).toBeDefined()

    const restored = await dm.restoreGoal(goal1.id)
    expect(restored).not.toBeNull()
    expect(restored?.deletedAt).toBeUndefined()
    expect(restored?.restoredAt).toBeDefined()

    const afterRestore = await dm.getGoals('2026-01-15')
    expect(afterRestore.map((g) => g.id)).toContain(goal1.id)
    expect(afterRestore.find((g) => g.id === goal1.id)?.restoredAt).toBeDefined()

    const afterRestoreDeleted = await dm.getDeletedGoals()
    expect(afterRestoreDeleted.map((g) => g.id)).not.toContain(goal1.id)
  })

  it('restores multiple soft-deleted goals in a single transaction with restoreGoals', async () => {
    const goalA = await dm.addGoal('2026-01-16', 'Batch Goal A')
    const goalB = await dm.addGoal('2026-01-16', 'Batch Goal B')
    await dm.deleteGoals([goalA.id, goalB.id])

    const activeBefore = await dm.getGoals('2026-01-16')
    expect(activeBefore).toHaveLength(0)

    const restored = await dm.restoreGoals([goalA.id, goalB.id, 'non-existent-id'])
    expect(restored).toHaveLength(2)
    expect(restored.map((g) => g.id)).toEqual(expect.arrayContaining([goalA.id, goalB.id]))
    expect(restored.every((g) => !g.deletedAt && Boolean(g.restoredAt))).toBe(true)

    const activeAfter = await dm.getGoals('2026-01-16')
    expect(activeAfter).toHaveLength(2)

    // Empty array case
    const emptyRestored = await dm.restoreGoals([])
    expect(emptyRestored).toEqual([])
  })

  it('permanently deletes single soft-deleted goal with hardDeleteGoal', async () => {
    const goal = await dm.addGoal('2026-01-15', 'Permanently delete me')
    // Active goal cannot be hard-deleted directly
    const directHardDelete = await dm.hardDeleteGoal(goal.id)
    expect(directHardDelete.success).toBe(false)

    // Soft delete first
    await dm.deleteGoal(goal.id)
    const inTrash = await dm.getDeletedGoals()
    expect(inTrash.map((g) => g.id)).toContain(goal.id)

    // Now hard delete
    const hardDeleted = await dm.hardDeleteGoal(goal.id)
    expect(hardDeleted.success).toBe(true)
    expect(hardDeleted.date).toBe('2026-01-15')

    const purgedIds = await dm.getPurgedIds()
    expect(purgedIds.has(goal.id)).toBe(true)

    const afterHardDeleteTrash = await dm.getDeletedGoals()
    expect(afterHardDeleteTrash.map((g) => g.id)).not.toContain(goal.id)

    const allGoals = await dm.getGoals('2026-01-15')
    expect(allGoals.map((g) => g.id)).not.toContain(goal.id)
  })

  it('permanently deletes all soft-deleted goals with emptyTrash', async () => {
    const goalA = await dm.addGoal('2026-01-15', 'Trash item A')
    const goalB = await dm.addGoal('2026-01-15', 'Trash item B')
    const goalKeep = await dm.addGoal('2026-01-15', 'Active task keep')

    await dm.deleteGoal(goalA.id)
    await dm.deleteGoal(goalB.id)

    const trashBefore = await dm.getDeletedGoals()
    expect(trashBefore.map((g) => g.id)).toContain(goalA.id)
    expect(trashBefore.map((g) => g.id)).toContain(goalB.id)

    const { count: removedCount, affectedDates } = await dm.emptyTrash()
    expect(removedCount).toBeGreaterThanOrEqual(2)
    expect(affectedDates).toContain('2026-01-15')

    const purgedIds = await dm.getPurgedIds()
    expect(purgedIds.has(goalA.id)).toBe(true)
    expect(purgedIds.has(goalB.id)).toBe(true)

    const trashAfter = await dm.getDeletedGoals()
    expect(trashAfter.map((g) => g.id)).not.toContain(goalA.id)
    expect(trashAfter.map((g) => g.id)).not.toContain(goalB.id)

    const activeGoals = await dm.getGoals('2026-01-15')
    expect(activeGoals.map((g) => g.id)).toContain(goalKeep.id)
  })

  it('purges soft-deleted records older than specified retention days', async () => {
    const rawDb = dm.getDb()
    const thirtyFiveDaysAgo = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString()
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()

    // Create daily goals
    const oldGoal = await dm.addGoal('2026-01-15', 'Old deleted goal')
    const recentGoal = await dm.addGoal('2026-01-15', 'Recent deleted goal')
    await dm.deleteGoal(oldGoal.id)
    await dm.deleteGoal(recentGoal.id)
    rawDb
      .prepare('UPDATE daily_goals SET deletedAt = ? WHERE id = ?')
      .run(thirtyFiveDaysAgo, oldGoal.id)
    rawDb
      .prepare('UPDATE daily_goals SET deletedAt = ? WHERE id = ?')
      .run(fiveDaysAgo, recentGoal.id)

    // Create logs
    const oldLog = { id: 'old-log', timestamp: '2026-01-15T10:00:00Z', text: 'Old log' }
    const recentLog = { id: 'recent-log', timestamp: '2026-01-15T11:00:00Z', text: 'Recent log' }
    const logReferencingOldGoal = {
      id: 'log-ref-old-goal',
      timestamp: '2026-01-15T12:00:00Z',
      text: 'Log referencing old goal without goalTitle',
      goalId: oldGoal.id
    }
    await dm.appendLog('2026-01-15', oldLog)
    await dm.appendLog('2026-01-15', recentLog)
    await dm.appendLog('2026-01-15', logReferencingOldGoal)
    await dm.deleteLog(oldLog.id)
    await dm.deleteLog(recentLog.id)
    rawDb.prepare('UPDATE logs SET deletedAt = ? WHERE id = ?').run(thirtyFiveDaysAgo, oldLog.id)
    rawDb.prepare('UPDATE logs SET deletedAt = ? WHERE id = ?').run(fiveDaysAgo, recentLog.id)

    // Create inbox goals
    const oldInbox = await dm.addInboxGoal('Old inbox')
    const recentInbox = await dm.addInboxGoal('Recent inbox')
    await dm.deleteInboxGoal(oldInbox.id)
    await dm.deleteInboxGoal(recentInbox.id)
    rawDb
      .prepare('UPDATE inbox_goals SET deletedAt = ? WHERE id = ?')
      .run(thirtyFiveDaysAgo, oldInbox.id)
    rawDb
      .prepare('UPDATE inbox_goals SET deletedAt = ? WHERE id = ?')
      .run(fiveDaysAgo, recentInbox.id)

    const oldRecurring = await dm.addRecurringGoal('Old recurring', 30, '2026-01-01')
    const recentRecurring = await dm.addRecurringGoal('Recent recurring', 30, '2026-01-01')
    await dm.deleteRecurringGoal(oldRecurring.id)
    await dm.deleteRecurringGoal(recentRecurring.id)
    rawDb
      .prepare('UPDATE recurring_goals SET deletedAt = ? WHERE id = ?')
      .run(thirtyFiveDaysAgo, oldRecurring.id)
    rawDb
      .prepare('UPDATE recurring_goals SET deletedAt = ? WHERE id = ?')
      .run(fiveDaysAgo, recentRecurring.id)

    // Purge records older than 30 days
    const purgeResult = await dm.purgeSoftDeletedRecordsOlderThan(30)
    expect(purgeResult.dailyGoals).toBe(1)
    expect(purgeResult.logs).toBe(1)
    expect(purgeResult.inboxGoals).toBe(1)
    expect(purgeResult.recurringGoals).toBe(1)

    // Verify old records are hard deleted from tables
    const checkGoal = rawDb.prepare('SELECT id FROM daily_goals WHERE id = ?').get(oldGoal.id)
    const checkLog = rawDb.prepare('SELECT id FROM logs WHERE id = ?').get(oldLog.id)
    const checkInbox = rawDb.prepare('SELECT id FROM inbox_goals WHERE id = ?').get(oldInbox.id)
    const checkRecurring = rawDb
      .prepare('SELECT id FROM recurring_goals WHERE id = ?')
      .get(oldRecurring.id)
    expect(checkGoal).toBeUndefined()
    expect(checkLog).toBeUndefined()
    expect(checkInbox).toBeUndefined()
    expect(checkRecurring).toBeUndefined()

    // Verify recent records are still present (soft deleted)
    const recentGoalRow = rawDb
      .prepare('SELECT id, deletedAt FROM daily_goals WHERE id = ?')
      .get(recentGoal.id) as { id: string; deletedAt: string }
    const recentLogRow = rawDb
      .prepare('SELECT id, deletedAt FROM logs WHERE id = ?')
      .get(recentLog.id) as { id: string; deletedAt: string }
    const recentInboxRow = rawDb
      .prepare('SELECT id, deletedAt FROM inbox_goals WHERE id = ?')
      .get(recentInbox.id) as { id: string; deletedAt: string }
    const recentRecurringRow = rawDb
      .prepare('SELECT id, deletedAt FROM recurring_goals WHERE id = ?')
      .get(recentRecurring.id) as { id: string; deletedAt: string }
    expect(recentGoalRow).toBeDefined()
    expect(recentLogRow).toBeDefined()
    expect(recentInboxRow).toBeDefined()
    expect(recentRecurringRow).toBeDefined()

    // Verify orphaned log referencing oldGoal was backfilled with the deleted goal's title
    const backfilledLog = rawDb
      .prepare('SELECT id, goalId, goalTitle FROM logs WHERE id = ?')
      .get(logReferencingOldGoal.id) as { id: string; goalId: string; goalTitle: string }
    expect(backfilledLog).toBeDefined()
    expect(backfilledLog.goalTitle).toBe('Old deleted goal')

    // Verify purged_records contains purged IDs
    const purgedIds = await dm.getPurgedIds()
    expect(purgedIds.has(oldGoal.id)).toBe(true)
    expect(purgedIds.has(oldLog.id)).toBe(true)
    expect(purgedIds.has(oldInbox.id)).toBe(true)
    expect(purgedIds.has(oldRecurring.id)).toBe(true)
    expect(purgedIds.has(recentGoal.id)).toBe(false)

    // Verify dirty targets
    const dirty = dm.getDirtySyncTargets()
    expect(dirty.syncPurged).toBe(true)
    expect(dirty.syncRecurring).toBe(true)
  })

  it('preserves carried-forward daily goals while purging genuine soft-deleted trash older than retention threshold', async () => {
    const rawDb = dm.getDb()
    const thirtyFiveDaysAgo = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString()
    const oldCarried = await dm.addGoal('2026-01-01', 'Old carried task')
    await dm.carryGoal('2026-01-01', '2026-01-02', oldCarried.id)

    // Simulate genuine trashed goal
    const oldTrash = await dm.addGoal('2026-01-01', 'Old trash task')
    await dm.deleteGoal(oldTrash.id)

    // Simulate both events occurring 35 days ago
    rawDb
      .prepare('UPDATE daily_goals SET deletedAt = ? WHERE id = ?')
      .run(thirtyFiveDaysAgo, oldCarried.id)
    rawDb
      .prepare('UPDATE daily_goals SET deletedAt = ? WHERE id = ?')
      .run(thirtyFiveDaysAgo, oldTrash.id)

    const purgeResult = await dm.purgeSoftDeletedRecordsOlderThan(30)
    expect(purgeResult.dailyGoals).toBeGreaterThanOrEqual(1)

    // Genuine trash must be purged
    const checkTrash = rawDb.prepare('SELECT id FROM daily_goals WHERE id = ?').get(oldTrash.id)
    expect(checkTrash).toBeUndefined()

    // Carried goal must be preserved to protect past day reviews and cumulative log calculation trees
    const checkCarried = rawDb.prepare('SELECT id FROM daily_goals WHERE id = ?').get(oldCarried.id)
    expect(checkCarried).toBeDefined()
  })

  it('prunes stale tombstones from purged_records older than retention threshold', async () => {
    const rawDb = dm.getDb()
    const oneHundredDaysAgo = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString()
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()

    rawDb
      .prepare('INSERT INTO purged_records (id, entity, purgedAt) VALUES (?, ?, ?)')
      .run('ancient-purged-1', 'daily_goals', oneHundredDaysAgo)
    rawDb
      .prepare('INSERT INTO purged_records (id, entity, purgedAt) VALUES (?, ?, ?)')
      .run('recent-purged-1', 'daily_goals', tenDaysAgo)

    const prunedCount = await dm.prunePurgedRecordsOlderThan(90)
    expect(prunedCount).toBe(1)

    const ancientRow = rawDb
      .prepare('SELECT id FROM purged_records WHERE id = ?')
      .get('ancient-purged-1')
    const recentRow = rawDb
      .prepare('SELECT id FROM purged_records WHERE id = ?')
      .get('recent-purged-1')
    expect(ancientRow).toBeUndefined()
    expect(recentRow).toBeDefined()
  })

  it('setRecurringGoals ignores purged recurring goals during sync apply', async () => {
    const rawDb = dm.getDb()
    const purgedId = 'purged-rec-1'
    rawDb
      .prepare('INSERT INTO purged_records (id, entity, purgedAt) VALUES (?, ?, ?)')
      .run(purgedId, 'recurring_goals', new Date().toISOString())

    const goalToSync: any = {
      id: purgedId,
      title: 'Should be ignored',
      frequency: 'daily',
      startsOn: '2026-01-01',
      status: 'active',
      createdAt: new Date().toISOString()
    }
    const validGoal: any = {
      id: 'valid-rec-2',
      title: 'Should be kept',
      frequency: 'daily',
      startsOn: '2026-01-01',
      status: 'active',
      createdAt: new Date().toISOString()
    }

    await dm.setRecurringGoals([goalToSync, validGoal], true)

    const goals = await dm.getRecurringGoals()
    expect(goals.find((g) => g.id === purgedId)).toBeUndefined()
    expect(goals.find((g) => g.id === 'valid-rec-2')).toBeDefined()
  })
})

describe('DataManager — Inbox Goals', () => {
  it('adds and retrieves inbox goals', async () => {
    const item = await dm.addInboxGoal('Read a book', 'fiction or nonfiction')
    expect(item.title).toBe('Read a book')
    expect(item.note).toBe('fiction or nonfiction')
    expect(item.status).toBe('active')

    const items = await dm.getInboxGoals()
    expect(items).toHaveLength(1)
  })

  it('updates inbox goals', async () => {
    const item = await dm.addInboxGoal('Original title')
    const updated = await dm.updateInboxGoal({ ...item, title: 'New title' })
    expect(updated.title).toBe('New title')

    const items = await dm.getInboxGoals()
    expect(items[0].title).toBe('New title')
  })

  it('adds inbox goal to today as daily goal', async () => {
    const item = await dm.addInboxGoal('Inbox task')
    const goal = await dm.addInboxGoalToToday(item.id, '2026-01-15', 30)
    expect(goal.title).toBe('Inbox task')
    expect(goal.sourceInboxGoalId).toBe(item.id)
    expect(goal.targetMinutes).toBe(30)
  })
})

describe('DataManager — Recurring Goals', () => {
  it('adds and retrieves recurring goals', async () => {
    const goal = await dm.addRecurringGoal('Daily standup', 15, '2026-01-01')
    expect(goal.title).toBe('Daily standup')
    expect(goal.frequency).toBe('daily')
    expect(goal.status).toBe('active')

    const goals = await dm.getRecurringGoals()
    expect(goals).toHaveLength(1)
  })

  it('generates daily goals from recurring', async () => {
    await dm.addRecurringGoal('Daily standup', 15, '2026-01-01')
    const dailyGoals = await dm.generateTodayGoals('2026-01-15')
    expect(dailyGoals).toHaveLength(1)
    expect(dailyGoals[0].title).toBe('Daily standup')
    expect(dailyGoals[0].sourceRecurringGoalId).toBeDefined()
    expect(dailyGoals[0].updatedAt).toBeDefined()
    expect(typeof dailyGoals[0].sortOrder).toBe('number')
    expect(dailyGoals[0].sortOrder).toBe(1000)
  })

  it('does not duplicate recurring goals on second call', async () => {
    await dm.addRecurringGoal('Daily standup', 15, '2026-01-01')
    await dm.generateTodayGoals('2026-01-15')
    const secondRun = await dm.generateTodayGoals('2026-01-15')
    expect(secondRun).toHaveLength(1)
  })

  it('does not resurrect recurring goals after deletion for that day', async () => {
    await dm.addRecurringGoal('Daily standup', 15, '2026-01-01')
    const firstRun = await dm.generateTodayGoals('2026-01-15')
    expect(firstRun).toHaveLength(1)

    // User explicitly deletes today's instance
    await dm.deleteGoal(firstRun[0].id)
    const afterDelete = await dm.getGoals('2026-01-15')
    expect(afterDelete).toHaveLength(0)

    // Second call to generateTodayGoals must NOT recreate the deleted task
    const secondRun = await dm.generateTodayGoals('2026-01-15')
    expect(secondRun).toHaveLength(0)
  })

  it('handles concurrent generateTodayGoals calls without duplicates', async () => {
    await dm.addRecurringGoal('Concurrent Recurring Task', 30, '2026-01-01')

    // Fire 5 concurrent calls simultaneously
    const results = await Promise.all([
      dm.generateTodayGoals('2026-01-15'),
      dm.generateTodayGoals('2026-01-15'),
      dm.generateTodayGoals('2026-01-15'),
      dm.generateTodayGoals('2026-01-15'),
      dm.generateTodayGoals('2026-01-15')
    ])

    const allCreated = await dm.getGoals('2026-01-15')
    const matching = allCreated.filter((g) => g.title === 'Concurrent Recurring Task')
    expect(matching).toHaveLength(1)
    results.forEach((r) => {
      expect(r.filter((g) => g.title === 'Concurrent Recurring Task')).toHaveLength(1)
    })
  })

  it('skips recurring goals before startsOn', async () => {
    await dm.addRecurringGoal('Future task', 30, '2026-06-01')
    const goals = await dm.generateTodayGoals('2026-01-15')
    expect(goals).toHaveLength(0)
  })

  it('skips paused recurring goals', async () => {
    const goal = await dm.addRecurringGoal('Paused task', 30, '2026-01-01')
    await dm.updateRecurringGoal({ ...goal, status: 'paused' })
    const daily = await dm.generateTodayGoals('2026-01-15')
    expect(daily).toHaveLength(0)
  })

  it('respects weekdays frequency (generates Mon-Fri, skips Sat-Sun)', async () => {
    // 2026-01-16 is Friday (weekday)
    // 2026-01-17 is Saturday (weekend)
    // 2026-01-18 is Sunday (weekend)
    // 2026-01-19 is Monday (weekday)
    await dm.addRecurringGoal('Workday sync', 20, '2026-01-01', undefined, 'weekdays')

    const fridayGoals = await dm.generateTodayGoals('2026-01-16')
    expect(fridayGoals.map((g) => g.title)).toContain('Workday sync')

    const saturdayGoals = await dm.generateTodayGoals('2026-01-17')
    expect(saturdayGoals.map((g) => g.title)).not.toContain('Workday sync')

    const sundayGoals = await dm.generateTodayGoals('2026-01-18')
    expect(sundayGoals.map((g) => g.title)).not.toContain('Workday sync')

    const mondayGoals = await dm.generateTodayGoals('2026-01-19')
    expect(mondayGoals.map((g) => g.title)).toContain('Workday sync')
  })

  it('respects weekends frequency (generates Sat-Sun, skips Mon-Fri)', async () => {
    await dm.addRecurringGoal('Weekend hike', 60, '2026-01-01', undefined, 'weekends')

    const fridayGoals = await dm.generateTodayGoals('2026-01-16')
    expect(fridayGoals.map((g) => g.title)).not.toContain('Weekend hike')

    const saturdayGoals = await dm.generateTodayGoals('2026-01-17')
    expect(saturdayGoals.map((g) => g.title)).toContain('Weekend hike')

    const sundayGoals = await dm.generateTodayGoals('2026-01-18')
    expect(sundayGoals.map((g) => g.title)).toContain('Weekend hike')
  })

  it('respects weekly frequency (only generates on matching day of week as startsOn)', async () => {
    // 2026-01-01 is Thursday
    // 2026-01-08 is Thursday (+7 days)
    // 2026-01-09 is Friday (+8 days)
    await dm.addRecurringGoal('Weekly retro', 45, '2026-01-01', undefined, 'weekly')

    const nextThursdayGoals = await dm.generateTodayGoals('2026-01-08')
    expect(nextThursdayGoals.map((g) => g.title)).toContain('Weekly retro')

    const fridayGoals = await dm.generateTodayGoals('2026-01-09')
    expect(fridayGoals.map((g) => g.title)).not.toContain('Weekly retro')
  })

  it('catches up weekly recurring goal if the scheduled day was dormant/missed', async () => {
    // 2026-01-01 is Thursday
    // 2026-01-08 (Thursday) was dormant (app not opened)
    // 2026-01-09 (Friday) user opens app
    await dm.addRecurringGoal('Weekly retro dormant', 45, '2026-01-01', undefined, 'weekly')

    // On Friday, generateTodayGoals generates the catch-up goal for 2026-01-08 and returns it in nextDailyGoals
    const fridayGoals = await dm.generateTodayGoals('2026-01-09')
    expect(fridayGoals.map((g) => g.title)).toContain('Weekly retro dormant')
    const boardGoals = await dm.getBoardGoals('2026-01-09')
    expect(boardGoals.map((g) => g.title)).toContain('Weekly retro dormant')

    const thursdayGoals = await dm.getGoals('2026-01-08')
    expect(thursdayGoals.map((g) => g.title)).toContain('Weekly retro dormant')

    // Opening on Saturday must not duplicate the retro
    await dm.generateTodayGoals('2026-01-10')
    const satBoardGoals = await dm.getBoardGoals('2026-01-10')
    const matching = satBoardGoals.filter((g) => g.title === 'Weekly retro dormant')
    expect(matching).toHaveLength(1)
  })
})

describe('DataManager — Day Review', () => {
  it('computes productive minutes from logs', async () => {
    await dm.addGoal('2026-01-15', 'Goal A')
    const goals = await dm.getGoals('2026-01-15')
    const goalId = goals[0].id

    await dm.appendLog('2026-01-15', {
      id: 'r1',
      timestamp: '2026-01-15T10:00:00Z',
      text: 'Work block',
      goalId,
      goalTitle: 'Goal A',
      productivity: 'productive',
      durationMinutes: 45,
      productiveMinutes: 45
    })

    const review = await dm.getDayReview('2026-01-15')
    expect(review.totalProductiveMinutes).toBe(45)
    expect(review.goalBreakdown).toHaveLength(1)
    expect(review.goalBreakdown[0].productiveMinutes).toBe(45)
  })

  it('counts break time as zero productive', async () => {
    await dm.appendLog('2026-01-15', {
      id: 'b1',
      timestamp: '2026-01-15T12:00:00Z',
      text: 'Lunch break',
      productivity: 'break',
      durationMinutes: 30
    })

    const review = await dm.getDayReview('2026-01-15')
    expect(review.totalProductiveMinutes).toBe(0)
  })

  it('includes active unfinished carried goals on today board in getDayReview for today', async () => {
    const today = dm.getTodayDate()
    const yesterday = '2026-01-14'
    const oldUnfinishedGoal = await dm.addGoal(yesterday, 'Unfinished yesterday project')

    // getDayReview for today should include oldUnfinishedGoal from boardGoals
    const review = await dm.getDayReview(today)
    expect(review.goals.map((g) => g.id)).toContain(oldUnfinishedGoal.id)
    expect(review.goalBreakdown.map((b) => b.goalId)).toContain(oldUnfinishedGoal.id)
  })

  it('includes goals carried from past day in getDayReview for that past day even without logged time', async () => {
    const pastDate = '2026-01-10'
    const toDate = '2026-01-11'
    const originalGoal = await dm.addGoal(pastDate, 'Goal to be carried forward')

    // Carry the goal to the next day
    await dm.carryGoal(pastDate, toDate, originalGoal.id)

    // Verify past day review still includes the carried goal
    const review = await dm.getDayReview(pastDate)
    expect(review.goals.some((g) => g.id === originalGoal.id)).toBe(true)
    expect(review.goalBreakdown.some((b) => b.goalId === originalGoal.id)).toBe(true)
  })

  it('includes goals created on earlier dates but completed on a past review date in getDayReview', async () => {
    const createdDate = '2026-01-05'
    const completedDate = '2026-01-08'
    const goal = await dm.addGoal(createdDate, 'Goal from Jan 5 finished on Jan 8')

    // Mark it done on Jan 8
    await dm.updateGoal(createdDate, {
      ...goal,
      status: 'done',
      completedAt: `${completedDate}T14:30:00.000Z`
    })

    // Reviewing Jan 8 (which is in the past) should find the goal completed on Jan 8
    const reviewJan8 = await dm.getDayReview(completedDate)
    expect(reviewJan8.goals.some((g) => g.id === goal.id)).toBe(true)
    expect(reviewJan8.goalBreakdown.some((b) => b.goalId === goal.id)).toBe(true)
  })

  it('includes carried in-progress goals created on earlier dates with work logged on past review date in getDayReview', async () => {
    const createdDate = '2026-01-05'
    const reviewDate = '2026-01-08'
    const goal = await dm.addGoal(createdDate, 'Goal from Jan 5 worked on Jan 8')

    // User logs 30 minutes on Jan 8 to this carried goal (still in_progress)
    await dm.updateGoal(createdDate, {
      ...goal,
      status: 'in_progress'
    })
    await dm.appendLog(reviewDate, {
      id: 'log-jan8-work',
      timestamp: `${reviewDate}T10:00:00.000Z`,
      text: 'Working on architecture',
      goalId: goal.id,
      goalTitle: goal.title,
      durationMinutes: 30,
      productiveMinutes: 30,
      productivity: 'productive'
    })

    // Reviewing Jan 8 should attribute the 30 minutes to the goal instead of unassigned time
    const reviewJan8 = await dm.getDayReview(reviewDate)
    expect(reviewJan8.goals.some((g) => g.id === goal.id)).toBe(true)
    const breakdown = reviewJan8.goalBreakdown.find((b) => b.goalId === goal.id)
    expect(breakdown).toBeDefined()
    expect(breakdown?.productiveMinutes).toBe(30)
    expect(reviewJan8.otherProductiveMinutes).toBe(0)
  })
})

describe('DataManager — Heatmap', () => {
  it('returns log counts grouped by date', async () => {
    await dm.appendLog('2026-01-15', {
      id: 'h1',
      timestamp: '2026-01-15T10:00:00Z',
      text: 'A'
    })
    await dm.appendLog('2026-01-15', {
      id: 'h2',
      timestamp: '2026-01-15T11:00:00Z',
      text: 'B'
    })
    await dm.appendLog('2026-01-16', {
      id: 'h3',
      timestamp: '2026-01-16T10:00:00Z',
      text: 'C'
    })

    const heatmap = await dm.getHeatmapData()
    expect(heatmap['2026-01-15']).toBe(2)
    expect(heatmap['2026-01-16']).toBe(1)
  })

  it('excludes break logs from heatmap count so breaks do not turn heatmap green', async () => {
    await dm.appendLog('2026-02-01', {
      id: 'work-1',
      timestamp: '2026-02-01T10:00:00Z',
      text: 'Productive Work',
      productivity: 'productive'
    })
    await dm.appendLog('2026-02-01', {
      id: 'break-1',
      timestamp: '2026-02-01T10:30:00Z',
      text: 'Coffee Break',
      productivity: 'break'
    })
    await dm.appendLog('2026-02-01', {
      id: 'break-2',
      timestamp: '2026-02-01T15:00:00Z',
      text: 'Afternoon Break',
      productivity: 'break'
    })

    const heatmap = await dm.getHeatmapData()
    // Should be 1 (only the productive session), not 3!
    expect(heatmap['2026-02-01']).toBe(1)
  })

  it('includes completed daily goals in heatmap count even without log entries', async () => {
    await dm.setGoals('2026-03-10', [
      {
        id: 'completed-task-1',
        date: '2026-03-10',
        title: 'Task 1',
        status: 'done',
        createdAt: '2026-03-10T10:00:00Z'
      },
      {
        id: 'completed-task-2',
        date: '2026-03-10',
        title: 'Task 2',
        status: 'done',
        createdAt: '2026-03-10T10:00:00Z'
      },
      {
        id: 'planned-task-3',
        date: '2026-03-10',
        title: 'Task 3',
        status: 'planned',
        createdAt: '2026-03-10T10:00:00Z'
      }
    ])

    const heatmap = await dm.getHeatmapData()
    // Should be 2 (only the 2 completed tasks, not the planned one)
    expect(heatmap['2026-03-10']).toBe(2)

    const breakdown = await dm.getHeatmapBreakdown()
    expect(breakdown['2026-03-10']).toEqual({
      sessions: 0,
      completedGoals: 2,
      total: 2
    })
  })

  it('excludes deleted completed goals from heatmap count', async () => {
    await dm.setGoals('2026-03-11', [
      {
        id: 'deleted-task-1',
        date: '2026-03-11',
        title: 'Task 1',
        status: 'done',
        createdAt: '2026-03-11T10:00:00Z',
        deletedAt: '2026-03-11T12:00:00Z'
      }
    ])

    const heatmap = await dm.getHeatmapData()
    expect(heatmap['2026-03-11']).toBeUndefined()
  })

  it('attributes completed daily goals respecting night-owl dayCutoffHour', async () => {
    // Set 4 AM day cutoff
    dm.setSettings({ reminderIntervalMinutes: 45, openAtLogin: true, dayCutoffHour: 4 })

    // Task completed at 2:30 AM local time on March 15th (belongs to logical day March 14th)
    const local2am = new Date(2026, 2, 15, 2, 30, 0)
    await dm.setGoals('2026-03-14', [
      {
        id: 'night-owl-task-1',
        date: '2026-03-14',
        title: 'Night Owl Task',
        status: 'done',
        completedAt: local2am.toISOString(),
        createdAt: '2026-03-14T10:00:00Z'
      }
    ])

    const heatmap = await dm.getHeatmapData()
    expect(heatmap['2026-03-14']).toBe(1)
    expect(heatmap['2026-03-15']).toBeUndefined()
  })

  it('attributes completed daily goals by their completion date rather than creation date', async () => {
    dm.setSettings({ reminderIntervalMinutes: 45, openAtLogin: true, dayCutoffHour: 0 })

    // Goal was created on March 1st, but finished on March 15th
    await dm.setGoals('2026-03-01', [
      {
        id: 'carryover-task-1',
        date: '2026-03-01',
        title: 'Long-running task',
        status: 'done',
        completedAt: '2026-03-15T15:00:00.000Z',
        createdAt: '2026-03-01T10:00:00Z'
      }
    ])

    const heatmap = await dm.getHeatmapData()
    expect(heatmap['2026-03-15']).toBe(1)
    expect(heatmap['2026-03-01']).toBeUndefined()
  })
})

describe('DataManager — Schema Migration', () => {
  it('tracks schema version via PRAGMA user_version', () => {
    const version = dm.getDb().pragma('user_version', { simple: true }) as number
    expect(version).toBeGreaterThanOrEqual(1)
  })

  it('configures busy_timeout to 5000ms to prevent instant lock errors', () => {
    const timeout = dm.getDb().pragma('busy_timeout', { simple: true })
    expect(timeout).toBe(5000)
  })

  it('creates indexes', () => {
    const indexes = dm
      .getDb()
      .prepare("SELECT name FROM sqlite_master WHERE type='index'")
      .all() as { name: string }[]
    const indexNames = indexes.map((i) => i.name)
    expect(indexNames).toContain('idx_logs_date')
    expect(indexNames).toContain('idx_logs_goalId')
    expect(indexNames).toContain('idx_daily_goals_date')
    expect(indexNames).toContain('idx_daily_goals_sourceRecurringGoalId')
  })
})

describe('DataManager — Lifecycle and V3 Migration', () => {
  it('maintains active baseline schema version', () => {
    const version = dm.getDb().pragma('user_version', { simple: true }) as number
    expect(version).toBeGreaterThanOrEqual(1)
  })

  it('supports close() without error and closes connection and clears pending backup timer', () => {
    vi.useFakeTimers()
    const testDm = new DataManager()
    expect(testDm.isOpen()).toBe(true)
    expect(() => testDm.close()).not.toThrow()
    expect(testDm.getDb().open).toBe(false)
    expect(testDm.isOpen()).toBe(false)
    // Calling close() again on already closed connection should be idempotent and not throw
    expect(() => testDm.close()).not.toThrow()

    // Advancing timers beyond 2000ms should not execute on closed db
    expect(() => {
      vi.advanceTimersByTime(3000)
    }).not.toThrow()
    vi.useRealTimers()
  })

  it('creates rolling database backups', async () => {
    const backupPath = await dm.backupDatabase()
    expect(fs.existsSync(backupPath)).toBe(true)
    expect(backupPath).toContain('focus-backup-')
  })

  it('exports all application data in portable JSON structure', async () => {
    await dm.addGoal('2026-03-01', 'Exportable Goal')
    await dm.appendLog('2026-03-01', {
      id: 'log-export',
      timestamp: '2026-03-01T12:00:00Z',
      text: 'Exportable Log'
    })

    const exported = await dm.exportAllData()
    expect(exported.version).toBe(3)
    expect(exported.exportedAt).toBeDefined()
    expect(exported.dailyGoals.some((g) => g.title === 'Exportable Goal')).toBe(true)
    expect(exported.logs.some((l) => l.text === 'Exportable Log')).toBe(true)
    expect(exported.settings).toBeDefined()
  })

  it('sanitizes sensitive credentials like driveRefreshToken from exportAllData', async () => {
    dm.setSettings({
      ...dm.getSettings(),
      driveRefreshToken: 'secret-oauth-refresh-token-12345'
    })
    expect(dm.getSettings().driveRefreshToken).toBe('secret-oauth-refresh-token-12345')

    const exported = await dm.exportAllData()
    expect(exported.settings.driveRefreshToken).toBeUndefined()
  })

  it('imports groupColors and respects log.date on importAllData', async () => {
    const importPayload = {
      logs: [
        {
          id: 'midnight-log',
          timestamp: '2026-03-02T01:30:00.000Z',
          date: '2026-03-01', // Assigned to previous day under 4am cutoff
          text: 'Midnight study session',
          durationMinutes: 45,
          productiveMinutes: 45
        }
      ],
      groupColors: {
        research: '#06b6d4'
      }
    }

    const result = await dm.importAllData(importPayload)
    expect(result.logs).toBe(1)
    expect(result.groupColors).toBe(1)

    // Verify log is filed under 2026-03-01 (log.date) not 2026-03-02 (timestamp prefix)
    const logsOnAssignedDate = await dm.getLogs('2026-03-01')
    expect(logsOnAssignedDate.some((l) => l.id === 'midnight-log')).toBe(true)

    const logsOnCalendarDate = await dm.getLogs('2026-03-02')
    expect(logsOnCalendarDate.some((l) => l.id === 'midnight-log')).toBe(false)

    // Verify groupColor was imported into group_colors table
    const colors = dm.getGroupColors()
    expect(colors.research).toBe('#06b6d4')
  })
})

describe('DataManager — Soft Deletes & Tombstones', () => {
  it('soft-deletes goals and provides them when includeDeleted=true', async () => {
    const goal = await dm.addGoal('2026-05-01', 'Task to soft-delete')
    await dm.deleteGoal(goal.id)

    const activeGoals = await dm.getGoals('2026-05-01')
    expect(activeGoals).toHaveLength(0)

    const allGoals = await dm.getGoals('2026-05-01', true)
    expect(allGoals).toHaveLength(1)
    expect(allGoals[0].id).toBe(goal.id)
    expect(allGoals[0].deletedAt).toBeDefined()

    const activeDates = await dm.getAllGoalDates()
    expect(activeDates).not.toContain('2026-05-01')

    const allDates = await dm.getAllGoalDates(true)
    expect(allDates).toContain('2026-05-01')

    // Test getDeletedGoals pagination and getDeletedGoalsCount
    const goal2 = await dm.addGoal('2026-05-01', 'Task 2 to soft-delete')
    await dm.deleteGoal(goal2.id)

    expect(await dm.getDeletedGoalsCount()).toBeGreaterThanOrEqual(2)
    const page1 = await dm.getDeletedGoals(1, 0)
    expect(page1).toHaveLength(1)
    const page2 = await dm.getDeletedGoals(1, 1)
    expect(page2).toHaveLength(1)
    expect(page1[0].id).not.toBe(page2[0].id)

    // Search query filtering
    const searchMatch = await dm.getDeletedGoals(10, 0, 'Task 2')
    expect(searchMatch).toHaveLength(1)
    expect(searchMatch[0].id).toBe(goal2.id)
    expect(await dm.getDeletedGoalsCount('Task 2')).toBe(1)

    // Search query filtering by date
    const dateMatch = await dm.getDeletedGoals(10, 0, '2026-05-01')
    expect(dateMatch.some((g) => g.id === goal2.id)).toBe(true)
    expect(await dm.getDeletedGoalsCount('2026-05-01')).toBeGreaterThanOrEqual(1)

    const noMatch = await dm.getDeletedGoals(10, 0, 'NonExistentTaskXYZ')
    expect(noMatch).toHaveLength(0)
    expect(await dm.getDeletedGoalsCount('NonExistentTaskXYZ')).toBe(0)
  })

  it('soft-deletes logs and provides them when includeDeleted=true', async () => {
    await dm.appendLog('2026-05-01', {
      id: 'log-to-delete',
      timestamp: '2026-05-01T10:00:00.000Z',
      text: 'Temporary log'
    })

    await dm.deleteLog('log-to-delete')

    const activeLogs = await dm.getLogs('2026-05-01')
    expect(activeLogs).toHaveLength(0)

    const allLogs = await dm.getLogs('2026-05-01', true)
    expect(allLogs).toHaveLength(1)
    expect(allLogs[0].id).toBe('log-to-delete')
    expect(allLogs[0].deletedAt).toBeDefined()

    const activeDates = await dm.getAllLogDates()
    expect(activeDates).not.toContain('2026-05-01')

    const allDates = await dm.getAllLogDates(true)
    expect(allDates).toContain('2026-05-01')
  })

  it('updates existing log and marks date dirty', async () => {
    await dm.appendLog('2026-05-02', {
      id: 'log-to-edit',
      timestamp: '2026-05-02T10:00:00.000Z',
      text: 'Original Text',
      durationMinutes: 20
    })

    const updated = await dm.updateLog('2026-05-02', {
      id: 'log-to-edit',
      timestamp: '2026-05-02T10:00:00.000Z',
      text: 'Corrected Text',
      durationMinutes: 35,
      note: 'Added notes'
    })

    expect(updated.text).toBe('Corrected Text')
    expect(updated.updatedAt).toBeDefined()

    const logs = await dm.getLogs('2026-05-02')
    expect(logs).toHaveLength(1)
    expect(logs[0].text).toBe('Corrected Text')
    expect(logs[0].durationMinutes).toBe(35)
    expect(logs[0].note).toBe('Added notes')
    expect(dm.getDirtySyncTargets().logDates).toContain('2026-05-02')
  })

  it('setLogs soft-deletes omitted logs rather than hard-deleting them', async () => {
    await dm.appendLog('2026-05-02', {
      id: 'log-keep',
      timestamp: '2026-05-02T10:00:00.000Z',
      text: 'Log Keep'
    })
    await dm.appendLog('2026-05-02', {
      id: 'log-omit',
      timestamp: '2026-05-02T11:00:00.000Z',
      text: 'Log Omit'
    })

    // Now setLogs with only 'log-keep'
    await dm.setLogs('2026-05-02', [
      {
        id: 'log-keep',
        timestamp: '2026-05-02T10:00:00.000Z',
        text: 'Log Keep Updated'
      }
    ])

    const activeLogs = await dm.getLogs('2026-05-02')
    expect(activeLogs).toHaveLength(1)
    expect(activeLogs[0].id).toBe('log-keep')

    const allLogs = await dm.getLogs('2026-05-02', true)
    expect(allLogs).toHaveLength(2)
    const omitted = allLogs.find((l) => l.id === 'log-omit')
    expect(omitted).toBeDefined()
    expect(omitted?.deletedAt).toBeDefined()
  })

  it('soft-deletes inbox goals and recurring goals', async () => {
    const inbox = await dm.addInboxGoal('Inbox idea')
    await dm.deleteInboxGoal(inbox.id)
    expect(await dm.getInboxGoals()).toHaveLength(0)
    const allInbox = await dm.getInboxGoals(true)
    expect(allInbox).toHaveLength(1)
    expect(allInbox[0].deletedAt).toBeDefined()

    const recurring = await dm.addRecurringGoal('Daily standup', 15, '2026-01-01')
    await dm.deleteRecurringGoal(recurring.id)
    expect(await dm.getRecurringGoals()).toHaveLength(0)
    const allRecurring = await dm.getRecurringGoals(true)
    expect(allRecurring).toHaveLength(1)
    expect(allRecurring[0].status).toBe('deleted')
    expect(allRecurring[0].deletedAt).toBeDefined()
  })
})

describe('DataManager — Group Colors Persistence', () => {
  it('saves, retrieves, and deletes group colors in SQLite', () => {
    dm.setGroupColor('Backend', 'purple')
    dm.setGroupColor('Frontend', 'cyan')

    const colors = dm.getGroupColors()
    expect(colors['backend']).toBe('purple')
    expect(colors['frontend']).toBe('cyan')

    // Setting case-insensitive tag normalizes and updates
    dm.setGroupColor('BACKEND', 'violet')
    expect(dm.getGroupColors()['backend']).toBe('violet')

    // Delete group color
    dm.deleteGroupColor('frontend')
    expect(dm.getGroupColors()['frontend']).toBeUndefined()
    expect(dm.getGroupColors()['backend']).toBe('violet')
  })

  it('sets batch group colors and overwrites stale values', () => {
    dm.setGroupColor('Legacy', 'blue')
    dm.setGroupColors({ design: 'pink', mobile: 'teal' })

    const colors = dm.getGroupColors()
    expect(colors['design']).toBe('pink')
    expect(colors['mobile']).toBe('teal')
    expect(colors['legacy']).toBeUndefined()
  })

  it('updates groupColor across all daily goals across multiple dates', async () => {
    await dm.addGoal(
      '2026-06-01',
      'Task 1',
      30,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'Engineering',
      'blue'
    )
    await dm.addGoal(
      '2026-06-02',
      'Task 2',
      45,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'Engineering',
      'blue'
    )
    await dm.addGoal(
      '2026-06-02',
      'Task Other',
      15,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'Marketing',
      'orange'
    )

    const affected = await dm.updateGroupColorAcrossGoals('Engineering', 'purple')
    expect(affected).toContain('2026-06-01')
    expect(affected).toContain('2026-06-02')

    const day1Goals = await dm.getGoals('2026-06-01')
    expect(day1Goals.find((g) => g.title === 'Task 1')?.groupColor).toBe('purple')

    const day2Goals = await dm.getGoals('2026-06-02')
    expect(day2Goals.find((g) => g.title === 'Task 2')?.groupColor).toBe('purple')
    expect(day2Goals.find((g) => g.title === 'Task Other')?.groupColor).toBe('orange')
    expect(dm.getGroupColors()['engineering']).toBe('purple')
  })

  it('renames group across all daily goals across dates and updates color mapping', async () => {
    await dm.addGoal(
      '2026-06-05',
      'Design system',
      60,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'UX',
      'indigo'
    )
    await dm.addGoal(
      '2026-06-06',
      'User interviews',
      30,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'UX',
      'indigo'
    )
    dm.setGroupColor('ux', 'indigo')

    const affected = await dm.renameGroupAcrossGoals('UX', 'Product Design', 'cobalt')
    expect(affected).toContain('2026-06-05')
    expect(affected).toContain('2026-06-06')

    const day1Goals = await dm.getGoals('2026-06-05')
    const g1 = day1Goals.find((g) => g.title === 'Design system')
    expect(g1?.groupTag).toBe('Product Design')
    expect(g1?.groupColor).toBe('cobalt')

    const colors = dm.getGroupColors()
    expect(colors['ux']).toBeUndefined()
    expect(colors['product design']).toBe('cobalt')
  })

  it('includes groupColors in exportAllData and getSettings', async () => {
    dm.setGroupColor('Devops', 'slate')
    const settings = dm.getSettings()
    expect(settings.groupColors?.['devops']).toBe('slate')

    const exported = await dm.exportAllData()
    expect(exported.settings.groupColors?.['devops']).toBe('slate')
  })

  it('setSettings synchronizes groupColors into group_colors table', () => {
    dm.setSettings({
      ...dm.getSettings(),
      groupColors: { testing: 'teal', security: 'ruby' }
    })

    const colors = dm.getGroupColors()
    expect(colors['testing']).toBe('teal')
    expect(colors['security']).toBe('ruby')
  })

  it('persists and restores active focus session in SQLite sync_state', () => {
    expect(dm.getActiveSession()).toBeNull()

    const sessionPayload = {
      isActive: true,
      isPaused: false,
      isBreak: false,
      isOvertime: false,
      goalId: 'goal-123',
      goalTitle: 'Deep Architecture Focus',
      secondsRemaining: 1200,
      totalSeconds: 1500,
      sessionNote: 'Researching indexing strategy'
    }

    dm.setActiveSession(sessionPayload)
    const retrieved = dm.getActiveSession()
    expect(retrieved).toEqual(sessionPayload)

    // Throttles high-frequency clock ticks with identical lifecycle state
    const spy = vi.spyOn((dm.settingsRepo as any).stmts.setSyncState, 'run')
    dm.setActiveSession({ ...sessionPayload, secondsRemaining: 1199 })
    dm.setActiveSession({ ...sessionPayload, secondsRemaining: 1198 })
    expect(spy).not.toHaveBeenCalled()

    // Immediately writes when lifecycle state changes (e.g. paused)
    dm.setActiveSession({ ...sessionPayload, isPaused: true, secondsRemaining: 1197 })
    expect(spy).toHaveBeenCalledTimes(1)
    spy.mockRestore()

    // Clear session when inactive
    dm.setActiveSession({ ...sessionPayload, isActive: false })
    expect(dm.getActiveSession()).toBeNull()
  })

  it('preserves existing fields and original createdAt during partial updateGoal and updateGoals', async () => {
    const initialGoal = await dm.addGoal(
      '2026-06-15',
      'Original Detailed Task',
      45,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'Work',
      'blue'
    )
    const originalCreated = initialGoal.createdAt
    // Enrich with note and deadline
    await dm.updateGoal('2026-06-15', {
      ...initialGoal,
      note: 'Crucial implementation note',
      deadline: '2026-06-15T18:00:00'
    })

    // 1. Partial update via updateGoal omitting note, deadline, and createdAt
    const partialUpdate = await dm.updateGoal('2026-06-15', {
      id: initialGoal.id,
      title: 'Renamed Task Title',
      status: 'in_progress',
      date: '2026-06-15'
    } as any)

    expect(partialUpdate.title).toBe('Renamed Task Title')
    expect(partialUpdate.status).toBe('in_progress')
    expect(partialUpdate.createdAt).toBe(originalCreated)
    expect(partialUpdate.note).toBe('Crucial implementation note')
    expect(partialUpdate.deadline).toBe('2026-06-15T18:00:00')
    expect(partialUpdate.groupTag).toBe('Work')

    // Verify in database query
    const fetched1 = (await dm.getGoals('2026-06-15')).find((g) => g.id === initialGoal.id)
    expect(fetched1?.createdAt).toBe(originalCreated)
    expect(fetched1?.note).toBe('Crucial implementation note')
    expect(fetched1?.deadline).toBe('2026-06-15T18:00:00')

    // 2. Bulk update via updateGoals with minimal sortOrder payload
    await dm.updateGoals([
      {
        id: initialGoal.id,
        title: 'Renamed Task Title',
        status: 'in_progress',
        sortOrder: 2500
      } as any
    ])

    const fetched2 = (await dm.getGoals('2026-06-15')).find((g) => g.id === initialGoal.id)
    expect(fetched2?.sortOrder).toBe(2500)
    expect(fetched2?.createdAt).toBe(originalCreated)
    expect(fetched2?.note).toBe('Crucial implementation note')
    expect(fetched2?.deadline).toBe('2026-06-15T18:00:00')

    // 3. Explicitly clearing note with empty string
    await dm.updateGoal('2026-06-15', {
      id: initialGoal.id,
      title: 'Renamed Task Title',
      status: 'in_progress',
      note: ''
    } as any)

    const fetched3 = (await dm.getGoals('2026-06-15')).find((g) => g.id === initialGoal.id)
    expect(fetched3?.note).toBeUndefined()
    expect(fetched3?.deadline).toBe('2026-06-15T18:00:00')
    expect(fetched3?.createdAt).toBe(originalCreated)
  })

  describe('DataManager — Corruption Quarantine and Recovery', () => {
    it('quarantines corrupt database and restores from latest backup', async () => {
      // 1. Write data
      await dm.addGoal('2026-07-01', 'Important Mission Goal', 45)
      const dataLogsPath = path.join(testDir, 'focus-logs')

      // 2. Perform backup
      const { backupDatabase } = await import('../dataBackup')
      await backupDatabase(dm.getDb(), dataLogsPath)

      // 3. Close database and corrupt file
      dm.close()
      const dbPath = path.join(dataLogsPath, 'focus.db')
      fs.writeFileSync(dbPath, 'CORRUPTED_RAW_BINARY_DATA_GARBAGE')

      // 4. Instantiate new DataManager
      const recoveredDm = new DataManager()
      const goals = await recoveredDm.getGoals('2026-07-01')

      // 5. Verify restored data and quarantine file
      expect(goals.length).toBe(1)
      expect(goals[0].title).toBe('Important Mission Goal')

      const dirFiles = fs.readdirSync(dataLogsPath)
      const hasCorruptQuarantine = dirFiles.some((f) => f.includes('focus.db.corrupt.'))
      expect(hasCorruptQuarantine).toBe(true)

      recoveredDm.close()
    })

    it('quarantines corrupt database and initializes fresh DB when no backup exists', async () => {
      dm.close()
      const dataLogsPath = path.join(testDir, 'focus-logs')
      const dbPath = path.join(dataLogsPath, 'focus.db')
      fs.writeFileSync(dbPath, 'CORRUPTED_WITHOUT_BACKUPS')

      const freshDm = new DataManager()
      const settings = freshDm.getSettings()
      expect(settings.reminderIntervalMinutes).toBe(45)

      const dirFiles = fs.readdirSync(dataLogsPath)
      const hasCorruptQuarantine = dirFiles.some((f) => f.includes('focus.db.corrupt.'))
      expect(hasCorruptQuarantine).toBe(true)

      freshDm.close()
    })

    it('permanently deletes all database records and resets settings on deleteAllData', async () => {
      const today = '2026-11-04'
      await dm.appendLog(today, {
        id: 'wipe-log-1',
        text: 'Important session',
        timestamp: new Date().toISOString()
      })
      await dm.addGoal(today, 'Finish tasks')
      await dm.addInboxGoal('Idea for future')
      await dm.addRecurringGoal('Daily Workout', 30, today, undefined, 'daily')
      dm.setGroupColor('work', 'blue')
      dm.setSettings({ ...dm.getSettings(), reminderIntervalMinutes: 35, driveSyncEnabled: true })

      expect(await dm.getLogs(today)).toHaveLength(1)
      expect(await dm.getGoals(today)).toHaveLength(1)
      expect(await dm.getInboxGoals()).toHaveLength(1)
      expect(await dm.getRecurringGoals()).toHaveLength(1)
      expect(dm.getGroupColors()['work']).toBe('blue')

      await dm.deleteAllData()

      expect(await dm.getLogs(today)).toHaveLength(0)
      expect(await dm.getGoals(today)).toHaveLength(0)
      expect(await dm.getInboxGoals()).toHaveLength(0)
      expect(await dm.getRecurringGoals()).toHaveLength(0)
      expect(Object.keys(dm.getGroupColors())).toHaveLength(0)
      expect(dm.getSettings().reminderIntervalMinutes).toBe(45)
      expect(dm.getSettings().driveSyncEnabled).toBe(false)
      expect(dm.hasPendingRemoteWipe()).toBe(true)
      expect(typeof dm.getPendingRemoteWipeTimestamp()).toBe('number')
      dm.clearPendingRemoteWipe()
      expect(dm.hasPendingRemoteWipe()).toBe(false)
    })
  })
})
