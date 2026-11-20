import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CompactSoundPlayer, SoundPlayerCard, ModernAudioPlayer } from '../components/SoundPlayer'

const mockAudioEngine = {
  playing: false,
  volume: 0.5,
  noiseType: 'rain',
  spatialAudio: true,
  customAudioName: undefined as string | undefined,
  activeCustomTrackId: undefined as string | undefined,
  customTracks: [] as Array<{ id: string; name: string; addedAt: number }>,
  play: vi.fn(),
  toggle: vi.fn(),
  setVolume: vi.fn(),
  setNoiseType: vi.fn(),
  setSpatialAudio: vi.fn(),
  toggleSpatialAudio: vi.fn(),
  addCustomAudio: vi.fn(),
  selectCustomAudio: vi.fn(),
  removeCustomAudio: vi.fn(),
  loadCustomAudio: vi.fn(),
  clearCustomAudio: vi.fn()
}

vi.mock('../lib/audioEngine', () => ({
  useAudioEngine: () => mockAudioEngine
}))

describe('CompactSoundPlayer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAudioEngine.playing = false
    mockAudioEngine.volume = 0.5
    mockAudioEngine.noiseType = 'rain'
    mockAudioEngine.customAudioName = undefined
    mockAudioEngine.activeCustomTrackId = undefined
    mockAudioEngine.customTracks = []
  })

  it('renders idle Soundscape button when audio is not playing', () => {
    render(<CompactSoundPlayer />)

    const btn = screen.getByRole('button', { name: /ambient soundscape/i })
    expect(btn).toBeDefined()
    expect(btn.textContent).toContain('Soundscape')
  })

  it('opens popover when idle button is clicked and closes on Escape', () => {
    render(<CompactSoundPlayer />)

    const btn = screen.getByRole('button', { name: /ambient soundscape/i })
    fireEvent.click(btn)

    // Header text/icon slop is removed
    expect(screen.queryByText('Focus Soundscape')).toBeNull()
    expect(screen.queryByText('Ambient concentration noise')).toBeNull()

    // Popover content is open (categories visible)
    expect(screen.getByRole('button', { name: /^nature$/i })).toBeDefined()

    // Press Escape to close
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('button', { name: /^nature$/i })).toBeNull()
  })

  it('allows selecting presets without autoplaying playback when idle', () => {
    render(<CompactSoundPlayer />)

    fireEvent.click(screen.getByRole('button', { name: /ambient soundscape/i }))

    // Switch to Focus category tab
    const focusTab = screen.getByRole('button', { name: /^focus$/i })
    fireEvent.click(focusTab)

    const cocoonPreset = screen.getByTitle(/Cocoon: Warm binaural drone/i)
    fireEvent.click(cocoonPreset)

    expect(mockAudioEngine.setNoiseType).toHaveBeenCalledWith('cocoon')
    expect(mockAudioEngine.play).not.toHaveBeenCalled()
  })

  it('does not render duplicate prev/play/next buttons in popover', () => {
    render(<CompactSoundPlayer />)

    fireEvent.click(screen.getByRole('button', { name: /ambient soundscape/i }))

    expect(screen.queryByRole('button', { name: 'Play' })).toBeNull()
    expect(screen.queryByRole('button', { name: /previous soundscape/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /next soundscape/i })).toBeNull()
  })

  it('does not render volume slider or leveler controls in popover', () => {
    render(<CompactSoundPlayer />)

    fireEvent.click(screen.getByRole('button', { name: /ambient soundscape/i }))

    expect(screen.queryByRole('slider')).toBeNull()
    expect(screen.queryByRole('button', { name: /mute/i })).toBeNull()
  })

  it('renders active pill with preset name when playing', () => {
    mockAudioEngine.playing = true
    mockAudioEngine.noiseType = 'cocoon'

    render(<CompactSoundPlayer />)

    const pauseBtn = screen.getByRole('button', { name: /pause soundscape/i })
    expect(pauseBtn).toBeDefined()
    expect(pauseBtn.textContent).toContain('Cocoon')

    fireEvent.click(pauseBtn)
    expect(mockAudioEngine.toggle).toHaveBeenCalled()
  })

  it('renders with spatial audio enabled automatically without manual toggle button', () => {
    render(<CompactSoundPlayer />)

    fireEvent.click(screen.getByRole('button', { name: /ambient soundscape/i }))

    // Manual toggle button is removed because spatial audio is automatically enabled
    const spatialBtn = screen.queryByRole('button', { name: /toggle.*spatial audio/i })
    expect(spatialBtn).toBeNull()
  })

  it('filters soundscape presets by category and selects city sounds', () => {
    render(<CompactSoundPlayer />)

    fireEvent.click(screen.getByRole('button', { name: /ambient soundscape/i }))

    // Click Cities category tab
    const citiesTab = screen.getByRole('button', { name: /^cities$/i })
    fireEvent.click(citiesTab)

    // Tokyo soundscape should be visible
    const tokyoPreset = screen.getByTitle(/Tokyo:.*Shakuhachi/i)
    fireEvent.click(tokyoPreset)

    expect(mockAudioEngine.setNoiseType).toHaveBeenCalledWith('city-tokyo')
    expect(mockAudioEngine.play).not.toHaveBeenCalled()
  })

  it('does not display play or pause text inside the play button', () => {
    render(<SoundPlayerCard />)

    const playBtn = screen.getByRole('button', { name: /play soundscape/i })
    expect(playBtn.textContent).toBe('')
  })

  it('does not display duplicate "Add custom audio files..." at the bottom when no custom tracks exist', () => {
    render(<CompactSoundPlayer />)

    fireEvent.click(screen.getByRole('button', { name: /ambient soundscape/i }))

    expect(screen.queryByText(/add custom audio files/i)).toBeNull()
  })

  it('does not display "All" section in category filter tabs, showing only specific sections', () => {
    render(<CompactSoundPlayer />)

    fireEvent.click(screen.getByRole('button', { name: /ambient soundscape/i }))

    expect(screen.queryByRole('button', { name: /^all$/i })).toBeNull()
    expect(screen.getByRole('button', { name: /^nature$/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /^focus$/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /^cities$/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /^custom$/i })).toBeDefined()
  })

  it('keeps custom section grid at the exact same height and area level as other sections when blank', () => {
    render(<CompactSoundPlayer />)

    fireEvent.click(screen.getByRole('button', { name: /ambient soundscape/i }))

    const customTab = screen.getByRole('button', { name: /^custom$/i })
    fireEvent.click(customTab)

    const grid = screen.getByText('Play Custom Sound').closest('.grid')
    expect(grid).toBeDefined()
    expect(grid?.className).toContain('h-[94px]')
  })

  it('highlights the active preset card with white background without displaying an ACTIVE text badge', () => {
    mockAudioEngine.noiseType = 'waves'
    render(<CompactSoundPlayer />)

    fireEvent.click(screen.getByRole('button', { name: /ambient soundscape/i }))

    expect(screen.queryAllByText(/^active$/i)).toHaveLength(0)
    const wavesCard = screen.getByTitle(/^Ocean Waves:/i)
    expect(wavesCard.className).toContain('bg-foreground')
  })
})

describe('SoundPlayerCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAudioEngine.playing = false
    mockAudioEngine.volume = 0.5
    mockAudioEngine.noiseType = 'waves'
    mockAudioEngine.customAudioName = undefined
    mockAudioEngine.activeCustomTrackId = undefined
    mockAudioEngine.customTracks = []
  })

  it('renders idle card without slop Soundscape text and with bigger Play button', () => {
    render(<SoundPlayerCard />)

    expect(screen.queryByText('Soundscape')).toBeNull()
    expect(screen.getByText('Ocean Waves')).toBeDefined()
    const playBtn = screen.getByRole('button', { name: /play soundscape/i })
    expect(playBtn).toBeDefined()
    expect(playBtn.className).toContain('h-10.5')

    const prevBtn = screen.getByRole('button', { name: /previous soundscape/i })
    expect(prevBtn).toBeDefined()
    expect(prevBtn.className).toContain('h-9')
  })

  it('toggles audio directly when Play button on card is clicked', () => {
    render(<SoundPlayerCard />)

    const playBtn = screen.getByRole('button', { name: /play soundscape/i })
    fireEvent.click(playBtn)

    expect(mockAudioEngine.toggle).toHaveBeenCalled()
  })

  it('opens popover when clicking the preset button and allows selecting sounds', () => {
    render(<SoundPlayerCard />)

    const chooseBtn = screen.getByRole('button', { name: /choose ambient soundscape/i })
    fireEvent.click(chooseBtn)

    expect(screen.getByRole('button', { name: /^nature$/i })).toBeDefined()
    expect(screen.queryByText('Focus Soundscape')).toBeNull()

    const rainPreset = screen.getByTitle(/Rain: Layered rainfall/i)
    fireEvent.click(rainPreset)

    expect(mockAudioEngine.setNoiseType).toHaveBeenCalledWith('rain')
    expect(mockAudioEngine.play).not.toHaveBeenCalled()
  })

  it('closes popover on Escape key', () => {
    render(<SoundPlayerCard />)

    const chooseBtn = screen.getByRole('button', { name: /choose ambient soundscape/i })
    fireEvent.click(chooseBtn)
    expect(screen.getByRole('button', { name: /^nature$/i })).toBeDefined()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('button', { name: /^nature$/i })).toBeNull()
  })

  it('renders playing status and Pause button when audio is playing', () => {
    mockAudioEngine.playing = true
    mockAudioEngine.noiseType = 'rain'

    render(<SoundPlayerCard />)

    const pauseBtn = screen.getByRole('button', { name: /pause soundscape/i })
    expect(pauseBtn).toBeDefined()
    expect(screen.getByText('Rain')).toBeDefined()
    expect(screen.getByText(/Playing · Layered rain/i)).toBeDefined()
  })

  it('allows switching to Custom category and selecting custom sound file', () => {
    render(<SoundPlayerCard />)

    const chooseBtn = screen.getByRole('button', { name: /choose ambient soundscape/i })
    fireEvent.click(chooseBtn)

    // Switch to Custom category tab
    const customTab = screen.getByRole('button', { name: /^custom$/i })
    fireEvent.click(customTab)

    expect(screen.getByText('Play Custom Sound')).toBeDefined()
    expect(screen.getByText('Select Audio File')).toBeDefined()

    // Trigger file input
    const fileInput = screen.getByTestId('card-custom-audio-input')
    const testFile = new File(['fake-audio-content'], 'lofi-beats.mp3', { type: 'audio/mp3' })
    fireEvent.change(fileInput, { target: { files: [testFile] } })

    expect(mockAudioEngine.addCustomAudio).toHaveBeenCalledWith(testFile)
  })

  it('allows selecting multiple custom audio files at once', async () => {
    render(<SoundPlayerCard />)

    const fileInput = screen.getByTestId('card-custom-audio-input')
    const file1 = new File(['content1'], 'track1.mp3', { type: 'audio/mp3' })
    const file2 = new File(['content2'], 'track2.wav', { type: 'audio/wav' })
    fireEvent.change(fileInput, { target: { files: [file1, file2] } })

    await waitFor(() => {
      expect(mockAudioEngine.addCustomAudio).toHaveBeenCalledWith(file1)
      expect(mockAudioEngine.addCustomAudio).toHaveBeenCalledWith(file2)
    })
  })

  it('renders list of multiple custom tracks, allowing track selection and individual deletion', () => {
    mockAudioEngine.customTracks = [
      { id: 'track-1', name: 'cozy-fireplace.mp3', addedAt: 100 },
      { id: 'track-2', name: 'rainy-cafe.wav', addedAt: 200 }
    ]
    mockAudioEngine.activeCustomTrackId = 'track-1'
    mockAudioEngine.noiseType = 'custom'
    mockAudioEngine.customAudioName = 'cozy-fireplace.mp3'

    render(<SoundPlayerCard />)

    const chooseBtn = screen.getByRole('button', { name: /choose ambient soundscape/i })
    fireEvent.click(chooseBtn)

    // Switch to Custom tab
    const customTab = screen.getByRole('button', { name: /^custom$/i })
    fireEvent.click(customTab)

    expect(screen.getAllByText('cozy-fireplace.mp3').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('rainy-cafe.wav')).toBeDefined()
    expect(screen.queryAllByText(/^active$/i)).toHaveLength(0)
    const activeTrack = screen.getByTitle('Play cozy-fireplace.mp3')
    expect(activeTrack.className).toContain('bg-foreground')

    // Select second track
    const secondTrack = screen.getByText('rainy-cafe.wav')
    fireEvent.click(secondTrack)
    expect(mockAudioEngine.selectCustomAudio).toHaveBeenCalledWith('track-2')

    // Click delete on first track
    const deleteBtn = screen.getByTitle('Remove cozy-fireplace.mp3')
    fireEvent.click(deleteBtn)
    expect(mockAudioEngine.removeCustomAudio).toHaveBeenCalledWith('track-1')
  })

  it('renders custom sound name on the card when custom sound is selected and active', () => {
    mockAudioEngine.noiseType = 'custom'
    mockAudioEngine.customAudioName = 'my-ambience.wav'
    mockAudioEngine.playing = true

    render(<SoundPlayerCard />)

    expect(screen.getByText('my-ambience.wav')).toBeDefined()
    expect(screen.getByText(/Playing · Custom audio/i)).toBeDefined()
  })

  it('renders custom sound in Custom category and allows removing it without bottom clear all text', () => {
    mockAudioEngine.customAudioName = 'custom-track.mp3'

    render(<SoundPlayerCard />)

    const chooseBtn = screen.getByRole('button', { name: /choose ambient soundscape/i })
    fireEvent.click(chooseBtn)

    // Switch to Custom tab
    const customTab = screen.getByRole('button', { name: /^custom$/i })
    fireEvent.click(customTab)

    // No bottom clear all footer
    expect(screen.queryByText(/clear all/i)).toBeNull()

    const removeBtn = screen.getByTitle('Remove custom-track.mp3')
    fireEvent.click(removeBtn)

    expect(mockAudioEngine.clearCustomAudio).toHaveBeenCalled()
  })

  it('allows skipping to next and previous track using media buttons', () => {
    mockAudioEngine.noiseType = 'waves'

    render(<SoundPlayerCard />)

    const nextBtn = screen.getByRole('button', { name: /next soundscape/i })
    fireEvent.click(nextBtn)

    expect(mockAudioEngine.setNoiseType).toHaveBeenCalledWith('rain')
    expect(mockAudioEngine.play).not.toHaveBeenCalled()

    const prevBtn = screen.getByRole('button', { name: /previous soundscape/i })
    fireEvent.click(prevBtn)

    expect(mockAudioEngine.setNoiseType).toHaveBeenCalled()
  })

  it('keeps the soundscape card clean without inline volume controls', () => {
    mockAudioEngine.volume = 0.8

    render(<SoundPlayerCard />)

    expect(screen.queryByRole('button', { name: /mute soundscape volume/i })).toBeNull()
    expect(screen.queryByRole('slider', { name: /soundscape card volume slider/i })).toBeNull()
  })

  it('toggles playback when clicking the currently active preset in the popover', () => {
    mockAudioEngine.playing = true
    mockAudioEngine.noiseType = 'waves'

    render(<SoundPlayerCard />)

    const chooseBtn = screen.getByRole('button', { name: /choose ambient soundscape/i })
    fireEvent.click(chooseBtn)

    const wavesPreset = screen.getByTitle(/Ocean Waves:.*rolling surf/i)
    fireEvent.click(wavesPreset)

    expect(mockAudioEngine.toggle).toHaveBeenCalled()
  })

  it('renders "Add More Audio Files..." at top and keeps 4 custom sounds in h-[94px] area without size change', () => {
    mockAudioEngine.customTracks = [
      { id: 'track-1', name: '1.mp3', addedAt: 100 },
      { id: 'track-2', name: '2.mp3', addedAt: 200 },
      { id: 'track-3', name: '3.mp3', addedAt: 300 },
      { id: 'track-4', name: '4.mp3', addedAt: 400 }
    ]
    mockAudioEngine.activeCustomTrackId = 'track-1'
    mockAudioEngine.noiseType = 'custom'
    mockAudioEngine.customAudioName = '1.mp3'

    render(<CompactSoundPlayer />)

    fireEvent.click(screen.getByRole('button', { name: /ambient soundscape/i }))

    const customTab = screen.getByRole('button', { name: /^custom$/i })
    fireEvent.click(customTab)

    const addMoreBtn = screen.getByRole('button', { name: /add more audio files/i })
    expect(addMoreBtn).toBeDefined()
    expect(addMoreBtn.className).toContain('h-[20px]')

    const grid = addMoreBtn.closest('.grid')
    expect(grid).toBeDefined()
    expect(grid?.className).toContain('h-[94px]')

    // Verify button is first element before tracks in the grid
    expect(grid?.firstElementChild).toBe(addMoreBtn)

    // All 4 tracks rendered
    expect(screen.getByText('1.mp3')).toBeDefined()
    expect(screen.getByText('2.mp3')).toBeDefined()
    expect(screen.getByText('3.mp3')).toBeDefined()
    expect(screen.getByText('4.mp3')).toBeDefined()
  })

  describe('ModernAudioPlayer', () => {
    it('renders horizontal modern audio player rectangle with track info, controls, and aesthetic sound wave visualizer', () => {
      mockAudioEngine.playing = false
      mockAudioEngine.noiseType = 'waves'

      render(<ModernAudioPlayer />)

      expect(screen.getByText('Ocean Waves')).toBeDefined()
      expect(screen.getByRole('button', { name: /play soundscape/i })).toBeDefined()
      expect(screen.getByRole('button', { name: /previous soundscape/i })).toBeDefined()
      expect(screen.getByRole('button', { name: /next soundscape/i })).toBeDefined()
      expect(screen.getByRole('button', { name: /sound waves/i })).toBeDefined()
      // Clutter controls removed from modern audio player bar
      expect(screen.queryByRole('slider', { name: /soundscape volume/i })).toBeNull()
      expect(screen.queryByRole('button', { name: /3d spatial/i })).toBeNull()
    })

    it('toggles playback when play button is clicked', () => {
      mockAudioEngine.playing = false
      render(<ModernAudioPlayer />)

      const playBtn = screen.getByRole('button', { name: /play soundscape/i })
      fireEvent.click(playBtn)
      expect(mockAudioEngine.toggle).toHaveBeenCalledTimes(1)
    })

    it('toggles playback when clicking the aesthetic sound wave visualizer', () => {
      mockAudioEngine.playing = false
      render(<ModernAudioPlayer />)

      const waveBtn = screen.getByRole('button', { name: /sound waves/i })
      fireEvent.click(waveBtn)
      expect(mockAudioEngine.toggle).toHaveBeenCalledTimes(1)
    })

    it('opens preset popover when clicking the preset button', () => {
      mockAudioEngine.noiseType = 'waves'
      render(<ModernAudioPlayer />)

      const presetBtn = screen.getByRole('button', { name: /soundscape preset: ocean waves/i })
      fireEvent.click(presetBtn)

      expect(screen.getByRole('button', { name: /^nature$/i })).toBeDefined()
    })
  })
})
