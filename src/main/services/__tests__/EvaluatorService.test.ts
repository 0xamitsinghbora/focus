import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import os from 'os'
import path from 'path'
import fs from 'fs'
import { initDatabaseSchema } from '../../dataMigrations'
import { EvaluationRepository } from '../../repositories/EvaluationRepository'
import { GoalsRepository } from '../../repositories/GoalsRepository'
import { LogsRepository } from '../../repositories/LogsRepository'
import { SettingsRepository } from '../../repositories/SettingsRepository'
import { EvaluatorService } from '../EvaluatorService'
import { DailyGoal } from '../../../shared/types'

describe('EvaluatorService (Anti-Cheat & Local Lite LLM Evaluation)', () => {
  let db: Database.Database
  let testDir: string
  let evalRepo: EvaluationRepository
  let goalsRepo: GoalsRepository
  let logsRepo: LogsRepository
  let settingsRepo: SettingsRepository
  let service: EvaluatorService

  beforeEach(() => {
    testDir = path.join(
      os.tmpdir(),
      `focus-eval-service-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    )
    fs.mkdirSync(testDir, { recursive: true })
    db = new Database(path.join(testDir, 'test.db'))
    initDatabaseSchema(db)

    evalRepo = new EvaluationRepository(db)
    settingsRepo = new SettingsRepository(db)
    logsRepo = new LogsRepository(db)
    goalsRepo = new GoalsRepository(db, settingsRepo, logsRepo)

    service = new EvaluatorService({
      evaluationRepo: evalRepo,
      goalsRepo,
      logsRepo,
      settingsRepo
    })
  })

  afterEach(() => {
    if (db) db.close()
    try {
      fs.rmSync(testDir, { recursive: true, force: true })
    } catch {}
  })

  it('verifies genuine work with deliverable artifacts and focus time using local lite model', async () => {
    const review = await service.runLocalLlmReview({
      entityType: 'goal',
      entityId: 'goal-1',
      title: 'Implement OAuth callback',
      targetMinutes: 45,
      trackedMinutes: 42,
      proofOfWork: 'Fixed token parsing bug in oauthCallbackHtml.ts and wrote 5 unit tests with commit 3a4f89b.'
    })

    expect(review.status).toBe('verified')
    expect(review.cheatRisk).toBe('low')
    expect(review.score).toBeGreaterThanOrEqual(70)
    expect(review.verdict).toContain('Verified')
    expect(review.evaluatorType).toBe('embedded_lite')
  })

  it('detects and flags cheating attempts (e.g. 0 minutes tracked, generic "done" note)', async () => {
    const review = await service.runLocalLlmReview({
      entityType: 'goal',
      entityId: 'goal-cheat',
      title: 'Write comprehensive documentation',
      targetMinutes: 60,
      trackedMinutes: 0,
      proofOfWork: 'done'
    })

    expect(review.status).toBe('rejected')
    expect(review.cheatRisk).toBe('high')
    expect(review.score).toBeLessThan(45)
    expect(review.verdict).toContain('Rejected')
    expect(review.feedback).toMatch(/Improbable completion|Generic non-verifiable note/i)
  })

  it('updates goal status when submitted for local lite LLM evaluation (prevents self-approval on cheat)', async () => {
    const today = '2026-11-20'
    const goal: DailyGoal = {
      id: 'g-test-local-llm',
      date: today,
      title: 'Database migration v5',
      status: 'in_progress',
      targetMinutes: 30,
      createdAt: new Date().toISOString()
    }
    goalsRepo.upsertGoal(goal)

    // Submit fraudulent completion attempt
    const cheatResult = await service.submitForReview({
      entityType: 'goal',
      entityId: goal.id,
      title: goal.title,
      targetMinutes: 30,
      trackedMinutes: 1,
      proofOfWork: 'finished'
    })

    expect(cheatResult.status).toBe('rejected')
    const updatedGoalAfterCheat = await goalsRepo.getGoalById(goal.id)
    // Goal MUST NOT be done! You cannot cheat yourself.
    expect(updatedGoalAfterCheat?.status).not.toBe('done')
    expect(updatedGoalAfterCheat?.evaluationStatus).toBe('rejected')

    // Now submit genuine proof of work
    const verifiedResult = await service.submitForReview({
      entityType: 'goal',
      entityId: goal.id,
      title: goal.title,
      targetMinutes: 30,
      trackedMinutes: 28,
      proofOfWork: 'Created evaluations tables with SQLite PRAGMA test suite in dataMigrations.ts'
    })

    expect(verifiedResult.status).toBe('verified')
    const updatedGoalAfterVerification = await goalsRepo.getGoalById(goal.id)
    expect(updatedGoalAfterVerification?.status).toBe('done')
    expect(updatedGoalAfterVerification?.evaluationStatus).toBe('verified')
    expect(updatedGoalAfterVerification?.antiCheatScore).toBeGreaterThanOrEqual(70)
  })

  it('manages evaluator settings and strictness thresholds', () => {
    const updated = service.updateSettings({
      mode: 'embedded_lite',
      strictness: 'moderate',
      requireProofOfWork: true
    })

    expect(updated.mode).toBe('embedded_lite')
    expect(updated.strictness).toBe('moderate')
    expect(updated.requireProofOfWork).toBe(true)

    const fetched = service.getSettings()
    expect(fetched.mode).toBe('embedded_lite')
    expect(fetched.strictness).toBe('moderate')
  })
})
