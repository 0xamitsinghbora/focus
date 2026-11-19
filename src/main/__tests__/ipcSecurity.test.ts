import { describe, it, expect, vi } from 'vitest'
import { BrowserWindow, ipcMain } from 'electron'
import {
  isMatchingWindow,
  resolveSenderWindow,
  detectWindowRole,
  assertSenderIsMainWindow,
  assertSenderIsMainWindowOrPrompt,
  assertSenderIsAppWindow,
  isValidSessionTimerPayload,
  isValidDateString,
  isValidId,
  isValidIdArray,
  isValidGoalObject,
  handleSecure
} from '../ipcSecurity'

describe('ipcSecurity', () => {
  const createMockWin = (id: number) => {
    const mainFrame = {}
    const webContents = {
      id,
      isDestroyed: vi.fn().mockReturnValue(false),
      mainFrame
    }
    return {
      id,
      isDestroyed: vi.fn().mockReturnValue(false),
      webContents
    } as unknown as BrowserWindow
  }

  describe('isMatchingWindow', () => {
    it('returns true when senderWin matches win', () => {
      const win = createMockWin(1)
      expect(isMatchingWindow(win, win, win.webContents)).toBe(true)
    })

    it('returns true when sender webContents matches win webContents', () => {
      const win = createMockWin(1)
      expect(isMatchingWindow(win, null, win.webContents)).toBe(true)
    })

    it('returns false when win is destroyed or null', () => {
      const win = createMockWin(1)
      ;(win.isDestroyed as any).mockReturnValue(true)
      expect(isMatchingWindow(win, win, win.webContents)).toBe(false)
      expect(isMatchingWindow(null, null, {} as any)).toBe(false)
    })

    it('returns false when windows differ', () => {
      const win1 = createMockWin(1)
      const win2 = createMockWin(2)
      expect(isMatchingWindow(win1, win2, win2.webContents)).toBe(false)
    })
  })

  describe('assertSenderIsMainWindow', () => {
    it('allows valid main window and main frame', () => {
      const win = createMockWin(1)
      ;(BrowserWindow as any).fromWebContents = vi.fn().mockReturnValue(win)

      const event = {
        sender: win.webContents,
        senderFrame: win.webContents.mainFrame
      } as any

      expect(() => assertSenderIsMainWindow(event, () => win)).not.toThrow()
    })

    it('throws when main window is unavailable', () => {
      const event = { sender: {} } as any
      expect(() => assertSenderIsMainWindow(event, () => null)).toThrow(
        'Unauthorized IPC sender: main window unavailable'
      )
    })

    it('throws when sender is not main window', () => {
      const win = createMockWin(1)
      const otherWin = createMockWin(2)
      ;(BrowserWindow as any).fromWebContents = vi.fn().mockReturnValue(otherWin)

      const event = { sender: otherWin.webContents } as any
      expect(() => assertSenderIsMainWindow(event, () => win)).toThrow('Unauthorized IPC sender')
    })

    it('throws when senderFrame is an iframe', () => {
      const win = createMockWin(1)
      ;(BrowserWindow as any).fromWebContents = vi.fn().mockReturnValue(win)

      const subFrame = { parent: win.webContents.mainFrame }
      const event = {
        sender: win.webContents,
        senderFrame: subFrame
      } as any

      expect(() => assertSenderIsMainWindow(event, () => win)).toThrow(
        'Unauthorized IPC sender: request from non-main frame'
      )
    })
  })

  describe('assertSenderIsMainWindowOrPrompt', () => {
    it('allows both main and prompt windows', () => {
      const mainWin = createMockWin(1)
      const promptWin = createMockWin(2)

      ;(BrowserWindow as any).fromWebContents = vi.fn().mockImplementation((wc) => {
        if (wc === mainWin.webContents) return mainWin
        if (wc === promptWin.webContents) return promptWin
        return null
      })

      const mainEvent = {
        sender: mainWin.webContents,
        senderFrame: mainWin.webContents.mainFrame
      } as any
      const promptEvent = {
        sender: promptWin.webContents,
        senderFrame: promptWin.webContents.mainFrame
      } as any

      expect(() =>
        assertSenderIsMainWindowOrPrompt(
          mainEvent,
          () => mainWin,
          () => promptWin
        )
      ).not.toThrow()

      expect(() =>
        assertSenderIsMainWindowOrPrompt(
          promptEvent,
          () => mainWin,
          () => promptWin
        )
      ).not.toThrow()
    })

    it('throws when sender is neither main nor prompt', () => {
      const mainWin = createMockWin(1)
      const promptWin = createMockWin(2)
      const thirdWin = createMockWin(3)

      ;(BrowserWindow as any).fromWebContents = vi.fn().mockReturnValue(thirdWin)
      const event = { sender: thirdWin.webContents } as any

      expect(() =>
        assertSenderIsMainWindowOrPrompt(
          event,
          () => mainWin,
          () => promptWin
        )
      ).toThrow('Unauthorized IPC sender: neither main nor prompt window')
    })
  })

  describe('assertSenderIsAppWindow', () => {
    it('allows main, prompt, or widget window', () => {
      const mainWin = createMockWin(1)
      const promptWin = createMockWin(2)
      const widgetWin = createMockWin(3)

      ;(BrowserWindow as any).fromWebContents = vi.fn().mockImplementation((wc) => {
        if (wc === mainWin.webContents) return mainWin
        if (wc === promptWin.webContents) return promptWin
        if (wc === widgetWin.webContents) return widgetWin
        return null
      })

      const widgetEvent = {
        sender: widgetWin.webContents,
        senderFrame: widgetWin.webContents.mainFrame
      } as any

      expect(() =>
        assertSenderIsAppWindow(
          widgetEvent,
          () => mainWin,
          () => promptWin,
          () => widgetWin
        )
      ).not.toThrow()
    })

    it('rejects foreign window', () => {
      const mainWin = createMockWin(1)
      const foreignWin = createMockWin(99)

      ;(BrowserWindow as any).fromWebContents = vi.fn().mockReturnValue(foreignWin)
      const event = { sender: foreignWin.webContents } as any

      expect(() => assertSenderIsAppWindow(event, () => mainWin)).toThrow(
        'Unauthorized IPC sender: unknown window'
      )
    })

    it('allows sender when fromWebContents returns null but getAllWindows resolves the window', () => {
      const mainWin = createMockWin(1)
      ;(BrowserWindow as any).fromWebContents = vi.fn().mockReturnValue(null)
      ;(BrowserWindow as any).getAllWindows = vi.fn().mockReturnValue([mainWin])

      const event = {
        sender: mainWin.webContents,
        senderFrame: { parent: null }
      } as any

      expect(() => assertSenderIsAppWindow(event, () => mainWin)).not.toThrow()
    })

    it('allows sender using getOwnerBrowserWindow when fromWebContents is null', () => {
      const mainWin = createMockWin(1)
      ;(BrowserWindow as any).fromWebContents = vi.fn().mockReturnValue(null)
      ;(BrowserWindow as any).getAllWindows = vi.fn().mockReturnValue([])

      const event = {
        sender: {
          ...mainWin.webContents,
          getOwnerBrowserWindow: vi.fn().mockReturnValue(mainWin)
        },
        senderFrame: { parent: null }
      } as any

      expect(() => assertSenderIsAppWindow(event, () => mainWin)).not.toThrow()
    })

    it('allows top-level main frame during reload when senderFrame.parent is null', () => {
      const mainWin = createMockWin(1)
      ;(BrowserWindow as any).fromWebContents = vi.fn().mockReturnValue(mainWin)

      const reloadedFrame = { parent: null, top: null }
      ;(reloadedFrame as any).top = reloadedFrame

      const event = {
        sender: mainWin.webContents,
        senderFrame: reloadedFrame
      } as any

      expect(() => assertSenderIsAppWindow(event, () => mainWin)).not.toThrow()
    })

    it('rejects request from non-main frame (iframe) in assertSenderIsAppWindow', () => {
      const mainWin = createMockWin(1)
      ;(BrowserWindow as any).fromWebContents = vi.fn().mockReturnValue(mainWin)

      const subFrame = { parent: mainWin.webContents.mainFrame }
      const event = {
        sender: mainWin.webContents,
        senderFrame: subFrame
      } as any

      expect(() => assertSenderIsAppWindow(event, () => mainWin)).toThrow(
        'Unauthorized IPC sender: request from non-main frame'
      )
    })

    it('allows widget window sender detected via URL even when getWidgetWindow returns null', () => {
      const mainWin = createMockWin(1)
      const widgetWin = createMockWin(3)
      ;(widgetWin.webContents as any).getURL = vi
        .fn()
        .mockReturnValue('http://localhost:5173/widget.html')
      ;(BrowserWindow as any).fromWebContents = vi.fn().mockReturnValue(widgetWin)

      const event = {
        sender: widgetWin.webContents,
        senderFrame: { parent: null }
      } as any

      expect(() =>
        assertSenderIsAppWindow(
          event,
          () => mainWin,
          () => null,
          () => null
        )
      ).not.toThrow()
    })

    it('allows prompt window sender detected via URL even when getPromptWindow returns null', () => {
      const mainWin = createMockWin(1)
      const promptWin = createMockWin(2)
      ;(promptWin.webContents as any).getURL = vi
        .fn()
        .mockReturnValue('http://localhost:5173/prompt.html')
      ;(BrowserWindow as any).fromWebContents = vi.fn().mockReturnValue(promptWin)

      const event = {
        sender: promptWin.webContents,
        senderFrame: { parent: null }
      } as any

      expect(() =>
        assertSenderIsAppWindow(
          event,
          () => mainWin,
          () => null,
          () => null
        )
      ).not.toThrow()
    })
  })

  describe('detectWindowRole', () => {
    it('detects widget from URL containing widget.html', () => {
      const sender = { getURL: () => 'file:///app/renderer/widget.html' } as any
      expect(detectWindowRole(null, sender)).toBe('widget')
    })

    it('detects prompt from URL containing prompt.html', () => {
      const sender = { getURL: () => 'http://localhost:5173/prompt.html' } as any
      expect(detectWindowRole(null, sender)).toBe('prompt')
    })

    it('detects main from URL containing index.html or dev root', () => {
      const originalEnv = process.env['ELECTRON_RENDERER_URL']
      ;(process.env as Record<string, string | undefined>)['ELECTRON_RENDERER_URL'] =
        'http://localhost:5173'
      try {
        const sender = { getURL: () => 'http://localhost:5173/' } as any
        expect(detectWindowRole(null, sender)).toBe('main')

        const senderFile = { getURL: () => 'file:///app/renderer/index.html' } as any
        expect(detectWindowRole(null, senderFile)).toBe('main')
      } finally {
        if (originalEnv === undefined) {
          delete (process.env as Record<string, string | undefined>)['ELECTRON_RENDERER_URL']
        } else {
          ;(process.env as Record<string, string | undefined>)['ELECTRON_RENDERER_URL'] =
            originalEnv
        }
      }
    })

    it('returns null for unknown or empty URL', () => {
      const sender = { getURL: () => 'http://malicious.site/index.html' } as any
      expect(detectWindowRole(null, sender)).toBeNull()
    })
  })

  describe('resolveSenderWindow', () => {
    it('returns null when event or sender is missing', () => {
      expect(resolveSenderWindow(null as any)).toBeNull()
      expect(resolveSenderWindow({} as any)).toBeNull()
    })

    it('resolves from BrowserWindow.fromWebContents when available', () => {
      const win = createMockWin(1)
      ;(BrowserWindow as any).fromWebContents = vi.fn().mockReturnValue(win)
      expect(resolveSenderWindow({ sender: win.webContents } as any)).toBe(win)
    })

    it('falls back to getAllWindows searching by webContents id', () => {
      const win = createMockWin(42)
      ;(BrowserWindow as any).fromWebContents = vi.fn().mockReturnValue(null)
      ;(BrowserWindow as any).getAllWindows = vi.fn().mockReturnValue([win])

      const diffSenderInstance = { id: 42, isDestroyed: () => false }
      expect(resolveSenderWindow({ sender: diffSenderInstance } as any)).toBe(win)
    })
  })

  describe('isValidSessionTimerPayload', () => {
    it('validates a correct payload', () => {
      const valid = {
        isActive: true,
        isPaused: false,
        isBreak: false,
        isOvertime: false,
        secondsRemaining: 1500,
        totalSeconds: 1500,
        badgeDataUrl:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        goalId: 'goal-123',
        goalTitle: 'Engineering Audit'
      }
      expect(isValidSessionTimerPayload(valid)).toBe(true)
    })

    it('rejects non-object or missing booleans', () => {
      expect(isValidSessionTimerPayload(null)).toBe(false)
      expect(isValidSessionTimerPayload(undefined)).toBe(false)
      expect(isValidSessionTimerPayload('bad')).toBe(false)
      expect(isValidSessionTimerPayload({ isActive: 'yes' })).toBe(false)
    })

    it('rejects non-finite or missing seconds', () => {
      const base = {
        isActive: true,
        isPaused: false,
        isBreak: false,
        isOvertime: false,
        secondsRemaining: NaN,
        totalSeconds: 1500
      }
      expect(isValidSessionTimerPayload(base)).toBe(false)
      expect(isValidSessionTimerPayload({ ...base, secondsRemaining: Infinity })).toBe(false)
      expect(
        isValidSessionTimerPayload({ ...base, secondsRemaining: 1500, totalSeconds: NaN })
      ).toBe(false)
    })

    it('rejects non-data URLs or oversized badgeDataUrl', () => {
      const base = {
        isActive: true,
        isPaused: false,
        isBreak: false,
        isOvertime: false,
        secondsRemaining: 100,
        totalSeconds: 100
      }
      expect(
        isValidSessionTimerPayload({ ...base, badgeDataUrl: 'http://malicious.com/evil.png' })
      ).toBe(false)
      expect(isValidSessionTimerPayload({ ...base, badgeDataUrl: 'javascript:alert(1)' })).toBe(
        false
      )
      expect(
        isValidSessionTimerPayload({
          ...base,
          badgeDataUrl: 'data:image/png;base64,' + 'a'.repeat(350000)
        })
      ).toBe(false)
      expect(isValidSessionTimerPayload({ ...base, sessionNote: 'valid note' })).toBe(true)
      expect(isValidSessionTimerPayload({ ...base, sessionNote: 123 as any })).toBe(false)
      expect(isValidSessionTimerPayload({ ...base, sessionNote: 'a'.repeat(15000) })).toBe(false)
      expect(isValidSessionTimerPayload({ ...base, pauseStartEpoch: Date.now() })).toBe(true)
      expect(isValidSessionTimerPayload({ ...base, pauseStartEpoch: NaN })).toBe(false)
      expect(isValidSessionTimerPayload({ ...base, pauseStartEpoch: Infinity })).toBe(false)
      expect(isValidSessionTimerPayload({ ...base, pauseStartEpoch: '12345' as any })).toBe(false)
    })
    it('rejects events missing sender or undefined event', () => {
      const win = createMockWin(1)
      expect(() => assertSenderIsMainWindow(undefined as any, () => win)).toThrow('missing')
      expect(() => assertSenderIsMainWindow({} as any, () => win)).toThrow('missing')
      expect(() => assertSenderIsMainWindowOrPrompt(undefined as any, () => win)).toThrow('missing')
      expect(() => assertSenderIsMainWindowOrPrompt({} as any, () => win)).toThrow('missing')
      expect(() => assertSenderIsAppWindow(undefined as any, () => win)).toThrow('missing')
      expect(() => assertSenderIsAppWindow({} as any, () => win)).toThrow('missing')
    })

    it('validates date strings correctly', () => {
      expect(isValidDateString('2026-11-01')).toBe(true)
      expect(isValidDateString('2026-02-28')).toBe(true)
      expect(isValidDateString('2026-1-1')).toBe(false)
      expect(isValidDateString('invalid')).toBe(false)
      expect(isValidDateString(null)).toBe(false)
      expect(isValidDateString(undefined)).toBe(false)
      expect(isValidDateString(123)).toBe(false)
    })

    it('validates IDs and ID arrays', () => {
      expect(isValidId('goal-123')).toBe(true)
      expect(isValidId('')).toBe(false)
      expect(isValidId('   ')).toBe(false)
      expect(isValidId(null)).toBe(false)
      expect(isValidId(123 as any)).toBe(false)

      expect(isValidIdArray(['g1', 'g2', 'g3'])).toBe(true)
      expect(isValidIdArray([])).toBe(true)
      expect(isValidIdArray(['g1', ''])).toBe(false)
      expect(isValidIdArray(['g1', null as any])).toBe(false)
      expect(isValidIdArray('not-array')).toBe(false)
    })

    it('validates goal objects', () => {
      expect(isValidGoalObject({ id: 'g-1', title: 'Task' })).toBe(true)
      expect(isValidGoalObject({ id: 'g-1' })).toBe(true)
      expect(isValidGoalObject({ title: 'Task without ID' })).toBe(false)
      expect(isValidGoalObject(null)).toBe(false)
      expect(isValidGoalObject('not-an-object')).toBe(false)
    })
  })

  describe('handleSecure', () => {
    it('dispatches to handler and enforces role security check', async () => {
      let registeredHandler: ((event: any, payload: any) => Promise<any>) | null = null
      vi.spyOn(ipcMain, 'handle').mockImplementation((_channel, handler) => {
        registeredHandler = handler as any
      })

      const security = {
        assertSenderIsMainWindow: vi.fn(),
        assertSenderIsMainWindowOrPrompt: vi.fn(),
        assertSenderIsAppWindow: vi.fn()
      }

      const mockHandler = vi.fn().mockResolvedValue('ok')
      handleSecure('test:channel', 'main', security, mockHandler)

      expect(ipcMain.handle).toHaveBeenCalledWith('test:channel', expect.any(Function))
      expect(registeredHandler).toBeTruthy()

      const fakeEvent = { sender: {} }
      const res = await registeredHandler!(fakeEvent, { test: 123 })

      expect(security.assertSenderIsMainWindow).toHaveBeenCalledWith(fakeEvent)
      expect(mockHandler).toHaveBeenCalledWith(fakeEvent, { test: 123 })
      expect(res).toBe('ok')
    })
  })
})
