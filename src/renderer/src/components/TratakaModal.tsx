import React, { useState, useEffect, useRef, useCallback } from 'react'
import { playFocusChime, audioEngine } from '../lib/audioEngine'
import { cn } from '../lib/utils'

export interface TratakaModalProps {
  isOpen: boolean
  onClose: () => void
  initialDurationSeconds?: number
  onComplete?: () => void
}

const PRESET_DURATIONS = [
  { label: '60s', seconds: 60 },
  { label: '90s', seconds: 90 },
  { label: '2m', seconds: 120 },
  { label: '5m', seconds: 300 }
]

export function TratakaModal({
  isOpen,
  onClose,
  initialDurationSeconds = 90,
  onComplete
}: TratakaModalProps): React.JSX.Element | null {
  const [duration, setDuration] = useState<number>(initialDurationSeconds)
  const [showCue, setShowCue] = useState(true)
  const wasAudioPlayingRef = useRef(false)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const cueTimerRef = useRef<NodeJS.Timeout | null>(null)

  const handleFinish = useCallback(() => {
    try {
      playFocusChime('complete')
    } catch {
      // ignore
    }
    onComplete?.()
    onClose()
  }, [onComplete, onClose])

  // Handle start, timers, and audio handoff
  useEffect(() => {
    if (!isOpen) return

    setShowCue(true)

    // Audio handoff: fade out active focus sound to true silence during reset
    if (audioEngine.isPlaying) {
      wasAudioPlayingRef.current = true
      audioEngine.pause({ userInitiated: false })
    }

    // Eye-strain guardrail: Fade in a 4-second cue, then fade out completely
    cueTimerRef.current = setTimeout(() => {
      setShowCue(false)
    }, 4500)

    // Timer for decompression duration
    timerRef.current = setTimeout(() => {
      handleFinish()
    }, duration * 1000)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (cueTimerRef.current) clearTimeout(cueTimerRef.current)
      if (wasAudioPlayingRef.current) {
        audioEngine.play({ userInitiated: false })
        wasAudioPlayingRef.current = false
      }
    }
  }, [isOpen, duration, handleFinish])

  // Handle Escape key
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true })
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Trataka Mind Reset"
      className="fixed inset-0 z-[99999] bg-[#0E0E0E] flex flex-col items-center justify-center select-none text-white overflow-hidden animate-in fade-in duration-300"
    >
      {/* Guiding Cue - Fades out after 4 seconds to leave zero visual stimulation */}
      <div
        className={cn(
          'absolute top-20 text-center px-6 transition-opacity duration-1000 pointer-events-none',
          showCue ? 'opacity-90' : 'opacity-0'
        )}
      >
        <p className="text-[14px] text-[#A6A29A] font-medium tracking-wide">
          Rest your eyes softly on the dot. Blink naturally. Let the noise settle.
        </p>
      </div>

      {/* Visual Target: Single soft warm off-white / amber dot dead center */}
      <div className="relative flex items-center justify-center">
        {/* Soft atmospheric ambient glow */}
        <div className="absolute w-8 h-8 rounded-full bg-[#F5EEDB]/10 blur-[6px] pointer-events-none animate-pulse" />
        {/* Core Dot Target (10px, soft blur, off-white) */}
        <div
          data-testid="trataka-dot"
          className="w-2.5 h-2.5 rounded-full bg-[#F0EBE1] shadow-[0_0_14px_rgba(255,235,210,0.55)] blur-[0.3px]"
        />
      </div>

      {/* Preset Chips (faded at bottom, subtle hover) */}
      <div className="absolute bottom-12 flex items-center gap-2 opacity-35 hover:opacity-90 transition-opacity duration-200">
        <span className="text-[11px] text-[#8C8880] mr-1">Duration:</span>
        {PRESET_DURATIONS.map((preset) => (
          <button
            key={preset.seconds}
            type="button"
            onClick={() => {
              setDuration(preset.seconds)
              // restart timer with new duration
              if (timerRef.current) clearTimeout(timerRef.current)
              timerRef.current = setTimeout(() => {
                handleFinish()
              }, preset.seconds * 1000)
            }}
            className={cn(
              'px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer border',
              duration === preset.seconds
                ? 'bg-white/20 text-white border-white/40 font-semibold'
                : 'bg-white/5 text-[#8C8880] border-white/10 hover:bg-white/10 hover:text-white'
            )}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Escape hint in corner */}
      <div className="absolute bottom-4 right-5 text-[11px] text-[#706D66] flex items-center gap-1.5 opacity-50 hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={onClose}
          className="hover:text-white transition-colors cursor-pointer"
        >
          Exit
        </button>
        <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-[#A6A29A] text-[10px] font-mono">
          Esc
        </kbd>
      </div>
    </div>
  )
}
