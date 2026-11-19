import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ipcMain } from 'electron'
import { SyncIpcController } from '../SyncIpcController'
import { IpcChannels } from '../../../shared/types'

describe('SyncIpcController', () => {
  let handlers: Record<string, (...args: any[]) => any> = {}
  let controller: SyncIpcController
  let mockDriveSync: any
  let mockSecurity: any

  beforeEach(() => {
    handlers = {}

    vi.spyOn(ipcMain, 'handle').mockImplementation((channel: string, handler: any) => {
      handlers[channel] = handler
      return undefined as any
    })
    vi.spyOn(ipcMain, 'removeHandler').mockImplementation((channel: string) => {
      delete handlers[channel]
      return undefined as any
    })

    mockDriveSync = {
      connect: vi.fn().mockResolvedValue({ success: true }),
      disconnect: vi.fn().mockResolvedValue(true),
      syncNow: vi.fn().mockResolvedValue(true),
      getStatus: vi.fn().mockReturnValue({
        isConfigured: true,
        isConnected: true,
        isSyncing: false
      })
    }

    mockSecurity = {
      assertSenderIsMainWindow: vi.fn()
    }

    controller = new SyncIpcController({
      driveSync: mockDriveSync,
      security: mockSecurity
    })
  })

  afterEach(() => {
    controller.unregister()
    vi.restoreAllMocks()
  })

  it('registers all Drive IPC handlers', () => {
    controller.register()

    expect(handlers[IpcChannels.DriveConnect]).toBeDefined()
    expect(handlers[IpcChannels.DriveDisconnect]).toBeDefined()
    expect(handlers[IpcChannels.DriveSyncNow]).toBeDefined()
    expect(handlers[IpcChannels.DriveStatus]).toBeDefined()
  })

  it('delegates Drive actions to DriveSyncManager', async () => {
    controller.register()
    const mockEvent = { sender: {} }

    const connectResult = await handlers[IpcChannels.DriveConnect](mockEvent)
    expect(mockSecurity.assertSenderIsMainWindow).toHaveBeenCalledWith(mockEvent)
    expect(mockDriveSync.connect).toHaveBeenCalled()
    expect(connectResult).toEqual({ success: true })

    const disconnectResult = await handlers[IpcChannels.DriveDisconnect](mockEvent)
    expect(mockDriveSync.disconnect).toHaveBeenCalled()
    expect(disconnectResult).toBe(true)

    const syncResult = await handlers[IpcChannels.DriveSyncNow](mockEvent)
    expect(mockDriveSync.syncNow).toHaveBeenCalled()
    expect(syncResult).toBe(true)

    const statusResult = handlers[IpcChannels.DriveStatus](mockEvent)
    expect(mockDriveSync.getStatus).toHaveBeenCalled()
    expect(statusResult).toEqual({
      isConfigured: true,
      isConnected: true,
      isSyncing: false
    })
  })

  it('unregisters handlers cleanly', () => {
    controller.register()
    expect(handlers[IpcChannels.DriveConnect]).toBeDefined()

    controller.unregister()
    expect(handlers[IpcChannels.DriveConnect]).toBeUndefined()
  })
})
