import { useState, useMemo, useCallback, useEffect } from 'react'
import { AppSettings, DailyGoal, DEFAULT_SORT_ORDER, SyncTarget } from '../../../../../shared/types'
import { ColumnId, SortOption, resolveCanonicalTag } from '../types'
import {
  getPreferredGroupColor,
  ensureUniqueGroupColors,
  GroupColorId
} from '../../../lib/groupTheme'

export interface ExistingGroup {
  tag: string
  color: GroupColorId
}

export interface UseGoalsOrganizeReturn {
  selectedGroupFilter: string | 'all'
  setSelectedGroupFilter: (filter: string | 'all') => void
  sortOption: SortOption
  setSortOption: (sort: SortOption) => void
  groupByTag: boolean
  setGroupByTag: (group: boolean | ((prev: boolean) => boolean)) => void
  collapsedGroups: Record<string, boolean>
  setCollapsedGroups: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  toggleGroupCollapse: (key: string) => void
  collapsedCols: Record<ColumnId, boolean>
  setCollapsedCols: React.Dispatch<React.SetStateAction<Record<ColumnId, boolean>>>
  persistCollapsedColumns: (cols: Record<ColumnId, boolean>) => void
  toggleCollapse: (colId: ColumnId) => void
  toggleFocusMode: () => void
  existingGroups: ExistingGroup[]
  groupCounts: { counts: Record<string, number>; untagged: number; total: number }
  processedGoalsByColumn: Record<ColumnId, DailyGoal[]>
}

export function useGoalsOrganize(
  dailyGoals: DailyGoal[],
  customCreatedGroups: Record<string, GroupColorId> = {},
  groupRegistryVersion = 0
): UseGoalsOrganizeReturn {
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string | 'all'>('all')
  const [sortOption, setSortOptionState] = useState<SortOption>('due-date')
  const [groupByTag, setGroupByTag] = useState<boolean>(true)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const [collapsedCols, setCollapsedCols] = useState<Record<ColumnId, boolean>>({
    planned: false,
    in_progress: false,
    done: false
  })

  // Hydrate settings from SQLite / AppSettings on mount and sync on live data updates
  useEffect(() => {
    if (typeof window === 'undefined' || !window.api?.settings?.get) return

    const loadSettings = (): void => {
      window.api.settings
        .get()
        .then((settings: AppSettings) => {
          if (
            settings?.sortOption &&
            (settings.sortOption === 'due-date' ||
              settings.sortOption === 'alpha-asc' ||
              settings.sortOption === 'alpha-desc' ||
              settings.sortOption === 'manual' ||
              settings.sortOption === 'newest' ||
              settings.sortOption === 'oldest')
          ) {
            setSortOptionState(settings.sortOption as SortOption)
          }
          if (settings?.collapsedColumns) {
            const colState = {
              planned: Boolean(settings.collapsedColumns.planned),
              in_progress: Boolean(settings.collapsedColumns.in_progress),
              done: Boolean(settings.collapsedColumns.done)
            }
            setCollapsedCols(colState)
          }
        })
        .catch(() => {})
    }

    loadSettings()

    const unsub = window.api?.events?.onDataUpdated?.((target?: SyncTarget) => {
      if (!target || target.syncSettings) {
        loadSettings()
      }
    })

    return () => {
      if (typeof unsub === 'function') unsub()
    }
  }, [])

  const setSortOption = useCallback((opt: SortOption) => {
    setSortOptionState(opt)
    if (typeof window !== 'undefined' && window.api?.settings?.patch) {
      window.api.settings.patch({ sortOption: opt }).catch(() => {})
    } else if (
      typeof window !== 'undefined' &&
      window.api?.settings?.get &&
      window.api?.settings?.set
    ) {
      window.api.settings
        .get()
        .then((current: AppSettings) => {
          if (current.sortOption !== opt) {
            window.api.settings.set({ ...current, sortOption: opt }).catch(() => {})
          }
        })
        .catch(() => {})
    }
  }, [])

  const persistCollapsedColumns = useCallback((cols: Record<ColumnId, boolean>) => {
    if (typeof window !== 'undefined' && window.api?.settings?.patch) {
      window.api.settings.patch({ collapsedColumns: cols }).catch(() => {})
    } else if (
      typeof window !== 'undefined' &&
      window.api?.settings?.get &&
      window.api?.settings?.set
    ) {
      window.api.settings
        .get()
        .then((current: AppSettings) => {
          window.api.settings.set({ ...current, collapsedColumns: cols }).catch(() => {})
        })
        .catch(() => {})
    }
  }, [])

  const toggleCollapse = useCallback(
    (colId: ColumnId) => {
      setCollapsedCols((prev) => {
        const willBeCollapsed = !prev[colId]
        const next = { ...prev, [colId]: willBeCollapsed }
        persistCollapsedColumns(next)
        return next
      })
    },
    [persistCollapsedColumns]
  )

  const toggleFocusMode = useCallback(() => {
    setCollapsedCols((prev) => {
      const currentlyInFocus = prev.planned && prev.done && !prev.in_progress
      let next: Record<ColumnId, boolean>
      if (currentlyInFocus) {
        next = { planned: false, in_progress: false, done: false }
      } else {
        next = { planned: true, in_progress: false, done: true }
      }
      persistCollapsedColumns(next)
      return next
    })
  }, [persistCollapsedColumns])

  const toggleGroupCollapse = useCallback((key: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [key]: !prev[key]
    }))
  }, [])

  const existingGroups = useMemo<ExistingGroup[]>(() => {
    const activeTags = dailyGoals
      .map((g) => g.groupTag?.trim())
      .filter((t): t is string => Boolean(t && t.toLowerCase() !== 'untagged'))
    const combined = Array.from(new Set([...activeTags, ...Object.keys(customCreatedGroups)]))
    const uniqueMap = ensureUniqueGroupColors(combined, customCreatedGroups)

    const map = new Map<string, { displayTag: string; color: GroupColorId }>()

    for (const [tag, color] of Object.entries(customCreatedGroups)) {
      const clean = tag.trim()
      if (clean && clean.toLowerCase() !== 'untagged') {
        const key = clean.toLowerCase()
        const uniqueColor = uniqueMap[key] || color || getPreferredGroupColor(clean)
        map.set(key, { displayTag: clean, color: uniqueColor })
      }
    }

    for (const g of dailyGoals) {
      const tag = g.groupTag?.trim()
      if (tag && tag.toLowerCase() !== 'untagged') {
        const key = tag.toLowerCase()
        const uniqueColor = uniqueMap[key] || getPreferredGroupColor(tag)
        const existing = map.get(key)
        if (existing) {
          existing.displayTag = resolveCanonicalTag(existing.displayTag, tag)
          existing.color = uniqueColor
        } else {
          map.set(key, { displayTag: tag, color: uniqueColor })
        }
      }
    }

    void groupRegistryVersion
    return Array.from(map.values()).map(({ displayTag, color }) => ({
      tag: displayTag,
      color: color || getPreferredGroupColor(displayTag)
    }))
  }, [dailyGoals, customCreatedGroups, groupRegistryVersion])

  const groupCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    let untagged = 0
    const lowerCounts: Record<string, number> = {}

    for (const g of dailyGoals) {
      const tag = g.groupTag?.trim()
      if (tag && tag.toLowerCase() !== 'untagged') {
        const lower = tag.toLowerCase()
        lowerCounts[lower] = (lowerCounts[lower] || 0) + 1
      } else {
        untagged++
      }
    }

    for (const eg of existingGroups) {
      const total = lowerCounts[eg.tag.toLowerCase()] || 0
      counts[eg.tag] = total
      counts[eg.tag.toLowerCase()] = total
    }

    for (const g of dailyGoals) {
      const tag = g.groupTag?.trim()
      if (tag && tag.toLowerCase() !== 'untagged') {
        const total = lowerCounts[tag.toLowerCase()] || 0
        counts[tag] = total
        counts[tag.toLowerCase()] = total
      }
    }

    return { counts, untagged, total: dailyGoals.length }
  }, [dailyGoals, existingGroups])

  useEffect(() => {
    if (selectedGroupFilter !== 'all' && selectedGroupFilter !== '__untagged__') {
      const exists = existingGroups.some(
        (g) => g.tag.toLowerCase() === selectedGroupFilter.toLowerCase()
      )
      if (!exists) {
        setSelectedGroupFilter('all')
      }
    }
  }, [existingGroups, selectedGroupFilter])

  const processedGoalsByColumn = useMemo(() => {
    const map: Record<ColumnId, DailyGoal[]> = {
      planned: [],
      in_progress: [],
      done: []
    }

    let filtered = dailyGoals
    if (selectedGroupFilter !== 'all') {
      if (selectedGroupFilter === '__untagged__') {
        filtered = filtered.filter(
          (g) => !g.groupTag?.trim() || g.groupTag.trim().toLowerCase() === 'untagged'
        )
      } else {
        filtered = filtered.filter(
          (g) => g.groupTag?.trim().toLowerCase() === selectedGroupFilter.toLowerCase()
        )
      }
    }

    for (const g of filtered) {
      if (g.status === 'in_progress') map.in_progress.push(g)
      else if (g.status === 'done') map.done.push(g)
      else if (g.status === 'planned') map.planned.push(g)
    }

    const sortFn = (a: DailyGoal, b: DailyGoal): number => {
      if (sortOption === 'alpha-asc') {
        const cmp = a.title.localeCompare(b.title)
        return cmp !== 0 ? cmp : a.createdAt.localeCompare(b.createdAt)
      }
      if (sortOption === 'alpha-desc') {
        const cmp = b.title.localeCompare(a.title)
        return cmp !== 0 ? cmp : a.createdAt.localeCompare(b.createdAt)
      }
      if (sortOption === 'due-date') {
        if (!a.deadline && !b.deadline) return a.createdAt.localeCompare(b.createdAt)
        if (!a.deadline) return 1
        if (!b.deadline) return -1
        const deadA = a.deadline.length === 10 ? `${a.deadline}T23:59:59` : a.deadline
        const deadB = b.deadline.length === 10 ? `${b.deadline}T23:59:59` : b.deadline
        const timeA = Date.parse(deadA)
        const timeB = Date.parse(deadB)
        if (!Number.isNaN(timeA) && !Number.isNaN(timeB)) {
          const diff = timeA - timeB
          if (diff !== 0) return diff
        } else {
          const cmp = deadA.localeCompare(deadB)
          if (cmp !== 0) return cmp
        }
        return a.createdAt.localeCompare(b.createdAt)
      }
      if (sortOption === 'newest') return b.createdAt.localeCompare(a.createdAt)
      if (sortOption === 'oldest') return a.createdAt.localeCompare(b.createdAt)
      const orderA = typeof a.sortOrder === 'number' ? a.sortOrder : DEFAULT_SORT_ORDER
      const orderB = typeof b.sortOrder === 'number' ? b.sortOrder : DEFAULT_SORT_ORDER
      if (orderA !== orderB) return orderA - orderB
      return a.createdAt.localeCompare(b.createdAt)
    }

    map.planned.sort(sortFn)
    map.in_progress.sort(sortFn)
    map.done.sort(sortFn)

    return map
  }, [dailyGoals, selectedGroupFilter, sortOption])

  return {
    selectedGroupFilter,
    setSelectedGroupFilter,
    sortOption,
    setSortOption,
    groupByTag,
    setGroupByTag,
    collapsedGroups,
    setCollapsedGroups,
    toggleGroupCollapse,
    collapsedCols,
    setCollapsedCols,
    persistCollapsedColumns,
    toggleCollapse,
    toggleFocusMode,
    existingGroups,
    groupCounts,
    processedGoalsByColumn
  }
}
