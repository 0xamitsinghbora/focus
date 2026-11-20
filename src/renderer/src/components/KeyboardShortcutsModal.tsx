import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react'
import { useDialogA11y } from '../lib/useDialogA11y'
import { useToast } from '../lib/useToast'
import {
  DEFAULT_SHORTCUTS,
  formatAcceleratorForDisplay,
  keyboardEventToAccelerator,
  checkShortcutConflict
} from '../../../shared/shortcuts'

export interface KeyboardShortcutsModalProps {
  isOpen: boolean
  onClose: () => void
  isMac?: boolean
  initialCustomShortcuts?: Record<string, string>
}

export type ShortcutCategoryKey = 'all' | 'global' | 'app'

export interface KeyCombo {
  keys: string[]
  separator?: string
}

export interface ShortcutItem {
  id: string
  label: string
  description: string
  scope: string
  category: ShortcutCategoryKey
  combos: KeyCombo[]
  keywords?: string[]
  isConfigurable: boolean
}

export interface ShortcutCategoryConfig {
  key: ShortcutCategoryKey
  title: string
  shortTitle: string
  icon: string
  scopeBadge: string
  description: string
}

const SHORTCUT_CATEGORIES: ShortcutCategoryConfig[] = [
  {
    key: 'global',
    title: 'Global Desktop Shortcuts',
    shortTitle: 'Global Desktop',
    icon: '🌐',
    scopeBadge: 'From Any App',
    description: 'System-wide hotkeys that work from anywhere on your computer'
  },
  {
    key: 'app',
    title: 'In-App Shortcuts',
    shortTitle: 'In Focus',
    icon: '⚡',
    scopeBadge: 'In Focus',
    description: 'Quick entry and navigation inside Focus'
  }
]

function getShortcutsList(
  isMac: boolean,
  customShortcuts: Record<string, string> = {}
): ShortcutItem[] {
  const getEffectiveCombos = (id: string, defaultAcc: string): KeyCombo[] => {
    const acc = customShortcuts[id] ?? defaultAcc
    const keys = formatAcceleratorForDisplay(acc, isMac)
    return [{ keys }]
  }

  return [
    // --- GLOBAL DESKTOP (OS LEVEL - CAN COLLIDE WITH OTHER APPS) ---
    {
      id: 'global-log',
      label: 'Quick Log Prompt',
      description: 'Open distraction-free log dialog from any active app',
      scope: 'Global OS',
      category: 'global',
      combos: getEffectiveCombos('global-log', DEFAULT_SHORTCUTS['global-log']),
      isConfigurable: true,
      keywords: ['log', 'prompt', 'quick log', 'record', 'scheduler', 'popup', 'global']
    },
    {
      id: 'global-front',
      label: 'Bring Focus to Front',
      description: 'Restore and bring the main Focus dashboard to front',
      scope: 'Global OS',
      category: 'global',
      combos: getEffectiveCombos('global-front', DEFAULT_SHORTCUTS['global-front']),
      isConfigurable: true,
      keywords: ['focus', 'front', 'restore', 'window', 'main', 'show', 'global']
    },
    {
      id: 'global-add-task',
      label: 'Global Quick Add Task',
      description: 'Bring Focus to front and open new task form on Goals board',
      scope: 'Global OS',
      category: 'global',
      combos: getEffectiveCombos('global-add-task', DEFAULT_SHORTCUTS['global-add-task']),
      isConfigurable: true,
      keywords: ['add', 'task', 'new', 'create', 'form', 'goal', 'global']
    },
    {
      id: 'global-toggle-session',
      label: 'Toggle Focus / Pause',
      description: 'Toggle pause or resume focus session from any app',
      scope: 'Global OS',
      category: 'global',
      combos: getEffectiveCombos(
        'global-toggle-session',
        DEFAULT_SHORTCUTS['global-toggle-session']
      ),
      isConfigurable: true,
      keywords: ['pause', 'resume', 'timer', 'session', 'toggle', 'play', 'global']
    },

    // --- APP & NAVIGATION ---
    {
      id: 'app-quick-add',
      label: 'Quick Add Task',
      description: 'Open new goal input form on Goals board',
      scope: 'In Focus',
      category: 'app',
      combos: getEffectiveCombos('app-quick-add', DEFAULT_SHORTCUTS['app-quick-add']),
      isConfigurable: true,
      keywords: ['add', 'task', 'new', 'goal', 'create', 'input']
    }
  ]
}

export function KeyboardShortcutsModal({
  isOpen,
  onClose,
  isMac = false,
  initialCustomShortcuts
}: KeyboardShortcutsModalProps): React.JSX.Element | null {
  const toast = useToast()
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [activeCategory, setActiveCategory] = useState<ShortcutCategoryKey>('all')

  const [customShortcuts, setCustomShortcuts] = useState<Record<string, string>>(
    initialCustomShortcuts || {}
  )
  const [editingId, setEditingId] = useState<string | null>(null)
  const [heldModifiers, setHeldModifiers] = useState<string[]>([])
  const [conflictInfo, setConflictInfo] = useState<{
    hasConflict: boolean
    conflictingLabel?: string
  } | null>(null)

  const hasLoadedSettingsRef = useRef(false)

  // Load custom shortcuts from backend settings when modal is opened
  useEffect(() => {
    if (
      isOpen &&
      !hasLoadedSettingsRef.current &&
      typeof window !== 'undefined' &&
      window.api?.settings?.get
    ) {
      hasLoadedSettingsRef.current = true
      window.api.settings
        .get()
        .then((settings) => {
          if (settings?.customShortcuts && Object.keys(settings.customShortcuts).length > 0) {
            setCustomShortcuts((prev) => ({
              ...settings.customShortcuts,
              ...prev
            }))
          }
        })
        .catch((err) => {
          console.warn('Failed to load settings customShortcuts:', err)
        })
    }
  }, [isOpen])

  // Save updated shortcut to settings & local state
  const handleSaveShortcut = useCallback(
    async (id: string, newAccelerator: string): Promise<void> => {
      const updated = {
        ...customShortcuts,
        [id]: newAccelerator
      }
      setCustomShortcuts(updated)
      setEditingId(null)
      setHeldModifiers([])
      setConflictInfo(null)

      try {
        if (typeof window !== 'undefined' && window.api?.settings?.patch) {
          await window.api.settings.patch({ customShortcuts: updated })
        }
        toast.success(
          newAccelerator === 'none'
            ? 'Shortcut disabled'
            : `Bound to ${formatAcceleratorForDisplay(newAccelerator, isMac).join('+')}`
        )
      } catch (err) {
        console.error('Failed to patch shortcut setting:', err)
        toast.error('Failed to save shortcut')
      }
    },
    [customShortcuts, isMac, toast]
  )

  // Game-style key recording listener when a shortcut is in edit mode
  useEffect(() => {
    if (!editingId) return

    const handleKeyDown = (e: KeyboardEvent): void => {
      // Escape cancels recording
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        setEditingId(null)
        setHeldModifiers([])
        setConflictInfo(null)
        return
      }

      // Backspace or Delete (without modifiers) unbinds/disables shortcut
      if (
        (e.key === 'Backspace' || e.key === 'Delete') &&
        !e.ctrlKey &&
        !e.altKey &&
        !e.shiftKey &&
        !e.metaKey
      ) {
        e.preventDefault()
        e.stopPropagation()
        handleSaveShortcut(editingId, 'none')
        return
      }

      // Track held modifiers in real-time
      const mods: string[] = []
      if (e.ctrlKey || e.metaKey) mods.push(isMac ? '⌘' : 'Ctrl')
      if (e.altKey) mods.push(isMac ? '⌥' : 'Alt')
      if (e.shiftKey) mods.push(isMac ? '⇧' : 'Shift')
      setHeldModifiers(mods)

      const acc = keyboardEventToAccelerator(e)
      if (acc) {
        e.preventDefault()
        e.stopPropagation()

        const conflict = checkShortcutConflict(acc, editingId, customShortcuts)
        if (conflict.hasConflict) {
          setConflictInfo(conflict)
          return
        }

        // Instant bind like in games!
        handleSaveShortcut(editingId, acc)
      }
    }

    const handleKeyUp = (e: KeyboardEvent): void => {
      const mods: string[] = []
      if (e.ctrlKey || e.metaKey) mods.push(isMac ? '⌘' : 'Ctrl')
      if (e.altKey) mods.push(isMac ? '⌥' : 'Alt')
      if (e.shiftKey) mods.push(isMac ? '⇧' : 'Shift')
      setHeldModifiers(mods)
    }

    window.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('keyup', handleKeyUp, true)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('keyup', handleKeyUp, true)
    }
  }, [editingId, isMac, customShortcuts, handleSaveShortcut])

  const dialogRef = useDialogA11y<HTMLDivElement>({
    isOpen,
    onClose,
    initialFocusRef: closeButtonRef,
    closeOnEscape: !editingId
  })

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent): void => {
    if (e.target === e.currentTarget) {
      if (editingId) {
        setEditingId(null)
        setHeldModifiers([])
        setConflictInfo(null)
      } else {
        onClose()
      }
    }
  }

  // Reset an individual shortcut back to default
  const handleResetShortcut = async (id: string): Promise<void> => {
    const updated = { ...customShortcuts }
    delete updated[id]
    setCustomShortcuts(updated)
    if (editingId === id) {
      setEditingId(null)
      setHeldModifiers([])
      setConflictInfo(null)
    }

    try {
      if (typeof window !== 'undefined' && window.api?.settings?.patch) {
        await window.api.settings.patch({ customShortcuts: updated })
      }
      toast.success('Shortcut restored to default')
    } catch (err) {
      console.error('Failed to reset shortcut:', err)
      toast.error('Failed to reset shortcut')
    }
  }

  // Reset all shortcuts back to defaults
  const handleResetAllShortcuts = async (): Promise<void> => {
    setCustomShortcuts({})
    setEditingId(null)
    setHeldModifiers([])
    setConflictInfo(null)

    try {
      if (typeof window !== 'undefined' && window.api?.settings?.patch) {
        await window.api.settings.patch({ customShortcuts: {} })
      }
      toast.success('All shortcuts restored to defaults')
    } catch (err) {
      console.error('Failed to reset all shortcuts:', err)
      toast.error('Failed to reset shortcuts')
    }
  }

  // All valid changeable shortcuts
  const allShortcuts = useMemo(
    () => getShortcutsList(isMac, customShortcuts),
    [isMac, customShortcuts]
  )

  // Count customized shortcuts
  const customCount = useMemo(() => {
    return Object.keys(customShortcuts).filter(
      (k) => customShortcuts[k] !== undefined && customShortcuts[k] !== DEFAULT_SHORTCUTS[k]
    ).length
  }, [customShortcuts])

  // Filter shortcuts based on active category and search query
  const filteredShortcuts = useMemo(() => {
    let list = allShortcuts
    if (activeCategory !== 'all') {
      list = list.filter((s) => s.category === activeCategory)
    }

    const q = searchQuery.trim().toLowerCase()
    if (!q) return list

    return list.filter((item) => {
      const matchLabel = item.label.toLowerCase().includes(q)
      const matchDesc = item.description.toLowerCase().includes(q)
      const matchScope = item.scope.toLowerCase().includes(q)
      const matchKeywords = item.keywords?.some((kw) => kw.toLowerCase().includes(q))
      const matchKeys = item.combos.some((combo) =>
        combo.keys.some((k) => k.toLowerCase().includes(q))
      )
      return matchLabel || matchDesc || matchScope || matchKeywords || matchKeys
    })
  }, [allShortcuts, activeCategory, searchQuery])

  // Group filtered results by category
  const groupedResults = useMemo(() => {
    const map = new Map<ShortcutCategoryKey, ShortcutItem[]>()
    for (const item of filteredShortcuts) {
      const existing = map.get(item.category) || []
      existing.push(item)
      map.set(item.category, existing)
    }
    return SHORTCUT_CATEGORIES.map((cat) => ({
      ...cat,
      items: map.get(cat.key) || []
    })).filter((cat) => cat.items.length > 0)
  }, [filteredShortcuts])

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: allShortcuts.length }
    for (const item of allShortcuts) {
      counts[item.category] = (counts[item.category] || 0) + 1
    }
    return counts
  }, [allShortcuts])

  if (!isOpen) return null

  return (
    <div
      role="presentation"
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        className="relative w-full max-w-2xl max-h-[90vh] flex flex-col apple-glass text-foreground border border-border/70 rounded-2xl shadow-apple-popover overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 pt-5 pb-3 border-b border-border/40 space-y-3 bg-surface/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="text-xl">⌨️</span>
              <div>
                <h2
                  id="shortcuts-title"
                  className="text-base font-semibold text-foreground tracking-[-0.02em]"
                >
                  Keyboard Shortcuts
                </h2>
                <p className="text-[11.5px] text-muted-foreground/90">
                  Click any keybind slot to rebind instantly
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {customCount > 0 && (
                <button
                  type="button"
                  onClick={handleResetAllShortcuts}
                  className="px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/80 rounded-lg border border-border/60 transition-all cursor-pointer"
                  title="Reset all modified shortcuts back to defaults"
                >
                  Reset Defaults ({customCount})
                </button>
              )}

              <button
                ref={closeButtonRef}
                type="button"
                onClick={onClose}
                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary/80 rounded-lg transition-colors cursor-pointer"
                aria-label="Close shortcuts modal"
                title="Close (Esc)"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          {/* Search bar & Category Pills */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-0.5">
            {/* Search Input */}
            <div className="relative flex-1">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search shortcuts... (e.g. log, front, add, pause)"
                className="w-full pl-8.5 pr-8 py-1.5 text-xs bg-secondary/60 hover:bg-secondary/80 focus:bg-secondary border border-border/60 focus:border-ring rounded-lg text-foreground placeholder:text-muted-foreground/75 outline-none transition-all"
                aria-label="Filter shortcuts"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 rounded cursor-pointer"
                  title="Clear search"
                  aria-label="Clear search query"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Category Filter Pills */}
            <div
              className="flex items-center gap-1 overflow-x-auto pb-0.5 custom-scrollbar"
              role="tablist"
              aria-label="Shortcut categories"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeCategory === 'all'}
                onClick={() => setActiveCategory('all')}
                className={`px-2.5 py-1 text-[11px] rounded-lg font-medium transition-all cursor-pointer shrink-0 ${
                  activeCategory === 'all'
                    ? 'bg-foreground text-background font-semibold shadow-2xs'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/70'
                }`}
              >
                All ({categoryCounts.all})
              </button>

              {SHORTCUT_CATEGORIES.map((cat) => {
                const count = categoryCounts[cat.key] || 0
                const isSelected = activeCategory === cat.key
                return (
                  <button
                    key={cat.key}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    onClick={() => setActiveCategory(cat.key)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-lg font-medium transition-all cursor-pointer shrink-0 ${
                      isSelected
                        ? 'bg-foreground text-background font-semibold shadow-2xs'
                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary/70'
                    }`}
                  >
                    <span>{cat.icon}</span>
                    <span>{cat.shortTitle}</span>
                    <span
                      className={`text-[9.5px] px-1 py-0.2 rounded-full ${
                        isSelected
                          ? 'bg-background/25 text-background'
                          : 'bg-secondary text-muted-foreground'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Content list */}
        <div className="flex-1 overflow-y-auto px-6 py-4 custom-scrollbar space-y-5">
          {groupedResults.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <span className="text-3xl">🔍</span>
              <p className="text-sm font-medium text-foreground">No shortcuts found</p>
              <p className="text-xs text-muted-foreground">
                No shortcut matching &ldquo;{searchQuery}&rdquo; in this category.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('')
                  setActiveCategory('all')
                }}
                className="px-3 py-1.5 text-xs bg-secondary hover:bg-secondary/80 text-foreground rounded-lg border border-border/60 transition-colors cursor-pointer"
              >
                Reset Search Filters
              </button>
            </div>
          ) : (
            groupedResults.map((category) => (
              <section key={category.key} className="space-y-2.5">
                <div className="flex items-center justify-between pb-1 border-b border-border/40">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{category.icon}</span>
                    <h3 className="text-xs font-semibold text-foreground tracking-[-0.01em]">
                      {category.title}
                    </h3>
                  </div>
                  <span className="text-[10px] font-medium tracking-wide uppercase px-2 py-0.5 rounded-full bg-secondary/80 text-muted-foreground border border-border/40">
                    {category.scopeBadge}
                  </span>
                </div>

                <div className="space-y-2">
                  {category.items.map((item) => {
                    const isEditing = editingId === item.id
                    const isCustomized =
                      Boolean(customShortcuts[item.id]) &&
                      customShortcuts[item.id] !== DEFAULT_SHORTCUTS[item.id]
                    const isDisabled = customShortcuts[item.id]?.toLowerCase() === 'none'
                    const combo = item.combos[0] || { keys: [] }

                    return (
                      <div
                        key={item.id}
                        className={`group flex items-center justify-between p-3 rounded-xl transition-all gap-3 ${
                          isEditing
                            ? 'bg-surface border-2 border-primary shadow-apple-popover ring-1 ring-primary/20'
                            : 'bg-surface/40 hover:bg-surface/80 border border-border/40 hover:border-border/80 shadow-2xs'
                        }`}
                      >
                        {/* Shortcut Label & Description */}
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[13px] font-semibold text-foreground tracking-[-0.01em]">
                              {item.label}
                            </span>
                            {isCustomized && (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-apple-blue/15 text-apple-blue border border-apple-blue/30 uppercase tracking-wider">
                                Custom
                              </span>
                            )}
                            {isDisabled && (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-muted/30 text-muted-foreground border border-border/40 uppercase tracking-wider">
                                Disabled
                              </span>
                            )}
                          </div>
                          <div className="text-[11.5px] text-muted-foreground leading-snug">
                            {item.description}
                          </div>
                        </div>

                        {/* Interactive Game-style Keybind Slot / Recording Box */}
                        {isEditing ? (
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <div
                              role="status"
                              aria-live="polite"
                              className="relative flex items-center justify-between min-w-[210px] px-3.5 py-2 rounded-xl border-2 border-primary bg-primary/10 shadow-[0_0_15px_rgba(59,130,246,0.3)] animate-pulse"
                            >
                              <div className="flex items-center gap-2 select-none">
                                {heldModifiers.length > 0 ? (
                                  <div className="flex items-center gap-1">
                                    {heldModifiers.map((mod, mIdx) => (
                                      <React.Fragment key={mIdx}>
                                        {mIdx > 0 && (
                                          <span className="text-[10px] text-primary font-bold">
                                            +
                                          </span>
                                        )}
                                        <kbd className="px-2 py-0.5 text-[11px] font-mono font-bold bg-primary text-primary-foreground rounded-md shadow-2xs">
                                          {mod}
                                        </kbd>
                                      </React.Fragment>
                                    ))}
                                    <span className="text-xs text-primary font-mono font-bold animate-pulse">
                                      + ...
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-[11.5px] font-bold text-primary font-mono tracking-wider uppercase">
                                    Press keys...
                                  </span>
                                )}
                              </div>

                              <button
                                type="button"
                                onClick={() => {
                                  setEditingId(null)
                                  setHeldModifiers([])
                                  setConflictInfo(null)
                                }}
                                className="ml-2 text-[10px] font-mono text-muted-foreground hover:text-foreground hover:bg-secondary/80 px-1.5 py-0.5 rounded cursor-pointer transition-colors"
                                title="Cancel (Esc)"
                                aria-label="Cancel recording"
                              >
                                Esc
                              </button>
                            </div>

                            <div className="text-[9.5px] text-muted-foreground/75 flex items-center gap-1.5 px-0.5">
                              <span>Esc to cancel</span>
                              <span>·</span>
                              <span>Del to disable</span>
                            </div>

                            {conflictInfo?.hasConflict && (
                              <div className="text-[10.5px] text-apple-red bg-apple-red/10 px-2 py-1 rounded-md border border-apple-red/30 font-medium animate-in fade-in">
                                ⚠️ Collides with &ldquo;{conflictInfo.conflictingLabel}&rdquo;
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 shrink-0">
                            {/* The Game-Style Rebind Slot */}
                            <button
                              type="button"
                              onClick={() => {
                                setEditingId(item.id)
                                setHeldModifiers([])
                                setConflictInfo(null)
                              }}
                              className={`group relative flex items-center justify-center min-w-[140px] px-3.5 py-2 rounded-xl border transition-all cursor-pointer ${
                                isDisabled
                                  ? 'bg-muted/15 border-dashed border-border/80 hover:border-primary/60 hover:bg-muted/25 text-muted-foreground'
                                  : 'bg-surface/80 hover:bg-secondary/90 border-border/80 hover:border-primary/60 shadow-2xs hover:shadow-apple-subtle hover:scale-[1.02] active:scale-[0.98]'
                              }`}
                              title={`Click to rebind shortcut for ${item.label}`}
                              aria-label={`Rebind shortcut for ${item.label}`}
                            >
                              <div className="flex items-center gap-1 select-none">
                                {isDisabled ? (
                                  <span className="text-[11px] font-mono italic text-muted-foreground/80">
                                    Disabled
                                  </span>
                                ) : (
                                  combo.keys.map((k, kIdx) => (
                                    <React.Fragment key={kIdx}>
                                      {kIdx > 0 && (
                                        <span className="text-[10px] text-muted-foreground/50 font-semibold">
                                          +
                                        </span>
                                      )}
                                      <kbd className="inline-flex items-center justify-center min-w-[1.6rem] h-6 px-2 text-[11px] font-mono font-bold rounded-lg bg-background text-foreground border border-border/80 shadow-2xs group-hover:border-primary/50 transition-all">
                                        {k}
                                      </kbd>
                                    </React.Fragment>
                                  ))
                                )}
                              </div>
                            </button>

                            {/* Reset to default */}
                            {isCustomized && (
                              <button
                                type="button"
                                onClick={() => handleResetShortcut(item.id)}
                                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg border border-transparent hover:border-border/60 transition-all cursor-pointer"
                                title={`Reset ${item.label} to default (${formatAcceleratorForDisplay(DEFAULT_SHORTCUTS[item.id], isMac).join('+')})`}
                                aria-label={`Reset ${item.label} to default`}
                              >
                                ↺
                              </button>
                            )}

                            {/* Disable shortcut */}
                            {!isDisabled && (
                              <button
                                type="button"
                                onClick={() => handleSaveShortcut(item.id, 'none')}
                                className="p-1.5 text-muted-foreground hover:text-apple-red hover:bg-apple-red/10 rounded-lg border border-transparent hover:border-apple-red/20 transition-all cursor-pointer"
                                title={`Disable shortcut for ${item.label}`}
                                aria-label={`Disable shortcut for ${item.label}`}
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-border/40 bg-surface/40 flex flex-wrap justify-between items-center gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>Click any keybind box to rebind instantly</span>
          </div>
          <div className="flex items-center gap-2">
            <span>
              Press{' '}
              <kbd className="px-1.5 py-0.5 font-mono text-[10.5px] bg-secondary border border-border rounded">
                Esc
              </kbd>{' '}
              to close
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
