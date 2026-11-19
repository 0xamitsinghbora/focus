import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  encryptToken,
  decryptToken,
  withRetry,
  idSetsDiffer,
  mergedDiffers,
  computeChecksum,
  DriveSyncManager
} from '../driveSync'
import { safeStorage, shell, ipcMain } from 'electron'
import { auth } from '../driveClient'
import http from 'http'
import os from 'os'
import path from 'path'
import fs from 'fs'
import { DataManager } from '../dataManager'
import { ReminderScheduler } from '../scheduler'
import * as configModule from '../../shared/config'

vi.mock('../windows/prompt', () => ({
  showPromptWindow: vi.fn(),
  hidePromptWindow: vi.fn(),
  createPromptWindow: vi.fn(),
  isPromptVisible: vi.fn(() => false),
  onPromptDismiss: vi.fn(() => () => {}),
  setPromptSnoozeHandler: vi.fn()
}))

let testDir: string
let dm: DataManager
let scheduler: ReminderScheduler

beforeEach(() => {
  testDir = path.join(
    os.tmpdir(),
    `focus-drivesync-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  )
  fs.mkdirSync(testDir, { recursive: true })
  vi.stubEnv('FOCUS_TEST_USER_DATA', testDir)

  dm = new DataManager()
  scheduler = new ReminderScheduler(dm)
})

afterEach(() => {
  if (scheduler) scheduler.stopTimer()
  if (dm) dm.getDb().close()
  try {
    fs.rmSync(testDir, { recursive: true, force: true })
  } catch {}
  vi.restoreAllMocks()
})

describe('DriveSync — Token Encryption & Decryption', () => {
  it('passes tokens through when safeStorage encryption is unavailable', () => {
    vi.spyOn(safeStorage, 'isEncryptionAvailable').mockReturnValue(false)
    const token = 'my-secret-refresh-token'
    expect(encryptToken(token)).toBe(token)
    expect(decryptToken(token)).toBe(token)
  })

  it('encrypts and decrypts correctly when safeStorage is available', () => {
    vi.spyOn(safeStorage, 'isEncryptionAvailable').mockReturnValue(true)
    vi.spyOn(safeStorage, 'encryptString').mockImplementation((s) => Buffer.from(`ENC:${s}`))
    vi.spyOn(safeStorage, 'decryptString').mockImplementation((b) => {
      const str = b.toString('utf8')
      if (str.startsWith('ENC:')) return str.slice(4)
      throw new Error('Invalid encrypted buffer')
    })

    const token = 'oauth2-secret-refresh-token-12345'
    const encrypted = encryptToken(token)

    expect(encrypted).not.toBe(token)
    expect(typeof encrypted).toBe('string')
    expect(decryptToken(encrypted)).toBe(token)
  })

  it('handles decryption failure gracefully by returning stored string for unencrypted data', () => {
    vi.spyOn(safeStorage, 'isEncryptionAvailable').mockReturnValue(true)
    vi.spyOn(safeStorage, 'decryptString').mockImplementation(() => {
      throw new Error('Decryption failed')
    })

    const raw = 'corrupted-data'
    expect(decryptToken(raw)).toBe(raw)
  })

  it('returns empty string when safeStorage becomes unavailable for encrypted token', () => {
    // Token was encrypted previously
    vi.spyOn(safeStorage, 'isEncryptionAvailable').mockReturnValue(true)
    vi.spyOn(safeStorage, 'encryptString').mockImplementation((s) => Buffer.from(`ENC:${s}`))
    const encrypted = encryptToken('secret-token-xyz')

    // Now safeStorage becomes unavailable
    vi.spyOn(safeStorage, 'isEncryptionAvailable').mockReturnValue(false)
    expect(decryptToken(encrypted)).toBe('')
  })

  it('returns empty string on decryption failure for encrypted token to avoid sending ciphertext', () => {
    vi.spyOn(safeStorage, 'isEncryptionAvailable').mockReturnValue(true)
    vi.spyOn(safeStorage, 'encryptString').mockImplementation((s) => Buffer.from(`ENC:${s}`))
    const encrypted = encryptToken('secret-token-xyz')

    vi.spyOn(safeStorage, 'decryptString').mockImplementation(() => {
      throw new Error('Hardware keychain error')
    })
    expect(decryptToken(encrypted)).toBe('')
  })
})

describe('DriveSync — withRetry', () => {
  it('returns result immediately when operation succeeds', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    const result = await withRetry(fn, 3, 10)
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries on status 429 and eventually succeeds', async () => {
    let callCount = 0
    const fn = vi.fn().mockImplementation(async () => {
      callCount++
      if (callCount < 2) {
        const err: any = new Error('Rate limited')
        err.response = { status: 429 }
        throw err
      }
      return 'recovered'
    })

    const result = await withRetry(fn, 3, 5)
    expect(result).toBe('recovered')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('retries on status 503 and network errors (ECONNRESET, ETIMEDOUT)', async () => {
    let callCount = 0
    const fn = vi.fn().mockImplementation(async () => {
      callCount++
      if (callCount === 1) {
        const err: any = new Error('Service Unavailable')
        err.response = { status: 503 }
        throw err
      }
      if (callCount === 2) {
        const err: any = new Error('Connection reset')
        err.code = 'ECONNRESET'
        throw err
      }
      return 'success after network hiccups'
    })

    const result = await withRetry(fn, 4, 5)
    expect(result).toBe('success after network hiccups')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('fails immediately on non-retryable error (e.g. 401 Unauthorized or 400 Bad Request)', async () => {
    const fn = vi.fn().mockImplementation(async () => {
      const err: any = new Error('Bad Request')
      err.response = { status: 400 }
      throw err
    })

    await expect(withRetry(fn, 3, 5)).rejects.toThrow('Bad Request')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('throws when maxAttempts are exhausted', async () => {
    const fn = vi.fn().mockImplementation(async () => {
      const err: any = new Error('Rate limited')
      err.response = { status: 429 }
      throw err
    })

    await expect(withRetry(fn, 3, 5)).rejects.toThrow('Rate limited')
    expect(fn).toHaveBeenCalledTimes(3)
  })
})

describe('DriveSync — Diff Detection Helpers', () => {
  it('idSetsDiffer correctly detects set differences', () => {
    const a = [{ id: '1' }, { id: '2' }]
    const b = [{ id: '2' }, { id: '1' }]
    const c = [{ id: '1' }, { id: '3' }]
    const d = [{ id: '1' }]

    expect(idSetsDiffer(a, b)).toBe(false)
    expect(idSetsDiffer(a, c)).toBe(true)
    expect(idSetsDiffer(a, d)).toBe(true)
  })

  it('mergedDiffers detects differences based on IDs and lifecycle timestamps', () => {
    const original = [
      { id: 'g1', title: 'Task 1', updatedAt: 100 },
      { id: 'g2', title: 'Task 2', updatedAt: 200 }
    ]

    const unchanged = [
      { id: 'g1', title: 'Task 1', updatedAt: 100 },
      { id: 'g2', title: 'Task 2', updatedAt: 200 }
    ]

    const updated = [
      { id: 'g1', title: 'Task 1', updatedAt: 150 },
      { id: 'g2', title: 'Task 2', updatedAt: 200 }
    ]

    const added = [...original, { id: 'g3', title: 'Task 3', updatedAt: 300 }]

    expect(mergedDiffers(unchanged, original, (i) => i.updatedAt)).toBe(false)
    expect(mergedDiffers(updated, original, (i) => i.updatedAt)).toBe(true)
    expect(mergedDiffers(added, original, (i) => i.updatedAt)).toBe(true)
  })
})

describe('DriveSync — DriveSyncManager Operations', () => {
  it('registers and cleans up IPC handlers idempotently across multiple instantiations', () => {
    const handleSpy = vi.spyOn(ipcMain, 'handle')
    const removeHandlerSpy = vi.spyOn(ipcMain, 'removeHandler')

    const mgr1 = new DriveSyncManager(dm, scheduler)
    expect(removeHandlerSpy).toHaveBeenCalled()
    expect(handleSpy).toHaveBeenCalled()

    // Second instantiation must not throw and should re-register cleanly
    const mgr2 = new DriveSyncManager(dm, scheduler)
    expect(removeHandlerSpy).toHaveBeenCalled()

    mgr1.destroy()
    mgr2.destroy()
    expect(removeHandlerSpy).toHaveBeenCalled()
  })

  it('connect returns error if Google OAuth is not configured', async () => {
    vi.spyOn(configModule, 'isGoogleOAuthConfigured').mockReturnValue(false)
    const syncManager = new DriveSyncManager(dm, scheduler)

    const result = await syncManager.connect()
    expect(result.success).toBe(false)
    expect(result.error).toContain('not configured')
  })

  it('disconnect clears refresh token and disables sync', async () => {
    scheduler.setSettings({
      ...scheduler.getSettings(),
      driveRefreshToken: 'some-token',
      driveSyncEnabled: true
    })

    const syncManager = new DriveSyncManager(dm, scheduler)
    await syncManager.disconnect()

    const settings = scheduler.getSettings()
    expect(settings.driveRefreshToken).toBeUndefined()
    expect(settings.driveSyncEnabled).toBe(false)
  })

  it('syncNow fails if drive is not connected or sync disabled', async () => {
    const syncManager = new DriveSyncManager(dm, scheduler)
    const result1 = await syncManager.syncNow()
    expect(result1.success).toBe(false)

    ;(syncManager as any).drive = {}
    scheduler.setSettings({ ...scheduler.getSettings(), driveSyncEnabled: false })
    const result2 = await syncManager.syncNow()
    expect(result2.success).toBe(false)
    expect(result2.error).toContain('Sync is disabled')
  })

  it('syncNow prevents concurrent sync runs', async () => {
    const syncManager = new DriveSyncManager(dm, scheduler)
    ;(syncManager as any).drive = {}
    ;(syncManager as any).isSyncing = true

    const result = await syncManager.syncNow()
    expect(result.success).toBe(false)
    expect(result.error).toBe('Cannot sync right now')
  })

  it('disconnect while syncNow is in flight terminates cleanly without resurrecting dirty targets', async () => {
    scheduler.setSettings({
      ...scheduler.getSettings(),
      driveRefreshToken: 'token',
      driveSyncEnabled: true,
      syncProvider: 'google-drive'
    })
    const syncManager = new DriveSyncManager(dm, scheduler)

    let resolveList: (val: any) => void
    const listPromise = new Promise((resolve) => {
      resolveList = resolve
    })

    const mockDrive = {
      files: {
        list: vi.fn().mockImplementation(() => listPromise)
      }
    }
    ;(syncManager as any).drive = mockDrive
    ;(syncManager as any).dirtyLogDates.add('2026-03-30')
    ;(syncManager as any).dirtyGoalDates.add('2026-03-30')
    ;(syncManager as any).dirtyInbox = true

    // Start syncNow in background
    const syncPromise = syncManager.syncNow({ incremental: true })

    // While in flight, user disconnects
    await syncManager.disconnect()

    // Now resolve list
    resolveList!({ data: { files: [] } })

    const result = await syncPromise
    expect(result.success).toBe(false)
    expect(result.error).toBe('Sync disconnected')
    expect((syncManager as any).dirtyLogDates.size).toBe(0)
    expect((syncManager as any).dirtyGoalDates.size).toBe(0)
    expect((syncManager as any).dirtyInbox).toBe(false)
    expect((syncManager as any).lastSyncError).toBeNull()
  })

  it('aborts active readDriveFile stream on disconnect()', async () => {
    const syncManager = new DriveSyncManager(dm, scheduler)
    scheduler.setSettings({ ...scheduler.getSettings(), driveSyncEnabled: true })

    const mockStream: any = {
      on: vi.fn(),
      destroy: vi.fn()
    }
    const mockDrive = {
      files: {
        get: vi.fn().mockResolvedValue({ data: mockStream })
      }
    }
    ;(syncManager as any).drive = mockDrive
    ;(syncManager as any).syncAbortController = new AbortController()

    const readPromise = (syncManager as any).readDriveFile('test-file-id')

    // Disconnect while read is pending
    await syncManager.disconnect()

    await expect(readPromise).rejects.toThrow('Sync aborted: Drive client disconnected')
    expect(mockStream.destroy).toHaveBeenCalled()
  })

  it('scheduleSyncAfterWrite debounces multiple calls', () => {
    vi.useFakeTimers()
    const syncManager = new DriveSyncManager(dm, scheduler)
    const syncNowSpy = vi.spyOn(syncManager, 'syncNow').mockResolvedValue({ success: true })

    syncManager.scheduleSyncAfterWrite()
    syncManager.scheduleSyncAfterWrite()
    syncManager.scheduleSyncAfterWrite()

    expect(syncNowSpy).not.toHaveBeenCalled()

    vi.advanceTimersByTime(2000)
    expect(syncNowSpy).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('performs two-way log sync merging remote and local logs', async () => {
    const syncManager = new DriveSyncManager(dm, scheduler)
    scheduler.setSettings({ ...scheduler.getSettings(), driveSyncEnabled: true })

    await dm.appendLog('2026-02-10', {
      id: 'local-1',
      timestamp: '2026-02-10T09:00:00Z',
      text: 'Local entry'
    })

    const remoteLogContent = JSON.stringify([
      { id: 'remote-1', timestamp: '2026-02-10T10:00:00Z', text: 'Remote entry' }
    ])

    const updateMock = vi.fn().mockResolvedValue({})
    const createMock = vi.fn().mockResolvedValue({ data: { id: 'new-file-id' } })

    const mockDrive = {
      files: {
        list: vi.fn().mockResolvedValue({
          data: {
            files: [{ id: 'file-2026-02-10', name: '2026-02-10.json' }],
            nextPageToken: null
          }
        }),
        get: vi.fn().mockImplementation(() => {
          const { Readable } = require('stream')
          const stream = new Readable()
          stream.push(remoteLogContent)
          stream.push(null)
          return Promise.resolve({ data: stream })
        }),
        update: updateMock,
        create: createMock
      }
    }

    ;(syncManager as any).drive = mockDrive

    const res = await syncManager.syncNow()
    expect(res.success).toBe(true)

    const logs = await dm.getLogs('2026-02-10')
    expect(logs).toHaveLength(2)
    expect(logs.map((l) => l.id).sort()).toEqual(['local-1', 'remote-1'])

    expect(updateMock).toHaveBeenCalled()
    const updatedPayload = JSON.parse(updateMock.mock.calls[0][0].media.body)
    expect(updatedPayload).toHaveLength(2)
  })

  it('performs two-way goal sync resolving conflicts via lifecycle timestamps', async () => {
    const syncManager = new DriveSyncManager(dm, scheduler)
    scheduler.setSettings({ ...scheduler.getSettings(), driveSyncEnabled: true })

    const goal = await dm.addGoal('2026-02-15', 'Feature A')

    const remoteGoal = {
      ...goal,
      status: 'done',
      completedAt: new Date(Date.now() + 50000).toISOString()
    }

    const updateMock = vi.fn().mockResolvedValue({})

    const mockDrive = {
      files: {
        list: vi.fn().mockResolvedValue({
          data: {
            files: [{ id: 'file-goals-2026-02-15', name: 'goals-2026-02-15.json' }],
            nextPageToken: null
          }
        }),
        get: vi.fn().mockImplementation(() => {
          const { Readable } = require('stream')
          const stream = new Readable()
          stream.push(JSON.stringify([remoteGoal]))
          stream.push(null)
          return Promise.resolve({ data: stream })
        }),
        update: updateMock,
        create: vi.fn().mockResolvedValue({ data: { id: 'new-id' } })
      }
    }

    ;(syncManager as any).drive = mockDrive

    const res = await syncManager.syncNow()
    expect(res.success).toBe(true)

    const goals = await dm.getGoals('2026-02-15')
    expect(goals).toHaveLength(1)
    expect(goals[0].status).toBe('done')
    expect(goals[0].completedAt).toBe(remoteGoal.completedAt)
  })

  it('syncSettings updates local settings when remote is newer without wiping local refresh token', async () => {
    const syncManager = new DriveSyncManager(dm, scheduler)
    scheduler.setSettings(
      {
        reminderIntervalMinutes: 45,
        openAtLogin: true,
        driveRefreshToken: 'my-local-refresh-token',
        driveSyncEnabled: true,
        lastUpdated: 1000
      },
      false
    )

    const remoteSettings = {
      reminderIntervalMinutes: 25,
      openAtLogin: false,
      lastUpdated: 2000
    }

    const mockDrive = {
      files: {
        list: vi.fn().mockResolvedValue({
          data: {
            files: [{ id: 'settings-file-id', name: 'settings.json' }],
            nextPageToken: null
          }
        }),
        get: vi.fn().mockImplementation(() => {
          const { Readable } = require('stream')
          const stream = new Readable()
          stream.push(JSON.stringify(remoteSettings))
          stream.push(null)
          return Promise.resolve({ data: stream })
        }),
        update: vi.fn().mockResolvedValue({}),
        create: vi.fn().mockResolvedValue({})
      }
    }

    ;(syncManager as any).drive = mockDrive

    const res = await syncManager.syncNow()
    expect(res.success).toBe(true)

    const updatedSettings = scheduler.getSettings()
    expect(updatedSettings.reminderIntervalMinutes).toBe(25)
    expect(updatedSettings.openAtLogin).toBe(false)
    expect(updatedSettings.driveRefreshToken).toBe('my-local-refresh-token')
  })

  it('calls onDataUpdated when remote changes are applied to local storage', async () => {
    const onDataUpdatedMock = vi.fn()
    const syncManager = new DriveSyncManager(dm, scheduler, onDataUpdatedMock)
    scheduler.setSettings(
      {
        reminderIntervalMinutes: 45,
        openAtLogin: true,
        driveRefreshToken: 'my-local-refresh-token',
        driveSyncEnabled: true,
        lastUpdated: 1000
      },
      false
    )

    const remoteSettings = {
      reminderIntervalMinutes: 25,
      openAtLogin: false,
      lastUpdated: 2000
    }

    const mockDrive = {
      files: {
        list: vi.fn().mockResolvedValue({
          data: {
            files: [{ id: 'settings-file-id', name: 'settings.json' }],
            nextPageToken: null
          }
        }),
        get: vi.fn().mockImplementation(() => {
          const { Readable } = require('stream')
          const stream = new Readable()
          stream.push(JSON.stringify(remoteSettings))
          stream.push(null)
          return Promise.resolve({ data: stream })
        }),
        update: vi.fn().mockResolvedValue({}),
        create: vi.fn().mockResolvedValue({})
      }
    }

    ;(syncManager as any).drive = mockDrive

    const res = await syncManager.syncNow()
    expect(res.success).toBe(true)
    expect(onDataUpdatedMock).toHaveBeenCalledTimes(1)
  })

  it('handles remote corrupted JSON gracefully without crashing syncNow', async () => {
    const syncManager = new DriveSyncManager(dm, scheduler)
    scheduler.setSettings({ ...scheduler.getSettings(), driveSyncEnabled: true })

    const mockDrive = {
      files: {
        list: vi.fn().mockResolvedValue({
          data: {
            files: [{ id: 'bad-log', name: '2026-03-01.json' }],
            nextPageToken: null
          }
        }),
        get: vi.fn().mockImplementation(() => {
          const { Readable } = require('stream')
          const stream = new Readable()
          stream.push('THIS IS NOT VALID JSON {{{{')
          stream.push(null)
          return Promise.resolve({ data: stream })
        }),
        update: vi.fn().mockResolvedValue({}),
        create: vi.fn().mockResolvedValue({})
      }
    }

    ;(syncManager as any).drive = mockDrive

    const res = await syncManager.syncNow()
    expect(res.success).toBe(true)
  })

  it('syncLogs merges updated and deleted logs based on lifecycle time', async () => {
    const syncManager = new DriveSyncManager(dm, scheduler)
    scheduler.setSettings({ ...scheduler.getSettings(), driveSyncEnabled: true })

    await dm.appendLog('2026-03-01', {
      id: 'log-1',
      timestamp: '2026-03-01T10:00:00.000Z',
      text: 'Local work',
      updatedAt: '2026-03-01T10:00:00.000Z'
    })

    const remoteLog = {
      id: 'log-1',
      timestamp: '2026-03-01T10:00:00.000Z',
      text: 'Updated remote work',
      updatedAt: '2026-03-01T11:00:00.000Z'
    }

    const mockDrive = {
      files: {
        list: vi.fn().mockResolvedValue({
          data: {
            files: [{ id: 'drive-log-1', name: '2026-03-01.json' }],
            nextPageToken: null
          }
        }),
        get: vi.fn().mockImplementation(() => {
          const { Readable } = require('stream')
          const stream = new Readable()
          stream.push(JSON.stringify([remoteLog]))
          stream.push(null)
          return Promise.resolve({ data: stream })
        }),
        update: vi.fn().mockResolvedValue({}),
        create: vi.fn().mockResolvedValue({})
      }
    }

    ;(syncManager as any).drive = mockDrive
    const res = await syncManager.syncNow()
    expect(res.success).toBe(true)

    const localLogs = await dm.getLogs('2026-03-01')
    expect(localLogs).toHaveLength(1)
    expect(localLogs[0].text).toBe('Updated remote work')
  })

  it('does NOT resurrect locally deleted goals and uploads tombstone to Drive', async () => {
    const syncManager = new DriveSyncManager(dm, scheduler)
    scheduler.setSettings({ ...scheduler.getSettings(), driveSyncEnabled: true })

    const date = '2026-03-05'
    const goal = await dm.addGoal(date, 'Goal to be deleted')

    // Simulate that the remote drive already has this goal as active from a previous sync
    const remoteActiveGoal = {
      ...goal,
      updatedAt: goal.updatedAt || '2026-03-05T10:00:00.000Z'
    }

    // Now user deletes the goal locally
    await dm.deleteGoal(goal.id)

    // Ensure it's deleted locally
    expect(await dm.getGoals(date)).toHaveLength(0)

    const updateMock = vi.fn().mockResolvedValue({})
    const mockDrive = {
      files: {
        list: vi.fn().mockResolvedValue({
          data: {
            files: [{ id: 'drive-goal-file', name: `goals-${date}.json` }],
            nextPageToken: null
          }
        }),
        get: vi.fn().mockImplementation(() => {
          const { Readable } = require('stream')
          const stream = new Readable()
          stream.push(JSON.stringify([remoteActiveGoal]))
          stream.push(null)
          return Promise.resolve({ data: stream })
        }),
        update: updateMock,
        create: vi.fn().mockResolvedValue({})
      }
    }

    ;(syncManager as any).drive = mockDrive
    const res = await syncManager.syncNow()
    expect(res.success).toBe(true)

    // Critical assertion: Goal was NOT resurrected!
    const activeGoals = await dm.getGoals(date)
    expect(activeGoals).toHaveLength(0)

    // Verify tombstone was uploaded to Google Drive
    expect(updateMock).toHaveBeenCalled()
    const updatedPayload = JSON.parse(updateMock.mock.calls[0][0].media.body)
    expect(updatedPayload).toHaveLength(1)
    expect(updatedPayload[0].id).toBe(goal.id)
    expect(updatedPayload[0].deletedAt).toBeDefined()
  })

  it('soft-deletes local goal when remote contains a newer tombstone', async () => {
    const syncManager = new DriveSyncManager(dm, scheduler)
    scheduler.setSettings({ ...scheduler.getSettings(), driveSyncEnabled: true })

    const date = '2026-03-06'
    const goal = await dm.addGoal(date, 'Remote will delete this')

    const remoteTombstone = {
      ...goal,
      deletedAt: new Date(Date.now() + 60000).toISOString(),
      updatedAt: new Date(Date.now() + 60000).toISOString()
    }

    const mockDrive = {
      files: {
        list: vi.fn().mockResolvedValue({
          data: {
            files: [{ id: 'drive-goal-tombstone', name: `goals-${date}.json` }],
            nextPageToken: null
          }
        }),
        get: vi.fn().mockImplementation(() => {
          const { Readable } = require('stream')
          const stream = new Readable()
          stream.push(JSON.stringify([remoteTombstone]))
          stream.push(null)
          return Promise.resolve({ data: stream })
        }),
        update: vi.fn().mockResolvedValue({}),
        create: vi.fn().mockResolvedValue({})
      }
    }

    ;(syncManager as any).drive = mockDrive
    const res = await syncManager.syncNow()
    expect(res.success).toBe(true)

    // Local DB adopted tombstone: active is 0, full with deleted is 1
    expect(await dm.getGoals(date)).toHaveLength(0)
    const allGoals = await dm.getGoals(date, true)
    expect(allGoals).toHaveLength(1)
    expect(allGoals[0].deletedAt).toBe(remoteTombstone.deletedAt)
  })

  it('does NOT resurrect locally deleted logs and uploads tombstone to Drive', async () => {
    const syncManager = new DriveSyncManager(dm, scheduler)
    scheduler.setSettings({ ...scheduler.getSettings(), driveSyncEnabled: true })

    const date = '2026-03-07'
    const logId = 'log-to-delete-test'
    await dm.appendLog(date, {
      id: logId,
      timestamp: '2026-03-07T10:00:00.000Z',
      text: 'Log to delete',
      updatedAt: '2026-03-07T10:00:00.000Z'
    })

    const remoteActiveLog = {
      id: logId,
      timestamp: '2026-03-07T10:00:00.000Z',
      text: 'Log to delete',
      updatedAt: '2026-03-07T10:00:00.000Z'
    }

    // Locally delete log
    await dm.deleteLog(logId)
    expect(await dm.getLogs(date)).toHaveLength(0)

    const updateMock = vi.fn().mockResolvedValue({})
    const mockDrive = {
      files: {
        list: vi.fn().mockResolvedValue({
          data: {
            files: [{ id: 'drive-log-tombstone', name: `${date}.json` }],
            nextPageToken: null
          }
        }),
        get: vi.fn().mockImplementation(() => {
          const { Readable } = require('stream')
          const stream = new Readable()
          stream.push(JSON.stringify([remoteActiveLog]))
          stream.push(null)
          return Promise.resolve({ data: stream })
        }),
        update: updateMock,
        create: vi.fn().mockResolvedValue({})
      }
    }

    ;(syncManager as any).drive = mockDrive
    const res = await syncManager.syncNow()
    expect(res.success).toBe(true)

    // Must NOT be resurrected
    expect(await dm.getLogs(date)).toHaveLength(0)

    // Tombstone must be uploaded
    expect(updateMock).toHaveBeenCalled()
    const updatedPayload = JSON.parse(updateMock.mock.calls[0][0].media.body)
    expect(updatedPayload).toHaveLength(1)
    expect(updatedPayload[0].id).toBe(logId)
    expect(updatedPayload[0].deletedAt).toBeDefined()
  })
})

describe('DriveSync — OAuth Loopback Server & Port Fallback', () => {
  it('falls back to next available port when port 3456 is already in use (EADDRINUSE)', async () => {
    // Occupy port 3456 with a dummy server
    const dummyServer = http.createServer((_req, res) => res.end('occupied'))
    try {
      await new Promise<void>((resolve, reject) => {
        dummyServer.once('error', reject)
        dummyServer.listen(3456, () => resolve())
      })
    } catch {
      // If 3456 cannot be bound on this system, skip test gracefully
      return
    }

    const syncManager = new DriveSyncManager(dm, scheduler)
    try {
      vi.spyOn(configModule, 'isGoogleOAuthConfigured').mockReturnValue(true)
      vi.spyOn(syncManager, 'syncNow').mockResolvedValue({ success: true })
      const openExternalSpy = vi.spyOn(shell, 'openExternal').mockResolvedValue()
      const getTokenSpy = vi.spyOn(auth.OAuth2.prototype, 'getToken').mockResolvedValue({
        tokens: { refresh_token: 'test-fallback-refresh-token' },
        res: null as any
      } as any)

      const connectPromise = syncManager.connect()

      await vi.waitFor(() => {
        expect(openExternalSpy).toHaveBeenCalled()
      })

      const authUrl = openExternalSpy.mock.calls[0][0] as string
      const parsedUrl = new URL(authUrl)
      const redirectUri = parsedUrl.searchParams.get('redirect_uri')
      const state = parsedUrl.searchParams.get('state')

      expect(redirectUri).toBeDefined()
      expect(state).toBeDefined()
      expect(parsedUrl.searchParams.get('code_challenge')).toBeTruthy()
      expect(parsedUrl.searchParams.get('code_challenge_method')).toBe('S256')

      // The redirect URI should NOT be port 3456 because 3456 was in use!
      const redirectParsed = new URL(redirectUri!)
      expect(redirectParsed.port).not.toBe('3456')
      expect(parseInt(redirectParsed.port, 10)).toBeGreaterThan(3456)

      // Send callback request to the fallback port
      const callbackRes = await fetch(`${redirectUri}?code=valid-auth-code&state=${state}`)
      expect(callbackRes.status).toBe(200)
      const text = await callbackRes.text()
      expect(text).toContain('Authentication successful!')

      const connectResult = await connectPromise
      expect(connectResult.success).toBe(true)
      expect(getTokenSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'valid-auth-code',
          redirect_uri: redirectUri,
          codeVerifier: expect.any(String)
        })
      )

      const settings = scheduler.getSettings()
      expect(settings.syncProvider).toBe('google-drive')
      expect(settings.driveSyncEnabled).toBe(true)
      expect(decryptToken(settings.driveRefreshToken!)).toBe('test-fallback-refresh-token')
    } finally {
      syncManager.destroy()
      await new Promise<void>((resolve) => dummyServer.close(() => resolve()))
    }
  })

  it('rejects callback with 403 on CSRF state mismatch', async () => {
    vi.spyOn(configModule, 'isGoogleOAuthConfigured').mockReturnValue(true)
    const openExternalSpy = vi.spyOn(shell, 'openExternal').mockResolvedValue()

    const syncManager = new DriveSyncManager(dm, scheduler)
    try {
      const connectPromise = syncManager.connect()

      await vi.waitFor(() => {
        expect(openExternalSpy).toHaveBeenCalled()
      })

      const authUrl = openExternalSpy.mock.calls[0][0] as string
      const parsedUrl = new URL(authUrl)
      const redirectUri = parsedUrl.searchParams.get('redirect_uri')

      // Send request with an invalid/mismatched state
      const callbackRes = await fetch(`${redirectUri}?code=valid-code&state=invalid-tampered-state`)
      expect(callbackRes.status).toBe(403)

      const connectResult = await connectPromise
      expect(connectResult.success).toBe(false)
      expect(connectResult.error).toBe('CSRF state mismatch')
    } finally {
      syncManager.destroy()
    }
  })

  it('returns timeout error after 3 minutes', async () => {
    vi.useFakeTimers()
    const syncManager = new DriveSyncManager(dm, scheduler)
    try {
      vi.spyOn(configModule, 'isGoogleOAuthConfigured').mockReturnValue(true)
      vi.spyOn(shell, 'openExternal').mockResolvedValue()

      const connectPromise = syncManager.connect()

      // Advance timers by 3 minutes
      await vi.advanceTimersByTimeAsync(3 * 60 * 1000 + 100)

      const connectResult = await connectPromise
      expect(connectResult.success).toBe(false)
      expect(connectResult.error).toContain('Timeout')
    } finally {
      syncManager.destroy()
      vi.useRealTimers()
    }
  })
})

describe('DriveSync — Incremental Sync & Scaling Optimizations', () => {
  it('skips reading unchanged remote files during full sync when checksums match', async () => {
    const syncManager = new DriveSyncManager(dm, scheduler)
    scheduler.setSettings({ ...scheduler.getSettings(), driveSyncEnabled: true })

    // Setup 3 local log dates
    const date1 = '2026-01-01'
    const date2 = '2026-01-02'
    const date3 = '2026-01-03'

    await dm.appendLog(date1, { id: 'l1', timestamp: `${date1}T10:00:00Z`, text: 'Log 1' })
    await dm.appendLog(date2, { id: 'l2', timestamp: `${date2}T10:00:00Z`, text: 'Log 2' })
    await dm.appendLog(date3, { id: 'l3', timestamp: `${date3}T10:00:00Z`, text: 'Log 3' })

    const logs1 = await dm.getLogs(date1, true)
    const logs2 = await dm.getLogs(date2, true)
    const logs3 = await dm.getLogs(date3, true)

    const checksum1 = computeChecksum(JSON.stringify(logs1, null, 2))
    const checksum2 = computeChecksum(JSON.stringify(logs2, null, 2))
    const checksum3 = computeChecksum(JSON.stringify(logs3, null, 2))

    const time1 = Math.max(
      new Date(logs1[0].timestamp).getTime(),
      new Date(logs1[0].updatedAt!).getTime()
    )
    const time2 = Math.max(
      new Date(logs2[0].timestamp).getTime(),
      new Date(logs2[0].updatedAt!).getTime()
    )
    const time3 = Math.max(
      new Date(logs3[0].timestamp).getTime(),
      new Date(logs3[0].updatedAt!).getTime()
    )

    // Prepopulate local manifest so the sync manager knows these were already synchronized
    await dm.setSyncManifest({
      version: 1,
      lastSyncedAt: Date.now(),
      files: {
        [`${date1}.json`]: {
          fileId: 'f-1',
          checksum: checksum1,
          remoteModifiedTime: '2026-01-01T10:00:00.000Z',
          localTimestamp: time1
        },
        [`${date2}.json`]: {
          fileId: 'f-2',
          checksum: checksum2,
          remoteModifiedTime: '2026-01-02T10:00:00.000Z',
          localTimestamp: time2
        },
        [`${date3}.json`]: {
          fileId: 'f-3',
          checksum: checksum3,
          remoteModifiedTime: '2026-01-03T10:00:00.000Z',
          localTimestamp: time3
        }
      }
    })

    const getMock = vi.fn()
    const updateMock = vi.fn().mockResolvedValue({})
    const createMock = vi.fn().mockResolvedValue({ data: { id: 'manifest-id' } })

    const mockDrive = {
      files: {
        list: vi.fn().mockResolvedValue({
          data: {
            files: [
              { id: 'f-1', name: `${date1}.json`, md5Checksum: checksum1 },
              { id: 'f-2', name: `${date2}.json`, md5Checksum: checksum2 },
              { id: 'f-3', name: `${date3}.json`, md5Checksum: checksum3 }
            ],
            nextPageToken: null
          }
        }),
        get: getMock,
        update: updateMock,
        create: createMock
      }
    }

    ;(syncManager as any).drive = mockDrive
    const res = await syncManager.syncNow()
    expect(res.success).toBe(true)

    // Critical assertion: None of the unchanged date files were downloaded!
    expect(getMock).not.toHaveBeenCalled()
    // None of the unchanged date files were uploaded!
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('performs direct update without downloading remote file when remote is unchanged and local is dirty', async () => {
    const syncManager = new DriveSyncManager(dm, scheduler)
    scheduler.setSettings({ ...scheduler.getSettings(), driveSyncEnabled: true })

    const date = '2026-01-10'
    await dm.appendLog(date, { id: 'l1', timestamp: `${date}T10:00:00Z`, text: 'Initial work' })
    const initialLogs = await dm.getLogs(date, true)
    const initialChecksum = computeChecksum(JSON.stringify(initialLogs, null, 2))

    // Manifest recorded earlier
    await dm.setSyncManifest({
      version: 1,
      lastSyncedAt: Date.now() - 50000,
      files: {
        [`${date}.json`]: {
          fileId: 'remote-f-1',
          checksum: initialChecksum,
          remoteModifiedTime: '2026-01-10T10:00:00.000Z',
          localTimestamp: new Date(initialLogs[0].timestamp).getTime()
        }
      }
    })

    // Now user adds a newer log locally
    await dm.appendLog(date, {
      id: 'l2',
      timestamp: `${date}T12:00:00Z`,
      text: 'New local addition',
      updatedAt: `${date}T12:00:00Z`
    })

    const getMock = vi.fn()
    const updateMock = vi.fn().mockResolvedValue({})

    const mockDrive = {
      files: {
        list: vi.fn().mockResolvedValue({
          data: {
            files: [
              {
                id: 'remote-f-1',
                name: `${date}.json`,
                md5Checksum: initialChecksum,
                modifiedTime: '2026-01-10T10:00:00.000Z'
              }
            ],
            nextPageToken: null
          }
        }),
        get: getMock,
        update: updateMock,
        create: vi.fn().mockResolvedValue({})
      }
    }

    ;(syncManager as any).drive = mockDrive
    const res = await syncManager.syncNow()
    expect(res.success).toBe(true)

    // Remote was unchanged, so remote file was NOT downloaded
    expect(getMock).not.toHaveBeenCalled()
    // Local dirty data was directly pushed to Drive!
    expect(updateMock).toHaveBeenCalled()
    const uploadedData = JSON.parse(updateMock.mock.calls[0][0].media.body)
    expect(uploadedData).toHaveLength(2)
  })

  it('scheduleSyncAfterWrite with target only syncs dirty dates during incremental sync', async () => {
    vi.useFakeTimers()
    try {
      const syncManager = new DriveSyncManager(dm, scheduler)
      scheduler.setSettings({ ...scheduler.getSettings(), driveSyncEnabled: true })

      // Create goals on 2 separate dates
      const goal1 = await dm.addGoal('2026-01-20', 'Goal 20')
      await dm.addGoal('2026-01-21', 'Goal 21')

      // Clear any dirty state so we can test targeted write
      dm.consumeDirtySyncTargets()

      // User updates only goal 20
      await dm.updateGoal('2026-01-20', { ...goal1, status: 'done' })

      const getMock = vi.fn()
      const updateMock = vi.fn().mockResolvedValue({})

      const mockDrive = {
        files: {
          list: vi.fn().mockResolvedValue({
            data: {
              files: [
                { id: 'f-g-20', name: 'goals-2026-01-20.json' },
                { id: 'f-g-21', name: 'goals-2026-01-21.json' }
              ],
              nextPageToken: null
            }
          }),
          get: getMock.mockImplementation(() => {
            const { Readable } = require('stream')
            const s = new Readable()
            s.push('[]')
            s.push(null)
            return Promise.resolve({ data: s })
          }),
          update: updateMock,
          create: vi.fn().mockResolvedValue({})
        }
      }

      ;(syncManager as any).drive = mockDrive

      // Trigger targeted write sync
      syncManager.scheduleSyncAfterWrite({ goalDates: ['2026-01-20'] })

      // Advance debounce timer
      await vi.advanceTimersByTimeAsync(2000)

      // Only goal date 2026-01-20 should be synced!
      expect(updateMock).toHaveBeenCalledTimes(1)
      const uploaded = JSON.parse(updateMock.mock.calls[0][0].media.body)
      expect(uploaded[0].title).toBe('Goal 20')
      expect(updateMock.mock.calls[0][0].fileId).toBe('f-g-20')
    } finally {
      vi.useRealTimers()
    }
  })

  it('downloads remote changes during incremental background polling even when local has no dirty targets', async () => {
    const onDataUpdated = vi.fn()
    const syncManager = new DriveSyncManager(dm, scheduler, onDataUpdated)
    scheduler.setSettings({ ...scheduler.getSettings(), driveSyncEnabled: true })

    // Simulate that an initial sync occurred in the past
    dm.setSyncManifest({
      version: 1,
      lastSyncedAt: 1000,
      files: {}
    })
    // Local dirty targets are completely empty
    dm.consumeDirtySyncTargets()

    const remoteGoal = {
      id: 'remote-device-goal',
      title: 'Created on Laptop',
      status: 'planned',
      date: '2026-03-10',
      createdAt: '2026-03-10T10:00:00.000Z',
      updatedAt: '2026-03-10T10:00:00.000Z'
    }

    const mockDrive = {
      files: {
        list: vi.fn().mockResolvedValue({
          data: {
            files: [
              {
                id: 'f-remote-10',
                name: 'goals-2026-03-10.json',
                modifiedTime: '2026-03-10T10:05:00.000Z'
              }
            ],
            nextPageToken: null
          }
        }),
        get: vi.fn().mockImplementation(() => {
          const { Readable } = require('stream')
          const s = new Readable()
          s.push(JSON.stringify([remoteGoal]))
          s.push(null)
          return Promise.resolve({ data: s })
        }),
        update: vi.fn().mockResolvedValue({}),
        create: vi.fn().mockResolvedValue({})
      }
    }

    ;(syncManager as any).drive = mockDrive

    // Background polling runs incremental sync with 0 local dirty targets
    const res = await syncManager.syncNow({ incremental: true })
    expect(res.success).toBe(true)

    // Verify remote goal was downloaded and saved locally into DataManager
    const localGoals = await dm.getGoals('2026-03-10')
    expect(localGoals.some((g) => g.id === 'remote-device-goal')).toBe(true)
    expect(onDataUpdated).toHaveBeenCalled()
  })

  it('queues pending writes during active sync and runs follow-up sync', async () => {
    vi.useFakeTimers()
    try {
      const syncManager = new DriveSyncManager(dm, scheduler)
      scheduler.setSettings({ ...scheduler.getSettings(), driveSyncEnabled: true })

      await dm.addGoal('2026-02-01', 'Goal created while syncing')

      let resolveFirstList: (val: any) => void
      const firstListPromise = new Promise((resolve) => {
        resolveFirstList = resolve
      })

      const updateMock = vi.fn().mockResolvedValue({})
      let listCallCount = 0

      const mockDrive = {
        files: {
          list: vi.fn().mockImplementation(async () => {
            listCallCount++
            if (listCallCount === 1) {
              await firstListPromise
            }
            return {
              data: {
                files: [{ id: 'f-long', name: 'goals-2026-02-01.json' }],
                nextPageToken: null
              }
            }
          }),
          get: vi.fn().mockImplementation(() => {
            const { Readable } = require('stream')
            const s = new Readable()
            s.push('[]')
            s.push(null)
            return Promise.resolve({ data: s })
          }),
          update: updateMock,
          create: vi.fn().mockResolvedValue({})
        }
      }

      ;(syncManager as any).drive = mockDrive

      // Start first sync (it will pause inside list)
      const firstSyncPromise = syncManager.syncNow()
      expect((syncManager as any).isSyncing).toBe(true)

      // User performs a write while sync is busy
      syncManager.scheduleSyncAfterWrite({ goalDates: ['2026-02-01'] })
      await vi.advanceTimersByTimeAsync(2000)

      // Because isSyncing was true, hasPendingSync was set
      expect((syncManager as any).hasPendingSync).toBe(true)

      // Now allow first sync to complete
      resolveFirstList!({
        data: {
          files: [{ id: 'f-long', name: 'goals-2026-02-01.json' }],
          nextPageToken: null
        }
      })
      await firstSyncPromise

      // When first sync finishes, its finally block calls scheduleSyncAfterWrite()
      // Advance debounce timer for the follow-up sync
      await vi.advanceTimersByTimeAsync(2000)

      expect(updateMock).toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('DataManager correctly tracks and consumes dirty sync targets', async () => {
    dm.consumeDirtySyncTargets() // Reset

    await dm.appendLog('2026-03-10', {
      id: 'l-test',
      timestamp: '2026-03-10T09:00:00Z',
      text: 'Work'
    })
    await dm.addGoal('2026-03-11', 'Daily task')
    await dm.addInboxGoal('Inbox task')
    await dm.addRecurringGoal('Recurring task', 30, '2026-03-01')

    const dirty = dm.consumeDirtySyncTargets()
    expect(dirty.logDates).toContain('2026-03-10')
    expect(dirty.goalDates).toContain('2026-03-11')
    expect(dirty.syncInbox).toBe(true)
    expect(dirty.syncRecurring).toBe(true)

    // After consumption, dirty targets are cleared
    const clean = dm.getDirtySyncTargets()
    expect(clean.logDates).toHaveLength(0)
    expect(clean.goalDates).toHaveLength(0)
    expect(clean.syncInbox).toBe(false)
    expect(clean.syncRecurring).toBe(false)
  })

  it('deduplicates duplicate remote files keeping newest and cleaning up older duplicate', async () => {
    const syncManager = new DriveSyncManager(dm, scheduler)
    scheduler.setSettings({ ...scheduler.getSettings(), driveSyncEnabled: true })
    const deleteMock = vi.fn().mockResolvedValue({})
    const updateMock = vi.fn().mockResolvedValue({})

    const mockDrive = {
      files: {
        list: vi.fn().mockResolvedValue({
          data: {
            files: [
              {
                id: 'old-dup-id',
                name: 'sync-manifest.json',
                modifiedTime: '2026-01-01T00:00:00.000Z'
              },
              {
                id: 'new-dup-id',
                name: 'sync-manifest.json',
                modifiedTime: '2026-01-02T00:00:00.000Z'
              }
            ],
            nextPageToken: null
          }
        }),
        get: vi.fn().mockImplementation(() => {
          const { Readable } = require('stream')
          const s = new Readable()
          s.push('{"version":1,"lastSyncedAt":0,"files":{}}')
          s.push(null)
          return Promise.resolve({ data: s })
        }),
        update: updateMock,
        create: vi.fn().mockResolvedValue({}),
        delete: deleteMock
      }
    }

    ;(syncManager as any).drive = mockDrive
    const result = await syncManager.syncNow()
    expect(result.success).toBe(true)

    // Verify older duplicate was deleted
    expect(deleteMock).toHaveBeenCalledWith({ fileId: 'old-dup-id' })
    // Verify newest duplicate was updated
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ fileId: 'new-dup-id' }))
  })

  it('uploads database backup snapshot to Google Drive appDataFolder', async () => {
    const syncManager = new DriveSyncManager(dm, scheduler)
    scheduler.setSettings({ ...scheduler.getSettings(), driveSyncEnabled: true })

    const createMock = vi.fn().mockResolvedValue({ data: { id: 'created-db-id' } })
    const mockDrive = {
      files: {
        list: vi.fn().mockResolvedValue({
          data: { files: [], nextPageToken: null }
        }),
        create: createMock,
        update: vi.fn().mockResolvedValue({})
      }
    }

    ;(syncManager as any).drive = mockDrive
    const result = await syncManager.uploadDatabaseBackup()

    expect(result.success).toBe(true)
    expect(result.fileName).toContain('focus-backup-')
    expect(result.fileName?.endsWith('.db')).toBe(true)
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          name: result.fileName,
          parents: ['appDataFolder']
        }),
        media: expect.objectContaining({
          mimeType: 'application/x-sqlite3'
        })
      })
    )
  })
})
