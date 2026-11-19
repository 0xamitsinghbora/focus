import React, { useRef } from 'react'
import { BreakNudgePayload } from '../../../shared/types'
import { useDialogA11y } from '../lib/useDialogA11y'
import { formatMinutes } from '../lib/utils'

export interface BreakRecoveryModalProps {
  nudge: BreakNudgePayload | null
  onClose: () => void
  onResumeFocus: () => void
  onStartMicroSession: () => void
  onExtendBreak: (minutes: number) => void
}

export function BreakRecoveryModal({
  nudge,
  onClose,
  onResumeFocus,
  onStartMicroSession,
  onExtendBreak
}: BreakRecoveryModalProps): React.JSX.Element | null {
  const initialFocusRef = useRef<HTMLButtonElement | null>(null)
  const dialogRef = useDialogA11y<HTMLDivElement>({
    isOpen: Boolean(nudge),
    onClose,
    initialFocusRef
  })

  if (!nudge) return null

  const isUrgent = nudge.urgency >= 3

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="break-nudge-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="relative flex flex-col w-full max-w-md overflow-hidden rounded-2xl border border-border/80 bg-card shadow-apple-popover text-foreground outline-none"
      >
        {/* Header Badge */}
        <div className="p-5 pb-3 flex items-start gap-3.5">
          <div
            className={`h-11 w-11 rounded-2xl flex items-center justify-center text-xl shrink-0 shadow-2xs border ${
              isUrgent
                ? 'bg-apple-red/15 border-apple-red/30 text-apple-red animate-pulse'
                : 'bg-apple-amber/15 border-apple-amber/30 text-apple-amber'
            }`}
          >
            {isUrgent ? '⏳' : '☕'}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span
                className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.2 rounded-md border ${
                  isUrgent
                    ? 'bg-apple-red/15 text-apple-red border-apple-red/30'
                    : 'bg-apple-amber/15 text-apple-amber border-apple-amber/30'
                }`}
              >
                {isUrgent ? 'Extended Break' : 'Break Check-in'}
              </span>
              <span className="text-[11px] font-mono text-muted-foreground/80 tabular-nums">
                {formatMinutes(nudge.breakMinutes)} on break
              </span>
            </div>
            <h2
              id="break-nudge-title"
              className="mt-1 text-[16px] font-bold tracking-tight text-foreground"
            >
              {nudge.title}
            </h2>
            <p className="mt-1 text-[12.5px] text-muted-foreground leading-relaxed">{nudge.body}</p>
          </div>
        </div>

        {/* Psychological Inertia Breaker Callout */}
        <div className="mx-5 mb-3 p-3 rounded-xl bg-surface/40 border border-border/60 text-[11.5px] text-muted-foreground flex items-center gap-2">
          <span className="text-sm">💡</span>
          <span>
            {isUrgent
              ? 'Feeling stuck? Even a 5-minute micro-session breaks inertia and restores momentum.'
              : 'Taking intentional breaks is healthy. Jump back in whenever you are ready.'}
          </span>
        </div>

        {/* Action Buttons */}
        <div className="p-4 px-5 border-t border-border/60 bg-surface/30 flex flex-col gap-2">
          <button
            ref={initialFocusRef}
            type="button"
            onClick={onResumeFocus}
            className="w-full py-2.5 px-4 text-[13px] font-semibold rounded-xl transition-all duration-150 bg-primary text-primary-foreground hover:opacity-90 shadow-apple-subtle active:scale-98 flex items-center justify-between cursor-pointer"
          >
            <span>Resume Focus Session</span>
            <kbd className="px-1.5 py-0.5 rounded-md bg-primary-foreground/20 text-primary-foreground border border-primary-foreground/30 text-[10px] font-mono leading-none">
              Enter
            </kbd>
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onStartMicroSession}
              className="py-2 px-3 text-[12px] font-medium rounded-xl border border-apple-green/30 bg-apple-green/10 text-apple-green hover:bg-apple-green/20 transition-all cursor-pointer flex items-center justify-center gap-1.5"
              title="Start a 5-minute micro-session to overcome task initiation friction"
            >
              <span>⚡ Start 5m Micro-Focus</span>
            </button>

            <button
              type="button"
              onClick={() => onExtendBreak(5)}
              className="py-2 px-3 text-[12px] font-medium rounded-xl border border-border/70 bg-card hover:bg-secondary/70 text-foreground transition-all cursor-pointer flex items-center justify-center gap-1.5"
            >
              <span>Extend +5m</span>
              <kbd className="px-1 py-0.2 rounded bg-secondary text-muted-foreground border border-border/70 text-[9.5px] font-mono leading-none">
                Space
              </kbd>
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-full py-1.5 text-[11.5px] font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer text-center"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  )
}
