import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { BrowserWindow, ipcMain } from 'electron'
import os from 'os'
import path from 'path'
import fs from 'fs'
import { DataManager } from '../../dataManager'
import { SettingsService } from '../SettingsService'
import { IpcChannels } from '../../../shared/types'

let testDir: string
let dm: DataManager
let settingsService: SettingsService

beforeEach(() => {
  testDir = path.join(
    os.tmpdir(),
    `focus-settings-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  )
  fs.mkdirSync(testDir, { recursive: true })
  vi.stubEnv('FOCUS_TEST_USER_DATA', testDir)

  dm = new DataManager()
  settingsService = new SettingsService(dm.settingsRepo)
})

afterEach(() => {
  if (settingsService) settingsService.destroy()
  if (dm) dm.getDb().close()
  try {
    fs.rmSync(testDir, { recursive: true, force: true })
  } catch {}
  vi.restoreAllMocks()
})

describe('SettingsService', () => {
  it('reads default settings correctly', () => {
    const s = settingsService.getSettings()
    expect(s.reminderIntervalMinutes).toBe(45)
    expect(s.openAtLogin).toBe(true)
  })

  it('updates settings and invokes onSettingsChanged and onSettingsUpdated', () => {
    const onSettingsChanged = vi.fn()
    const onSettingsUpdated = vi.fn()
    settingsService.setOnSettingsChanged(onSettingsChanged)
    settingsService.setOnSettingsUpdated(onSettingsUpdated)

    settingsService.setSettings({
      ...settingsService.getSettings(),
      reminderIntervalMinutes: 25,
      theme: 'dark'
    })

    expect(onSettingsChanged).toHaveBeenCalledTimes(1)
    expect(onSettingsUpdated).toHaveBeenCalledTimes(1)
    expect(settingsService.getSettings().reminderIntervalMinutes).toBe(25)
    expect(settingsService.getSettings().theme).toBe('dark')
  })

  it('does not invoke onSettingsChanged when updateTimestamp is false', () => {
    const onSettingsChanged = vi.fn()
    const onSettingsUpdated = vi.fn()
    settingsService.setOnSettingsChanged(onSettingsChanged)
    settingsService.setOnSettingsUpdated(onSettingsUpdated)

    settingsService.setSettings(
      {
        ...settingsService.getSettings(),
        reminderIntervalMinutes: 30
      },
      false
    )

    expect(onSettingsChanged).not.toHaveBeenCalled()
    expect(onSettingsUpdated).toHaveBeenCalledTimes(1)
  })

  it('broadcasts theme update to open browser windows', () => {
    const mockSend = vi.fn()
    const mockWin = { isDestroyed: () => false, webContents: { send: mockSend } }
    vi.spyOn(BrowserWindow, 'getAllWindows').mockReturnValue([mockWin as any])

    settingsService.setSettings({
      ...settingsService.getSettings(),
      theme: 'dark'
    })

    expect(mockSend).toHaveBeenCalledWith(IpcChannels.ThemeUpdated, 'dark')
  })

  it('patches partial settings while merging nested objects', () => {
    settingsService.setSettings({
      ...settingsService.getSettings(),
      collapsedColumns: { planned: true, in_progress: false, done: false },
      groupColors: { Work: '#ff0000' }
    })

    const patched = settingsService.patchSettings({
      collapsedColumns: { in_progress: true, done: false },
      groupColors: { Life: '#00ff00' }
    })

    expect(patched.collapsedColumns).toEqual({ planned: true, in_progress: true, done: false })
    expect(patched.groupColors).toEqual({ work: '#ff0000', life: '#00ff00' })
  })

  it('registers and unregisters IPC handlers', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    vi.spyOn(ipcMain, 'handle').mockImplementation(((channel: string, handler: any) => {
      handlers.set(channel, handler)
    }) as any)

    const cleanup = settingsService.registerIpc()

    expect(handlers.has(IpcChannels.GetSettings)).toBe(true)
    expect(handlers.has(IpcChannels.SetSettings)).toBe(true)
    expect(handlers.has(IpcChannels.PatchSettings)).toBe(true)

    // Call GetSettings through registered handler
    const getHandler = handlers.get(IpcChannels.GetSettings)!
    const res = (await getHandler({ senderFrame: {} })) as Record<string, unknown>
    expect(res.reminderIntervalMinutes).toBe(45)

    cleanup()
  })

  it('can be constructed and used directly with SettingsRepository', () => {
    const directService = new SettingsService(dm.settingsRepo)
    expect(directService.getSettings().reminderIntervalMinutes).toBe(45)

    directService.setSettings({
      ...directService.getSettings(),
      reminderIntervalMinutes: 50
    })
    expect(directService.getSettings().reminderIntervalMinutes).toBe(50)
  })
})
