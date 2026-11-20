import { useState, useCallback, useRef, useEffect } from 'react'
import { useAudioEngine, NoiseType, CustomAudioMeta } from '../lib/audioEngine'
import { cn } from '../lib/utils'

type NoiseCategory = 'nature' | 'focus' | 'cities' | 'custom'

interface PresetInfo {
  key: NoiseType
  category: 'nature' | 'focus' | 'cities' | 'custom'
  label: string
  sublabel: string
  desc: string
  location?: string
  icon: (className?: string) => React.JSX.Element
}

const PRESETS: PresetInfo[] = [
  // Nature & Elements
  {
    key: 'waves',
    category: 'nature',
    label: 'Ocean Waves',
    sublabel: 'Pacific surf',
    desc: '3D spatial rolling surf & deep oceanic swell',
    icon: (className) => (
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
      >
        <path d="M2 12c2.5-3 5.5-3 8 0 2.5 3 5.5 3 8 0 2-2.5 4-2.5 4-2.5" />
        <path d="M2 17c2.5-3 5.5-3 8 0 2.5 3 5.5 3 8 0 2-2.5 4-2.5 4-2.5" />
        <path d="M2 7c2.5-3 5.5-3 8 0 2.5 3 5.5 3 8 0 2-2.5 4-2.5 4-2.5" />
      </svg>
    )
  },
  {
    key: 'rain',
    category: 'nature',
    label: 'Rain',
    sublabel: 'Layered rain',
    desc: 'Layered rainfall & gentle ambient texture',
    icon: (className) => (
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
      >
        <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
        <line x1="8" y1="14" x2="8" y2="20" />
        <line x1="12" y1="16" x2="12" y2="22" />
        <line x1="16" y1="14" x2="16" y2="20" />
      </svg>
    )
  },
  {
    key: 'wind',
    category: 'nature',
    label: 'Wind',
    sublabel: 'Alpine breeze',
    desc: 'Mountain pine breeze & sweeping airy atmospheric gusts',
    icon: (className) => (
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
      >
        <path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2" />
        <path d="M9.6 4.6A2 2 0 1 1 11 8H2" />
        <path d="M12.6 19.4A2 2 0 1 0 14 16H2" />
      </svg>
    )
  },
  {
    key: 'stream',
    category: 'nature',
    label: 'Stream',
    sublabel: 'River flow',
    desc: 'Mountain river flow & harmonic water tones',
    icon: (className) => (
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
      >
        <path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
        <path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
        <path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
      </svg>
    )
  },

  // Focus & Masking
  {
    key: 'white-noise',
    category: 'focus',
    label: 'White Noise',
    sublabel: 'Full spectrum',
    desc: 'Full-spectrum acoustic focus masking & background noise isolation',
    icon: (className) => (
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
      >
        <path d="M2 12h2" />
        <path d="M6 8v8" />
        <path d="M10 4v16" />
        <path d="M14 7v10" />
        <path d="M18 9v6" />
        <path d="M22 12h-2" />
      </svg>
    )
  },
  {
    key: 'cocoon',
    category: 'focus',
    label: 'Cocoon',
    sublabel: 'Brown drone',
    desc: 'Warm binaural drone & brown noise',
    icon: (className) => (
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
      >
        <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
        <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 0-2-2H3z" />
      </svg>
    )
  },
  {
    key: 'deep',
    category: 'focus',
    label: 'Deep',
    sublabel: 'Sub-bass',
    desc: 'Sub-bass concentration drone & resonance',
    icon: (className) => (
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
      >
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="6" />
        <circle cx="12" cy="12" r="2" />
      </svg>
    )
  },

  // Global City Soundscapes
  {
    key: 'city-tokyo',
    category: 'cities',
    label: 'Tokyo',
    sublabel: 'Bamboo temple',
    desc: 'Tokyo: Shakuhachi meditation flute, bamboo water garden & temple singing bowl',
    location: 'Tokyo, Japan',
    icon: (className) => (
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
      >
        <path d="M3 21h18" />
        <path d="M5 21V7l8-4v18" />
        <path d="M19 21V11l-6-4" />
        <path d="M9 9h1" />
        <path d="M9 13h1" />
        <path d="M9 17h1" />
      </svg>
    )
  },
  {
    key: 'city-london',
    category: 'cities',
    label: 'London',
    sublabel: 'Fireside cello',
    desc: 'London: Cozy fireside study, warm cello drone & Westminster clock tower chime',
    location: 'London, UK',
    icon: (className) => (
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
      >
        <path d="M18 20V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14" />
        <path d="M2 20h20" />
        <path d="M14 12v.01" />
        <path d="M12 2v2" />
        <circle cx="12" cy="8" r="2" />
      </svg>
    )
  },
  {
    key: 'city-reykjavik',
    category: 'cities',
    label: 'Reykjavik',
    sublabel: 'Harpa solitude',
    desc: 'Reykjavik: Arctic coastal breeze & Harpa glass organ pad',
    location: 'Reykjavik, Iceland',
    icon: (className) => (
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
      >
        <path d="m8 3 4 8 5-5 5 15H2L8 3z" />
        <path d="M4 14h6" />
      </svg>
    )
  }
]

function getPlayableSequence(
  customTracks: CustomAudioMeta[] = []
): Array<{ type: NoiseType; customId?: string; name: string }> {
  const list: Array<{ type: NoiseType; customId?: string; name: string }> = []
  for (const p of PRESETS) {
    list.push({ type: p.key, name: p.label })
  }
  for (const t of customTracks) {
    list.push({ type: 'custom', customId: t.id, name: t.name })
  }
  return list
}

/**
 * SoundPresetPopover: Shared ambient soundscape selection popover
 * used by both CompactSoundPlayer and SoundPlayerCard.
 */
function SoundPresetPopover({
  playing,
  noiseType,
  customAudioName,
  customTracks = [],
  activeCustomTrackId,
  selectedCategory,
  onSelectCategory,
  onSelectPreset,
  onSelectCustomTrack,
  onRemoveCustomTrack,
  onChooseCustomFile,
  onClearCustomFile,
  className,
  gridClassName
}: {
  playing: boolean
  noiseType: NoiseType
  volume?: number
  customAudioName?: string
  customTracks?: CustomAudioMeta[]
  activeCustomTrackId?: string
  selectedCategory: NoiseCategory
  onToggle?: () => void
  onVolumeChange?: (v: number) => void
  onNextTrack?: () => void
  onPrevTrack?: () => void
  onSelectCategory: (cat: NoiseCategory) => void
  onSelectPreset: (presetKey: NoiseType) => void
  onSelectCustomTrack?: (id: string) => void
  onRemoveCustomTrack?: (id: string) => void
  onChooseCustomFile: () => void
  onClearCustomFile?: () => void
  className?: string
  gridClassName?: string
}): React.JSX.Element {
  const effectiveCustomTracks: CustomAudioMeta[] =
    customTracks && customTracks.length > 0
      ? customTracks
      : customAudioName
        ? [{ id: activeCustomTrackId || 'default', name: customAudioName, addedAt: Date.now() }]
        : []

  const filteredPresets = PRESETS.filter((p) => p.category === selectedCategory)

  return (
    <div
      className={cn(
        'absolute left-0 top-full mt-2 z-50 w-[320px] rounded-2xl border border-border/70 bg-card/95 dark:bg-[#16161a]/95 backdrop-blur-2xl p-3 shadow-apple-popover apple-glass animate-in fade-in zoom-in-95 duration-150 select-none text-foreground',
        className
      )}
    >
      {/* Popover Header */}
      <div className="flex items-center px-1 pb-2 mb-2 border-b border-border/40">
        <span className="text-[12px] font-semibold text-foreground tracking-tight">
          Soundscapes
        </span>
      </div>

      {/* Category Filter Tabs */}
      <div className="flex items-center gap-1 mb-2 p-0.5 rounded-lg bg-secondary/60 text-[10.5px]">
        {(
          [
            { key: 'nature', label: 'Nature' },
            { key: 'focus', label: 'Focus' },
            { key: 'cities', label: 'Cities' },
            { key: 'custom', label: 'Custom' }
          ] as const
        ).map((cat) => (
          <button
            key={cat.key}
            type="button"
            onClick={() => onSelectCategory(cat.key)}
            className={cn(
              'flex-1 py-1 px-1 rounded-md text-center font-medium transition-all cursor-pointer truncate',
              selectedCategory === cat.key
                ? 'bg-popover text-foreground font-semibold shadow-2xs'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Soundscapes Grid */}
      <div
        className={cn(
          'grid grid-cols-2 overflow-y-auto pr-0.5 custom-scrollbar',
          gridClassName || 'h-[94px]',
          selectedCategory === 'custom' && effectiveCustomTracks.length === 0
            ? ''
            : selectedCategory === 'custom'
              ? 'gap-1 content-start'
              : 'gap-1.5 content-start'
        )}
      >
        {selectedCategory === 'custom' ? (
          effectiveCustomTracks.length === 0 ? (
            <button
              type="button"
              onClick={onChooseCustomFile}
              className="col-span-2 h-full min-h-[94px] w-full flex flex-col items-center justify-center text-center p-2 rounded-xl border border-dashed border-border/80 bg-surface/30 hover:bg-surface/60 hover:border-border text-muted-foreground hover:text-foreground transition-all active:scale-[0.99] cursor-pointer select-none"
              title="Select audio file (.mp3, .wav, .ogg, .m4a)"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground mb-1 shadow-2xs">
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </div>
              <div className="text-[12px] font-semibold text-foreground leading-tight">
                Play Custom Sound
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                <span>Select Audio File</span> · MP3, WAV, AAC, OGG
              </div>
            </button>
          ) : (
            <>
              {/* Add More Custom Audio Files button at TOP */}
              <button
                type="button"
                onClick={onChooseCustomFile}
                className="col-span-2 flex items-center justify-center gap-1.5 h-[20px] rounded-lg border border-dashed border-border/80 bg-surface/30 hover:bg-surface/60 hover:border-border text-muted-foreground hover:text-foreground text-[10px] font-medium transition-all active:scale-[0.99] cursor-pointer w-full shrink-0"
                title="Add more custom audio files (.mp3, .wav, .ogg, .m4a)"
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span>Add More Audio Files...</span>
              </button>

              {effectiveCustomTracks.map((track) => {
                const isSelected =
                  noiseType === 'custom' &&
                  (activeCustomTrackId ? activeCustomTrackId === track.id : true)
                return (
                  <div
                    key={track.id}
                    onClick={() => {
                      if (onSelectCustomTrack && track.id !== 'default') {
                        onSelectCustomTrack(track.id)
                      } else {
                        onSelectPreset('custom')
                      }
                    }}
                    className={cn(
                      'group/track flex items-center justify-between gap-1 px-2 py-1 rounded-xl text-left border transition-all active:scale-[0.98] cursor-pointer min-w-0 h-[32px]',
                      isSelected
                        ? 'bg-foreground text-background font-semibold border-foreground shadow-2xs'
                        : 'bg-surface/60 border-border/60 hover:bg-surface hover:border-border text-foreground/85'
                    )}
                    title={`Play ${track.name}`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <div
                        className={cn(
                          'flex h-5 w-5 shrink-0 items-center justify-center rounded-lg transition-colors',
                          isSelected
                            ? 'bg-background/20 text-inherit'
                            : 'bg-secondary text-muted-foreground'
                        )}
                      >
                        {isSelected && playing ? (
                          <div className="flex items-end gap-[1px] h-2.5">
                            <span className="w-[1px] h-1.5 rounded-full bg-current animate-pulse" />
                            <span
                              className="w-[1px] h-2.5 rounded-full bg-current animate-pulse"
                              style={{ animationDelay: '150ms' }}
                            />
                            <span
                              className="w-[1px] h-1 rounded-full bg-current animate-pulse"
                              style={{ animationDelay: '300ms' }}
                            />
                          </div>
                        ) : (
                          <svg
                            width="11"
                            height="11"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M9 18V5l12-2v13" />
                            <circle cx="6" cy="18" r="3" />
                            <circle cx="18" cy="16" r="3" />
                          </svg>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-medium leading-none truncate">
                          {track.name}
                        </div>
                        <div
                          className={cn(
                            'text-[9px] mt-0.5 leading-none truncate',
                            isSelected ? 'text-background/70' : 'text-muted-foreground'
                          )}
                        >
                          Custom audio
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center shrink-0">
                      {(onRemoveCustomTrack || onClearCustomFile) && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (track.id !== 'default' && onRemoveCustomTrack) {
                              onRemoveCustomTrack(track.id)
                            } else if (onClearCustomFile) {
                              onClearCustomFile()
                            }
                          }}
                          className={cn(
                            'flex h-4.5 w-4.5 items-center justify-center rounded-md transition-colors cursor-pointer',
                            isSelected
                              ? 'hover:bg-background/20 text-inherit/70 hover:text-inherit'
                              : 'text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10'
                          )}
                          title={`Remove ${track.name}`}
                          aria-label={`Remove ${track.name}`}
                        >
                          <svg
                            width="9"
                            height="9"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M18 6 6 18" />
                            <path d="m6 6 12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </>
          )
        ) : (
          filteredPresets.map((p) => {
            const isSelected = noiseType === p.key
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => onSelectPreset(p.key)}
                className={cn(
                  'flex items-center gap-2 p-2 rounded-xl text-left border transition-all active:scale-[0.98] cursor-pointer min-w-0 h-[44px]',
                  isSelected
                    ? 'bg-foreground text-background font-semibold border-foreground shadow-2xs'
                    : 'bg-surface/60 border-border/60 hover:bg-surface hover:border-border text-foreground/85'
                )}
                title={`${p.label}: ${p.desc}`}
              >
                <div
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-lg transition-colors',
                    isSelected
                      ? 'bg-background/20 text-inherit'
                      : 'bg-secondary text-muted-foreground'
                  )}
                >
                  {isSelected && playing ? (
                    <div className="flex items-end gap-[1.5px] h-3">
                      <span className="w-[1.5px] h-2 rounded-full bg-current animate-pulse" />
                      <span
                        className="w-[1.5px] h-3 rounded-full bg-current animate-pulse"
                        style={{ animationDelay: '150ms' }}
                      />
                      <span
                        className="w-[1.5px] h-1.5 rounded-full bg-current animate-pulse"
                        style={{ animationDelay: '300ms' }}
                      />
                    </div>
                  ) : (
                    p.icon('shrink-0')
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11.5px] font-medium leading-none truncate">{p.label}</div>
                  <div
                    className={cn(
                      'text-[9.5px] mt-1 leading-none truncate',
                      isSelected ? 'text-background/70' : 'text-muted-foreground'
                    )}
                  >
                    {p.sublabel}
                  </div>
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

/**
 * Compact Sound Player: A sleek, space-saving ambient noise controller
 * featuring relaxing nature soundscapes, global cities, and 3D spatial audio.
 */
export function CompactSoundPlayer({ className }: { className?: string }): React.JSX.Element {
  const {
    playing,
    noiseType,
    volume,
    customAudioName,
    customTracks = [],
    activeCustomTrackId,
    spatialAudio = true,
    toggle,
    setVolume,
    setNoiseType,
    addCustomAudio,
    selectCustomAudio,
    removeCustomAudio,
    loadCustomAudio,
    clearCustomAudio
  } = useAudioEngine()

  const [isOpen, setIsOpen] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<NoiseCategory>('nature')
  const containerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      const activeCat =
        noiseType === 'custom'
          ? 'custom'
          : PRESETS.find((p) => p.key === noiseType)?.category || 'nature'
      setSelectedCategory(activeCat)
    }
  }, [isOpen, noiseType])

  const handleChooseCustomFile = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (!files || files.length === 0) return
      try {
        for (let i = 0; i < files.length; i++) {
          if (addCustomAudio) {
            await addCustomAudio(files[i])
          }
          if (loadCustomAudio && !addCustomAudio) {
            await loadCustomAudio(files[i])
          }
        }
      } catch (err) {
        console.error('Failed to load custom audio file:', err)
      }
      e.target.value = ''
    },
    [addCustomAudio, loadCustomAudio]
  )

  const handleNextTrack = useCallback(() => {
    const list = getPlayableSequence(customTracks)
    if (list.length === 0) return
    const curIdx = list.findIndex((item) => {
      if (noiseType === 'custom') {
        return item.type === 'custom' && item.customId === activeCustomTrackId
      }
      return item.type === noiseType
    })
    const nextIdx = (curIdx + 1) % list.length
    const next = list[nextIdx]
    if (next.type === 'custom' && next.customId) {
      if (selectCustomAudio) selectCustomAudio(next.customId)
    } else {
      setNoiseType(next.type)
    }
  }, [customTracks, noiseType, activeCustomTrackId, selectCustomAudio, setNoiseType])

  const handlePrevTrack = useCallback(() => {
    const list = getPlayableSequence(customTracks)
    if (list.length === 0) return
    const curIdx = list.findIndex((item) => {
      if (noiseType === 'custom') {
        return item.type === 'custom' && item.customId === activeCustomTrackId
      }
      return item.type === noiseType
    })
    const prevIdx = (curIdx - 1 + list.length) % list.length
    const prev = list[prevIdx]
    if (prev.type === 'custom' && prev.customId) {
      if (selectCustomAudio) selectCustomAudio(prev.customId)
    } else {
      setNoiseType(prev.type)
    }
  }, [customTracks, noiseType, activeCustomTrackId, selectCustomAudio, setNoiseType])

  const customPreset: PresetInfo = {
    key: 'custom',
    category: 'custom',
    label: customAudioName || 'Custom Sound',
    sublabel: customAudioName ? 'User audio file' : 'Custom audio',
    desc: 'Your custom looping ambient soundscape',
    icon: (cls) => (
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cls}
      >
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </svg>
    )
  }

  const activePreset =
    noiseType === 'custom' ? customPreset : PRESETS.find((p) => p.key === noiseType) || PRESETS[0]

  const handleSelectPreset = useCallback(
    (presetKey: NoiseType) => {
      if (noiseType === presetKey) {
        toggle()
      } else {
        setNoiseType(presetKey)
      }
    },
    [noiseType, toggle, setNoiseType]
  )

  // Close popover when clicking outside or pressing Escape
  useEffect(() => {
    if (!isOpen) return

    const handlePointerDown = (e: PointerEvent): void => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  return (
    <div ref={containerRef} className={cn('relative inline-block select-none', className)}>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac"
        className="hidden"
        data-testid="compact-custom-audio-input"
        onChange={handleFileChange}
      />

      {/* Header Pill */}
      {playing ? (
        <div className="flex items-center gap-1 rounded-full border border-apple-green/40 bg-apple-green/10 p-0.5 pl-2.5 pr-1.5 text-apple-green shadow-apple-subtle transition-all duration-150">
          <button
            type="button"
            onClick={() => toggle()}
            className="flex items-center gap-1.5 hover:opacity-85 active:scale-95 transition-all cursor-pointer"
            title="Click to pause soundscape"
            aria-label="Pause soundscape"
          >
            <div className="flex items-end gap-[2px] h-3">
              <span className="w-[1.5px] h-2 rounded-full bg-apple-green animate-pulse" />
              <span
                className="w-[1.5px] h-3 rounded-full bg-apple-green animate-pulse"
                style={{ animationDelay: '150ms' }}
              />
              <span
                className="w-[1.5px] h-1.5 rounded-full bg-apple-green animate-pulse"
                style={{ animationDelay: '300ms' }}
              />
            </div>
            <span className="text-[11.5px] font-semibold truncate max-w-[120px]">
              {activePreset.label}
            </span>
            {spatialAudio && (
              <span
                className="text-[8.5px] px-1 py-0.5 rounded font-mono font-bold uppercase tracking-wider bg-purple-500/20 text-purple-400"
                title="3D Spatial Audio active"
              >
                3D
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            className={cn(
              'flex h-5 w-5 items-center justify-center rounded-full transition-colors cursor-pointer',
              isOpen ? 'bg-apple-green/25 text-apple-green' : 'hover:bg-apple-green/20'
            )}
            title="Select ambient soundscape preset"
            aria-label="Select ambient soundscape preset"
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className={cn('transition-transform duration-150', isOpen && 'rotate-180')}
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-0.5 rounded-full border border-border/80 bg-surface/90 text-muted-foreground p-0.5 shadow-2xs hover:border-border transition-all">
          <button
            type="button"
            onClick={() => toggle()}
            className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-secondary text-foreground hover:text-apple-green transition-all active:scale-95 cursor-pointer"
            title="Play soundscape"
            aria-label="Play soundscape directly"
          >
            <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            className={cn(
              'flex h-6 items-center gap-1.5 pl-1 pr-2 text-[11.5px] font-medium transition-all cursor-pointer',
              isOpen ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
            title="Ambient soundscape (Ocean Waves, Rain, Wind, City Sounds, Custom)"
            aria-label="Ambient soundscape"
          >
            <span>Soundscape</span>
            <svg
              width="9"
              height="9"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className={cn('opacity-60 transition-transform duration-150', isOpen && 'rotate-180')}
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
        </div>
      )}

      {/* Floating Popover */}
      {isOpen && (
        <SoundPresetPopover
          playing={playing}
          noiseType={noiseType}
          volume={volume}
          customAudioName={customAudioName}
          customTracks={customTracks}
          activeCustomTrackId={activeCustomTrackId}
          selectedCategory={selectedCategory}
          onToggle={toggle}
          onVolumeChange={setVolume}
          onNextTrack={handleNextTrack}
          onPrevTrack={handlePrevTrack}
          onSelectCategory={setSelectedCategory}
          onSelectPreset={handleSelectPreset}
          onSelectCustomTrack={selectCustomAudio}
          onRemoveCustomTrack={removeCustomAudio}
          onChooseCustomFile={handleChooseCustomFile}
          onClearCustomFile={clearCustomAudio}
        />
      )}
    </div>
  )
}

/**
 * SoundPlayerCard: Ambient noise player presented as a dashboard metric card.
 * Placed in TodayMetricsRow in place of the standalone focus time card.
 */
export function SoundPlayerCard({ className }: { className?: string }): React.JSX.Element {
  const {
    playing,
    noiseType,
    volume,
    customAudioName,
    customTracks = [],
    activeCustomTrackId,
    toggle,
    setVolume,
    setNoiseType,
    addCustomAudio,
    selectCustomAudio,
    removeCustomAudio,
    loadCustomAudio,
    clearCustomAudio
  } = useAudioEngine()

  const [isOpen, setIsOpen] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<NoiseCategory>('nature')
  const containerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      const activeCat =
        noiseType === 'custom'
          ? 'custom'
          : PRESETS.find((p) => p.key === noiseType)?.category || 'nature'
      setSelectedCategory(activeCat)
    }
  }, [isOpen, noiseType])

  const handleChooseCustomFile = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (!files || files.length === 0) return
      try {
        for (let i = 0; i < files.length; i++) {
          if (addCustomAudio) {
            await addCustomAudio(files[i])
          }
          if (loadCustomAudio && !addCustomAudio) {
            await loadCustomAudio(files[i])
          }
        }
      } catch (err) {
        console.error('Failed to load custom audio file:', err)
      }
      e.target.value = ''
    },
    [addCustomAudio, loadCustomAudio]
  )

  const handleNextTrack = useCallback(() => {
    const list = getPlayableSequence(customTracks)
    if (list.length === 0) return
    const curIdx = list.findIndex((item) => {
      if (noiseType === 'custom') {
        return item.type === 'custom' && item.customId === activeCustomTrackId
      }
      return item.type === noiseType
    })
    const nextIdx = (curIdx + 1) % list.length
    const next = list[nextIdx]
    if (next.type === 'custom' && next.customId) {
      if (selectCustomAudio) selectCustomAudio(next.customId)
    } else {
      setNoiseType(next.type)
    }
  }, [customTracks, noiseType, activeCustomTrackId, selectCustomAudio, setNoiseType])

  const handlePrevTrack = useCallback(() => {
    const list = getPlayableSequence(customTracks)
    if (list.length === 0) return
    const curIdx = list.findIndex((item) => {
      if (noiseType === 'custom') {
        return item.type === 'custom' && item.customId === activeCustomTrackId
      }
      return item.type === noiseType
    })
    const prevIdx = (curIdx - 1 + list.length) % list.length
    const prev = list[prevIdx]
    if (prev.type === 'custom' && prev.customId) {
      if (selectCustomAudio) selectCustomAudio(prev.customId)
    } else {
      setNoiseType(prev.type)
    }
  }, [customTracks, noiseType, activeCustomTrackId, selectCustomAudio, setNoiseType])

  const customPreset: PresetInfo = {
    key: 'custom',
    category: 'custom',
    label: customAudioName || 'Custom Sound',
    sublabel: customAudioName ? 'User audio file' : 'Custom audio',
    desc: 'Your custom looping ambient soundscape',
    icon: (cls) => (
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cls}
      >
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </svg>
    )
  }

  const activePreset =
    noiseType === 'custom' ? customPreset : PRESETS.find((p) => p.key === noiseType) || PRESETS[0]

  const handleSelectPreset = useCallback(
    (presetKey: NoiseType) => {
      if (noiseType === presetKey) {
        toggle()
      } else {
        setNoiseType(presetKey)
      }
    },
    [noiseType, toggle, setNoiseType]
  )

  useEffect(() => {
    if (!isOpen) return

    const handlePointerDown = (e: PointerEvent): void => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  return (
    <div
      ref={containerRef}
      className={cn(
        'group relative rounded-2xl border bg-card p-4.5 shadow-apple-subtle apple-card-elevated transition-all duration-200 hover:border-border/90 hover:shadow-apple-card select-none flex flex-col justify-between',
        playing ? 'border-apple-green/40 shadow-apple-subtle apple-glow-green' : 'border-border/60',
        className
      )}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac"
        className="hidden"
        data-testid="card-custom-audio-input"
        onChange={handleFileChange}
      />

      {/* Top: Active Preset Selector Trigger & Track Info */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full flex items-center justify-between gap-2 text-left cursor-pointer rounded-xl -m-1 p-1 hover:bg-secondary/40 transition-colors group/btn"
        title="Choose ambient soundscape preset"
        aria-label="Choose ambient soundscape preset"
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all',
              playing
                ? 'bg-apple-green/15 text-apple-green ring-1 ring-apple-green/30 shadow-xs'
                : 'bg-secondary text-muted-foreground'
            )}
          >
            {activePreset.icon('w-4 h-4 shrink-0')}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  'text-[15px] sm:text-[16px] font-bold tracking-[-0.025em] leading-tight truncate',
                  playing ? 'text-foreground' : 'text-foreground/90'
                )}
              >
                {activePreset.label}
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground/80 leading-tight mt-0.5 truncate">
              {playing ? (
                <span className="text-apple-green font-medium flex items-center gap-1.5 truncate">
                  <span className="flex items-end gap-[1.5px] h-2.5 shrink-0">
                    <span className="w-[1.5px] h-2 rounded-full bg-apple-green animate-pulse" />
                    <span
                      className="w-[1.5px] h-3 rounded-full bg-apple-green animate-pulse"
                      style={{ animationDelay: '150ms' }}
                    />
                    <span
                      className="w-[1.5px] h-1.5 rounded-full bg-apple-green animate-pulse"
                      style={{ animationDelay: '300ms' }}
                    />
                  </span>
                  <span className="truncate">
                    Playing · {noiseType === 'custom' ? 'Custom audio' : activePreset.sublabel}
                  </span>
                </span>
              ) : (
                <span className="truncate">
                  {noiseType === 'custom'
                    ? 'Custom audio · Ambient audio'
                    : `${activePreset.sublabel} · Ambient audio`}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center shrink-0 pr-0.5 text-muted-foreground group-hover/btn:text-foreground">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            className={cn('transition-transform duration-150', isOpen && 'rotate-180')}
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
      </button>

      {/* Middle/Bottom: Centered Media Controls */}
      <div className="flex items-center justify-center gap-4 pt-3.5 pb-0.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            handlePrevTrack()
          }}
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-secondary text-muted-foreground/80 hover:text-foreground transition-all active:scale-90 cursor-pointer"
          title="Previous soundscape"
          aria-label="Previous soundscape"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="19 20 9 12 19 4 19 20" />
            <line x1="5" y1="4" x2="5" y2="20" stroke="currentColor" strokeWidth="2.5" />
          </svg>
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            toggle()
          }}
          className={cn(
            'flex h-10.5 w-10.5 items-center justify-center rounded-full transition-all active:scale-95 cursor-pointer shadow-xs',
            playing
              ? 'bg-apple-green text-white shadow-apple-subtle hover:brightness-105 ring-2 ring-apple-green/20'
              : 'border border-border/80 bg-surface/90 hover:bg-secondary text-foreground'
          )}
          title={playing ? 'Click to pause soundscape' : 'Click to play soundscape'}
          aria-label={playing ? 'Pause soundscape' : 'Play soundscape'}
        >
          {playing ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
          ) : (
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
              className="translate-x-[0.5px]"
            >
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          )}
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            handleNextTrack()
          }}
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-secondary text-muted-foreground/80 hover:text-foreground transition-all active:scale-90 cursor-pointer"
          title="Next soundscape"
          aria-label="Next soundscape"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 4 15 12 5 20 5 4" />
            <line x1="19" y1="4" x2="19" y2="20" stroke="currentColor" strokeWidth="2.5" />
          </svg>
        </button>
      </div>

      {/* Popover */}
      {isOpen && (
        <SoundPresetPopover
          playing={playing}
          noiseType={noiseType}
          volume={volume}
          customAudioName={customAudioName}
          customTracks={customTracks}
          activeCustomTrackId={activeCustomTrackId}
          selectedCategory={selectedCategory}
          onToggle={toggle}
          onVolumeChange={setVolume}
          onNextTrack={handleNextTrack}
          onPrevTrack={handlePrevTrack}
          onSelectCategory={setSelectedCategory}
          onSelectPreset={handleSelectPreset}
          onSelectCustomTrack={selectCustomAudio}
          onRemoveCustomTrack={removeCustomAudio}
          onChooseCustomFile={handleChooseCustomFile}
          onClearCustomFile={clearCustomAudio}
          className="w-[320px] sm:w-[340px]"
        />
      )}
    </div>
  )
}

const MODERN_WAVE_BARS = [
  10, 16, 22, 14, 26, 32, 20, 12, 18, 28, 34, 24, 16, 22, 30, 36, 28, 20, 14, 24, 32, 38, 30, 22,
  16, 28, 34, 26, 18, 12, 20, 30, 24, 16, 22, 18, 14, 8
]

/**
 * ModernAudioPlayer: Modern horizontal rectangle audio player component
 * spanning across the dashboard above the 4 metrics cubes.
 */
export function ModernAudioPlayer({ className }: { className?: string }): React.JSX.Element {
  const {
    playing,
    noiseType,
    volume,
    customAudioName,
    customTracks = [],
    activeCustomTrackId,
    toggle,
    setVolume,
    setNoiseType,
    addCustomAudio,
    selectCustomAudio,
    removeCustomAudio,
    loadCustomAudio,
    clearCustomAudio
  } = useAudioEngine()

  const [isOpen, setIsOpen] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<NoiseCategory>('nature')
  const containerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      const activeCat =
        noiseType === 'custom'
          ? 'custom'
          : PRESETS.find((p) => p.key === noiseType)?.category || 'nature'
      setSelectedCategory(activeCat)
    }
  }, [isOpen, noiseType])

  const handleChooseCustomFile = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (!files || files.length === 0) return
      try {
        for (let i = 0; i < files.length; i++) {
          if (addCustomAudio) {
            await addCustomAudio(files[i])
          }
          if (loadCustomAudio && !addCustomAudio) {
            await loadCustomAudio(files[i])
          }
        }
      } catch (err) {
        console.error('Failed to load custom audio file:', err)
      }
      e.target.value = ''
    },
    [addCustomAudio, loadCustomAudio]
  )

  const handleNextTrack = useCallback(() => {
    const list = getPlayableSequence(customTracks)
    if (list.length === 0) return
    const curIdx = list.findIndex((item) => {
      if (noiseType === 'custom') {
        return item.type === 'custom' && item.customId === activeCustomTrackId
      }
      return item.type === noiseType
    })
    const nextIdx = (curIdx + 1) % list.length
    const next = list[nextIdx]
    if (next.type === 'custom' && next.customId) {
      if (selectCustomAudio) selectCustomAudio(next.customId)
    } else {
      setNoiseType(next.type)
    }
  }, [customTracks, noiseType, activeCustomTrackId, selectCustomAudio, setNoiseType])

  const handlePrevTrack = useCallback(() => {
    const list = getPlayableSequence(customTracks)
    if (list.length === 0) return
    const curIdx = list.findIndex((item) => {
      if (noiseType === 'custom') {
        return item.type === 'custom' && item.customId === activeCustomTrackId
      }
      return item.type === noiseType
    })
    const prevIdx = (curIdx - 1 + list.length) % list.length
    const prev = list[prevIdx]
    if (prev.type === 'custom' && prev.customId) {
      if (selectCustomAudio) selectCustomAudio(prev.customId)
    } else {
      setNoiseType(prev.type)
    }
  }, [customTracks, noiseType, activeCustomTrackId, selectCustomAudio, setNoiseType])

  const customPreset: PresetInfo = {
    key: 'custom',
    category: 'custom',
    label: customAudioName || 'Custom Sound',
    sublabel: customAudioName ? 'User audio file' : 'Custom audio',
    desc: 'Your custom looping ambient soundscape',
    icon: (cls) => (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cls}
      >
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </svg>
    )
  }

  const activePreset =
    noiseType === 'custom' ? customPreset : PRESETS.find((p) => p.key === noiseType) || PRESETS[0]

  const handleSelectPreset = useCallback(
    (presetKey: NoiseType) => {
      if (noiseType === presetKey) {
        toggle()
      } else {
        setNoiseType(presetKey)
      }
    },
    [noiseType, toggle, setNoiseType]
  )

  useEffect(() => {
    if (!isOpen) return

    const handlePointerDown = (e: PointerEvent): void => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  return (
    <div
      ref={containerRef}
      className={cn(
        'group relative w-full rounded-2xl border bg-card/90 backdrop-blur-md p-3 sm:px-4.5 sm:py-3.5 shadow-apple-subtle apple-card-elevated transition-all duration-200 hover:border-border/90 select-none',
        playing ? 'border-border/90 shadow-apple-card' : 'border-border/60',
        isOpen ? 'z-50' : 'z-20',
        className
      )}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac"
        className="hidden"
        data-testid="modern-audio-file-input"
        onChange={handleFileChange}
      />

      <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-3 md:gap-4 lg:gap-6 min-h-[56px] sm:min-h-[60px]">
        {/* LEFT: Artwork & Track Meta (Clicking opens soundscape presets) */}
        <div
          onClick={() => setIsOpen((prev) => !prev)}
          className="flex items-center gap-3 min-w-0 w-full md:w-auto md:max-w-[calc(50%-100px)] cursor-pointer group/meta select-none shrink-0"
          title="Click to switch soundscape preset"
          role="button"
          aria-label={`Soundscape preset: ${activePreset.label}. Click to browse soundscapes`}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              setIsOpen((prev) => !prev)
            }
          }}
        >
          {/* Animated Artwork Tile */}
          <div
            className={cn(
              'relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-all shadow-2xs border border-border/50',
              playing
                ? 'bg-secondary text-foreground'
                : 'bg-secondary/70 text-muted-foreground group-hover/meta:bg-secondary group-hover/meta:text-foreground'
            )}
          >
            {activePreset.icon('w-5 h-5 shrink-0')}

            {/* Equalizer badge overlay on artwork */}
            {playing && (
              <span className="absolute bottom-1 right-1 flex items-end gap-[1.5px] h-2.5">
                <span className="w-[1.5px] h-2 rounded-full bg-foreground/75 animate-pulse" />
                <span
                  className="w-[1.5px] h-3 rounded-full bg-foreground/75 animate-pulse"
                  style={{ animationDelay: '150ms' }}
                />
                <span
                  className="w-[1.5px] h-1.5 rounded-full bg-foreground/75 animate-pulse"
                  style={{ animationDelay: '300ms' }}
                />
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[13.5px] sm:text-[14px] font-bold tracking-[-0.02em] text-foreground truncate group-hover/meta:text-primary transition-colors">
                {activePreset.label}
              </span>
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                className={cn(
                  'text-muted-foreground/70 transition-transform duration-200 shrink-0 group-hover/meta:text-foreground',
                  isOpen && 'rotate-180'
                )}
                aria-hidden="true"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </div>
            <div className="text-[11px] text-muted-foreground/70 truncate mt-0.5 font-normal h-4 flex items-center">
              {playing ? (
                <span className="font-medium text-foreground/90 truncate">
                  Playing · {noiseType === 'custom' ? 'Custom audio' : activePreset.sublabel}
                </span>
              ) : (
                <span className="truncate">
                  {noiseType === 'custom'
                    ? 'Custom audio · Ambient focus'
                    : `${activePreset.sublabel} · Ambient focus`}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* CENTER: Playback Controls (Rock-solid absolute center anchoring) */}
        <div className="flex items-center justify-center gap-3.5 sm:gap-4.5 shrink-0 md:absolute md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              handlePrevTrack()
            }}
            className="flex h-10 w-10 sm:h-10.5 sm:w-10.5 items-center justify-center rounded-full bg-secondary/80 hover:bg-secondary border border-border/60 hover:border-border text-muted-foreground hover:text-foreground transition-all duration-150 hover:scale-105 active:scale-95 cursor-pointer shadow-2xs"
            title="Previous soundscape"
            aria-label="Previous soundscape"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 5.2a1 1 0 0 0-1.58-.82L8.5 11.23V5.5a1 1 0 0 0-2 0v13a1 1 0 0 0 2 0v-5.73l8.92 6.85A1 1 0 0 0 19 18.8V5.2z" />
            </svg>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              toggle()
            }}
            className={cn(
              'flex h-12 w-12 sm:h-13 sm:w-13 items-center justify-center rounded-full transition-all duration-150 cursor-pointer shadow-apple-card hover:shadow-apple-popover hover:scale-105 active:scale-95',
              'bg-foreground text-background border border-border/60 hover:bg-foreground/95'
            )}
            title={playing ? 'Click to pause soundscape' : 'Click to play soundscape'}
            aria-label={playing ? 'Pause soundscape' : 'Play soundscape'}
          >
            {playing ? (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <rect x="6.5" y="4.5" width="3.5" height="15" rx="1.75" />
                <rect x="14" y="4.5" width="3.5" height="15" rx="1.75" />
              </svg>
            ) : (
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
                className="translate-x-[1px]"
              >
                <path d="M7 4.88v14.24a1.2 1.2 0 0 0 1.83 1.02l11.4-7.12a1.2 1.2 0 0 0 0-2.04L8.83 3.86A1.2 1.2 0 0 0 7 4.88z" />
              </svg>
            )}
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              handleNextTrack()
            }}
            className="flex h-10 w-10 sm:h-10.5 sm:w-10.5 items-center justify-center rounded-full bg-secondary/80 hover:bg-secondary border border-border/60 hover:border-border text-muted-foreground hover:text-foreground transition-all duration-150 hover:scale-105 active:scale-95 cursor-pointer shadow-2xs"
            title="Next soundscape"
            aria-label="Next soundscape"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <path d="M5 5.2a1 1 0 0 1 1.58-.82L15.5 11.23V5.5a1 1 0 0 1 2 0v13a1 1 0 0 1-2 0v-5.73L6.58 19.62A1 1 0 0 1 5 18.8V5.2z" />
            </svg>
          </button>
        </div>

        {/* RIGHT: Pure Aesthetic Sound Waves Visualizer (No cringe words, no green) */}
        <div
          onClick={() => toggle()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              toggle()
            }
          }}
          title={
            playing ? 'Sound waves active · Click to pause' : 'Sound waves idle · Click to play'
          }
          aria-label={
            playing ? 'Sound waves active. Click to pause' : 'Sound waves idle. Click to play'
          }
          className="relative flex items-center justify-end h-11 sm:h-12 w-full md:w-auto md:max-w-[calc(50%-100px)] cursor-pointer group/wave select-none px-2 ml-auto"
        >
          <div className="flex items-center justify-center gap-[3px] sm:gap-[3.5px] h-9 sm:h-10 flex-1 overflow-hidden">
            {MODERN_WAVE_BARS.map((h, i) => {
              const speed = 0.75 + ((i * 7) % 8) * 0.1
              const delay = ((i * 3) % 10) * 80

              return (
                <span
                  key={i}
                  className={cn(
                    'w-[2.5px] sm:w-[3px] rounded-full transition-all duration-300',
                    playing
                      ? 'bg-foreground/85 dark:bg-white/90 animate-sound-wave'
                      : 'bg-muted-foreground/25 group-hover/wave:bg-muted-foreground/45'
                  )}
                  style={{
                    height: `${h}px`,
                    // @ts-expect-error custom CSS variable
                    '--wave-speed': `${speed}s`,
                    animationDelay: `${delay}ms`,
                    transform: playing ? undefined : 'scaleY(0.35)'
                  }}
                />
              )
            })}
          </div>
        </div>
      </div>

      {/* Preset Library Popover */}
      {isOpen && (
        <SoundPresetPopover
          playing={playing}
          noiseType={noiseType}
          volume={volume}
          customAudioName={customAudioName}
          customTracks={customTracks}
          activeCustomTrackId={activeCustomTrackId}
          selectedCategory={selectedCategory}
          onToggle={toggle}
          onVolumeChange={setVolume}
          onNextTrack={handleNextTrack}
          onPrevTrack={handlePrevTrack}
          onSelectCategory={setSelectedCategory}
          onSelectPreset={handleSelectPreset}
          onSelectCustomTrack={selectCustomAudio}
          onRemoveCustomTrack={removeCustomAudio}
          onChooseCustomFile={handleChooseCustomFile}
          onClearCustomFile={clearCustomAudio}
          className="w-[340px] sm:w-[370px] left-0 sm:left-2 top-full mt-2.5 z-50 shadow-apple-popover"
          gridClassName="h-[185px] sm:h-[205px]"
        />
      )}
    </div>
  )
}
