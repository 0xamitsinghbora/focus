import { useCallback } from 'react'
import { playFocusChime, useAudioEngine } from '../../lib/audioEngine'

export interface FocusSessionAudioControls {
  playAudio: () => void
  pauseAudio: () => void
  audioPlaying: boolean
  userPaused: boolean
  startAmbient: () => void
  playChime: (type: 'start' | 'break' | 'complete') => void
}

export function useFocusSessionAudio(): FocusSessionAudioControls {
  const engine = useAudioEngine()
  const systemPlay = engine.systemPlay
  const systemPause = engine.systemPause
  const rawPlayAudio = engine.play
  const rawPauseAudio = engine.pause
  const audioPlaying = Boolean(engine.playing)
  const userPaused = Boolean(engine.userPaused)

  const playAudio = useCallback(() => {
    try {
      if (typeof systemPlay === 'function') {
        systemPlay()
      } else if (typeof rawPlayAudio === 'function') {
        rawPlayAudio()
      }
    } catch {
      // ignore
    }
  }, [systemPlay, rawPlayAudio])

  const pauseAudio = useCallback(() => {
    try {
      if (typeof systemPause === 'function') {
        systemPause()
      } else if (typeof rawPauseAudio === 'function') {
        rawPauseAudio()
      }
    } catch {
      // ignore
    }
  }, [systemPause, rawPauseAudio])

  const startAmbient = useCallback(() => {
    // Autoplay disabled: sounds must only be manually played/paused
  }, [])

  const playChime = useCallback((type: 'start' | 'break' | 'complete') => {
    try {
      playFocusChime(type)
    } catch {
      // ignore
    }
  }, [])

  return {
    playAudio,
    pauseAudio,
    audioPlaying,
    userPaused,
    startAmbient,
    playChime
  }
}
