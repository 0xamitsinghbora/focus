import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SyncEngine } from '../SyncEngine'
import { SyncStorageProvider, RemoteFileInfo } from '../SyncStorageProvider'

describe('SyncEngine', () => {
  let engine: SyncEngine
  let mockDataManager: any
  let mockScheduler: any
  let mockProvider: SyncStorageProvider
  let mockFiles: Map<string, string>

  beforeEach(() => {
    mockFiles = new Map()

    mockDataManager = {
      consumeDirtySyncTargets: vi.fn().mockReturnValue({
        logDates: new Set(),
        goalDates: new Set(),
        syncInbox: false,
        syncRecurring: false,
        syncSettings: false,
        syncPurged: false
      }),
      getSyncManifest: vi.fn().mockResolvedValue({
        version: 1,
        lastSyncedAt: 0,
        files: {}
      }),
      setSyncManifest: vi.fn(),
      getAllLogDates: vi.fn().mockResolvedValue([]),
      getLogs: vi.fn().mockResolvedValue([]),
      setLogs: vi.fn(),
      getAllGoalDates: vi.fn().mockResolvedValue([]),
      getGoals: vi.fn().mockResolvedValue([]),
      setGoals: vi.fn(),
      getInboxGoals: vi.fn().mockResolvedValue([]),
      setInboxGoals: vi.fn(),
      getRecurringGoals: vi.fn().mockResolvedValue([]),
      setRecurringGoals: vi.fn(),
      getPurgedRecords: vi.fn().mockResolvedValue([]),
      setPurgedRecords: vi.fn(),
      getPurgedIds: vi.fn().mockResolvedValue(new Set())
    }

    mockScheduler = {
      getSettings: vi.fn().mockReturnValue({
        theme: 'light',
        lastUpdated: 1000
      }),
      setSettings: vi.fn()
    }

    mockProvider = {
      providerId: 'google-drive',
      name: 'Google Drive',
      isConfigured: vi.fn().mockReturnValue(true),
      isConnected: vi.fn().mockReturnValue(true),
      connect: vi.fn().mockResolvedValue({ success: true }),
      disconnect: vi.fn().mockResolvedValue(true),
      listRemoteFiles: vi.fn().mockImplementation(async () => {
        const list: RemoteFileInfo[] = []
        for (const [name, content] of mockFiles.entries()) {
          list.push({
            name,
            id: `id-${name}`,
            modifiedTime: '2026-04-10T12:00:00Z',
            size: content.length
          })
        }
        return list
      }),
      readRemoteFile: vi.fn().mockImplementation(async (filename: string) => {
        return mockFiles.get(filename) ?? null
      }),
      writeRemoteFile: vi.fn().mockImplementation(async (filename: string, content: string) => {
        mockFiles.set(filename, content)
        return { fileId: `id-${filename}` }
      }),
      deleteRemoteFile: vi.fn().mockImplementation(async (filename: string) => {
        mockFiles.delete(filename)
      })
    }

    engine = new SyncEngine({
      dataManager: mockDataManager,
      scheduler: mockScheduler,
      provider: mockProvider
    })
  })

  afterEach(() => {
    engine.destroy()
    vi.restoreAllMocks()
  })

  it('performs full sync and writes manifest to remote', async () => {
    const result = await engine.syncNow()
    expect(result.success).toBe(true)
    expect(mockProvider.listRemoteFiles).toHaveBeenCalled()
    expect(mockDataManager.setSyncManifest).toHaveBeenCalled()
    expect(mockFiles.has('sync-manifest.json')).toBe(true)
  })

  it('reconciles remote daily goals into local database', async () => {
    const remoteGoal = {
      id: 'g-remote-1',
      date: '2026-04-10',
      title: 'Remote Task',
      status: 'planned',
      createdAt: '2026-04-10T10:00:00Z',
      updatedAt: '2026-04-10T10:00:00Z'
    }
    mockFiles.set('goals-2026-04-10.json', JSON.stringify([remoteGoal]))

    const result = await engine.syncNow()
    expect(result.success).toBe(true)
    expect(mockDataManager.setGoals).toHaveBeenCalledWith(
      '2026-04-10',
      expect.arrayContaining([expect.objectContaining({ id: 'g-remote-1', title: 'Remote Task' })]),
      true
    )
  })

  it('reconciles newer remote settings into local scheduler', async () => {
    const remoteSettings = {
      theme: 'dark',
      lastUpdated: 5000
    }
    mockFiles.set('settings.json', JSON.stringify(remoteSettings))

    const result = await engine.syncNow()
    expect(result.success).toBe(true)
    expect(mockScheduler.setSettings).toHaveBeenCalledWith(
      expect.objectContaining({ theme: 'dark', lastUpdated: 5000 }),
      false
    )
  })

  it('returns false and sets pendingSync if sync is invoked while active', async () => {
    let resolveFirst: (() => void) | null = null
    const slowListPromise = new Promise<RemoteFileInfo[]>((resolve) => {
      resolveFirst = () => resolve([])
    })
    vi.spyOn(mockProvider, 'listRemoteFiles').mockReturnValue(slowListPromise)

    const firstRun = engine.syncNow()
    expect(engine.isSyncing).toBe(true)

    const secondRun = await engine.syncNow()
    expect(secondRun.success).toBe(false)
    expect(engine.hasPendingSync).toBe(true)

    resolveFirst!()
    await firstRun
    expect(engine.isSyncing).toBe(false)
  })

  it('aborts cleanly on destroy()', () => {
    engine.startBackgroundPolling(1000)
    engine.destroy()
    expect(engine.isSyncing).toBe(false)
  })

  it('honors pending remote wipe from offline deleteAllData and clears remote backup files', async () => {
    mockFiles.set('goals-2026-04-10.json', JSON.stringify([{ id: '1' }]))
    mockFiles.set('settings.json', JSON.stringify({ theme: 'dark' }))

    mockDataManager.hasPendingRemoteWipe = vi.fn().mockReturnValue(true)
    mockDataManager.getPendingRemoteWipeTimestamp = vi.fn().mockReturnValue(12345678)
    mockDataManager.clearPendingRemoteWipe = vi.fn()

    const result = await engine.syncNow()
    expect(result.success).toBe(true)
    expect(mockProvider.deleteRemoteFile).toHaveBeenCalledWith(
      'goals-2026-04-10.json',
      'id-goals-2026-04-10.json',
      expect.any(Number)
    )
    expect(mockProvider.deleteRemoteFile).toHaveBeenCalledWith(
      'settings.json',
      'id-settings.json',
      expect.any(Number)
    )
    expect(mockDataManager.clearPendingRemoteWipe).toHaveBeenCalled()
    expect(mockFiles.has('goals-2026-04-10.json')).toBe(false)
    expect(mockFiles.has('settings.json')).toBe(false)
    expect(mockFiles.has('sync-manifest.json')).toBe(true)
    const manifest = JSON.parse(mockFiles.get('sync-manifest.json')!)
    expect(manifest.wipedAt).toBe(12345678)
  })

  it('honors remote cloud wipe from another device and invokes deleteAllData locally', async () => {
    mockDataManager.hasPendingRemoteWipe = vi.fn().mockReturnValue(false)
    mockDataManager.deleteAllData = vi.fn().mockResolvedValue(undefined)
    mockDataManager.clearPendingRemoteWipe = vi.fn()
    mockDataManager.getSyncManifest = vi.fn().mockResolvedValue({
      version: 1,
      lastSyncedAt: 1000,
      files: {}
    })

    const remoteManifest = {
      version: 1,
      lastSyncedAt: 2000,
      wipedAt: 1500,
      files: {}
    }
    mockFiles.set('sync-manifest.json', JSON.stringify(remoteManifest))

    const result = await engine.syncNow()
    expect(result.success).toBe(true)
    expect(mockDataManager.deleteAllData).toHaveBeenCalled()
  })

  it('waitForInFlightSync awaits active sync resolution within timeout', async () => {
    let resolveSync: (() => void) | null = null
    const slowListPromise = new Promise<RemoteFileInfo[]>((resolve) => {
      resolveSync = () => resolve([])
    })
    vi.spyOn(mockProvider, 'listRemoteFiles').mockReturnValue(slowListPromise)

    const syncPromise = engine.syncNow()
    expect(engine.isSyncing).toBe(true)

    let waitFinished = false
    const waitPromise = engine.waitForInFlightSync(1000).then(() => {
      waitFinished = true
    })

    expect(waitFinished).toBe(false)
    resolveSync!()
    await syncPromise
    await waitPromise
    expect(waitFinished).toBe(true)
  })
})
