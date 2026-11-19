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
    // If user paused songs one time, remember it and don't play again and again until user manually plays them
    if (userPaused) {
      return
    }
    if (!audioPlaying) {
      try {
        playAudio()
      } catch {
        // ignore
      }
    }
  }, [audioPlaying, playAudio, userPaused])

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
