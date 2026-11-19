import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { GoalInboxItem } from '../../shared/types'

export interface InboxDirtyCallbacks {
  markDirtyInbox?: () => void
}

export class InboxRepository {
  private db: Database.Database
  private callbacks?: InboxDirtyCallbacks
  private getPurgedIdsFn?: () => Promise<Set<string>>

  public stmts: {
    getInboxGoals: Database.Statement
    getInboxGoalsIncludingDeleted: Database.Statement
    getInboxGoalById: Database.Statement
    upsertInboxGoal: Database.Statement
    deleteInboxGoal: Database.Statement
    deleteInboxGoalById: Database.Statement
  }

  constructor(
    db: Database.Database,
    callbacks?: InboxDirtyCallbacks,
    getPurgedIds?: () => Promise<Set<string>>
  ) {
    this.db = db
    this.callbacks = callbacks
    this.getPurgedIdsFn = getPurgedIds

    this.stmts = {
      getInboxGoals: this.db.prepare(`
        SELECT * FROM inbox_goals
        WHERE deletedAt IS NULL
        ORDER BY createdAt DESC
      `),
      getInboxGoalsIncludingDeleted: this.db.prepare(`
        SELECT * FROM inbox_goals
        ORDER BY createdAt DESC
      `),
      getInboxGoalById: this.db.prepare(`
        SELECT * FROM inbox_goals
        WHERE id = ? AND deletedAt IS NULL
      `),
      upsertInboxGoal: this.db.prepare(`
        INSERT INTO inbox_goals (id, title, note, status, createdAt, updatedAt, deletedAt)
        VALUES (@id, @title, @note, @status, @createdAt, @updatedAt, @deletedAt)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          note = excluded.note,
          status = excluded.status,
          updatedAt = excluded.updatedAt,
          deletedAt = excluded.deletedAt
      `),
      deleteInboxGoal: this.db.prepare(`
        UPDATE inbox_goals
        SET deletedAt = ?, updatedAt = ?
        WHERE id = ? AND deletedAt IS NULL
      `),
      deleteInboxGoalById: this.db.prepare(`
        DELETE FROM inbox_goals WHERE id = ?
      `)
    }
  }

  public inboxParams(item: GoalInboxItem): Record<string, unknown> {
    const now = new Date().toISOString()
    return {
      id: item.id,
      title: item.title,
      note: item.note ?? null,
      status: item.status,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt ?? now,
      deletedAt: item.deletedAt ?? null
    }
  }

  public upsertInboxGoal(inbox: GoalInboxItem): void {
    this.stmts.upsertInboxGoal.run(this.inboxParams(inbox))
  }

  public async getInboxGoals(includeDeleted = false): Promise<GoalInboxItem[]> {
    const stmt = includeDeleted
      ? this.stmts.getInboxGoalsIncludingDeleted
      : this.stmts.getInboxGoals
    const rows = stmt.all() as GoalInboxItem[]
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      note: r.note ?? undefined,
      status: (r.status || 'active') as 'active',
      createdAt: r.createdAt,
      updatedAt: r.updatedAt ?? undefined,
      deletedAt: r.deletedAt ?? undefined
    }))
  }

  public async getInboxGoalById(id: string): Promise<GoalInboxItem | null> {
    const row = this.stmts.getInboxGoalById.get(id) as GoalInboxItem | undefined
    if (!row) return null
    return {
      id: row.id,
      title: row.title,
      note: row.note ?? undefined,
      status: (row.status || 'active') as 'active',
      createdAt: row.createdAt,
      updatedAt: row.updatedAt ?? undefined,
      deletedAt: row.deletedAt ?? undefined
    }
  }

  public async setInboxGoals(items: GoalInboxItem[], isSyncApply = false): Promise<void> {
    const purgedIds =
      isSyncApply && this.getPurgedIdsFn ? await this.getPurgedIdsFn() : new Set<string>()
    const existingIds = new Set(
      (this.stmts.getInboxGoals.all() as { id: string }[]).map((r) => r.id)
    )
    const filteredItems = items.filter((i) => !purgedIds.has(i.id))
    const incomingIds = new Set(filteredItems.map((i) => i.id))

    const tx = this.db.transaction(() => {
      const now = new Date().toISOString()
      for (const item of filteredItems) {
        this.stmts.upsertInboxGoal.run(this.inboxParams(item))
      }
      for (const id of existingIds) {
        if (purgedIds.has(id)) {
          this.stmts.deleteInboxGoalById.run(id)
        } else if (!incomingIds.has(id)) {
          this.stmts.deleteInboxGoal.run(now, now, id)
        }
      }
    })
    tx()
    if (!isSyncApply) {
      this.callbacks?.markDirtyInbox?.()
    }
  }

  public async deleteInboxGoal(id: string): Promise<void> {
    const now = new Date().toISOString()
    this.stmts.deleteInboxGoal.run(now, now, id)
    this.callbacks?.markDirtyInbox?.()
  }

  public async addInboxGoal(title: string, note?: string): Promise<GoalInboxItem> {
    const trimmed = title.trim()
    if (!trimmed) throw new Error('Inbox goal title is required')

    const now = new Date().toISOString()
    const item: GoalInboxItem = {
      id: randomUUID(),
      title: trimmed,
      note: note?.trim() || undefined,
      status: 'active',
      createdAt: now,
      updatedAt: now
    }

    this.stmts.upsertInboxGoal.run(this.inboxParams(item))
    this.callbacks?.markDirtyInbox?.()
    return item
  }

  public async updateInboxGoal(item: GoalInboxItem): Promise<GoalInboxItem> {
    const nextItem: GoalInboxItem = {
      ...item,
      title: item.title.trim(),
      note: item.note?.trim() || undefined,
      updatedAt: new Date().toISOString()
    }
    this.stmts.upsertInboxGoal.run(this.inboxParams(nextItem))
    this.callbacks?.markDirtyInbox?.()
    return nextItem
  }
}
