import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { formatBytes, sanitizeText, stringifyData, AppLogger } from '../logger'
import os from 'os'
import path from 'path'
import fs from 'fs'

let testDir: string

beforeEach(() => {
  testDir = path.join(
    os.tmpdir(),
    `focus-logger-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  )
  fs.mkdirSync(testDir, { recursive: true })
  vi.stubEnv('FOCUS_TEST_USER_DATA', testDir)
})

afterEach(() => {
  try {
    fs.rmSync(testDir, { recursive: true, force: true })
  } catch {}
  vi.restoreAllMocks()
})

describe('Logger — formatBytes', () => {
  it('formats zero and negative bytes', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(-100)).toBe('0 B')
  })

  it('formats bytes, kilobytes, megabytes, gigabytes', () => {
    expect(formatBytes(500)).toBe('500.0 B')
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(1024 * 1024 * 2.5)).toBe('2.5 MB')
    expect(formatBytes(1024 * 1024 * 1024 * 4)).toBe('4.0 GB')
  })
})

describe('Logger — Sensitive Data Redaction (sanitizeText)', () => {
  it('returns empty string for empty input', () => {
    expect(sanitizeText('')).toBe('')
  })

  it('redacts Bearer tokens', () => {
    const input = 'Authorization: Bearer ya29.a0AfH6SMA1234567890abcdef'
    const sanitized = sanitizeText(input)
    expect(sanitized).not.toContain('ya29.a0AfH6SMA1234567890abcdef')
    expect(sanitized).toContain('Bearer ***REDACTED***')
  })

  it('redacts OAuth refresh tokens and client secrets in JSON or text', () => {
    const raw = JSON.stringify({
      refresh_token: '1//04abcdefghij12345678',
      client_secret: 'GOCSPX-supersecretkey123',
      apiKey: 'AIzaSySecretApiKey99999'
    })
    const sanitized = sanitizeText(raw)
    expect(sanitized).not.toContain('1//04abcdefghij12345678')
    expect(sanitized).not.toContain('GOCSPX-supersecretkey123')
    expect(sanitized).not.toContain('AIzaSySecretApiKey99999')
    expect(sanitized).toContain('***REDACTED***')
  })

  it('leaves non-sensitive messages intact', () => {
    const safeText = 'Scheduled next reminder at 10:30 AM for user activity'
    expect(sanitizeText(safeText)).toBe(safeText)
  })
})

describe('Logger — stringifyData', () => {
  it('handles null and undefined', () => {
    expect(stringifyData(null)).toBe('')
    expect(stringifyData(undefined)).toBe('')
  })

  it('formats Errors with stack or message', () => {
    const err = new Error('Database disk image is malformed')
    const result = stringifyData(err)
    expect(result).toContain('Database disk image is malformed')
  })

  it('stringifies and sanitizes JSON objects', () => {
    const obj = { user: 'Alice', token: 'Bearer secret_access_token_123456' }
    const result = stringifyData(obj)
    expect(result).toContain('Alice')
    expect(result).toContain('***REDACTED***')
    expect(result).not.toContain('secret_access_token_123456')
  })
})

describe('Logger — AppLogger Instance & Ring Buffer', () => {
  it('implements singleton pattern', () => {
    const instance1 = AppLogger.getInstance()
    const instance2 = AppLogger.getInstance()
    expect(instance1).toBe(instance2)
  })

  it('stores log entries in ring buffer', () => {
    const appLogger = AppLogger.getInstance()
    appLogger.info('test-tag', 'Test log message for ring buffer')

    const recent = appLogger.getRecentLogs(10)
    expect(recent.lines.length).toBeGreaterThan(0)
    const lastEntry = recent.lines[recent.lines.length - 1]
    expect(lastEntry).toContain('[INFO]')
    expect(lastEntry).toContain('[test-tag]')
    expect(lastEntry).toContain('Test log message for ring buffer')
  })

  it('caps ring buffer at 300 entries', () => {
    const appLogger = AppLogger.getInstance()
    for (let i = 0; i < 350; i++) {
      appLogger.debug('overflow-tag', `Message #${i}`)
    }

    const all = appLogger.getRecentLogs(500)
    expect(all.lines.length).toBeLessThanOrEqual(300)
    const firstStored = all.lines[0]
    expect(firstStored).not.toContain('Message #0]')
  })

  it('returns valid system diagnostics without errors', () => {
    const appLogger = AppLogger.getInstance()
    const diag = appLogger.getDiagnostics()

    expect(diag.appVersion).toBeDefined()
    expect(diag.platform).toBeDefined()
    expect(diag.arch).toBeDefined()
    expect(diag.logFilePath).toBeDefined()
  })
})

describe('Logger — Asynchronous Non-Blocking File I/O & Rotation', () => {
  it('does NOT call fs.statSync or fs.appendFileSync on the logging hot path', () => {
    const appLogger = AppLogger.getInstance()
    appLogger.setLogDirectoryForTesting(testDir)
    appLogger.flushSync()

    const statSyncSpy = vi.spyOn(fs, 'statSync')
    const appendFileSyncSpy = vi.spyOn(fs, 'appendFileSync')

    // Hot path logging calls
    appLogger.info('hotpath', 'Message 1')
    appLogger.warn('hotpath', 'Message 2')
    appLogger.error('hotpath', 'Message 3')
    appLogger.logClientMessage({ level: 'info', message: 'Client message', tag: 'ui' })

    // Must NOT block the event loop with synchronous file operations
    expect(statSyncSpy).not.toHaveBeenCalled()
    expect(appendFileSyncSpy).not.toHaveBeenCalled()

    statSyncSpy.mockRestore()
    appendFileSyncSpy.mockRestore()
  })

  it('flushes pending queue synchronously via flushSync', () => {
    const appLogger = AppLogger.getInstance()
    appLogger.setLogDirectoryForTesting(testDir)
    appLogger.info('sync-test', 'Synchronously flushed message')

    appLogger.flushSync()

    const logFile = path.join(testDir, 'focus.log')
    expect(fs.existsSync(logFile)).toBe(true)
    const content = fs.readFileSync(logFile, 'utf8')
    expect(content).toContain('[INFO] [sync-test] Synchronously flushed message')
  })

  it('flushes pending queue asynchronously via flush', async () => {
    const appLogger = AppLogger.getInstance()
    appLogger.setLogDirectoryForTesting(testDir)
    appLogger.debug('async-test', 'Asynchronously flushed message')

    await appLogger.flush()

    const logFile = path.join(testDir, 'focus.log')
    expect(fs.existsSync(logFile)).toBe(true)
    const content = fs.readFileSync(logFile, 'utf8')
    expect(content).toContain('[DEBUG] [async-test] Asynchronously flushed message')
  })

  it('rotates log file when size exceeds maxLogSize without synchronous stat on hot path', async () => {
    const appLogger = AppLogger.getInstance()
    appLogger.setLogDirectoryForTesting(testDir)
    appLogger.setMaxLogSizeForTesting(200)

    try {
      // First write - under threshold
      appLogger.info('rotate', 'A'.repeat(80))
      await appLogger.flush()

      const logFile = path.join(testDir, 'focus.log')
      const rotated1 = path.join(testDir, 'focus.1.log')
      expect(fs.existsSync(logFile)).toBe(true)
      expect(fs.existsSync(rotated1)).toBe(false)

      // Second write - pushes over threshold, triggering rotation
      appLogger.info('rotate', 'B'.repeat(150))
      await appLogger.flush()

      expect(fs.existsSync(rotated1)).toBe(true)
      const rotatedContent = fs.readFileSync(rotated1, 'utf8')
      expect(rotatedContent).toContain('A'.repeat(80))

      const activeContent = fs.readFileSync(logFile, 'utf8')
      expect(activeContent).toContain('B'.repeat(150))
    } finally {
      appLogger.resetMaxLogSizeForTesting()
    }
  })

  it('clears logs and resets state on clearLogs', () => {
    const appLogger = AppLogger.getInstance()
    appLogger.setLogDirectoryForTesting(testDir)
    appLogger.info('clear-tag', 'Message to clear')
    appLogger.flushSync()

    appLogger.clearLogs()
    appLogger.flushSync()

    const recent = appLogger.getRecentLogs()
    expect(recent.lines.some((l) => l.includes('Message to clear'))).toBe(false)
  })
})
