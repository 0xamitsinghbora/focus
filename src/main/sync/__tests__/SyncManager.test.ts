import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SyncManager } from '../SyncManager'

describe('SyncManager', () => {
  let syncManager: SyncManager
  let mockDataManager: any
  let mockScheduler: any
  let mockMainWindow: any

  beforeEach(() => {
    mockDataManager = {
      consumeDirtySyncTargets: vi.fn().mockReturnValue({
        logDates: new Set(),
        goalDates: new Set(),
        syncInbox: false,
        syncRecurring: false,
        syncSettings: false,
        syncPurged: false
      }),
      markDirty: vi.fn(),
      getSettings: vi.fn().mockReturnValue({})
    }

    mockScheduler = {
      getSettings: vi.fn().mockReturnValue({
        syncProvider: 'google-drive',
        driveRefreshToken: 'test-token',
        driveSyncEnabled: true
      }),
      patchSettings: vi.fn(),
      setSettings: vi.fn()
    }

    mockMainWindow = {
      isDestroyed: vi.fn().mockReturnValue(false),
      webContents: {
        send: vi.fn()
      }
    }

    syncManager = new SyncManager(mockDataManager, mockScheduler, vi.fn(), () => mockMainWindow)
  })

  afterEach(() => {
    syncManager.destroy()
    vi.restoreAllMocks()
  })

  it('initializes DriveSyncManager', () => {
    expect(syncManager.driveSync).toBeDefined()
  })

  it('updates main window on manager when setMainWindow is called', () => {
    const newWindow: any = { isDestroyed: () => false }
    const driveSpy = vi.spyOn(syncManager.driveSync, 'setMainWindow')

    syncManager.setMainWindow(() => newWindow)

    expect(driveSpy).toHaveBeenCalled()
  })

  it('routes scheduleSyncAfterWrite to Google Drive when active', () => {
    mockScheduler.getSettings.mockReturnValue({
      syncProvider: 'google-drive',
      driveRefreshToken: 'token',
      driveSyncEnabled: true
    })

    const driveSpy = vi
      .spyOn(syncManager.driveSync, 'scheduleSyncAfterWrite')
      .mockImplementation(() => {})

    syncManager.scheduleSyncAfterWrite({ syncInbox: true })

    expect(driveSpy).toHaveBeenCalledWith({ syncInbox: true })
  })

  it('routes syncNow to the requested provider', async () => {
    const driveSpy = vi
      .spyOn(syncManager.driveSync, 'syncNow')
      .mockResolvedValue({ success: true } as any)

    const result = await syncManager.syncNow('google-drive')

    expect(driveSpy).toHaveBeenCalled()
    expect(result).toEqual({ success: true })
  })

  it('destroys manager cleanly', () => {
    const driveSpy = vi.spyOn(syncManager.driveSync, 'destroy').mockImplementation(() => {})

    syncManager.destroy()

    expect(driveSpy).toHaveBeenCalled()
  })

  it('exposes driveEngine and activeEngine', () => {
    expect(syncManager.driveEngine).toBe(syncManager.driveSync.syncEngine)

    // With google-drive as provider
    mockScheduler.getSettings.mockReturnValue({
      syncProvider: 'google-drive',
      driveRefreshToken: 'token',
      driveSyncEnabled: true
    })
    expect(syncManager.activeEngine).toBe(syncManager.driveSync.syncEngine)

    // With none
    mockScheduler.getSettings.mockReturnValue({
      syncProvider: 'none'
    })
    expect(syncManager.activeEngine).toBeNull()
  })

  it('delegates waitForInFlightSync to driveSync', async () => {
    const waitSpy = vi.spyOn(syncManager.driveSync, 'waitForInFlightSync').mockResolvedValue()
    await syncManager.waitForInFlightSync(2000)
    expect(waitSpy).toHaveBeenCalledWith(2000)
  })
})
