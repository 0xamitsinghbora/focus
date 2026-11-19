import { DailyGoal, localDateStr } from '../../../../shared/types'
import { getGroupTheme, getPreferredGroupColor } from '../../lib/groupTheme'

export interface ColumnGroup {
  tag: string
  isUntagged: boolean
  goals: DailyGoal[]
  colorTheme: ReturnType<typeof getGroupTheme>
}

export function resolveCanonicalTag(existing: string, incoming: string): string {
  if (!existing) return incoming
  if (!incoming) return existing
  if (existing.toLowerCase() !== incoming.toLowerCase()) return incoming
  if (existing === existing.toLowerCase() && incoming !== incoming.toLowerCase()) {
    return incoming
  }
  return existing
}

export function partitionColumnGroups(goals: DailyGoal[]): ColumnGroup[] {
  const groupsMap = new Map<
    string,
    {
      tag: string
      isUntagged: boolean
      goals: DailyGoal[]
    }
  >()

  for (const g of goals) {
    const rawTag = g.groupTag?.trim()
    const isUntagged = !rawTag || rawTag.toLowerCase() === 'untagged'
    const key = isUntagged ? '__untagged__' : rawTag.toLowerCase()

    if (!groupsMap.has(key)) {
      groupsMap.set(key, {
        tag: isUntagged ? 'Untagged' : rawTag,
        isUntagged,
        goals: [g]
      })
    } else {
      const entry = groupsMap.get(key)!
      entry.goals.push(g)
      if (!isUntagged) {
        entry.tag = resolveCanonicalTag(entry.tag, rawTag)
      }
    }
  }

  const res: ColumnGroup[] = []
  for (const { tag, isUntagged, goals: groupGoals } of groupsMap.values()) {
    const explicitColor = groupGoals.find((g) => g.groupColor)?.groupColor
    const colorKey = isUntagged
      ? explicitColor || getPreferredGroupColor('Untagged', 'slate')
      : explicitColor || getPreferredGroupColor(tag)
    res.push({
      tag,
      isUntagged,
      goals: groupGoals,
      colorTheme: getGroupTheme(colorKey)
    })
  }
  return res
}

export type ColumnId = 'planned' | 'in_progress' | 'done'

type DragType = 'card' | 'group' | 'multi'

export type HoverTarget =
  | {
      type: 'card'
      targetGoalId: string
      position: 'before' | 'after'
      col: ColumnId
      groupTag?: string
      groupColor?: string
    }
  | {
      type: 'group'
      groupTag: string
      isUntagged: boolean
      col: ColumnId
      groupColor?: string
    }
  | {
      type: 'column'
      col: ColumnId
    }

export type GroupHoverTarget =
  | {
      type: 'group'
      targetGroupTag: string
      isUntagged: boolean
      col: ColumnId
      position: 'before' | 'after'
    }
  | {
      type: 'column'
      col: ColumnId
    }

export interface DragState {
  type: DragType
  payload: {
    id?: string
    title: string
    groupTag?: string
    groupColor?: string
    count?: number
    sourceGoalIds?: string[]
    isUntagged?: boolean
  }
  sourceCol: ColumnId
  originX: number
  originY: number
  x: number
  y: number
  active: boolean
}

export type SortOption = 'manual' | 'alpha-asc' | 'alpha-desc' | 'due-date' | 'newest' | 'oldest'

export const DRAG_THRESHOLD = 8

export interface ColumnDef {
  id: ColumnId
  label: string
  accent: string
  hoverRing: string
  status: DailyGoal['status']
}

export const COLUMNS: ColumnDef[] = [
  {
    id: 'planned',
    label: 'Planned',
    accent: 'bg-apple-red',
    hoverRing: 'ring-apple-red/30 border-apple-red/40',
    status: 'planned'
  },
  {
    id: 'in_progress',
    label: 'In Progress',
    accent: 'bg-apple-amber',
    hoverRing: 'ring-apple-amber/30 border-apple-amber/40',
    status: 'in_progress'
  },
  {
    id: 'done',
    label: 'Completed',
    accent: 'bg-apple-green',
    hoverRing: 'ring-apple-green/30 border-apple-green/40',
    status: 'done'
  }
]

export interface GoalsPanelProps {
  dailyGoals: DailyGoal[]
  onAddDailyGoal: (
    title: string,
    targetMinutes?: number,
    deadline?: string,
    note?: string,
    remindAt?: string,
    repeat?: string,
    groupTag?: string,
    groupColor?: string,
    status?: DailyGoal['status']
  ) => Promise<void>
  onUpdateDailyGoal: (goal: DailyGoal) => Promise<void>
  onUpdateDailyGoals?: (goals: DailyGoal[]) => Promise<void>
  onDeleteDailyGoal?: (goal: DailyGoal) => Promise<void>
  onDeleteDailyGoals?: (goals: DailyGoal[]) => Promise<void>
  onGoalRestored?: (goal: DailyGoal) => void
  onCarryDailyGoal?: (goal: DailyGoal) => Promise<void>
  triggerAdd?: number
  onResetTriggerAdd?: () => void
  isActive?: boolean
  goalLoggedMinutesMap?: Record<string, number>
  onNavigateToToday?: () => void
  dayCutoffHour?: number
}

export function getReschedulePresetDates(cutoffHour = 0): {
  today: string
  tomorrow: string
  thisWeekend: string
  nextWeek: string
} {
  const now = new Date()
  const today = localDateStr(now, cutoffHour)

  const tom = new Date(now)
  tom.setDate(tom.getDate() + 1)
  const tomorrow = localDateStr(tom, cutoffHour)

  const day = now.getDay()
  const daysUntilSat = day === 6 ? 7 : 6 - day
  const sat = new Date(now)
  sat.setDate(sat.getDate() + daysUntilSat)
  const thisWeekend = localDateStr(sat, cutoffHour)

  const daysUntilMon = day === 0 ? 1 : 8 - day
  const mon = new Date(now)
  mon.setDate(mon.getDate() + daysUntilMon)
  const nextWeek = localDateStr(mon, cutoffHour)

  return { today, tomorrow, thisWeekend, nextWeek }
}
