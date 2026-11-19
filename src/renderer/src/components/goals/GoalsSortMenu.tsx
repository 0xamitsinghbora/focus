import { useEffect, useRef, useState } from 'react'
import { cn } from '../../lib/utils'
import type { SortOption } from './types'

interface GoalsSortMenuProps {
  sortOption: SortOption
  setSortOption: (opt: SortOption) => void
}

interface SortItem {
  value: SortOption
  label: string
  shortLabel: string
  renderIcon: (className?: string) => React.JSX.Element
}

const SORT_ITEMS: SortItem[] = [
  {
    value: 'due-date',
    label: 'Due Date (Nearest)',
    shortLabel: 'Due Date',
    renderIcon: (cls) => (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cls}
      >
        <rect width="18" height="18" x="3" y="4" rx="2" />
        <line x1="16" x2="16" y1="2" y2="6" />
        <line x1="8" x2="8" y1="2" y2="6" />
        <line x1="3" x2="21" y1="10" y2="10" />
      </svg>
    )
  },
  {
    value: 'alpha-asc',
    label: 'Title (A–Z)',
    shortLabel: 'Title (A–Z)',
    renderIcon: (cls) => (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cls}
      >
        <path d="M11 5h10" />
        <path d="M11 9h7" />
        <path d="M11 13h4" />
        <path d="m3 17 3 3 3-3" />
        <path d="M6 18V4" />
      </svg>
    )
  },
  {
    value: 'manual',
    label: 'Manual (Custom)',
    shortLabel: 'Manual',
    renderIcon: (cls) => (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cls}
      >
        <line x1="4" x2="20" y1="9" y2="9" />
        <line x1="4" x2="20" y1="15" y2="15" />
        <circle cx="8" cy="9" r="2" fill="currentColor" />
        <circle cx="16" cy="15" r="2" fill="currentColor" />
      </svg>
    )
  }
]

export function GoalsSortMenu({
  sortOption,
  setSortOption
}: GoalsSortMenuProps): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const activeItem = SORT_ITEMS.find((it) => it.value === sortOption) || SORT_ITEMS[0]

  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setIsOpen(false)
      }
    }
    window.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        title="Sort tasks"
        className={cn(
          'flex items-center gap-1.5 rounded-lg border border-border/80 bg-surface pl-2.5 pr-2 py-1 text-[11.5px] font-medium text-foreground transition-all shadow-2xs cursor-pointer select-none',
          isOpen
            ? 'bg-secondary border-primary/50 text-foreground ring-1 ring-primary/30'
            : 'hover:bg-secondary hover:text-foreground'
        )}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 text-muted-foreground"
        >
          <path d="m3 16 4 4 4-4" />
          <path d="M7 20V4" />
          <path d="m21 8-4-4-4 4" />
          <path d="M17 4v16" />
        </svg>
        <span>Sort: {activeItem.shortLabel}</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn(
            'text-muted-foreground transition-transform duration-200 ml-0.5',
            isOpen && 'rotate-180 text-foreground'
          )}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {/* Custom Dropdown Menu */}
      {isOpen && (
        <div
          role="listbox"
          aria-label="Sort options"
          className="absolute right-0 top-full mt-1.5 z-50 min-w-[185px] rounded-xl border border-border/80 bg-popover/95 p-1 shadow-apple-popover backdrop-blur-md animate-in fade-in zoom-in-95 duration-100 select-none text-[12px]"
        >
          <div className="px-2 py-1 text-[10px] font-semibold tracking-wider uppercase text-muted-foreground/70 border-b border-border/40 mb-1">
            Sort Tasks By
          </div>
          <div className="space-y-0.5">
            {SORT_ITEMS.map((item) => {
              const isSelected = item.value === sortOption
              return (
                <button
                  key={item.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    setSortOption(item.value)
                    setIsOpen(false)
                  }}
                  className={cn(
                    'flex w-full items-center justify-between gap-2.5 rounded-lg px-2.5 py-1.5 text-[12px] transition-colors cursor-pointer text-left',
                    isSelected
                      ? 'bg-primary/15 text-primary font-medium'
                      : 'text-foreground/90 hover:bg-secondary hover:text-foreground'
                  )}
                >
                  <span className="flex items-center gap-2 truncate">
                    {item.renderIcon(
                      cn(
                        'shrink-0 w-3.5 h-3.5',
                        isSelected ? 'text-primary' : 'text-muted-foreground'
                      )
                    )}
                    <span className="truncate">{item.label}</span>
                  </span>
                  {isSelected && (
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-primary shrink-0 ml-1.5"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
