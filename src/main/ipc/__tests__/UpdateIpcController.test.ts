import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ipcMain } from 'electron'
import { UpdateIpcController } from '../UpdateIpcController'
import { IpcChannels, UpdateState } from '../../../shared/types'

describe('UpdateIpcController', () => {
  let handlers: Record<string, (...args: any[]) => any> = {}
  let controller: UpdateIpcController
  let mockUpdateService: any
  let mockSecurity: any
  let isQuittingFlag = false

  const defaultState: UpdateState = {
    status: 'idle',
    currentVersion: '1.0.0',
    availableUpdate: null,
    progress: null,
    error: null,
    lastCheckedAt: null,
    downloadedFilePath: null
  }

  beforeEach(() => {
    handlers = {}
    isQuittingFlag = false

    vi.spyOn(ipcMain, 'handle').mockImplementation((channel: string, handler: any) => {
      handlers[channel] = handler
      return undefined as any
    })
    vi.spyOn(ipcMain, 'removeHandler').mockImplementation((channel: string) => {
      delete handlers[channel]
      return undefined as any
    })

    mockUpdateService = {
      getState: vi.fn(() => ({ ...defaultState })),
      checkForUpdates: vi.fn(async () => ({ ...defaultState, status: 'available' })),
      downloadUpdate: vi.fn(async () => true),
      cancelDownload: vi.fn(async () => true),
      installUpdate: vi.fn(async () => true),
      cleanCache: vi.fn(() => ({ success: true, freedBytes: 1024, cleanedFiles: ['setup.exe'] }))
    }

    mockSecurity = {
      assertSenderIsMainWindow: vi.fn(),
      assertSenderIsAppWindow: vi.fn()
    }

    controller = new UpdateIpcController({
      updateService: mockUpdateService,
      security: mockSecurity,
      isQuitting: () => isQuittingFlag
    })
    controller.register()
  })

  afterEach(() => {
    controller.destroy()
    vi.restoreAllMocks()
  })

  it('registers all update IPC handlers', () => {
    expect(handlers[IpcChannels.UpdateGetState]).toBeDefined()
    expect(handlers[IpcChannels.UpdateCheck]).toBeDefined()
    expect(handlers[IpcChannels.UpdateDownload]).toBeDefined()
    expect(handlers[IpcChannels.UpdateCancelDownload]).toBeDefined()
    expect(handlers[IpcChannels.UpdateInstall]).toBeDefined()
    expect(handlers[IpcChannels.UpdateCleanCache]).toBeDefined()
  })

  it('handles UpdateGetState and verifies security authority', async () => {
    const mockEvent = { sender: {} }
    const result = await handlers[IpcChannels.UpdateGetState](mockEvent)
    expect(mockSecurity.assertSenderIsAppWindow).toHaveBeenCalledWith(mockEvent)
    expect(result).toEqual(defaultState)
  })

  it('handles UpdateCheck and delegates to updateService', async () => {
    const mockEvent = { sender: {} }
    const result = await handlers[IpcChannels.UpdateCheck](mockEvent)
    expect(mockSecurity.assertSenderIsMainWindow).toHaveBeenCalledWith(mockEvent)
    expect(mockUpdateService.checkForUpdates).toHaveBeenCalled()
    expect(result.status).toBe('available')
  })

  it('handles UpdateDownload and delegates to updateService', async () => {
    const mockEvent = { sender: {} }
    const result = await handlers[IpcChannels.UpdateDownload](mockEvent)
    expect(mockSecurity.assertSenderIsMainWindow).toHaveBeenCalledWith(mockEvent)
    expect(mockUpdateService.downloadUpdate).toHaveBeenCalled()
    expect(result).toBe(true)
  })

  it('handles UpdateCancelDownload and delegates to updateService', async () => {
    const mockEvent = { sender: {} }
    const result = await handlers[IpcChannels.UpdateCancelDownload](mockEvent)
    expect(mockSecurity.assertSenderIsMainWindow).toHaveBeenCalledWith(mockEvent)
    expect(mockUpdateService.cancelDownload).toHaveBeenCalled()
    expect(result).toBe(true)
  })

  it('handles UpdateInstall and passes options', async () => {
    const mockEvent = { sender: {} }
    const options = { silent: true }
    const result = await handlers[IpcChannels.UpdateInstall](mockEvent, options)
    expect(mockSecurity.assertSenderIsMainWindow).toHaveBeenCalledWith(mockEvent)
    expect(mockUpdateService.installUpdate).toHaveBeenCalledWith(options)
    expect(result).toBe(true)
  })

  it('handles UpdateCleanCache and returns clean results', async () => {
    const mockEvent = { sender: {} }
    const result = await handlers[IpcChannels.UpdateCleanCache](mockEvent)
    expect(mockSecurity.assertSenderIsMainWindow).toHaveBeenCalledWith(mockEvent)
    expect(mockUpdateService.cleanCache).toHaveBeenCalled()
    expect(result.freedBytes).toBe(1024)
  })

  it('removes all handlers on destroy()', () => {
    controller.destroy()
    expect(Object.keys(handlers).length).toBe(0)
  })
})
