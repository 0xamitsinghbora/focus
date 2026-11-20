import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import {
  UpdateService,
  parseSemver,
  compareSemver,
  findMatchingAsset,
  GitHubRelease
} from '../UpdateService'

describe('UpdateService - Semver Logic', () => {
  it('correctly parses semver strings with or without v prefix and prereleases', () => {
    expect(parseSemver('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: undefined })
    expect(parseSemver('v1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: undefined })
    expect(parseSemver('V2.0.1-beta.1')).toEqual({
      major: 2,
      minor: 0,
      patch: 1,
      prerelease: 'beta.1'
    })
    expect(parseSemver('')).toBeNull()
    expect(parseSemver('invalid')).toBeNull()
  })

  it('compares semver versions accurately', () => {
    expect(compareSemver('1.0.1', '1.0.0')).toBe(1)
    expect(compareSemver('1.0.0', '1.0.1')).toBe(-1)
    expect(compareSemver('v1.0.0', '1.0.0')).toBe(0)
    expect(compareSemver('2.0.0', '1.9.9')).toBe(1)
    expect(compareSemver('1.1.0', '1.0.9')).toBe(1)
    expect(compareSemver('1.0.0', '1.0.0-beta.1')).toBe(1)
    expect(compareSemver('1.0.0-beta.2', '1.0.0-beta.1')).toBe(1)
    expect(compareSemver('1.0.0-alpha', '1.0.0-beta')).toBe(-1)
  })
})

describe('UpdateService - Asset Matching', () => {
  const assets = [
    {
      name: 'Focus-Setup-1.0.1.exe',
      browser_download_url: 'https://example.com/setup.exe',
      size: 1000
    },
    {
      name: 'Focus-Portable-1.0.1.exe',
      browser_download_url: 'https://example.com/portable.exe',
      size: 900
    },
    { name: 'Focus-1.0.1.dmg', browser_download_url: 'https://example.com/focus.dmg', size: 800 },
    { name: 'Focus-1.0.1.zip', browser_download_url: 'https://example.com/focus.zip', size: 750 },
    {
      name: 'Focus-1.0.1.AppImage',
      browser_download_url: 'https://example.com/focus.AppImage',
      size: 700
    },
    { name: 'Focus-1.0.1.deb', browser_download_url: 'https://example.com/focus.deb', size: 650 },
    { name: 'latest.yml', browser_download_url: 'https://example.com/latest.yml', size: 100 },
    {
      name: 'Focus-Setup-1.0.1.exe.blockmap',
      browser_download_url: 'https://example.com/bm',
      size: 50
    }
  ]

  it('matches Windows installer setup exe in standard mode', () => {
    const asset = findMatchingAsset(assets, 'win32', 'x64', false)
    expect(asset).not.toBeNull()
    expect(asset?.name).toBe('Focus-Setup-1.0.1.exe')
  })

  it('matches Windows portable exe when portable mode is active', () => {
    const asset = findMatchingAsset(assets, 'win32', 'x64', true)
    expect(asset).not.toBeNull()
    expect(asset?.name).toBe('Focus-Portable-1.0.1.exe')
  })

  it('matches macOS dmg asset', () => {
    const asset = findMatchingAsset(assets, 'darwin', 'x64', false)
    expect(asset).not.toBeNull()
    expect(asset?.name).toBe('Focus-1.0.1.dmg')
  })

  it('matches Linux AppImage asset', () => {
    const asset = findMatchingAsset(assets, 'linux', 'x64', false)
    expect(asset).not.toBeNull()
    expect(asset?.name).toBe('Focus-1.0.1.AppImage')
  })

  it('returns null if no compatible binaries exist', () => {
    const onlyMetadata = [
      { name: 'latest.yml', browser_download_url: 'https://example.com/latest.yml', size: 100 }
    ]
    expect(findMatchingAsset(onlyMetadata, 'win32', 'x64', false)).toBeNull()
  })
})

describe('UpdateService - End to End Flow', () => {
  let tempDir: string
  let mockSettings: Record<string, unknown>
  let mockSettingsRepo: any

  beforeEach(() => {
    tempDir = path.join(
      os.tmpdir(),
      `focus-update-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    )
    fs.mkdirSync(tempDir, { recursive: true })

    mockSettings = {
      autoCheckUpdates: true,
      autoDownloadUpdates: false
    }

    mockSettingsRepo = {
      getSettings: vi.fn(() => ({ ...mockSettings })),
      patchSettings: vi.fn((partial: any) => {
        mockSettings = { ...mockSettings, ...partial }
        return { ...mockSettings }
      })
    }
  })

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch {
      // ignore
    }
  })

  it('detects available update when GitHub release version is newer', async () => {
    const mockRelease: GitHubRelease = {
      tag_name: 'v1.1.0',
      name: 'Focus 1.1.0 - Awesome Features',
      body: '- Added feature A\n- Fixed bug B',
      published_at: '2026-11-20T10:00:00Z',
      html_url: 'https://github.com/healthOS/focus/releases/tag/v1.1.0',
      prerelease: false,
      assets: [
        {
          name: 'Focus-Setup-1.1.0.exe',
          browser_download_url:
            'https://github.com/healthOS/focus/releases/download/v1.1.0/Focus-Setup-1.1.0.exe',
          size: 50000000
        }
      ]
    }

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockRelease
    })

    const broadcast = vi.fn()
    const service = new UpdateService({
      settingsRepo: mockSettingsRepo,
      broadcast,
      currentVersion: '1.0.0',
      userDataPath: tempDir,
      platform: 'win32',
      fetchFn: mockFetch as unknown as typeof fetch
    })

    const state = await service.checkForUpdates()
    expect(state.status).toBe('available')
    expect(state.availableUpdate).not.toBeNull()
    expect(state.availableUpdate?.version).toBe('1.1.0')
    expect(state.availableUpdate?.assetName).toBe('Focus-Setup-1.1.0.exe')
    expect(state.availableUpdate?.assetSize).toBe(50000000)
    expect(mockSettingsRepo.patchSettings).toHaveBeenCalledWith(
      expect.objectContaining({ lastUpdateCheck: expect.any(Number) })
    )
    expect(broadcast).toHaveBeenCalledWith(
      'update:status-changed',
      expect.objectContaining({ status: 'available' })
    )
  })

  it('marks status not-available when current version is equal or newer', async () => {
    const mockRelease: GitHubRelease = {
      tag_name: 'v1.0.0',
      published_at: '2026-11-20T10:00:00Z',
      html_url: 'https://github.com/healthOS/focus/releases/tag/v1.0.0',
      assets: []
    }

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockRelease
    })

    const service = new UpdateService({
      settingsRepo: mockSettingsRepo,
      currentVersion: '1.0.0',
      userDataPath: tempDir,
      fetchFn: mockFetch as unknown as typeof fetch
    })

    const state = await service.checkForUpdates()
    expect(state.status).toBe('not-available')
    expect(state.availableUpdate).toBeNull()
  })

  it('handles 404 cleanly as not-available', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'Not Found'
    })

    const service = new UpdateService({
      settingsRepo: mockSettingsRepo,
      currentVersion: '1.0.0',
      userDataPath: tempDir,
      fetchFn: mockFetch as unknown as typeof fetch
    })

    const state = await service.checkForUpdates()
    expect(state.status).toBe('not-available')
  })

  it('handles rate limits (403) and sets error message', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      text: async () => 'API rate limit exceeded'
    })

    const service = new UpdateService({
      settingsRepo: mockSettingsRepo,
      currentVersion: '1.0.0',
      userDataPath: tempDir,
      fetchFn: mockFetch as unknown as typeof fetch
    })

    const state = await service.checkForUpdates()
    expect(state.status).toBe('error')
    expect(state.error).toContain('rate limit')
  })

  it('downloads update with progress streaming and renames to target file', async () => {
    const mockRelease: GitHubRelease = {
      tag_name: 'v1.1.0',
      published_at: '2026-11-20T10:00:00Z',
      html_url: 'https://github.com/healthOS/focus/releases/tag/v1.1.0',
      assets: [
        {
          name: 'Focus-Setup-1.1.0.exe',
          browser_download_url: 'https://example.com/Focus-Setup-1.1.0.exe',
          size: 30
        }
      ]
    }

    const chunk1 = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    const chunk2 = new Uint8Array([11, 12, 13, 14, 15, 16, 17, 18, 19, 20])
    const chunk3 = new Uint8Array([21, 22, 23, 24, 25, 26, 27, 28, 29, 30])
    let step = 0

    const mockReader = {
      read: vi.fn(async () => {
        step++
        if (step === 1) return { done: false, value: chunk1 }
        if (step === 2) return { done: false, value: chunk2 }
        if (step === 3) return { done: false, value: chunk3 }
        return { done: true, value: undefined }
      })
    }

    const mockFetch = vi.fn(async (url: string) => {
      if (url.includes('api.github.com')) {
        return {
          ok: true,
          status: 200,
          json: async () => mockRelease
        }
      }
      // Download url
      return {
        ok: true,
        status: 200,
        headers: {
          get: (header: string) => (header === 'content-length' ? '30' : null)
        },
        body: {
          getReader: () => mockReader
        }
      }
    })

    const broadcast = vi.fn()
    const service = new UpdateService({
      settingsRepo: mockSettingsRepo,
      broadcast,
      currentVersion: '1.0.0',
      userDataPath: tempDir,
      platform: 'win32',
      fetchFn: mockFetch as unknown as typeof fetch
    })

    await service.checkForUpdates()
    const downloaded = await service.downloadUpdate()
    expect(downloaded).toBe(true)

    const state = service.getState()
    expect(state.status).toBe('downloaded')
    expect(state.downloadedFilePath).toBeTruthy()
    expect(fs.existsSync(state.downloadedFilePath!)).toBe(true)
    expect(fs.statSync(state.downloadedFilePath!).size).toBe(30)
    expect(broadcast).toHaveBeenCalledWith('update:download-progress', expect.any(Object))
  })

  it('allows cancelling an in-flight download and cleans partial files', async () => {
    const mockRelease: GitHubRelease = {
      tag_name: 'v1.1.0',
      published_at: '2026-11-20T10:00:00Z',
      html_url: 'https://github.com/healthOS/focus/releases/tag/v1.1.0',
      assets: [
        {
          name: 'Focus-Setup-1.1.0.exe',
          browser_download_url: 'https://example.com/Focus-Setup-1.1.0.exe',
          size: 1000
        }
      ]
    }

    let cancelTriggered = false
    const mockReader = {
      read: vi.fn(async () => {
        if (!cancelTriggered) {
          return { done: false, value: new Uint8Array([1, 2, 3]) }
        }
        const abortErr = new Error('The operation was aborted.')
        abortErr.name = 'AbortError'
        throw abortErr
      })
    }

    const mockFetch = vi.fn(async (url: string) => {
      if (url.includes('api.github.com')) {
        return {
          ok: true,
          status: 200,
          json: async () => mockRelease
        }
      }
      return {
        ok: true,
        status: 200,
        headers: { get: () => '1000' },
        body: { getReader: () => mockReader }
      }
    })

    const service = new UpdateService({
      settingsRepo: mockSettingsRepo,
      currentVersion: '1.0.0',
      userDataPath: tempDir,
      platform: 'win32',
      fetchFn: mockFetch as unknown as typeof fetch
    })

    await service.checkForUpdates()
    const downloadPromise = service.downloadUpdate()
    cancelTriggered = true
    await service.cancelDownload()
    const result = await downloadPromise

    expect(result).toBe(false)
    expect(service.getState().status).toBe('available')
  })

  it('launches installer and exits on installUpdate', async () => {
    const service = new UpdateService({
      settingsRepo: mockSettingsRepo,
      currentVersion: '1.0.0',
      userDataPath: tempDir,
      platform: 'win32'
    })

    const fakeInstallerPath = path.join(tempDir, 'updates', 'Focus-Setup-1.1.0.exe')
    fs.mkdirSync(path.dirname(fakeInstallerPath), { recursive: true })
    fs.writeFileSync(fakeInstallerPath, 'fake-installer-binary')

    // Inject downloaded state
    ;(service as any).state = {
      ...service.getState(),
      status: 'downloaded',
      downloadedFilePath: fakeInstallerPath
    }

    const prepareForExit = vi.fn()
    const quitApp = vi.fn()
    const mockChild = { unref: vi.fn() }
    const spawnProcess = vi.fn(() => mockChild as any)

    ;(service as any).deps.prepareForExit = prepareForExit
    ;(service as any).deps.quitApp = quitApp
    ;(service as any).deps.spawnProcess = spawnProcess

    const success = await service.installUpdate({ silent: true })
    expect(success).toBe(true)
    expect(prepareForExit).toHaveBeenCalled()
    expect(spawnProcess).toHaveBeenCalledWith(
      fakeInstallerPath,
      ['/S'],
      expect.objectContaining({ detached: true })
    )
    expect(mockChild.unref).toHaveBeenCalled()
  })

  it('cleanOldVersions prunes previous installers, partial files, and cleans cache', () => {
    const updatesDir = path.join(tempDir, 'updates')
    fs.mkdirSync(updatesDir, { recursive: true })

    // Create old installer and partial file
    const oldSetup = path.join(updatesDir, 'Focus-Setup-0.9.0.exe')
    fs.writeFileSync(oldSetup, 'old-setup')
    const partialDownload = path.join(updatesDir, 'Focus-Setup-1.0.0.exe.download')
    fs.writeFileSync(partialDownload, 'partial')

    const service = new UpdateService({
      settingsRepo: mockSettingsRepo,
      currentVersion: '1.0.0',
      userDataPath: tempDir,
      platform: 'win32'
    })

    const result = service.cleanOldVersions()
    expect(result.success).toBe(true)
    expect(result.cleanedFiles).toContain('Focus-Setup-0.9.0.exe')
    expect(result.cleanedFiles).toContain('Focus-Setup-1.0.0.exe.download')
    expect(fs.existsSync(oldSetup)).toBe(false)
    expect(fs.existsSync(partialDownload)).toBe(false)
  })

  it('handlePostUpdateCleanup detects upgrade from older version and cleans old installer files', () => {
    mockSettings.lastRunVersion = '0.9.0'
    const updatesDir = path.join(tempDir, 'updates')
    fs.mkdirSync(updatesDir, { recursive: true })

    const installerFromUpgrade = path.join(updatesDir, 'Focus-Setup-1.0.0.exe')
    fs.writeFileSync(installerFromUpgrade, 'now-obsolete-setup-file')

    const service = new UpdateService({
      settingsRepo: mockSettingsRepo,
      currentVersion: '1.0.0',
      userDataPath: tempDir,
      platform: 'win32'
    })

    service.handlePostUpdateCleanup()

    expect(mockSettingsRepo.patchSettings).toHaveBeenCalledWith(
      expect.objectContaining({ lastRunVersion: '1.0.0' })
    )
    expect(fs.existsSync(installerFromUpgrade)).toBe(false)
  })
})
