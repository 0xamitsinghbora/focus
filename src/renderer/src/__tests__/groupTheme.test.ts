import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getGroupTheme,
  saveGroupColor,
  getSavedGroupColors,
  deleteSavedGroupColor,
  getPreferredGroupColor,
  getRandomUnusedColor,
  ensureUniqueGroupColors,
  getUsedGroupColorsMap,
  hydrateSavedGroupColors,
  syncGroupColorsFromGoals,
  resetMemoryColorsCache,
  GROUP_THEMES
} from '../lib/groupTheme'

describe('groupTheme Library', () => {
  beforeEach(() => {
    resetMemoryColorsCache()
  })

  it('provides exactly 16 different color options', () => {
    expect(GROUP_THEMES).toHaveLength(16)
    const ids = GROUP_THEMES.map((t) => t.id)
    const hexes = GROUP_THEMES.map((t) => t.hex.toLowerCase())
    expect(new Set(ids).size).toBe(16)
    expect(new Set(hexes).size).toBe(16)
  })

  it('excludes red, green, and yellow from the 16 color options', () => {
    const ids = GROUP_THEMES.map((t) => t.id.toLowerCase())
    const names = GROUP_THEMES.map((t) => t.name.toLowerCase())

    // None should be red, green, or yellow
    expect(ids).not.toContain('red')
    expect(ids).not.toContain('green')
    expect(ids).not.toContain('yellow')
    expect(ids).not.toContain('amber')
    expect(ids).not.toContain('rose')

    for (const name of names) {
      expect(name).not.toMatch(/\bred\b|\bgreen\b|\byellow\b|\bamber\b/)
    }
  })

  it('returns default theme when colorKey is undefined or empty', () => {
    const theme = getGroupTheme()
    expect(theme.id).toBe(GROUP_THEMES[0].id)
  })

  it('matches theme by id or hex color', () => {
    const blueTheme = getGroupTheme('blue')
    expect(blueTheme.id).toBe('blue')

    const hexMatch = getGroupTheme(blueTheme.hex)
    expect(hexMatch.id).toBe('blue')
  })

  it('returns default theme when colorKey is unknown', () => {
    const unknownTheme = getGroupTheme('non-existent-color')
    expect(unknownTheme.id).toBe(GROUP_THEMES[0].id)
  })

  it('saves and retrieves group colors from storage', () => {
    saveGroupColor('Backend', 'purple')
    const saved = getSavedGroupColors()
    expect(saved['backend']).toBe('purple')

    expect(getPreferredGroupColor('Backend')).toBe('purple')
  })

  it('deletes saved group colors', () => {
    saveGroupColor('Frontend', 'cyan')
    expect(getSavedGroupColors()['frontend']).toBe('cyan')

    deleteSavedGroupColor('Frontend')
    expect(getSavedGroupColors()['frontend']).toBeUndefined()
  })

  it('getRandomUnusedColor avoids used colors and returns a unique color', () => {
    const used = ['blue', 'cobalt', 'cyan', 'teal']
    const picked = getRandomUnusedColor(used)
    expect(used).not.toContain(picked)
    expect(GROUP_THEMES.some((t) => t.id === picked)).toBe(true)
  })

  it('does not give same color to different groups when color is not chosen', () => {
    const group1 = getPreferredGroupColor('Group1')
    const group2 = getPreferredGroupColor('Group2')
    const group3 = getPreferredGroupColor('Group3')

    expect(group1).not.toBe(group2)
    expect(group2).not.toBe(group3)
    expect(group1).not.toBe(group3)
  })

  it('ensureUniqueGroupColors resolves duplicate colors and invalid colors', () => {
    saveGroupColor('Frontend', 'blue')
    saveGroupColor('Planning', 'blue') // duplicate
    saveGroupColor('QA', 'blue') // duplicate
    saveGroupColor('Devops', 'invalid-color-1')
    saveGroupColor('Data', 'invalid-color-2')

    const result = ensureUniqueGroupColors(['Frontend', 'Planning', 'QA', 'Devops', 'Data'])

    // All groups must now have distinct colors
    const colors = Object.values(result)
    expect(new Set(colors).size).toBe(5)

    for (const color of colors) {
      expect(GROUP_THEMES.some((t) => t.id === color)).toBe(true)
    }
  })

  it('getUsedGroupColorsMap accurately tracks colors in use and excludes current group', () => {
    saveGroupColor('Frontend', 'blue')
    saveGroupColor('Backend', 'purple')
    saveGroupColor('Design', 'cyan')

    // When creating a new group (no currentTag)
    const mapNew = getUsedGroupColorsMap()
    expect(mapNew.get('blue')).toBe('frontend')
    expect(mapNew.get('purple')).toBe('backend')
    expect(mapNew.get('cyan')).toBe('design')
    expect(mapNew.get('orange')).toBeUndefined()

    // When editing 'Backend' - its own color 'purple' should not be marked as in use by another group
    const mapEdit = getUsedGroupColorsMap('Backend')
    expect(mapEdit.get('blue')).toBe('frontend')
    expect(mapEdit.get('purple')).toBeUndefined() // Backend's own color is available
    expect(mapEdit.get('cyan')).toBe('design')
  })

  it('hydrateSavedGroupColors merges remote settings with remote priority by default', () => {
    saveGroupColor('LocalGroup', 'indigo')

    hydrateSavedGroupColors({
      remotegroup: 'cobalt',
      localgroup: 'purple' // Overwrites localgroup by default (preferRemote=true)
    })

    const saved = getSavedGroupColors()
    expect(saved['remotegroup']).toBe('cobalt')
    expect(saved['localgroup']).toBe('purple')

    // With preferRemote=false, local values are preserved
    saveGroupColor('LocalGroup', 'teal')
    hydrateSavedGroupColors({ localgroup: 'orange' }, false)
    expect(getSavedGroupColors()['localgroup']).toBe('teal')
  })

  it('syncGroupColorsFromGoals populates missing colors from goals into memory cache', () => {
    syncGroupColorsFromGoals([
      { groupTag: 'Infra', groupColor: 'teal' },
      { groupTag: 'Untagged', groupColor: 'slate' },
      { groupTag: '', groupColor: 'blue' }
    ])

    const saved = getSavedGroupColors()
    expect(saved['infra']).toBe('teal')
    expect(saved['untagged']).toBeUndefined()
  })

  it('persists changes to window.api.goals when available', () => {
    const mockSet = vi.fn().mockResolvedValue({ success: true })
    const mockDelete = vi.fn().mockResolvedValue({ success: true })
    ;(window as any).api = {
      goals: {
        setGroupColor: mockSet,
        deleteGroupColor: mockDelete
      }
    }

    saveGroupColor('CloudTag', 'emerald')
    expect(mockSet).toHaveBeenCalledWith('cloudtag', 'emerald')

    deleteSavedGroupColor('CloudTag')
    expect(mockDelete).toHaveBeenCalledWith('cloudtag')

    delete (window as any).api
  })

  it('serves getSavedGroupColors from memory cache after initial load', () => {
    saveGroupColor('CacheTag', 'purple')
    const res1 = getSavedGroupColors()
    expect(res1['cachetag']).toBe('purple')
  })

  it('stably preserves existing colors when active groups exceed 16 without loops', () => {
    // Generate 20 distinct group tags
    const tags = Array.from({ length: 20 }, (_, i) => `Group_${i + 1}`)

    const firstRun = ensureUniqueGroupColors(tags)
    expect(Object.keys(firstRun)).toHaveLength(20)

    const mockSet = vi.fn().mockResolvedValue({ success: true })
    ;(window as any).api = {
      goals: { setGroupColor: mockSet }
    }

    // Second run should be a no-op since all tags now have valid theme colors
    const secondRun = ensureUniqueGroupColors(tags)
    expect(secondRun).toEqual(firstRun)
    expect(mockSet).not.toHaveBeenCalled()

    delete (window as any).api
  })

  it('guarantees getPreferredGroupColor is a pure selector without mutating storage or firing IPC', () => {
    const mockSetGroupColor = vi.fn().mockResolvedValue({ success: true })
    ;(window as any).api = {
      goals: { setGroupColor: mockSetGroupColor }
    }

    // Call getPreferredGroupColor on a tag that was never saved
    const colorA1 = getPreferredGroupColor('UnsavedGroupA')
    const colorA2 = getPreferredGroupColor('UnsavedGroupA')

    // Deterministic results across calls
    expect(colorA1).toBe(colorA2)
    expect(GROUP_THEMES.some((t) => t.id === colorA1)).toBe(true)

    // Must NOT trigger IPC during read
    expect(mockSetGroupColor).not.toHaveBeenCalled()
    expect(getSavedGroupColors()['unsavedgroupa']).toBeUndefined()

    delete (window as any).api
  })

  it('supports R-Y-G learning themes for Day 1 (Red), Day 7 (Yellow), Day 30 (Green)', () => {
    const redTheme = getGroupTheme('learning-red')
    expect(redTheme.hex).toBe('#ef4444')
    expect(redTheme.name).toBe('Day 1 Revision')

    const yellowTheme = getGroupTheme('learning-yellow')
    expect(yellowTheme.hex).toBe('#f59e0b')
    expect(yellowTheme.name).toBe('Day 7 Revision')

    const greenTheme = getGroupTheme('learning-green')
    expect(greenTheme.hex).toBe('#10b981')
    expect(greenTheme.name).toBe('Day 30 Revision')
  })
})
