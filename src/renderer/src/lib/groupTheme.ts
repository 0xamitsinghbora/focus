export type GroupColorId =
  | 'blue'
  | 'cobalt'
  | 'cyan'
  | 'teal'
  | 'indigo'
  | 'lavender'
  | 'violet'
  | 'purple'
  | 'fuchsia'
  | 'pink'
  | 'plum'
  | 'peach'
  | 'orange'
  | 'copper'
  | 'slate'
  | 'zinc'

export interface GroupTheme {
  id: GroupColorId
  name: string
  hex: string
  dotClass: string
  badgeBg: string
  badgeText: string
  badgeBorder: string
  headerBg: string
  headerBorder: string
  barBg: string
  ringClass: string
}

// Exactly 16 distinct, vibrant, differentiating color options excluding red, green, and yellow
export const GROUP_THEMES: GroupTheme[] = [
  {
    id: 'blue',
    name: 'Ocean Blue',
    hex: '#0284c7',
    dotClass: 'bg-sky-500',
    badgeBg: 'bg-sky-500/10 dark:bg-sky-500/20',
    badgeText: 'text-sky-700 dark:text-sky-300',
    badgeBorder: 'border-sky-500/30 dark:border-sky-400/30',
    headerBg: 'bg-sky-500/5 dark:bg-sky-500/10',
    headerBorder: 'border-sky-500/30 dark:border-sky-400/30',
    barBg: 'bg-sky-500',
    ringClass: 'ring-sky-500/30 border-sky-500/40'
  },
  {
    id: 'cobalt',
    name: 'Cobalt Sapphire',
    hex: '#2563eb',
    dotClass: 'bg-blue-600',
    badgeBg: 'bg-blue-600/10 dark:bg-blue-600/20',
    badgeText: 'text-blue-700 dark:text-blue-300',
    badgeBorder: 'border-blue-600/30 dark:border-blue-400/30',
    headerBg: 'bg-blue-600/5 dark:bg-blue-600/10',
    headerBorder: 'border-blue-600/30 dark:border-blue-400/30',
    barBg: 'bg-blue-600',
    ringClass: 'ring-blue-600/30 border-blue-600/40'
  },
  {
    id: 'cyan',
    name: 'Electric Cyan',
    hex: '#06b6d4',
    dotClass: 'bg-cyan-500',
    badgeBg: 'bg-cyan-500/10 dark:bg-cyan-500/20',
    badgeText: 'text-cyan-800 dark:text-cyan-300',
    badgeBorder: 'border-cyan-500/30 dark:border-cyan-400/30',
    headerBg: 'bg-cyan-500/5 dark:bg-cyan-500/10',
    headerBorder: 'border-cyan-500/30 dark:border-cyan-400/30',
    barBg: 'bg-cyan-500',
    ringClass: 'ring-cyan-500/30 border-cyan-500/40'
  },
  {
    id: 'teal',
    name: 'Lagoon Teal',
    hex: '#0d9488',
    dotClass: 'bg-teal-600',
    badgeBg: 'bg-teal-600/10 dark:bg-teal-600/20',
    badgeText: 'text-teal-700 dark:text-teal-300',
    badgeBorder: 'border-teal-600/30 dark:border-teal-500/30',
    headerBg: 'bg-teal-600/5 dark:bg-teal-600/10',
    headerBorder: 'border-teal-600/30 dark:border-teal-500/30',
    barBg: 'bg-teal-600',
    ringClass: 'ring-teal-600/30 border-teal-600/40'
  },
  {
    id: 'indigo',
    name: 'Deep Indigo',
    hex: '#6366f1',
    dotClass: 'bg-indigo-500',
    badgeBg: 'bg-indigo-500/10 dark:bg-indigo-500/20',
    badgeText: 'text-indigo-700 dark:text-indigo-300',
    badgeBorder: 'border-indigo-500/30 dark:border-indigo-400/30',
    headerBg: 'bg-indigo-500/5 dark:bg-indigo-500/10',
    headerBorder: 'border-indigo-500/30 dark:border-indigo-400/30',
    barBg: 'bg-indigo-500',
    ringClass: 'ring-indigo-500/30 border-indigo-500/40'
  },
  {
    id: 'lavender',
    name: 'Soft Lavender',
    hex: '#818cf8',
    dotClass: 'bg-indigo-400',
    badgeBg: 'bg-indigo-400/10 dark:bg-indigo-400/20',
    badgeText: 'text-indigo-600 dark:text-indigo-200',
    badgeBorder: 'border-indigo-400/30 dark:border-indigo-300/30',
    headerBg: 'bg-indigo-400/5 dark:bg-indigo-400/10',
    headerBorder: 'border-indigo-400/30 dark:border-indigo-300/30',
    barBg: 'bg-indigo-400',
    ringClass: 'ring-indigo-400/30 border-indigo-400/40'
  },
  {
    id: 'violet',
    name: 'Electric Violet',
    hex: '#7c3aed',
    dotClass: 'bg-violet-600',
    badgeBg: 'bg-violet-600/10 dark:bg-violet-600/20',
    badgeText: 'text-violet-700 dark:text-violet-300',
    badgeBorder: 'border-violet-600/30 dark:border-violet-400/30',
    headerBg: 'bg-violet-600/5 dark:bg-violet-600/10',
    headerBorder: 'border-violet-600/30 dark:border-violet-400/30',
    barBg: 'bg-violet-600',
    ringClass: 'ring-violet-600/30 border-violet-600/40'
  },
  {
    id: 'purple',
    name: 'Royal Purple',
    hex: '#8b5cf6',
    dotClass: 'bg-purple-500',
    badgeBg: 'bg-purple-500/10 dark:bg-purple-500/20',
    badgeText: 'text-purple-700 dark:text-purple-300',
    badgeBorder: 'border-purple-500/30 dark:border-purple-400/30',
    headerBg: 'bg-purple-500/5 dark:bg-purple-500/10',
    headerBorder: 'border-purple-500/30 dark:border-purple-400/30',
    barBg: 'bg-purple-500',
    ringClass: 'ring-purple-500/30 border-purple-500/40'
  },
  {
    id: 'fuchsia',
    name: 'Neon Fuchsia',
    hex: '#d946ef',
    dotClass: 'bg-fuchsia-500',
    badgeBg: 'bg-fuchsia-500/10 dark:bg-fuchsia-500/20',
    badgeText: 'text-fuchsia-700 dark:text-fuchsia-300',
    badgeBorder: 'border-fuchsia-500/30 dark:border-fuchsia-400/30',
    headerBg: 'bg-fuchsia-500/5 dark:bg-fuchsia-500/10',
    headerBorder: 'border-fuchsia-500/30 dark:border-fuchsia-400/30',
    barBg: 'bg-fuchsia-500',
    ringClass: 'ring-fuchsia-500/30 border-fuchsia-500/40'
  },
  {
    id: 'pink',
    name: 'Blush Pink',
    hex: '#ec4899',
    dotClass: 'bg-pink-500',
    badgeBg: 'bg-pink-500/10 dark:bg-pink-500/20',
    badgeText: 'text-pink-700 dark:text-pink-300',
    badgeBorder: 'border-pink-500/30 dark:border-pink-400/30',
    headerBg: 'bg-pink-500/5 dark:bg-pink-500/10',
    headerBorder: 'border-pink-500/30 dark:border-pink-400/30',
    barBg: 'bg-pink-500',
    ringClass: 'ring-pink-500/30 border-pink-500/40'
  },
  {
    id: 'plum',
    name: 'Deep Plum',
    hex: '#86198f',
    dotClass: 'bg-fuchsia-800',
    badgeBg: 'bg-fuchsia-800/10 dark:bg-fuchsia-800/20',
    badgeText: 'text-fuchsia-800 dark:text-fuchsia-200',
    badgeBorder: 'border-fuchsia-800/30 dark:border-fuchsia-600/30',
    headerBg: 'bg-fuchsia-800/5 dark:bg-fuchsia-800/10',
    headerBorder: 'border-fuchsia-800/30 dark:border-fuchsia-600/30',
    barBg: 'bg-fuchsia-800',
    ringClass: 'ring-fuchsia-800/30 border-fuchsia-800/40'
  },
  {
    id: 'peach',
    name: 'Warm Peach',
    hex: '#fb923c',
    dotClass: 'bg-orange-400',
    badgeBg: 'bg-orange-400/10 dark:bg-orange-400/20',
    badgeText: 'text-orange-800 dark:text-orange-200',
    badgeBorder: 'border-orange-400/30 dark:border-orange-300/30',
    headerBg: 'bg-orange-400/5 dark:bg-orange-400/10',
    headerBorder: 'border-orange-400/30 dark:border-orange-300/30',
    barBg: 'bg-orange-400',
    ringClass: 'ring-orange-400/30 border-orange-400/40'
  },
  {
    id: 'orange',
    name: 'Tangerine',
    hex: '#ea580c',
    dotClass: 'bg-orange-600',
    badgeBg: 'bg-orange-600/10 dark:bg-orange-600/20',
    badgeText: 'text-orange-800 dark:text-orange-200',
    badgeBorder: 'border-orange-600/30 dark:border-orange-500/30',
    headerBg: 'bg-orange-600/5 dark:bg-orange-600/10',
    headerBorder: 'border-orange-600/30 dark:border-orange-500/30',
    barBg: 'bg-orange-600',
    ringClass: 'ring-orange-600/30 border-orange-600/40'
  },
  {
    id: 'copper',
    name: 'Burnt Copper',
    hex: '#9a3412',
    dotClass: 'bg-orange-800',
    badgeBg: 'bg-orange-800/10 dark:bg-orange-800/20',
    badgeText: 'text-orange-950 dark:text-orange-200',
    badgeBorder: 'border-orange-800/30 dark:border-orange-600/30',
    headerBg: 'bg-orange-800/5 dark:bg-orange-800/10',
    headerBorder: 'border-orange-800/30 dark:border-orange-600/30',
    barBg: 'bg-orange-800',
    ringClass: 'ring-orange-800/30 border-orange-800/40'
  },
  {
    id: 'slate',
    name: 'Graphite Slate',
    hex: '#64748b',
    dotClass: 'bg-slate-500',
    badgeBg: 'bg-slate-500/10 dark:bg-slate-500/20',
    badgeText: 'text-slate-700 dark:text-slate-300',
    badgeBorder: 'border-slate-500/30 dark:border-slate-400/30',
    headerBg: 'bg-slate-500/5 dark:bg-slate-500/10',
    headerBorder: 'border-slate-500/30 dark:border-slate-400/30',
    barBg: 'bg-slate-500',
    ringClass: 'ring-slate-500/30 border-slate-500/40'
  },
  {
    id: 'zinc',
    name: 'Charcoal',
    hex: '#52525b',
    dotClass: 'bg-zinc-600',
    badgeBg: 'bg-zinc-600/10 dark:bg-zinc-600/20',
    badgeText: 'text-zinc-700 dark:text-zinc-300',
    badgeBorder: 'border-zinc-600/30 dark:border-zinc-400/30',
    headerBg: 'bg-zinc-600/5 dark:bg-zinc-600/10',
    headerBorder: 'border-zinc-600/30 dark:border-zinc-400/30',
    barBg: 'bg-zinc-600',
    ringClass: 'ring-zinc-600/30 border-zinc-600/40'
  }
]

export function getGroupTheme(colorKey?: string): GroupTheme {
  if (!colorKey) return GROUP_THEMES[0]
  const match = GROUP_THEMES.find(
    (t) => t.id === colorKey || t.hex.toLowerCase() === colorKey.toLowerCase()
  )
  return match || GROUP_THEMES[0]
}

let memoryColorsCache: Record<string, string> | null = null

export function resetMemoryColorsCache(): void {
  memoryColorsCache = null
}

export function getSavedGroupColors(): Record<string, string> {
  if (memoryColorsCache !== null) {
    return { ...memoryColorsCache }
  }
  memoryColorsCache = {}
  return {}
}

/**
 * Returns a random color from GROUP_THEMES that has not yet been assigned to any group.
 * If all 16 colors are currently taken, picks a random color from the full 16 palette.
 */
export function getRandomUnusedColor(usedColors?: (string | undefined)[]): GroupColorId {
  const usedSet = new Set(
    (usedColors || []).filter((c): c is string => Boolean(c)).map((c) => c.toLowerCase())
  )

  const available = GROUP_THEMES.filter((t) => !usedSet.has(t.id.toLowerCase()))
  if (available.length > 0) {
    const idx = Math.floor(Math.random() * available.length)
    return available[idx].id
  }

  // Graceful fallback if more than 16 groups exist: random choice from all 16
  const fallbackIdx = Math.floor(Math.random() * GROUP_THEMES.length)
  return GROUP_THEMES[fallbackIdx].id
}

/**
 * Maps each currently assigned colorId to the group tag that is using it.
 * If currentTag is provided, its own color is excluded so that a group being edited can retain its color.
 */
export function getUsedGroupColorsMap(
  currentTag?: string,
  existingGroups?: { tag: string; color?: string }[]
): Map<string, string> {
  const map = new Map<string, string>()
  const cleanCurrent = currentTag?.trim().toLowerCase()

  if (existingGroups && existingGroups.length > 0) {
    for (const g of existingGroups) {
      const tagClean = g.tag?.trim()
      if (tagClean && tagClean.toLowerCase() !== 'untagged') {
        if (!cleanCurrent || tagClean.toLowerCase() !== cleanCurrent) {
          const colorKey = g.color?.toLowerCase()
          if (colorKey && !map.has(colorKey)) {
            map.set(colorKey, tagClean)
          }
        }
      }
    }
  } else {
    const saved = getSavedGroupColors()
    for (const [tag, color] of Object.entries(saved)) {
      if (tag && tag.toLowerCase() !== 'untagged') {
        if (!cleanCurrent || tag.toLowerCase() !== cleanCurrent) {
          const colorKey = color?.toLowerCase()
          if (colorKey && !map.has(colorKey)) {
            map.set(colorKey, tag)
          }
        }
      }
    }
  }

  return map
}

export function saveGroupColor(groupTag: string, colorId: string): void {
  try {
    const cleanTag = groupTag.trim().toLowerCase()
    if (!cleanTag || cleanTag === 'untagged') return
    const current = getSavedGroupColors()
    current[cleanTag] = colorId
    memoryColorsCache = { ...current }

    if (typeof window !== 'undefined' && window.api?.goals?.setGroupColor) {
      window.api.goals.setGroupColor(cleanTag, colorId).catch(() => {})
    }
  } catch {
    // Ignore storage errors
  }
}

export function deleteSavedGroupColor(groupTag: string): void {
  try {
    const cleanTag = groupTag.trim().toLowerCase()
    if (!cleanTag) return
    const current = getSavedGroupColors()
    delete current[cleanTag]
    memoryColorsCache = { ...current }

    if (typeof window !== 'undefined' && window.api?.goals?.deleteGroupColor) {
      window.api.goals.deleteGroupColor(cleanTag).catch(() => {})
    }
  } catch {
    // Ignore storage errors
  }
}

/**
 * Hydrates locally saved group colors from remote/persisted storage (e.g. SQLite or cloud sync).
 * Merges persisted colors, with remote/persisted settings taking precedence over local storage by default.
 */
export function hydrateSavedGroupColors(
  remoteColors: Record<string, string>,
  preferRemote = true
): Record<string, string> {
  try {
    const current = getSavedGroupColors()
    const merged = preferRemote ? { ...current, ...remoteColors } : { ...remoteColors, ...current }

    memoryColorsCache = { ...merged }
    return merged
  } catch {
    return remoteColors || {}
  }
}

/**
 * Scans task goals to recover and persist any group colors assigned directly on goals
 * that may be missing in group color settings (e.g., after clearing browser storage).
 */
export function syncGroupColorsFromGoals(
  goals: { groupTag?: string; groupColor?: string }[]
): void {
  try {
    const current = getSavedGroupColors()
    let changed = false
    const newAssignments: Record<string, string> = {}

    for (const g of goals) {
      const tag = g.groupTag?.trim().toLowerCase()
      if (tag && tag !== 'untagged' && g.groupColor && !current[tag]) {
        current[tag] = g.groupColor
        newAssignments[tag] = g.groupColor
        changed = true
      }
    }

    if (changed) {
      memoryColorsCache = { ...current }
      if (typeof window !== 'undefined' && window.api?.goals?.setGroupColor) {
        for (const [tag, color] of Object.entries(newAssignments)) {
          window.api.goals.setGroupColor(tag, color).catch(() => {})
        }
      }
    }
  } catch {
    // Ignore storage errors
  }
}

/**
 * Ensures all groups have distinct, differentiating colors.
 * Resolves duplicate colors and assigns valid colors so each group has a unique color.
 * Stably handles cases where active tags exceed palette size without infinite loops.
 */
export function ensureUniqueGroupColors(
  activeTags: string[],
  customCreated?: Record<string, string>
): Record<string, GroupColorId> {
  try {
    const saved = getSavedGroupColors()
    const claimedColors = new Set<string>()
    const assignedTags = new Set<string>()
    const updated: Record<string, string> = { ...saved }
    const changedKeys: string[] = []

    const allTags = Array.from(
      new Set([
        ...activeTags.map((t) => t.trim()),
        ...Object.keys(customCreated || {}).map((t) => t.trim())
      ])
    ).filter((t) => t && t.toLowerCase() !== 'untagged')

    // First pass: preserve valid, unique colors already from the 16 themes
    for (const tag of allTags) {
      const key = tag.toLowerCase()
      const color = (saved[key] || customCreated?.[tag])?.toLowerCase()
      if (color && !claimedColors.has(color)) {
        const isValidTheme = GROUP_THEMES.some((t) => t.id === color)
        if (isValidTheme) {
          claimedColors.add(color)
          assignedTags.add(key)
          updated[key] = color
        }
      }
    }

    // Second pass: for tags not yet assigned (either duplicate, invalid, or missing color)
    for (const tag of allTags) {
      const key = tag.toLowerCase()
      if (!assignedTags.has(key)) {
        const existingColor = (saved[key] || customCreated?.[tag])?.toLowerCase()
        const isExistingValidTheme =
          existingColor && GROUP_THEMES.some((t) => t.id === existingColor)

        // If there are still unused colors in the 16 themes, assign a new unique color
        if (claimedColors.size < GROUP_THEMES.length) {
          const newColor = getRandomUnusedColor(Array.from(claimedColors))
          claimedColors.add(newColor)
          assignedTags.add(key)
          if (updated[key] !== newColor) {
            updated[key] = newColor
            changedKeys.push(key)
          }
        } else if (isExistingValidTheme) {
          // All 16 colors claimed! Keep existing valid theme color to prevent infinite re-generation loops
          assignedTags.add(key)
          updated[key] = existingColor!
        } else {
          // No color or invalid color, and all 16 are taken: fallback to a valid theme color deterministically
          const fallbackColor = getRandomUnusedColor()
          assignedTags.add(key)
          if (updated[key] !== fallbackColor) {
            updated[key] = fallbackColor
            changedKeys.push(key)
          }
        }
      }
    }

    if (changedKeys.length > 0) {
      memoryColorsCache = { ...updated }
      if (typeof window !== 'undefined' && window.api?.goals?.setGroupColor) {
        for (const tag of changedKeys) {
          const col = updated[tag]
          if (col) window.api.goals.setGroupColor(tag, col).catch(() => {})
        }
      }
    }

    return updated as Record<string, GroupColorId>
  } catch {
    return {} as Record<string, GroupColorId>
  }
}

/**
 * Gets preferred group color. Pure read selector that does not mutate storage or trigger IPC.
 * If color is not chosen/saved, deterministically assigns a color from available themes.
 */
export function getPreferredGroupColor(
  groupTag: string,
  defaultColor?: GroupColorId,
  usedColors?: string[]
): GroupColorId {
  if (!groupTag) return defaultColor || getRandomUnusedColor(usedColors)
  const saved = getSavedGroupColors()
  const cleanTag = groupTag.trim().toLowerCase()
  const existing = saved[cleanTag] as GroupColorId | undefined

  // If already saved with a valid theme, use it
  if (existing && GROUP_THEMES.some((t) => t.id === existing)) {
    return existing
  }

  // If defaultColor is provided and valid, use it
  if (defaultColor && GROUP_THEMES.some((t) => t.id === defaultColor)) {
    return defaultColor
  }

  // Pure deterministic fallback from available colors without mutating storage or firing IPC
  const used = usedColors || Object.values(saved)
  const usedSet = new Set(used.map((c) => c.toLowerCase()))
  const available = GROUP_THEMES.filter((t) => !usedSet.has(t.id))
  const pool = available.length > 0 ? available : GROUP_THEMES

  let hash = 0
  for (let i = 0; i < cleanTag.length; i++) {
    hash = (hash << 5) - hash + cleanTag.charCodeAt(i)
    hash |= 0
  }
  const index = Math.abs(hash) % pool.length
  return pool[index].id
}
