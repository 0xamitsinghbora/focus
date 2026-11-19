import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from 'electron'
import * as fs from 'fs'
import { loadWindowState, saveWindowState } from '../windowState'

vi.mock('../../../build/icon.png?asset', () => ({
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

describe('Window State Restoration Clamping', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('restores dimensions on ultrawide / 5K displays exceeding 3840x2160 without clamping', () => {
    const ultrawideDisplay = {
      bounds: { x: 0, y: 0, width: 5120, height: 1440 },
      workArea: { x: 0, y: 0, width: 5120, height: 1400 },
      workAreaSize: { width: 5120, height: 1400 },
      scaleFactor: 1
    } as any

    vi.spyOn(screen, 'getAllDisplays').mockReturnValue([ultrawideDisplay])
    vi.spyOn(screen, 'getPrimaryDisplay').mockReturnValue(ultrawideDisplay)
    ;(screen as any).getDisplayMatching = vi.fn().mockReturnValue(ultrawideDisplay)
    ;(screen as any).getDisplayNearestPoint = vi.fn().mockReturnValue(ultrawideDisplay)

    // Saved window state on a 5120x1440 display
    const savedState = {
      x: 100,
      y: 50,
      width: 4800,
      height: 1200,
      isMaximized: false
    }

    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(savedState))

    const state = loadWindowState()

    // Must preserve 4800 width (not clamped to 3840)
    expect(state.width).toBe(4800)
    expect(state.height).toBe(1200)
    expect(state.x).toBe(100)
    expect(state.y).toBe(50)
  })

  it('dynamically clamps window dimensions if moved to a smaller display', () => {
    const laptopDisplay = {
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      workAreaSize: { width: 1920, height: 1040 },
      scaleFactor: 1
    } as any

    vi.spyOn(screen, 'getAllDisplays').mockReturnValue([laptopDisplay])
    vi.spyOn(screen, 'getPrimaryDisplay').mockReturnValue(laptopDisplay)
    ;(screen as any).getDisplayMatching = vi.fn().mockReturnValue(laptopDisplay)
    ;(screen as any).getDisplayNearestPoint = vi.fn().mockReturnValue(laptopDisplay)

    // Saved window state from an external 4K monitor
    const savedState = {
      x: 500,
      y: 500,
      width: 3200,
      height: 1800,
      isMaximized: false
    }

    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(savedState))

    const state = loadWindowState()

    // Must clamp to laptop work area
    expect(state.width).toBe(1920)
    expect(state.height).toBe(1040)
  })

  it('uses getNormalBounds() when window is minimized in saveWindowState', () => {
    const mockWin = {
      isDestroyed: () => false,
      isMaximized: () => false,
      isMinimized: () => true,
      getBounds: vi.fn().mockReturnValue({ x: -32000, y: -32000, width: 160, height: 32 }),
      getNormalBounds: vi.fn().mockReturnValue({ x: 200, y: 150, width: 1000, height: 700 })
    } as any

    saveWindowState(mockWin)

    expect(mockWin.getNormalBounds).toHaveBeenCalled()
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('"x": 200'),
      'utf-8'
    )
  })
})
