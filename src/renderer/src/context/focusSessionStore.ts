import { create } from 'zustand'
import { DailyGoal, SessionTimerPayload } from '../../../shared/types'

export interface FocusSessionLifecycleState {
  isHydrated: boolean
  activeGoal: DailyGoal | null
  isActive: boolean
  isPaused: boolean
  isBreak: boolean
  isAfk: boolean
  isOvertime: boolean
  startedAt: string | null
  effectiveDate: string | null
  sessionNote: string
  isZenOpen: boolean
  isMinimized: boolean
  snoozeCount: number
}

export interface FocusSessionTimerState {
  totalSeconds: number
  secondsRemaining: number
  secondsElapsed: number
}

interface FocusSessionTimingMeta {
  sessionStartEpoch: number
  pauseStartEpoch: number
  accumulatedPausedMs: number
  targetSeconds: number
  emptyInProgressStartEpoch: number
  afkBreakStartEpoch: number
}

export interface FocusSessionStoreState
  extends FocusSessionLifecycleState, FocusSessionTimerState, FocusSessionTimingMeta {
  // Atomic setters
  setTimer: (remaining: number, elapsed: number, total: number) => void
  setIsOvertime: (isOvertime: boolean) => void
  setActiveGoal: (goal: DailyGoal | null) => void
  setStartedAt: (startedAt: string | null) => void
  setSessionNote: (note: string) => void
  setIsZenOpen: (open: boolean | ((prev: boolean) => boolean)) => void
  setIsMinimized: (minimized: boolean | ((prev: boolean) => boolean)) => void
  setTimingMeta: (meta: Partial<FocusSessionTimingMeta>) => void
  setLifecycle: (lifecycle: Partial<FocusSessionLifecycleState>) => void
  applyAuthoritativeSession: (payload: SessionTimerPayload, availableGoals?: DailyGoal[]) => void
  resetSession: () => void
}

const INITIAL_STATE = {
  isHydrated: typeof window === 'undefined' || !window.api?.session?.getState,
  activeGoal: null as DailyGoal | null,
  isActive: false,
  isPaused: false,
  isBreak: false,
  isAfk: false,
  isOvertime: false,
  startedAt: null as string | null,
  effectiveDate: null as string | null,
  sessionNote: '',
  isZenOpen: false,
  isMinimized: false,
  snoozeCount: 0,
  totalSeconds: 45 * 60,
  secondsRemaining: 45 * 60,
  secondsElapsed: 0,
  sessionStartEpoch: 0,
  pauseStartEpoch: 0,
  accumulatedPausedMs: 0,
  targetSeconds: 45 * 60,
  emptyInProgressStartEpoch: 0,
  afkBreakStartEpoch: 0
}

export const useFocusSessionStore = create<FocusSessionStoreState>((set) => ({
  ...INITIAL_STATE,

  setTimer: (remaining, elapsed, total) =>
    set({
      secondsRemaining: remaining,
      secondsElapsed: elapsed,
      totalSeconds: total
    }),

  setIsOvertime: (isOvertime) => set({ isOvertime }),

  setActiveGoal: (goal) => set({ activeGoal: goal }),

  setStartedAt: (startedAt) => set({ startedAt }),

  setSessionNote: (sessionNote) => set({ sessionNote }),

  setIsZenOpen: (open) =>
    set((state) => ({
      isZenOpen: typeof open === 'function' ? open(state.isZenOpen) : open
    })),

  setIsMinimized: (minimized) =>
    set((state) => ({
      isMinimized: typeof minimized === 'function' ? minimized(state.isMinimized) : minimized
    })),

  setTimingMeta: (meta) => set((state) => ({ ...state, ...meta })),

  setLifecycle: (lifecycle) => set((state) => ({ ...state, ...lifecycle })),

  applyAuthoritativeSession: (payload, availableGoals) => {
    if (!payload.isActive) {
      set({
        ...INITIAL_STATE,
        isHydrated: true,
        totalSeconds: 0,
        secondsRemaining: 0,
        secondsElapsed: 0
      })
      return
    }

    set((state) => {
      const now = Date.now()
      const startEpoch = payload.startedAt
        ? new Date(payload.startedAt).getTime()
        : state.sessionStartEpoch || now - (payload.totalSeconds - payload.secondsRemaining) * 1000

      const pauseEpoch = payload.pauseStartEpoch ?? 0
      const accumulatedPaused = payload.accumulatedPausedMs ?? 0
      const totalSec = payload.totalSeconds || state.totalSeconds
      const remainingSec = payload.secondsRemaining
      const elapsed = Math.max(0, totalSec - remainingSec)

      let goal = state.activeGoal
      if (payload.goalId || payload.goalTitle) {
        const found = availableGoals?.find((g) =>
          payload.goalId ? g.id === payload.goalId : g.title === payload.goalTitle
        )
        if (found) {
          goal = found
        }
      } else if (payload.isBreak) {
        goal = null
      }

      return {
        isHydrated: true,
        isActive: true,
        isPaused: Boolean(payload.isPaused),
        isBreak: Boolean(payload.isBreak),
        isAfk: Boolean(payload.isAfk),
        isOvertime: Boolean(payload.isOvertime),
        totalSeconds: totalSec,
        secondsRemaining: remainingSec,
        secondsElapsed: elapsed,
        sessionStartEpoch: startEpoch,
        afkBreakStartEpoch: payload.afkBreakStartEpoch || 0,
        pauseStartEpoch: pauseEpoch,
        accumulatedPausedMs: accumulatedPaused,
        targetSeconds: totalSec,
        startedAt: payload.startedAt || state.startedAt || new Date(startEpoch).toISOString(),
        effectiveDate: payload.effectiveDate || state.effectiveDate || null,
        sessionNote: payload.sessionNote !== undefined ? payload.sessionNote : state.sessionNote,
        activeGoal: goal,
        emptyInProgressStartEpoch: 0
      }
    })
  },

  resetSession: () =>
    set({
      ...INITIAL_STATE,
      isHydrated: true,
      totalSeconds: 25 * 60,
      secondsRemaining: 0,
      secondsElapsed: 0
    })
}))

// Atomic selector hooks for maximum rendering efficiency
export const useSessionIsActive = (): boolean => useFocusSessionStore((s) => s.isActive)
export const useSessionIsPaused = (): boolean => useFocusSessionStore((s) => s.isPaused)
export const useSessionIsBreak = (): boolean => useFocusSessionStore((s) => s.isBreak)
export const useSessionIsAfk = (): boolean => useFocusSessionStore((s) => s.isAfk)
export const useSessionActiveGoal = (): DailyGoal | null =>
  useFocusSessionStore((s) => s.activeGoal)
export const useSessionTotalSeconds = (): number => useFocusSessionStore((s) => s.totalSeconds)
