import Database from 'better-sqlite3'
import { LogEntry, localDateStr } from '../../shared/types'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function assertValidDate(date: string, label = 'date'): void {
  if (!DATE_RE.test(date)) {
    throw new Error(`Invalid ${label}: "${date}" — expected YYYY-MM-DD`)
  }
}

export class LogsRepository {
  private db: Database.Database
  private onDirtyDate?: (date: string) => void

  public stmts: {
    getLogs: Database.Statement
    getLogsIncludingDeleted: Database.Statement
    getAllLogDates: Database.Statement
    getAllLogDatesIncludingDeleted: Database.Statement
    insertLog: Database.Statement
    upsertLog: Database.Statement
    deleteLog: Database.Statement
    deleteLogById: Database.Statement
    getDeletedLogsOlderThan: Database.Statement
    hardDeleteLogsOlderThan: Database.Statement
    backfillLogGoalTitle: Database.Statement
    getHeatmapLogs: Database.Statement
    getHeatmapLogsSince: Database.Statement
  }

  constructor(db: Database.Database, onDirtyDate?: (date: string) => void) {
    this.db = db
    this.onDirtyDate = onDirtyDate

    this.stmts = {
      getLogs: db.prepare(
        'SELECT * FROM logs WHERE date = ? AND deletedAt IS NULL ORDER BY timestamp ASC'
      ),
      getLogsIncludingDeleted: db.prepare(
        'SELECT * FROM logs WHERE date = ? ORDER BY timestamp ASC'
      ),
      getAllLogDates: db.prepare(
        'SELECT DISTINCT date FROM logs WHERE deletedAt IS NULL ORDER BY date ASC'
      ),
      getAllLogDatesIncludingDeleted: db.prepare(
        'SELECT DISTINCT date FROM logs ORDER BY date ASC'
      ),
      insertLog: db.prepare(`
        INSERT INTO logs (id, timestamp, text, startedAt, endedAt, goalId, goalTitle, note, productivity, durationMinutes, productiveMinutes, date, focusQuality, updatedAt, deletedAt)
        VALUES (@id, @timestamp, @text, @startedAt, @endedAt, @goalId, @goalTitle, @note, @productivity, @durationMinutes, @productiveMinutes, @date, @focusQuality, @updatedAt, @deletedAt)
      `),
      upsertLog: db.prepare(`
        INSERT INTO logs (id, timestamp, text, startedAt, endedAt, goalId, goalTitle, note, productivity, durationMinutes, productiveMinutes, date, focusQuality, updatedAt, deletedAt)
        VALUES (@id, @timestamp, @text, @startedAt, @endedAt, @goalId, @goalTitle, @note, @productivity, @durationMinutes, @productiveMinutes, @date, @focusQuality, @updatedAt, @deletedAt)
        ON CONFLICT(id) DO UPDATE SET
          timestamp=excluded.timestamp, text=excluded.text, startedAt=excluded.startedAt,
          endedAt=excluded.endedAt, goalId=excluded.goalId, goalTitle=excluded.goalTitle,
          note=excluded.note, productivity=excluded.productivity,
          durationMinutes=excluded.durationMinutes, productiveMinutes=excluded.productiveMinutes,
          date=excluded.date, focusQuality=excluded.focusQuality, updatedAt=excluded.updatedAt, deletedAt=excluded.deletedAt
      `),
      deleteLog: db.prepare('UPDATE logs SET deletedAt = ?, updatedAt = ? WHERE id = ?'),
      deleteLogById: db.prepare('DELETE FROM logs WHERE id = ?'),
      getDeletedLogsOlderThan: db.prepare(
        'SELECT id, date FROM logs WHERE deletedAt IS NOT NULL AND deletedAt < ?'
      ),
      hardDeleteLogsOlderThan: db.prepare(
        'DELETE FROM logs WHERE deletedAt IS NOT NULL AND deletedAt < ?'
      ),
      backfillLogGoalTitle: db.prepare(
        "UPDATE logs SET goalTitle = ? WHERE goalId = ? AND (goalTitle IS NULL OR goalTitle = '')"
      ),
      getHeatmapLogs: db.prepare(
        `SELECT date, COUNT(id) as count FROM logs
         WHERE deletedAt IS NULL
           AND (productivity IS NULL OR productivity != 'break')
         GROUP BY date`
      ),
      getHeatmapLogsSince: db.prepare(
        `SELECT date, COUNT(id) as count FROM logs
         WHERE deletedAt IS NULL
           AND (productivity IS NULL OR productivity != 'break')
           AND date >= ?
         GROUP BY date`
      )
    }
  }

  private logParams(entry: LogEntry, date: string): Record<string, unknown> {
    const now = new Date().toISOString()
    return {
      ...entry,
      text: entry.text || '',
      startedAt: entry.startedAt ?? null,
      endedAt: entry.endedAt ?? null,
      goalId: entry.goalId ?? null,
      goalTitle: entry.goalTitle ?? null,
      note: entry.note ?? null,
      productivity: entry.productivity ?? null,
      durationMinutes: entry.durationMinutes ?? null,
      productiveMinutes: entry.productiveMinutes ?? null,
      focusQuality:
        typeof entry.focusQuality === 'number' && entry.focusQuality >= 1 && entry.focusQuality <= 5
          ? entry.focusQuality
          : null,
      updatedAt: entry.updatedAt ?? now,
      deletedAt: entry.deletedAt && entry.deletedAt.trim() !== '' ? entry.deletedAt : null,
      date
    }
  }

  public recalculateEffectiveDates(cutoffHour: number): void {
    if (!this.db || !this.db.open) return
    const logs = this.db.prepare('SELECT id, startedAt, timestamp, date FROM logs').all() as {
      id: string
      startedAt?: string
      timestamp: string
      date: string
    }[]

    if (logs.length === 0) return

    const updateStmt = this.db.prepare('UPDATE logs SET date = ? WHERE id = ?')
    const tx = this.db.transaction((items: typeof logs) => {
      for (const item of items) {
        const timeToUse = item.startedAt || item.timestamp
        try {
          const newDate = localDateStr(new Date(timeToUse), cutoffHour)
          if (newDate !== item.date) {
            updateStmt.run(newDate, item.id)
            if (this.onDirtyDate) {
              this.onDirtyDate(item.date)
              this.onDirtyDate(newDate)
            }
          }
        } catch {
          // ignore malformed timestamp
        }
      }
    })
    tx(logs)
  }

  public async getAllLogDates(includeDeleted = false): Promise<string[]> {
    if (!this.db || !this.db.open) return []
    const stmt = includeDeleted
      ? this.stmts.getAllLogDatesIncludingDeleted
      : this.stmts.getAllLogDates
    const rows = stmt.all() as { date: string }[]
    return rows.map((r) => r.date)
  }

  public async getLogs(date: string, includeDeleted = false): Promise<LogEntry[]> {
    if (!this.db || !this.db.open) return []
    const stmt = includeDeleted ? this.stmts.getLogsIncludingDeleted : this.stmts.getLogs
    const rows = stmt.all(date) as (LogEntry & {
      productivity: string | null
    })[]
    return rows.map((r) => ({
      ...r,
      productivity: (r.productivity || undefined) as LogEntry['productivity'],
      startedAt: r.startedAt ?? undefined,
      endedAt: r.endedAt ?? undefined,
      goalId: r.goalId ?? undefined,
      goalTitle: r.goalTitle ?? undefined,
      note: r.note ?? undefined,
      durationMinutes: r.durationMinutes ?? undefined,
      productiveMinutes: r.productiveMinutes ?? undefined,
      updatedAt: r.updatedAt ?? undefined,
      deletedAt: r.deletedAt ?? undefined
    }))
  }

  public async appendLog(date: string, entry: LogEntry): Promise<void> {
    assertValidDate(date)
    this.stmts.upsertLog.run(this.logParams(entry, date))
    this.onDirtyDate?.(date)
  }

  public upsertLog(entry: LogEntry, date: string): void {
    assertValidDate(date)
    this.stmts.upsertLog.run(this.logParams(entry, date))
    this.onDirtyDate?.(date)
  }

  public async setLogs(
    date: string,
    logs: LogEntry[],
    isSyncApply = false,
    purgedIds?: Set<string>
  ): Promise<void> {
    assertValidDate(date)
    const effectivePurgedIds = purgedIds ?? new Set<string>()
    const existingIds = new Set((this.stmts.getLogs.all(date) as { id: string }[]).map((r) => r.id))
    const filteredLogs = logs.filter((l) => !effectivePurgedIds.has(l.id))
    const incomingIds = new Set(filteredLogs.map((l) => l.id))

    const tx = this.db.transaction(() => {
      const now = new Date().toISOString()
      for (const entry of filteredLogs) {
        this.stmts.upsertLog.run(this.logParams(entry, date))
      }
      for (const id of existingIds) {
        if (effectivePurgedIds.has(id)) {
          this.stmts.deleteLogById.run(id)
        } else if (!incomingIds.has(id)) {
          this.stmts.deleteLog.run(now, now, id)
        }
      }
    })
    tx()
    if (!isSyncApply) {
      this.onDirtyDate?.(date)
    }
  }

  public async updateLog(date: string, entry: LogEntry): Promise<LogEntry> {
    assertValidDate(date)
    const nextLog: LogEntry = {
      ...entry,
      updatedAt: new Date().toISOString()
    }
    this.stmts.upsertLog.run(this.logParams(nextLog, date))
    this.onDirtyDate?.(date)
    return nextLog
  }

  public async deleteLog(id: string): Promise<string | null> {
    const row = this.db.prepare('SELECT date FROM logs WHERE id = ?').get(id) as
      { date?: string } | undefined
    const now = new Date().toISOString()
    this.stmts.deleteLog.run(now, now, id)
    if (row?.date) {
      this.onDirtyDate?.(row.date)
    }
    return row?.date ?? null
  }
}
