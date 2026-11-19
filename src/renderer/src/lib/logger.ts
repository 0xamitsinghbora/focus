import { ClientLogPayload, LogLevel, AppLogsResult, SystemDiagnostics } from '../../../shared/types'
import { SUPPORT_EMAIL } from '../../../shared/config'

class RendererLogger {
  private static instance: RendererLogger
  private isHooked = false
  private lastLoggedMessage = ''
  private lastLoggedTime = 0

  private originalConsole = {
    error: console.error.bind(console),
    warn: console.warn.bind(console)
  }

  private constructor() {
    this.initHooks()
  }

  public static getInstance(): RendererLogger {
    if (!RendererLogger.instance) {
      RendererLogger.instance = new RendererLogger()
    }
    return RendererLogger.instance
  }

  private shouldThrottle(msg: string): boolean {
    const now = Date.now()
    if (this.lastLoggedMessage === msg && now - this.lastLoggedTime < 1000) {
      return true
    }
    this.lastLoggedMessage = msg
    this.lastLoggedTime = now
    return false
  }

  private sendToMain(payload: ClientLogPayload): void {
    try {
      if (typeof window !== 'undefined' && window.api?.diagnostics) {
        window.api.diagnostics.logClientMessage(payload)
      }
    } catch {
      // Ignore IPC transmission issues
    }
  }

  private initHooks(): void {
    if (this.isHooked || typeof window === 'undefined') return
    this.isHooked = true

    // Intercept unhandled JavaScript errors in window
    window.addEventListener('error', (event: ErrorEvent) => {
      const errorMsg = event.message || 'Unknown window error'
      const errorStack = event.error?.stack || `${event.filename}:${event.lineno}:${event.colno}`
      if (!this.shouldThrottle(errorMsg)) {
        this.sendToMain({
          level: 'error',
          tag: 'window:error',
          message: errorMsg,
          details: errorStack,
          timestamp: new Date().toISOString()
        })
      }
    })

    // Intercept unhandled promise rejections
    window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
      const reason = event.reason
      const errorMsg =
        reason instanceof Error
          ? reason.message
          : typeof reason === 'string'
            ? reason
            : 'Unhandled promise rejection'
      const errorStack = reason instanceof Error ? reason.stack : JSON.stringify(reason)

      if (!this.shouldThrottle(errorMsg)) {
        this.sendToMain({
          level: 'error',
          tag: 'window:unhandledrejection',
          message: errorMsg,
          details: errorStack,
          timestamp: new Date().toISOString()
        })
      }
    })

    // Wrap console.error
    console.error = (...args: unknown[]) => {
      this.originalConsole.error(...args)
      const msg = args.map((a) => (a instanceof Error ? a.stack || a.message : String(a))).join(' ')
      if (!this.shouldThrottle(msg)) {
        this.sendToMain({
          level: 'error',
          tag: 'console:error',
          message: msg,
          timestamp: new Date().toISOString()
        })
      }
    }

    // Wrap console.warn
    console.warn = (...args: unknown[]) => {
      this.originalConsole.warn(...args)
      const msg = args.map((a) => (a instanceof Error ? a.stack || a.message : String(a))).join(' ')
      if (!this.shouldThrottle(msg)) {
        this.sendToMain({
          level: 'warn',
          tag: 'console:warn',
          message: msg,
          timestamp: new Date().toISOString()
        })
      }
    }
  }

  public log(level: LogLevel, tag: string, message: string, details?: unknown): void {
    let detailsStr: string | undefined
    if (details instanceof Error) {
      detailsStr = details.stack || details.message
    } else if (details !== undefined && details !== null) {
      try {
        detailsStr = typeof details === 'string' ? details : JSON.stringify(details)
      } catch {
        detailsStr = String(details)
      }
    }

    this.sendToMain({
      level,
      tag,
      message,
      details: detailsStr,
      timestamp: new Date().toISOString()
    })
  }

  public debug(tag: string, message: string, details?: unknown): void {
    this.log('debug', tag, message, details)
  }

  public info(tag: string, message: string, details?: unknown): void {
    this.log('info', tag, message, details)
  }

  public warn(tag: string, message: string, details?: unknown): void {
    this.log('warn', tag, message, details)
  }

  public error(tag: string, message: string, details?: unknown): void {
    this.log('error', tag, message, details)
  }

  // Diagnostics & Log Management APIs
  public async getAppLogs(limit = 150): Promise<AppLogsResult> {
    if (window.api?.diagnostics) {
      return (await window.api.diagnostics.getLogs(limit)) as unknown as AppLogsResult
    }
    return {
      lines: [],
      logFilePath: '',
      logFileSize: 0,
      logFileSizeFormatted: '0 B'
    }
  }

  public async getDiagnostics(): Promise<SystemDiagnostics | null> {
    if (window.api?.diagnostics) {
      return await window.api.diagnostics.getSystemDiagnostics()
    }
    return null
  }

  public async openLogsFolder(): Promise<boolean> {
    if (window.api?.diagnostics) {
      return await window.api.diagnostics.openLogsFolder()
    }
    return false
  }

  public async clearLogs(): Promise<boolean> {
    if (window.api?.diagnostics) {
      return await window.api.diagnostics.clearLogs()
    }
    return false
  }

  public async openGitHubIssue(
    customDescription?: string
  ): Promise<{ success: boolean; report: string }> {
    if (window.api?.diagnostics) {
      return await window.api.diagnostics.openGitHubIssue(customDescription)
    }
    const report = await this.generateEmailReport(customDescription)
    try {
      await navigator.clipboard.writeText(report)
    } catch {
      // ignore
    }
    const body =
      report.length > 3500
        ? `${report.slice(0, 3500)}\n\n[...remaining logs truncated; full report copied to clipboard...]`
        : report
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(SUPPORT_EMAIL)}&su=${encodeURIComponent('[Bug Report] Focus Desktop')}&body=${encodeURIComponent(body)}`
    window.open(gmailUrl, '_blank')
    return { success: true, report }
  }

  public async generateEmailReport(customDescription?: string): Promise<string> {
    const diag = await this.getDiagnostics()

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
      `App Version: Focus v${diag?.appVersion || '1.0.0'}`,
      `OS: ${diag?.osRelease || navigator.platform} (${diag?.platform || ''} ${diag?.arch || ''})`,
      `Electron: ${diag?.electronVersion || 'unknown'} | Chrome: ${diag?.chromeVersion || 'unknown'} | Node: ${diag?.nodeVersion || 'unknown'}`,
      `App Uptime: ${diag?.uptimeSeconds || 0}s | Memory: ${diag?.memoryUsageMB || 0} MB`,
      diag?.logFilePath ? `Log File: ${diag.logFilePath}` : '',
      '',
      'Attachments:',
      '--------------------------------------------------',
      'focus.log (File Explorer has been opened with focus.log selected — please drag & drop it here)',
      ''
    ]
      .filter((line) => line !== undefined)
      .join('\n')
  }

  public async generateGitHubIssueMarkdown(customDescription?: string): Promise<string> {
    const [diag, logs] = await Promise.all([this.getDiagnostics(), this.getAppLogs(100)])

    const recentLogs = logs.lines.join('\n')

    return [
      '### Describe the Issue',
      customDescription ||
        '<!-- A clear and concise description of what you were doing and what went wrong. -->',
      '',
      '### Steps to Reproduce',
      '1. Open Focus',
      '2. Action: ...',
      '3. Observe error: ...',
      '',
      '### Expected Behavior',
      '<!-- What you expected to happen. -->',
      '',
      '### Actual Behavior',
      '<!-- What actually happened. -->',
      '',
      '### Environment & Diagnostics',
      diag ? `- **Focus Version:** v${diag.appVersion}` : '- **Focus Version:** 1.0.0',
      diag ? `- **Operating System:** ${diag.osRelease} (${diag.platform} ${diag.arch})` : '',
      diag ? `- **Electron:** ${diag.electronVersion}` : '',
      diag ? `- **Chrome:** ${diag.chromeVersion}` : '',
      diag ? `- **Node:** ${diag.nodeVersion}` : '',
      diag ? `- **Uptime:** ${diag.uptimeSeconds} seconds` : '',
      diag ? `- **Log File Path:** \`${diag.logFilePath}\`` : '',
      '',
      '<details>',
      '<summary><b>Diagnostic Logs (Last 100 lines)</b></summary>',
      '',
      '```log',
      recentLogs || 'No logs recorded.',
      '```',
      '</details>',
      ''
    ]
      .filter((line) => line !== undefined)
      .join('\n')
  }
}

export const logger = RendererLogger.getInstance()
