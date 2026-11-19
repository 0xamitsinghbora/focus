import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ipcMain } from 'electron'
import { SettingsIpcController } from '../SettingsIpcController'
import { IpcChannels, AppSettings } from '../../../shared/types'

describe('SettingsIpcController', () => {
  let handlers: Record<string, (...args: any[]) => any> = {}
  let controller: SettingsIpcController
  let mockSettingsService: any
  let mockSecurity: any
  let isQuittingFlag = false

  const defaultSettings: AppSettings = {
    reminderIntervalMinutes: 25,
    openAtLogin: true,
    theme: 'dark',
    dayCutoffHour: 0,
    driveRefreshToken: 'secret-token-12345'
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

    let currentSettings = { ...defaultSettings }

    mockSettingsService = {
      getSettings: vi.fn(() => ({ ...currentSettings })),
      setSettings: vi.fn((next: AppSettings) => {
        currentSettings = { ...next }
      }),
      patchSettings: vi.fn((partial: Partial<AppSettings>) => {
        currentSettings = { ...currentSettings, ...partial }
        return { ...currentSettings }
      })
    }

    mockSecurity = {
      assertSenderIsMainWindow: vi.fn(),
      assertSenderIsAppWindow: vi.fn()
    }

    controller = new SettingsIpcController({
      settingsService: mockSettingsService,
      security: mockSecurity,
      isQuitting: () => isQuittingFlag
    })
    controller.register()
  })

  afterEach(() => {
    controller.destroy()
    vi.restoreAllMocks()
  })

  it('registers handlers for GetSettings, SetSettings, and PatchSettings', () => {
    expect(handlers[IpcChannels.GetSettings]).toBeDefined()
    expect(handlers[IpcChannels.SetSettings]).toBeDefined()
    expect(handlers[IpcChannels.PatchSettings]).toBeDefined()
  })

  it('returns sanitized settings on GetSettings and invokes assertSenderIsAppWindow', async () => {
    const res = await handlers[IpcChannels.GetSettings]({ sender: {} })
    expect(mockSecurity.assertSenderIsAppWindow).toHaveBeenCalled()
    expect(res.reminderIntervalMinutes).toBe(25)
    expect(res.driveRefreshToken).toBeUndefined()
  })

  it('validates sender and updates settings on SetSettings', async () => {
    await handlers[IpcChannels.SetSettings](
      { sender: {} },
      {
        reminderIntervalMinutes: 30,
        theme: 'light'
      }
    )
    expect(mockSecurity.assertSenderIsMainWindow).toHaveBeenCalled()
    expect(mockSettingsService.setSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        reminderIntervalMinutes: 30,
        theme: 'light',
        driveRefreshToken: 'secret-token-12345'
      })
    )
  })

  it('patches partial settings and redacts driveRefreshToken in response', async () => {
    const res = await handlers[IpcChannels.PatchSettings](
      { sender: {} },
      {
        theme: 'light'
      }
    )
    expect(mockSecurity.assertSenderIsMainWindow).toHaveBeenCalled()
    expect(mockSettingsService.patchSettings).toHaveBeenCalledWith({ theme: 'light' })
    expect(res.driveRefreshToken).toBeUndefined()
    expect(res.theme).toBe('light')
  })

  it('rejects invalid payloads on SetSettings and PatchSettings', () => {
    expect(() => handlers[IpcChannels.SetSettings]({ sender: {} }, null as any)).toThrow(
      'Invalid SetSettings payload'
    )
    expect(() => handlers[IpcChannels.PatchSettings]({ sender: {} }, null as any)).toThrow(
      'Invalid PatchSettings payload'
    )
  })

  it('safely serves GetSettings without throwing when isQuitting is true', async () => {
    isQuittingFlag = true
    mockSecurity.assertSenderIsAppWindow.mockImplementation(() => {
      throw new Error('Unauthorized IPC sender')
    })

    const res = await handlers[IpcChannels.GetSettings]({ sender: {} })
    expect(res).toBeDefined()
    expect(res.reminderIntervalMinutes).toBe(25)
    expect(res.driveRefreshToken).toBeUndefined()
  })

  it('safely serves PatchSettings without throwing when isQuitting is true', async () => {
    isQuittingFlag = true
    mockSecurity.assertSenderIsMainWindow.mockImplementation(() => {
      throw new Error('Unauthorized IPC sender')
    })

    const res = await handlers[IpcChannels.PatchSettings]({ sender: {} }, { theme: 'light' })
    expect(res).toBeDefined()
    expect(res.theme).toBe('light')
  })

  it('does not remove handlers in destroy() if isQuitting is true', () => {
    isQuittingFlag = true
    controller.destroy()
    expect(handlers[IpcChannels.GetSettings]).toBeDefined()
    expect(handlers[IpcChannels.SetSettings]).toBeDefined()
    expect(handlers[IpcChannels.PatchSettings]).toBeDefined()
  })

  it('removes handlers in destroy() if isQuitting is false', () => {
    isQuittingFlag = false
    controller.destroy()
    expect(handlers[IpcChannels.GetSettings]).toBeUndefined()
    expect(handlers[IpcChannels.SetSettings]).toBeUndefined()
    expect(handlers[IpcChannels.PatchSettings]).toBeUndefined()
  })
})
