import { memo, useState, useEffect } from 'react'
import { FocusLogo } from './FocusLogo'
import { TabsList, TabsTrigger } from './ui/tabs'
import { useFocusSessionState } from '../context/FocusSessionContext'
import { useFocusSessionStore } from '../context/focusSessionStore'
import { cn, formatSeconds } from '../lib/utils'

const HeaderFocusStatusIndicator = memo(
  function HeaderFocusStatusIndicator(): React.JSX.Element | null {
    const isHydrated = useFocusSessionStore((s) => s.isHydrated)
    const { isActive, isPaused, isBreak, activeGoal } = useFocusSessionState()
    const pauseStartEpoch = useFocusSessionStore((s) => s.pauseStartEpoch)
    const emptyInProgressStartEpoch = useFocusSessionStore((s) => s.emptyInProgressStartEpoch)
    const secondsRemaining = useFocusSessionStore((s) => s.secondsRemaining)
    const [pauseElapsed, setPauseElapsed] = useState<number>(0)
    const [breakElapsed, setBreakElapsed] = useState<number>(0)

    useEffect(() => {
      if (!isPaused || !pauseStartEpoch) {
        setPauseElapsed(0)
        return
      }

      const updatePause = (): void => {
        setPauseElapsed(Math.max(0, Math.floor((Date.now() - pauseStartEpoch) / 1000)))
      }

      updatePause()
      const timer = setInterval(updatePause, 500)
      return () => clearInterval(timer)
    }, [isPaused, pauseStartEpoch])

    useEffect(() => {
      if (isActive || !emptyInProgressStartEpoch) {
        setBreakElapsed(0)
        return
      }

      const updateBreak = (): void => {
        setBreakElapsed(Math.max(0, Math.floor((Date.now() - emptyInProgressStartEpoch) / 1000)))
      }

      updateBreak()
      const timer = setInterval(updateBreak, 500)
      return () => clearInterval(timer)
    }, [isActive, emptyInProgressStartEpoch])

    if (!isHydrated) {
      return null
    }

    if (!isActive) {
      if (emptyInProgressStartEpoch > 0) {
        return (
          <div
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10.5px] font-medium border border-apple-red/30 bg-apple-red/10 text-apple-red select-none backdrop-blur-xs shadow-2xs apple-glow-red animate-in fade-in duration-200"
            title={`No tasks in progress · Break counting: ${formatSeconds(breakElapsed)}`}
          >
            <span
              className="h-1.5 w-1.5 rounded-full bg-apple-red shrink-0 animate-pulse"
              aria-hidden="true"
            />
            <span className="font-semibold text-[11px] leading-none tracking-[-0.01em]">Break</span>
          </div>
        )
      }

      return (
        <div
          className="hidden sm:flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10.5px] font-medium border border-border/50 bg-surface/60 text-muted-foreground/80 select-none backdrop-blur-xs shadow-2xs"
          title="Ready to start a focus session"
        >
          <span
            className="h-1.5 w-1.5 rounded-full bg-apple-green/70 shrink-0"
            aria-hidden="true"
          />
          <span className="text-[11px] leading-none tracking-[-0.01em]">Ready</span>
        </div>
      )
    }

    const timeDisplay = formatSeconds(Math.max(0, secondsRemaining))

    return (
      <div
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10.5px] font-medium border animate-in fade-in duration-200 select-none',
          isBreak
            ? 'bg-apple-red/10 border-apple-red/30 text-apple-red apple-glow-red'
            : isPaused
              ? 'bg-apple-red/10 border-apple-red/30 text-apple-red apple-glow-red'
              : 'bg-apple-green/10 border-apple-green/30 text-apple-green apple-glow-green'
        )}
        title={
          isBreak
            ? `Break time: ${timeDisplay} remaining`
            : isPaused
              ? `Focus session paused (${formatSeconds(pauseElapsed)}) · Noted green task: ${activeGoal?.title || 'Session'} (${timeDisplay} left)`
              : `Focus active: ${activeGoal?.title || 'Session'} (${timeDisplay} left)`
        }
      >
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full shrink-0',
            isBreak
              ? 'bg-apple-red animate-pulse'
              : isPaused
                ? 'bg-apple-red'
                : 'bg-apple-green animate-pulse'
          )}
          aria-hidden="true"
        />
        <span className="font-semibold text-[11px] leading-none tracking-[-0.01em]">
          {isBreak ? 'Break' : isPaused ? 'Paused' : 'Focusing'}
        </span>
      </div>
    )
  }
)

export interface AppHeaderProps {
  onOpenMorningRitual?: () => void
  onOpenTrataka?: () => void
}

export const AppHeader = memo(function AppHeader({
  onOpenMorningRitual,
  onOpenTrataka
}: AppHeaderProps = {}): React.JSX.Element {
  return (
    <header
      role="banner"
      className="relative z-30 mx-auto flex w-full max-w-310 items-center justify-between px-6 pb-3.5 pt-9"
    >
      <div
        className="flex items-center gap-3 relative z-40"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <div className="flex items-center gap-2.5">
          <FocusLogo size={24} variant="tile" />
          <h1 className="text-[18px] font-bold tracking-[-0.03em] text-foreground">Focus</h1>
          <HeaderFocusStatusIndicator />
          {onOpenTrataka && (
            <button
              type="button"
              onClick={onOpenTrataka}
              className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10.5px] font-medium border border-border/70 bg-card hover:bg-secondary text-foreground transition-all cursor-pointer select-none shadow-2xs"
              title="90s Mind Reset (Trataka) — zero-input visual decompression"
              aria-label="90s Mind Reset"
            >
              <span className="text-apple-amber text-[12px] leading-none" aria-hidden="true">
                ◉
              </span>
              <span className="hidden md:inline font-semibold text-[11px] leading-none tracking-tight">
                Reset
              </span>
            </button>
          )}
          {onOpenMorningRitual && (
            <button
              type="button"
              onClick={onOpenMorningRitual}
              className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10.5px] font-medium border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-all cursor-pointer select-none shadow-2xs"
              title="Morning Planning Ritual — set intention, carry forward, and commit"
              aria-label="Morning Planning Ritual"
            >
              <span className="text-[12px] leading-none" aria-hidden="true">
                🌅
              </span>
              <span className="hidden md:inline font-semibold text-[11px] leading-none tracking-tight">
                Ritual
              </span>
            </button>
          )}
        </div>
      </div>

      <TabsList
        className="relative z-40"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {[
          ['today', 'Today'],
          ['goals', 'Planner'],
          ['review', 'Review'],
          ['settings', 'Settings']
        ].map(([value, label]) => (
          <TabsTrigger key={value} value={value}>
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
    </header>
  )
})
