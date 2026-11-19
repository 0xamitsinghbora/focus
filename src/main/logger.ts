import { app, shell } from 'electron'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { LogLevel, ClientLogPayload, AppLogsResult, SystemDiagnostics } from '../shared/types'
import { SUPPORT_EMAIL } from '../shared/config'

const GITHUB_REPO_URL = 'https://github.com/healthOS/focus'
const MAX_LOG_SIZE = 5 * 1024 * 1024 // 5 MB
const MAX_ARCHIVES = 3
const RING_BUFFER_SIZE = 300
const FLUSH_INTERVAL_MS = 150
const MAX_BATCH_SIZE = 100

function getUserDataPath(): string {
  try {
    return app.getPath('userData')
  } catch {
    const appName = 'focus'
    if (process.platform === 'win32') {
      return path.join(
        process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
        appName
      )
    } else if (process.platform === 'darwin') {
      return path.join(os.homedir(), 'Library', 'Application Support', appName)
    } else {
      return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), appName)
    }
  }
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

export function sanitizeText(text: string): string {
  if (!text) return ''
  let sanitized = text
    // Redact Bearer tokens
    .replace(/(bearer\s+)[a-zA-Z0-9_\-.]{15,}/gi, '$1***REDACTED***')
    // Redact OAuth/API keys & client secrets
    .replace(
      /(["']?(?:client_secret|clientSecret|refresh_token|refreshToken|access_token|accessToken|authorization|password|secret|apiKey|api_key)["']?\s*[:=]\s*["']?)([^"',\s}]{8,})(["']?)/gi,
      '$1***REDACTED***$3'
    )
    // Redact Google OAuth client IDs if desired, or at least secrets
    .replace(/(client_secret[=:]+)[^\s&]+/gi, '$1***REDACTED***')

  // Redact user's home directory and username from paths to prevent privacy leakage
  try {
    const home = os.homedir()
    if (home && home.length > 2) {
      // Escape for regex replacement
      const escapedHome = home.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      sanitized = sanitized.replace(new RegExp(escapedHome, 'gi'), '<USER_HOME>')
    }
    const username = os.userInfo()?.username
    if (username && username.length > 1 && username !== 'root') {
      const userPattern = new RegExp(
        `([/\\\\]users[/\\\\])${username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([/\\\\])`,
        'gi'
      )
      sanitized = sanitized.replace(userPattern, '$1<USER>$2')
    }
  } catch {
    // fallback
  }

  return sanitized
}

export function stringifyData(data: unknown): string {
  if (data === undefined || data === null) return ''
  if (data instanceof Error) {
    return data.stack || `${data.name}: ${data.message}`
  }
  if (typeof data === 'string') {
    return sanitizeText(data)
  }
  try {
    return sanitizeText(JSON.stringify(data, null, 2))
  } catch {
    return sanitizeText(String(data))
  }
}

export class AppLogger {
  private static instance: AppLogger
  private logsDir: string
  private logFilePath: string
  private ringBuffer: string[] = []
  private initialized = false
  private startTime = Date.now()

  // Asynchronous batching & file size tracking
  private writeQueue: string[] = []
  private flushTimer: NodeJS.Timeout | null = null
  private flushPromise: Promise<void> | null = null
  private currentFileSize = -1
  private maxLogSize: number = MAX_LOG_SIZE
  private isClosed = false

  private originalConsole = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console)
  }

  private constructor() {
    const userData = getUserDataPath()
    this.logsDir = path.join(userData, 'logs')
    this.logFilePath = path.join(this.logsDir, 'focus.log')

    try {
      if (!fs.existsSync(this.logsDir)) {
        fs.mkdirSync(this.logsDir, { recursive: true })
      }
    } catch (e) {
      this.originalConsole.error('Failed to create logs directory:', e)
    }
  }

  public static getInstance(): AppLogger {
    if (!AppLogger.instance) {
      AppLogger.instance = new AppLogger()
    }
    return AppLogger.instance
  }

  public init(): void {
    if (this.initialized) return
    this.initialized = true

    this.setupConsoleInterception()
    this.setupProcessErrorHandlers()
    this.writeSessionHeader()
  }

  private writeSessionHeader(): void {
    const diag = this.getDiagnostics()
    const header = [
      '================================================================================',
      `FOCUS APP SESSION STARTED: ${new Date().toISOString()}`,
      `Version: ${diag.appVersion} | Platform: ${diag.platform} (${diag.arch}) - ${diag.osRelease}`,
      `Electron: ${diag.electronVersion} | Chrome: ${diag.chromeVersion} | Node: ${diag.nodeVersion}`,
      `Data Path: ${diag.dataPath}`,
      `Log File: ${diag.logFilePath}`,
      '================================================================================'
    ].join(os.EOL)

    this.writeRaw(header)
  }

  private setupConsoleInterception(): void {
    console.log = (...args: unknown[]) => {
      this.originalConsole.log(...args)
      this.write('INFO', 'main:console', args)
    }

    console.info = (...args: unknown[]) => {
      this.originalConsole.info(...args)
      this.write('INFO', 'main:console', args)
    }

    console.warn = (...args: unknown[]) => {
      this.originalConsole.warn(...args)
      this.write('WARN', 'main:console', args)
    }

    console.error = (...args: unknown[]) => {
      this.originalConsole.error(...args)
      this.write('ERROR', 'main:console', args)
    }

    console.debug = (...args: unknown[]) => {
      this.originalConsole.debug(...args)
      this.write('DEBUG', 'main:console', args)
    }
  }

  private setupProcessErrorHandlers(): void {
    process.on('uncaughtException', (error: Error) => {
      this.originalConsole.error('CRITICAL: Uncaught Exception:', error)
      this.write('ERROR', 'process:uncaughtException', [error.stack || error.message])
      this.flushSync()
    })

    process.on('unhandledRejection', (reason: unknown) => {
      this.originalConsole.error('CRITICAL: Unhandled Promise Rejection:', reason)
      this.write('ERROR', 'process:unhandledRejection', [
        reason instanceof Error ? reason.stack || reason.message : String(reason)
      ])
      this.flushSync()
    })

    process.on('exit', () => {
      this.flushSync()
    })

    try {
      if (typeof app?.on === 'function') {
        app.on('before-quit', () => {
          this.flushSync()
        })
        app.on('will-quit', () => {
          this.flushSync()
        })
      }
    } catch {
      // app may not be ready or available in test environments
    }
  }

  private getFileSize(): number {
    if (this.currentFileSize >= 0) {
      return this.currentFileSize
    }
    try {
      if (fs.existsSync(this.logFilePath)) {
        this.currentFileSize = fs.statSync(this.logFilePath).size
        return this.currentFileSize
      }
    } catch {
      // Ignore stat error
    }
    this.currentFileSize = 0
    return 0
  }

  private async rotateLogsAsync(): Promise<void> {
    try {
      for (let i = MAX_ARCHIVES; i >= 1; i--) {
        const currentFile =
          i === 1 ? this.logFilePath : path.join(this.logsDir, `focus.${i - 1}.log`)
        const targetFile = path.join(this.logsDir, `focus.${i}.log`)

        const currentExists = await fs.promises
          .access(currentFile)
          .then(() => true)
          .catch(() => false)

        if (currentExists) {
          const targetExists = await fs.promises
            .access(targetFile)
            .then(() => true)
            .catch(() => false)

          if (targetExists) {
            await fs.promises.unlink(targetFile).catch(() => {})
          }
          await fs.promises.rename(currentFile, targetFile).catch((err) => {
            this.originalConsole.error(`Failed to rename ${currentFile} to ${targetFile}:`, err)
          })
        }
      }
      this.currentFileSize = 0
    } catch (err) {
      this.originalConsole.error('Failed to rotate logs asynchronously:', err)
    }
  }

  private rotateLogsSync(): void {
    try {
      for (let i = MAX_ARCHIVES; i >= 1; i--) {
        const currentFile =
          i === 1 ? this.logFilePath : path.join(this.logsDir, `focus.${i - 1}.log`)
        const targetFile = path.join(this.logsDir, `focus.${i}.log`)

        if (fs.existsSync(currentFile)) {
          if (fs.existsSync(targetFile)) {
            try {
              fs.unlinkSync(targetFile)
            } catch {
              // ignore error during rotation cleanup
            }
          }
          fs.renameSync(currentFile, targetFile)
        }
      }
      this.currentFileSize = 0
    } catch (err) {
      this.originalConsole.error('Failed to rotate logs synchronously:', err)
    }
  }

  private async rotateLogsIfNeededAsync(incomingBytes: number): Promise<void> {
    if (this.getFileSize() + incomingBytes >= this.maxLogSize) {
      await this.rotateLogsAsync()
    }
  }

  private rotateLogsIfNeededSync(incomingBytes: number): void {
    if (this.getFileSize() + incomingBytes >= this.maxLogSize) {
      this.rotateLogsSync()
    }
  }

  private enqueue(entry: string): void {
    if (this.isClosed) return
    this.writeQueue.push(entry)

    if (this.writeQueue.length >= MAX_BATCH_SIZE) {
      if (this.flushTimer) {
        clearTimeout(this.flushTimer)
        this.flushTimer = null
      }
      this.flushQueueAsync().catch((err) => {
        this.originalConsole.error('Failed to flush log queue:', err)
      })
      return
    }

    if (!this.flushTimer && !this.flushPromise) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null
        this.flushQueueAsync().catch((err) => {
          this.originalConsole.error('Failed to flush log queue:', err)
        })
      }, FLUSH_INTERVAL_MS)
      this.flushTimer.unref?.()
    }
  }

  public async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    return this.flushQueueAsync()
  }

  public async shutdown(): Promise<void> {
    this.isClosed = true
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    if (this.flushPromise) {
      try {
        await this.flushPromise
      } catch {
        // ignore
      }
    }
    this.writeQueue = []
  }

  private async flushQueueAsync(): Promise<void> {
    if (this.flushPromise) {
      await this.flushPromise
      if (this.writeQueue.length > 0) {
        return this.flushQueueAsync()
      }
      return
    }

    if (this.writeQueue.length === 0) {
      return
    }

    this.flushPromise = (async () => {
      try {
        while (this.writeQueue.length > 0) {
          const batch = this.writeQueue.splice(0, this.writeQueue.length)
          const payload = batch.join(os.EOL) + os.EOL
          const payloadBytes = Buffer.byteLength(payload, 'utf8')

          await this.rotateLogsIfNeededAsync(payloadBytes)
          await fs.promises.appendFile(this.logFilePath, payload, 'utf8')
          this.currentFileSize = this.getFileSize() + payloadBytes
        }
      } catch (e) {
        this.originalConsole.error('Failed to append to log file:', e)
      } finally {
        this.flushPromise = null
        if (this.writeQueue.length > 0 && !this.flushTimer) {
          this.flushTimer = setTimeout(() => {
            this.flushTimer = null
            this.flushQueueAsync().catch((err) => {
              this.originalConsole.error('Failed to flush log queue:', err)
            })
          }, FLUSH_INTERVAL_MS)
          this.flushTimer.unref?.()
        }
      }
    })()

    return this.flushPromise
  }

  public flushSync(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }

    if (this.writeQueue.length === 0) {
      return
    }

    try {
      const batch = this.writeQueue.splice(0, this.writeQueue.length)
      const payload = batch.join(os.EOL) + os.EOL
      const payloadBytes = Buffer.byteLength(payload, 'utf8')

      this.rotateLogsIfNeededSync(payloadBytes)
      fs.appendFileSync(this.logFilePath, payload, 'utf8')
      this.currentFileSize = this.getFileSize() + payloadBytes
    } catch (e) {
      this.originalConsole.error('Failed to flush log queue synchronously:', e)
    }
  }

  private writeRaw(rawString: string): void {
    const lines = rawString.split(/\r?\n/)
    for (const line of lines) {
      if (line.trim()) {
        this.ringBuffer.push(line)
        if (this.ringBuffer.length > RING_BUFFER_SIZE) {
          this.ringBuffer.shift()
        }
      }
    }

    this.enqueue(rawString)
  }

  private write(level: LogLevel | string, tag: string, args: unknown[]): void {
    const timestamp = new Date().toISOString()
    const messageParts = args.map((arg) => stringifyData(arg)).filter(Boolean)
    const combinedMessage = messageParts.join(' ')
    const formattedLine = `[${timestamp}] [${level}] [${tag}] ${combinedMessage}`

    this.ringBuffer.push(formattedLine)
    if (this.ringBuffer.length > RING_BUFFER_SIZE) {
      this.ringBuffer.shift()
    }

    this.enqueue(formattedLine)
  }

  public debug(tag: string, message: string, ...args: unknown[]): void {
    this.write('DEBUG', tag, [message, ...args])
  }

  public info(tag: string, message: string, ...args: unknown[]): void {
    this.write('INFO', tag, [message, ...args])
  }

  public warn(tag: string, message: string, ...args: unknown[]): void {
    this.write('WARN', tag, [message, ...args])
  }

  public error(tag: string, message: string, ...args: unknown[]): void {
    this.write('ERROR', tag, [message, ...args])
  }

  public logClientMessage(payload: ClientLogPayload): void {
    const level = (payload.level || 'info').toUpperCase()
    const tag = payload.tag ? `renderer:${payload.tag}` : 'renderer'
    const content = payload.details
      ? `${payload.message} | ${sanitizeText(payload.details)}`
      : payload.message

    this.write(level, tag, [content])
  }

  public getRecentLogs(limit = 150): AppLogsResult {
    let lines: string[] = []
    let size = 0
    let lastModified: string | undefined

    try {
      if (this.writeQueue.length > 0) {
        this.flushSync()
      }

      if (fs.existsSync(this.logFilePath)) {
        const stats = fs.statSync(this.logFilePath)
        size = stats.size
        this.currentFileSize = size
        lastModified = stats.mtime.toISOString()

        if (this.ringBuffer.length >= Math.min(limit, 50)) {
          lines = this.ringBuffer.slice(-limit)
        } else {
          // Read from file if ring buffer is empty (e.g. app just restarted)
          const content = fs.readFileSync(this.logFilePath, 'utf8')
          const allLines = content.split(/\r?\n/).filter((l) => l.trim().length > 0)
          lines = allLines.slice(-limit)
        }
      } else {
        lines = this.ringBuffer.slice(-limit)
      }
    } catch (err) {
      this.originalConsole.error('Failed to read logs:', err)
      lines = this.ringBuffer.slice(-limit)
    }

    return {
      lines,
      logFilePath: this.logFilePath,
      logFileSize: size,
      logFileSizeFormatted: formatBytes(size),
      lastModified
    }
  }

  public getDiagnostics(): SystemDiagnostics {
    let fileSize = 0
    try {
      if (this.writeQueue.length > 0) {
        this.flushSync()
      }
      fileSize = this.getFileSize()
    } catch {
      // Ignore stat error if file is missing or locked
    }

    const mem = process.memoryUsage()
    const uptimeSec = Math.floor((Date.now() - this.startTime) / 1000)

    return {
      appVersion: typeof app.getVersion === 'function' ? app.getVersion() : '1.0.0',
      platform: process.platform,
      osRelease: `${os.type()} ${os.release()}`,
      arch: process.arch,
      electronVersion: process.versions.electron || 'unknown',
      chromeVersion: process.versions.chrome || 'unknown',
      nodeVersion: process.versions.node || 'unknown',
      uptimeSeconds: uptimeSec,
      memoryUsageMB: Math.round(mem.rss / (1024 * 1024)),
      logFilePath: this.logFilePath,
      logFileSizeFormatted: formatBytes(fileSize),
      dataPath: path.join(getUserDataPath(), 'focus-logs'),
      githubIssuesUrl: `${GITHUB_REPO_URL}/issues/new`,
      supportEmail: SUPPORT_EMAIL
    }
  }

  public generateEmailReport(customDescription?: string): string {
    const diag = this.getDiagnostics()

    return [
      'Describe what happened:',
      customDescription || '[ Please write a brief description of what happened here ]',
      '',
      'Steps to reproduce (optional):',
      '1. ',
      '2. ',
      '',
      'System Diagnostics:',
      '--------------------------------------------------',
      `App Version: Focus v${diag.appVersion}`,
      `OS: ${diag.osRelease} (${diag.platform} ${diag.arch})`,
      `Electron: ${diag.electronVersion} | Chrome: ${diag.chromeVersion} | Node: ${diag.nodeVersion}`,
      `App Uptime: ${diag.uptimeSeconds}s | Memory: ${diag.memoryUsageMB} MB`,
      `Log File: ${diag.logFilePath} (${diag.logFileSizeFormatted})`,
      '',
      'Attachments:',
      '--------------------------------------------------',
      'focus.log (File Explorer has been opened with focus.log selected — please drag & drop it here)',
      ''
    ].join('\n')
  }

  public generateGitHubIssueReport(customDescription?: string): string {
    const diag = this.getDiagnostics()
    const logsResult = this.getRecentLogs(100)
    const logsText = logsResult.lines.map((l) => sanitizeText(l)).join('\n')

    return [
      '### Describe the Issue',
      customDescription || '<!-- A clear and concise description of what happened. -->',
      '',
      '### Steps to Reproduce',
      '1. Open Focus',
      '2. Perform action: ...',
      '3. See error',
      '',
      '### Expected Behavior',
      '<!-- What you expected to happen. -->',
      '',
      '### Actual Behavior',
      '<!-- What actually happened. -->',
      '',
      '### System Diagnostics',
      `- **App Version:** Focus v${diag.appVersion}`,
      `- **OS:** ${diag.osRelease} (${diag.platform} ${diag.arch})`,
      `- **Electron:** ${diag.electronVersion}`,
      `- **Chrome:** ${diag.chromeVersion}`,
      `- **Node:** ${diag.nodeVersion}`,
      `- **App Uptime:** ${diag.uptimeSeconds}s`,
      '',
      '<details>',
      '<summary><b>Diagnostic Logs</b></summary>',
      '',
      '```log',
      logsText || 'No recent logs recorded.',
      '```',
      '</details>',
      ''
    ].join('\n')
  }

  public openLogsFolder(): void {
    try {
      this.flushSync()
      if (fs.existsSync(this.logFilePath)) {
        shell.showItemInFolder(this.logFilePath)
      } else if (fs.existsSync(this.logsDir)) {
        shell.openPath(this.logsDir)
      } else {
        const userData = getUserDataPath()
        shell.openPath(userData)
      }
    } catch (e) {
      this.originalConsole.error('Failed to open logs folder:', e)
    }
  }

  public clearLogs(): void {
    try {
      if (this.flushTimer) {
        clearTimeout(this.flushTimer)
        this.flushTimer = null
      }
      this.writeQueue = []
      this.ringBuffer = []
      if (fs.existsSync(this.logFilePath)) {
        fs.writeFileSync(this.logFilePath, '', 'utf8')
      }
      this.currentFileSize = 0
      this.writeSessionHeader()
    } catch (err) {
      this.originalConsole.error('Failed to clear logs:', err)
    }
  }

  // Testing helpers
  public setMaxLogSizeForTesting(bytes: number): void {
    this.maxLogSize = bytes
  }

  public resetMaxLogSizeForTesting(): void {
    this.maxLogSize = MAX_LOG_SIZE
  }

  public setLogDirectoryForTesting(customDir: string): void {
    this.isClosed = false
    this.logsDir = customDir
    this.logFilePath = path.join(this.logsDir, 'focus.log')
    this.currentFileSize = -1
    try {
      if (!fs.existsSync(this.logsDir)) {
        fs.mkdirSync(this.logsDir, { recursive: true })
      }
    } catch {
      // ignore directory creation error
    }
  }
}

export const logger = AppLogger.getInstance()
logger.init()
