import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import {
  audioEngine,
  useAudioEngine,
  playFocusChime,
  getSharedAudioContext,
  getMasterLimiter,
  resetAudioEngineForTesting,
  getActiveChimesCountForTesting,
  fillBrown,
  fillPink,
  clearPendingAudioTimeouts,
  formatNoiseType,
  NoiseType
} from '../lib/audioEngine'

describe('AudioEngine & Chime Context Lifecycle', () => {
  let mockState: 'running' | 'suspended' | 'closed'
  let mockSuspend: ReturnType<typeof vi.fn>
  let mockResume: ReturnType<typeof vi.fn>
  let mockClose: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    resetAudioEngineForTesting()

    mockState = 'suspended'
    mockSuspend = vi.fn().mockImplementation(async () => {
      mockState = 'suspended'
    })
    mockResume = vi.fn().mockImplementation(async () => {
      mockState = 'running'
    })
    mockClose = vi.fn().mockImplementation(async () => {
      mockState = 'closed'
    })

    const createMockAudioNode = () => ({
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
      cancelScheduledValues: vi.fn(),
      gain: {
        value: 1,
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        cancelScheduledValues: vi.fn(),
        exponentialRampToValueAtTime: vi.fn()
      },
      frequency: {
        value: 440,
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn()
      },
      Q: {
        value: 1
      }
    })

    class MockAudioContext {
      get state() {
        return mockState
      }
      currentTime = 0
      destination = {}
      onstatechange: ((this: AudioContext, ev: Event) => any) | null = null
      suspend = mockSuspend
      resume = mockResume
      close = mockClose
      createGain = vi.fn(() => createMockAudioNode())
      createOscillator = vi.fn(() => createMockAudioNode())
      createBufferSource = vi.fn(() => createMockAudioNode())
      createBiquadFilter = vi.fn(() => createMockAudioNode())
      createDynamicsCompressor = vi.fn(() => createMockAudioNode())
      createBuffer = vi.fn(() => ({
        getChannelData: vi.fn(() => new Float32Array(100))
      }))
    }

    ;(window as any).AudioContext = MockAudioContext
    ;(window as any).webkitAudioContext = MockAudioContext
  })

  it('resumes context on play and suspends context when stopped to allow OS C-state sleep', () => {
    audioEngine.pause() // ensure clean initial state
    expect(audioEngine.isPlaying).toBe(false)

    // Start playback
    audioEngine.play()
    expect(audioEngine.isPlaying).toBe(true)
    expect(mockResume).toHaveBeenCalled()

    // Stop playback
    audioEngine.pause()
    expect(audioEngine.isPlaying).toBe(false)

    // Advance past the fade-out timeout (1250ms)
    vi.advanceTimersByTime(1300)

    // AudioContext must be suspended to release OS audio thread
    expect(mockSuspend).toHaveBeenCalled()

    audioEngine.destroy()
    vi.useRealTimers()
  })

  it('schedules chime context suspension after chime notes finish', async () => {
    await playFocusChime('start')
    expect(mockResume).toHaveBeenCalled()

    // Chime start note finishes at ~400ms, suspend is scheduled at 450ms
    vi.advanceTimersByTime(500)
    expect(mockSuspend).toHaveBeenCalled()

    vi.useRealTimers()
  })

  it('resumes playback on user interaction if context was suspended', () => {
    audioEngine.pause()
    audioEngine.play()
    expect(audioEngine.isPlaying).toBe(true)

    // Simulate browser autoplay suspension
    mockState = 'suspended'
    mockResume.mockClear()

    // Trigger user interaction
    window.dispatchEvent(new Event('pointerdown'))
    expect(mockResume).toHaveBeenCalled()

    mockResume.mockClear()
    mockState = 'suspended'
    window.dispatchEvent(new Event('keydown'))
    expect(mockResume).toHaveBeenCalled()

    audioEngine.destroy()
    vi.useRealTimers()
  })

  it('auto-recovers when context state changes or audio device is switched', () => {
    audioEngine.pause()
    audioEngine.play()
    expect(audioEngine.isPlaying).toBe(true)

    // Simulate audio hardware disconnection (context closed)
    mockState = 'closed'
    const ctx = (audioEngine as any).ctx
    if (ctx?.onstatechange) {
      ctx.onstatechange(new Event('statechange'))
    }

    // Advance debounce timer for playback recovery
    vi.advanceTimersByTime(120)

    // New context should have been created and started
    expect((audioEngine as any).ctx).not.toBe(ctx)
    expect(audioEngine.isPlaying).toBe(true)

    audioEngine.destroy()
    vi.useRealTimers()
  })

  it('unifies AudioContext across audioEngine and playFocusChime and routes through master limiter', async () => {
    audioEngine.pause()
    audioEngine.destroy()

    audioEngine.play()
    const engineCtx = (audioEngine as any).ctx
    expect(engineCtx).toBeDefined()

    // Chime should use the exact same AudioContext instance
    await playFocusChime('start')
    const sharedCtx = getSharedAudioContext()
    expect(sharedCtx).toBe(engineCtx)

    // Verify master limiter creation
    const limiter = getMasterLimiter(engineCtx)
    expect(engineCtx.createDynamicsCompressor).toHaveBeenCalled()
    expect(limiter).toBeDefined()

    audioEngine.destroy()
    vi.useRealTimers()
  })

  it('generates seamless brown and pink noise with crossfaded loop boundary smoothing', () => {
    const size = 44100 * 4
    const brownBuffer = new Float32Array(size)
    const pinkBuffer = new Float32Array(size)

    fillBrown(brownBuffer)
    fillPink(pinkBuffer)

    // Verify buffers are populated with finite, non-zero audio samples
    expect(brownBuffer[0]).toBeDefined()
    expect(Number.isFinite(brownBuffer[0])).toBe(true)
    expect(pinkBuffer[0]).toBeDefined()
    expect(Number.isFinite(pinkBuffer[0])).toBe(true)

    // Check seamless boundary: the difference between d[size - 1] and d[0] should be a smooth audio step
    const brownSeamDiff = Math.abs(brownBuffer[0] - brownBuffer[size - 1])
    const pinkSeamDiff = Math.abs(pinkBuffer[0] - pinkBuffer[size - 1])

    // Should not have a clipping discontinuity
    expect(brownSeamDiff).toBeLessThan(1.0)
    expect(pinkSeamDiff).toBeLessThan(1.0)
  })

  it('accurately decrements ref-counts for overlapping chimes and suspends when all complete', async () => {
    // Play first chime (start = 450ms)
    await playFocusChime('start')
    expect(getActiveChimesCountForTesting()).toBe(1)

    // Advance 50ms and trigger second chime (break = 500ms)
    vi.advanceTimersByTime(50)
    await playFocusChime('break')
    expect(getActiveChimesCountForTesting()).toBe(2)

    // Advance 400ms (t=450ms from start, first chime ends)
    vi.advanceTimersByTime(400)
    expect(getActiveChimesCountForTesting()).toBe(1)
    expect(mockSuspend).not.toHaveBeenCalled()

    // Advance remaining 100ms (t=550ms from start, second chime ends)
    vi.advanceTimersByTime(100)
    expect(getActiveChimesCountForTesting()).toBe(0)
    expect(mockSuspend).toHaveBeenCalledTimes(1)
  })

  it('useAudioEngine maintains stable function references across re-renders', () => {
    const { result, rerender } = renderHook(() => useAudioEngine())

    const initialPlay = result.current.play
    const initialPause = result.current.pause
    const initialToggle = result.current.toggle
    const initialSetVolume = result.current.setVolume
    const initialSetNoiseType = result.current.setNoiseType

    rerender()

    expect(result.current.play).toBe(initialPlay)
    expect(result.current.pause).toBe(initialPause)
    expect(result.current.toggle).toBe(initialToggle)
    expect(result.current.setVolume).toBe(initialSetVolume)
    expect(result.current.setNoiseType).toBe(initialSetNoiseType)
  })

  it('decrements activeChimesCount and suspends AudioContext if chime construction throws', async () => {
    const ctx = getSharedAudioContext()!
    vi.spyOn(ctx, 'createOscillator').mockImplementation(() => {
      throw new Error('Hardware audio node failure')
    })

    await playFocusChime('start')

    // activeChimesCount was incremented, but finally block queued immediate suspension
    vi.advanceTimersByTime(10)
    expect(getActiveChimesCountForTesting()).toBe(0)
    expect(mockSuspend).toHaveBeenCalled()

    vi.useRealTimers()
  })

  it('safely clears pending audio disconnect timeouts without error', () => {
    expect(() => clearPendingAudioTimeouts()).not.toThrow()
  })

  it('supports toggling 3D spatial audio and cycling through all soundscape presets', () => {
    audioEngine.pause()
    expect(audioEngine.spatialAudio).toBe(true)

    audioEngine.setSpatialAudio(false)
    expect(audioEngine.spatialAudio).toBe(false)

    audioEngine.toggleSpatialAudio()
    expect(audioEngine.spatialAudio).toBe(true)

    // Test playing with spatial audio enabled across all soundscapes
    const soundscapes: NoiseType[] = [
      'waves',
      'wind',
      'white-noise',
      'city-tokyo',
      'city-london',
      'city-reykjavik',
      'cocoon',
      'rain',
      'stream',
      'deep'
    ]

    audioEngine.play()
    expect(audioEngine.isPlaying).toBe(true)

    for (const preset of soundscapes) {
      audioEngine.setNoiseType(preset)
      expect(audioEngine.noiseType).toBe(preset)
    }

    // Toggle spatial audio while active
    audioEngine.toggleSpatialAudio()
    expect(audioEngine.spatialAudio).toBe(false)
    audioEngine.toggleSpatialAudio()
    expect(audioEngine.spatialAudio).toBe(true)

    audioEngine.pause()
    expect(audioEngine.isPlaying).toBe(false)
  })

  it('supports custom audio loading, playing, and clearing', async () => {
    audioEngine.pause()
    const dummyBuffer = new ArrayBuffer(1024)
    await audioEngine.loadCustomAudio({ name: 'my-custom-sound.mp3', buffer: dummyBuffer })

    expect(audioEngine.customAudioName).toBe('my-custom-sound.mp3')
    expect(audioEngine.noiseType).toBe('custom')
    expect(formatNoiseType('custom')).toBe('my-custom-sound.mp3')

    audioEngine.clearCustomAudio()
    expect(audioEngine.customAudioName).toBe('')
    expect(audioEngine.noiseType).toBe('waves')
    expect(formatNoiseType('custom')).toBe('Custom Sound')
  })

  it('supports adding multiple custom audio tracks, switching between them, and removing individual tracks', async () => {
    audioEngine.pause()
    audioEngine.clearCustomAudio()

    const buf1 = new ArrayBuffer(512)
    const buf2 = new ArrayBuffer(1024)

    const id1 = await audioEngine.addCustomAudio({ name: 'meditation-bells.mp3', buffer: buf1 })
    expect(id1).toBeDefined()
    expect(audioEngine.customTracks.length).toBe(1)
    expect(audioEngine.customTracks[0].name).toBe('meditation-bells.mp3')
    expect(audioEngine.activeCustomTrackId).toBe(id1)
    expect(audioEngine.customAudioName).toBe('meditation-bells.mp3')

    const id2 = await audioEngine.addCustomAudio({ name: 'forest-birds.wav', buffer: buf2 })
    expect(id2).toBeDefined()
    expect(audioEngine.customTracks.length).toBe(2)
    expect(audioEngine.activeCustomTrackId).toBe(id2)
    expect(audioEngine.customAudioName).toBe('forest-birds.wav')

    // Switch back to track 1
    audioEngine.selectCustomAudio(id1)
    expect(audioEngine.activeCustomTrackId).toBe(id1)
    expect(audioEngine.customAudioName).toBe('meditation-bells.mp3')

    // Remove track 2
    await audioEngine.removeCustomAudio(id2)
    expect(audioEngine.customTracks.length).toBe(1)
    expect(audioEngine.activeCustomTrackId).toBe(id1)

    // Remove track 1
    await audioEngine.removeCustomAudio(id1)
    expect(audioEngine.customTracks.length).toBe(0)
    expect(audioEngine.noiseType).toBe('waves')
  })
})
