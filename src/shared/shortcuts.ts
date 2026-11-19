import React from 'react'

export interface ShortcutDefinition {
  id: string
  label: string
  description: string
  category: 'global' | 'app'
  scope: string
  defaultAccelerator: string
  isGlobal: boolean
  keywords?: string[]
}

export const CONFIGURABLE_SHORTCUTS: ShortcutDefinition[] = [
  // --- GLOBAL OS LEVEL SHORTCUTS (CAN COLLIDE WITH OTHER APPS) ---
  {
    id: 'global-log',
    label: 'Quick Log Prompt',
    description: 'Open distraction-free log dialog from any active app',
    category: 'global',
    scope: 'Global OS',
    defaultAccelerator: 'CommandOrControl+Shift+L',
    isGlobal: true,
    keywords: ['log', 'prompt', 'quick log', 'record', 'scheduler', 'popup']
  },
  {
    id: 'global-front',
    label: 'Bring Focus to Front',
    description: 'Restore and bring the main Focus dashboard to front',
    category: 'global',
    scope: 'Global OS',
    defaultAccelerator: 'CommandOrControl+Shift+F',
    isGlobal: true,
    keywords: ['focus', 'front', 'restore', 'window', 'main', 'show']
  },
  {
    id: 'global-add-task',
    label: 'Global Quick Add Task',
    description: 'Bring Focus to front and open new task form on Goals board',
    category: 'global',
    scope: 'Global OS',
    defaultAccelerator: 'CommandOrControl+Shift+N',
    isGlobal: true,
    keywords: ['add', 'task', 'new', 'create', 'form', 'goal', 'global']
  },
  {
    id: 'global-toggle-session',
    label: 'Toggle Focus / Pause',
    description: 'Toggle pause or resume focus session from any app',
    category: 'global',
    scope: 'Global OS',
    defaultAccelerator: 'CommandOrControl+Alt+Space',
    isGlobal: true,
    keywords: ['pause', 'resume', 'timer', 'session', 'toggle', 'play']
  },

  // --- IN-APP NAVIGATION SHORTCUTS ---
  {
    id: 'app-quick-add',
    label: 'Quick Add Task',
    description: 'Open new goal input form on Goals board',
    category: 'app',
    scope: 'In Focus',
    defaultAccelerator: 'CommandOrControl+N',
    isGlobal: false,
    keywords: ['add', 'task', 'new', 'goal', 'create', 'input']
  }
]

export const DEFAULT_SHORTCUTS: Record<string, string> = CONFIGURABLE_SHORTCUTS.reduce(
  (acc, curr) => {
    acc[curr.id] = curr.defaultAccelerator
    return acc
  },
  {} as Record<string, string>
)

/**
 * Format an Electron accelerator string into an array of human-readable keys for display.
 */
export function formatAcceleratorForDisplay(
  accelerator: string | undefined,
  isMac = false
): string[] {
  if (!accelerator || accelerator.trim().toLowerCase() === 'none' || accelerator.trim() === '') {
    return ['Disabled']
  }

  // Handle single special key like '?'
  if (accelerator === '?') {
    return ['?']
  }

  const parts = accelerator.split('+').map((p) => p.trim())
  const formatted: string[] = []

  for (const part of parts) {
    const lower = part.toLowerCase()
    if (lower === 'commandorcontrol' || lower === 'cmdorctrl') {
      formatted.push(isMac ? '⌘' : 'Ctrl')
    } else if (lower === 'command' || lower === 'cmd') {
      formatted.push(isMac ? '⌘' : 'Cmd')
    } else if (lower === 'control' || lower === 'ctrl') {
      formatted.push(isMac ? '⌃' : 'Ctrl')
    } else if (lower === 'alt' || lower === 'option') {
      formatted.push(isMac ? '⌥' : 'Alt')
    } else if (lower === 'shift') {
      formatted.push(isMac ? '⇧' : 'Shift')
    } else if (lower === 'space') {
      formatted.push('Space')
    } else if (lower === 'escape' || lower === 'esc') {
      formatted.push('Esc')
    } else if (lower === 'enter' || lower === 'return') {
      formatted.push('Enter')
    } else {
      formatted.push(part.toUpperCase())
    }
  }

  return formatted
}

/**
 * Convert a KeyboardEvent into an Electron-compatible accelerator string.
 * Returns null if only modifier keys are pressed.
 */
export function keyboardEventToAccelerator(e: KeyboardEvent | React.KeyboardEvent): string | null {
  const key = e.key
  const lowerKey = key.toLowerCase()

  // If only modifier key was pressed, not a complete shortcut yet
  if (['control', 'shift', 'alt', 'meta'].includes(lowerKey)) {
    return null
  }

  const parts: string[] = []

  if (e.ctrlKey || e.metaKey) {
    parts.push('CommandOrControl')
  }
  if (e.altKey) {
    parts.push('Alt')
  }
  if (e.shiftKey) {
    parts.push('Shift')
  }

  // Format base key
  let baseKey = key
  if (lowerKey === ' ') {
    baseKey = 'Space'
  } else if (lowerKey === 'escape') {
    baseKey = 'Esc'
  } else if (key.length === 1) {
    baseKey = key.toUpperCase()
  } else if (/^f([1-9]|1[0-2])$/i.test(key)) {
    baseKey = key.toUpperCase()
  }

  // If no modifier is pressed and it's not a special single key (like '?' or function key),
  // require at least one modifier for global desktop shortcuts
  parts.push(baseKey)
  return parts.join('+')
}

/**
 * Check if a proposed accelerator conflicts with another configurable shortcut.
 */
export function checkShortcutConflict(
  proposedAccelerator: string,
  currentShortcutId: string,
  allShortcuts: Record<string, string>
): { hasConflict: boolean; conflictingShortcutId?: string; conflictingLabel?: string } {
  if (!proposedAccelerator || proposedAccelerator.toLowerCase() === 'none') {
    return { hasConflict: false }
  }

  const normalizedProposed = proposedAccelerator.replace(/\s+/g, '').toLowerCase()

  for (const item of CONFIGURABLE_SHORTCUTS) {
    if (item.id === currentShortcutId) continue

    const existingAcc = allShortcuts[item.id] ?? item.defaultAccelerator
    if (!existingAcc || existingAcc.toLowerCase() === 'none') continue

    const normalizedExisting = existingAcc.replace(/\s+/g, '').toLowerCase()
    if (normalizedProposed === normalizedExisting) {
      return {
        hasConflict: true,
        conflictingShortcutId: item.id,
        conflictingLabel: item.label
      }
    }
  }

  return { hasConflict: false }
}
