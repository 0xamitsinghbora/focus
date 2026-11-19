import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import os from 'os'
import path from 'path'
import fs from 'fs'
import { initDatabaseSchema } from '../../dataMigrations'
import { LearningRepository } from '../../repositories/LearningRepository'
import { GoalsRepository } from '../../repositories/GoalsRepository'
import { SettingsRepository } from '../../repositories/SettingsRepository'
import { LogsRepository } from '../../repositories/LogsRepository'
import { LearningService } from '../LearningService'
import { shiftDate } from '../../../shared/types'

describe('LearningService', () => {
  let db: Database.Database
  let testDir: string
  let learningRepo: LearningRepository
  let goalsRepo: GoalsRepository
  let learningService: LearningService

  beforeEach(() => {
    testDir = path.join(
      os.tmpdir(),
      `focus-learning-service-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    )
    fs.mkdirSync(testDir, { recursive: true })
    db = new Database(path.join(testDir, 'test.db'))
    initDatabaseSchema(db)

    const settingsRepo = new SettingsRepository(db)
    const logsRepo = new LogsRepository(db)
    goalsRepo = new GoalsRepository(db, settingsRepo, logsRepo)
    learningRepo = new LearningRepository(db)
    learningService = new LearningService(db, learningRepo, goalsRepo)
  })

  afterEach(() => {
    if (db) db.close()
    try {
      fs.rmSync(testDir, { recursive: true, force: true })
    } catch {}
  })

  it('automatically creates a learning track when a #learning task is completed', async () => {
    const originDate = '2026-11-20'
    const goal = await goalsRepo.addGoal(
      originDate,
      'Understand Raft Consensus Algorithm #learning',
      45,
      undefined,
      undefined,
      'Leader election and log replication',
      undefined,
      undefined,
      'learning',
      undefined,
      1000,
      'done'
    )

    await learningService.onGoalUpdated(goal)

    const tracks = await learningService.getTracks('active')
    expect(tracks).toHaveLength(1)
    const track = tracks[0]
    expect(track.title).toBe('Understand Raft Consensus Algorithm')
    expect(track.originalGoalId).toBe(goal.id)
    expect(track.originDate).toBe(originDate)
    expect(track.targetMinutes).toBe(45)
    expect(track.day1Date).toBe(shiftDate(originDate, 1))
    expect(track.day7Date).toBe(shiftDate(originDate, 7))
    expect(track.day30Date).toBe(shiftDate(originDate, 30))
  })

  it('materializes Day 1 revision with Red R-Y-G color on day + 1', async () => {
    const originDate = '2026-11-20'
    const track = await learningRepo.createTrack('System Design: Sharding', originDate, {
      targetMinutes: 50
    })

    const day1 = shiftDate(originDate, 1) // 2026-11-21
    const materialized = await learningService.materializeRevisionsForDate(day1)

    expect(materialized).toHaveLength(1)
    const revGoal = materialized[0]
    expect(revGoal.date).toBe(day1)
    expect(revGoal.title).toBe('Revise: System Design: Sharding')
    expect(revGoal.targetMinutes).toBe(25) // 50% of 50m
    expect(revGoal.learningTrackId).toBe(track.id)
    expect(revGoal.learningStage).toBe(1)
    expect(revGoal.groupColor).toBe('learning-red')
    expect(revGoal.groupTag).toBe('learning')
    expect(revGoal.status).toBe('planned')

    // Calling materialize again on the same day should be idempotent (does not duplicate)
    const secondPass = await learningService.materializeRevisionsForDate(day1)
    expect(secondPass).toHaveLength(0)
  })

  it('progresses through Day 1 (Red), Day 7 (Yellow), and Day 30 (Green) to Mastery', async () => {
    const originDate = '2026-11-01'
    const track = await learningRepo.createTrack('Kubernetes Ingress Controllers', originDate, {
      targetMinutes: 60
    })

    // 1. Day 1 (Red)
    const day1Date = shiftDate(originDate, 1)
    const day1Goals = await learningService.materializeRevisionsForDate(day1Date)
    expect(day1Goals).toHaveLength(1)
    expect(day1Goals[0].learningStage).toBe(1)
    expect(day1Goals[0].groupColor).toBe('learning-red')

    // Complete Day 1
    const day1Completed = {
      ...day1Goals[0],
      status: 'done' as const,
      completedAt: '2026-11-02T15:00:00Z'
    }
    await goalsRepo.updateGoal(day1Date, day1Completed)
    await learningService.onGoalUpdated(day1Completed)

    const trackAfterDay1 = await learningRepo.getTrackById(track.id)
    expect(trackAfterDay1?.day1Status).toBe('completed')
    expect(trackAfterDay1?.currentStage).toBe(2)

    // 2. Day 7 (Yellow)
    const day7Date = shiftDate(originDate, 7)
    const day7Goals = await learningService.materializeRevisionsForDate(day7Date)
    expect(day7Goals).toHaveLength(1)
    expect(day7Goals[0].learningStage).toBe(2)
    expect(day7Goals[0].groupColor).toBe('learning-yellow')

    // Complete Day 7
    const day7Completed = {
      ...day7Goals[0],
      status: 'done' as const,
      completedAt: '2026-11-08T15:00:00Z'
    }
    await goalsRepo.updateGoal(day7Date, day7Completed)
    await learningService.onGoalUpdated(day7Completed)

    const trackAfterDay7 = await learningRepo.getTrackById(track.id)
    expect(trackAfterDay7?.day7Status).toBe('completed')
    expect(trackAfterDay7?.currentStage).toBe(3)

    // 3. Day 30 (Green)
    const day30Date = shiftDate(originDate, 30)
    const day30Goals = await learningService.materializeRevisionsForDate(day30Date)
    expect(day30Goals).toHaveLength(1)
    expect(day30Goals[0].learningStage).toBe(3)
    expect(day30Goals[0].groupColor).toBe('learning-green')

    // Complete Day 30 -> Mastery!
    const day30Completed = {
      ...day30Goals[0],
      status: 'done' as const,
      completedAt: '2026-12-01T15:00:00Z'
    }
    await goalsRepo.updateGoal(day30Date, day30Completed)
    await learningService.onGoalUpdated(day30Completed)

    const finalTrack = await learningRepo.getTrackById(track.id)
    expect(finalTrack?.day30Status).toBe('completed')
    expect(finalTrack?.currentStage).toBe(4)
    expect(finalTrack?.status).toBe('mastered')
  })
})
