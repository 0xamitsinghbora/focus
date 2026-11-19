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
  const [initialGoalTitle, setInitialGoalTitle] = useState<string>('')
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
        dailyTargetMinutes,
        initialGoalTitle: initialGoalTitle.trim() || undefined
      })
    } finally {
      setIsSubmitting(false)
    }
  }, [isSubmitting, onComplete, intervalMinutes, dailyTargetMinutes, initialGoalTitle])

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
          {/* STEP 0: The Daily Planner */}
          {step === 0 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                Focus organizes your workday through a distraction-free daily planner. Keep your
                attention locked onto one priority at a time.
              </p>

              {/* 3 Kanban Columns Explanation */}
              <div className="grid grid-cols-3 gap-2.5">
                <div className="p-3 rounded-xl border border-border/70 bg-surface/40 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <span>🕒</span> Planned
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    Tasks queued for today. Add tasks anytime with{' '}
                    <kbd className="font-mono text-[10px] px-1 py-0.5 rounded bg-muted">Ctrl+N</kbd>
                    .
                  </p>
                </div>

                <div className="p-3 rounded-xl border border-primary/40 bg-primary/5 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                    <span>⚡</span> In Progress
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    Your single active anchor. Moving a task here starts your focus countdown.
                  </p>
                </div>

                <div className="p-3 rounded-xl border border-border/70 bg-surface/40 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    <span>✅</span> Done
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    Completed tasks automatically feed your heatmap and day review.
                  </p>
                </div>
              </div>

              {/* Interactive First Task Entry */}
              <div className="p-4 rounded-xl border border-border/60 bg-surface/30 space-y-2 mt-2">
                <label
                  htmlFor="onboarding-first-goal"
                  className="block text-[12px] font-semibold text-foreground"
                >
                  What is your primary focus or task for today?{' '}
                  <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <input
                  id="onboarding-first-goal"
                  type="text"
                  value={initialGoalTitle}
                  onChange={(e) => setInitialGoalTitle(e.target.value)}
                  placeholder="e.g. Finish database migration, review PR #42..."
                  className="w-full h-9 px-3 text-[13px] rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary shadow-2xs"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      setStep(1)
                    }
                  }}
                />
                <p className="text-[11px] text-muted-foreground">
                  Entering a task here will automatically place it in your Planner as your active
                  Anchor Task.
                </p>
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
                {/* 1. Quality rating */}
                <div className="p-3.5 rounded-xl border border-border/70 bg-surface/40 flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0 text-base">
                    ⚡
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-[12.5px] font-bold text-foreground">
                      Focus Quality Self-Rating (1–5)
                    </div>
                    <p className="text-[11.5px] text-muted-foreground leading-relaxed">
                      At each prompt check-in, rate your focus quality (with hotkeys{' '}
                      <kbd className="font-mono text-[10px] px-1 py-0.5 rounded bg-muted">
                        Alt+1..5
                      </kbd>
                      ). This catches desk daydreaming and builds clear trend data.
                    </p>
                  </div>
                </div>

                {/* 2. Break nudges */}
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

                {/* 3. Morning ritual */}
                <div className="p-3.5 rounded-xl border border-border/70 bg-surface/40 flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg bg-sky-500/10 text-sky-500 flex items-center justify-center shrink-0 text-base">
                    🌅
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-[12.5px] font-bold text-foreground">
                      Morning Planning Ritual
                    </div>
                    <p className="text-[11.5px] text-muted-foreground leading-relaxed">
                      Every morning on first open, Focus guides you to carry forward unfinished
                      tasks, set your daily target, and commit your day&apos;s anchor task.
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
