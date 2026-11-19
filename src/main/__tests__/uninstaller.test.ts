import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { performUninstall, purgeUserData } from '../uninstaller'
import { logger } from '../logger'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { app, shell } from 'electron'

describe('Uninstaller Module', () => {
  let tempDir: string

  beforeEach(() => {
    vi.clearAllMocks()
    tempDir = path.join(
      os.tmpdir(),
      `focus-uninstall-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    )
    fs.mkdirSync(tempDir, { recursive: true })
  })

  afterEach(() => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true })
      }
    } catch {
      // ignore
    }
  })

  describe('purgeUserData', () => {
    it('handles non-existent or empty path gracefully without throwing', () => {
      expect(() => purgeUserData('')).not.toThrow()
      expect(() => purgeUserData(path.join(tempDir, 'non-existent'))).not.toThrow()
    })

    it('refuses to purge root filesystem or user home directory', () => {
      const loggerSpy = vi.spyOn(logger, 'error').mockImplementation(() => {})
      const rmSpy = vi.spyOn(fs, 'rmSync')

      purgeUserData(os.homedir())
      purgeUserData(path.parse(os.homedir()).root)

      expect(loggerSpy).toHaveBeenCalledWith(
        'app:uninstall',
        expect.stringContaining('Refusing to purge dangerous system or home directory')
      )
      expect(rmSpy).not.toHaveBeenCalledWith(os.homedir(), expect.anything())
    })

    it('recursively deletes directories and files in userDataPath', () => {
      const userDir = path.join(tempDir, 'userData')
      const logsDir = path.join(userDir, 'logs')
      const dataDir = path.join(userDir, 'focus-logs')
      fs.mkdirSync(logsDir, { recursive: true })
      fs.mkdirSync(dataDir, { recursive: true })
      fs.writeFileSync(path.join(logsDir, 'focus.log'), 'test log')
      fs.writeFileSync(path.join(dataDir, 'focus.db'), 'test db')
      fs.writeFileSync(path.join(userDir, 'widget-pos.json'), '{}')

      purgeUserData(userDir)

      // userData or all its internal contents should be removed
      if (fs.existsSync(userDir)) {
        expect(fs.readdirSync(userDir).length).toBe(0)
      } else {
        expect(fs.existsSync(userDir)).toBe(false)
      }
    })

    it('handles locked files gracefully without aborting purge of sibling entries', () => {
      const userDir = path.join(tempDir, 'userDataLocked')
      fs.mkdirSync(userDir, { recursive: true })
      const lockedFile = path.join(userDir, 'focus.db-wal')
      const normalFile = path.join(userDir, 'settings.json')
      fs.writeFileSync(lockedFile, 'database wal content')
      fs.writeFileSync(normalFile, '{"theme":"dark"}')

      purgeUserData(userDir)

      // Settings file should be removed
      expect(fs.existsSync(normalFile)).toBe(false)
    })
  })

  describe('performUninstall', () => {
    it('safely rejects uninstallation in development mode to protect source tree', async () => {
      const mockQuit = vi.fn()
      const mockClose = vi.fn()

      const result = await performUninstall({
        isPackaged: false,
        quitApp: mockQuit,
        dataManager: { close: mockClose }
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('disabled in development mode')
      expect(mockQuit).not.toHaveBeenCalled()
      expect(mockClose).not.toHaveBeenCalled()
    })

    it('disables login startup item and closes dataManager on packaged uninstallation', async () => {
      const mockQuit = vi.fn()
      const mockClose = vi.fn()
      const setLoginItemSpy = vi.spyOn(app, 'setLoginItemSettings')
      const shutdownSpy = vi.spyOn(logger, 'shutdown')

      await performUninstall({
        isPackaged: true,
        platform: 'win32',
        execPath: path.join(tempDir, 'Focus.exe'),
        userDataPath: path.join(tempDir, 'userData'),
        quitApp: mockQuit,
        dataManager: { close: mockClose },
        skipTimeout: true
      })

      expect(setLoginItemSpy).toHaveBeenCalledWith({ openAtLogin: false })
      expect(shutdownSpy).toHaveBeenCalled()
      expect(mockClose).toHaveBeenCalled()
      expect(mockQuit).toHaveBeenCalled()
    })

    it('spawns "Uninstall Focus.exe" on Windows when uninstaller executable exists', async () => {
      const installDir = path.join(tempDir, 'installed')
      fs.mkdirSync(installDir, { recursive: true })
      const execPath = path.join(installDir, 'Focus.exe')
      const uninstallerPath = path.join(installDir, 'Uninstall Focus.exe')
      fs.writeFileSync(execPath, '')
      fs.writeFileSync(uninstallerPath, '')

      const mockUnref = vi.fn()
      const mockSpawn = vi.fn().mockReturnValue({
        unref: mockUnref
      } as any)

      const mockQuit = vi.fn()
      const result = await performUninstall({
        isPackaged: true,
        platform: 'win32',
        execPath,
        quitApp: mockQuit,
        spawnProcess: mockSpawn as any,
        skipTimeout: true
      })

      expect(result.success).toBe(true)
      expect(result.message).toContain('Launching Focus uninstaller')
      expect(mockSpawn).toHaveBeenCalledWith(uninstallerPath, [], {
        detached: true,
        stdio: 'ignore'
      })
      expect(mockUnref).toHaveBeenCalled()
      expect(mockQuit).toHaveBeenCalled()
    })

    it('returns error result when Windows uninstaller spawn fails', async () => {
      const installDir = path.join(tempDir, 'installed')
      fs.mkdirSync(installDir, { recursive: true })
      const execPath = path.join(installDir, 'Focus.exe')
      const uninstallerPath = path.join(installDir, 'Uninstall Focus.exe')
      fs.writeFileSync(execPath, '')
      fs.writeFileSync(uninstallerPath, '')

      const mockSpawn = vi.fn().mockImplementation(() => {
        throw new Error('Spawn failed: EACCES')
      })

      const mockQuit = vi.fn()
      const result = await performUninstall({
        isPackaged: true,
        platform: 'win32',
        execPath,
        quitApp: mockQuit,
        spawnProcess: mockSpawn as any,
        skipTimeout: true
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Failed to launch uninstaller: Spawn failed: EACCES')
      expect(mockQuit).not.toHaveBeenCalled()
    })

    it('handles Windows Portable builds: purges userData, schedules self-deletion, and quits', async () => {
      const portableDir = path.join(tempDir, 'portable')
      fs.mkdirSync(portableDir, { recursive: true })
      const portableExe = path.join(portableDir, 'Focus-Portable.exe')
      fs.writeFileSync(portableExe, '')

      const userDataDir = path.join(tempDir, 'userData')
      fs.mkdirSync(userDataDir, { recursive: true })
      fs.writeFileSync(path.join(userDataDir, 'widget-pos.json'), '{}')

      const mockUnref = vi.fn()
      const mockSpawn = vi.fn().mockReturnValue({
        unref: mockUnref
      } as any)

      const mockQuit = vi.fn()
      const result = await performUninstall({
        isPackaged: true,
        platform: 'win32',
        execPath: portableExe,
        portableExePath: portableExe,
        userDataPath: userDataDir,
        quitApp: mockQuit,
        spawnProcess: mockSpawn as any,
        skipTimeout: true
      })

      expect(result.success).toBe(true)
      expect(result.message).toContain('portable installation cleaned up')
      expect(mockSpawn).toHaveBeenCalledWith(
        'cmd.exe',
        expect.arrayContaining(['/c']),
        expect.objectContaining({ detached: true })
      )
      expect(mockUnref).toHaveBeenCalled()
      expect(mockQuit).toHaveBeenCalled()
      expect(fs.existsSync(path.join(userDataDir, 'widget-pos.json'))).toBe(false)
    })

    it('preserves paths with special characters (&, %, parenthesis) during portable cleanup', async () => {
      const specialDir = path.join(tempDir, 'portable & special %20 (x86)')
      fs.mkdirSync(specialDir, { recursive: true })
      const specialExe = path.join(specialDir, 'Focus & %20 (x86).exe')
      fs.writeFileSync(specialExe, '')

      const userDataDir = path.join(tempDir, 'userData & special %20 (x86)')
      fs.mkdirSync(userDataDir, { recursive: true })
      fs.writeFileSync(path.join(userDataDir, 'file.txt'), 'data')

      const mockUnref = vi.fn()
      const mockSpawn = vi.fn().mockReturnValue({ unref: mockUnref } as any)
      const mockQuit = vi.fn()

      const result = await performUninstall({
        isPackaged: true,
        platform: 'win32',
        execPath: specialExe,
        portableExePath: specialExe,
        userDataPath: userDataDir,
        quitApp: mockQuit,
        spawnProcess: mockSpawn as any,
        skipTimeout: true
      })

      expect(result.success).toBe(true)
      const spawnedCmdArgs = mockSpawn.mock.calls[0][1] as string[]
      const script = spawnedCmdArgs[spawnedCmdArgs.length - 1]
      // Path must NOT have stripped '&' or '%'
      expect(script).toContain('portable & special %20 (x86)')
      expect(script).toContain('Focus & %20 (x86).exe')
      expect(script).toContain('userData & special %20 (x86)')
    })

    it('handles macOS builds: purges userData, trashes .app bundle, and quits', async () => {
      const appBundleDir = path.join(tempDir, 'Applications', 'Focus.app')
      const macExecDir = path.join(appBundleDir, 'Contents', 'MacOS')
      fs.mkdirSync(macExecDir, { recursive: true })
      const macExecPath = path.join(macExecDir, 'Focus')
      fs.writeFileSync(macExecPath, '')

      const userDataDir = path.join(tempDir, 'macUserData')
      fs.mkdirSync(userDataDir, { recursive: true })
      fs.writeFileSync(path.join(userDataDir, 'focus-logs'), '')

      const trashSpy = vi.spyOn(shell, 'trashItem').mockResolvedValue(undefined)
      const mockQuit = vi.fn()

      const result = await performUninstall({
        isPackaged: true,
        platform: 'darwin',
        execPath: macExecPath,
        userDataPath: userDataDir,
        quitApp: mockQuit,
        skipTimeout: true
      })

      expect(result.success).toBe(true)
      expect(result.message).toContain('moved to Trash')
      expect(trashSpy).toHaveBeenCalledWith(path.resolve(macExecPath, '../../..'))
      expect(mockQuit).toHaveBeenCalled()
    })

    it('falls back to detached trash helper on macOS when shell.trashItem rejects due to running app lock', async () => {
      const appBundleDir = path.join(tempDir, 'Applications', 'FocusLocked.app')
      const macExecDir = path.join(appBundleDir, 'Contents', 'MacOS')
      fs.mkdirSync(macExecDir, { recursive: true })
      const macExecPath = path.join(macExecDir, 'Focus')
      fs.writeFileSync(macExecPath, '')

      const userDataDir = path.join(tempDir, 'macUserDataLocked')
      fs.mkdirSync(userDataDir, { recursive: true })

      vi.spyOn(shell, 'trashItem').mockRejectedValue(
        new Error('Item is in use by a running process')
      )
      const mockQuit = vi.fn()
      const mockUnref = vi.fn()
      const mockSpawn = vi.fn().mockReturnValue({ unref: mockUnref } as any)

      const result = await performUninstall({
        isPackaged: true,
        platform: 'darwin',
        execPath: macExecPath,
        userDataPath: userDataDir,
        quitApp: mockQuit,
        spawnProcess: mockSpawn as any,
        skipTimeout: true
      })

      expect(result.success).toBe(true)
      expect(result.message).toContain('moved to Trash')
      expect(mockSpawn).toHaveBeenCalledWith(
        'sh',
        expect.arrayContaining(['-c']),
        expect.objectContaining({ detached: true })
      )
      expect(mockUnref).toHaveBeenCalled()
      expect(mockQuit).toHaveBeenCalled()
    })

    it('handles Linux AppImage: purges userData, trashes AppImage, and quits', async () => {
      const appImageDir = path.join(tempDir, 'linux')
      fs.mkdirSync(appImageDir, { recursive: true })
      const appImagePath = path.join(appImageDir, 'Focus-1.0.0.AppImage')
      fs.writeFileSync(appImagePath, '')

      const userDataDir = path.join(tempDir, 'linuxUserData')
      fs.mkdirSync(userDataDir, { recursive: true })

      const trashSpy = vi.spyOn(shell, 'trashItem').mockResolvedValue(undefined)
      const mockQuit = vi.fn()

      const result = await performUninstall({
        isPackaged: true,
        platform: 'linux',
        execPath: '/usr/bin/focus',
        appImagePath,
        userDataPath: userDataDir,
        quitApp: mockQuit,
        skipTimeout: true
      })

      expect(result.success).toBe(true)
      expect(result.message).toContain('Focus AppImage and local application data removed')
      expect(trashSpy).toHaveBeenCalledWith(appImagePath)
      expect(mockQuit).toHaveBeenCalled()
    })

    it('handles Linux package manager installations: purges userData and returns instructions', async () => {
      const userDataDir = path.join(tempDir, 'linuxUserData')
      fs.mkdirSync(userDataDir, { recursive: true })

      const mockQuit = vi.fn()
      const result = await performUninstall({
        isPackaged: true,
        platform: 'linux',
        execPath: '/usr/bin/focus',
        appImagePath: undefined,
        userDataPath: userDataDir,
        quitApp: mockQuit,
        skipTimeout: true
      })

      expect(result.success).toBe(true)
      expect(result.message).toContain('package manager')
      expect(mockQuit).toHaveBeenCalled()
    })

    it('preserves user data when keepUserData option is true', async () => {
      const userDataDir = path.join(tempDir, 'preservedUserData')
      fs.mkdirSync(userDataDir, { recursive: true })
      const dbPath = path.join(userDataDir, 'focus.db')
      fs.writeFileSync(dbPath, 'sqlite data')

      const mockQuit = vi.fn()
      const result = await performUninstall({
        isPackaged: true,
        platform: 'linux',
        execPath: '/usr/bin/focus',
        userDataPath: userDataDir,
        keepUserData: true,
        quitApp: mockQuit,
        skipTimeout: true
      })

      expect(result.success).toBe(true)
      expect(fs.existsSync(dbPath)).toBe(true)
      expect(fs.readFileSync(dbPath, 'utf8')).toBe('sqlite data')
      expect(mockQuit).toHaveBeenCalled()
    })

    it('invokes prepareForExit hook before closing database and exiting', async () => {
      const order: string[] = []
      const mockPrepare = vi.fn(async () => {
        order.push('prepareForExit')
      })
      const mockClose = vi.fn(() => {
        order.push('dataManager.close')
      })
      const mockQuit = vi.fn(() => {
        order.push('quitApp')
      })

      const result = await performUninstall({
        isPackaged: true,
        platform: 'linux',
        execPath: '/usr/bin/focus',
        userDataPath: path.join(tempDir, 'dummyUser'),
        prepareForExit: mockPrepare,
        dataManager: { close: mockClose },
        quitApp: mockQuit,
        skipTimeout: true
      })

      expect(result.success).toBe(true)
      expect(mockPrepare).toHaveBeenCalledTimes(1)
      expect(mockClose).toHaveBeenCalledTimes(1)
      expect(mockQuit).toHaveBeenCalledTimes(1)
      expect(order).toEqual(['prepareForExit', 'dataManager.close', 'quitApp'])
    })
  })
})
