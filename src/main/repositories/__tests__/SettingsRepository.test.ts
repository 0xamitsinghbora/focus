import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import os from 'os'
import path from 'path'
import fs from 'fs'
import { initDatabaseSchema } from '../../dataMigrations'
import { SettingsRepository, DEFAULT_SETTINGS } from '../SettingsRepository'

let testDir: string
let db: Database.Database
let settingsRepo: SettingsRepository
let dirtyCount: number

beforeEach(() => {
  testDir = path.join(
    os.tmpdir(),
    `focus-settings-repo-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  )
  fs.mkdirSync(testDir, { recursive: true })
  const dbPath = path.join(testDir, 'test.db')
  db = new Database(dbPath)
  db.pragma('foreign_keys = ON')
  initDatabaseSchema(db)

  dirtyCount = 0
  settingsRepo = new SettingsRepository(db, () => {
    dirtyCount++
  })
})

afterEach(() => {
  if (db) db.close()
  try {
    fs.rmSync(testDir, { recursive: true, force: true })
  } catch {}
  vi.restoreAllMocks()
})

describe('SettingsRepository', () => {
  it('returns default settings when database is empty', () => {
    const s = settingsRepo.getSettings()
    expect(s.reminderIntervalMinutes).toBe(DEFAULT_SETTINGS.reminderIntervalMinutes)
    expect(s.openAtLogin).toBe(DEFAULT_SETTINGS.openAtLogin)
    expect(s.dailyFocusTargetMinutes).toBe(480)
    expect(s.hasCompletedOnboarding).toBe(false)
  })

  it('persists and patches settings', () => {
    settingsRepo.setSettings({
      ...DEFAULT_SETTINGS,
      reminderIntervalMinutes: 20,
      theme: 'dark'
    })
    expect(dirtyCount).toBe(1)

    const updated = settingsRepo.getSettings()
    expect(updated.reminderIntervalMinutes).toBe(20)
    expect(updated.theme).toBe('dark')

    settingsRepo.patchSettings({ theme: 'light' })
    expect(dirtyCount).toBe(2)
    expect(settingsRepo.getSettings().theme).toBe('light')
    expect(settingsRepo.getSettings().reminderIntervalMinutes).toBe(20)
  })

  it('manages group colors in group_colors table', () => {
    settingsRepo.setGroupColor('Work', '#ff0000')
    settingsRepo.setGroupColor('Personal', '#00ff00')

    const colors = settingsRepo.getGroupColors()
    expect(colors['work']).toBe('#ff0000')
    expect(colors['personal']).toBe('#00ff00')

    settingsRepo.deleteGroupColor('Work')
    expect(settingsRepo.getGroupColors()['work']).toBeUndefined()
    expect(settingsRepo.getGroupColors()['personal']).toBe('#00ff00')
  })

  it('persists and restores active session in sync_state', () => {
    expect(settingsRepo.getActiveSession()).toBeNull()

    const session = {
      isActive: true,
      isPaused: false,
      isBreak: false,
      isOvertime: false,
      secondsRemaining: 1500,
      totalSeconds: 1500,
      goalId: 'test-goal'
    }

    settingsRepo.setActiveSession(session, true)
    const restored = settingsRepo.getActiveSession()
    expect(restored).not.toBeNull()
    expect(restored?.isActive).toBe(true)
    expect(restored?.totalSeconds).toBe(1500)
    expect(restored?.goalId).toBe('test-goal')

    settingsRepo.setActiveSession(null, true)
    expect(settingsRepo.getActiveSession()).toBeNull()
  })
})
