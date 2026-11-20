import { LogEntry, DailyGoal } from '../../../shared/types'
import { cn } from './utils'
import { getGroupTheme, getPreferredGroupColor } from './groupTheme'

interface LogThemeConfig {
  bar: string
  badge: string
  dot: string
  label: string
}

export const getLogThemeConfig = (log: LogEntry, goals?: DailyGoal[]): LogThemeConfig => {
  // 0. Meditation (Trataka) -> White
  const isMeditation =
    Boolean(log.didDotReset) ||
    /\b(meditation|trataka)\b/i.test(log.text || '') ||
    /\b(meditation|trataka)\b/i.test(log.note || '')
  if (isMeditation) {
    return {
      bar: 'bg-white',
      badge:
        'text-foreground dark:text-white bg-white/80 dark:bg-white/10 border-border/60 dark:border-white/30',
      dot: 'bg-white shadow-[0_0_6px_rgba(255,255,255,0.7)] border border-black/20 dark:border-transparent',
      label: 'Meditation'
    }
  }

  // 1. Break -> Red
  const isBreak =
    log.productivity === 'break' ||
    (log.productivity !== 'productive' && /\bbreak\b/i.test(log.text || ''))
  if (isBreak) {
    return {
      bar: 'bg-apple-red',
      badge: 'text-apple-red bg-apple-red/10 border-apple-red/20',
      dot: 'bg-apple-red',
      label: 'Break'
    }
  }

  // 2. Associated with a task/goal -> Task color scheme
  let taskGoal: DailyGoal | undefined = undefined
  if (goals && goals.length > 0) {
    if (log.goalId) {
      taskGoal = goals.find((g) => g.id === log.goalId)
    }
    if (!taskGoal && log.goalTitle) {
      taskGoal = goals.find(
        (g) => g.title.trim().toLowerCase() === log.goalTitle?.trim().toLowerCase()
      )
    }
  }

  const groupTag = taskGoal?.groupTag
  const groupColor =
    taskGoal?.groupColor || (groupTag ? getPreferredGroupColor(groupTag) : undefined)

  if (groupColor || groupTag) {
    const theme = getGroupTheme(groupColor || getPreferredGroupColor(groupTag!))
    return {
      bar: theme.barBg,
      badge: cn(theme.badgeText, theme.badgeBg, theme.badgeBorder),
      dot: theme.dotClass,
      label: groupTag || 'Task'
    }
  }

  // If associated with a goal/task but without custom group tag -> Default task green
  if (log.goalTitle || log.goalId) {
    return {
      bar: 'bg-apple-green',
      badge: 'text-apple-green bg-apple-green/10 border-apple-green/20',
      dot: 'bg-apple-green',
      label: 'Task'
    }
  }

  // 3. Something else (unassigned session, general logged time) -> Yellow (Amber)
  return {
    bar: 'bg-apple-amber',
    badge: 'text-apple-amber bg-apple-amber/10 border-apple-amber/20',
    dot: 'bg-apple-amber',
    label: 'Other'
  }
}
