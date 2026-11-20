import Database from 'better-sqlite3'
import {
  EvaluationRecord,
  EvaluatorMetrics,
  AntiCheatSummary,
  DailyGoal,
  LogEntry
} from '../../shared/types'
import { logger } from '../logger'

export class EvaluationRepository {
  private db: Database.Database

  private stmts: {
    insertEvaluation: Database.Statement
    updateEvaluation: Database.Statement
    getEvaluationById: Database.Statement
    getEvaluationsForEntity: Database.Statement
    getPendingEvaluations: Database.Statement
    getAllEvaluations: Database.Statement
    getEvaluationsSince: Database.Statement
  }

  constructor(db: Database.Database) {
    this.db = db

    this.stmts = {
      insertEvaluation: this.db.prepare(`
        INSERT INTO evaluations (
          id, entityType, entityId, evaluatorType, evaluatorId, evaluatorName,
          status, score, verdict, feedback, cheatRisk, proofOfWork, trackedMinutes, createdAt, updatedAt
        )
        VALUES (
          @id, @entityType, @entityId, @evaluatorType, @evaluatorId, @evaluatorName,
          @status, @score, @verdict, @feedback, @cheatRisk, @proofOfWork, @trackedMinutes, @createdAt, @updatedAt
        )
      `),
      updateEvaluation: this.db.prepare(`
        UPDATE evaluations SET
          status = @status,
          score = @score,
          verdict = @verdict,
          feedback = @feedback,
          cheatRisk = @cheatRisk,
          evaluatorId = @evaluatorId,
          evaluatorName = @evaluatorName,
          updatedAt = @updatedAt
        WHERE id = @id
      `),
      getEvaluationById: this.db.prepare(`
        SELECT * FROM evaluations WHERE id = ?
      `),
      getEvaluationsForEntity: this.db.prepare(`
        SELECT * FROM evaluations WHERE entityType = ? AND entityId = ? ORDER BY createdAt DESC
      `),
      getPendingEvaluations: this.db.prepare(`
        SELECT * FROM evaluations WHERE status = 'pending' ORDER BY createdAt DESC
      `),
      getAllEvaluations: this.db.prepare(`
        SELECT * FROM evaluations ORDER BY createdAt DESC LIMIT 200
      `),
      getEvaluationsSince: this.db.prepare(`
        SELECT * FROM evaluations WHERE createdAt >= ? ORDER BY createdAt DESC
      `)
    }
  }

  public recordEvaluation(record: EvaluationRecord): EvaluationRecord {
    const now = new Date().toISOString()
    const evaluation: EvaluationRecord = {
      ...record,
      id: record.id || crypto.randomUUID(),
      createdAt: record.createdAt || now,
      updatedAt: now
    }

    this.stmts.insertEvaluation.run({
      id: evaluation.id,
      entityType: evaluation.entityType,
      entityId: evaluation.entityId,
      evaluatorType: evaluation.evaluatorType,
      evaluatorId: evaluation.evaluatorId ?? null,
      evaluatorName: evaluation.evaluatorName,
      status: evaluation.status,
      score: evaluation.score,
      verdict: evaluation.verdict,
      feedback: evaluation.feedback,
      cheatRisk: evaluation.cheatRisk || 'low',
      proofOfWork: evaluation.proofOfWork ?? null,
      trackedMinutes: evaluation.trackedMinutes,
      createdAt: evaluation.createdAt,
      updatedAt: evaluation.updatedAt ?? null
    })

    return evaluation
  }

  public updateEvaluation(
    id: string,
    updates: Partial<EvaluationRecord> & {
      status: EvaluationRecord['status']
      verdict: string
      feedback: string
      evaluatorName: string
    }
  ): EvaluationRecord | null {
    const existing = this.stmts.getEvaluationById.get(id) as EvaluationRecord | undefined
    if (!existing) return null

    const now = new Date().toISOString()
    const updated: EvaluationRecord = {
      ...existing,
      ...updates,
      updatedAt: now
    }

    this.stmts.updateEvaluation.run({
      id,
      status: updated.status,
      score: typeof updated.score === 'number' ? updated.score : existing.score,
      verdict: updated.verdict,
      feedback: updated.feedback,
      cheatRisk: updated.cheatRisk || existing.cheatRisk || 'low',
      evaluatorId: updated.evaluatorId ?? existing.evaluatorId ?? null,
      evaluatorName: updated.evaluatorName,
      updatedAt: now
    })

    return updated
  }

  public getEvaluationsForEntity(entityType: string, entityId: string): EvaluationRecord[] {
    const rows = this.stmts.getEvaluationsForEntity.all(entityType, entityId) as EvaluationRecord[]
    return rows.map((r) => ({
      ...r,
      proofOfWork: r.proofOfWork || undefined,
      updatedAt: r.updatedAt || undefined,
      evaluatorId: r.evaluatorId || undefined
    }))
  }

  public getPendingEvaluations(): EvaluationRecord[] {
    const rows = this.stmts.getPendingEvaluations.all() as EvaluationRecord[]
    return rows.map((r) => ({
      ...r,
      proofOfWork: r.proofOfWork || undefined,
      updatedAt: r.updatedAt || undefined,
      evaluatorId: r.evaluatorId || undefined
    }))
  }

  public getAllEvaluations(): EvaluationRecord[] {
    const rows = this.stmts.getAllEvaluations.all() as EvaluationRecord[]
    return rows.map((r) => ({
      ...r,
      proofOfWork: r.proofOfWork || undefined,
      updatedAt: r.updatedAt || undefined,
      evaluatorId: r.evaluatorId || undefined
    }))
  }

  public getMetrics(): EvaluatorMetrics {
    try {
      const evaluations = this.getAllEvaluations()
      const verified = evaluations.filter((e) => e.status === 'verified').length
      const rejected = evaluations.filter((e) => e.status === 'rejected').length
      const scores = evaluations.map((e) => e.score).filter((s) => typeof s === 'number')
      const averageHonestyScore =
        scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 85

      return {
        mode: 'embedded_lite',
        totalEvaluations: evaluations.length,
        verifiedGoalsCount: verified,
        rejectedCount: rejected,
        averageHonestyScore,
        lastEvaluatedAt: evaluations[0]?.createdAt
      }
    } catch (err) {
      logger.error('evaluator', 'Failed to calculate evaluator metrics:', err)
      return {
        mode: 'embedded_lite',
        totalEvaluations: 0,
        verifiedGoalsCount: 0,
        rejectedCount: 0,
        averageHonestyScore: 100
      }
    }
  }

  public getAntiCheatSummary(
    date: string,
    logs: LogEntry[],
    goals: DailyGoal[]
  ): AntiCheatSummary {
    try {
      const evaluations = this.stmts.getEvaluationsSince.all(`${date}T00:00:00.000Z`) as EvaluationRecord[]

      let verifiedMinutes = 0
      let unverifiedMinutes = 0
      let verifiedCount = 0
      let rejectedCount = 0
      let pendingCount = 0
      const scores: number[] = []

      // Calculate minutes from logs
      for (const log of logs) {
        if (log.productivity === 'break') continue
        const duration = log.productiveMinutes || log.durationMinutes || 0
        if (log.evaluationStatus === 'verified') {
          verifiedMinutes += duration
        } else {
          unverifiedMinutes += duration
        }
      }

      // Check goals
      for (const goal of goals) {
        if (goal.evaluationStatus === 'verified') {
          verifiedCount++
          if (typeof goal.antiCheatScore === 'number') {
            scores.push(goal.antiCheatScore)
          }
        } else if (goal.evaluationStatus === 'rejected') {
          rejectedCount++
          if (typeof goal.antiCheatScore === 'number') {
            scores.push(goal.antiCheatScore)
          }
        } else if (goal.evaluationStatus === 'pending') {
          pendingCount++
        }
      }

      for (const ev of evaluations) {
        if (typeof ev.score === 'number') {
          scores.push(ev.score)
        }
      }

      const honestyScore =
        scores.length > 0
          ? Math.min(100, Math.max(0, Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)))
          : verifiedCount > 0 || verifiedMinutes > 0
            ? 90
            : 80

      let cheatRisk: 'low' | 'medium' | 'high' = 'low'
      if (rejectedCount > 0 || honestyScore < 50) {
        cheatRisk = 'high'
      } else if (honestyScore < 75 || unverifiedMinutes > verifiedMinutes * 2) {
        cheatRisk = 'medium'
      }

      return {
        verifiedMinutes,
        unverifiedMinutes,
        honestyScore,
        cheatRisk,
        pendingCount,
        totalAudits: verifiedCount + rejectedCount + pendingCount,
        verifiedCount,
        rejectedCount
      }
    } catch (err) {
      logger.error('evaluator', 'Failed to compute anti-cheat summary:', err)
      return {
        verifiedMinutes: 0,
        unverifiedMinutes: 0,
        honestyScore: 85,
        cheatRisk: 'low',
        pendingCount: 0,
        totalAudits: 0,
        verifiedCount: 0,
        rejectedCount: 0
      }
    }
  }
}
