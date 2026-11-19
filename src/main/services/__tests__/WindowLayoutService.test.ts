import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from 'electron'
import * as fs from 'fs'
import { WindowLayoutService } from '../WindowLayoutService'

vi.mock('../../../../build/icon.png?asset', () => ({
  default: 'mock-icon.png'
}))

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn()
  }
})

describe('WindowLayoutService', () => {
  let service: WindowLayoutService

  beforeEach(() => {
    vi.clearAllMocks()
    service = WindowLayoutService.getInstance()
    service._resetForTesting()
  })

  it('correctly verifies whether coordinates intersect any active connected display', () => {
    const display1 = {
      bounds: { x: 0, y: 0, width: 1920, height: 1080 }
    } as any
    const display2 = {
      bounds: { x: 1920, y: 0, width: 2560, height: 1440 }
    } as any

    vi.spyOn(screen, 'getAllDisplays').mockReturnValue([display1, display2])

    // Inside primary
    expect(service.isPositionInsideAnyDisplay(100, 100, 800, 600)).toBe(true)

    // Inside secondary
    expect(service.isPositionInsideAnyDisplay(2000, 100, 800, 600)).toBe(true)

    // Straddling border between primary and secondary
    expect(service.isPositionInsideAnyDisplay(1800, 200, 800, 600)).toBe(true)

    // Completely off-screen (e.g. disconnected monitor at x=5000)
    expect(service.isPositionInsideAnyDisplay(5000, 500, 800, 600)).toBe(false)
    expect(service.isPositionInsideAnyDisplay(-2000, 500, 800, 600)).toBe(false)
  })

  it('clamps bounds strictly within target display work area', () => {
    const display = {
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1040 }
    } as any

    const oversizedBounds = { x: 100, y: 100, width: 2500, height: 1500 }
    const clamped = service.clampBounds(oversizedBounds, display, true)

    expect(clamped.width).toBe(1920)
    expect(clamped.height).toBe(1040)
    expect(clamped.x).toBe(0)
    expect(clamped.y).toBe(0)

    const offBottomRight = { x: 1800, y: 1000, width: 800, height: 600 }
    const clampedBottom = service.clampBounds(offBottomRight, display, true)
    expect(clampedBottom.x).toBe(1920 - 800)
    expect(clampedBottom.y).toBe(1040 - 600)
  })

  it('safely handles non-finite coordinates (NaN) or corrupted display metrics without crashing', () => {
    const primaryDisplay = {
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1040 }
    } as any
    vi.spyOn(screen, 'getPrimaryDisplay').mockReturnValue(primaryDisplay)

    // NaN input coordinates
    const nanBounds = { x: NaN, y: NaN, width: NaN, height: NaN }
    const clamped = service.clampBounds(nanBounds, undefined, false)

    expect(Number.isFinite(clamped.x)).toBe(true)
    expect(Number.isFinite(clamped.y)).toBe(true)
    expect(Number.isFinite(clamped.width)).toBe(true)
    expect(Number.isFinite(clamped.height)).toBe(true)
    expect(clamped.x).toBeGreaterThanOrEqual(0)
    expect(clamped.y).toBeGreaterThanOrEqual(0)
  })

  it('handles multi-monitor disconnection when loading saved window state', () => {
    const singleDisplay = {
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1040 }
    } as any

    vi.spyOn(screen, 'getAllDisplays').mockReturnValue([singleDisplay])
    vi.spyOn(screen, 'getPrimaryDisplay').mockReturnValue(singleDisplay)
    ;(screen as any).getDisplayMatching = vi.fn().mockReturnValue(singleDisplay)

    // Previously saved on a disconnected 2nd display at x=2500
    const savedDisconnectedState = {
      x: 2500,
      y: 200,
      width: 1000,
      height: 700,
      isMaximized: false
    }

    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(savedDisconnectedState))

    const loaded = service.loadWindowState()

    // Since x=2500 is outside any connected display, x and y are omitted so Electron can center it
    expect(loaded.x).toBeUndefined()
    expect(loaded.y).toBeUndefined()
    expect(loaded.width).toBe(1000)
    expect(loaded.height).toBe(700)
  })

  it('ensures window is repositioned if an external monitor is disconnected while app is running', () => {
    const primaryDisplay = {
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1040 }
    } as any

    vi.spyOn(screen, 'getAllDisplays').mockReturnValue([primaryDisplay])
    vi.spyOn(screen, 'getPrimaryDisplay').mockReturnValue(primaryDisplay)

    // Window currently sitting at disconnected coordinates
    const mockWin = {
      isDestroyed: () => false,
      getBounds: vi.fn().mockReturnValue({ x: 2200, y: 300, width: 900, height: 650 }),
      setBounds: vi.fn()
    } as any

    const repositioned = service.ensureWindowOnScreen(mockWin, true)
    expect(repositioned).toBe(true)
    expect(mockWin.setBounds).toHaveBeenCalledWith(
      expect.objectContaining({
        width: 900,
        height: 650
      })
    )
    const calledBounds = mockWin.setBounds.mock.calls[0][0]
    expect(calledBounds.x).toBeGreaterThanOrEqual(0)
    expect(calledBounds.x + calledBounds.width).toBeLessThanOrEqual(1920)
    expect(calledBounds.y).toBeGreaterThanOrEqual(0)
    expect(calledBounds.y + calledBounds.height).toBeLessThanOrEqual(1040)
  })

  it('attaches screen change listeners to automatically re-clamp windows on display removal', () => {
    const screenOnSpy = vi.spyOn(screen, 'on')
    const mainWin = {
      isDestroyed: () => false,
      getBounds: vi.fn().mockReturnValue({ x: 3000, y: 100, width: 800, height: 600 }),
      setBounds: vi.fn()
    } as any

    const primaryDisplay = {
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1040 }
    } as any
    vi.spyOn(screen, 'getAllDisplays').mockReturnValue([primaryDisplay])
    vi.spyOn(screen, 'getPrimaryDisplay').mockReturnValue(primaryDisplay)

    const cleanup = service.setupScreenChangeListeners({
      getMainWindow: () => mainWin
    })

    expect(screenOnSpy).toHaveBeenCalledWith('display-added', expect.any(Function))
    expect(screenOnSpy).toHaveBeenCalledWith('display-removed', expect.any(Function))
    expect(screenOnSpy).toHaveBeenCalledWith('display-metrics-changed', expect.any(Function))

    // Simulate display-removed event
    const removeHandler = screenOnSpy.mock.calls.find(
      (c) => c[0] === 'display-removed'
    )?.[1] as () => void
    expect(removeHandler).toBeDefined()
    removeHandler()

    expect(mainWin.setBounds).toHaveBeenCalled()

    cleanup()
  })

  it('re-clamps window bounds when display metrics or resolution change', () => {
    const screenOnSpy = vi.spyOn(screen, 'on')
    // Window partially overhangs the bottom-right of a 1366x768 screen (starts at 1000, width 800 -> reaches 1800)
    const mainWin = {
      isDestroyed: () => false,
      getBounds: vi.fn().mockReturnValue({ x: 1000, y: 500, width: 800, height: 600 }),
      setBounds: vi.fn()
    } as any

    const smallerDisplay = {
      bounds: { x: 0, y: 0, width: 1366, height: 768 },
      workArea: { x: 0, y: 0, width: 1366, height: 728 }
    } as any
    vi.spyOn(screen, 'getAllDisplays').mockReturnValue([smallerDisplay])
    vi.spyOn(screen, 'getPrimaryDisplay').mockReturnValue(smallerDisplay)
    ;(screen as any).getDisplayMatching = vi.fn().mockReturnValue(smallerDisplay)

    const cleanup = service.setupScreenChangeListeners({
      getMainWindow: () => mainWin
    })

    const metricsHandler = screenOnSpy.mock.calls.find(
      (c) => (c[0] as string) === 'display-metrics-changed'
    )?.[1] as () => void
    expect(metricsHandler).toBeDefined()
    metricsHandler()

    expect(mainWin.setBounds).toHaveBeenCalledWith(
      expect.objectContaining({
        x: 1366 - 800, // clamped to maxX
        y: 728 - 600, // clamped to maxY
        width: 800,
        height: 600
      })
    )

    cleanup()
  })

  it('saves normal bounds when window is maximized or minimized in saveWindowStateSync', () => {
    const mockWin = {
      isDestroyed: () => false,
      isMaximized: () => true,
      isMinimized: () => false,
      getBounds: vi.fn().mockReturnValue({ x: 0, y: 0, width: 1920, height: 1080 }),
      getNormalBounds: vi.fn().mockReturnValue({ x: 100, y: 100, width: 1000, height: 750 })
    } as any

    service.saveWindowStateSync(mockWin)

    expect(fs.writeFileSync).toHaveBeenCalled()
    const callArgs = vi.mocked(fs.writeFileSync).mock.calls[0]
    expect(callArgs[0]).toContain('window-state.json')
    const saved = JSON.parse(callArgs[1] as string)
    expect(saved.x).toBe(100)
    expect(saved.y).toBe(100)
    expect(saved.width).toBe(1000)
    expect(saved.height).toBe(750)
    expect(saved.isMaximized).toBe(true)
  })
})
