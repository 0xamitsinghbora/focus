import { DailyGoal } from '../../../../shared/types'

export type PromptOption =
  | { type: 'goal'; goal: DailyGoal; id: string; title: string }
  | { type: 'other'; id: 'other'; title: string }
  | { type: 'break'; id: 'break'; title: string }

export type PromptStep = 'select' | 'detail' | 'afk'
