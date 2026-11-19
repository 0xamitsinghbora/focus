import Database from 'better-sqlite3'
import { DailyGoal } from '../../shared/types'
import { PurgedRecord } from '../dataManager'
import { LogsRepository } from './LogsRepository'
import { logger } from '../logger'

export interface TrashDirtyCallbacks {
  markDirtyGoalDate: (date: string) => void
  markDirtyInbox: () => void
  markDirtyRecurring: () => void
  markDirtyPurged: () => void
  invalidateMinutesCache?: () => void
}

export class TrashArchiveRepository {
  private db: Database.Database
  private logsRepo: LogsRepository
  private callbacks?: TrashDirtyCallbacks

  public stmts: {
    getGoalByIdIncludingDeleted: Database.Statement
    getDeletedGoals: Database.Statement
    getDeletedGoalsCount: Database.Statement
    searchDeletedGoals: Database.Statement
    searchDeletedGoalsCount: Database.Statement
    getAllDeletedGoalsForPurge: Database.Statement
    restoreDailyGoal: Database.Statement
    hardDeleteDailyGoal: Database.Statement
    emptyTrashDailyGoals: Database.Statement
    deleteGoalById: Database.Statement
    deleteInboxGoalById: Database.Statement
    getDeletedInboxGoalsOlderThan: Database.Statement
    hardDeleteInboxGoalsOlderThan: Database.Statement
    getDeletedDailyGoalsOlderThan: Database.Statement
    hardDeleteDailyGoalsOlderThan: Database.Statement
    getDeletedRecurringGoalsOlderThan: Database.Statement
    hardDeleteRecurringGoalsOlderThan: Database.Statement
    addPurgedRecord: Database.Statement
    prunePurgedRecordsOlderThan: Database.Statement
    getPurgedIds: Database.Statement
    getPurgedRecords: Database.Statement
  }

  constructor(db: Database.Database, logsRepo: LogsRepository, callbacks?: TrashDirtyCallbacks) {
    this.db = db
    this.logsRepo = logsRepo
    this.callbacks = callbacks

    this.stmts = {
      getGoalByIdIncludingDeleted: this.db.prepare(`
        SELECT * FROM daily_goals WHERE id = ?
      `),
      getDeletedGoals: this.db.prepare(`
        SELECT * FROM daily_goals
        WHERE deletedAt IS NOT NULL
          AND (carriedToDate IS NULL OR carriedToDate = '')
        ORDER BY deletedAt DESC
        LIMIT ? OFFSET ?
      `),
      getDeletedGoalsCount: this.db.prepare(`
        SELECT COUNT(*) as count FROM daily_goals
        WHERE deletedAt IS NOT NULL
          AND (carriedToDate IS NULL OR carriedToDate = '')
      `),
      searchDeletedGoals: this.db.prepare(`
        SELECT * FROM daily_goals
        WHERE deletedAt IS NOT NULL
          AND (carriedToDate IS NULL OR carriedToDate = '')
          AND (
            title LIKE ? OR
            date LIKE ? OR
            COALESCE(groupTag, '') LIKE ? OR
            COALESCE(note, '') LIKE ?
          )
        ORDER BY deletedAt DESC
        LIMIT ? OFFSET ?
      `),
      searchDeletedGoalsCount: this.db.prepare(`
        SELECT COUNT(*) as count FROM daily_goals
        WHERE deletedAt IS NOT NULL
          AND (carriedToDate IS NULL OR carriedToDate = '')
          AND (
            title LIKE ? OR
            date LIKE ? OR
            COALESCE(groupTag, '') LIKE ? OR
            COALESCE(note, '') LIKE ?
          )
      `),
      getAllDeletedGoalsForPurge: this.db.prepare(`
        SELECT id, title, date FROM daily_goals
        WHERE deletedAt IS NOT NULL
          AND (carriedToDate IS NULL OR carriedToDate = '')
      `),
      restoreDailyGoal: this.db.prepare(`
        UPDATE daily_goals
        SET deletedAt = NULL, updatedAt = ?, restoredAt = ?
        WHERE id = ?
      `),
      hardDeleteDailyGoal: this.db.prepare(`
        DELETE FROM daily_goals WHERE id = ?
      `),
      emptyTrashDailyGoals: this.db.prepare(`
        DELETE FROM daily_goals
        WHERE deletedAt IS NOT NULL
          AND (carriedToDate IS NULL OR carriedToDate = '')
      `),
      deleteGoalById: this.db.prepare(`
        DELETE FROM daily_goals WHERE id = ?
      `),
      deleteInboxGoalById: this.db.prepare(`
        DELETE FROM inbox_goals WHERE id = ?
      `),
      getDeletedInboxGoalsOlderThan: this.db.prepare(`
        SELECT id FROM inbox_goals
        WHERE deletedAt IS NOT NULL AND deletedAt < ?
      `),
      hardDeleteInboxGoalsOlderThan: this.db.prepare(`
        DELETE FROM inbox_goals
        WHERE deletedAt IS NOT NULL AND deletedAt < ?
      `),
      getDeletedDailyGoalsOlderThan: this.db.prepare(`
        SELECT id, title, date FROM daily_goals
        WHERE deletedAt IS NOT NULL
          AND (carriedToDate IS NULL OR carriedToDate = '')
          AND deletedAt < ?
      `),
      hardDeleteDailyGoalsOlderThan: this.db.prepare(`
        DELETE FROM daily_goals
        WHERE deletedAt IS NOT NULL
          AND (carriedToDate IS NULL OR carriedToDate = '')
          AND deletedAt < ?
      `),
      getDeletedRecurringGoalsOlderThan: this.db.prepare(`
        SELECT id FROM recurring_goals
        WHERE deletedAt IS NOT NULL AND deletedAt < ?
      `),
      hardDeleteRecurringGoalsOlderThan: this.db.prepare(`
        DELETE FROM recurring_goals
        WHERE deletedAt IS NOT NULL AND deletedAt < ?
      `),
      addPurgedRecord: this.db.prepare(`
        INSERT OR REPLACE INTO purged_records (id, entity, purgedAt)
        VALUES (?, ?, ?)
      `),
      prunePurgedRecordsOlderThan: this.db.prepare(`
        DELETE FROM purged_records WHERE purgedAt < ?
      `),
      getPurgedIds: this.db.prepare(`
        SELECT id FROM purged_records
      `),
      getPurgedRecords: this.db.prepare(`
        SELECT id, entity, purgedAt FROM purged_records
      `)
    }
  }

  public async getDeletedGoals(limit = 100, offset = 0, query?: string): Promise<DailyGoal[]> {
    const trimmed = query?.trim()
    let rows: DailyGoal[]
    if (trimmed) {
      const pattern = `%${trimmed}%`
      rows = this.stmts.searchDeletedGoals.all(
        pattern,
        pattern,
        pattern,
        pattern,
        limit,
        offset
      ) as DailyGoal[]
    } else {
      rows = this.stmts.getDeletedGoals.all(limit, offset) as DailyGoal[]
    }
    return rows.map((r) => ({
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
    }))
  }

  public async getDeletedGoalsCount(query?: string): Promise<number> {
    const trimmed = query?.trim()
    if (trimmed) {
      const pattern = `%${trimmed}%`
      const row = this.stmts.searchDeletedGoalsCount.get(pattern, pattern, pattern, pattern) as
        { count: number } | undefined
      return row?.count ?? 0
    }
    const row = this.stmts.getDeletedGoalsCount.get() as { count: number } | undefined
    return row?.count ?? 0
  }

  public async restoreGoal(goalId: string): Promise<DailyGoal | null> {
    const existing = this.stmts.getGoalByIdIncludingDeleted.get(goalId) as DailyGoal | undefined
    if (!existing) return null
    const now = new Date().toISOString()
    this.stmts.restoreDailyGoal.run(now, now, goalId)
    this.callbacks?.invalidateMinutesCache?.()
    this.callbacks?.markDirtyGoalDate(existing.date)
    return {
      ...existing,
      deletedAt: undefined,
      updatedAt: now,
      restoredAt: now
    }
  }

  public async restoreGoals(goalIds: string[]): Promise<DailyGoal[]> {
    if (goalIds.length === 0) return []
    const now = new Date().toISOString()
    const restored: DailyGoal[] = []
    const affectedDates = new Set<string>()

    const tx = this.db.transaction(() => {
      for (const id of goalIds) {
        const existing = this.stmts.getGoalByIdIncludingDeleted.get(id) as DailyGoal | undefined
        if (!existing) continue
        this.stmts.restoreDailyGoal.run(now, now, id)
        if (existing.date) {
          affectedDates.add(existing.date)
        }
        restored.push({
          ...existing,
          deletedAt: undefined,
          updatedAt: now,
          restoredAt: now
        })
      }
    })
    tx()

    this.callbacks?.invalidateMinutesCache?.()
    affectedDates.forEach((d) => {
      this.callbacks?.markDirtyGoalDate(d)
    })
    return restored
  }

  public async hardDeleteGoal(goalId: string): Promise<{ success: boolean; date?: string }> {
    const existing = this.stmts.getGoalByIdIncludingDeleted.get(goalId) as
      { title?: string; date?: string; deletedAt?: string } | undefined
    if (!existing || !existing.deletedAt) return { success: false }
    const now = new Date().toISOString()
    this.stmts.addPurgedRecord.run(goalId, 'daily_goals', now)
    if (existing.title) {
      this.logsRepo.stmts.backfillLogGoalTitle.run(existing.title, goalId)
    }
    const result = this.stmts.hardDeleteDailyGoal.run(goalId)
    this.callbacks?.invalidateMinutesCache?.()
    if (existing.date) {
      this.callbacks?.markDirtyGoalDate(existing.date)
    }
    this.callbacks?.markDirtyPurged()
    return { success: result.changes > 0, date: existing.date }
  }

  public async emptyTrash(): Promise<{ count: number; affectedDates: string[] }> {
    const deletedGoals = this.stmts.getAllDeletedGoalsForPurge.all() as {
      id: string
      title?: string
      date?: string
    }[]
    const affectedDates = new Set<string>()
    const now = new Date().toISOString()
    const tx = this.db.transaction((goals: { id: string; title?: string; date?: string }[]) => {
      for (const g of goals) {
        if (g.date) affectedDates.add(g.date)
        this.stmts.addPurgedRecord.run(g.id, 'daily_goals', now)
        if (g.title) {
          this.logsRepo.stmts.backfillLogGoalTitle.run(g.title, g.id)
        }
      }
      return this.stmts.emptyTrashDailyGoals.run().changes
    })
    const count = tx(deletedGoals)
    if (count > 0) {
      this.callbacks?.invalidateMinutesCache?.()
    }
    for (const d of affectedDates) {
      this.callbacks?.markDirtyGoalDate(d)
    }
    if (count > 0) {
      this.callbacks?.markDirtyPurged()
    }
    return { count, affectedDates: Array.from(affectedDates) }
  }

  public async getPurgedIds(): Promise<Set<string>> {
    const rows = this.stmts.getPurgedIds.all() as { id: string }[]
    return new Set(rows.map((r) => r.id))
  }

  public async getPurgedRecords(): Promise<PurgedRecord[]> {
    return this.stmts.getPurgedRecords.all() as PurgedRecord[]
  }

  public async setPurgedRecords(records: PurgedRecord[], fromSync = false): Promise<void> {
    const tx = this.db.transaction((items: PurgedRecord[]) => {
      for (const r of items) {
        this.stmts.addPurgedRecord.run(r.id, r.entity, r.purgedAt)
        if (fromSync) {
          if (r.entity === 'daily_goals') {
            this.stmts.deleteGoalById.run(r.id)
          } else if (r.entity === 'logs') {
            this.logsRepo.stmts.deleteLogById.run(r.id)
          } else if (r.entity === 'inbox_goals') {
            this.stmts.deleteInboxGoalById.run(r.id)
          }
        }
      }
    })
    tx(records)
  }

  public async prunePurgedRecordsOlderThan(days = 90): Promise<number> {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
    const result = this.stmts.prunePurgedRecordsOlderThan.run(cutoffDate)
    if (result.changes > 0) {
      this.callbacks?.markDirtyPurged()
      logger.info(
        'db',
        `Pruned ${result.changes} stale tombstones from purged_records older than ${days} days`
      )
    }
    return result.changes
  }

  public async purgeSoftDeletedRecordsOlderThan(days = 30): Promise<{
    logs: number
    inboxGoals: number
    dailyGoals: number
    recurringGoals: number
    prunedTombstones: number
  }> {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
    const tombstoneCutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
    const now = new Date().toISOString()

    const oldLogs = this.logsRepo.stmts.getDeletedLogsOlderThan.all(cutoffDate) as {
      id: string
      date: string
    }[]
    const oldInbox = this.stmts.getDeletedInboxGoalsOlderThan.all(cutoffDate) as { id: string }[]
    const oldGoals = this.stmts.getDeletedDailyGoalsOlderThan.all(cutoffDate) as {
      id: string
      title?: string
      date: string
    }[]
    const oldRecurring = this.stmts.getDeletedRecurringGoalsOlderThan.all(cutoffDate) as {
      id: string
    }[]

    const tx = this.db.transaction(() => {
      for (const l of oldLogs) {
        this.stmts.addPurgedRecord.run(l.id, 'logs', now)
      }
      for (const i of oldInbox) {
        this.stmts.addPurgedRecord.run(i.id, 'inbox_goals', now)
      }
      for (const g of oldGoals) {
        this.stmts.addPurgedRecord.run(g.id, 'daily_goals', now)
        if (g.title) {
          this.logsRepo.stmts.backfillLogGoalTitle.run(g.title, g.id)
        }
      }
      for (const r of oldRecurring) {
        this.stmts.addPurgedRecord.run(r.id, 'recurring_goals', now)
      }
      const logsChanges = this.logsRepo.stmts.hardDeleteLogsOlderThan.run(cutoffDate).changes
      const inboxChanges = this.stmts.hardDeleteInboxGoalsOlderThan.run(cutoffDate).changes
      const dailyChanges = this.stmts.hardDeleteDailyGoalsOlderThan.run(cutoffDate).changes
      const recurringChanges = this.stmts.hardDeleteRecurringGoalsOlderThan.run(cutoffDate).changes
      const prunedTombstones = this.stmts.prunePurgedRecordsOlderThan.run(tombstoneCutoff).changes
      return {
        logs: logsChanges,
        inboxGoals: inboxChanges,
        dailyGoals: dailyChanges,
        recurringGoals: recurringChanges,
        prunedTombstones
      }
    })

    const result = tx()
    if (result.logs > 0) {
      for (const l of oldLogs) {
        if (l.date) this.callbacks?.markDirtyGoalDate(l.date)
      }
    }
    if (result.inboxGoals > 0) {
      this.callbacks?.markDirtyInbox()
    }
    if (result.recurringGoals > 0) {
      this.callbacks?.markDirtyRecurring()
    }
    if (result.dailyGoals > 0) {
      for (const g of oldGoals) {
        if (g.date) this.callbacks?.markDirtyGoalDate(g.date)
      }
    }
    if (
      result.logs > 0 ||
      result.inboxGoals > 0 ||
      result.dailyGoals > 0 ||
      result.recurringGoals > 0
    ) {
      if (result.logs > 0 || result.dailyGoals > 0) {
        this.callbacks?.invalidateMinutesCache?.()
      }
      this.callbacks?.markDirtyPurged()
      logger.info(
        'db',
        `Purged soft-deleted records older than ${days} days: ${result.logs} logs, ${result.inboxGoals} inbox goals, ${result.dailyGoals} daily goals, ${result.recurringGoals} recurring goals`
      )
    }
    return result
  }
}
