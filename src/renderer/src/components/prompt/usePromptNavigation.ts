import { useMemo, useCallback, useEffect } from 'react'
import { PromptOption, PromptStep } from './types'

export interface UsePromptNavigationProps {
  step: PromptStep
  setStep: (step: PromptStep) => void
  options: PromptOption[]
  goalsCount: number
  selectedIndex: number
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>
  isSaving: boolean
  onSelectOption: (index: number) => void
  onSnooze: () => void
  onSubmit: () => void
  onReturnAfk?: () => void
  onSetFocusQuality?: (quality: number) => void
  detailInputRef: React.RefObject<HTMLInputElement | null>
  promptAppearedAtRef?: React.MutableRefObject<number>
}

export interface PromptNavigationResult {
  safeSelectedIndex: number
  handleKeyDown: (e: React.KeyboardEvent | KeyboardEvent) => void
}

export function usePromptNavigation({
  step,
  setStep,
  options,
  goalsCount,
  selectedIndex,
  setSelectedIndex,
  isSaving,
  onSelectOption,
  onSnooze,
  onSubmit,
  onReturnAfk,
  onSetFocusQuality,
  detailInputRef,
  promptAppearedAtRef
}: UsePromptNavigationProps): PromptNavigationResult {
  const safeSelectedIndex = useMemo(() => {
    if (options.length === 0) return 0
    return Math.min(Math.max(0, selectedIndex), options.length - 1)
  }, [selectedIndex, options.length])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent | KeyboardEvent): void => {
      if (isSaving) return

      // 500ms keypress debounce prevents accidental submission if user is actively typing when prompt appears
      if (promptAppearedAtRef && Date.now() - promptAppearedAtRef.current < 500) {
        return
      }

      if (step === 'afk') {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onReturnAfk?.()
          return
        }
      }

      if (step === 'select') {
        if (e.key === 'Escape') {
          e.preventDefault()
          onSnooze()
          return
        }

        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelectOption(safeSelectedIndex)
          return
        }

        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setSelectedIndex((prev) => {
            if (options.length === 0) return 0
            if (prev === goalsCount - 1) {
              return goalsCount
            }
            return (prev + 1) % options.length
          })
          return
        }

        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setSelectedIndex((prev) => {
            if (options.length === 0) return 0
            return (prev - 1 + options.length) % options.length
          })
          return
        }

        if (e.key === 'ArrowRight') {
          if (safeSelectedIndex === goalsCount && options.length > goalsCount + 1) {
            e.preventDefault()
            setSelectedIndex(goalsCount + 1)
            return
          }
        }

        if (e.key === 'ArrowLeft') {
          if (safeSelectedIndex === goalsCount + 1) {
            e.preventDefault()
            setSelectedIndex(goalsCount)
            return
          }
        }

        // Quick number shortcut
        const num = parseInt(e.key, 10)
        if (!isNaN(num) && num >= 1 && num <= goalsCount) {
          e.preventDefault()
          onSelectOption(num - 1)
          return
        }

        if (e.key.toLowerCase() === 'o' && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault()
          onSelectOption(goalsCount)
          return
        }

        if (e.key.toLowerCase() === 'b' && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault()
          onSelectOption(goalsCount + 1)
          return
        }
      } else if (step === 'detail') {
        if (e.altKey && ['1', '2', '3', '4', '5'].includes(e.key)) {
          e.preventDefault()
          onSetFocusQuality?.(parseInt(e.key, 10))
          return
        }

        if (e.key === 'Escape') {
          e.preventDefault()
          setStep('select')
          return
        }

        if (e.key === 'Enter') {
          e.preventDefault()
          onSubmit()
          return
        }
      }
    },
    [
      isSaving,
      step,
      options.length,
      goalsCount,
      safeSelectedIndex,
      onSnooze,
      onSelectOption,
      setSelectedIndex,
      setStep,
      onSubmit,
      onReturnAfk,
      promptAppearedAtRef
    ]
  )

  // Global window keydown listener fallback
  useEffect(() => {
    const listener = (e: KeyboardEvent): void => {
      if (step === 'afk') {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onReturnAfk?.()
          return
        }
      }

      if (step === 'select') {
        if (
          e.key === 'Escape' ||
          e.key === 'Enter' ||
          e.key === ' ' ||
          e.key === 'ArrowDown' ||
          e.key === 'ArrowUp' ||
          e.key === 'ArrowRight' ||
          e.key === 'ArrowLeft' ||
          e.key.toLowerCase() === 'o' ||
          e.key.toLowerCase() === 'b' ||
          (!isNaN(parseInt(e.key, 10)) &&
            parseInt(e.key, 10) >= 1 &&
            parseInt(e.key, 10) <= goalsCount)
        ) {
          handleKeyDown(e)
        }
      } else if (step === 'detail') {
        if (
          e.key === 'Escape' ||
          (e.key === 'Enter' && document.activeElement !== detailInputRef.current)
        ) {
          handleKeyDown(e)
        }
      }
    }
    window.addEventListener('keydown', listener)
    return () => {
      window.removeEventListener('keydown', listener)
    }
  }, [step, goalsCount, handleKeyDown, detailInputRef])

  return {
    safeSelectedIndex,
    handleKeyDown
  }
}
