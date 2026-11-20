import {
  EvaluatorMode,
  EvaluationRecord,
  EvaluationSubmission,
  EvaluatorMetrics
} from '../../shared/types'
import type { EvaluationRepository } from '../repositories/EvaluationRepository'
import type { GoalsRepository } from '../repositories/GoalsRepository'
import type { LogsRepository } from '../repositories/LogsRepository'
import type { SettingsRepository } from '../repositories/SettingsRepository'
import { logger } from '../logger'

export interface EvaluatorServiceOptions {
  evaluationRepo: EvaluationRepository
  goalsRepo: GoalsRepository
  logsRepo?: LogsRepository
  settingsRepo: SettingsRepository
}

// Work domain dictionary to understand what the user is doing
const DOMAIN_KEYWORDS: Record<string, RegExp> = {
  engineering:
    /\b(code|coding|dev|develop|implement|feature|bug|fix|refactor|test|unit|endpoint|api|backend|frontend|react|typescript|sql|database|db|migration|deploy|git|commit|pull request|pr|docker|service|controller|function|query)\b/i,
  writing:
    /\b(write|writing|draft|article|blog|post|essay|chapter|book|copy|documentation|docs|guide|specs|notes|readme|proposal|summary|outline|edit|proofread)\b/i,
  design:
    /\b(design|ui|ux|figma|mockup|wireframe|layout|component|prototype|svg|icon|canvas|sketch|styling|css|tailwind|theme|palette|visual)\b/i,
  research_learning:
    /\b(read|reading|study|studying|learn|learning|course|lecture|tutorial|paper|book|chapter|concept|algorithm|math|review|notes|exercise)\b/i,
  admin_operations:
    /\b(email|inbox|meeting|plan|planning|schedule|calendar|organize|task|tickets|jira|trello|linear|clean|backup|sync|admin)\b/i
}

const ACTION_VERBS_REGEX =
  /\b(fixed|fix|implemented|implement|wrote|write|built|build|created|create|coded|code|debugged|debug|tested|test|resolved|resolve|shipped|ship|deployed|deploy|refactored|refactor|reviewed|review|read|studied|learned|analyzed|configured|designed|merged|drafted|edited|audited|benchmarked|verified)\b/i

const ARTIFACT_INDICATORS_REGEX =
  /(https?:\/\/|git(hub)?|commit|[0-9a-f]{7,40}|#\d+|\bpr\b|\.tsx?|\.jsx?|\.py|\.rs|\.go|\.html|\.css|\.json|\.md|page \d+|\d+ (tests|lines|bugs|items|chapters|pages|words|screens|components))/i

const GENERIC_FILLER_REGEX =
  /^(done|completed|finished|ok|did it|work|worked|yes|task done|good|stuff|idk|nothing|asdf|qwerty)$/i

export class EvaluatorService {
  private evaluationRepo: EvaluationRepository
  private goalsRepo: GoalsRepository
  protected _logsRepo?: LogsRepository
  private settingsRepo: SettingsRepository

  constructor(options: EvaluatorServiceOptions) {
    this.evaluationRepo = options.evaluationRepo
    this.goalsRepo = options.goalsRepo
    this._logsRepo = options.logsRepo
    this.settingsRepo = options.settingsRepo
  }

  public getSettings(): {
    mode: EvaluatorMode
    strictness: 'strict' | 'moderate' | 'lenient'
    requireProofOfWork: boolean
  } {
    const raw = this.settingsRepo.getSettings()
    const rawMode = raw.evaluatorMode as EvaluatorMode | undefined
    const mode: EvaluatorMode = rawMode === 'self' ? 'self' : 'embedded_lite'

    return {
      mode,
      strictness: raw.antiCheatStrictness || 'strict',
      requireProofOfWork: raw.requireProofOfWork !== false
    }
  }

  public updateSettings(partial: {
    mode?: EvaluatorMode
    strictness?: 'strict' | 'moderate' | 'lenient'
    requireProofOfWork?: boolean
  }): {
    mode: EvaluatorMode
    strictness: 'strict' | 'moderate' | 'lenient'
    requireProofOfWork: boolean
  } {
    const updates: Record<string, unknown> = {}
    if (partial.mode !== undefined) {
      updates.evaluatorMode = partial.mode === 'self' ? 'self' : 'embedded_lite'
    }
    if (partial.strictness !== undefined) {
      updates.antiCheatStrictness = partial.strictness
    }
    if (partial.requireProofOfWork !== undefined) {
      updates.requireProofOfWork = partial.requireProofOfWork
    }

    this.settingsRepo.patchSettings(updates)
    return this.getSettings()
  }

  /**
   * Evaluates work using the built-in Embedded Lite Model.
   * Recognizes user work domain, semantic deliverable alignment, duration proportionality, and flags cheat attempts.
   */
  public async runAiReview(submission: EvaluationSubmission): Promise<EvaluationRecord> {
    return this.runEmbeddedLiteModel(submission)
  }

  public async runLocalLlmReview(submission: EvaluationSubmission): Promise<EvaluationRecord> {
    return this.runEmbeddedLiteModel(submission)
  }

  public runEmbeddedLiteModel(submission: EvaluationSubmission): EvaluationRecord {
    const { strictness, requireProofOfWork } = this.getSettings()
    const proof = (submission.proofOfWork || '').trim()
    const targetMins = submission.targetMinutes || 0
    const trackedMins = submission.trackedMinutes || 0
    const title = (submission.title || 'Task').trim()

    let timeScore = 30
    let alignmentScore = 30
    let proofQualityScore = 25
    let artifactBonus = 15
    const critiques: string[] = []

    // 1. User Domain Recognition & Semantic Context Alignment
    const detectedDomain = this.detectWorkDomain(title)
    const proofDomain = this.detectWorkDomain(proof)
    const tokenOverlap = this.calculateTokenOverlap(title, proof)

    if (detectedDomain && proofDomain && detectedDomain !== proofDomain && tokenOverlap === 0) {
      // Clear domain mismatch (e.g. coding task with gaming or unrelated notes)
      alignmentScore = 5
      critiques.push(
        `Work mismatch: Task appears to be ${detectedDomain.replace('_', ' ')} work, but deliverable describes ${proofDomain.replace('_', ' ')}.`
      )
    } else if (tokenOverlap > 0 || (detectedDomain && detectedDomain === proofDomain)) {
      // Coherent semantic connection between what user set out to do and what they produced
      alignmentScore = 30
    } else {
      alignmentScore = 20
    }

    // 2. Time & Velocity Integrity Check
    if (targetMins > 0) {
      const ratio = trackedMins / targetMins
      if (trackedMins < 2 && targetMins >= 15) {
        timeScore = 0
        critiques.push(
          `Improbable completion: only ${trackedMins}m tracked for a ${targetMins}m target.`
        )
      } else if (ratio < 0.25) {
        timeScore = 10
        critiques.push(
          `Low tracked time: ${trackedMins}m logged against target of ${targetMins}m (${Math.round(ratio * 100)}%).`
        )
      } else if (ratio < 0.5) {
        timeScore = 20
      } else if (ratio <= 1.5) {
        timeScore = 30
      } else {
        timeScore = 25
      }
    } else {
      if (trackedMins < 1) {
        timeScore = 10
        critiques.push('Zero or sub-minute session logged.')
      } else {
        timeScore = 30
      }
    }

    // 3. Proof Quality & Anti-Cheat Filler Rejection
    if (proof.length === 0) {
      if (requireProofOfWork) {
        proofQualityScore = 0
        artifactBonus = 0
        critiques.push('No proof of work deliverable provided.')
      } else {
        proofQualityScore = 10
        artifactBonus = 5
      }
    } else if (GENERIC_FILLER_REGEX.test(proof)) {
      proofQualityScore = 0
      artifactBonus = 0
      critiques.push(
        `Generic non-verifiable filler ("${proof}"). Real proof requires concrete deliverables.`
      )
    } else {
      // Length & specificity grading
      if (proof.length >= 75) {
        proofQualityScore = 25
      } else if (proof.length >= 35) {
        proofQualityScore = 20
      } else if (proof.length >= 15) {
        proofQualityScore = 14
      } else {
        proofQualityScore = 8
        critiques.push('Proof description is too brief; state specific output produced.')
      }

      // Action execution verbs check
      if (ACTION_VERBS_REGEX.test(proof)) {
        proofQualityScore = Math.min(25, proofQualityScore + 5)
      } else {
        critiques.push('Missing action verbs describing what was executed.')
      }

      // Verifiable artifacts check (commit refs, file names, line counts, PRs, URLs)
      if (
        ARTIFACT_INDICATORS_REGEX.test(proof) ||
        (submission.evidenceUrl && submission.evidenceUrl.trim().length > 0)
      ) {
        artifactBonus = 15
      } else {
        artifactBonus = 5
        if (strictness === 'strict') {
          critiques.push('Consider attaching artifact metrics, file references, or links.')
        }
      }
    }

    // 4. Strictness Weighting
    if (strictness === 'strict') {
      if (
        proof.length < 20 ||
        (targetMins >= 20 && trackedMins < 5) ||
        GENERIC_FILLER_REGEX.test(proof)
      ) {
        alignmentScore = Math.min(alignmentScore, 10)
      }
    } else if (strictness === 'lenient') {
      timeScore = Math.min(30, timeScore + 5)
      proofQualityScore = Math.min(25, proofQualityScore + 5)
    }

    const totalScore = Math.max(
      0,
      Math.min(100, timeScore + alignmentScore + proofQualityScore + artifactBonus)
    )

    let status: 'verified' | 'rejected' | 'needs_revision'
    let cheatRisk: 'low' | 'medium' | 'high'
    let verdict: string

    if (totalScore >= 70) {
      status = 'verified'
      cheatRisk = 'low'
      verdict = `Verified by Lite Model: Authentic work confirmed for "${title}" (${totalScore}/100).`
    } else if (totalScore >= 45) {
      status = strictness === 'strict' ? 'needs_revision' : 'verified'
      cheatRisk = 'medium'
      verdict =
        strictness === 'strict'
          ? `Revision Required: Evidence insufficient to prevent self-deception (${totalScore}/100).`
          : `Conditionally Accepted: Consider submitting deeper proof next time (${totalScore}/100).`
    } else {
      status = 'rejected'
      cheatRisk = 'high'
      verdict = `Rejected by Lite Model: High cheat risk detected (${totalScore}/100).`
    }

    const domainLabel = detectedDomain ? ` [${detectedDomain.replace('_', ' ')}]` : ''
    const feedback =
      critiques.length > 0
        ? `Critique: ${critiques.join(' ')}`
        : `Verified authentic focus and deliverable on "${title}"${domainLabel}. Output density matches time tracked.`

    return {
      id: crypto.randomUUID(),
      entityType: submission.entityType,
      entityId: submission.entityId,
      evaluatorType: 'embedded_lite',
      evaluatorName: 'Embedded Lite Model',
      status,
      score: totalScore,
      verdict,
      feedback,
      cheatRisk,
      proofOfWork: proof,
      trackedMinutes: trackedMins,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  }

  private detectWorkDomain(text: string): string | null {
    if (!text) return null
    for (const [domain, regex] of Object.entries(DOMAIN_KEYWORDS)) {
      if (regex.test(text)) {
        return domain
      }
    }
    return null
  }

  private calculateTokenOverlap(title: string, proof: string): number {
    const tokenize = (str: string): Set<string> =>
      new Set(
        str
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, ' ')
          .split(/\s+/)
          .filter(
            (t) =>
              t.length > 3 && !['what', 'with', 'from', 'this', 'that', 'have', 'been'].includes(t)
          )
      )

    const titleTokens = tokenize(title)
    const proofTokens = tokenize(proof)
    let overlap = 0
    for (const token of titleTokens) {
      if (proofTokens.has(token)) {
        overlap++
      }
    }
    return overlap
  }

  /**
   * Submits a goal or session for 3rd-party evaluation via Embedded Lite Model.
   */
  public async submitForReview(submission: EvaluationSubmission): Promise<EvaluationRecord> {
    const { mode, strictness } = this.getSettings()

    if (mode === 'self' && strictness === 'lenient') {
      const record = this.runEmbeddedLiteModel(submission)
      record.evaluatorType = 'self'
      record.evaluatorName = 'Self Evaluator'
      record.status = 'verified'
      record.verdict = 'Self-evaluated: Completed without 3rd-party auditor.'
      this.evaluationRepo.recordEvaluation(record)
      await this.applyGoalEvaluation(submission.entityId, record)
      return record
    }

    const evaluation = this.runEmbeddedLiteModel(submission)
    const recorded = this.evaluationRepo.recordEvaluation(evaluation)
    await this.applyGoalEvaluation(submission.entityId, recorded)
    return recorded
  }

  private async applyGoalEvaluation(goalId: string, evaluation: EvaluationRecord): Promise<void> {
    try {
      if (evaluation.entityType !== 'goal') return
      const goal = await this.goalsRepo.getGoalById(goalId)
      if (!goal) return

      if (evaluation.status === 'verified') {
        await this.goalsRepo.updateGoal(goal.date, {
          ...goal,
          status: 'done',
          completedAt: goal.completedAt || new Date().toISOString(),
          evaluationStatus: 'verified',
          proofOfWork: evaluation.proofOfWork || goal.proofOfWork,
          evaluatorNote: evaluation.verdict,
          antiCheatScore: evaluation.score,
          updatedAt: new Date().toISOString()
        })
      } else if (evaluation.status === 'rejected' || evaluation.status === 'needs_revision') {
        await this.goalsRepo.updateGoal(goal.date, {
          ...goal,
          // Revert or keep non-done so the user cannot cheat themselves!
          status: goal.status === 'done' ? 'in_progress' : goal.status,
          completedAt: undefined,
          evaluationStatus: evaluation.status,
          evaluatorNote: `${evaluation.verdict} — ${evaluation.feedback}`,
          antiCheatScore: evaluation.score,
          updatedAt: new Date().toISOString()
        })
      }
    } catch (err) {
      logger.error('evaluator', 'Failed to apply goal evaluation state:', err)
    }
  }

  public getEvaluations(filter?: {
    entityType?: 'goal' | 'day_review' | 'session'
    entityId?: string
    date?: string
  }): EvaluationRecord[] {
    if (filter?.entityType && filter.entityId) {
      return this.evaluationRepo.getEvaluationsForEntity(filter.entityType, filter.entityId)
    }
    return this.evaluationRepo.getAllEvaluations()
  }

  public getMetrics(): EvaluatorMetrics {
    const { mode } = this.getSettings()
    const baseMetrics = this.evaluationRepo.getMetrics()
    return {
      ...baseMetrics,
      mode
    }
  }
}
