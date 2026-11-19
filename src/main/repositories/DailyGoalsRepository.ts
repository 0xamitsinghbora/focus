import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { DailyGoal, localDateStr } from '../../shared/types'
import { SettingsRepository } from './SettingsRepository'
import { LogsRepository } from './LogsRepository'
import { InboxRepository } from './InboxRepository'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function assertValidDate(date: string, label = 'date'): void {
  if (!DATE_RE.test(date)) {
    throw new Error(`Invalid ${label}: "${date}" — expected YYYY-MM-DD`)
  }
}

export interface DailyGoalsDirtyCallbacks {
  markDirtyGoalDate: (date: string) => void
  invalidateMinutesCache?: () => void
}

export class DailyGoalsRepository {
  private db: Database.Database
  private settingsRepo: SettingsRepository
  public logsRepo: LogsRepository
  private inboxRepo?: InboxRepository
  private callbacks?: DailyGoalsDirtyCallbacks
  private getPurgedIdsFn?: () => Promise<Set<string>>

  public stmts: {
    getGoals: Database.Statement
    getGoalsIncludingDeleted: Database.Statement
    getDayReviewGoals: Database.Statement
    getGoalById: Database.Statement
    getGoalByIdIncludingDeleted: Database.Statement
    getBoardGoals: Database.Statement
    insertDailyGoal: Database.Statement
    upsertDailyGoal: Database.Statement
    updateDailyGoal: Database.Statement
    deleteDailyGoal: Database.Statement
    markCarriedDailyGoal: Database.Statement
    deleteGoal: Database.Statement
    deleteGoalById: Database.Statement
    getGoalsByIdsIncludingDeleted: Database.Statement
    getMaxGoalSortOrder: Database.Statement
    getDatesForGroupColorUpdate: Database.Statement
    updateGroupColorAcrossGoals: Database.Statement
    getDatesForGroupRename: Database.Statement
    updateGroupTagAndColorAcrossGoals: Database.Statement
    updateGroupTagAcrossGoals: Database.Statement
    getAllGoalDates: Database.Statement
    getAllGoalDatesIncludingDeleted: Database.Statement
    getCarriedGoalTarget: Database.Statement
  }

  constructor(
    db: Database.Database,
    settingsRepo: SettingsRepository,
    logsRepo: LogsRepository,
    callbacks?: DailyGoalsDirtyCallbacks,
    inboxRepo?: InboxRepository,
    getPurgedIds?: () => Promise<Set<string>>
  ) {
    this.db = db
    this.settingsRepo = settingsRepo
    this.logsRepo = logsRepo
    this.inboxRepo = inboxRepo
    this.callbacks = callbacks
    this.getPurgedIdsFn = getPurgedIds

    this.stmts = {
      getGoals: this.db.prepare(`
        SELECT * FROM daily_goals
        WHERE date = ? AND deletedAt IS NULL
        ORDER BY CASE WHEN sortOrder IS NULL THEN 1 ELSE 0 END, sortOrder ASC, createdAt ASC
      `),
      getGoalsIncludingDeleted: this.db.prepare(`
        SELECT * FROM daily_goals
        WHERE date = ?
        ORDER BY CASE WHEN sortOrder IS NULL THEN 1 ELSE 0 END, sortOrder ASC, createdAt ASC
      `),
      getDayReviewGoals: this.db.prepare(`
        SELECT * FROM daily_goals
        WHERE (
          (date = @date AND (deletedAt IS NULL OR carriedToDate IS NOT NULL))
          OR (deletedAt IS NULL AND (effectiveDate = @date OR (effectiveDate IS NULL AND date = @date)))
        )
        ORDER BY CASE WHEN sortOrder IS NULL THEN 1 ELSE 0 END, sortOrder ASC, createdAt ASC
      `),
      getGoalById: this.db.prepare(`
        SELECT * FROM daily_goals
        WHERE id = ? AND deletedAt IS NULL
      `),
      getGoalByIdIncludingDeleted: this.db.prepare(`
        SELECT * FROM daily_goals WHERE id = ?
      `),
      getBoardGoals: this.db.prepare(`
        SELECT * FROM daily_goals
        WHERE deletedAt IS NULL
          AND (
            (
              status = 'planned'
              AND (
                (deadline IS NOT NULL AND deadline != '' AND substr(deadline, 1, 10) <= @today)
                OR ((deadline IS NULL OR deadline = '') AND date <= @today)
              )
              AND (@horizonDate IS NULL OR date >= @horizonDate OR (deadline IS NOT NULL AND deadline != '' AND (date(deadline) >= @horizonDate OR deadline >= @horizonDate)))
              AND (carriedToDate IS NULL OR carriedToDate = '')
            )
            OR (
              status = 'in_progress'
              AND (carriedToDate IS NULL OR carriedToDate = '')
            )
            OR (
              status = 'done'
              AND (effectiveDate = @today OR (effectiveDate IS NULL AND date = @today))
            )
          )
        ORDER BY CASE WHEN sortOrder IS NULL THEN 1 ELSE 0 END, sortOrder ASC, createdAt ASC
      `),
      insertDailyGoal: this.db.prepare(`
        INSERT INTO daily_goals (
          id, date, effectiveDate, title, status, targetMinutes, deadline,
          sourceInboxGoalId, sourceRecurringGoalId, createdAt,
          completedAt, carriedFromDate, carriedToDate, carriedFromGoalId,
          note, remindAt, repeat, groupTag, groupColor, sortOrder, restoredAt, updatedAt, deletedAt
        )
        VALUES (
          @id, @date, @effectiveDate, @title, @status, @targetMinutes, @deadline,
          @sourceInboxGoalId, @sourceRecurringGoalId, @createdAt,
          @completedAt, @carriedFromDate, @carriedToDate, @carriedFromGoalId,
          @note, @remindAt, @repeat, @groupTag, @groupColor, @sortOrder, @restoredAt, @updatedAt, @deletedAt
        )
      `),
      upsertDailyGoal: this.db.prepare(`
        INSERT INTO daily_goals (
          id, date, effectiveDate, title, status, targetMinutes, deadline,
          sourceInboxGoalId, sourceRecurringGoalId, createdAt,
          completedAt, carriedFromDate, carriedToDate, carriedFromGoalId,
          note, remindAt, repeat, groupTag, groupColor, sortOrder, restoredAt, updatedAt, deletedAt
        )
        VALUES (
          @id, @date, @effectiveDate, @title, @status, @targetMinutes, @deadline,
          @sourceInboxGoalId, @sourceRecurringGoalId, @createdAt,
          @completedAt, @carriedFromDate, @carriedToDate, @carriedFromGoalId,
          @note, @remindAt, @repeat, @groupTag, @groupColor, @sortOrder, @restoredAt, @updatedAt, @deletedAt
        )
        ON CONFLICT(id) DO UPDATE SET
          date = excluded.date,
          effectiveDate = excluded.effectiveDate,
          title = excluded.title,
          status = excluded.status,
          targetMinutes = excluded.targetMinutes,
          deadline = excluded.deadline,
          sourceInboxGoalId = excluded.sourceInboxGoalId,
          sourceRecurringGoalId = excluded.sourceRecurringGoalId,
          completedAt = excluded.completedAt,
          carriedFromDate = excluded.carriedFromDate,
          carriedToDate = excluded.carriedToDate,
          carriedFromGoalId = excluded.carriedFromGoalId,
          note = excluded.note,
          remindAt = excluded.remindAt,
          repeat = excluded.repeat,
          groupTag = excluded.groupTag,
          groupColor = excluded.groupColor,
          sortOrder = excluded.sortOrder,
          restoredAt = excluded.restoredAt,
          updatedAt = excluded.updatedAt,
          deletedAt = excluded.deletedAt
      `),
      updateDailyGoal: this.db.prepare(`
        UPDATE daily_goals SET
          date = @date,
          effectiveDate = @effectiveDate,
          title = @title,
          status = @status,
          targetMinutes = @targetMinutes,
          deadline = @deadline,
          sourceInboxGoalId = @sourceInboxGoalId,
          sourceRecurringGoalId = @sourceRecurringGoalId,
          completedAt = @completedAt,
          carriedFromDate = @carriedFromDate,
          carriedToDate = @carriedToDate,
          carriedFromGoalId = @carriedFromGoalId,
          note = @note,
          remindAt = @remindAt,
          repeat = @repeat,
          groupTag = @groupTag,
          groupColor = @groupColor,
          sortOrder = @sortOrder,
          restoredAt = @restoredAt,
          updatedAt = @updatedAt,
          deletedAt = @deletedAt
        WHERE id = @id
      `),
      deleteDailyGoal: this.db.prepare(`
        UPDATE daily_goals
        SET deletedAt = ?, updatedAt = ?
        WHERE date = ? AND deletedAt IS NULL
      `),
      markCarriedDailyGoal: this.db.prepare(`
        UPDATE daily_goals
        SET carriedToDate = ?, deletedAt = ?, updatedAt = ?
        WHERE id = ? AND deletedAt IS NULL
      `),
      deleteGoal: this.db.prepare(`
        UPDATE daily_goals
        SET deletedAt = ?, updatedAt = ?
        WHERE id = ? AND deletedAt IS NULL
      `),
      deleteGoalById: this.db.prepare(`
        DELETE FROM daily_goals WHERE id = ?
      `),
      getGoalsByIdsIncludingDeleted: this.db.prepare(`
        SELECT * FROM daily_goals WHERE id IN (SELECT value FROM json_each(?))
      `),
      getMaxGoalSortOrder: this.db.prepare(`
        SELECT MAX(sortOrder) as maxSort FROM daily_goals
        WHERE date = ? AND deletedAt IS NULL
      `),
      getDatesForGroupColorUpdate: this.db.prepare(`
        SELECT DISTINCT date FROM daily_goals
        WHERE groupTag = ? AND deletedAt IS NULL
          AND (groupColor IS NULL OR groupColor != ?)
      `),
      updateGroupColorAcrossGoals: this.db.prepare(`
        UPDATE daily_goals
        SET groupColor = ?, updatedAt = ?
        WHERE groupTag = ? AND deletedAt IS NULL
      `),
      getDatesForGroupRename: this.db.prepare(`
        SELECT DISTINCT date FROM daily_goals
        WHERE groupTag = ? AND deletedAt IS NULL
      `),
      updateGroupTagAndColorAcrossGoals: this.db.prepare(`
        UPDATE daily_goals
        SET groupTag = ?, groupColor = ?, updatedAt = ?
        WHERE groupTag = ? AND deletedAt IS NULL
      `),
      updateGroupTagAcrossGoals: this.db.prepare(`
        UPDATE daily_goals
        SET groupTag = ?, updatedAt = ?
        WHERE groupTag = ? AND deletedAt IS NULL
      `),
      getAllGoalDates: this.db.prepare(`
        SELECT DISTINCT date FROM daily_goals
        WHERE deletedAt IS NULL
        ORDER BY date ASC
      `),
      getAllGoalDatesIncludingDeleted: this.db.prepare(`
        SELECT DISTINCT date FROM daily_goals
        ORDER BY date ASC
      `),
      getCarriedGoalTarget: this.db.prepare(`
        SELECT * FROM daily_goals
        WHERE carriedFromGoalId = ? AND date = ? AND deletedAt IS NULL
      `)
    }
  }

  public mapGoalRow(r: DailyGoal & { sortOrder: number | null }): DailyGoal {
    return {
      id: r.id,
      date: r.date,
      effectiveDate: r.effectiveDate ?? undefined,
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

  private computeEffectiveDate(goal: DailyGoal): string {
    if (goal.status === 'done' && goal.completedAt) {
      try {
        const cutoff = this.settingsRepo ? this.settingsRepo.getSettings().dayCutoffHour || 0 : 0
        return localDateStr(new Date(goal.completedAt), cutoff)
      } catch {
        return goal.date
      }
    }
    return goal.date
  }

  public goalParams(goal: DailyGoal): Record<string, unknown> {
    const effectiveDate = this.computeEffectiveDate(goal)
    return {
      id: goal.id,
      date: goal.date,
      effectiveDate,
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
      deletedAt: goal.deletedAt && goal.deletedAt.trim() !== '' ? goal.deletedAt : null,
      restoredAt: goal.restoredAt ?? null
    }
  }

  public recalculateEffectiveDates(cutoffHour: number): void {
    const goals = this.db
      .prepare(
        `SELECT id, completedAt, date FROM daily_goals WHERE status = 'done' AND completedAt IS NOT NULL AND completedAt != ''`
      )
      .all() as { id: string; completedAt: string; date: string }[]

    if (goals.length === 0) return

    const updateStmt = this.db.prepare(`
      UPDATE daily_goals
      SET effectiveDate = ?
      WHERE id = ?
    `)

    const tx = this.db.transaction((items: typeof goals) => {
      for (const item of items) {
        let effDate = item.date
        try {
          effDate = localDateStr(new Date(item.completedAt), cutoffHour)
        } catch {
          // Keep original date if malformed
        }
        updateStmt.run(effDate, item.id)
      }
    })

    tx(goals)
  }

  public async getAllGoalDates(includeDeleted = false): Promise<string[]> {
    if (!this.db || !this.db.open) return []
    const stmt = includeDeleted
      ? this.stmts.getAllGoalDatesIncludingDeleted
      : this.stmts.getAllGoalDates
    const rows = stmt.all() as { date: string }[]
    return rows.map((r) => r.date)
  }

  public async getGoals(date: string, includeDeleted = false): Promise<DailyGoal[]> {
    if (!this.db || !this.db.open) return []
    const stmt = includeDeleted ? this.stmts.getGoalsIncludingDeleted : this.stmts.getGoals
    const rows = stmt.all(date) as (DailyGoal & { sortOrder: number | null })[]
    return rows.map((r) => this.mapGoalRow(r))
  }

  public async getDayReviewGoals(date: string): Promise<DailyGoal[]> {
    if (!this.db || !this.db.open) return []
    assertValidDate(date)
    const settings = this.settingsRepo.getSettings()
    const cutoff = typeof settings.dayCutoffHour === 'number' ? settings.dayCutoffHour : 0
    const rows = this.stmts.getDayReviewGoals.all({
      date,
      cutoff
    }) as (DailyGoal & {
      sortOrder: number | null
    })[]
    return rows.map((r) => this.mapGoalRow(r))
  }

  public async getBoardGoals(todayDate: string): Promise<DailyGoal[]> {
    if (!this.db || !this.db.open) return []
    assertValidDate(todayDate)
    const settings = this.settingsRepo.getSettings()
    const cutoff = typeof settings.dayCutoffHour === 'number' ? settings.dayCutoffHour : 0
    let horizonDate: string | null = null
    if (
      typeof settings.boardHistoryHorizonDays === 'number' &&
      settings.boardHistoryHorizonDays > 0
    ) {
      const [year, month, day] = todayDate.split('-').map(Number)
      const horizonLimit = new Date(year, month - 1, day - settings.boardHistoryHorizonDays)
      horizonDate = `${horizonLimit.getFullYear()}-${String(horizonLimit.getMonth() + 1).padStart(2, '0')}-${String(horizonLimit.getDate()).padStart(2, '0')}`
    }

    const rows = this.stmts.getBoardGoals.all({
      today: todayDate,
      horizonDate,
      cutoff
    }) as (DailyGoal & {
      sortOrder: number | null
    })[]
    return rows.map((r) => this.mapGoalRow(r))
  }

  public async getGoalById(goalId: string, includeDeleted = false): Promise<DailyGoal | null> {
    if (!this.db || !this.db.open) return null
    const stmt = includeDeleted ? this.stmts.getGoalByIdIncludingDeleted : this.stmts.getGoalById
    const row = stmt.get(goalId) as (DailyGoal & { sortOrder: number | null }) | undefined
    return row ? this.mapGoalRow(row) : null
  }

  public async getGoalsByIds(goalIds: string[]): Promise<DailyGoal[]> {
    if (goalIds.length === 0 || !this.db || !this.db.open) return []
    const rows = this.stmts.getGoalsByIdsIncludingDeleted.all(
      JSON.stringify(goalIds)
    ) as (DailyGoal & { sortOrder: number | null })[]
    return rows.map((r) => this.mapGoalRow(r))
  }

  public async setGoals(date: string, goals: DailyGoal[], isSyncApply = false): Promise<void> {
    assertValidDate(date)
    const purgedIds =
      isSyncApply && this.getPurgedIdsFn ? await this.getPurgedIdsFn() : new Set<string>()
    const existing = (this.stmts.getGoals.all(date) as { id: string }[]).map((r) => r.id)
    const existingIds = new Set(existing)
    const filteredGoals = goals.filter((g) => !purgedIds.has(g.id))
    const incomingIds = new Set(filteredGoals.map((g) => g.id))

    const tx = this.db.transaction(() => {
      const now = new Date().toISOString()
      for (const goal of filteredGoals) {
        this.stmts.upsertDailyGoal.run(this.goalParams(goal))
      }
      for (const id of existingIds) {
        if (purgedIds.has(id)) {
          this.stmts.deleteGoalById.run(id)
        } else if (!incomingIds.has(id)) {
          this.stmts.deleteGoal.run(now, now, id)
        }
      }
    })
    tx()
    this.callbacks?.invalidateMinutesCache?.()
    if (!isSyncApply) {
      this.callbacks?.markDirtyGoalDate(date)
    }
  }

  public upsertDailyGoal(goal: DailyGoal): void {
    this.stmts.upsertDailyGoal.run(this.goalParams(goal))
  }

  public async addGoal(
    date: string,
    title: string,
    targetMinutes?: number,
    source?: Pick<DailyGoal, 'sourceInboxGoalId' | 'sourceRecurringGoalId'>,
    deadline?: string,
    note?: string,
    remindAt?: string,
    repeat?: string,
    groupTag?: string,
    groupColor?: string,
    sortOrder?: number,
    status?: DailyGoal['status']
  ): Promise<DailyGoal> {
    assertValidDate(date)
    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      throw new Error('Goal title is required')
    }

    const maxSortRow = this.stmts.getMaxGoalSortOrder.get(date) as
      { maxSort: number | null } | undefined
    const baseMax =
      typeof maxSortRow?.maxSort === 'number' && Number.isFinite(maxSortRow.maxSort)
        ? maxSortRow.maxSort
        : 0
    const nextSort = typeof sortOrder === 'number' ? sortOrder : baseMax + 1000

    let resolvedColor = groupColor
    if (groupTag && !resolvedColor) {
      const cleanTag = groupTag.trim().toLowerCase()
      resolvedColor = this.settingsRepo.getGroupColors()[cleanTag]
    }

    const now = new Date().toISOString()
    const goal: DailyGoal = {
      id: randomUUID(),
      date,
      title: trimmedTitle,
      status: status || 'planned',
      targetMinutes: targetMinutes && targetMinutes > 0 ? Math.round(targetMinutes) : undefined,
      deadline,
      sourceInboxGoalId: source?.sourceInboxGoalId,
      sourceRecurringGoalId: source?.sourceRecurringGoalId,
      createdAt: now,
      note: note?.trim() || undefined,
      remindAt,
      repeat,
      groupTag: groupTag?.trim() || undefined,
      groupColor: resolvedColor,
      sortOrder: nextSort,
      updatedAt: now
    }
    goal.effectiveDate = this.computeEffectiveDate(goal)

    this.stmts.insertDailyGoal.run(this.goalParams(goal))
    this.callbacks?.invalidateMinutesCache?.()
    this.callbacks?.markDirtyGoalDate(date)
    return goal
  }

  public async updateGoal(date: string, goal: DailyGoal): Promise<DailyGoal> {
    if (date) {
      assertValidDate(date, 'date')
    }
    if (goal.date) {
      assertValidDate(goal.date, 'goal.date')
    }

    const existing = this.stmts.getGoalByIdIncludingDeleted.get(goal.id) as DailyGoal | undefined
    const trimmedTitle = (goal.title !== undefined ? goal.title : existing?.title || '').trim()
    if (!trimmedTitle) {
      throw new Error('Goal title is required')
    }

    const today = this.settingsRepo.getTodayDate()
    const now = new Date().toISOString()
    const oldDate = existing?.date
    const newDate = goal.date || date || oldDate || today
    assertValidDate(newDate, 'goal.date')

    const isCompletedNow =
      newDate === today ||
      date === today ||
      (existing && existing.status !== 'done' && (!date || date === today))
    const defaultCompletedAt = isCompletedNow ? now : `${newDate}T12:00:00.000Z`
    const completedAt =
      goal.status === 'done'
        ? goal.completedAt ||
          (existing?.status === 'done' ? existing.completedAt : undefined) ||
          defaultCompletedAt
        : undefined

    const updatedGoal: DailyGoal = {
      ...(existing || {}),
      ...goal,
      date: newDate,
      title: trimmedTitle,
      createdAt: goal.createdAt || existing?.createdAt || now,
      note: goal.note !== undefined ? goal.note?.trim() || undefined : existing?.note,
      deadline:
        goal.deadline !== undefined ? goal.deadline?.trim() || undefined : existing?.deadline,
      remindAt:
        goal.remindAt !== undefined ? goal.remindAt?.trim() || undefined : existing?.remindAt,
      repeat: goal.repeat !== undefined ? goal.repeat?.trim() || undefined : existing?.repeat,
      groupTag:
        goal.groupTag !== undefined ? goal.groupTag?.trim() || undefined : existing?.groupTag,
      groupColor:
        goal.groupColor !== undefined ? goal.groupColor || undefined : existing?.groupColor,
      sortOrder:
        typeof goal.sortOrder === 'number'
          ? goal.sortOrder
          : typeof existing?.sortOrder === 'number'
            ? existing.sortOrder
            : undefined,
      targetMinutes:
        goal.targetMinutes !== undefined
          ? goal.targetMinutes > 0
            ? Math.round(goal.targetMinutes)
            : undefined
          : existing?.targetMinutes && existing.targetMinutes > 0
            ? Math.round(existing.targetMinutes)
            : undefined,
      completedAt,
      updatedAt: now
    }
    updatedGoal.effectiveDate = this.computeEffectiveDate(updatedGoal)

    this.stmts.updateDailyGoal.run(this.goalParams(updatedGoal))
    this.callbacks?.invalidateMinutesCache?.()
    this.callbacks?.markDirtyGoalDate(newDate)
    if (date && date !== newDate) {
      this.callbacks?.markDirtyGoalDate(date)
    }
    if (oldDate && oldDate !== newDate && oldDate !== date) {
      this.callbacks?.markDirtyGoalDate(oldDate)
    }
    return updatedGoal
  }

  public async updateGoals(goals: DailyGoal[]): Promise<DailyGoal[]> {
    if (goals.length === 0) return []
    const today = this.settingsRepo.getTodayDate()
    const now = new Date().toISOString()
    const updatedGoals: DailyGoal[] = []
    const affectedDates = new Set<string>()

    const tx = this.db.transaction(() => {
      for (const goal of goals) {
        const existing = this.stmts.getGoalByIdIncludingDeleted.get(goal.id) as
          DailyGoal | undefined

        const trimmedTitle = (goal.title !== undefined ? goal.title : existing?.title || '').trim()
        if (!trimmedTitle) {
          throw new Error('Goal title is required')
        }

        const oldDate = existing?.date
        const goalDate = goal.date || oldDate || today
        assertValidDate(goalDate, 'goal.date')

        const isCompletedNow =
          goalDate === today || (existing && existing.status !== 'done' && existing.date < today)
        const defaultCompletedAt = isCompletedNow ? now : `${goalDate}T12:00:00.000Z`
        const completedAt =
          goal.status === 'done'
            ? goal.completedAt ||
              (existing?.status === 'done' ? existing.completedAt : undefined) ||
              defaultCompletedAt
            : undefined

        const updated: DailyGoal = {
          ...(existing || {}),
          ...goal,
          date: goalDate,
          title: trimmedTitle,
          createdAt: goal.createdAt || existing?.createdAt || now,
          note: goal.note !== undefined ? goal.note?.trim() || undefined : existing?.note,
          deadline:
            goal.deadline !== undefined ? goal.deadline?.trim() || undefined : existing?.deadline,
          remindAt:
            goal.remindAt !== undefined ? goal.remindAt?.trim() || undefined : existing?.remindAt,
          repeat: goal.repeat !== undefined ? goal.repeat?.trim() || undefined : existing?.repeat,
          groupTag:
            goal.groupTag !== undefined ? goal.groupTag?.trim() || undefined : existing?.groupTag,
          groupColor:
            goal.groupColor !== undefined ? goal.groupColor || undefined : existing?.groupColor,
          sortOrder:
            typeof goal.sortOrder === 'number'
              ? goal.sortOrder
              : typeof existing?.sortOrder === 'number'
                ? existing.sortOrder
                : undefined,
          targetMinutes:
            goal.targetMinutes !== undefined
              ? goal.targetMinutes > 0
                ? Math.round(goal.targetMinutes)
                : undefined
              : existing?.targetMinutes && existing.targetMinutes > 0
                ? Math.round(existing.targetMinutes)
                : undefined,
          completedAt,
          updatedAt: now
        }
        updated.effectiveDate = this.computeEffectiveDate(updated)

        this.stmts.updateDailyGoal.run(this.goalParams(updated))
        updatedGoals.push(updated)
        affectedDates.add(goalDate)
        if (oldDate && oldDate !== goalDate) {
          affectedDates.add(oldDate)
        }
      }
    })
    tx()

    this.callbacks?.invalidateMinutesCache?.()
    affectedDates.forEach((d) => {
      this.callbacks?.markDirtyGoalDate(d)
    })
    return updatedGoals
  }

  public async deleteGoal(goalId: string): Promise<string | null> {
    const existing = this.stmts.getGoalByIdIncludingDeleted.get(goalId) as DailyGoal | undefined
    if (!existing) return null
    const now = new Date().toISOString()
    this.stmts.deleteGoal.run(now, now, goalId)
    this.callbacks?.invalidateMinutesCache?.()
    this.callbacks?.markDirtyGoalDate(existing.date)
    return existing.date
  }

  public async deleteGoals(goalIds: string[]): Promise<string[]> {
    if (goalIds.length === 0) return []
    const now = new Date().toISOString()
    const affectedDates = new Set<string>()

    const tx = this.db.transaction(() => {
      for (const id of goalIds) {
        const existing = this.stmts.getGoalByIdIncludingDeleted.get(id) as DailyGoal | undefined
        if (!existing) continue
        this.stmts.deleteGoal.run(now, now, id)
        if (existing.date) {
          affectedDates.add(existing.date)
        }
      }
    })
    tx()

    this.callbacks?.invalidateMinutesCache?.()
    affectedDates.forEach((d) => {
      this.callbacks?.markDirtyGoalDate(d)
    })
    return Array.from(affectedDates)
  }

  public async carryGoal(fromDate: string, toDate: string, goalId: string): Promise<DailyGoal> {
    assertValidDate(fromDate, 'fromDate')
    assertValidDate(toDate, 'toDate')
    const carried = await this.carryGoals(fromDate, toDate, [goalId])
    if (!carried[0]) {
      throw new Error(`Goal with ID "${goalId}" not found`)
    }
    return carried[0]
  }

  public async carryGoals(
    fromDate: string,
    toDate: string,
    goalIds?: string[]
  ): Promise<DailyGoal[]> {
    assertValidDate(fromDate, 'fromDate')
    assertValidDate(toDate, 'toDate')

    if (goalIds !== undefined && goalIds.length === 0) {
      return []
    }

    const goalsToCarry: DailyGoal[] = []
    const resultGoals: DailyGoal[] = []

    if (goalIds && goalIds.length > 0) {
      for (const id of goalIds) {
        // Idempotency check: if target already carried to toDate
        const existingTarget = this.stmts.getCarriedGoalTarget.get(id, toDate) as
          (DailyGoal & { sortOrder: number | null }) | undefined
        if (existingTarget) {
          resultGoals.push(this.mapGoalRow(existingTarget))
          continue
        }

        const source = this.stmts.getGoalById.get(id) as
          (DailyGoal & { sortOrder: number | null }) | undefined
        if (source && source.date === fromDate && source.status !== 'done') {
          goalsToCarry.push(this.mapGoalRow(source))
        }
      }
    } else {
      const allSourceGoals = (await this.getGoals(fromDate)).filter((g) => g.status !== 'done')
      goalsToCarry.push(...allSourceGoals)
    }

    if (goalsToCarry.length === 0) {
      return resultGoals
    }

    const maxSortRow = this.stmts.getMaxGoalSortOrder.get(toDate) as
      { maxSort: number | null } | undefined
    let currentMaxSort =
      typeof maxSortRow?.maxSort === 'number' && Number.isFinite(maxSortRow.maxSort)
        ? maxSortRow.maxSort
        : 0

    const newlyCarried: DailyGoal[] = []
    const tx = this.db.transaction(() => {
      const now = new Date().toISOString()
      for (const orig of goalsToCarry) {
        currentMaxSort += 1000
        const newGoal: DailyGoal = {
          id: randomUUID(),
          date: toDate,
          title: orig.title,
          status: 'planned',
          targetMinutes: orig.targetMinutes,
          deadline: orig.deadline,
          sourceInboxGoalId: orig.sourceInboxGoalId,
          sourceRecurringGoalId: orig.sourceRecurringGoalId,
          createdAt: now,
          carriedFromDate: fromDate,
          carriedFromGoalId: orig.id,
          note: orig.note,
          remindAt: orig.remindAt,
          repeat: orig.repeat,
          groupTag: orig.groupTag,
          groupColor: orig.groupColor,
          sortOrder: currentMaxSort,
          updatedAt: now
        }
        this.stmts.insertDailyGoal.run(this.goalParams(newGoal))
        this.stmts.markCarriedDailyGoal.run(toDate, now, now, orig.id)
        newlyCarried.push(newGoal)
      }
    })
    tx()

    this.callbacks?.invalidateMinutesCache?.()
    this.callbacks?.markDirtyGoalDate(fromDate)
    this.callbacks?.markDirtyGoalDate(toDate)
    return [...resultGoals, ...newlyCarried]
  }

  public async updateGroupColorAcrossGoals(
    groupTag: string,
    groupColor: string
  ): Promise<string[]> {
    const cleanTag = groupTag.trim().toLowerCase()
    if (!cleanTag || cleanTag === 'untagged') return []

    const now = new Date().toISOString()
    const updateTx = this.db.transaction(() => {
      this.settingsRepo.setGroupColor(cleanTag, groupColor)
      const affectedDates = (
        this.stmts.getDatesForGroupColorUpdate.all(cleanTag, groupColor) as { date: string }[]
      ).map((r) => r.date)
      this.stmts.updateGroupColorAcrossGoals.run(groupColor, now, cleanTag)
      return affectedDates
    })

    const affectedDates = updateTx()
    for (const d of affectedDates) {
      this.callbacks?.markDirtyGoalDate(d)
    }
    return affectedDates
  }

  public async renameGroupAcrossGoals(
    oldTag: string,
    newTag: string,
    groupColor?: string
  ): Promise<string[]> {
    const cleanOld = oldTag.trim().toLowerCase()
    const cleanNew = newTag.trim()
    if (!cleanOld || !cleanNew) return []

    const now = new Date().toISOString()
    const renameTx = this.db.transaction(() => {
      const affectedDates = (
        this.stmts.getDatesForGroupRename.all(cleanOld) as { date: string }[]
      ).map((r) => r.date)

      if (groupColor) {
        this.settingsRepo.deleteGroupColor(cleanOld)
        this.settingsRepo.setGroupColor(cleanNew.toLowerCase(), groupColor)
        this.stmts.updateGroupTagAndColorAcrossGoals.run(cleanNew, groupColor, now, cleanOld)
      } else {
        const oldColor = this.settingsRepo.getGroupColors()[cleanOld]
        this.settingsRepo.deleteGroupColor(cleanOld)
        if (oldColor) {
          this.settingsRepo.setGroupColor(cleanNew.toLowerCase(), oldColor)
        }
        this.stmts.updateGroupTagAcrossGoals.run(cleanNew, now, cleanOld)
      }
      return affectedDates
    })

    const affectedDates = renameTx()
    for (const d of affectedDates) {
      this.callbacks?.markDirtyGoalDate(d)
    }
    return affectedDates
  }

  public async addInboxGoalToToday(
    inboxGoalId: string,
    date: string,
    targetMinutes?: number
  ): Promise<DailyGoal> {
    if (!this.inboxRepo) {
      throw new Error('InboxRepository not connected')
    }
    const inboxGoals = await this.inboxRepo.getInboxGoals()
    const inboxGoal = inboxGoals.find((item) => item.id === inboxGoalId)
    if (!inboxGoal) throw new Error('Inbox goal not found')

    const goal = await this.addGoal(date, inboxGoal.title, targetMinutes, {
      sourceInboxGoalId: inboxGoal.id
    })
    await this.inboxRepo.deleteInboxGoal(inboxGoalId)
    return goal
  }
}
