import { describe, it, expect, vi, beforeEach } from 'vitest'
import { globalShortcut } from 'electron'
import { GlobalShortcutManager } from '../GlobalShortcutManager'

vi.mock('electron', () => ({
  globalShortcut: {
    register: vi.fn(),
    unregister: vi.fn(),
    unregisterAll: vi.fn()
  }
}))

vi.mock('../../logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

describe('GlobalShortcutManager', () => {
  const actions = {
    onLog: vi.fn(),
    onBringToFront: vi.fn(),
    onAddTask: vi.fn(),
    onToggleSession: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(globalShortcut.register).mockReturnValue(true)
  })

  it('registers all 4 default global shortcuts when no custom shortcuts provided', () => {
    const manager = new GlobalShortcutManager(actions)
    const result = manager.registerAll()

    expect(result.registered).toContain('CommandOrControl+Shift+L')
    expect(result.registered).toContain('CommandOrControl+Shift+F')
    expect(result.registered).toContain('CommandOrControl+Shift+N')
    expect(result.registered).toContain('CommandOrControl+Alt+Space')
    expect(globalShortcut.register).toHaveBeenCalledTimes(4)
  })

  it('registers customized shortcuts when provided', () => {
    const manager = new GlobalShortcutManager(actions)
    const result = manager.registerAll({
      'global-log': 'Alt+Shift+L',
      'global-front': 'Alt+Shift+F'
    })

    expect(result.registered).toContain('Alt+Shift+L')
    expect(result.registered).toContain('Alt+Shift+F')
    expect(result.registered).toContain('CommandOrControl+Shift+N')
    expect(result.registered).toContain('CommandOrControl+Alt+Space')
  })

  it('skips shortcuts that are disabled with "none" or empty string', () => {
    const manager = new GlobalShortcutManager(actions)
    const result = manager.registerAll({
      'global-log': 'none',
      'global-front': ''
    })

    expect(result.registered).not.toContain('CommandOrControl+Shift+L')
    expect(result.registered).not.toContain('CommandOrControl+Shift+F')
    expect(result.registered.length).toBe(2)
  })

  it('unregisters previous accelerators before registering new ones', () => {
    const manager = new GlobalShortcutManager(actions)
    manager.registerAll()
    expect(globalShortcut.register).toHaveBeenCalledTimes(4)

    manager.registerAll({
      'global-log': 'Alt+Shift+L'
    })

    expect(globalShortcut.unregister).toHaveBeenCalledTimes(4)
  })

  it('unregisters all shortcuts on unregisterAll', () => {
    const manager = new GlobalShortcutManager(actions)
    manager.registerAll()

    manager.unregisterAll()
    expect(globalShortcut.unregister).toHaveBeenCalledTimes(4)
    expect(manager.getRegisteredAccelerators()).toHaveLength(0)
  })
})
