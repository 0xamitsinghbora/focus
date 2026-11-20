import { createContext, useContext } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { DailyGoal } from '../../../shared/types'
import { useFocusSessionStore } from './focusSessionStore'

export interface FocusSessionActions {
  startFocus: (goal?: DailyGoal | null, durationMinutes?: number) => Promise<void>
  startBreak: (breakMinutes?: number) => Promise<void> | void
  pauseFocus: () => void
  resumeFocus: () => void
  togglePause: () => void
  addMinutes: (mins: number) => void
  setSessionNote: (note: string) => void
  openZenMode: () => void
  closeZenMode: () => void
  toggleZenMode: () => void
  setIsMinimized: (min: boolean) => void
  toggleMinimized: () => void
  completeTask: (noteOverride?: string) => Promise<void>
  endSession: (noteOverride?: string) => Promise<void>
  isGoalFocused: (goalId: string) => boolean
  restartSession?: () => Promise<void>
  logMeditation?: (seconds?: number) => Promise<void>
}

export const FocusSessionActionsContext = createContext<FocusSessionActions | null>(null)

export interface FocusSessionProviderProps {
  children: React.ReactNode
  onUpdateDailyGoal?: (goal: DailyGoal) => Promise<void>
  onDataRefresh?: () => Promise<void>
  availableGoals?: DailyGoal[]
  dayCutoffHour?: number
  defaultIntervalMinutes?: number
}

export function useFocusSessionActions(): FocusSessionActions {
  const ctx = useContext(FocusSessionActionsContext)
  if (!ctx) {
    throw new Error('useFocusSessionActions must be used within a FocusSessionProvider')
  }
  return ctx
}

export function useFocusSessionState(): {
  isActive: boolean
  isPaused: boolean
  isBreak: boolean
  activeGoal: DailyGoal | null
} {
  return useFocusSessionStore(
    useShallow((s) => ({
      isActive: s.isActive,
      isPaused: s.isPaused,
      isBreak: s.isBreak,
      activeGoal: s.activeGoal
    }))
  )
}
