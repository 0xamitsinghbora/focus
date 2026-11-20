import { describe, it, expect, beforeEach } from 'vitest'
import { GoalBreakdownService } from '../GoalBreakdownService'

describe('GoalBreakdownService (Goal Breakdown AI)', () => {
  let service: GoalBreakdownService

  beforeEach(() => {
    service = new GoalBreakdownService()
  })

  describe('Task Vagueness Detection & Challenge', () => {
    it('detects generic single-word tasks as very vague and challenges them', () => {
      const genericTasks = ['work', 'code', 'study', 'emails', 'clean', 'stuff', 'prep', 'project']

      for (const title of genericTasks) {
        const analysis = service.analyzeTask(title)
        expect(analysis.isVague).toBe(true)
        expect(analysis.clarityScore).toBeLessThan(60)
        expect(analysis.challengeHeading).toMatch(/Ambiguous|Finish Line/i)
        expect(analysis.challengeCritique).toContain(title)
        expect(analysis.probingQuestions.length).toBeGreaterThanOrEqual(2)
      }
    })

    it('detects vague verb phrases and filler suffixes', () => {
      const vaguePhrases = [
        'work on some stuff',
        'look into things',
        'deal with issues',
        'do some coding',
        'continue with work'
      ]

      for (const title of vaguePhrases) {
        const analysis = service.analyzeTask(title)
        expect(analysis.isVague).toBe(true)
        expect(analysis.clarityScore).toBeLessThan(60)
      }
    })

    it('provides concrete psychological questions probing for deliverables', () => {
      const analysis = service.analyzeTask('coding')
      expect(analysis.probingQuestions).toEqual(
        expect.arrayContaining([
          expect.stringContaining('tangible artifact'),
          expect.stringContaining('25 minutes')
        ])
      )
    })
  })

  describe('Task Size / Scope Overload Detection ("Big enough to digest")', () => {
    it('detects tasks with large targetMinutes as too big for one session', () => {
      const analysis120 = service.analyzeTask('Write code for feature', undefined, 120)
      expect(analysis120.isTooBig).toBe(true)
      expect(analysis120.scopeScore).toBeGreaterThanOrEqual(6)

      const analysis180 = service.analyzeTask('Study biology', undefined, 180)
      expect(analysis180.isTooBig).toBe(true)
      expect(analysis180.scopeScore).toBeGreaterThanOrEqual(7)
    })

    it('detects epic/monumental project keywords as too big', () => {
      const epicTasks = [
        'build full stack saas app',
        'write master thesis',
        'master machine learning from scratch',
        'redesign entire company website',
        'refactor whole backend codebase',
        'prepare for bar exam'
      ]

      for (const title of epicTasks) {
        const analysis = service.analyzeTask(title)
        expect(analysis.isTooBig).toBe(true)
        expect(analysis.scopeScore).toBeGreaterThanOrEqual(6)
        expect(analysis.challengeCritique).toMatch(
          /single|sprint|overload|resistance|procrastination/i
        )
      }
    })

    it('detects tasks that are both vague AND too big', () => {
      const analysis = service.analyzeTask('do entire project')
      expect(analysis.isVague).toBe(true)
      expect(analysis.isTooBig).toBe(true)
      expect(analysis.complexity).toBe('vague_and_too_big')
      expect(analysis.challengeHeading).toMatch(/Vague & Overwhelming Scope/i)
    })
  })

  describe('Well-Defined & Digestible Tasks', () => {
    it('recognizes specific, bite-sized tasks with deliverables as digestible', () => {
      const wellDefinedTasks = [
        'Implement password reset token endpoint with unit tests',
        'Draft section 2 of Q3 financial report',
        'Create Figma mockup for profile card component',
        'Fix null pointer in auth token parser ~30m'
      ]

      for (const title of wellDefinedTasks) {
        const analysis = service.analyzeTask(title)
        expect(analysis.isVague).toBe(false)
        expect(analysis.isTooBig).toBe(false)
        expect(analysis.complexity).toBe('digestible')
        expect(analysis.clarityScore).toBeGreaterThanOrEqual(60)
        expect(analysis.challengeHeading).toMatch(/Digestible|Well-Defined/i)
      }
    })
  })

  describe('Actionable Sprints Breakdown Generation', () => {
    it('breaks down an engineering task into 4 structured focus sprints', () => {
      const result = service.breakdownTask('build customer auth system', undefined, 120)
      expect(result.suggestedTasks.length).toBe(4)
      expect(result.suggestedGroupTag).toBe('dev')

      // Verify each subtask is actionable and bounded
      for (const task of result.suggestedTasks) {
        expect(task.title).toBeTruthy()
        expect(task.targetMinutes).toBeGreaterThanOrEqual(15)
        expect(task.targetMinutes).toBeLessThanOrEqual(60)
        expect(task.goalType).toBe('deep')
        expect(task.rationale).toBeTruthy()
      }

      // Check that the extracted subject entity is retained
      expect(result.suggestedTasks[0].title).toMatch(/auth system/i)
      expect(result.suggestedTasks[0].title).toMatch(/schema|specifications/i)
      expect(result.suggestedTasks[3].title).toMatch(/tests|verify/i)
    })

    it('breaks down a writing task with distinct outline, draft, and proofreading phases', () => {
      const result = service.breakdownTask('write essay on AI ethics')
      expect(result.suggestedTasks.length).toBe(4)
      expect(result.suggestedGroupTag).toBe('writing')

      expect(result.suggestedTasks[0].title).toMatch(/outline/i)
      expect(result.suggestedTasks[1].title).toMatch(/draft introduction/i)
      expect(result.suggestedTasks[3].title).toMatch(/proofread/i)
      expect(result.suggestedTasks[3].goalType).toBe('routine')
    })

    it('breaks down a learning/research task with active recall components', () => {
      const result = service.breakdownTask('study machine learning algorithms')
      expect(result.suggestedTasks.length).toBe(3)
      expect(result.suggestedGroupTag).toBe('learning')

      expect(result.suggestedTasks[0].title).toMatch(/read & annotate/i)
      expect(result.suggestedTasks[1].title).toMatch(/exercises|examples/i)
      expect(result.suggestedTasks[2].title).toMatch(/active recall|flashcards/i)
    })

    it('breaks down a vague single-word task into an immediate focus ramp', () => {
      const result = service.breakdownTask('work')
      expect(result.suggestedTasks.length).toBe(3)
      expect(result.suggestedTasks[0].title).toMatch(/Define tangible target/i)
      expect(result.suggestedTasks[1].title).toMatch(/Execute core implementation/i)
      expect(result.suggestedTasks[2].title).toMatch(/Review output/i)
    })

    it('scales subtask durations proportionately when a large target duration is specified', () => {
      const result = service.breakdownTask('Build analytics dashboard', undefined, 120)
      const totalMinutes = result.suggestedTasks.reduce((acc, t) => acc + t.targetMinutes, 0)
      expect(totalMinutes).toBeGreaterThanOrEqual(100)
      expect(totalMinutes).toBeLessThanOrEqual(150)
    })
  })

  describe('Edge Cases & Robustness', () => {
    it('safely handles empty strings, null, and whitespace', () => {
      const empty = service.analyzeTask('')
      expect(empty.isVague).toBe(true)
      expect(empty.clarityScore).toBe(0)

      const whitespace = service.analyzeTask('   ')
      expect(whitespace.isVague).toBe(true)

      const breakdown = service.breakdownTask('')
      expect(breakdown.suggestedTasks.length).toBeGreaterThan(0)
    })

    it('cleans task shorthand syntax before subject extraction', () => {
      const subject = service.extractSubject('build auth system #dev ~45m @2026-11-25')
      expect(subject).toBe('auth system')
    })
  })
})
