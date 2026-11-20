import {
  GoalBreakdownAnalysis,
  GoalBreakdownResult,
  GoalComplexityLevel,
  TaskBreakdownItem
} from '../../shared/types'
import { randomUUID } from 'crypto'

const DOMAIN_KEYWORDS: Record<string, RegExp> = {
  engineering:
    /\b(code|coding|dev|develop|implement|feature|bug|fix|refactor|test|unit|endpoint|api|backend|frontend|react|typescript|sql|database|db|migration|deploy|git|commit|pr|docker|service|controller|function|query|rust|python|auth|oauth|graphql|webhook|schema|html|css|redux|state|server|client|app|application|software)\b/i,
  writing:
    /\b(write|writing|draft|article|blog|post|essay|chapter|book|copy|documentation|docs|guide|specs|notes|readme|proposal|summary|outline|edit|proofread|thesis|dissertation|novel|newsletter|script|report)\b/i,
  design:
    /\b(design|ui|ux|figma|mockup|wireframe|layout|component|prototype|svg|icon|canvas|sketch|styling|css|tailwind|theme|palette|visual|typography|poster|banner|animation|3d|blender|render)\b/i,
  research_learning:
    /\b(read|reading|study|studying|learn|learning|course|lecture|tutorial|paper|book|chapter|concept|algorithm|math|review|notes|exercise|calculus|physics|chemistry|biology|exam|flashcards|anki|revise|revision|master|memorize)\b/i,
  admin_operations:
    /\b(email|inbox|meeting|plan|planning|schedule|calendar|organize|task|tickets|jira|trello|linear|clean|backup|sync|admin|receipts|taxes|bills|finance|invoice|declutter|desk|chores)\b/i
}

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

const VAGUE_INDICATORS_REGEX =
  /\b(work\s+on|look\s+into|look\s+at|deal\s+with|take\s+care\s+of|figure\s+out|think\s+about|continue\s+with|handle|do\s+some|more\s+on|some\s+work|some\s+coding|touch\s+up|mess\s+around\s+with|work\s+with|do\s+stuff|do\s+things|work\s+more|continue|do)\b/i

const VAGUE_SUFFIX_REGEX = /\b(stuff|things|something|items|work|tasks|etc|problems|issues)\s*$/i

const DELIVERABLE_INDICATORS_REGEX =
  /\b(schema|endpoint|api|database|migration|table|component|button|form|card|modal|dialog|page|view|screen|header|footer|auth|token|middleware|query|mutation|test|tests|unit\s+test|integration\s+test|docs|readme|guide|article|blog|post|essay|chapter|section|report|proposal|summary|wireframe|mockup|figma|icon|logo|theme|deck|slides|presentation|invoice|spreadsheet|budget|outline|draft|pr|commit|release|v\d+)\b/i

const SPECIFIC_METRIC_REGEX =
  /\b(\d+\s*(tests|pages|chapters|items|slides|screens|tables|endpoints|tickets|files|words)|v\d+(\.\d+)?|part\s*\d+|step\s*\d+|#\d+)\b/i

const EPIC_SCOPE_PATTERNS = [
  /\b(entire|whole|complete|full|all\s+of|all\s+the|from\s+scratch|all-in-one|end\s+to\s+end|e2e|everything)\b/i,
  /\b(build|create|develop|code|launch|architect)\b.*?\b(app|application|saas|platform|system|website|site|game|engine|startup|product|service|monolith|infrastructure)\b/i,
  /\b(write|draft|author)\b.*?\b(book|thesis|novel|dissertation|monograph|memoir)\b/i,
  /\b(master|learn|study)\b.*?\b(machine\s+learning|deep\s+learning|rust|c\+\+|full\s+stack|web\s+development|data\s+science|everything|calculus|quantum|physics|piano|japanese|spanish|all)\b/i,
  /\b(refactor|rewrite|migrate|redesign|overhaul)\b.*?\b(codebase|architecture|backend|frontend|monolith|database|system|repo|app|website)\b/i,
  /\b(prepare|study)\b.*?\b(finals|boards|interview|interviews|gre|gmat|sat|mcat|bar\s+exam|usmle|cfa)\b/i
]

export class GoalBreakdownService {
  /**
   * Analyzes a task's title, note, and target duration to assess clarity, scope,
   * and psychological friction risks (vagueness vs excessive size).
   */
  public analyzeTask(title: string, note?: string, targetMinutes?: number): GoalBreakdownAnalysis {
    const cleanTitle = (title || '').trim()
    if (!cleanTitle) {
      return {
        isVague: true,
        isTooBig: false,
        complexity: 'vague',
        clarityScore: 0,
        scopeScore: 1,
        challengeHeading: 'Empty Goal Title',
        challengeCritique: 'Please enter a goal title to analyze and break down.',
        probingQuestions: ['What specific outcome do you want to accomplish today?'],
        recommendedMinutes: 25
      }
    }

    const clarityScore = this.calculateClarityScore(cleanTitle, note)
    const isVague = clarityScore < 60

    const scopeScore = this.calculateScopeScore(cleanTitle, targetMinutes)
    const isTooBig = scopeScore >= 6 || (typeof targetMinutes === 'number' && targetMinutes >= 90)

    let complexity: GoalComplexityLevel = 'digestible'
    if (isVague && isTooBig) {
      complexity = 'vague_and_too_big'
    } else if (isVague) {
      complexity = 'vague'
    } else if (isTooBig) {
      complexity = 'too_big'
    }

    const domain = this.detectDomain(`${cleanTitle} ${note || ''}`)
    const { heading, critique, questions } = this.getChallenge(complexity, domain, cleanTitle)

    return {
      isVague,
      isTooBig,
      complexity,
      clarityScore,
      scopeScore,
      detectedDomain: domain,
      challengeHeading: heading,
      challengeCritique: critique,
      probingQuestions: questions,
      recommendedMinutes: this.getRecommendedMinutes(targetMinutes, complexity)
    }
  }

  /**
   * Generates a concrete, actionable breakdown of a vague or oversized task into
   * 3-5 bite-sized focus sprints (20-45m each) with clear deliverables.
   */
  public breakdownTask(title: string, note?: string, targetMinutes?: number): GoalBreakdownResult {
    const analysis = this.analyzeTask(title, note, targetMinutes)
    const domain = analysis.detectedDomain || 'general'
    const subject = this.extractSubject(title)

    const suggestedTasks = this.generateSubtasks(domain, subject, title, targetMinutes)
    const totalMinutes = suggestedTasks.reduce((sum, t) => sum + t.targetMinutes, 0)
    const suggestedGroupTag = this.deriveSuggestedGroupTag(domain, subject)

    return {
      originalTitle: title,
      analysis,
      suggestedTasks,
      suggestedGroupTag,
      totalMinutes
    }
  }

  /**
   * Detects the work domain based on semantic keywords.
   */
  public detectDomain(text: string): string {
    if (!text) return 'general'
    for (const [domain, regex] of Object.entries(DOMAIN_KEYWORDS)) {
      if (regex.test(text)) {
        return domain
      }
    }
    return 'general'
  }

  /**
   * Calculates a clarity score from 0 (very vague) to 100 (concrete & observable).
   */
  public calculateClarityScore(title: string, note?: string): number {
    const normalized = title.toLowerCase().trim()
    const words = normalized.split(/\s+/).filter(Boolean)
    let score = 95

    // Check against exact generic list
    if (GENERIC_TITLES.has(normalized)) {
      score -= 50
    }

    // Word count penalties
    if (words.length <= 1) {
      score -= 45
    } else if (words.length === 2) {
      score -= 30
    } else if (words.length === 3) {
      score -= 15
    }

    // Vague verb phrases ("work on", "deal with", "look into")
    if (VAGUE_INDICATORS_REGEX.test(normalized)) {
      score -= 30
    }

    // Vague suffixes ("stuff", "things", "something")
    if (VAGUE_SUFFIX_REGEX.test(normalized)) {
      score -= 25
    }

    // Concrete deliverable indicators give a strong clarity boost
    if (DELIVERABLE_INDICATORS_REGEX.test(normalized)) {
      score += 25
    }

    // Specific numbers/metrics boost clarity
    if (SPECIFIC_METRIC_REGEX.test(normalized)) {
      score += 15
    }

    // If a descriptive note was provided, give partial clarity credit
    if (note && note.trim().length >= 25) {
      score += 15
    }

    return Math.max(5, Math.min(100, score))
  }

  /**
   * Calculates scope score from 1 (single 15m micro-task) to 10 (multi-day massive epic).
   */
  public calculateScopeScore(title: string, targetMinutes?: number): number {
    let score = 3
    const normalized = title.toLowerCase()

    // Explicit duration indicators
    if (typeof targetMinutes === 'number' && targetMinutes > 0) {
      if (targetMinutes >= 180) {
        score += 6
      } else if (targetMinutes >= 120) {
        score += 4
      } else if (targetMinutes >= 90) {
        score += 3
      } else if (targetMinutes >= 60) {
        score += 1
      }
    }

    // Epic / massive scope keyword patterns
    for (const pattern of EPIC_SCOPE_PATTERNS) {
      if (pattern.test(normalized)) {
        score += 3
      }
    }

    // Words indicating multiple components or full systems
    if (
      /\b(frontend\s+and\s+backend|full\s*stack|end\s*to\s*end|all\s*pages|from\s*scratch)\b/i.test(
        normalized
      )
    ) {
      score += 2
    }

    return Math.max(1, Math.min(10, score))
  }

  /**
   * Generates psychological challenge feedback tailored to the complexity level.
   */
  private getChallenge(
    complexity: GoalComplexityLevel,
    _domain: string,
    title: string
  ): { heading: string; critique: string; questions: string[] } {
    switch (complexity) {
      case 'vague_and_too_big':
        return {
          heading: 'Vague & Overwhelming Scope',
          critique: `"${title}" has no tangible finish line and spans an immense scope. Massive ambiguous goals are the #1 catalyst for procrastination, context switching, and mental fatigue. You cannot "do" an epic in one sitting; you can only execute concrete vertical slices.`,
          questions: [
            'What is the single smallest component you can build and verify within 30 minutes?',
            'What specific boundary marks the completion of step 1 today, allowing you to stop with zero open loops?',
            'What is the primary technical or design unknown that must be resolved first?'
          ]
        }

      case 'vague':
        return {
          heading: 'Ambiguous Finish Line',
          critique: `Without an unambiguous, observable deliverable, your brain perceives ambiguity as friction. Broad tasks like "${title}" lead to wandering, tab-switching, and false completion. Define what physically exists when done.`,
          questions: [
            'What physical file, document, or tangible artifact will be saved when this session ends?',
            'If someone watched your screen for 25 minutes, what exact output would they observe you produce?',
            'How will you definitively verify that this task is complete without self-deception?'
          ]
        }

      case 'too_big':
        return {
          heading: 'Too Big to Digest in One Session',
          critique: `"${title}" is too large for a single sit-down. Multi-hour goals hide unexpected blockers and cause cognitive resistance. Dividing the project into bounded, achievable sprints (20–45m each) protects deep focus and gives immediate momentum.`,
          questions: [
            'What is the very first 20-minute setup, spike, or outline needed to unlock the rest?',
            'If you were forced to stop after 45 minutes, what isolated milestone would move the needle most?',
            'Can you separate the design or architecture phase from the actual implementation phase?'
          ]
        }

      case 'digestible':
      default:
        return {
          heading: 'Well-Defined & Digestible',
          critique: `"${title}" has actionable boundaries and a clear scope suitable for a single focused session.`,
          questions: [
            'Are your tools, files, and environment ready to start without interruptions?',
            'What is your target completion time for this sprint?'
          ]
        }
    }
  }

  /**
   * Extracts clean subject entity from user title.
   */
  public extractSubject(title: string): string {
    let clean = title.trim()
    // Remove shorthand like #tag, ~30m, @due
    clean = clean.replace(/#[a-zA-Z0-9_-]+/g, '')
    clean = clean.replace(/~\d+[mh]?/g, '')
    clean = clean.replace(/@\S+/g, '')

    // Strip common filler action prefixes
    clean = clean.replace(
      /^(build|create|develop|code|write|draft|study|learn|read|design|fix|refactor|clean|organize|work\s+on|handle|start|finish|do|prep\s+for|prep)\s+(an?\s+|the\s+|my\s+|some\s+)?/i,
      ''
    )

    clean = clean.trim()
    if (!clean || clean.length < 2) {
      return title.trim() || 'Task'
    }
    return clean
  }

  /**
   * Generates actionable subtask sprints tailored to domain and extracted subject.
   */
  private generateSubtasks(
    domain: string,
    subject: string,
    _originalTitle: string,
    targetMinutes?: number
  ): TaskBreakdownItem[] {
    const rawItems = this.getDomainTemplates(domain, subject)

    // Calculate distributed durations
    const count = rawItems.length
    const baseDuration =
      targetMinutes && targetMinutes >= 45 ? Math.round(targetMinutes / count / 5) * 5 : 25

    return rawItems.map((item, index) => {
      const duration = item.defaultMinutes || Math.max(15, Math.min(60, baseDuration))
      return {
        id: randomUUID(),
        title: item.title,
        targetMinutes: duration,
        goalType: item.goalType,
        rationale: item.rationale,
        order: index + 1
      }
    })
  }

  private getDomainTemplates(
    domain: string,
    subject: string
  ): Array<{
    title: string
    defaultMinutes: number
    goalType: 'deep' | 'routine'
    rationale: string
  }> {
    const s = subject.length > 25 ? subject.slice(0, 25).trim() : subject

    switch (domain) {
      case 'engineering':
        return [
          {
            title: `Define schema & specifications for ${s}`,
            defaultMinutes: 25,
            goalType: 'deep',
            rationale:
              'Establishes clear data models and interfaces before writing implementation code'
          },
          {
            title: `Implement core logic & data handlers for ${s}`,
            defaultMinutes: 40,
            goalType: 'deep',
            rationale: 'Main coding phase focused strictly on business logic and state management'
          },
          {
            title: `Wire integration endpoints & error handling for ${s}`,
            defaultMinutes: 35,
            goalType: 'deep',
            rationale: 'Connects backend to client contracts and catches validation edge cases'
          },
          {
            title: `Write automated tests & verify happy path for ${s}`,
            defaultMinutes: 25,
            goalType: 'deep',
            rationale: 'Ensures regression safety with unit/integration test assertions'
          }
        ]

      case 'writing':
        return [
          {
            title: `Outline core arguments & section headings for ${s}`,
            defaultMinutes: 25,
            goalType: 'deep',
            rationale: 'Creates an architectural scaffold so drafting happens with zero friction'
          },
          {
            title: `Draft introduction & first supporting section for ${s}`,
            defaultMinutes: 40,
            goalType: 'deep',
            rationale: 'Establishes the hook, context, and primary thesis'
          },
          {
            title: `Draft synthesis & conclusion for ${s}`,
            defaultMinutes: 35,
            goalType: 'deep',
            rationale: 'Completes the narrative arc and actionable takeaways'
          },
          {
            title: `Proofread, polish prose, and format citations for ${s}`,
            defaultMinutes: 20,
            goalType: 'routine',
            rationale: 'Eliminates grammatical roughness and ensures professional presentation'
          }
        ]

      case 'design':
        return [
          {
            title: `Collect references & wireframe initial layout for ${s}`,
            defaultMinutes: 30,
            goalType: 'deep',
            rationale:
              'Explores visual hierarchy and component placement before high-fidelity styling'
          },
          {
            title: `Design high-fidelity UI & key components for ${s}`,
            defaultMinutes: 45,
            goalType: 'deep',
            rationale: 'Applies typography, color tokens, and pixel-precise states'
          },
          {
            title: `Design responsive mobile layout & interactive states for ${s}`,
            defaultMinutes: 30,
            goalType: 'deep',
            rationale: 'Guarantees touch targets and breakpoint adaptations'
          },
          {
            title: `Export design assets & document handoff for ${s}`,
            defaultMinutes: 20,
            goalType: 'routine',
            rationale: 'Organizes component specs for seamless frontend implementation'
          }
        ]

      case 'research_learning':
        return [
          {
            title: `Read & annotate core principles of ${s}`,
            defaultMinutes: 30,
            goalType: 'deep',
            rationale: 'Builds foundational conceptual understanding through active reading'
          },
          {
            title: `Work through 3 practical exercises or examples on ${s}`,
            defaultMinutes: 45,
            goalType: 'deep',
            rationale: 'Reinforces theory through deliberate problem-solving practice'
          },
          {
            title: `Synthesize active recall flashcards & summary notes for ${s}`,
            defaultMinutes: 20,
            goalType: 'routine',
            rationale: 'Prepares spaced repetition material to prevent rapid memory decay'
          }
        ]

      case 'admin_operations':
        return [
          {
            title: `Triage documents & categorize action items for ${s}`,
            defaultMinutes: 20,
            goalType: 'routine',
            rationale: 'Separates urgent tasks from noise and establishes clear priority queue'
          },
          {
            title: `Execute high-priority communications & filings for ${s}`,
            defaultMinutes: 35,
            goalType: 'deep',
            rationale: 'Resolves critical dependencies and dispatches needed replies'
          },
          {
            title: `Archive resolved records & log confirmation receipts for ${s}`,
            defaultMinutes: 15,
            goalType: 'routine',
            rationale: 'Closes out paper trail and ensures clean inbox zero state'
          }
        ]

      case 'general':
      default:
        if (
          s.toLowerCase() === 'work' ||
          s.toLowerCase() === 'stuff' ||
          s.toLowerCase() === 'task'
        ) {
          return [
            {
              title: 'Define tangible target & draft 1-page action plan',
              defaultMinutes: 15,
              goalType: 'deep',
              rationale: 'Transforms ambiguity into an executable step-by-step deliverable'
            },
            {
              title: 'Execute core implementation sprint on primary objective',
              defaultMinutes: 40,
              goalType: 'deep',
              rationale: 'Dedicated uninterrupted focus on the single highest-value milestone'
            },
            {
              title: 'Review output, clean up loose ends, and record progress',
              defaultMinutes: 20,
              goalType: 'routine',
              rationale: 'Verifies quality and logs proof of deliverable'
            }
          ]
        }
        return [
          {
            title: `Clarify requirements & outline deliverable for ${s}`,
            defaultMinutes: 20,
            goalType: 'deep',
            rationale: 'Defines what done looks like before starting production work'
          },
          {
            title: `Execute main phase / core build for ${s}`,
            defaultMinutes: 45,
            goalType: 'deep',
            rationale: 'Deep focus sprint to produce the primary deliverable'
          },
          {
            title: `Review results, test edge cases, and finalize ${s}`,
            defaultMinutes: 25,
            goalType: 'deep',
            rationale: 'Refines quality and catches overlooked flaws'
          },
          {
            title: `Document next steps & log progress on ${s}`,
            defaultMinutes: 15,
            goalType: 'routine',
            rationale: 'Concludes session with clean documentation and next action queued'
          }
        ]
    }
  }

  private deriveSuggestedGroupTag(domain: string, subject: string): string {
    if (domain === 'research_learning') return 'learning'
    if (domain === 'engineering') return 'dev'
    if (domain === 'design') return 'design'
    if (domain === 'writing') return 'writing'
    if (domain === 'admin_operations') return 'admin'

    const words = subject.split(/\s+/).filter(Boolean)
    if (words.length > 0 && words[0].length <= 12) {
      return words[0].toLowerCase().replace(/[^a-z0-9]/g, '')
    }
    return 'focus'
  }

  private getRecommendedMinutes(targetMinutes?: number, complexity?: GoalComplexityLevel): number {
    if (typeof targetMinutes === 'number' && targetMinutes > 0) {
      if (complexity === 'too_big' || complexity === 'vague_and_too_big') {
        return Math.min(45, Math.round(targetMinutes / 3 / 5) * 5)
      }
      return targetMinutes
    }
    return 25
  }
}
