import fs from 'fs'
import path from 'path'
import os from 'os'
import { spawn } from 'child_process'
import { app, shell } from 'electron'
import { logger } from '../logger'
import {
  UpdateState,
  UpdateReleaseInfo,
  UpdateDownloadProgress,
  CleanCacheResult,
  InstallUpdateOptions,
  IpcChannels
} from '../../shared/types'
import type { SettingsRepository } from '../repositories/SettingsRepository'

export interface GitHubAsset {
  name: string
  browser_download_url: string
  size: number
  content_type?: string
}

export interface GitHubRelease {
  tag_name: string
  name?: string
  body?: string
  published_at: string
  html_url: string
  prerelease?: boolean
  assets: GitHubAsset[]
}

export interface Semver {
  major: number
  minor: number
  patch: number
  prerelease?: string
}

export function parseSemver(v: string): Semver | null {
  if (!v || typeof v !== 'string') return null
  const clean = v.trim().replace(/^v/i, '')
  const match = clean.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/)
  if (!match) return null
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4]
  }
}

export function compareSemver(v1: string, v2: string): number {
  const p1 = parseSemver(v1)
  const p2 = parseSemver(v2)
  if (!p1 && !p2) return 0
  if (!p1) return -1
  if (!p2) return 1

  if (p1.major !== p2.major) return p1.major > p2.major ? 1 : -1
  if (p1.minor !== p2.minor) return p1.minor > p2.minor ? 1 : -1
  if (p1.patch !== p2.patch) return p1.patch > p2.patch ? 1 : -1

  // Release without prerelease is higher than prerelease with identical major.minor.patch
  if (!p1.prerelease && p2.prerelease) return 1
  if (p1.prerelease && !p2.prerelease) return -1
  if (p1.prerelease && p2.prerelease) {
    return p1.prerelease.localeCompare(p2.prerelease)
  }

  return 0
}

export function findMatchingAsset(
  assets: GitHubAsset[],
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
  isPortable = false
): GitHubAsset | null {
  void arch
  if (!assets || assets.length === 0) return null

  // Ignore signature, blockmap, yml, json, and txt metadata
  const binaries = assets.filter(
    (a) =>
      !a.name.endsWith('.blockmap') &&
      !a.name.endsWith('.yml') &&
      !a.name.endsWith('.yaml') &&
      !a.name.endsWith('.txt') &&
      !a.name.endsWith('.json') &&
      !a.name.endsWith('.sig')
  )

  if (platform === 'win32') {
    if (isPortable) {
      const portable = binaries.find(
        (a) => a.name.toLowerCase().includes('portable') && a.name.toLowerCase().endsWith('.exe')
      )
      if (portable) return portable
    }
    // Match installer / setup
    const setup = binaries.find(
      (a) =>
        (a.name.toLowerCase().includes('setup') || a.name.toLowerCase().includes('installer')) &&
        a.name.toLowerCase().endsWith('.exe')
    )
    if (setup) return setup

    // Fallback to any .exe
    const anyExe = binaries.find((a) => a.name.toLowerCase().endsWith('.exe'))
    if (anyExe) return anyExe
  } else if (platform === 'darwin') {
    const dmg = binaries.find((a) => a.name.toLowerCase().endsWith('.dmg'))
    if (dmg) return dmg
    const zip = binaries.find((a) => a.name.toLowerCase().endsWith('.zip'))
    if (zip) return zip
  } else if (platform === 'linux') {
    const appImage = binaries.find((a) => a.name.toLowerCase().endsWith('.appimage'))
    if (appImage) return appImage
    const deb = binaries.find((a) => a.name.toLowerCase().endsWith('.deb'))
    if (deb) return deb
  }

  return null
}

export interface UpdateServiceDependencies {
  settingsRepo: SettingsRepository
  broadcast?: (channel: string, payload: unknown) => void
  prepareForExit?: () => Promise<void> | void
  quitApp?: () => void
  owner?: string
  repo?: string
  currentVersion?: string
  userDataPath?: string
  platform?: NodeJS.Platform
  arch?: string
  isPortable?: boolean
  fetchFn?: typeof fetch
  spawnProcess?: typeof spawn
}

export class UpdateService {
  private deps: UpdateServiceDependencies
  private state: UpdateState
  private abortController: AbortController | null = null
  private autoCheckTimeout: NodeJS.Timeout | null = null
  private autoCheckInterval: NodeJS.Timeout | null = null
  private isDestroyed = false

  constructor(deps: UpdateServiceDependencies) {
    this.deps = deps
    const currentVer = deps.currentVersion ?? (app ? app.getVersion() : '1.0.0')
    this.state = {
      status: 'idle',
      currentVersion: currentVer,
      availableUpdate: null,
      progress: null,
      error: null,
      lastCheckedAt: null,
      downloadedFilePath: null
    }
  }

  public getState(): UpdateState {
    return { ...this.state }
  }

  private setState(partial: Partial<UpdateState>): void {
    this.state = { ...this.state, ...partial }
    try {
      this.deps.broadcast?.(IpcChannels.UpdateStatusChanged, this.getState())
    } catch (err) {
      logger.warn('updater', 'Failed to broadcast update status change:', err)
    }
  }

  private getOwnerAndRepo(): { owner: string; repo: string } {
    return {
      owner: this.deps.owner || 'healthOS',
      repo: this.deps.repo || 'focus'
    }
  }

  private getUpdatesDir(): string {
    const userData = this.deps.userDataPath || (app ? app.getPath('userData') : os.tmpdir())
    const updatesDir = path.join(userData, 'updates')
    if (!fs.existsSync(updatesDir)) {
      try {
        fs.mkdirSync(updatesDir, { recursive: true })
      } catch (err) {
        logger.warn('updater', 'Failed to create updates directory:', err)
      }
    }
    return updatesDir
  }

  /**
   * Checks GitHub Releases for new versions.
   */
  public async checkForUpdates(): Promise<UpdateState> {
    if (this.state.status === 'downloading' || this.state.status === 'installing') {
      return this.getState()
    }

    const { owner, repo } = this.getOwnerAndRepo()
    const fetchFn = this.deps.fetchFn || fetch

    this.setState({
      status: 'checking',
      error: null
    })

    const checkTimestamp = Date.now()
    try {
      const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/latest`
      const headers: Record<string, string> = {
        'User-Agent': `Focus-App/${this.state.currentVersion}`,
        Accept: 'application/vnd.github.v3+json'
      }

      const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      logger.info('updater', `Checking for updates at ${url}...`)
      const res = await fetchFn(url, { headers })

      if (res.status === 404) {
        logger.info('updater', `No GitHub releases found for ${owner}/${repo}.`)
        this.setState({
          status: 'not-available',
          availableUpdate: null,
          lastCheckedAt: checkTimestamp,
          error: null
        })
        this.saveLastCheckTime(checkTimestamp)
        return this.getState()
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        const errorMsg =
          res.status === 403
            ? 'GitHub API rate limit exceeded. Please try again later.'
            : `GitHub API error: ${res.status} ${res.statusText} ${errText.slice(0, 100)}`
        logger.warn('updater', errorMsg)
        this.setState({
          status: 'error',
          error: errorMsg,
          lastCheckedAt: checkTimestamp
        })
        return this.getState()
      }

      const release = (await res.json()) as GitHubRelease
      const releaseVersion = release.tag_name?.trim() || ''

      const isNewer = compareSemver(releaseVersion, this.state.currentVersion) > 0
      this.saveLastCheckTime(checkTimestamp)

      if (!isNewer) {
        logger.info(
          'updater',
          `Current version (${this.state.currentVersion}) is up to date with release (${releaseVersion}).`
        )
        this.setState({
          status: 'not-available',
          availableUpdate: null,
          lastCheckedAt: checkTimestamp,
          error: null
        })
        return this.getState()
      }

      const platform = this.deps.platform ?? process.platform
      const arch = this.deps.arch ?? process.arch
      const isPortable = this.deps.isPortable ?? Boolean(process.env.PORTABLE_EXECUTABLE_FILE)

      const matchingAsset = findMatchingAsset(release.assets || [], platform, arch, isPortable)

      if (!matchingAsset) {
        logger.warn(
          'updater',
          `New release ${releaseVersion} found, but no compatible asset was published for ${platform}-${arch}.`
        )
        this.setState({
          status: 'available',
          availableUpdate: {
            version: releaseVersion.replace(/^v/i, ''),
            releaseName: release.name || releaseVersion,
            releaseNotes: release.body || '',
            publishedAt: release.published_at,
            htmlUrl: release.html_url,
            isPrerelease: Boolean(release.prerelease),
            assetName: '',
            assetSize: 0,
            downloadUrl: ''
          },
          lastCheckedAt: checkTimestamp,
          error: 'No compatible download asset found for your operating system.'
        })
        return this.getState()
      }

      const releaseInfo: UpdateReleaseInfo = {
        version: releaseVersion.replace(/^v/i, ''),
        releaseName: release.name || releaseVersion,
        releaseNotes: release.body || '',
        publishedAt: release.published_at,
        htmlUrl: release.html_url,
        isPrerelease: Boolean(release.prerelease),
        assetName: matchingAsset.name,
        assetSize: matchingAsset.size,
        downloadUrl: matchingAsset.browser_download_url
      }

      logger.info(
        'updater',
        `Update available: ${releaseInfo.version} (${matchingAsset.name}, ${matchingAsset.size} bytes)`
      )

      this.setState({
        status: 'available',
        availableUpdate: releaseInfo,
        lastCheckedAt: checkTimestamp,
        error: null
      })

      // If auto-download is enabled in settings, start download automatically
      const settings = this.deps.settingsRepo.getSettings()
      if (settings.autoDownloadUpdates && matchingAsset.browser_download_url) {
        this.downloadUpdate().catch((err) => {
          logger.warn('updater', 'Automatic update download failed:', err)
        })
      }

      return this.getState()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('updater', 'Failed to check for updates:', err)
      this.setState({
        status: 'error',
        error: msg,
        lastCheckedAt: checkTimestamp
      })
      return this.getState()
    }
  }

  private saveLastCheckTime(timestamp: number): void {
    try {
      this.deps.settingsRepo.patchSettings({ lastUpdateCheck: timestamp })
    } catch {
      // ignore
    }
  }

  /**
   * Downloads the available update asset with streaming progress tracking.
   */
  public async downloadUpdate(): Promise<boolean> {
    if (this.state.status === 'downloading') {
      return true
    }

    const update = this.state.availableUpdate
    if (!update || !update.downloadUrl) {
      this.setState({ error: 'No update available to download.' })
      return false
    }

    const updatesDir = this.getUpdatesDir()
    const targetFile = path.join(updatesDir, update.assetName)
    const downloadTempFile = `${targetFile}.download`

    // Clean any prior partial download
    try {
      if (fs.existsSync(downloadTempFile)) {
        fs.unlinkSync(downloadTempFile)
      }
    } catch {
      // ignore
    }

    this.abortController = new AbortController()
    this.setState({
      status: 'downloading',
      error: null,
      progress: {
        bytesDownloaded: 0,
        totalBytes: update.assetSize || 0,
        percent: 0,
        bytesPerSecond: 0,
        remainingSeconds: 0
      }
    })

    const fetchFn = this.deps.fetchFn || fetch
    const startTime = Date.now()
    let lastProgressTime = startTime
    let lastBytes = 0
    let fileStream: fs.WriteStream | null = null

    try {
      const res = await fetchFn(update.downloadUrl, {
        headers: {
          'User-Agent': `Focus-App/${this.state.currentVersion}`,
          Accept: 'application/octet-stream'
        },
        redirect: 'follow',
        signal: this.abortController.signal
      })

      if (!res.ok) {
        throw new Error(`Failed to download update: HTTP ${res.status} ${res.statusText}`)
      }

      const contentLengthHeader = res.headers.get('content-length')
      const totalBytes =
        contentLengthHeader && parseInt(contentLengthHeader, 10) > 0
          ? parseInt(contentLengthHeader, 10)
          : update.assetSize || 0

      if (!res.body) {
        throw new Error('Download response body is empty.')
      }

      fileStream = fs.createWriteStream(downloadTempFile)
      fileStream.on('error', (err) => {
        logger.warn('updater', 'Download file stream error:', err)
      })
      let bytesDownloaded = 0

      // Read Web Stream reader
      const reader = res.body.getReader()

      const throttleIntervalMs = 150

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        if (value) {
          bytesDownloaded += value.length
          fileStream.write(Buffer.from(value))

          const now = Date.now()
          if (now - lastProgressTime >= throttleIntervalMs || bytesDownloaded === totalBytes) {
            const timeDelta = (now - lastProgressTime) / 1000
            const bytesDelta = bytesDownloaded - lastBytes
            const currentSpeed = timeDelta > 0 ? Math.round(bytesDelta / timeDelta) : 0
            const percent =
              totalBytes > 0 ? Math.min(100, Math.round((bytesDownloaded / totalBytes) * 100)) : 0
            const remainingBytes = Math.max(0, totalBytes - bytesDownloaded)
            const remainingSeconds =
              currentSpeed > 0 ? Math.round(remainingBytes / currentSpeed) : 0

            const progress: UpdateDownloadProgress = {
              bytesDownloaded,
              totalBytes,
              percent,
              bytesPerSecond: currentSpeed,
              remainingSeconds
            }

            this.state.progress = progress
            try {
              this.deps.broadcast?.(IpcChannels.UpdateDownloadProgress, progress)
            } catch {
              // ignore
            }

            lastProgressTime = now
            lastBytes = bytesDownloaded
          }
        }
      }

      if (fileStream) {
        await new Promise<void>((resolve, reject) => {
          fileStream!.end((err?: Error | null) => {
            if (err) reject(err)
            else resolve()
          })
        })
      }

      // Verify file size if known
      if (totalBytes > 0 && bytesDownloaded < totalBytes) {
        throw new Error(
          `Download incomplete: expected ${totalBytes} bytes but got ${bytesDownloaded}`
        )
      }

      // Atomically move temp file to destination
      try {
        if (fs.existsSync(targetFile)) {
          fs.unlinkSync(targetFile)
        }
      } catch {
        // ignore
      }
      fs.renameSync(downloadTempFile, targetFile)

      logger.info('updater', `Update downloaded successfully to ${targetFile}`)

      this.setState({
        status: 'downloaded',
        downloadedFilePath: targetFile,
        progress: {
          bytesDownloaded,
          totalBytes: bytesDownloaded,
          percent: 100,
          bytesPerSecond: 0,
          remainingSeconds: 0
        },
        error: null
      })

      return true
    } catch (err: unknown) {
      if (fileStream) {
        try {
          fileStream.destroy()
        } catch {
          // ignore
        }
      }
      // Cleanup partial temp file
      try {
        if (fs.existsSync(downloadTempFile)) {
          fs.unlinkSync(downloadTempFile)
        }
      } catch {
        // ignore
      }

      if (this.abortController?.signal.aborted) {
        logger.info('updater', 'Download was cancelled by user.')
        this.setState({
          status: 'available',
          progress: null,
          error: null
        })
        return false
      }

      const msg = err instanceof Error ? err.message : String(err)
      logger.error('updater', 'Download failed:', err)
      this.setState({
        status: 'error',
        error: `Download error: ${msg}`
      })
      return false
    } finally {
      this.abortController = null
    }
  }

  /**
   * Cancels any active download operation.
   */
  public async cancelDownload(): Promise<boolean> {
    if (this.state.status !== 'downloading' || !this.abortController) {
      return false
    }
    this.abortController.abort()
    this.setState({
      status: 'available',
      progress: null,
      error: null
    })
    return true
  }

  /**
   * Installs the downloaded update.
   * Cleans up open database handles, windows, and executes the installer or portable replacement.
   */
  public async installUpdate(options: InstallUpdateOptions = {}): Promise<boolean> {
    const downloadedPath = this.state.downloadedFilePath
    if (!downloadedPath || !fs.existsSync(downloadedPath)) {
      this.setState({ error: 'Downloaded update file not found. Please download again.' })
      return false
    }

    this.setState({ status: 'installing' })
    logger.info('updater', `Initiating installation of update: ${downloadedPath}`)

    const platform = this.deps.platform ?? process.platform
    const spawnFn = this.deps.spawnProcess ?? spawn
    const quitApp =
      this.deps.quitApp ??
      (() => {
        if (typeof app?.exit === 'function') {
          app.exit(0)
        } else if (typeof app?.quit === 'function') {
          app.quit()
        }
      })

    // 1. Prepare for exit: cleanly close DB, window state, scheduler
    if (this.deps.prepareForExit) {
      try {
        await this.deps.prepareForExit()
      } catch (err) {
        logger.warn('updater', 'Error during prepareForExit before update:', err)
      }
    }

    // 2. Platform execution
    if (platform === 'win32') {
      const isPortable = this.deps.isPortable ?? Boolean(process.env.PORTABLE_EXECUTABLE_FILE)
      const currentPortableExe = process.env.PORTABLE_EXECUTABLE_FILE

      if (isPortable && currentPortableExe && fs.existsSync(currentPortableExe)) {
        // Portable mode on Windows: replace current exe via delayed script
        try {
          const sanitizeWinPath = (p: string): string => p.replace(/["\r\n\0]/g, '')
          const safeCurrent = sanitizeWinPath(currentPortableExe)
          const safeNew = sanitizeWinPath(downloadedPath)

          // Wait 3 seconds, delete old exe, copy/move new exe to old exe location, launch new exe
          const script = `ping 127.0.0.1 -n 3 > NUL & if exist "${safeCurrent}" del /f /q "${safeCurrent}" & move /y "${safeNew}" "${safeCurrent}" & start "" "${safeCurrent}"`
          const child = spawnFn('cmd.exe', ['/d', '/s', '/c', `"${script}"`], {
            detached: true,
            stdio: 'ignore',
            windowsHide: true,
            windowsVerbatimArguments: true
          })
          child.unref()
          setTimeout(() => quitApp(), 100)
          return true
        } catch (err) {
          logger.error('updater', 'Failed to launch Windows portable updater script:', err)
          this.setState({ status: 'error', error: 'Failed to update portable executable.' })
          return false
        }
      }

      // Windows NSIS Setup Installer
      try {
        const installArgs = options.silent ? ['/S'] : []
        const child = spawnFn(downloadedPath, installArgs, {
          detached: true,
          stdio: 'ignore'
        })
        child.unref()

        setTimeout(() => quitApp(), 100)
        return true
      } catch (err) {
        logger.error('updater', 'Failed to launch Windows installer:', err)
        this.setState({ status: 'error', error: 'Failed to launch setup executable.' })
        return false
      }
    } else if (platform === 'darwin') {
      try {
        if (downloadedPath.endsWith('.dmg')) {
          shell.openPath(downloadedPath)
        } else {
          shell.showItemInFolder(downloadedPath)
        }
        setTimeout(() => quitApp(), 500)
        return true
      } catch (err) {
        logger.error('updater', 'Failed to open macOS update:', err)
        return false
      }
    } else {
      // Linux
      try {
        if (downloadedPath.endsWith('.AppImage')) {
          fs.chmodSync(downloadedPath, 0o755)
          const child = spawnFn(downloadedPath, [], { detached: true, stdio: 'ignore' })
          child.unref()
          setTimeout(() => quitApp(), 100)
          return true
        } else {
          shell.openPath(downloadedPath)
          return true
        }
      } catch (err) {
        logger.error('updater', 'Failed to launch Linux update:', err)
        return false
      }
    }
  }

  /**
   * Cleans old versions, orphaned partial downloads, and stale cache artifacts.
   */
  public cleanOldVersions(): CleanCacheResult {
    let freedBytes = 0
    const cleanedFiles: string[] = []
    const updatesDir = this.getUpdatesDir()

    try {
      if (fs.existsSync(updatesDir)) {
        const entries = fs.readdirSync(updatesDir)
        const currentPendingFile = this.state.downloadedFilePath
          ? path.basename(this.state.downloadedFilePath)
          : null

        for (const file of entries) {
          const filePath = path.join(updatesDir, file)
          try {
            const stat = fs.statSync(filePath)
            // Remove .download or .tmp partial files
            if (file.endsWith('.download') || file.endsWith('.tmp') || file.endsWith('.partial')) {
              freedBytes += stat.size
              fs.unlinkSync(filePath)
              cleanedFiles.push(file)
              continue
            }

            // Remove previous installers that are not the currently pending install
            if (
              file !== currentPendingFile &&
              (file.endsWith('.exe') ||
                file.endsWith('.dmg') ||
                file.endsWith('.AppImage') ||
                file.endsWith('.deb') ||
                file.endsWith('.zip'))
            ) {
              freedBytes += stat.size
              fs.unlinkSync(filePath)
              cleanedFiles.push(file)
            }
          } catch {
            // ignore
          }
        }
      }
    } catch (err) {
      logger.warn('updater', 'Error cleaning updates directory:', err)
    }

    // Clean OS temp update files
    try {
      const tmp = os.tmpdir()
      const entries = fs.readdirSync(tmp)
      for (const entry of entries) {
        if (
          entry.toLowerCase().startsWith('focus-update') ||
          entry.toLowerCase().startsWith('focus-installer')
        ) {
          const p = path.join(tmp, entry)
          try {
            const stat = fs.statSync(p)
            if (stat.isDirectory()) {
              fs.rmSync(p, { recursive: true, force: true })
            } else {
              freedBytes += stat.size
              fs.unlinkSync(p)
            }
            cleanedFiles.push(entry)
          } catch {
            // ignore
          }
        }
      }
    } catch {
      // ignore
    }

    return {
      success: true,
      freedBytes,
      cleanedFiles
    }
  }

  /**
   * Handles post-update first-run cleanup.
   * If currentVersion is newer than lastRunVersion, Focus was upgraded!
   * Automatically clears all obsolete installer files from the updates cache and saves currentVersion.
   */
  public handlePostUpdateCleanup(): void {
    try {
      const settings = this.deps.settingsRepo.getSettings()
      const lastRun = settings.lastRunVersion

      if (lastRun && compareSemver(this.state.currentVersion, lastRun) > 0) {
        logger.info(
          'updater',
          `Focus successfully upgraded from v${lastRun} to v${this.state.currentVersion}. Purging previous installer artifacts...`
        )
        // Purge updates dir to recover disk space
        const res = this.cleanOldVersions()
        logger.info(
          'updater',
          `Post-update cleanup freed ${(res.freedBytes / (1024 * 1024)).toFixed(1)} MB.`
        )
      }

      this.deps.settingsRepo.patchSettings({ lastRunVersion: this.state.currentVersion })
    } catch (err) {
      logger.warn('updater', 'Failed to run post-update cleanup:', err)
    }
  }

  /**
   * Public manual clean cache method.
   */
  public cleanCache(): CleanCacheResult {
    return this.cleanOldVersions()
  }

  /**
   * Starts automatic update checking timers.
   */
  public startAutoCheckTimer(initialDelayMs = 6000, intervalMs = 24 * 60 * 60 * 1000): void {
    this.stopAutoCheckTimer()

    this.autoCheckTimeout = setTimeout(() => {
      if (this.isDestroyed) return
      const s = this.deps.settingsRepo.getSettings()
      if (s.autoCheckUpdates !== false) {
        this.checkForUpdates().catch((err) => {
          logger.warn('updater', 'Scheduled startup update check failed:', err)
        })
      }

      this.autoCheckInterval = setInterval(() => {
        if (this.isDestroyed) return
        const currentSettings = this.deps.settingsRepo.getSettings()
        if (currentSettings.autoCheckUpdates !== false) {
          this.checkForUpdates().catch((err) => {
            logger.warn('updater', 'Periodic update check failed:', err)
          })
        }
      }, intervalMs)
    }, initialDelayMs)
  }

  public stopAutoCheckTimer(): void {
    if (this.autoCheckTimeout) {
      clearTimeout(this.autoCheckTimeout)
      this.autoCheckTimeout = null
    }
    if (this.autoCheckInterval) {
      clearInterval(this.autoCheckInterval)
      this.autoCheckInterval = null
    }
  }

  public destroy(): void {
    this.isDestroyed = true
    this.stopAutoCheckTimer()
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
  }
}
