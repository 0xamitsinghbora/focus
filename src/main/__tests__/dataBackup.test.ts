import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import os from 'os'
import path from 'path'
import fs from 'fs'
import { DailyGoal } from '../../shared/types'
import { runSchemaMigrations } from '../dataMigrations'
import {
  backupDatabase,
  backupDatabaseToFile,
  pruneOldBackups,
  maybePerformDailyBackup,
  exportAllData,
  importAllData
} from '../dataBackup'

describe('dataBackup', () => {
  let db: Database.Database
  let testDir: string

  beforeEach(() => {
    testDir = path.join(
      os.tmpdir(),
      `focus-backup-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    )
    fs.mkdirSync(testDir, { recursive: true })
    db = new Database(path.join(testDir, 'test.db'))
    runSchemaMigrations(db)
  })

  afterEach(() => {
    if (db) db.close()
    try {
      fs.rmSync(testDir, { recursive: true, force: true })
    } catch {}
    vi.restoreAllMocks()
  })

  it('backs up database and creates backup file', async () => {
    const backupDir = path.join(testDir, 'backups')
    const backupPath = await backupDatabase(db, testDir, backupDir)

    expect(fs.existsSync(backupPath)).toBe(true)
    expect(backupPath).toContain('focus-backup-')
    expect(backupPath.endsWith('.db')).toBe(true)
  })

  it('backs up database directly to specified destination file', async () => {
    const destFile = path.join(testDir, 'custom-export', 'my-focus.db')
    const resultPath = await backupDatabaseToFile(db, destFile)

    expect(resultPath).toBe(destFile)
    expect(fs.existsSync(destFile)).toBe(true)
    expect(fs.statSync(destFile).size).toBeGreaterThan(0)
  })

  it('prunes old backups when count exceeds threshold', () => {
    const backupDir = path.join(testDir, 'backups')
    fs.mkdirSync(backupDir, { recursive: true })

    // Create 7 fake backup files with distinct timestamps
    for (let i = 0; i < 7; i++) {
      const p = path.join(backupDir, `focus-backup-${i}.db`)
      fs.writeFileSync(p, 'dummy content')
      const time = 1000000 + i * 1000
      fs.utimesSync(p, time / 1000, time / 1000)
    }

    expect(fs.readdirSync(backupDir).length).toBe(7)
    pruneOldBackups(backupDir, 5)

    const remaining = fs.readdirSync(backupDir)
    expect(remaining.length).toBe(5)
    // The oldest two (0 and 1) should have been pruned
    expect(remaining).not.toContain('focus-backup-0.db')
    expect(remaining).not.toContain('focus-backup-1.db')
    expect(remaining).toContain('focus-backup-6.db')
  })

  it('maybePerformDailyBackup skips if recent backup exists', async () => {
    const backupDir = path.join(testDir, 'backups')
    fs.mkdirSync(backupDir, { recursive: true })
    const recentBackup = path.join(backupDir, 'focus-backup-recent.db')
    fs.writeFileSync(recentBackup, 'dummy content')

    const purgeMock = vi.fn().mockResolvedValue(undefined)
    await maybePerformDailyBackup(db, testDir, purgeMock)

    // Should not create new backup file since recent file exists
    const files = fs.readdirSync(backupDir)
    expect(files.length).toBe(1)
    expect(purgeMock).toHaveBeenCalled()
  })

  it('maybePerformDailyBackup executes backup before invoking purge callback', async () => {
    // No existing backups in testDir, so backup must be performed
    const executionOrder: string[] = []

    const originalBackup = db.backup.bind(db)
    vi.spyOn(db, 'backup').mockImplementation(async (dest: string) => {
      executionOrder.push('backup')
      return originalBackup(dest)
    })

    const purgeMock = vi.fn().mockImplementation(async () => {
      executionOrder.push('purge')
    })

    await maybePerformDailyBackup(db, testDir, purgeMock)

    expect(executionOrder).toEqual(['backup', 'purge'])
    expect(purgeMock).toHaveBeenCalledTimes(1)
  })

  it('exports and imports all data accurately', async () => {
    // Setup statements for import
    const upsertLog = db.prepare(`
      INSERT INTO logs (id, date, timestamp, text, startedAt, endedAt, goalId, goalTitle, note, productivity, durationMinutes, productiveMinutes, updatedAt, deletedAt)
      VALUES (@id, @date, @timestamp, @text, @startedAt, @endedAt, @goalId, @goalTitle, @note, @productivity, @durationMinutes, @productiveMinutes, @updatedAt, @deletedAt)
      ON CONFLICT(id) DO UPDATE SET text = excluded.text
    `)
    const upsertDailyGoal = db.prepare(`
      INSERT INTO daily_goals (id, date, title, status, createdAt)
      VALUES (@id, @date, @title, @status, @createdAt)
      ON CONFLICT(id) DO UPDATE SET title = excluded.title
    `)
    const upsertInboxGoal = db.prepare(`
      INSERT INTO inbox_goals (id, title, status, createdAt)
      VALUES (@id, @title, @status, @createdAt)
      ON CONFLICT(id) DO UPDATE SET title = excluded.title
    `)
    const upsertRecurringGoal = db.prepare(`
      INSERT INTO recurring_goals (id, title, status, createdAt, frequency, startsOn)
      VALUES (@id, @title, @status, @createdAt, @frequency, @startsOn)
      ON CONFLICT(id) DO UPDATE SET title = excluded.title
    `)
    const upsertGroupColor = db.prepare(`
      INSERT INTO group_colors (tag, color, updatedAt)
      VALUES (?, ?, ?)
      ON CONFLICT(tag) DO UPDATE SET color = excluded.color
    `)

    const dirtyLogs = new Set<string>()
    const dirtyGoals = new Set<string>()

    const importContext = {
      db,
      upsertLog: (e: any, date: string) =>
        upsertLog.run({
          ...e,
          date,
          startedAt: null,
          endedAt: null,
          goalId: null,
          goalTitle: null,
          note: null,
          productivity: null,
          durationMinutes: null,
          productiveMinutes: null,
          updatedAt: '2026-03-01T00:00:00Z',
          deletedAt: null
        }),
      upsertDailyGoal: (g: any) =>
        upsertDailyGoal.run({
          ...g,
          status: g.status || 'planned',
          createdAt: '2026-03-01T00:00:00Z'
        }),
      upsertInboxGoal: (i: any) =>
        upsertInboxGoal.run({
          ...i,
          status: 'active',
          createdAt: '2026-03-01T00:00:00Z'
        }),
      upsertRecurringGoal: (r: any) =>
        upsertRecurringGoal.run({
          ...r,
          status: 'active',
          frequency: 'daily',
          startsOn: '2026-03-01',
          createdAt: '2026-03-01T00:00:00Z'
        }),
      upsertGroupColor: (tag: string, color: string) =>
        upsertGroupColor.run(tag, color, new Date().toISOString()),
      markDirtyLogDate: (d: string) => dirtyLogs.add(d),
      markDirtyGoalDate: (d: string) => dirtyGoals.add(d),
      onImportComplete: vi.fn()
    }

    const importRes = await importAllData(importContext, {
      logs: [{ id: 'l1', timestamp: '2026-03-01T10:00:00Z', text: 'Work', date: '2026-03-01' }],
      dailyGoals: [
        {
          id: 'g1',
          title: 'Task 1',
          date: '2026-03-01',
          status: 'planned',
          createdAt: '2026-03-01T00:00:00Z'
        }
      ],
      inboxGoals: [
        { id: 'i1', title: 'Inbox 1', status: 'active', createdAt: '2026-03-01T00:00:00Z' }
      ],
      recurringGoals: [
        {
          id: 'r1',
          title: 'Daily review',
          frequency: 'daily',
          startsOn: '2026-03-01',
          status: 'active',
          createdAt: '2026-03-01T00:00:00Z'
        }
      ],
      groupColors: { Work: '#ff0000' }
    })

    expect(importRes.logs).toBe(1)
    expect(importRes.dailyGoals).toBe(1)
    expect(importRes.inboxGoals).toBe(1)
    expect(importRes.recurringGoals).toBe(1)
    expect(importRes.groupColors).toBe(1)
    expect(dirtyLogs.has('2026-03-01')).toBe(true)
    expect(dirtyGoals.has('2026-03-01')).toBe(true)

    // Verify export
    const exportRes = await exportAllData({
      db,
      mapGoalRow: (r) => r as DailyGoal,
      getInboxGoals: async () => [{ id: 'i1', title: 'Inbox 1', status: 'active', createdAt: '' }],
      getRecurringGoals: async () => [
        {
          id: 'r1',
          title: 'Daily review',
          targetMinutes: 15,
          frequency: 'daily',
          startsOn: '2026-03-01',
          status: 'active',
          createdAt: ''
        }
      ],
      getGroupColors: () => ({ work: '#ff0000' }),
      getSettings: () => ({
        reminderIntervalMinutes: 45,
        openAtLogin: true,
        dayCutoffHour: 0,
        theme: 'system',
        showWidget: true,
        driveRefreshToken: 'secret-token'
      })
    })

    expect(exportRes.logs.length).toBe(1)
    expect(exportRes.dailyGoals.length).toBe(1)
    expect(exportRes.groupColors).toEqual({ work: '#ff0000' })
    expect(exportRes.settings.driveRefreshToken).toBeUndefined()
  })

  describe('validateImportPayload & error handling', () => {
    const dummyContext = {
      db: {} as any,
      upsertLog: vi.fn(),
      upsertDailyGoal: vi.fn(),
      upsertInboxGoal: vi.fn(),
      upsertRecurringGoal: vi.fn(),
      upsertGroupColor: vi.fn(),
      markDirtyLogDate: vi.fn(),
      markDirtyGoalDate: vi.fn(),
      onImportComplete: vi.fn()
    }

    it('rejects non-object or null payloads', async () => {
      await expect(importAllData(dummyContext, null)).rejects.toThrow(
        'Invalid import payload: expected an object'
      )
      await expect(importAllData(dummyContext, 'not an object' as any)).rejects.toThrow(
        'Invalid import payload: expected an object'
      )
      await expect(importAllData(dummyContext, [1, 2, 3] as any)).rejects.toThrow(
        'Invalid import payload: expected an object'
      )
    })

    it('rejects empty object without any valid sections', async () => {
      await expect(importAllData(dummyContext, {})).rejects.toThrow(
        'Invalid import data: missing required backup sections'
      )
      await expect(importAllData(dummyContext, { randomKey: 123 })).rejects.toThrow(
        'Invalid import data: missing required backup sections'
      )
    })

    it('rejects non-array collections', async () => {
      await expect(importAllData(dummyContext, { logs: 'not array' })).rejects.toThrow(
        'Invalid import data: "logs" must be an array'
      )
      await expect(importAllData(dummyContext, { dailyGoals: 123 })).rejects.toThrow(
        'Invalid import data: "dailyGoals" must be an array'
      )
      await expect(importAllData(dummyContext, { inboxGoals: {} })).rejects.toThrow(
        'Invalid import data: "inboxGoals" must be an array'
      )
      await expect(importAllData(dummyContext, { recurringGoals: false })).rejects.toThrow(
        'Invalid import data: "recurringGoals" must be an array'
      )
      await expect(importAllData(dummyContext, { groupColors: [1, 2] })).rejects.toThrow(
        'Invalid import data: "groupColors" must be an object'
      )
      await expect(importAllData(dummyContext, { settings: 'invalid' })).rejects.toThrow(
        'Invalid import data: "settings" must be an object'
      )
    })

    it('rejects corrupt items within collections', async () => {
      await expect(
        importAllData(dummyContext, { logs: [{ id: '', timestamp: '2026-03-01T10:00:00Z' }] })
      ).rejects.toThrow("Invalid log entry at index 0: missing or empty 'id'")

      await expect(
        importAllData(dummyContext, { logs: [{ id: 'l1', timestamp: '' }] })
      ).rejects.toThrow("Invalid log entry at index 0: missing or empty 'timestamp'")

      await expect(
        importAllData(dummyContext, {
          dailyGoals: [{ id: 'g1', title: 'Task', date: '' }]
        })
      ).rejects.toThrow("Invalid daily goal at index 0: missing or empty 'date'")

      await expect(
        importAllData(dummyContext, {
          dailyGoals: [{ id: 'g1', title: '', date: '2026-03-01' }]
        })
      ).rejects.toThrow("Invalid daily goal at index 0: missing or empty 'title'")

      await expect(
        importAllData(dummyContext, { inboxGoals: [{ id: 'i1', title: '' }] })
      ).rejects.toThrow("Invalid inbox goal at index 0: missing or empty 'title'")

      await expect(
        importAllData(dummyContext, { recurringGoals: [{ id: '', title: 'Test' }] })
      ).rejects.toThrow("Invalid recurring goal at index 0: missing or empty 'id'")
    })
  })
})
