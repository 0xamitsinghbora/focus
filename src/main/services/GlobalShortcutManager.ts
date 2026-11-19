import { globalShortcut } from 'electron'
import { logger } from '../logger'
import { DEFAULT_SHORTCUTS } from '../../shared/shortcuts'

export interface GlobalShortcutActions {
  onLog: () => void
  onBringToFront: () => void
  onAddTask: () => void
  onToggleSession: () => void
}

export class GlobalShortcutManager {
  private registeredAccelerators: string[] = []
  private actions: GlobalShortcutActions

  constructor(actions: GlobalShortcutActions) {
    this.actions = actions
  }

  /**
   * Register or re-register all global desktop shortcuts based on configured bindings.
   */
  public registerAll(customShortcuts?: Record<string, string>): {
    registered: string[]
    failed: string[]
  } {
    this.unregisterAll()

    const registered: string[] = []
    const failed: string[] = []

    const logAccelerator = customShortcuts?.['global-log'] ?? DEFAULT_SHORTCUTS['global-log']
    const frontAccelerator = customShortcuts?.['global-front'] ?? DEFAULT_SHORTCUTS['global-front']
    const addTaskAccelerator =
      customShortcuts?.['global-add-task'] ?? DEFAULT_SHORTCUTS['global-add-task']
    const toggleSessionAccelerator =
      customShortcuts?.['global-toggle-session'] ?? DEFAULT_SHORTCUTS['global-toggle-session']

    const configs: Array<{ id: string; accelerator: string; action: () => void }> = [
      { id: 'global-log', accelerator: logAccelerator, action: this.actions.onLog },
      { id: 'global-front', accelerator: frontAccelerator, action: this.actions.onBringToFront },
      { id: 'global-add-task', accelerator: addTaskAccelerator, action: this.actions.onAddTask },
      {
        id: 'global-toggle-session',
        accelerator: toggleSessionAccelerator,
        action: this.actions.onToggleSession
      }
    ]

    for (const { id, accelerator, action } of configs) {
      if (
        !accelerator ||
        accelerator.trim().toLowerCase() === 'none' ||
        accelerator.trim() === ''
      ) {
        // Explicitly disabled by user to prevent any collision
        logger.info('main:shortcuts', `Global shortcut ${id} is disabled by user`)
        continue
      }

      try {
        const success = globalShortcut.register(accelerator, action)
        if (success) {
          registered.push(accelerator)
          this.registeredAccelerators.push(accelerator)
          logger.info('main:shortcuts', `Registered global shortcut ${id}: ${accelerator}`)
        } else {
          failed.push(accelerator)
          logger.warn(
            'main:shortcuts',
            `Failed to register global shortcut ${id} (${accelerator}): Shortcut may collide with another application`
          )
        }
      } catch (err) {
        failed.push(accelerator)
        logger.warn(
          'main:shortcuts',
          `Error registering global shortcut ${id} (${accelerator}):`,
          err
        )
      }
    }

    return { registered, failed }
  }

  /**
   * Unregister all currently registered global shortcuts.
   */
  public unregisterAll(): void {
    for (const accelerator of this.registeredAccelerators) {
      try {
        globalShortcut.unregister(accelerator)
      } catch (err) {
        logger.warn('main:shortcuts', `Failed to unregister global shortcut (${accelerator}):`, err)
      }
    }
    this.registeredAccelerators = []
  }

  /**
   * Get list of currently registered accelerators.
   */
  public getRegisteredAccelerators(): string[] {
    return [...this.registeredAccelerators]
  }
}
