import { createContext, useContext, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { DailyGoal } from '../../../shared/types'
import {
  useFocusSessionStore,
  FocusSessionLifecycleState,
  FocusSessionTimerState
} from './focusSessionStore'

export {
  useFocusSessionStore,
  useSessionIsActive,
  useSessionRemainingSeconds
} from './focusSessionStore'
export type { FocusSessionLifecycleState, FocusSessionTimerState } from './focusSessionStore'

export interface FocusSessionState extends FocusSessionLifecycleState, FocusSessionTimerState {}

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

export interface FocusSessionContextType extends FocusSessionState, FocusSessionActions {}

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

export function useFocusSessionLifecycle(): FocusSessionLifecycleState {
  const ctx = useContext(FocusSessionActionsContext)
  if (!ctx) {
    throw new Error('useFocusSessionLifecycle must be used within a FocusSessionProvider')
  }
  return useFocusSessionStore(
    useShallow((s) => ({
      isHydrated: s.isHydrated,
      activeGoal: s.activeGoal,
      isActive: s.isActive,
      isPaused: s.isPaused,
      isBreak: s.isBreak,
      isAfk: s.isAfk,
      isOvertime: s.isOvertime,
      startedAt: s.startedAt,
      effectiveDate: s.effectiveDate,
      sessionNote: s.sessionNote,
      isZenOpen: s.isZenOpen,
      isMinimized: s.isMinimized,
      snoozeCount: s.snoozeCount
    }))
  )
}

export function useFocusSessionState(): FocusSessionLifecycleState {
  return useFocusSessionLifecycle()
}

export function useFocusSessionTimer(): FocusSessionTimerState {
  const ctx = useContext(FocusSessionActionsContext)
  if (!ctx) {
    throw new Error('useFocusSessionTimer must be used within a FocusSessionProvider')
  }
  return useFocusSessionStore(
    useShallow((s) => ({
      totalSeconds: s.totalSeconds,
      secondsRemaining: s.secondsRemaining,
      secondsElapsed: s.secondsElapsed
    }))
  )
}

export function useFocusSession(): FocusSessionContextType {
  const actions = useFocusSessionActions()
  const lifecycle = useFocusSessionLifecycle()
  const timer = useFocusSessionTimer()

  return useMemo(
    () => ({
      ...lifecycle,
      ...timer,
      ...actions
    }),
    [lifecycle, timer, actions]
  )
}
