import { useEffect } from 'react'
import {
  GROUP_THEMES,
  getGroupTheme,
  getPreferredGroupColor,
  getUsedGroupColorsMap,
  GroupColorId
} from '../../lib/groupTheme'
import { cn } from '../../lib/utils'

interface GoalsColorPickerProps {
  picker: { groupTag: string; x: number; y: number } | null
  onSelectColor: (groupTag: string, colorId: GroupColorId) => Promise<void>
  onClose?: () => void
  existingGroups?: { tag: string; color?: string }[]
}

export function GoalsColorPicker({
  picker,
  onSelectColor,
  onClose,
  existingGroups
}: GoalsColorPickerProps): React.JSX.Element | null {
  useEffect(() => {
    if (!picker) return
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose?.()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [picker, onClose])

  if (!picker) return null

  return (
    <>
      <div
        className="fixed inset-0 z-[9998]"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault()
          onClose?.()
        }}
      />
      <div
        style={{ left: picker.x, top: picker.y }}
        className="fixed z-9999 w-[240px] rounded-xl border border-border/80 bg-popover/95 p-2.5 shadow-apple-popover backdrop-blur-md animate-in fade-in zoom-in-95 duration-100 select-none text-[12px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-border/40">
          <span className="font-semibold text-foreground text-[11.5px] truncate max-w-[130px]">
            {picker.groupTag}
          </span>
          <span className="text-[10px] text-muted-foreground truncate max-w-[90px]">
            {getGroupTheme(getPreferredGroupColor(picker.groupTag)).name}
          </span>
        </div>
        <div className="grid grid-cols-8 gap-1">
          {(() => {
            const usedColorsMap = getUsedGroupColorsMap(picker.groupTag, existingGroups)
            return GROUP_THEMES.map((theme) => {
              const currentTagColor = getPreferredGroupColor(picker.groupTag)
              const isSelected = currentTagColor === theme.id
              const usedByGroup = usedColorsMap.get(theme.id)
              const isUsed = Boolean(usedByGroup)

              return (
                <button
                  key={theme.id}
                  type="button"
                  disabled={isUsed}
                  onClick={async () => {
                    if (!isUsed) {
                      await onSelectColor(picker.groupTag, theme.id)
                      onClose?.()
                    }
                  }}
                  title={isUsed ? `${theme.name} (Already used by "${usedByGroup}")` : theme.name}
                  className={cn(
                    'relative h-6 w-6 rounded-md flex items-center justify-center transition-all',
                    theme.headerBg,
                    theme.headerBorder,
                    isUsed
                      ? 'opacity-35 cursor-not-allowed hover:opacity-35'
                      : isSelected
                        ? 'ring-2 ring-primary scale-110 shadow-xs cursor-pointer'
                        : 'hover:scale-105 opacity-80 hover:opacity-100 cursor-pointer'
                  )}
                >
                  <div className="relative flex items-center justify-center">
                    <span className={cn('h-3 w-3 rounded-full shadow-2xs', theme.dotClass)} />
                    {isUsed && (
                      <svg
                        className="absolute inset-0 m-auto h-2.5 w-2.5 text-foreground/90 drop-shadow-xs pointer-events-none stroke-[3]"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    )}
                  </div>
                </button>
              )
            })
          })()}
        </div>
      </div>
    </>
  )
}
