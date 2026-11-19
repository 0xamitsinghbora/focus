import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import os from 'os'
import path from 'path'
import fs from 'fs'
import { initDatabaseSchema } from '../../dataMigrations'
import { LearningRepository } from '../LearningRepository'
import { shiftDate } from '../../../shared/types'

describe('LearningRepository', () => {
  let db: Database.Database
  let testDir: string
  let repo: LearningRepository

  beforeEach(() => {
    testDir = path.join(
      os.tmpdir(),
      `focus-learning-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    )
    fs.mkdirSync(testDir, { recursive: true })
    db = new Database(path.join(testDir, 'test.db'))
    initDatabaseSchema(db)
    repo = new LearningRepository(db)
  })

  afterEach(() => {
    if (db) db.close()
    try {
      fs.rmSync(testDir, { recursive: true, force: true })
    } catch {}
  })

  it('creates and retrieves a learning track with 1st, 7th, and 30th day intervals', async () => {
    const origin = '2026-11-20'
    const track = await repo.createTrack('Learn Rust Concurrency', origin, {
      targetMinutes: 60,
      note: 'Focus on channels and Arc<Mutex>'
    })

    expect(track.id).toBeDefined()
    expect(track.title).toBe('Learn Rust Concurrency')
    expect(track.originDate).toBe(origin)
    expect(track.day1Date).toBe(shiftDate(origin, 1)) // 2026-11-21
    expect(track.day7Date).toBe(shiftDate(origin, 7)) // 2026-11-27
    expect(track.day30Date).toBe(shiftDate(origin, 30)) // 2026-12-20
    expect(track.currentStage).toBe(1)
    expect(track.status).toBe('active')
    expect(track.day1Status).toBe('pending')
    expect(track.day7Status).toBe('pending')
    expect(track.day30Status).toBe('pending')

    const fetched = await repo.getTrackById(track.id)
    expect(fetched).not.toBeNull()
    expect(fetched?.title).toBe('Learn Rust Concurrency')
  })

  it('correctly queries pending revisions due on or before a given date', async () => {
    db.prepare(
      `INSERT INTO daily_goals (id, date, title, createdAt) VALUES ('goal-day-1', '2026-11-11', 'Revise', '2026-11-11T10:00:00Z')`
    ).run()
    const track = await repo.createTrack('Docker Networking', '2026-11-10')
    // day1Date is 2026-11-11
    // day7Date is 2026-11-17
    // day30Date is 2026-12-10

    // Before day 1
    const dueBefore = await repo.getPendingRevisions('2026-11-10')
    expect(dueBefore).toHaveLength(0)

    // On day 1
    const dueDay1 = await repo.getPendingRevisions('2026-11-11')
    expect(dueDay1).toHaveLength(1)
    expect(dueDay1[0].id).toBe(track.id)

    // Mark stage 1 scheduled and then completed
    await repo.markStageScheduled(track.id, 1, 'goal-day-1')
    await repo.markStageCompleted(track.id, 1)

    // Stage 1 completed; Stage 2 (Day 7) is 2026-11-17
    const dueDay1After = await repo.getPendingRevisions('2026-11-11')
    expect(dueDay1After).toHaveLength(0)

    const dueDay7 = await repo.getPendingRevisions('2026-11-17')
    expect(dueDay7).toHaveLength(1)
    expect(dueDay7[0].currentStage).toBe(2)

    // Mark stage 2 completed
    await repo.markStageCompleted(track.id, 2)
    const dueDay7After = await repo.getPendingRevisions('2026-11-17')
    expect(dueDay7After).toHaveLength(0)

    // Stage 3 (Day 30) is 2026-12-10
    const dueDay30 = await repo.getPendingRevisions('2026-12-10')
    expect(dueDay30).toHaveLength(1)
    expect(dueDay30[0].currentStage).toBe(3)

    // Complete stage 3 -> marked mastered
    await repo.markStageCompleted(track.id, 3)
    const updated = await repo.getTrackById(track.id)
    expect(updated?.status).toBe('mastered')
    expect(updated?.currentStage).toBe(4)

    const dueDay30After = await repo.getPendingRevisions('2026-12-10')
    expect(dueDay30After).toHaveLength(0)
  })

  it('resets a stage interval when requested (e.g. forgot / recall failure)', async () => {
    db.prepare(
      `INSERT INTO daily_goals (id, date, title, createdAt) VALUES ('goal-1', '2026-11-02', 'Revise', '2026-11-02T10:00:00Z')`
    ).run()
    const track = await repo.createTrack('Kubernetes Operators', '2026-11-01')
    await repo.markStageScheduled(track.id, 1, 'goal-1')
    await repo.markStageCompleted(track.id, 1)

    // User struggles on Stage 2 and wants to reset Stage 2 for tomorrow
    await repo.resetStage(track.id, 2, '2026-11-09')
    const updated = await repo.getTrackById(track.id)
    expect(updated?.currentStage).toBe(2)
    expect(updated?.day7Date).toBe('2026-11-09')
    expect(updated?.day7Status).toBe('pending')
    expect(updated?.day7GoalId).toBeUndefined()
  })

  it('soft deletes a learning track and excludes it from queries', async () => {
    const track = await repo.createTrack('Algorithms', '2026-11-01')
    await repo.deleteTrack(track.id)

    const fetched = await repo.getTrackById(track.id)
    expect(fetched).toBeNull()

    const active = await repo.getTracks('active')
    expect(active.find((t) => t.id === track.id)).toBeUndefined()
  })
})
