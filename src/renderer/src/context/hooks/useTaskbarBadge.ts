import { useRef, useCallback } from 'react'
import { DailyGoal, SessionTimerPayload } from '../../../../shared/types'
import { createTimerBadgeDataUrl } from '../../lib/timerBadge'

export interface TaskbarTimerMetadata {
  startedAt?: string | null
  sessionStartEpoch?: number
  accumulatedPausedMs?: number
  pauseStartEpoch?: number
  sessionNote?: string
  emptyInProgressStartEpoch?: number
  isAfk?: boolean
  afkBreakStartEpoch?: number
}

export interface TaskbarBadgeHookResult {
  broadcastTaskbarTimer: (
    active: boolean,
    paused: boolean,
    isBreakSession: boolean,
    remainingSec: number,
    totalSec: number,
    goal?: DailyGoal | null,
    metaOverride?: TaskbarTimerMetadata
  ) => void
  clearBadgeState: () => void
  lastBroadcastSecRef: React.MutableRefObject<number | null>
}

export function useTaskbarBadge(getMetadata?: () => TaskbarTimerMetadata): TaskbarBadgeHookResult {
  const lastBroadcastSecRef = useRef<number | null>(null)
  const lastBadgeKeyRef = useRef<string>('')
  const lastBadgeDataUrlRef = useRef<string>('')
  const getMetadataRef = useRef(getMetadata)
  getMetadataRef.current = getMetadata

  const broadcastTaskbarTimer = useCallback(
    (
      active: boolean,
      paused: boolean,
      isBreakSession: boolean,
      remainingSec: number,
      totalSec: number,
      goal?: DailyGoal | null,
      metaOverride?: TaskbarTimerMetadata
    ) => {
      if (typeof window === 'undefined' || !window.api?.session) return

      if (!active) {
        lastBroadcastSecRef.current = null
        lastBadgeKeyRef.current = ''
        lastBadgeDataUrlRef.current = ''
        const meta = metaOverride ?? getMetadataRef.current?.()
        const inactivePayload: SessionTimerPayload = {
          isActive: false,
          isPaused: false,
          isBreak: false,
          isOvertime: false,
          secondsRemaining: 0,
          totalSeconds: 0,
          emptyInProgressStartEpoch: meta?.emptyInProgressStartEpoch
        }
        window.api.session.updateTimer(inactivePayload)
        return
      }

      const isOt = !isBreakSession && remainingSec <= 0
      const status: 'focus' | 'break' | 'paused' | 'overtime' = paused
        ? 'paused'
        : isBreakSession
          ? 'break'
          : isOt
            ? 'overtime'
            : 'focus'

      const displayMins = isOt
        ? Math.floor(Math.abs(remainingSec) / 60)
        : Math.max(0, Math.ceil(remainingSec / 60))

      const badgeKey = `${status}-${displayMins}`
      let badgeDataUrl: string | undefined = undefined
      if (badgeKey !== lastBadgeKeyRef.current) {
        lastBadgeKeyRef.current = badgeKey
        lastBadgeDataUrlRef.current = createTimerBadgeDataUrl(displayMins, status)
        badgeDataUrl = lastBadgeDataUrlRef.current
      }

      const meta = metaOverride ?? getMetadataRef.current?.()

      const activePayload: SessionTimerPayload = {
        isActive: true,
        isPaused: paused,
        isBreak: isBreakSession,
        isAfk: Boolean(meta?.isAfk),
        isOvertime: isOt,
        goalId: goal?.id,
        goalTitle: goal?.title,
        secondsRemaining: remainingSec,
        totalSeconds: totalSec,
        badgeDataUrl,
        startedAt:
          meta?.startedAt ||
          (meta?.sessionStartEpoch ? new Date(meta.sessionStartEpoch).toISOString() : undefined),
        accumulatedPausedMs: meta?.accumulatedPausedMs ?? 0,
        pauseStartEpoch: meta?.pauseStartEpoch || undefined,
        sessionNote: meta?.sessionNote || undefined,
        afkBreakStartEpoch: meta?.afkBreakStartEpoch || undefined
      }
      window.api.session.updateTimer(activePayload)
    },
    []
  )

  const clearBadgeState = useCallback(() => {
    lastBroadcastSecRef.current = null
    lastBadgeKeyRef.current = ''
    lastBadgeDataUrlRef.current = ''
  }, [])

  return {
    broadcastTaskbarTimer,
    clearBadgeState,
    lastBroadcastSecRef
  }
}
