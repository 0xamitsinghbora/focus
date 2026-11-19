import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import os from 'os'
import path from 'path'
import fs from 'fs'
import { initDatabaseSchema } from '../../dataMigrations'
import { SettingsRepository } from '../SettingsRepository'
import { LogsRepository } from '../LogsRepository'
import { GoalsRepository } from '../GoalsRepository'

let testDir: string
let db: Database.Database
let settingsRepo: SettingsRepository
let logsRepo: LogsRepository
let goalsRepo: GoalsRepository
let dirtyDates: string[]

beforeEach(() => {
  testDir = path.join(
    os.tmpdir(),
    `focus-goals-repo-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  )
  fs.mkdirSync(testDir, { recursive: true })
  const dbPath = path.join(testDir, 'test.db')
  db = new Database(dbPath)
  db.pragma('foreign_keys = ON')
  initDatabaseSchema(db)

  dirtyDates = []
  settingsRepo = new SettingsRepository(db)
  logsRepo = new LogsRepository(db)
  goalsRepo = new GoalsRepository(db, settingsRepo, logsRepo, {
    markDirtyGoalDate: (d) => dirtyDates.push(d),
    markDirtyInbox: vi.fn(),
    markDirtyRecurring: vi.fn(),
    markDirtyPurged: vi.fn()
  })
})

afterEach(() => {
  if (db) db.close()
  try {
    fs.rmSync(testDir, { recursive: true, force: true })
  } catch {}
  vi.restoreAllMocks()
})

describe('GoalsRepository', () => {
  it('adds and retrieves daily goals', async () => {
    const goal = await goalsRepo.addGoal('2026-03-20', 'Ship new version', 60)
    expect(goal.id).toBeDefined()
    expect(goal.title).toBe('Ship new version')
    expect(dirtyDates).toContain('2026-03-20')

    const goals = await goalsRepo.getGoals('2026-03-20')
    expect(goals.length).toBe(1)
    expect(goals[0].id).toBe(goal.id)
    expect(goals[0].targetMinutes).toBe(60)
  })

  it('carries goal forward to next date and soft-deletes original', async () => {
    const original = await goalsRepo.addGoal('2026-03-20', 'Carried task', 45)
    const carried = await goalsRepo.carryGoal('2026-03-20', '2026-03-21', original.id)

    expect(carried.id).not.toBe(original.id)
    expect(carried.date).toBe('2026-03-21')
    expect(carried.carriedFromGoalId).toBe(original.id)

    const day1Active = await goalsRepo.getGoals('2026-03-20', false)
    expect(day1Active.length).toBe(0)

    const day2Active = await goalsRepo.getGoals('2026-03-21', false)
    expect(day2Active.length).toBe(1)
    expect(day2Active[0].id).toBe(carried.id)
  })

  it('manages inbox goals and converting inbox goal to today', async () => {
    const inbox = await goalsRepo.addInboxGoal('Read whitepaper', 'Important research')
    expect(inbox.title).toBe('Read whitepaper')

    const allInbox = await goalsRepo.getInboxGoals()
    expect(allInbox.length).toBe(1)

    const daily = await goalsRepo.addInboxGoalToToday(inbox.id, '2026-03-20', 30)
    expect(daily.title).toBe('Read whitepaper')
    expect(daily.sourceInboxGoalId).toBe(inbox.id)

    const afterInbox = await goalsRepo.getInboxGoals()
    expect(afterInbox.length).toBe(0)
  })

  it('manages recurring goals and generates daily goals', async () => {
    await goalsRepo.addRecurringGoal('Daily Standup', 15, '2026-03-01', undefined, 'daily')
    const recurring = await goalsRepo.getRecurringGoals()
    expect(recurring.length).toBe(1)
    expect(recurring[0].title).toBe('Daily Standup')

    const generated = await goalsRepo.generateTodayGoals('2026-03-20')
    expect(generated.some((g) => g.title === 'Daily Standup')).toBe(true)

    // Second call should not duplicate
    const secondGen = await goalsRepo.generateTodayGoals('2026-03-20')
    expect(secondGen.filter((g) => g.title === 'Daily Standup').length).toBe(1)
  })

  it('correctly updates effectiveDate when a task is completed with day cutoff hour', async () => {
    // Set 4 AM cutoff (work before 4 AM belongs to prior calendar day)
    settingsRepo.patchSettings({ dayCutoffHour: 4 })

    const goal = await goalsRepo.addGoal('2026-03-20', 'Late night coding', 60)
    expect(goal.effectiveDate).toBe('2026-03-20')

    // Mark done at 01:30 AM local time on March 21
    // Local date 2026-03-21 at 01:30 with cutoff 4 belongs to effective date 2026-03-20
    const completedAtDate = new Date(2026, 2, 21, 1, 30, 0)
    const updated = await goalsRepo.updateGoal('2026-03-20', {
      ...goal,
      status: 'done',
      completedAt: completedAtDate.toISOString()
    })

    expect(updated.status).toBe('done')
    expect(updated.effectiveDate).toBe('2026-03-20')

    // Read back from database to verify persisted column
    const fetched = (await goalsRepo.getGoals('2026-03-20')).find((g) => g.id === goal.id)
    expect(fetched?.effectiveDate).toBe('2026-03-20')
  })

  it('completed section: shows tasks completed today (including past midnight before cutoff) and excludes older completed tasks', async () => {
    settingsRepo.patchSettings({ dayCutoffHour: 4 })

    // 1. Task completed today normally
    const todayGoal = await goalsRepo.addGoal('2026-03-20', 'Task completed today', 30)
    await goalsRepo.updateGoal('2026-03-20', {
      ...todayGoal,
      status: 'done',
      completedAt: '2026-03-20T15:00:00.000Z'
    })

    // 2. Task worked past midnight at 1:30 AM before 4 AM cutoff (effectiveDate should be 2026-03-20)
    const midnightGoal = await goalsRepo.addGoal('2026-03-20', 'Task completed past midnight', 45)
    const lateNightDate = new Date(2026, 2, 21, 1, 30, 0)
    await goalsRepo.updateGoal('2026-03-20', {
      ...midnightGoal,
      status: 'done',
      completedAt: lateNightDate.toISOString()
    })

    // 3. Older task completed yesterday (2026-03-19)
    const olderGoal = await goalsRepo.addGoal('2026-03-19', 'Task completed yesterday', 60)
    await goalsRepo.updateGoal('2026-03-19', {
      ...olderGoal,
      status: 'done',
      completedAt: '2026-03-19T14:00:00.000Z'
    })

    // On today's board (2026-03-20):
    const boardGoals = await goalsRepo.getBoardGoals('2026-03-20')
    const completedBoardGoals = boardGoals.filter((g) => g.status === 'done')

    // Today's completed tasks (including midnight task) stay in today's completed section
    expect(completedBoardGoals.some((g) => g.title === 'Task completed today')).toBe(true)
    expect(completedBoardGoals.some((g) => g.title === 'Task completed past midnight')).toBe(true)
    // Older completed task from yesterday is excluded from today's completed section!
    expect(completedBoardGoals.some((g) => g.title === 'Task completed yesterday')).toBe(false)

    // Older completed section is shown in review tab for yesterday (2026-03-19)
    const reviewYesterdayGoals = await goalsRepo.getDayReviewGoals('2026-03-19')
    const yesterdayCompleted = reviewYesterdayGoals.filter((g) => g.status === 'done')
    expect(yesterdayCompleted.some((g) => g.title === 'Task completed yesterday')).toBe(true)
  })

  it('safely handles closed database without throwing TypeError', async () => {
    db.close()
    await expect(goalsRepo.getGoals('2026-03-20')).resolves.toEqual([])
    await expect(goalsRepo.getDayReviewGoals('2026-03-20')).resolves.toEqual([])
    await expect(goalsRepo.getBoardGoals('2026-03-20')).resolves.toEqual([])
    await expect(goalsRepo.generateTodayGoals('2026-03-20')).resolves.toEqual([])
  })
})
