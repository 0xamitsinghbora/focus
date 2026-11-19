import React, { useState, useEffect } from 'react'
import { ThemeMode } from '../../../../shared/types'
import { Switch } from '../ui/switch'
import { Input } from '../ui/input'
import { cn } from '../../lib/utils'

export interface GeneralSettingsSectionProps {
  theme: ThemeMode
  setTheme: (t: ThemeMode) => void
  interval: number
  setInterval: (mins: number) => void
  dailyFocusTarget: number
  setDailyFocusTarget: (mins: number) => void
  openAtLogin: boolean
  setOpenAtLogin: (open: boolean) => void
  showWidget: boolean
  setShowWidget: (show: boolean) => void
  onOpenShortcuts?: () => void
  onOpenOnboarding?: () => void
  onOpenMorningRitual?: () => void
}

const presets = [15, 30, 45, 60]
const dailyTargetPresets = [2, 4, 6, 8]

export function GeneralSettingsSection({
  theme,
  setTheme,
  interval,
  setInterval,
  dailyFocusTarget,
  setDailyFocusTarget,
  openAtLogin,
  setOpenAtLogin,
  showWidget,
  setShowWidget,
  onOpenShortcuts,
  onOpenOnboarding,
  onOpenMorningRitual
}: GeneralSettingsSectionProps): React.JSX.Element {
  const [hoursInput, setHoursInput] = useState<string>(() =>
    dailyFocusTarget > 0 ? String(+(dailyFocusTarget / 60).toFixed(2)) : '0'
  )

  useEffect(() => {
    const currentMins = Math.round((parseFloat(hoursInput) || 0) * 60)
    if (currentMins !== dailyFocusTarget) {
      setHoursInput(dailyFocusTarget > 0 ? String(+(dailyFocusTarget / 60).toFixed(2)) : '0')
    }
  }, [dailyFocusTarget, hoursInput])
  return (
    <>
      {/* 1. Theme Selection */}
      <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2" />
              <path d="M12 20v2" />
              <path d="m4.93 4.93 1.41 1.41" />
              <path d="m17.66 17.66 1.41 1.41" />
              <path d="M2 12h2" />
              <path d="M20 12h2" />
              <path d="m6.34 17.66-1.41 1.41" />
              <path d="m19.07 4.93-1.41 1.41" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="text-[14px] font-semibold tracking-[-0.015em] text-foreground">
              Theme
            </div>
            <div className="text-[12px] text-muted-foreground/85 leading-relaxed tracking-[-0.005em]">
              Match your system appearance or choose light / dark.
            </div>
          </div>
        </div>

        <div className="flex items-center rounded-xl bg-secondary/60 dark:bg-surface/70 p-1 border border-border/40 shrink-0 self-start sm:self-auto backdrop-blur-xs shadow-2xs">
          {[
            { id: 'system', label: 'System' },
            { id: 'light', label: 'Light' },
            { id: 'dark', label: 'Dark' }
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setTheme(item.id as ThemeMode)}
              className={cn(
                'px-3 py-1 rounded-lg text-[12px] font-medium transition-all duration-150 cursor-pointer tracking-[-0.01em]',
                theme === item.id
                  ? 'bg-card text-foreground font-semibold shadow-xs ring-1 ring-border/30'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* 2. Session Timing */}
      <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 rounded-xl bg-apple-amber/10 text-apple-amber flex items-center justify-center shrink-0 shadow-2xs">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="text-[14px] font-semibold tracking-[-0.015em] text-foreground">
              Session Timing
            </div>
            <div className="text-[12px] text-muted-foreground/85 leading-relaxed tracking-[-0.005em]">
              Length of each focus session (e.g. 25m, 45m, 60m).
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-start md:self-auto">
          <div className="flex items-center gap-1 rounded-xl bg-secondary/60 dark:bg-surface/70 p-0.5 border border-border/40 shadow-2xs">
            {presets.map((mins) => (
              <button
                key={mins}
                onClick={() => setInterval(mins)}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-[12px] font-semibold transition-all duration-150 cursor-pointer tracking-[-0.01em]',
                  interval === mins
                    ? 'bg-card text-foreground shadow-xs ring-1 ring-border/30'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {mins}m
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 pl-1">
            <Input
              type="number"
              min={1}
              max={480}
              value={interval}
              onChange={(e) =>
                setInterval(Math.max(1, Math.min(480, parseInt(e.target.value) || 1)))
              }
              className="w-16 h-8 text-center text-[12px] tabular-nums"
            />
            <span className="text-[11px] text-muted-foreground">min</span>
          </div>
        </div>
      </div>

      {/* 3. Daily Focus Target */}
      <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 rounded-xl bg-apple-green/10 text-apple-green flex items-center justify-center shrink-0 shadow-2xs">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 20v-6" />
              <path d="M6 20V10" />
              <path d="M18 20V4" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="text-[14px] font-semibold tracking-[-0.015em] text-foreground">
              Daily Focus Target
            </div>
            <div className="text-[12px] text-muted-foreground/85 leading-relaxed tracking-[-0.005em]">
              How many hours of focused work you want each day. Set to 0 to disable.
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-start md:self-auto">
          <div className="flex items-center gap-1 rounded-xl bg-secondary/60 dark:bg-surface/70 p-0.5 border border-border/40 shadow-2xs">
            {dailyTargetPresets.map((hrs) => (
              <button
                key={hrs}
                onClick={() => setDailyFocusTarget(hrs * 60)}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-[12px] font-semibold transition-all duration-150 cursor-pointer tracking-[-0.01em]',
                  dailyFocusTarget === hrs * 60
                    ? 'bg-card text-foreground shadow-xs ring-1 ring-border/30'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {hrs}h
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 pl-1">
            <Input
              type="number"
              min={0}
              max={24}
              step={0.5}
              value={hoursInput}
              onChange={(e) => {
                const val = e.target.value
                setHoursInput(val)
                const parsed = parseFloat(val)
                const clamped = Math.max(0, Math.min(24, isNaN(parsed) ? 0 : parsed))
                setDailyFocusTarget(Math.round(clamped * 60))
              }}
              onBlur={() => {
                if (hoursInput === '' || isNaN(parseFloat(hoursInput))) {
                  setHoursInput('0')
                  setDailyFocusTarget(0)
                }
              }}
              className="w-16 h-8 text-center text-[12px] tabular-nums"
              aria-label="Daily focus target in hours"
            />
            <span className="text-[11px] text-muted-foreground">h</span>
          </div>
        </div>
      </div>

      {/* 4. Launch on Startup */}
      <div className="p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 rounded-xl bg-apple-blue/10 text-apple-blue flex items-center justify-center shrink-0">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect width="20" height="14" x="2" y="3" rx="2" />
              <line x1="8" x2="16" y1="21" y2="21" />
              <line x1="12" x2="12" y1="17" y2="21" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="text-[13.5px] font-semibold text-foreground">Launch on Startup</div>
            <div className="text-[12px] text-muted-foreground">
              Open Focus in the background when your computer starts.
            </div>
          </div>
        </div>
        <Switch
          checked={openAtLogin}
          onCheckedChange={setOpenAtLogin}
          aria-label="Launch on Startup"
        />
      </div>

      {/* 4. Floating Desktop Widget */}
      <div className="p-4 flex items-center justify-between border-b border-border/50">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 rounded-xl bg-apple-indigo/10 text-apple-indigo flex items-center justify-center shrink-0">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect width="18" height="18" x="3" y="3" rx="2" />
              <path d="M9 3v18" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="text-[13.5px] font-semibold text-foreground">
              Floating Desktop Widget
            </div>
            <div className="text-[12px] text-muted-foreground">
              Display an always-in-sight mini timer on your screen or inside the taskbar.
            </div>
          </div>
        </div>
        <Switch
          checked={showWidget}
          aria-label="Floating Desktop Widget"
          onCheckedChange={(val) => {
            setShowWidget(val)
            if (val) {
              window.api.widget?.snapTaskbar?.()
            } else {
              window.api.widget?.hide?.()
            }
          }}
        />
      </div>

      {/* 5. Keyboard Shortcuts */}
      {onOpenShortcuts && (
        <div className="p-4 flex items-center justify-between border-b border-border/50">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-apple-purple/10 text-apple-purple flex items-center justify-center shrink-0">
              <span className="text-base">⌨️</span>
            </div>
            <div className="min-w-0">
              <div className="text-[13.5px] font-semibold text-foreground">Keyboard Shortcuts</div>
              <div className="text-[12px] text-muted-foreground">
                Customize or disable global desktop hotkeys to prevent collisions with other apps.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenShortcuts}
            className="px-3 py-1.5 rounded-xl border border-border/70 bg-surface hover:bg-secondary text-xs font-semibold text-foreground transition-all cursor-pointer shadow-2xs shrink-0"
          >
            Customize Shortcuts
          </button>
        </div>
      )}

      {/* 6. Setup & Onboarding Tour */}
      {onOpenOnboarding && (
        <div className="p-4 flex items-center justify-between border-b border-border/50">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <span className="text-base">🚀</span>
            </div>
            <div className="min-w-0">
              <div className="text-[13.5px] font-semibold text-foreground">Welcome & Setup Tour</div>
              <div className="text-[12px] text-muted-foreground">
                Reopen the interactive setup guide explaining the planner, focus sessions, and check-ins.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenOnboarding}
            className="px-3 py-1.5 rounded-xl border border-border/70 bg-surface hover:bg-secondary text-xs font-semibold text-foreground transition-all cursor-pointer shadow-2xs shrink-0"
          >
            Replay Setup Tour
          </button>
        </div>
      )}

      {/* 7. Morning Planning Ritual */}
      {onOpenMorningRitual && (
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
              <span className="text-base">🌅</span>
            </div>
            <div className="min-w-0">
              <div className="text-[13.5px] font-semibold text-foreground">Morning Planning Ritual</div>
              <div className="text-[12px] text-muted-foreground">
                Re-adjust today&apos;s daily focus target, review carried goals, or set your anchor task.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenMorningRitual}
            className="px-3 py-1.5 rounded-xl border border-border/70 bg-surface hover:bg-secondary text-xs font-semibold text-foreground transition-all cursor-pointer shadow-2xs shrink-0"
          >
            Open Ritual
          </button>
        </div>
      )}
    </>
  )
}
