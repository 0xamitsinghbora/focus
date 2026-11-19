import { useCallback } from 'react'
import { playFocusChime, useAudioEngine } from '../../lib/audioEngine'

export interface FocusSessionAudioControls {
  playAudio: () => void
  pauseAudio: () => void
  audioPlaying: boolean
  startAmbient: () => void
  playChime: (type: 'start' | 'break' | 'complete') => void
}

export function useFocusSessionAudio(): FocusSessionAudioControls {
  const { play: rawPlayAudio, pause: rawPauseAudio, playing: audioPlaying } = useAudioEngine()

  const playAudio = useCallback(() => {
    try {
      rawPlayAudio()
    } catch {
      // ignore
    }
  }, [rawPlayAudio])

  const pauseAudio = useCallback(() => {
    try {
      rawPauseAudio()
    } catch {
      // ignore
    }
  }, [rawPauseAudio])

  const startAmbient = useCallback(() => {
    if (!audioPlaying) {
      try {
        playAudio()
      } catch {
        // ignore
      }
    }
  }, [audioPlaying, playAudio])

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
    startAmbient,
    playChime
  }
}
