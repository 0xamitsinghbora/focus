import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import os from 'os'
import path from 'path'
import fs from 'fs'
import { initDatabaseSchema } from '../../dataMigrations'
import { EvaluationRepository } from '../EvaluationRepository'

describe('EvaluationRepository', () => {
  let db: Database.Database
  let testDir: string
  let repo: EvaluationRepository

  beforeEach(() => {
    testDir = path.join(
      os.tmpdir(),
      `focus-eval-repo-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    )
    fs.mkdirSync(testDir, { recursive: true })
    db = new Database(path.join(testDir, 'test.db'))
    initDatabaseSchema(db)
    repo = new EvaluationRepository(db)
  })

  afterEach(() => {
    if (db) db.close()
    try {
      fs.rmSync(testDir, { recursive: true, force: true })
    } catch {}
  })

  it('records and queries evaluations for entities', () => {
    const evaluation = repo.recordEvaluation({
      id: 'eval-1',
      entityType: 'goal',
      entityId: 'goal-123',
      evaluatorType: 'local_llm',
      evaluatorName: 'Local Lite LLM Auditor',
      status: 'verified',
      score: 92,
      verdict: 'Verified by Local Lite LLM: Authentic deliverable confirmed',
      feedback: 'Great focus session with concrete code artifact.',
      cheatRisk: 'low',
      proofOfWork: 'Implemented login flow with unit tests in auth.test.ts',
      trackedMinutes: 45,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })

    expect(evaluation.id).toBe('eval-1')

    const forEntity = repo.getEvaluationsForEntity('goal', 'goal-123')
    expect(forEntity.length).toBe(1)
    expect(forEntity[0].score).toBe(92)
    expect(forEntity[0].status).toBe('verified')
  })

  it('updates evaluation when revision is processed', () => {
    repo.recordEvaluation({
      id: 'eval-pending',
      entityType: 'goal',
      entityId: 'goal-456',
      evaluatorType: 'local_llm',
      evaluatorName: 'Local Lite LLM Auditor',
      status: 'pending',
      score: 40,
      verdict: 'Pending revision',
      feedback: 'Evidence needed',
      cheatRisk: 'medium',
      trackedMinutes: 30,
      createdAt: new Date().toISOString()
    })

    const pending = repo.getPendingEvaluations()
    expect(pending.length).toBe(1)
    expect(pending[0].id).toBe('eval-pending')

    const updated = repo.updateEvaluation('eval-pending', {
      status: 'verified',
      score: 95,
      verdict: 'Verified by Local Lite LLM',
      feedback: 'Concrete deliverable confirmed on revision.',
      evaluatorName: 'Local Lite LLM Auditor'
    })

    expect(updated).toBeDefined()
    expect(updated?.status).toBe('verified')
    expect(updated?.score).toBe(95)

    const remainingPending = repo.getPendingEvaluations()
    expect(remainingPending.length).toBe(0)
  })

  it('calculates metrics and anti-cheat summary correctly', () => {
    repo.recordEvaluation({
      id: 'e1',
      entityType: 'goal',
      entityId: 'g1',
      evaluatorType: 'local_llm',
      evaluatorName: 'Local Lite LLM Auditor',
      status: 'verified',
      score: 90,
      verdict: 'Verified',
      feedback: 'Good',
      cheatRisk: 'low',
      trackedMinutes: 45,
      createdAt: new Date().toISOString()
    })

    const metrics = repo.getMetrics()
    expect(metrics.totalEvaluations).toBe(1)
    expect(metrics.verifiedGoalsCount).toBe(1)
    expect(metrics.averageHonestyScore).toBe(90)
    expect(metrics.mode).toBe('embedded_lite')
  })
})
