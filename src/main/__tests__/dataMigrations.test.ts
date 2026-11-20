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
    expect(tables).toContain('learning_tracks')
    expect(tables).toContain('evaluations')

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
    expect(indexes).toContain('idx_evaluations_entity')

    // Check effectiveDate column exists on daily_goals
    const cols = db.pragma('table_info(daily_goals)') as { name: string }[]
    expect(cols.some((c) => c.name === 'effectiveDate')).toBe(true)
    expect(cols.some((c) => c.name === 'learningTrackId')).toBe(true)
    expect(cols.some((c) => c.name === 'learningStage')).toBe(true)
    expect(cols.some((c) => c.name === 'goalType')).toBe(true)
    expect(cols.some((c) => c.name === 'evaluationStatus')).toBe(true)
    expect(cols.some((c) => c.name === 'proofOfWork')).toBe(true)
    expect(cols.some((c) => c.name === 'evaluatorNote')).toBe(true)
    expect(cols.some((c) => c.name === 'antiCheatScore')).toBe(true)

    const logCols = db.pragma('table_info(logs)') as { name: string }[]
    expect(logCols.some((c) => c.name === 'goalType')).toBe(true)
    expect(logCols.some((c) => c.name === 'audioMode')).toBe(true)
    expect(logCols.some((c) => c.name === 'didDotReset')).toBe(true)
    expect(logCols.some((c) => c.name === 'proofOfWork')).toBe(true)
    expect(logCols.some((c) => c.name === 'evaluationStatus')).toBe(true)
    expect(logCols.some((c) => c.name === 'antiCheatScore')).toBe(true)
  })

  it('is idempotent when run multiple times', () => {
    runSchemaMigrations(db)
    expect(() => runSchemaMigrations(db)).not.toThrow()

    expect(getSchemaVersion(db)).toBe(CURRENT_SCHEMA_VERSION)
  })

  it('forward migrates existing v3 schema to v4 by adding goalType, audioMode, and didDotReset', () => {
    // Simulate a database migrated up to schema v3 without goalType on logs/daily_goals
    db.exec(`
      CREATE TABLE IF NOT EXISTS daily_goals (
        id TEXT PRIMARY KEY NOT NULL,
        date TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'planned',
        learningTrackId TEXT,
        learningStage INTEGER
      );
      CREATE TABLE IF NOT EXISTS logs (
        id TEXT PRIMARY KEY NOT NULL,
        date TEXT NOT NULL DEFAULT '',
        text TEXT NOT NULL DEFAULT '',
        focusQuality INTEGER
      );
    `)
    db.pragma('user_version = 3')
    expect(getSchemaVersion(db)).toBe(3)

    // Run migrations from v3
    runSchemaMigrations(db)

    expect(getSchemaVersion(db)).toBe(CURRENT_SCHEMA_VERSION)
    const goalCols = db.pragma('table_info(daily_goals)') as { name: string }[]
    expect(goalCols.some((c) => c.name === 'goalType')).toBe(true)
    expect(goalCols.some((c) => c.name === 'evaluationStatus')).toBe(true)

    const logCols = db.pragma('table_info(logs)') as { name: string }[]
    expect(logCols.some((c) => c.name === 'goalType')).toBe(true)
    expect(logCols.some((c) => c.name === 'audioMode')).toBe(true)
    expect(logCols.some((c) => c.name === 'didDotReset')).toBe(true)
    expect(logCols.some((c) => c.name === 'proofOfWork')).toBe(true)
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
