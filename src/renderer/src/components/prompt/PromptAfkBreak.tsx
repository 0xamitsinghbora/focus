import React from 'react'
import { formatSeconds } from '../../lib/utils'

export interface PromptAfkBreakProps {
  afkBreakSeconds: number
  onReturn: () => void
}

export function PromptAfkBreak({
  afkBreakSeconds,
  onReturn
}: PromptAfkBreakProps): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center py-5 px-3 space-y-4 text-center animate-in fade-in duration-200">
      {/* Header Pill */}
      <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-apple-red/15 border border-apple-red/30 text-apple-red text-[11px] font-semibold tracking-wide uppercase select-none animate-pulse">
        <span className="h-2 w-2 rounded-full bg-apple-red shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
        <span>AFK Break Active</span>
      </div>

      {/* Red Timer Display */}
      <div className="space-y-1 select-none">
        <div className="text-4xl font-mono font-bold tracking-tight text-apple-red drop-shadow-[0_0_14px_rgba(239,68,68,0.45)]">
          {formatSeconds(afkBreakSeconds)}
        </div>
        <p className="text-[12px] text-muted-foreground/90 max-w-[260px] mx-auto leading-relaxed">
          You were away for 40 seconds. Break time is being recorded in red.
        </p>
      </div>

      {/* Return Button */}
      <button
        type="button"
        autoFocus
        onClick={onReturn}
        className="w-full mt-1 px-4 py-2.5 rounded-xl font-semibold text-[13px] bg-apple-red hover:bg-apple-red/90 text-white shadow-apple-card active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
      >
        <span>I&apos;m Back — Start Focus Session</span>
        <kbd className="px-1.5 py-0.5 rounded bg-white/20 text-[10px] font-mono leading-none">
          Enter
        </kbd>
      </button>
    </div>
  )
}

