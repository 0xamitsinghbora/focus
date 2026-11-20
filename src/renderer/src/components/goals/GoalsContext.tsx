import { createContext, useContext, ReactNode } from 'react'
import { DailyGoal } from '../../../../shared/types'
import { ColumnId, DragState, HoverTarget, GroupHoverTarget } from './types'
import type { ExistingGroup } from './hooks/useGoalsOrganize'

export interface GoalsContextType {
  // State
  dailyGoals: DailyGoal[]
  selectedGoalIds: Set<string>
  activeGoalId: string | null
  editingId: string | null
  goalLoggedMinutesMap: Record<string, number>
  groupByTag: boolean
  existingGroups: ExistingGroup[]
  dayCutoffHour: number
  drag: DragState | null
  hoverColumn: ColumnId | null
  hoverTarget: HoverTarget | null
  hoverGroupTarget: GroupHoverTarget | null

  // Card & Drag Actions
  onPointerDownCard: (e: React.PointerEvent, goal: DailyGoal, sourceCol: ColumnId) => void
  onPointerDownGroup?: (
    e: React.PointerEvent,
    groupTag: string,
    groupGoals: DailyGoal[],
    sourceCol: ColumnId,
    color?: string,
    isUntagged?: boolean
  ) => void
  setActiveGoalId: (id: string | null) => void
  toggleSelectGoal: (goalId: string, isShift: boolean, isSpace: boolean) => void
  selectSingle?: (goalId: string) => void
  startEdit: (goal: DailyGoal) => void
  handleSaveEdit: (
    goal: DailyGoal,
    data: {
      title: string
      note?: string
      deadline?: string
      remindAt?: string
      repeat?: string
      groupTag?: string
      groupColor?: string
      targetMinutes?: number
      goalType?: 'deep' | 'routine'
    }
  ) => Promise<void>
  cancelEdit: () => void
  setContextMenu: (menu: { goal: DailyGoal; x: number; y: number } | null) => void
  isGoalFocused: (id: string) => boolean
  startFocus: (goal: DailyGoal) => void
  togglePause: () => void
  moveGoal: (goal: DailyGoal, newStatus: DailyGoal['status']) => Promise<void>
  onCarryToToday?: (goal: DailyGoal) => Promise<void>
  onRescheduleGoal?: (goal: DailyGoal, deadline?: string) => Promise<void>
  longPressTriggeredRef?: React.MutableRefObject<boolean>
  didDragOccurRef?: React.MutableRefObject<boolean>
}

const GoalsContext = createContext<GoalsContextType | null>(null)

export function GoalsContextProvider({
  children,
  value
}: {
  children: ReactNode
  value: GoalsContextType
}): React.JSX.Element {
  return <GoalsContext.Provider value={value}>{children}</GoalsContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useGoalsContext(): GoalsContextType | null {
  return useContext(GoalsContext)
}
