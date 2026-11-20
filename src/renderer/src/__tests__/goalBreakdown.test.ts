import { describe, it, expect, vi, beforeEach } from 'vitest'
import { quickAssessTask, analyzeTaskAi, breakdownTaskAi } from '../lib/goalBreakdown'

describe('goalBreakdown (Renderer AI utilities)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('quickAssessTask correctly flags vague inputs', () => {
    expect(quickAssessTask('work').isVague).toBe(true)
    expect(quickAssessTask('code').isVague).toBe(true)
    expect(quickAssessTask('clean').isVague).toBe(true)
    expect(quickAssessTask('do stuff').isVague).toBe(true)
  })

  it('quickAssessTask correctly flags oversized scope tasks', () => {
    expect(quickAssessTask('build entire mobile app').isTooBig).toBe(true)
    expect(quickAssessTask('write book').isTooBig).toBe(true)
    expect(quickAssessTask('Implement feature', undefined, 120).isTooBig).toBe(true)
  })

  it('quickAssessTask marks bounded, specific tasks as digestible', () => {
    const res = quickAssessTask('Fix login error handling in auth controller', undefined, 30)
    expect(res.isVague).toBe(false)
    expect(res.isTooBig).toBe(false)
    expect(res.complexity).toBe('digestible')
  })

  it('analyzeTaskAi delegates to window.api.goals.analyze when present', async () => {
    const mockAnalyze = vi.fn().mockResolvedValue({
      isVague: true,
      isTooBig: false,
      complexity: 'vague',
      clarityScore: 30,
      scopeScore: 3,
      challengeHeading: 'Vague Goal',
      challengeCritique: 'Ambiguous deliverable',
      probingQuestions: ['What is the output?']
    })

    // Mock window.api
    vi.stubGlobal('window', {
      api: {
        goals: {
          analyze: mockAnalyze
        }
      }
    })

    const res = await analyzeTaskAi('study', undefined, 30)
    expect(mockAnalyze).toHaveBeenCalledWith({ title: 'study', note: undefined, targetMinutes: 30 })
    expect(res.isVague).toBe(true)
  })

  it('breakdownTaskAi delegates to window.api.goals.breakdown when present', async () => {
    const mockBreakdown = vi.fn().mockResolvedValue({
      originalTitle: 'build full stack app',
      analysis: {
        isVague: false,
        isTooBig: true,
        complexity: 'too_big',
        clarityScore: 75,
        scopeScore: 8,
        challengeHeading: 'Scope Overload',
        challengeCritique: 'Too big for 1 session',
        probingQuestions: ['First milestone?']
      },
      suggestedTasks: [
        {
          id: 'step-1',
          title: 'Define schema',
          targetMinutes: 25,
          goalType: 'deep',
          order: 1
        }
      ],
      totalMinutes: 25
    })

    vi.stubGlobal('window', {
      api: {
        goals: {
          breakdown: mockBreakdown
        }
      }
    })

    const res = await breakdownTaskAi('build full stack app', undefined, 90)
    expect(mockBreakdown).toHaveBeenCalledWith({
      title: 'build full stack app',
      note: undefined,
      targetMinutes: 90
    })
    expect(res.suggestedTasks.length).toBe(1)
  })
})
