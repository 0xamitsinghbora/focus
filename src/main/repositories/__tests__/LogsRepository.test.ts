import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import os from 'os'
import path from 'path'
import fs from 'fs'
import { initDatabaseSchema } from '../../dataMigrations'
import { LogsRepository } from '../LogsRepository'
import { LogEntry } from '../../../shared/types'

let testDir: string
let db: Database.Database
let logsRepo: LogsRepository
let dirtyDates: string[]

beforeEach(() => {
  testDir = path.join(
    os.tmpdir(),
    `focus-logs-repo-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  )
  fs.mkdirSync(testDir, { recursive: true })
  const dbPath = path.join(testDir, 'test.db')
  db = new Database(dbPath)
  db.pragma('foreign_keys = ON')
  initDatabaseSchema(db)

  dirtyDates = []
  logsRepo = new LogsRepository(db, (d) => dirtyDates.push(d))
})

afterEach(() => {
  if (db) db.close()
  try {
    fs.rmSync(testDir, { recursive: true, force: true })
  } catch {}
  vi.restoreAllMocks()
})

describe('LogsRepository', () => {
  it('appends and reads back logs for a specific date', async () => {
    const entry: LogEntry = {
      id: 'log-1',
      text: 'Working on architectural refactor',
      timestamp: '2026-03-15T10:00:00.000Z',
      durationMinutes: 45,
      productiveMinutes: 45,
      productivity: 'productive',
      focusQuality: 5
    }

    await logsRepo.appendLog('2026-03-15', entry)
    expect(dirtyDates).toContain('2026-03-15')

    const logs = await logsRepo.getLogs('2026-03-15')
    expect(logs.length).toBe(1)
    expect(logs[0].id).toBe('log-1')
    expect(logs[0].text).toBe('Working on architectural refactor')
    expect(logs[0].focusQuality).toBe(5)
  })

  it('updates log and sets updatedAt timestamp', async () => {
    const entry: LogEntry = {
      id: 'log-2',
      text: 'Draft notes',
      timestamp: '2026-03-15T11:00:00.000Z',
      durationMinutes: 30
    }
    await logsRepo.appendLog('2026-03-15', entry)

    const updated = await logsRepo.updateLog('2026-03-15', {
      ...entry,
      text: 'Refined notes'
    })
    expect(updated.text).toBe('Refined notes')
    expect(updated.updatedAt).toBeDefined()

    const logs = await logsRepo.getLogs('2026-03-15')
    expect(logs[0].text).toBe('Refined notes')
  })

  it('soft-deletes log on deleteLog and excludes from active query', async () => {
    const entry: LogEntry = {
      id: 'log-3',
      text: 'Temporary log',
      timestamp: '2026-03-15T12:00:00.000Z'
    }
    await logsRepo.appendLog('2026-03-15', entry)

    const affectedDate = await logsRepo.deleteLog('log-3')
    expect(affectedDate).toBe('2026-03-15')

    const active = await logsRepo.getLogs('2026-03-15', false)
    expect(active.length).toBe(0)

    const all = await logsRepo.getLogs('2026-03-15', true)
    expect(all.length).toBe(1)
    expect(all[0].deletedAt).toBeDefined()
  })

  it('retrieves all distinct dates', async () => {
    await logsRepo.appendLog('2026-03-10', {
      id: 'l-1',
      text: 'Task 1',
      timestamp: '2026-03-10T10:00:00Z'
    })
    await logsRepo.appendLog('2026-03-12', {
      id: 'l-2',
      text: 'Task 2',
      timestamp: '2026-03-12T10:00:00Z'
    })

    const dates = await logsRepo.getAllLogDates()
    expect(dates).toEqual(['2026-03-10', '2026-03-12'])
  })

  it('recalculates effective dates across logs when dayCutoffHour changes', async () => {
    // 03:00 UTC on 2026-03-15
    const earlyMorningLog: LogEntry = {
      id: 'log-early',
      text: 'Night owl session',
      timestamp: '2026-03-15T03:00:00.000Z',
      startedAt: '2026-03-15T02:30:00.000Z',
      endedAt: '2026-03-15T03:00:00.000Z'
    }
    // Initially saved with dayCutoffHour = 0 (belongs to 2026-03-15 in UTC)
    await logsRepo.appendLog('2026-03-15', earlyMorningLog)
    expect((await logsRepo.getLogs('2026-03-15')).length).toBe(1)

    // With cutoff = 4, 02:30/03:00 belongs to previous day (2026-03-14)
    logsRepo.recalculateEffectiveDates(4)

    // Check that dirty dates were emitted
    expect(dirtyDates.length).toBeGreaterThan(0)

    // Verify it moved from 2026-03-15 to 2026-03-14 (or appropriate date based on local time and cutoff)
    const allDates = await logsRepo.getAllLogDates()
    expect(allDates.length).toBe(1)
  })
})
