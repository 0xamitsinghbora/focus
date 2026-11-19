import { useState, useRef, useEffect, useCallback } from 'react'

type AppTab = 'today' | 'goals' | 'review' | 'settings'

interface UseTabNavigationOptions {
  onTabChange?: (tab: AppTab) => void
}

interface UseTabNavigationReturn {
  tab: AppTab
  setTab: React.Dispatch<React.SetStateAction<AppTab>>
  visitedTabs: Set<string>
  triggerAddGoal: number
  setTriggerAddGoal: React.Dispatch<React.SetStateAction<number>>
}

export function useTabNavigation({
  onTabChange
}: UseTabNavigationOptions = {}): UseTabNavigationReturn {
  const [tab, setTabState] = useState<AppTab>('today')
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(() => new Set(['today']))
  const [triggerAddGoal, setTriggerAddGoal] = useState<number>(0)

  const tabRef = useRef<AppTab>(tab)
  useEffect(() => {
    tabRef.current = tab
  }, [tab])

  const onTabChangeRef = useRef(onTabChange)
  useEffect(() => {
    onTabChangeRef.current = onTabChange
  }, [onTabChange])

  // Synchronous tab switching that immediately tracks visitedTabs
  const setTab = useCallback((nextTabOrFn: React.SetStateAction<AppTab>) => {
    setTabState((prev) => {
      const nextTab = typeof nextTabOrFn === 'function' ? nextTabOrFn(prev) : nextTabOrFn
      setVisitedTabs((visited) => (visited.has(nextTab) ? visited : new Set(visited).add(nextTab)))
      return nextTab
    })
  }, [])

  // Ensure visitedTabs is synchronized on all programmatic, shortcut, or IPC tab transitions
  useEffect(() => {
    setVisitedTabs((prev) => (prev.has(tab) ? prev : new Set(prev).add(tab)))
  }, [tab])

  // Single unified effect that notifies onTabChange whenever the active tab changes (skipping initial mount)
  const isFirstMountRef = useRef(true)
  useEffect(() => {
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false
      return
    }
    onTabChangeRef.current?.(tab)
  }, [tab])

  // Global Ctrl+N / Cmd+N shortcut to switch to goals and trigger add task
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        if (
          e.target instanceof HTMLElement &&
          (e.target.isContentEditable || ['INPUT', 'TEXTAREA'].includes(e.target.tagName))
        ) {
          return
        }
        e.preventDefault()
        if (tabRef.current !== 'goals') {
          setTab('goals')
        }
        setTriggerAddGoal((prev) => prev + 1)
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown)
    }
  }, [setTab])

  // IPC navigation listener
  useEffect(() => {
    const cleanup = window.api?.events?.onNavigateTab?.(
      (targetTab: 'today' | 'goals' | 'review' | 'settings') => {
        if (['today', 'goals', 'review', 'settings'].includes(targetTab)) {
          setTab(targetTab)
          if (targetTab === 'goals') {
            setTriggerAddGoal((prev) => prev + 1)
          } else {
            setTriggerAddGoal(0)
          }
        }
      }
    )
    return () => {
      cleanup?.()
    }
  }, [setTab])

  return {
    tab,
    setTab,
    visitedTabs,
    triggerAddGoal,
    setTriggerAddGoal
  }
}
