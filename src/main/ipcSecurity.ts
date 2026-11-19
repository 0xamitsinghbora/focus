import { BrowserWindow, ipcMain } from 'electron'
import { SessionTimerPayload } from '../shared/types'

type AllowedSenderRole = 'main' | 'main_or_prompt' | 'app'

interface SecurityContext {
  assertSenderIsMainWindow: (event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent) => void
  assertSenderIsMainWindowOrPrompt: (
    event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent
  ) => void
  assertSenderIsAppWindow: (event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent) => void
}

/**
 * Standardized declarative IPC dispatcher that validates sender authority
 * before delegating to the controller handler.
 */
export function handleSecure<TReq = unknown, TRes = unknown>(
  channel: string,
  role: AllowedSenderRole,
  security: SecurityContext,
  handler: (event: Electron.IpcMainInvokeEvent, payload: TReq) => Promise<TRes> | TRes
): void {
  ipcMain.handle(channel, async (event, payload: TReq) => {
    switch (role) {
      case 'main':
        security.assertSenderIsMainWindow(event)
        break
      case 'main_or_prompt':
        security.assertSenderIsMainWindowOrPrompt(event)
        break
      case 'app':
        security.assertSenderIsAppWindow(event)
        break
    }
    try {
      return await handler(event, payload)
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        (err.message.includes('database connection is not open') ||
          err.message.includes('database is closed') ||
          err.message.includes('not open'))
      ) {
        return null as unknown as TRes
      }
      throw err
    }
  })
}

export function resolveSenderWindow(
  event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent
): BrowserWindow | null {
  if (!event || !event.sender) return null

  try {
    const fromWc = BrowserWindow.fromWebContents(event.sender)
    if (fromWc && !fromWc.isDestroyed()) return fromWc
  } catch {
    // ignore
  }

  try {
    const getOwner = (event.sender as { getOwnerBrowserWindow?: () => BrowserWindow | null })
      .getOwnerBrowserWindow
    if (typeof getOwner === 'function') {
      const owner = getOwner.call(event.sender)
      if (owner && !owner.isDestroyed()) return owner
    }
  } catch {
    // ignore
  }

  try {
    const all = BrowserWindow.getAllWindows()
    for (const win of all) {
      if (!win || win.isDestroyed()) continue
      try {
        if (win.webContents && !win.webContents.isDestroyed()) {
          if (
            win.webContents === event.sender ||
            (typeof event.sender.id === 'number' && win.webContents.id === event.sender.id)
          ) {
            return win
          }
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }

  return null
}

export function isMatchingWindow(
  win: BrowserWindow | null | undefined,
  senderWin: BrowserWindow | null | undefined,
  sender: Electron.WebContents
): boolean {
  if (!win || win.isDestroyed()) return false
  if (
    senderWin &&
    (senderWin === win || (typeof senderWin.id === 'number' && senderWin.id === win.id))
  ) {
    return true
  }
  try {
    if (win.webContents && !win.webContents.isDestroyed()) {
      if (
        sender === win.webContents ||
        (typeof sender?.id === 'number' && sender.id === win.webContents.id)
      ) {
        return true
      }
    }
  } catch {
    // ignore
  }
  return false
}

function isFrameDisallowed(
  senderFrame: Electron.WebFrameMain | undefined | null,
  targetWindow: BrowserWindow | null | undefined
): boolean {
  if (!senderFrame) return false
  if (senderFrame.parent !== null && senderFrame.parent !== undefined) {
    return true
  }
  if (senderFrame.top && senderFrame.top !== senderFrame) {
    return true
  }
  try {
    if (
      targetWindow?.webContents?.mainFrame &&
      senderFrame !== targetWindow.webContents.mainFrame &&
      (senderFrame.parent !== null || (senderFrame.top && senderFrame.top !== senderFrame))
    ) {
      return true
    }
  } catch {
    // ignore
  }
  return false
}

export function detectWindowRole(
  win: BrowserWindow | null | undefined,
  sender: Electron.WebContents | null | undefined,
  frame?: Electron.WebFrameMain | null
): 'main' | 'prompt' | 'widget' | null {
  const urls: string[] = []
  try {
    if (sender && typeof sender.getURL === 'function') {
      const u = sender.getURL()
      if (u) urls.push(u)
    }
  } catch {
    // ignore
  }
  try {
    if (
      frame &&
      typeof (frame as { url?: string }).url === 'string' &&
      (frame as { url?: string }).url
    ) {
      urls.push((frame as { url: string }).url)
    }
  } catch {
    // ignore
  }
  try {
    if (
      win &&
      !win.isDestroyed() &&
      win.webContents &&
      typeof win.webContents.getURL === 'function'
    ) {
      const u = win.webContents.getURL()
      if (u) urls.push(u)
    }
  } catch {
    // ignore
  }

  for (const url of urls) {
    const lower = url.split('?')[0].split('#')[0].toLowerCase()
    const devUrl = process.env['ELECTRON_RENDERER_URL']?.toLowerCase()
    const isLocalhost =
      lower.startsWith('http://localhost:') ||
      lower.startsWith('http://127.0.0.1:') ||
      lower.startsWith('https://localhost:') ||
      lower.startsWith('https://127.0.0.1:')

    const isAppOrigin =
      lower.startsWith('file:') || isLocalhost || (Boolean(devUrl) && lower.startsWith(devUrl!))
    if (!isAppOrigin) {
      continue
    }

    if (lower.includes('widget.html') || lower.endsWith('/widget')) {
      return 'widget'
    }
    if (lower.includes('prompt.html') || lower.endsWith('/prompt')) {
      return 'prompt'
    }
    if (lower.includes('index.html')) {
      return 'main'
    }
    if (devUrl && (lower === devUrl || lower === `${devUrl}/`)) {
      return 'main'
    }
  }

  return null
}

function checkSenderFrame(
  event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent,
  targetWindow?: BrowserWindow | null
): void {
  if (event.senderFrame && isFrameDisallowed(event.senderFrame, targetWindow)) {
    throw new Error('Unauthorized IPC sender: request from non-main frame')
  }
}

export function assertSenderIsMainWindow(
  event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent,
  getMainWindow: () => BrowserWindow | null
): void {
  if (!event || !event.sender) {
    throw new Error('Unauthorized IPC sender: event or sender missing')
  }
  let mainWindow = typeof getMainWindow === 'function' ? getMainWindow() : null
  const senderWin = resolveSenderWindow(event)

  let isMain = isMatchingWindow(mainWindow, senderWin, event.sender)
  if (isMain) {
    checkSenderFrame(event, mainWindow)
    return
  }

  const detectedRole = detectWindowRole(senderWin, event.sender, event.senderFrame)
  if (detectedRole === 'main') {
    isMain = true
    if (!mainWindow && senderWin) mainWindow = senderWin
  }

  if (
    !isMain &&
    (!mainWindow || mainWindow.isDestroyed()) &&
    senderWin &&
    !senderWin.isDestroyed()
  ) {
    try {
      const all = BrowserWindow.getAllWindows()
      if (all.includes(senderWin)) {
        mainWindow = senderWin
        isMain = true
      }
    } catch {
      // ignore
    }
  }

  if (!mainWindow || mainWindow.isDestroyed()) {
    throw new Error('Unauthorized IPC sender: main window unavailable')
  }
  if (!isMatchingWindow(mainWindow, senderWin, event.sender) && !isMain) {
    throw new Error('Unauthorized IPC sender')
  }

  checkSenderFrame(event, mainWindow)
}

export function assertSenderIsMainWindowOrPrompt(
  event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent,
  getMainWindow: () => BrowserWindow | null,
  getPromptWindow?: () => BrowserWindow | null
): void {
  if (!event || !event.sender) {
    throw new Error('Unauthorized IPC sender: event or sender missing')
  }
  let mainWindow = typeof getMainWindow === 'function' ? getMainWindow() : null
  let promptWin = typeof getPromptWindow === 'function' ? getPromptWindow() : null
  const senderWin = resolveSenderWindow(event)

  let isMain = isMatchingWindow(mainWindow, senderWin, event.sender)
  let isPrompt = isMatchingWindow(promptWin, senderWin, event.sender)

  if (isMain || isPrompt) {
    checkSenderFrame(event, isMain ? mainWindow : promptWin)
    return
  }

  const detectedRole = detectWindowRole(senderWin, event.sender, event.senderFrame)
  if (detectedRole === 'main') {
    isMain = true
    if (!mainWindow && senderWin) mainWindow = senderWin
  } else if (detectedRole === 'prompt') {
    isPrompt = true
    if (!promptWin && senderWin) promptWin = senderWin
  }

  if (isMain || isPrompt) {
    checkSenderFrame(event, isMain ? mainWindow : promptWin)
    return
  }

  if (!isMain && !isPrompt && senderWin && !senderWin.isDestroyed()) {
    try {
      const all = BrowserWindow.getAllWindows()
      if (all.includes(senderWin)) {
        if (!promptWin && typeof getPromptWindow === 'function') {
          promptWin = getPromptWindow()
          if (isMatchingWindow(promptWin, senderWin, event.sender)) {
            isPrompt = true
          }
        }
        if (!isPrompt && (!mainWindow || mainWindow.isDestroyed()) && senderWin !== promptWin) {
          mainWindow = senderWin
          isMain = true
        }
      }
    } catch {
      // ignore
    }
  }

  if (!isMain && !isPrompt) {
    throw new Error('Unauthorized IPC sender: neither main nor prompt window')
  }

  checkSenderFrame(event, isMain ? mainWindow : promptWin)
}

export function assertSenderIsAppWindow(
  event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent,
  getMainWindow: () => BrowserWindow | null,
  getPromptWindow?: () => BrowserWindow | null,
  getWidgetWindow?: () => BrowserWindow | null
): void {
  if (!event || !event.sender) {
    throw new Error('Unauthorized IPC sender: event or sender missing')
  }
  let mainWindow = typeof getMainWindow === 'function' ? getMainWindow() : null
  let promptWin = typeof getPromptWindow === 'function' ? getPromptWindow() : null
  let widgetWin = typeof getWidgetWindow === 'function' ? getWidgetWindow() : null
  let senderWin = resolveSenderWindow(event)
  let isMain = isMatchingWindow(mainWindow, senderWin, event.sender)
  let isPrompt = isMatchingWindow(promptWin, senderWin, event.sender)
  let isWidget = isMatchingWindow(widgetWin, senderWin, event.sender)

  if (isMain || isPrompt || isWidget) {
    checkSenderFrame(event, isMain ? mainWindow : isPrompt ? promptWin : widgetWin)
    return
  }

  const detectedRole = detectWindowRole(senderWin, event.sender, event.senderFrame)
  if (detectedRole === 'widget') {
    isWidget = true
    if (!widgetWin && senderWin) widgetWin = senderWin
  } else if (detectedRole === 'prompt') {
    isPrompt = true
    if (!promptWin && senderWin) promptWin = senderWin
  } else if (detectedRole === 'main') {
    isMain = true
    if (!mainWindow && senderWin) mainWindow = senderWin
  }

  if (isMain || isPrompt || isWidget) {
    checkSenderFrame(event, isMain ? mainWindow : isPrompt ? promptWin : widgetWin)
    return
  }

  if (!isMain && !isPrompt && !isWidget) {
    try {
      const all = BrowserWindow.getAllWindows()
      if (!senderWin) {
        senderWin = all.find((w) => isMatchingWindow(w, null, event.sender)) || null
      }

      if (senderWin && !senderWin.isDestroyed() && all.includes(senderWin)) {
        if (!promptWin && typeof getPromptWindow === 'function') {
          promptWin = getPromptWindow()
          isPrompt = isMatchingWindow(promptWin, senderWin, event.sender)
        }
        if (!isPrompt && !widgetWin && typeof getWidgetWindow === 'function') {
          widgetWin = getWidgetWindow()
          isWidget = isMatchingWindow(widgetWin, senderWin, event.sender)
        }
        if (!isMain && typeof getMainWindow === 'function') {
          mainWindow = getMainWindow()
          if (isMatchingWindow(mainWindow, senderWin, event.sender)) {
            isMain = true
          }
        }
        if (!isPrompt && !isWidget && !isMain) {
          const role = detectWindowRole(senderWin, event.sender, event.senderFrame)
          if (role === 'widget') isWidget = true
          else if (role === 'prompt') isPrompt = true
          else if (role === 'main') isMain = true
        }
        if (!isPrompt && !isWidget && !isMain && (!mainWindow || mainWindow.isDestroyed())) {
          if (senderWin !== promptWin && senderWin !== widgetWin) {
            mainWindow = senderWin
            isMain = true
          }
        }
      }
    } catch {
      // ignore
    }
  }

  if (!isMain && !isPrompt && !isWidget) {
    throw new Error('Unauthorized IPC sender: unknown window')
  }

  checkSenderFrame(event, isMain ? mainWindow : isPrompt ? promptWin : widgetWin)
}

export function isValidSessionTimerPayload(payload: unknown): payload is SessionTimerPayload {
  if (!payload || typeof payload !== 'object') return false
  const p = payload as Partial<SessionTimerPayload>
  if (
    typeof p.isActive !== 'boolean' ||
    typeof p.isPaused !== 'boolean' ||
    typeof p.isBreak !== 'boolean' ||
    typeof p.isOvertime !== 'boolean' ||
    typeof p.secondsRemaining !== 'number' ||
    !Number.isFinite(p.secondsRemaining) ||
    typeof p.totalSeconds !== 'number' ||
    !Number.isFinite(p.totalSeconds)
  ) {
    return false
  }
  if (p.badgeDataUrl !== undefined && p.badgeDataUrl !== null) {
    if (
      typeof p.badgeDataUrl !== 'string' ||
      (p.badgeDataUrl.length > 0 && !p.badgeDataUrl.startsWith('data:image/')) ||
      p.badgeDataUrl.length > 300000
    ) {
      return false
    }
  }
  if (p.goalId !== undefined && p.goalId !== null && typeof p.goalId !== 'string') {
    return false
  }
  if (p.goalTitle !== undefined && p.goalTitle !== null && typeof p.goalTitle !== 'string') {
    return false
  }
  if (p.startedAt !== undefined && p.startedAt !== null && typeof p.startedAt !== 'string') {
    return false
  }
  if (
    p.accumulatedPausedMs !== undefined &&
    p.accumulatedPausedMs !== null &&
    (typeof p.accumulatedPausedMs !== 'number' || !Number.isFinite(p.accumulatedPausedMs))
  ) {
    return false
  }
  if (
    p.pauseStartEpoch !== undefined &&
    p.pauseStartEpoch !== null &&
    (typeof p.pauseStartEpoch !== 'number' || !Number.isFinite(p.pauseStartEpoch))
  ) {
    return false
  }
  if (
    p.sessionNote !== undefined &&
    p.sessionNote !== null &&
    (typeof p.sessionNote !== 'string' || p.sessionNote.length > 10000)
  ) {
    return false
  }
  if (p.isAfk !== undefined && p.isAfk !== null && typeof p.isAfk !== 'boolean') {
    return false
  }
  if (
    p.afkBreakStartEpoch !== undefined &&
    p.afkBreakStartEpoch !== null &&
    (typeof p.afkBreakStartEpoch !== 'number' || !Number.isFinite(p.afkBreakStartEpoch))
  ) {
    return false
  }
  return true
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

export function isValidDateString(date: unknown): date is string {
  return typeof date === 'string' && DATE_REGEX.test(date)
}

export function isValidId(id: unknown): id is string {
  return typeof id === 'string' && id.trim().length > 0 && id.length <= 256
}

export function isValidIdArray(arr: unknown): arr is string[] {
  return Array.isArray(arr) && arr.every((item) => isValidId(item))
}

export function isValidGoalObject(goal: unknown): boolean {
  if (!goal || typeof goal !== 'object') return false
  const g = goal as Record<string, unknown>
  return isValidId(g.id)
}
