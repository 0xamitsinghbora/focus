import React, { useState, useRef, useCallback } from 'react'
import { useDialogA11y } from '../lib/useDialogA11y'
import { FocusLogo } from './FocusLogo'
import { cn } from '../lib/utils'

export interface OnboardingConfig {
  intervalMinutes: number
  dailyTargetMinutes: number
  initialGoalTitle?: string
}

export interface OnboardingModalProps {
  isOpen: boolean
  onClose: () => void
  defaultIntervalMinutes?: number
  defaultDailyTargetMinutes?: number
  onComplete: (config: OnboardingConfig) => void | Promise<void>
}

const INTERVAL_PRESETS = [
  { minutes: 25, label: '25m', desc: 'Pomodoro' },
  { minutes: 45, label: '45m', desc: 'Balanced Flow (Recommended)' },
  { minutes: 60, label: '60m', desc: 'Deep Immersion' }
]

const TARGET_PRESETS = [
  { minutes: 240, label: '4 Hours', desc: 'Half Day' },
  { minutes: 360, label: '6 Hours', desc: 'Moderate' },
  { minutes: 480, label: '8 Hours', desc: 'Full Workday (Default)' },
  { minutes: 600, label: '10 Hours', desc: 'Intensive' }
]

export function OnboardingModal({
  isOpen,
  onClose,
  defaultIntervalMinutes = 45,
  defaultDailyTargetMinutes = 480,
  onComplete
}: OnboardingModalProps): React.JSX.Element | null {
  const [step, setStep] = useState<number>(0)
  const [intervalMinutes, setIntervalMinutes] = useState<number>(defaultIntervalMinutes)
  const [dailyTargetMinutes, setDailyTargetMinutes] = useState<number>(defaultDailyTargetMinutes)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const initialFocusRef = useRef<HTMLButtonElement | null>(null)
  const dialogRef = useDialogA11y<HTMLDivElement>({
    isOpen,
    onClose,
    initialFocusRef
  })

  const handleFinish = useCallback(async () => {
    if (isSubmitting) return
    setIsSubmitting(true)
    try {
      await onComplete({
        intervalMinutes,
        dailyTargetMinutes
      })
    } finally {
      setIsSubmitting(false)
    }
  }, [isSubmitting, onComplete, intervalMinutes, dailyTargetMinutes])

  const handleSkip = useCallback(async () => {
    if (isSubmitting) return
    setIsSubmitting(true)
    try {
      await onComplete({
        intervalMinutes: defaultIntervalMinutes,
        dailyTargetMinutes: defaultDailyTargetMinutes
      })
    } finally {
      setIsSubmitting(false)
    }
  }, [isSubmitting, onComplete, defaultIntervalMinutes, defaultDailyTargetMinutes])

  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="relative flex flex-col w-full max-w-xl max-h-[90vh] overflow-hidden rounded-2xl border border-border/80 bg-card shadow-apple-popover text-foreground outline-none"
      >
        {/* Header */}
        <div className="flex items-start justify-between p-6 pb-4 border-b border-border/60 bg-surface/30">
          <div className="flex items-center gap-3">
            <FocusLogo size={32} variant="tile" />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                  Welcome to Focus
                </span>
                <span className="text-[11px] text-muted-foreground font-medium">
                  Step {step + 1} of 3
                </span>
              </div>
              <h2
                id="onboarding-dialog-title"
                className="text-[18px] font-bold tracking-tight text-foreground mt-1"
              >
                {step === 0 && 'The Daily Planner'}
                {step === 1 && 'Session Timing & Daily Target'}
                {step === 2 && 'Self-Awareness & Break Guard'}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSkip}
            disabled={isSubmitting}
            className="text-[12px] font-medium text-muted-foreground hover:text-foreground px-2.5 py-1 rounded-lg hover:bg-secondary/70 transition-colors cursor-pointer"
          >
            Skip to Planner
          </button>
        </div>

        {/* Step Content */}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-6 space-y-5">
          {/* STEP 0: The Daily Planner & Overview */}
          {step === 0 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                Focus is your distraction-free daily companion. It combines a 3-stage visual planner
                with rhythmic focus timers to keep you anchored on one priority at a time.
              </p>

              {/* 3-Stage Daily Workflow */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground px-0.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    How Tasks Move Through Your Day
                  </span>
                  <span className="text-[11px] text-muted-foreground/75 flex items-center gap-1">
                    <span>3-Stage Workflow</span>
                    <span>→</span>
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {/* Stage 1: Planned */}
                  <div className="p-3.5 rounded-xl border border-border/70 bg-surface/40 flex flex-col justify-between space-y-2">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                          <span className="flex items-center justify-center w-4 h-4 rounded-full bg-secondary text-muted-foreground text-[10px] font-bold">
                            1
                          </span>
                          <span>🕒 Planned</span>
                        </div>
                        <span className="text-[9.5px] px-1.5 py-0.5 rounded-md bg-secondary text-muted-foreground font-medium">
                          Queue
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        Tasks queued for today. Add tasks anytime with{' '}
                        <kbd className="font-mono text-[10px] px-1 py-0.5 rounded bg-muted text-foreground border border-border/50">
                          Ctrl+N
                        </kbd>
                        .
                      </p>
                    </div>
                    <div className="text-[10px] text-muted-foreground/80 font-medium flex items-center gap-1 pt-1.5 border-t border-border/40">
                      <span>Drag to activate</span>
                      <span>→</span>
                    </div>
                  </div>

                  {/* Stage 2: In Progress */}
                  <div className="p-3.5 rounded-xl border border-border/70 bg-surface/40 flex flex-col justify-between space-y-2">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                          <span className="flex items-center justify-center w-4 h-4 rounded-full bg-secondary text-muted-foreground text-[10px] font-bold">
                            2
                          </span>
                          <span>⚡ In Progress</span>
                        </div>
                        <span className="text-[9.5px] px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-500 border border-amber-500/20 font-medium">
                          Active Anchor
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        Your single active anchor. Locking in one task starts your focus countdown.
                      </p>
                    </div>
                    <div className="text-[10px] text-muted-foreground/80 font-medium flex items-center gap-1 pt-1.5 border-t border-border/40">
                      <span>Complete to finish</span>
                      <span>→</span>
                    </div>
                  </div>

                  {/* Stage 3: Done */}
                  <div className="p-3.5 rounded-xl border border-border/70 bg-surface/40 flex flex-col justify-between space-y-2">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                          <span className="flex items-center justify-center w-4 h-4 rounded-full bg-secondary text-muted-foreground text-[10px] font-bold">
                            3
                          </span>
                          <span>✅ Done</span>
                        </div>
                        <span className="text-[9.5px] px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-medium">
                          Accomplished
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        Completed tasks automatically record focus time and feed your day review.
                      </p>
                    </div>
                    <div className="text-[10px] text-emerald-500/80 font-medium flex items-center gap-1 pt-1.5 border-t border-border/40">
                      <span>✓ Saved to history</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* App Overview Features */}
              <div className="space-y-2 pt-1">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-0.5">
                  What Focus Does For You
                </div>

                <div className="grid grid-cols-1 gap-2">
                  <div className="flex items-start gap-3 p-2.5 rounded-xl border border-border/60 bg-surface/30">
                    <div className="h-7 w-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 text-sm mt-0.5">
                      ⏱️
                    </div>
                    <div className="space-y-0.5">
                      <div className="text-[12px] font-semibold text-foreground">
                        Rhythmic Focus Sessions & Floating Timer
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Work in timed intervals with automated break nudges. A floating desktop
                        widget keeps your timer in sight without switching windows.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-2.5 rounded-xl border border-border/60 bg-surface/30">
                    <div className="h-7 w-7 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0 text-sm mt-0.5">
                      🔔
                    </div>
                    <div className="space-y-0.5">
                      <div className="text-[12px] font-semibold text-foreground">
                        Mindful Check-Ins
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Periodic quiet popups check what you worked on and prevent break drift.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-2.5 rounded-xl border border-border/60 bg-surface/30">
                    <div className="h-7 w-7 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0 text-sm mt-0.5">
                      🛡️
                    </div>
                    <div className="space-y-0.5">
                      <div className="text-[12px] font-semibold text-foreground">
                        100% Private & Stored Locally
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        All notes, heatmaps, and stats remain strictly on your computer. Zero
                        surveillance, no keystroke logging, and no screenshots.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick tip */}
              <div className="flex items-center gap-2 p-2.5 rounded-xl border border-border/50 bg-surface/20 text-[11px] text-muted-foreground">
                <span className="text-sm shrink-0">💡</span>
                <span>
                  Press{' '}
                  <kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-muted text-foreground border border-border/60 font-semibold">
                    Ctrl+N
                  </kbd>{' '}
                  anytime in the app to quickly add a task.
                </span>
              </div>
            </div>
          )}

          {/* STEP 1: Session Timing & Daily Target */}
          {step === 1 && (
            <div className="space-y-5 animate-in fade-in duration-150">
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                Work in rhythmic focus blocks. When your session finishes, Focus prompts you for a
                quick mindful check-in.
              </p>

              {/* Reminder Interval Selection */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Focus Session Length
                  </label>
                  <span className="text-[12px] font-bold text-primary tabular-nums">
                    {intervalMinutes} minutes
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {INTERVAL_PRESETS.map((preset) => {
                    const isSelected = intervalMinutes === preset.minutes
                    return (
                      <button
                        key={preset.minutes}
                        type="button"
                        onClick={() => setIntervalMinutes(preset.minutes)}
                        className={cn(
                          'p-3 rounded-xl border text-left transition-all duration-150 cursor-pointer select-none',
                          isSelected
                            ? 'bg-primary border-primary text-primary-foreground shadow-apple-subtle'
                            : 'bg-card hover:bg-secondary/70 border-border text-foreground'
                        )}
                      >
                        <div className="text-[13px] font-bold">{preset.label}</div>
                        <div
                          className={cn(
                            'text-[11px] mt-0.5 leading-snug',
                            isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground'
                          )}
                        >
                          {preset.desc}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Daily Focus Target Selection */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Daily Focus Target
                  </label>
                  <span className="text-[12px] font-bold text-primary tabular-nums">
                    {Math.round(dailyTargetMinutes / 60)} hours target
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {TARGET_PRESETS.map((preset) => {
                    const isSelected = dailyTargetMinutes === preset.minutes
                    return (
                      <button
                        key={preset.minutes}
                        type="button"
                        onClick={() => setDailyTargetMinutes(preset.minutes)}
                        className={cn(
                          'p-2.5 rounded-xl border text-center transition-all duration-150 cursor-pointer select-none',
                          isSelected
                            ? 'bg-primary border-primary text-primary-foreground shadow-apple-subtle'
                            : 'bg-card hover:bg-secondary/70 border-border text-foreground'
                        )}
                      >
                        <div className="text-[12px] font-bold">{preset.label}</div>
                        <div
                          className={cn(
                            'text-[10px] mt-0.5',
                            isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground'
                          )}
                        >
                          {preset.desc}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Ambient Audio & Mini Widget Note */}
              <div className="flex items-center gap-3 p-3 rounded-xl border border-border/70 bg-surface/30 text-[12px] text-muted-foreground">
                <span className="text-xl shrink-0">🎧</span>
                <span>
                  Includes built-in soundscapes (Ocean Waves, Rain, Stream) and a floating desktop
                  widget that keeps your countdown visible.
                </span>
              </div>
            </div>
          )}

          {/* STEP 2: Self-Awareness & Break Guard */}
          {step === 2 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                Focus is built around cognitive psychology: gentle intervention at the right moments
                to build true self-awareness.
              </p>

              <div className="space-y-3">
                {/* Break nudges */}
                <div className="p-3.5 rounded-xl border border-border/70 bg-surface/40 flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0 text-base">
                    🛡️
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-[12.5px] font-bold text-foreground">
                      Escalating Break Nudges
                    </div>
                    <p className="text-[11.5px] text-muted-foreground leading-relaxed">
                      Prevents break drift. If you are idle or away past 2x your session interval,
                      Focus gently surfaces quick 5-minute micro-focus jumpstarts.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 px-6 border-t border-border/60 bg-surface/30">
          <div className="flex items-center gap-1.5">
            {[0, 1, 2].map((idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setStep(idx)}
                aria-label={`Go to step ${idx + 1}`}
                className={cn(
                  'h-2 rounded-full transition-all duration-200 cursor-pointer',
                  step === idx ? 'w-6 bg-primary' : 'w-2 bg-border hover:bg-muted-foreground/40'
                )}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="px-3.5 py-1.5 rounded-xl border border-border text-[12px] font-semibold text-foreground hover:bg-secondary/70 transition-all cursor-pointer"
              >
                Back
              </button>
            )}

            {step < 2 ? (
              <button
                ref={initialFocusRef}
                type="button"
                onClick={() => setStep((s) => s + 1)}
                className="px-4 py-1.5 rounded-xl bg-primary text-primary-foreground text-[12px] font-semibold hover:opacity-90 transition-all cursor-pointer shadow-apple-subtle"
              >
                Continue →
              </button>
            ) : (
              <button
                ref={initialFocusRef}
                type="button"
                onClick={handleFinish}
                disabled={isSubmitting}
                className="px-4 py-1.5 rounded-xl bg-primary text-primary-foreground text-[12px] font-bold hover:opacity-90 transition-all cursor-pointer shadow-apple-subtle flex items-center gap-1.5"
              >
                <span>Complete Setup & Open Planner</span>
                <span>🚀</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
