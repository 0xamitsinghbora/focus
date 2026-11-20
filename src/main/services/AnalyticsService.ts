import Database from 'better-sqlite3'
import {
  LogEntry,
  DailyGoal,
  DayReviewData,
  GoalBreakdown,
  HeatmapBreakdown
} from '../../shared/types'
import { GoalsRepository } from '../repositories/GoalsRepository'
import { LogsRepository } from '../repositories/LogsRepository'
import { SettingsRepository } from '../repositories/SettingsRepository'
import type { EvaluationRepository } from '../repositories/EvaluationRepository'
import { logger } from '../logger'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function assertValidDate(date: string, label = 'date'): void {
  if (!DATE_RE.test(date)) {
    throw new Error(`Invalid ${label}: "${date}" — expected YYYY-MM-DD`)
  }
}

export class AnalyticsService {
  private db: Database.Database
  private goalsRepo: GoalsRepository
  private logsRepo: LogsRepository
  private settingsRepo: SettingsRepository
  private evaluationRepo?: EvaluationRepository
  private cachedGoalMinutesMap: Record<string, number> | null = null

  public stmts: {
    getGoalCumulativeMinutesAll: Database.Statement
    getGoalCumulativeMinutesScoped: Database.Statement
    getHeatmapGoalsAgg: Database.Statement
    getHeatmapGoalsSinceAgg: Database.Statement
  }

  constructor(
    db: Database.Database,
    goalsRepo: GoalsRepository,
    logsRepo: LogsRepository,
    settingsRepo: SettingsRepository,
    evaluationRepo?: EvaluationRepository
  ) {
    this.db = db
    this.goalsRepo = goalsRepo
    this.logsRepo = logsRepo
    this.settingsRepo = settingsRepo
    this.evaluationRepo = evaluationRepo

    this.stmts = {
      getGoalCumulativeMinutesAll: db.prepare(`
        WITH RECURSIVE goal_tree(root_id, current_id, depth) AS (
          SELECT id AS root_id, id AS current_id, 0 AS depth
          FROM daily_goals
          WHERE deletedAt IS NULL
          UNION
          SELECT DISTINCT goalId AS root_id, goalId AS current_id, 0 AS depth
          FROM logs
          WHERE deletedAt IS NULL AND goalId IS NOT NULL AND TRIM(goalId) != ''
          UNION ALL
          SELECT gt.root_id, g.carriedFromGoalId AS current_id, gt.depth + 1
          FROM daily_goals g
          JOIN goal_tree gt ON g.id = gt.current_id
          WHERE g.carriedFromGoalId IS NOT NULL AND TRIM(g.carriedFromGoalId) != ''
            AND gt.depth < 50
        ),
        unique_tree AS (
          SELECT DISTINCT root_id, current_id FROM goal_tree
        )
        SELECT 
          gt.root_id AS goalId,
          ROUND(COALESCE(SUM(
            CASE
              WHEN l.productivity = 'break' THEN 0
              ELSE COALESCE(l.productiveMinutes, l.durationMinutes, 0)
            END
          ), 0)) AS totalMinutes
        FROM unique_tree gt
        JOIN logs l ON l.goalId = gt.current_id AND l.deletedAt IS NULL
        GROUP BY gt.root_id
      `),
      getGoalCumulativeMinutesScoped: db.prepare(`
        WITH RECURSIVE goal_tree(root_id, current_id, depth) AS (
          SELECT value AS root_id, value AS current_id, 0 AS depth
          FROM json_each(?)
          UNION ALL
          SELECT gt.root_id, g.carriedFromGoalId AS current_id, gt.depth + 1
          FROM daily_goals g
          JOIN goal_tree gt ON g.id = gt.current_id
          WHERE g.carriedFromGoalId IS NOT NULL AND TRIM(g.carriedFromGoalId) != ''
            AND gt.depth < 50
        ),
        unique_tree AS (
          SELECT DISTINCT root_id, current_id FROM goal_tree
        )
        SELECT 
          gt.root_id AS goalId,
          ROUND(COALESCE(SUM(
            CASE
              WHEN l.productivity = 'break' THEN 0
              ELSE COALESCE(l.productiveMinutes, l.durationMinutes, 0)
            END
          ), 0)) AS totalMinutes
        FROM unique_tree gt
        JOIN logs l ON l.goalId = gt.current_id AND l.deletedAt IS NULL
        GROUP BY gt.root_id
      `),
      getHeatmapGoalsAgg: db.prepare(`
        SELECT COALESCE(effectiveDate, date) AS effectiveDate, COUNT(id) as count
        FROM daily_goals
        WHERE deletedAt IS NULL AND status = 'done'
        GROUP BY COALESCE(effectiveDate, date)
      `),
      getHeatmapGoalsSinceAgg: db.prepare(`
        SELECT COALESCE(effectiveDate, date) AS effectiveDate, COUNT(id) as count
        FROM daily_goals
        WHERE deletedAt IS NULL AND status = 'done'
          AND (effectiveDate >= ? OR (effectiveDate IS NULL AND date >= ?))
        GROUP BY COALESCE(effectiveDate, date)
      `)
    }
  }

  public getDb(): Database.Database {
    return this.db
  }

  public invalidateGoalMinutesCache(): void {
    this.cachedGoalMinutesMap = null
  }

  public async getGoalLoggedMinutesMap(targetGoalIds?: string[]): Promise<Record<string, number>> {
    if (this.cachedGoalMinutesMap) {
      if (targetGoalIds && targetGoalIds.length > 0) {
        const scoped: Record<string, number> = {}
        for (const id of targetGoalIds) {
          scoped[id] = this.cachedGoalMinutesMap[id] || 0
        }
        return scoped
      }
      return { ...this.cachedGoalMinutesMap }
    }

    if (targetGoalIds && targetGoalIds.length > 0) {
      const rows = this.stmts.getGoalCumulativeMinutesScoped.all(JSON.stringify(targetGoalIds)) as {
        goalId: string
        totalMinutes: number
      }[]

      const scoped: Record<string, number> = {}
      for (const id of targetGoalIds) {
        scoped[id] = 0
      }
      for (const row of rows) {
        scoped[row.goalId] = Math.max(0, Math.round(row.totalMinutes))
      }
      return scoped
    }

    const rows = this.stmts.getGoalCumulativeMinutesAll.all() as {
      goalId: string
      totalMinutes: number
    }[]

    const resultMap: Record<string, number> = {}
    for (const row of rows) {
      resultMap[row.goalId] = Math.max(0, Math.round(row.totalMinutes))
    }

    this.cachedGoalMinutesMap = resultMap
    return { ...resultMap }
  }

  public productiveMinutes(log: LogEntry): number {
    if (typeof log.productiveMinutes === 'number') {
      return Math.max(0, Math.round(log.productiveMinutes))
    }
    if (log.productivity === 'productive') {
      return Math.max(0, Math.round(log.durationMinutes ?? 0))
    }
    return 0
  }

  public async getDayReview(date: string): Promise<DayReviewData> {
    if (!this.db || !this.db.open) {
      return {
        date,
        goals: [],
        logs: [],
        totalProductiveMinutes: 0,
        goalBreakdown: [],
        otherProductiveMinutes: 0,
        unclassifiedLogs: []
      }
    }
    assertValidDate(date)
    const today = this.settingsRepo.getTodayDate()
    const isToday = date === today
    const [dayGoals, logs] = await Promise.all([
      isToday ? this.goalsRepo.getBoardGoals(date) : this.goalsRepo.getDayReviewGoals(date),
      this.logsRepo.getLogs(date)
    ])
    const goalMap = new Map<string, GoalBreakdown>()
    const relevantGoalsMap = new Map<string, DailyGoal>()

    for (const goal of dayGoals) {
      goalMap.set(goal.id, {
        goalId: goal.id,
        title: goal.title,
        productiveMinutes: 0,
        targetMinutes: goal.targetMinutes,
        logs: [],
        status: goal.status
      })
      relevantGoalsMap.set(goal.id, goal)
    }

    let otherProductiveMinutes = 0
    const unclassifiedLogs: LogEntry[] = []

    const missingGoalIds = Array.from(
      new Set(
        logs.map((l) => l.goalId).filter((id): id is string => Boolean(id && !goalMap.has(id)))
      )
    )

    const resolvedMissingGoals = new Map<string, DailyGoal>()
    if (missingGoalIds.length > 0) {
      const missingGoals = await this.goalsRepo.getGoalsByIds(missingGoalIds)
      for (const goal of missingGoals) {
        resolvedMissingGoals.set(goal.id, goal)
      }
    }

    for (const log of logs) {
      const pm = this.productiveMinutes(log)
      if (!log.productivity) unclassifiedLogs.push(log)

      if (log.goalId) {
        const existing = goalMap.get(log.goalId)
        if (existing) {
          existing.logs.push(log)
          existing.productiveMinutes += pm
        } else {
          const srcGoal =
            dayGoals.find((g) => g.id === log.goalId) || resolvedMissingGoals.get(log.goalId)
          const effectiveTitle = log.goalTitle || srcGoal?.title || 'Completed task'
          const effectiveGoal: DailyGoal = srcGoal || {
            id: log.goalId,
            date,
            title: effectiveTitle,
            status: 'done' as const,
            createdAt: log.timestamp || new Date().toISOString()
          }
          relevantGoalsMap.set(effectiveGoal.id, effectiveGoal)

          goalMap.set(log.goalId, {
            goalId: log.goalId,
            title: effectiveTitle,
            productiveMinutes: pm,
            targetMinutes: effectiveGoal.targetMinutes,
            logs: [log],
            status: effectiveGoal.status || 'done'
          })
        }
      } else {
        otherProductiveMinutes += pm
      }
    }

    const goalBreakdown = Array.from(goalMap.values())
    const totalProductiveMinutes =
      goalBreakdown.reduce((sum, g) => sum + g.productiveMinutes, 0) + otherProductiveMinutes

    const ratedLogs = logs.filter(
      (l) =>
        typeof l.focusQuality === 'number' &&
        l.focusQuality >= 1 &&
        l.focusQuality <= 5 &&
        l.productivity !== 'break'
    )
    const averageFocusQuality =
      ratedLogs.length > 0
        ? Math.round(
            (ratedLogs.reduce((acc, l) => acc + (l.focusQuality || 0), 0) / ratedLogs.length) * 10
          ) / 10
        : undefined

    const dayGoalsList = Array.from(relevantGoalsMap.values())
    const evaluations = this.evaluationRepo
      ? this.evaluationRepo.getEvaluationsForEntity('day_review', date)
      : []
    const antiCheatSummary = this.evaluationRepo
      ? this.evaluationRepo.getAntiCheatSummary(date, logs, dayGoalsList)
      : undefined

    return {
      date,
      goals: dayGoalsList,
      logs,
      totalProductiveMinutes,
      goalBreakdown,
      otherProductiveMinutes,
      unclassifiedLogs,
      averageFocusQuality,
      evaluations,
      antiCheatSummary
    }
  }

  public async getHeatmapData(startDate?: string): Promise<Record<string, number>> {
    const heatmap: Record<string, number> = {}
    const breakdown = await this.getHeatmapBreakdown(startDate)
    for (const [date, item] of Object.entries(breakdown)) {
      heatmap[date] = item.total
    }
    return heatmap
  }

  public async getHeatmapBreakdown(startDate?: string): Promise<Record<string, HeatmapBreakdown>> {
    const result: Record<string, HeatmapBreakdown> = {}
    if (!this.db || !this.db.open) {
      return result
    }
    try {
      const logRows = (
        startDate
          ? this.logsRepo.stmts.getHeatmapLogsSince.all(startDate)
          : this.logsRepo.stmts.getHeatmapLogs.all()
      ) as { date: string; count: number }[]
      for (const row of logRows) {
        if (DATE_RE.test(row.date)) {
          if (!result[row.date]) {
            result[row.date] = { sessions: 0, completedGoals: 0, total: 0 }
          }
          result[row.date].sessions += row.count
          result[row.date].total += row.count
        }
      }

      const goalRows = (
        startDate
          ? this.stmts.getHeatmapGoalsSinceAgg.all(startDate, startDate)
          : this.stmts.getHeatmapGoalsAgg.all()
      ) as {
        effectiveDate: string
        count: number
      }[]
      for (const row of goalRows) {
        if (DATE_RE.test(row.effectiveDate)) {
          if (!result[row.effectiveDate]) {
            result[row.effectiveDate] = { sessions: 0, completedGoals: 0, total: 0 }
          }
          result[row.effectiveDate].completedGoals += row.count
          result[row.effectiveDate].total += row.count
        }
      }
    } catch (error) {
      logger.error('db', 'Failed to generate heatmap breakdown:', error)
    }
    return result
  }
}
