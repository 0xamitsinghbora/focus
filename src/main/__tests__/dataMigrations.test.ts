import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import os from 'os'
import path from 'path'
import fs from 'fs'
import {
  initDatabaseSchema,
  runSchemaMigrations,
  getSchemaVersion,
  CURRENT_SCHEMA_VERSION
} from '../dataMigrations'

describe('dataMigrations / Database Schema Initialization', () => {
  let db: Database.Database
  let testDir: string

  beforeEach(() => {
    testDir = path.join(
      os.tmpdir(),
      `focus-schema-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    )
    fs.mkdirSync(testDir, { recursive: true })
    db = new Database(path.join(testDir, 'test.db'))
  })

  afterEach(() => {
    if (db) db.close()
    try {
      fs.rmSync(testDir, { recursive: true, force: true })
    } catch {}
  })

  it('initializes complete database schema and indexes on fresh database via PRAGMA user_version', () => {
    initDatabaseSchema(db)

    expect(getSchemaVersion(db)).toBe(CURRENT_SCHEMA_VERSION)
    expect(db.pragma('user_version', { simple: true })).toBe(CURRENT_SCHEMA_VERSION)

    // Check tables exist
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((t: any) => t.name)

    expect(tables).toContain('logs')
    expect(tables).toContain('daily_goals')
    expect(tables).toContain('inbox_goals')
    expect(tables).toContain('recurring_goals')
    expect(tables).toContain('settings')
    expect(tables).toContain('group_colors')
    expect(tables).toContain('purged_records')
    expect(tables).toContain('sync_state')

    // Check key indexes exist
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index'")
      .all()
      .map((i: any) => i.name)

    expect(indexes).toContain('idx_logs_date')
    expect(indexes).toContain('idx_logs_goalId')
    expect(indexes).toContain('idx_daily_goals_date')
    expect(indexes).toContain('idx_daily_goals_sourceRecurringGoalId')
    expect(indexes).toContain('idx_daily_goals_active_board')
    expect(indexes).toContain('idx_daily_goals_done_board')
    expect(indexes).toContain('idx_daily_goals_effectiveDate')

    // Check effectiveDate column exists on daily_goals
    const cols = db.pragma('table_info(daily_goals)') as { name: string }[]
    expect(cols.some((c) => c.name === 'effectiveDate')).toBe(true)
  })

  it('is idempotent when run multiple times', () => {
    runSchemaMigrations(db)
    expect(() => runSchemaMigrations(db)).not.toThrow()

    expect(getSchemaVersion(db)).toBe(CURRENT_SCHEMA_VERSION)
  })

  it('forward migrates older schema versions sequentially inside transactions', () => {
    // Start at version 0
    expect(getSchemaVersion(db)).toBe(0)

    // Run forward migrations
    runSchemaMigrations(db)

    expect(getSchemaVersion(db)).toBe(CURRENT_SCHEMA_VERSION)

    // Insert a goal with effectiveDate
    db.prepare(
      `
      INSERT INTO daily_goals (id, date, effectiveDate, title, status, completedAt, createdAt)
      VALUES ('g-test', '2026-10-30', '2026-10-31', 'Test Goal', 'done', '2026-10-31T02:00:00.000Z', '2026-10-30T10:00:00.000Z')
    `
    ).run()

    const goal = db.prepare('SELECT * FROM daily_goals WHERE id = ?').get('g-test') as any
    expect(goal.effectiveDate).toBe('2026-10-31')
  })
})
