import React, { useId } from 'react'
import { cn } from '../lib/utils'

interface FocusLogoProps {
  /** Size in pixels (width and height for square icon, or glyph size) */
  size?: number
  /** Style variant: 'tile' (squircle app icon) or 'glyph' (minimal standalone mark) */
  variant?: 'tile' | 'glyph'
  /** Animate the focal reticle and core pulse */
  animated?: boolean
  /** Optional className for container */
  className?: string
  /** If true, render the "Focus" brand wordmark next to the icon */
  showWordmark?: boolean
  /** Wordmark class overrides */
  wordmarkClassName?: string
}

export function FocusLogo({
  size = 24,
  variant = 'tile',
  animated = false,
  className,
  showWordmark = false,
  wordmarkClassName
}: FocusLogoProps): React.JSX.Element {
  const isTile = variant === 'tile'
  const id = useId().replace(/:/g, '')

  return (
    <div className={cn('inline-flex items-center gap-2.5 select-none', className)}>
      <svg
        viewBox="0 0 512 512"
        width={size}
        height={size}
        className={cn(
          'shrink-0 transition-transform duration-200 hover:scale-[1.03]',
          !isTile && 'drop-shadow-[0_2px_8px_rgba(255,255,255,0.12)]'
        )}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Deep Obsidian Tile Background */}
          <linearGradient id={`${id}-bg`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#161822" />
            <stop offset="50%" stopColor="#0E1017" />
            <stop offset="100%" stopColor="#050608" />
          </linearGradient>

          {/* Precision Chamfer Rim Highlight */}
          <linearGradient id={`${id}-rim`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(255, 255, 255, 0.28)" />
            <stop offset="35%" stopColor="rgba(255, 255, 255, 0.08)" />
            <stop offset="100%" stopColor="rgba(255, 255, 255, 0.01)" />
          </linearGradient>

          {/* Flow State Ambient Aura */}
          <radialGradient id={`${id}-aura`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#38BDF8" stopOpacity={animated ? 0.28 : 0.18} />
            <stop offset="50%" stopColor="#0284C7" stopOpacity="0.05" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </radialGradient>

          {/* Platinum Outer Ring Gradient */}
          <linearGradient id={`${id}-ring`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="60%" stopColor="#F8FAFC" />
            <stop offset="100%" stopColor="#E2E8F0" />
          </linearGradient>

          {/* Central Focal Core Gradient */}
          <radialGradient id={`${id}-core`} cx="35%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="55%" stopColor="#F1F5F9" />
            <stop offset="100%" stopColor="#CBD5E1" />
          </radialGradient>

          {/* Mark Drop Shadow */}
          <filter id={`${id}-shadow`} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow
              dx="0"
              dy="10"
              stdDeviation="12"
              floodColor="#000000"
              floodOpacity="0.6"
            />
          </filter>
        </defs>

        {/* Tile Background (when in 'tile' variant) */}
        {isTile && (
          <>
            <rect x="4" y="4" width="504" height="504" rx="105" ry="105" fill={`url(#${id}-bg)`} />
            <rect
              x="4"
              y="4"
              width="504"
              height="504"
              rx="105"
              ry="105"
              fill="none"
              stroke={`url(#${id}-rim)`}
              strokeWidth="3"
            />
          </>
        )}

        {/* Flow Aura */}
        <circle
          cx="256"
          cy="256"
          r="235"
          fill={`url(#${id}-aura)`}
          className={animated ? 'animate-pulse' : undefined}
        />

        {/* The Golden Ratio Focus Mark (Enlarged & Bold) */}
        <g filter={isTile ? `url(#${id}-shadow)` : undefined}>
          {/* Outer Halo Ring (Prominent Boundary) */}
          <circle
            cx="256"
            cy="256"
            r="213"
            fill="none"
            stroke={`url(#${id}-ring)`}
            strokeWidth="25"
          />

          {/* Inset Subtle Horizon Ring */}
          <circle
            cx="256"
            cy="256"
            r="142"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="3.5"
            opacity="0.38"
          />

          {/* Center Focal Core: The Singularity of Attention */}
          <g className={animated ? 'animate-pulse' : undefined}>
            <circle cx="256" cy="256" r="71" fill={`url(#${id}-core)`} />
            <circle
              cx="256"
              cy="256"
              r="71"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="1.75"
              opacity="0.95"
            />
          </g>
        </g>
      </svg>

      {showWordmark && (
        <span
          className={cn(
            'text-[17px] font-bold tracking-tight text-foreground select-none',
            wordmarkClassName
          )}
        >
          Focus
        </span>
      )}
    </div>
  )
}
