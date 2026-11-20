import {
  GoalBreakdownAnalysis,
  GoalBreakdownResult,
  GoalComplexityLevel,
  TaskBreakdownItem
} from '../../../shared/types'

const GENERIC_TITLES = new Set([
  'work',
  'working',
  'stuff',
  'things',
  'something',
  'code',
  'coding',
  'dev',
  'study',
  'studying',
  'reading',
  'read',
  'prep',
  'prep task',
  'prep work',
  'math',
  'emails',
  'email',
  'inbox',
  'tasks',
  'task',
  'project',
  'fix',
  'fix bug',
  'bug',
  'bugs',
  'fix bugs',
  'bug fix',
  'workout',
  'gym',
  'clean',
  'cleaning',
  'research',
  'researching',
  'learn',
  'learn python',
  'learn coding',
  'learn react',
  'presentation',
  'slides',
  'notes',
  'misc',
  'admin',
  'meeting',
  'calls',
  'homework',
  'do homework',
  'do stuff',
  'design',
  'thinking',
  'think',
  'plan',
  'planning',
  'feature',
  'ticket',
  'review',
  'writing',
  'write',
  'job'
])

const VAGUE_PHRASES =
  /\b(work\s+on|look\s+into|look\s+at|deal\s+with|take\s+care\s+of|figure\s+out|think\s+about|continue\s+with|handle|do\s+some|more\s+on|some\s+work|some\s+coding|touch\s+up|mess\s+around\s+with|work\s+with|do\s+stuff|do\s+things)\b/i

const VAGUE_SUFFIX = /\b(stuff|things|something|items|work|tasks|etc|problems|issues)\s*$/i

const DELIVERABLES =
  /\b(schema|endpoint|api|database|migration|table|component|button|form|card|modal|dialog|page|view|screen|header|footer|auth|token|middleware|query|mutation|test|tests|unit\s+test|integration\s+test|docs|readme|guide|article|blog|post|essay|chapter|section|report|proposal|summary|wireframe|mockup|figma|icon|logo|theme|deck|slides|presentation|invoice|spreadsheet|budget|outline|draft|pr|commit|release|v\d+)\b/i

const EPIC_PATTERNS = [
  /\b(entire|whole|complete|full|all\s+of|all\s+the|from\s+scratch|all-in-one|end\s+to\s+end|e2e|everything)\b/i,
  /\b(build|create|develop|code|launch|architect)\b.*?\b(app|application|saas|platform|system|website|site|game|engine|startup|product|service|monolith|infrastructure)\b/i,
  /\b(write|draft|author)\b.*?\b(book|thesis|novel|dissertation|monograph|memoir)\b/i,
  /\b(master|learn|study)\b.*?\b(machine\s+learning|deep\s+learning|rust|c\+\+|full\s+stack|web\s+development|data\s+science|everything|calculus|quantum|physics|piano|japanese|spanish|all)\b/i,
  /\b(refactor|rewrite|migrate|redesign|overhaul)\b.*?\b(codebase|architecture|backend|frontend|monolith|database|system|repo|app|website)\b/i,
  /\b(prepare|study)\b.*?\b(finals|boards|interview|interviews|gre|gmat|sat|mcat|bar\s+exam|usmle|cfa)\b/i
]

/**
 * Fast synchronous check for real-time keystroke hints in UI.
 */
export function quickAssessTask(
  title: string,
  note?: string,
  targetMinutes?: number
): { isVague: boolean; isTooBig: boolean; complexity: GoalComplexityLevel } {
  const clean = (title || '').trim().toLowerCase()
  if (!clean || clean.length < 2) {
    return { isVague: false, isTooBig: false, complexity: 'digestible' }
  }

  const words = clean.split(/\s+/).filter(Boolean)
  let clarity = 95

  if (GENERIC_TITLES.has(clean)) clarity -= 50
  if (words.length <= 1) clarity -= 45
  else if (words.length === 2) clarity -= 30
  else if (words.length === 3) clarity -= 15

  if (VAGUE_PHRASES.test(clean)) clarity -= 30
  if (VAGUE_SUFFIX.test(clean)) clarity -= 25
  if (DELIVERABLES.test(clean)) clarity += 25
  if (note && note.trim().length >= 25) clarity += 15

  const isVague = clarity < 60

  let scope = 3
  if (typeof targetMinutes === 'number' && targetMinutes > 0) {
    if (targetMinutes >= 120) scope += 4
    else if (targetMinutes >= 90) scope += 3
    else if (targetMinutes >= 60) scope += 1
  }

  for (const pattern of EPIC_PATTERNS) {
    if (pattern.test(clean)) {
      scope += 3
    }
  }

  const isTooBig = scope >= 6 || (typeof targetMinutes === 'number' && targetMinutes >= 90)

  let complexity: GoalComplexityLevel = 'digestible'
  if (isVague && isTooBig) complexity = 'vague_and_too_big'
  else if (isVague) complexity = 'vague'
  else if (isTooBig) complexity = 'too_big'

  return { isVague, isTooBig, complexity }
}

/**
 * Invokes IPC analyze endpoint with local fallback.
 */
export async function analyzeTaskAi(
  title: string,
  note?: string,
  targetMinutes?: number
): Promise<GoalBreakdownAnalysis> {
  if (typeof window !== 'undefined' && window.api?.goals?.analyze) {
    try {
      return await window.api.goals.analyze({ title, note, targetMinutes })
    } catch (err) {
      console.warn('IPC goals.analyze failed, falling back to local heuristic:', err)
    }
  }

  const { isVague, isTooBig, complexity } = quickAssessTask(title, note, targetMinutes)
  return {
    isVague,
    isTooBig,
    complexity,
    clarityScore: isVague ? 35 : 85,
    scopeScore: isTooBig ? 8 : 3,
    challengeHeading:
      complexity === 'vague_and_too_big'
        ? 'Vague & Overwhelming Scope'
        : complexity === 'vague'
          ? 'Ambiguous Finish Line'
          : complexity === 'too_big'
            ? 'Too Big to Digest in One Session'
            : 'Well-Defined & Digestible',
    challengeCritique:
      complexity === 'vague_and_too_big'
        ? `"${title}" has no clear deliverable and covers a massive scope. Break it into bounded 20-40 minute sprints.`
        : complexity === 'vague'
          ? `"${title}" lacks a concrete deliverable. Ambiguity invites distraction.`
          : complexity === 'too_big'
            ? `"${title}" exceeds what can be realistically finished in one session.`
            : `"${title}" is clear and actionable.`,
    probingQuestions: [
      'What single concrete deliverable will be finished?',
      'What does the first 25 minutes of work look like?'
    ],
    recommendedMinutes: 25
  }
}

/**
 * Invokes IPC breakdown endpoint with local fallback.
 */
export async function breakdownTaskAi(
  title: string,
  note?: string,
  targetMinutes?: number
): Promise<GoalBreakdownResult> {
  if (typeof window !== 'undefined' && window.api?.goals?.breakdown) {
    try {
      return await window.api.goals.breakdown({ title, note, targetMinutes })
    } catch (err) {
      console.warn('IPC goals.breakdown failed, falling back to local breakdown:', err)
    }
  }

  const analysis = await analyzeTaskAi(title, note, targetMinutes)
  const clean =
    title
      .trim()
      .replace(/^build|write|study|clean|work on/i, '')
      .trim() || title

  const fallbackTasks: TaskBreakdownItem[] = [
    {
      id: 'sub-1',
      title: `Clarify requirements & outline deliverable for ${clean}`,
      targetMinutes: 20,
      goalType: 'deep',
      rationale: 'Establishes precise definition of done before starting',
      order: 1
    },
    {
      id: 'sub-2',
      title: `Execute primary focused work on ${clean}`,
      targetMinutes: 40,
      goalType: 'deep',
      rationale: 'Core deep work sprint',
      order: 2
    },
    {
      id: 'sub-3',
      title: `Review results, polish output, and finalize ${clean}`,
      targetMinutes: 25,
      goalType: 'routine',
      rationale: 'Ensures quality and wraps up proof of work',
      order: 3
    }
  ]

  return {
    originalTitle: title,
    analysis,
    suggestedTasks: fallbackTasks,
    suggestedGroupTag: 'focus',
    totalMinutes: 85
  }
}
