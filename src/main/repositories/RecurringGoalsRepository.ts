import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { DailyGoal, RecurringGoal, RecurringFrequency, shiftDate } from '../../shared/types'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function assertValidDate(date: string, label = 'date'): void {
  if (!DATE_RE.test(date)) {
    throw new Error(`Invalid ${label}: "${date}" — expected YYYY-MM-DD`)
  }
}

export interface RecurringDirtyCallbacks {
  markDirtyRecurring?: () => void
  markDirtyGoalDate?: (date: string) => void
}

export class RecurringGoalsRepository {
  private db: Database.Database
  private callbacks?: RecurringDirtyCallbacks
  private getPurgedIdsFn?: () => Promise<Set<string>>
  private getGoalsFn?: (date: string, includeDeleted?: boolean) => Promise<DailyGoal[]>
  private inFlightGenerations = new Map<string, Promise<DailyGoal[]>>()
  private lastGeneratedDate: string | null = null

  public stmts: {
    getRecurringGoals: Database.Statement
    getRecurringGoalsIncludingDeleted: Database.Statement
    getRecurringGoalById: Database.Statement
    upsertRecurringGoal: Database.Statement
    deleteRecurringGoal: Database.Statement
    deleteRecurringGoalById: Database.Statement
    hasGoalForRecurringAndDate: Database.Statement
    getMaxGoalSortOrder: Database.Statement
    getGoalsIncludingDeleted: Database.Statement
    insertDailyGoal: Database.Statement
  }

  constructor(
    db: Database.Database,
    callbacks?: RecurringDirtyCallbacks,
    getPurgedIds?: () => Promise<Set<string>>,
    getGoals?: (date: string, includeDeleted?: boolean) => Promise<DailyGoal[]>
  ) {
    this.db = db
    this.callbacks = callbacks
    this.getPurgedIdsFn = getPurgedIds
    this.getGoalsFn = getGoals

    this.stmts = {
      getRecurringGoals: this.db.prepare(`
        SELECT * FROM recurring_goals
        WHERE deletedAt IS NULL
        ORDER BY createdAt ASC
      `),
      getRecurringGoalsIncludingDeleted: this.db.prepare(`
        SELECT * FROM recurring_goals
        ORDER BY createdAt ASC
      `),
      getRecurringGoalById: this.db.prepare(`
        SELECT * FROM recurring_goals
        WHERE id = ? AND deletedAt IS NULL
      `),
      upsertRecurringGoal: this.db.prepare(`
        INSERT INTO recurring_goals (id, title, targetMinutes, frequency, startsOn, endsOn, status, createdAt, pausedAt, deletedAt, updatedAt)
        VALUES (@id, @title, @targetMinutes, @frequency, @startsOn, @endsOn, @status, @createdAt, @pausedAt, @deletedAt, @updatedAt)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          targetMinutes = excluded.targetMinutes,
          frequency = excluded.frequency,
          startsOn = excluded.startsOn,
          endsOn = excluded.endsOn,
          status = excluded.status,
          pausedAt = excluded.pausedAt,
          deletedAt = excluded.deletedAt,
          updatedAt = excluded.updatedAt
      `),
      deleteRecurringGoal: this.db.prepare(`
        UPDATE recurring_goals
        SET deletedAt = ?, updatedAt = ?, status = 'deleted'
        WHERE id = ? AND deletedAt IS NULL
      `),
      deleteRecurringGoalById: this.db.prepare(`
        DELETE FROM recurring_goals WHERE id = ?
      `),
      hasGoalForRecurringAndDate: this.db.prepare(`
        SELECT 1 FROM daily_goals
        WHERE sourceRecurringGoalId = ? AND date = ?
        LIMIT 1
      `),
      getMaxGoalSortOrder: this.db.prepare(`
        SELECT MAX(sortOrder) as maxSort FROM daily_goals
        WHERE date = ? AND deletedAt IS NULL
      `),
      getGoalsIncludingDeleted: this.db.prepare(`
        SELECT * FROM daily_goals
        WHERE date = ?
        ORDER BY sortOrder ASC, createdAt ASC
      `),
      insertDailyGoal: this.db.prepare(`
        INSERT INTO daily_goals (
          id, date, title, status, targetMinutes, deadline,
          sourceInboxGoalId, sourceRecurringGoalId, createdAt,
          completedAt, carriedFromDate, carriedToDate, carriedFromGoalId,
          note, remindAt, repeat, groupTag, groupColor, sortOrder, restoredAt, updatedAt, deletedAt
        )
        VALUES (
          @id, @date, @title, @status, @targetMinutes, @deadline,
          @sourceInboxGoalId, @sourceRecurringGoalId, @createdAt,
          @completedAt, @carriedFromDate, @carriedToDate, @carriedFromGoalId,
          @note, @remindAt, @repeat, @groupTag, @groupColor, @sortOrder, @restoredAt, @updatedAt, @deletedAt
        )
      `)
    }
  }

  public recurringParams(goal: RecurringGoal): Record<string, unknown> {
    return {
      ...goal,
      targetMinutes: goal.targetMinutes ?? null,
      endsOn: goal.endsOn ?? null,
      pausedAt: goal.pausedAt ?? null,
      deletedAt: goal.deletedAt ?? null,
      updatedAt: goal.updatedAt ?? new Date().toISOString()
    }
  }

  private goalParams(goal: DailyGoal): Record<string, unknown> {
    return {
      id: goal.id,
      date: goal.date,
      title: goal.title,
      status: goal.status,
      targetMinutes: goal.targetMinutes ?? null,
      deadline: goal.deadline ?? null,
      sourceInboxGoalId: goal.sourceInboxGoalId ?? null,
      sourceRecurringGoalId: goal.sourceRecurringGoalId ?? null,
      createdAt: goal.createdAt,
      completedAt: goal.completedAt ?? null,
      carriedFromDate: goal.carriedFromDate ?? null,
      carriedToDate: goal.carriedToDate ?? null,
      carriedFromGoalId: goal.carriedFromGoalId ?? null,
      note: goal.note ?? null,
      remindAt: goal.remindAt ?? null,
      repeat: goal.repeat ?? null,
      groupTag: goal.groupTag ?? null,
      groupColor: goal.groupColor ?? null,
      sortOrder: goal.sortOrder ?? null,
      updatedAt: goal.updatedAt ?? new Date().toISOString(),
      deletedAt: goal.deletedAt ?? null,
      restoredAt: goal.restoredAt ?? null
    }
  }

  private mapGoalRow(r: DailyGoal & { sortOrder: number | null }): DailyGoal {
    return {
      id: r.id,
      date: r.date,
      title: r.title,
      status: r.status,
      targetMinutes: r.targetMinutes ?? undefined,
      deadline: r.deadline ?? undefined,
      sourceInboxGoalId: r.sourceInboxGoalId ?? undefined,
      sourceRecurringGoalId: r.sourceRecurringGoalId ?? undefined,
      createdAt: r.createdAt,
      completedAt: r.completedAt ?? undefined,
      carriedFromDate: r.carriedFromDate ?? undefined,
      carriedToDate: r.carriedToDate ?? undefined,
      carriedFromGoalId: r.carriedFromGoalId ?? undefined,
      note: r.note ?? undefined,
      remindAt: r.remindAt ?? undefined,
      repeat: r.repeat ?? undefined,
      groupTag: r.groupTag ?? undefined,
      groupColor: r.groupColor ?? undefined,
      sortOrder: r.sortOrder ?? undefined,
      updatedAt: r.updatedAt ?? undefined,
      deletedAt: r.deletedAt ?? undefined,
      restoredAt: r.restoredAt ?? undefined
    }
  }

  public upsertRecurringGoal(recurring: RecurringGoal): void {
    this.stmts.upsertRecurringGoal.run(this.recurringParams(recurring))
  }

  public async getRecurringGoals(includeDeleted = false): Promise<RecurringGoal[]> {
    if (!this.db || !this.db.open) return []
    const stmt = includeDeleted
      ? this.stmts.getRecurringGoalsIncludingDeleted
      : this.stmts.getRecurringGoals
    const rows = stmt.all() as RecurringGoal[]
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      targetMinutes: r.targetMinutes ?? undefined,
      frequency: (r.frequency || 'daily') as RecurringFrequency,
      startsOn: r.startsOn,
      endsOn: r.endsOn ?? undefined,
      status: (r.status || 'active') as 'active' | 'paused' | 'deleted',
      createdAt: r.createdAt,
      pausedAt: r.pausedAt ?? undefined,
      deletedAt: r.deletedAt ?? undefined,
      updatedAt: r.updatedAt ?? undefined
    }))
  }

  public async getRecurringGoalById(id: string): Promise<RecurringGoal | null> {
    const row = this.stmts.getRecurringGoalById.get(id) as RecurringGoal | undefined
    if (!row) return null
    return {
      id: row.id,
      title: row.title,
      targetMinutes: row.targetMinutes ?? undefined,
      frequency: (row.frequency || 'daily') as RecurringFrequency,
      startsOn: row.startsOn,
      endsOn: row.endsOn ?? undefined,
      status: (row.status || 'active') as 'active' | 'paused' | 'deleted',
      createdAt: row.createdAt,
      pausedAt: row.pausedAt ?? undefined,
      deletedAt: row.deletedAt ?? undefined,
      updatedAt: row.updatedAt ?? undefined
    }
  }

  public async setRecurringGoals(goals: RecurringGoal[], isSyncApply = false): Promise<void> {
    const purgedIds =
      isSyncApply && this.getPurgedIdsFn ? await this.getPurgedIdsFn() : new Set<string>()
    const existingIds = new Set(
      (this.stmts.getRecurringGoals.all() as { id: string }[]).map((r) => r.id)
    )
    const filteredGoals = goals.filter((g) => !purgedIds.has(g.id))
    const incomingIds = new Set(filteredGoals.map((g) => g.id))

    const tx = this.db.transaction(() => {
      const now = new Date().toISOString()
      for (const goal of filteredGoals) {
        this.stmts.upsertRecurringGoal.run(this.recurringParams(goal))
      }
      for (const id of existingIds) {
        if (!incomingIds.has(id)) {
          this.stmts.deleteRecurringGoal.run(now, now, id)
        }
      }
    })
    tx()
    if (!isSyncApply) {
      this.callbacks?.markDirtyRecurring?.()
    }
  }

  public async deleteRecurringGoal(id: string): Promise<void> {
    const now = new Date().toISOString()
    this.stmts.deleteRecurringGoal.run(now, now, id)
    this.callbacks?.markDirtyRecurring?.()
    this.lastGeneratedDate = null
  }

  public async addRecurringGoal(
    title: string,
    targetMinutes: number | undefined,
    startsOn: string,
    endsOn?: string,
    frequency: RecurringFrequency = 'daily'
  ): Promise<RecurringGoal> {
    assertValidDate(startsOn, 'startsOn')
    if (endsOn) assertValidDate(endsOn, 'endsOn')
    const trimmed = title.trim()
    if (!trimmed) throw new Error('Recurring goal title is required')

    const goal: RecurringGoal = {
      id: randomUUID(),
      title: trimmed,
      targetMinutes: targetMinutes && targetMinutes > 0 ? Math.round(targetMinutes) : undefined,
      frequency: frequency || 'daily',
      startsOn,
      endsOn: endsOn ?? undefined,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    this.stmts.upsertRecurringGoal.run(this.recurringParams(goal))
    this.callbacks?.markDirtyRecurring?.()
    this.lastGeneratedDate = null
    return goal
  }

  public async updateRecurringGoal(goal: RecurringGoal): Promise<RecurringGoal> {
    const now = new Date().toISOString()
    const nextGoal: RecurringGoal = {
      ...goal,
      title: goal.title.trim(),
      targetMinutes:
        goal.targetMinutes && goal.targetMinutes > 0 ? Math.round(goal.targetMinutes) : undefined,
      frequency: goal.frequency || 'daily',
      pausedAt: goal.status === 'paused' ? goal.pausedAt || now : goal.pausedAt,
      deletedAt: goal.status === 'deleted' ? goal.deletedAt || now : goal.deletedAt,
      updatedAt: now
    }

    this.stmts.upsertRecurringGoal.run(this.recurringParams(nextGoal))
    this.callbacks?.markDirtyRecurring?.()
    this.lastGeneratedDate = null
    return nextGoal
  }

  public async generateTodayGoals(date: string, force = false): Promise<DailyGoal[]> {
    if (!this.db || !this.db.open) return []
    assertValidDate(date)
    if (!force && this.lastGeneratedDate === date && this.getGoalsFn) {
      return this.getGoalsFn(date)
    }
    const inFlight = this.inFlightGenerations.get(date)
    if (inFlight) {
      return inFlight
    }

    const execution = this.executeGenerateTodayGoals(date)
      .then((goals) => {
        this.lastGeneratedDate = date
        return goals
      })
      .finally(() => {
        this.inFlightGenerations.delete(date)
      })
    this.inFlightGenerations.set(date, execution)
    return execution
  }

  private async executeGenerateTodayGoals(date: string): Promise<DailyGoal[]> {
    const generateTx = this.db.transaction(() => {
      const recurringRows = this.stmts.getRecurringGoals.all() as RecurringGoal[]
      const recurringGoals = recurringRows.map((r) => ({
        ...r,
        targetMinutes:
          typeof r.targetMinutes === 'number' && Number.isFinite(r.targetMinutes)
            ? r.targetMinutes
            : undefined
      }))

      const dailyRows = this.stmts.getGoalsIncludingDeleted.all(date) as (DailyGoal & {
        sortOrder: number | null
      })[]
      const allDailyGoals = dailyRows.map((r) => this.mapGoalRow(r))
      const activeDailyGoals = allDailyGoals.filter((g) => !g.deletedAt)
      const nextDailyGoals = [...activeDailyGoals]

      const [year, month, day] = date.split('-').map(Number)
      const currentDayOfWeek = new Date(year, month - 1, day).getDay()

      const goalsToInsert: DailyGoal[] = []
      const maxSortByDate = new Map<string, number>()
      const getMaxSortForDate = (d: string): number => {
        if (maxSortByDate.has(d)) {
          return maxSortByDate.get(d)!
        }
        const maxSortRow = this.stmts.getMaxGoalSortOrder.get(d) as
          { maxSort: number | null } | undefined
        const baseMax =
          typeof maxSortRow?.maxSort === 'number' && Number.isFinite(maxSortRow.maxSort)
            ? maxSortRow.maxSort
            : 0
        maxSortByDate.set(d, baseMax)
        return baseMax
      }

      for (const recurringGoal of recurringGoals) {
        if (recurringGoal.status !== 'active') continue
        if (recurringGoal.startsOn && date < recurringGoal.startsOn) continue
        if (recurringGoal.endsOn && date > recurringGoal.endsOn) continue

        const freq = recurringGoal.frequency || 'daily'
        if (freq === 'weekdays' && (currentDayOfWeek === 0 || currentDayOfWeek === 6)) {
          continue
        }
        if (freq === 'weekends' && currentDayOfWeek !== 0 && currentDayOfWeek !== 6) {
          continue
        }
        let scheduledDate = date
        let isCatchUp = false
        if (freq === 'weekly') {
          const [sYear, sMonth, sDay] = recurringGoal.startsOn.split('-').map(Number)
          const startDayOfWeek = new Date(sYear, sMonth - 1, sDay).getDay()
          const daysSinceScheduled = (currentDayOfWeek - startDayOfWeek + 7) % 7
          scheduledDate = daysSinceScheduled === 0 ? date : shiftDate(date, -daysSinceScheduled)
          if (scheduledDate < recurringGoal.startsOn) {
            continue
          }
          if (recurringGoal.endsOn && scheduledDate > recurringGoal.endsOn) {
            continue
          }
          isCatchUp = daysSinceScheduled !== 0
        }

        const alreadyHandled =
          allDailyGoals.some((goal) => goal.sourceRecurringGoalId === recurringGoal.id) ||
          Boolean(this.stmts.hasGoalForRecurringAndDate.get(recurringGoal.id, date)) ||
          Boolean(this.stmts.hasGoalForRecurringAndDate.get(recurringGoal.id, scheduledDate))
        if (alreadyHandled) continue

        const now = new Date().toISOString()
        const nextSort = getMaxSortForDate(date) + 1000
        maxSortByDate.set(date, nextSort)

        // If catching up from an earlier dormant day of the week, insert the scheduled day's record carried forward to today
        if (isCatchUp) {
          const histSort = getMaxSortForDate(scheduledDate) + 1000
          maxSortByDate.set(scheduledDate, histSort)
          const historicalGoal: DailyGoal = {
            id: randomUUID(),
            date: scheduledDate,
            title: recurringGoal.title,
            status: 'planned',
            carriedToDate: date,
            targetMinutes: recurringGoal.targetMinutes,
            sourceRecurringGoalId: recurringGoal.id,
            sortOrder: histSort,
            createdAt: now,
            updatedAt: now
          }
          goalsToInsert.push(historicalGoal)
        }

        const newGoal: DailyGoal = {
          id: randomUUID(),
          date: date,
          carriedFromDate: isCatchUp ? scheduledDate : undefined,
          title: recurringGoal.title,
          status: 'planned',
          targetMinutes: recurringGoal.targetMinutes,
          sourceRecurringGoalId: recurringGoal.id,
          sortOrder: nextSort,
          createdAt: now,
          updatedAt: now
        }
        nextDailyGoals.push(newGoal)
        allDailyGoals.push(newGoal)
        goalsToInsert.push(newGoal)
      }

      if (goalsToInsert.length > 0) {
        for (const goal of goalsToInsert) {
          this.stmts.insertDailyGoal.run(this.goalParams(goal))
          this.callbacks?.markDirtyGoalDate?.(goal.date)
          this.callbacks?.markDirtyGoalDate?.(date)
        }
      }

      return nextDailyGoals
    })

    return generateTx()
  }
}
