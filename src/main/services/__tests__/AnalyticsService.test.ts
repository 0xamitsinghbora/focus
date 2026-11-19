import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import os from 'os'
import path from 'path'
import fs from 'fs'
import { initDatabaseSchema } from '../../dataMigrations'
import { SettingsRepository } from '../../repositories/SettingsRepository'
import { LogsRepository } from '../../repositories/LogsRepository'
import { GoalsRepository } from '../../repositories/GoalsRepository'
import { AnalyticsService } from '../AnalyticsService'

let testDir: string
let db: Database.Database
let settingsRepo: SettingsRepository
let logsRepo: LogsRepository
let goalsRepo: GoalsRepository
let analyticsService: AnalyticsService

beforeEach(() => {
  testDir = path.join(
    os.tmpdir(),
    `focus-analytics-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  )
  fs.mkdirSync(testDir, { recursive: true })
  const dbPath = path.join(testDir, 'test.db')
  db = new Database(dbPath)
  db.pragma('foreign_keys = ON')

  initDatabaseSchema(db)

  settingsRepo = new SettingsRepository(db)
  logsRepo = new LogsRepository(db)
  goalsRepo = new GoalsRepository(db, settingsRepo, logsRepo)
  analyticsService = new AnalyticsService(db, goalsRepo, logsRepo, settingsRepo)
})

afterEach(() => {
  if (db) db.close()
  try {
    fs.rmSync(testDir, { recursive: true, force: true })
  } catch {}
  vi.restoreAllMocks()
})

describe('AnalyticsService', () => {
  it('calculates recursive cumulative logged minutes across carried goal ancestors', async () => {
    const g1 = await goalsRepo.addGoal('2026-03-01', 'Multi-day project')
    await logsRepo.appendLog('2026-03-01', {
      id: 'log-1',
      text: 'Session 1',
      goalId: g1.id,
      durationMinutes: 30,
      productiveMinutes: 30,
      productivity: 'productive',
      timestamp: '2026-03-01T10:00:00Z'
    })

    const g2 = await goalsRepo.carryGoal('2026-03-01', '2026-03-02', g1.id)
    await logsRepo.appendLog('2026-03-02', {
      id: 'log-2',
      text: 'Session 2',
      goalId: g2.id,
      durationMinutes: 45,
      productiveMinutes: 45,
      productivity: 'productive',
      timestamp: '2026-03-02T10:00:00Z'
    })

    const minutesMap = await analyticsService.getGoalLoggedMinutesMap([g2.id])
    expect(minutesMap[g2.id]).toBe(75) // 30 + 45
  })

  it('generates day review data with totalProductiveMinutes and goalBreakdown', async () => {
    const goal = await goalsRepo.addGoal('2026-03-10', 'Review task', 40)
    await logsRepo.appendLog('2026-03-10', {
      id: 'l-1',
      text: 'Review session',
      goalId: goal.id,
      durationMinutes: 40,
      productiveMinutes: 40,
      productivity: 'productive',
      timestamp: '2026-03-10T14:00:00Z'
    })
    await logsRepo.appendLog('2026-03-10', {
      id: 'l-break',
      text: 'Coffee break',
      durationMinutes: 15,
      productiveMinutes: 0,
      productivity: 'break',
      timestamp: '2026-03-10T15:00:00Z'
    })

    const review = await analyticsService.getDayReview('2026-03-10')
    expect(review.date).toBe('2026-03-10')
    expect(review.totalProductiveMinutes).toBe(40)
    expect(review.goalBreakdown.length).toBe(1)
    expect(review.goalBreakdown[0].goalId).toBe(goal.id)
    expect(review.goalBreakdown[0].productiveMinutes).toBe(40)
  })

  it('computes heatmap breakdown grouping sessions and completed goals', async () => {
    await logsRepo.appendLog('2026-03-15', {
      id: 'l-h',
      text: 'Focus session',
      durationMinutes: 25,
      productiveMinutes: 25,
      productivity: 'productive',
      timestamp: '2026-03-15T09:00:00Z'
    })

    const goal = await goalsRepo.addGoal('2026-03-15', 'Done Goal', 30)
    await goalsRepo.updateGoal('2026-03-15', {
      ...goal,
      status: 'done',
      completedAt: '2026-03-15T10:00:00Z'
    })

    const breakdown = await analyticsService.getHeatmapBreakdown()
    expect(breakdown['2026-03-15']).toBeDefined()
    expect(breakdown['2026-03-15'].sessions).toBe(1)
    expect(breakdown['2026-03-15'].completedGoals).toBe(1)
    expect(breakdown['2026-03-15'].total).toBe(2)
  })

  it('safely handles cyclic carry chains without infinite recursion or stack exhaustion', async () => {
    // Create goal A pointing to B, and goal B pointing to A
    const goalA = await goalsRepo.addGoal('2026-03-20', 'Cycle A', 30)
    const goalB = await goalsRepo.addGoal('2026-03-21', 'Cycle B', 30)

    // Force cyclic carriedFromGoalId relationship in database
    db.prepare('UPDATE daily_goals SET carriedFromGoalId = ? WHERE id = ?').run(goalB.id, goalA.id)
    db.prepare('UPDATE daily_goals SET carriedFromGoalId = ? WHERE id = ?').run(goalA.id, goalB.id)

    // Log minutes to goal A
    await logsRepo.appendLog('2026-03-20', {
      id: 'l-cycle',
      text: 'Working in cycle',
      durationMinutes: 45,
      productiveMinutes: 45,
      productivity: 'productive',
      goalId: goalA.id,
      timestamp: '2026-03-20T10:00:00Z'
    })

    // Calling cumulative minutes should terminate cleanly thanks to depth guardrail
    const mapAll = await analyticsService.getGoalLoggedMinutesMap()
    expect(mapAll[goalA.id]).toBe(45)

    const mapScoped = await analyticsService.getGoalLoggedMinutesMap([goalA.id, goalB.id])
    expect(mapScoped[goalA.id]).toBe(45)
    expect(mapScoped[goalB.id]).toBe(45)
  })

  it('safely handles closed database without throwing TypeError', async () => {
    db.close()
    const review = await analyticsService.getDayReview('2026-03-10')
    expect(review).toBeDefined()
    expect(review.totalProductiveMinutes).toBe(0)
    expect(review.goals).toEqual([])

    const heatmap = await analyticsService.getHeatmapBreakdown()
    expect(heatmap).toEqual({})
  })
})
