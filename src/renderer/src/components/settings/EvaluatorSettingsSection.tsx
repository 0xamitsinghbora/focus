import React, { useState, useEffect, useCallback } from 'react'
import { EvaluatorMode, EvaluatorMetrics } from '../../../../shared/types'
import { Switch } from '../ui/switch'
import { cn } from '../../lib/utils'

export function EvaluatorSettingsSection(): React.JSX.Element {
  const [mode, setMode] = useState<EvaluatorMode>('embedded_lite')
  const [strictness, setStrictness] = useState<'strict' | 'moderate' | 'lenient'>('strict')
  const [requireProof, setRequireProof] = useState(true)
  const [metrics, setMetrics] = useState<EvaluatorMetrics | null>(null)

  const loadData = useCallback(async () => {
    try {
      const settings = await window.api.evaluator.getSettings()
      if (settings) {
        setMode(settings.mode === 'self' ? 'self' : 'embedded_lite')
        setStrictness(settings.strictness || 'strict')
        setRequireProof(settings.requireProofOfWork !== false)
      }

      const met = await window.api.evaluator.getMetrics()
      setMetrics(met)
    } catch (err) {
      console.error('Failed to load evaluator settings:', err)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleModeChange = async (newMode: EvaluatorMode): Promise<void> => {
    setMode(newMode)
    try {
      await window.api.evaluator.updateSettings({ mode: newMode })
      await loadData()
    } catch (err) {
      console.error('Failed to update mode:', err)
    }
  }

  const handleStrictnessChange = async (newStrictness: 'strict' | 'moderate'): Promise<void> => {
    setStrictness(newStrictness)
    try {
      await window.api.evaluator.updateSettings({ strictness: newStrictness })
    } catch (err) {
      console.error('Failed to update strictness:', err)
    }
  }

  const handleToggleProof = async (enabled: boolean): Promise<void> => {
    setRequireProof(enabled)
    try {
      await window.api.evaluator.updateSettings({ requireProofOfWork: enabled })
    } catch (err) {
      console.error('Failed to toggle proof of work:', err)
    }
  }

  return (
    <div className="p-5 space-y-5">
      {/* Header */}
      <div>
        <h3 className="text-[14px] font-semibold text-foreground tracking-tight">
          Evaluator &amp; Anti-Cheat
        </h3>
        <p className="text-[12px] text-muted-foreground mt-0.5">
          Objective evaluation to prevent self-deception and ensure task integrity.
        </p>
      </div>

      {/* Mode Selection */}
      <div className="flex items-center justify-between gap-4 pt-1">
        <div>
          <div className="text-[13px] font-medium text-foreground">Evaluation Mode</div>
          <div className="text-[11.5px] text-muted-foreground mt-0.5">
            Automated in-memory verification vs manual self-assessment
          </div>
        </div>
        <div className="flex items-center gap-1 bg-surface border border-border/70 p-1 rounded-lg shrink-0">
          <button
            type="button"
            onClick={() => handleModeChange('embedded_lite')}
            className={cn(
              'px-3 py-1 rounded-md text-[11.5px] font-medium transition-all cursor-pointer',
              mode !== 'self'
                ? 'bg-card text-foreground shadow-2xs font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Built-in Evaluator
          </button>
          <button
            type="button"
            onClick={() => handleModeChange('self')}
            className={cn(
              'px-3 py-1 rounded-md text-[11.5px] font-medium transition-all cursor-pointer',
              mode === 'self'
                ? 'bg-card text-foreground shadow-2xs font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Self-Evaluation
          </button>
        </div>
      </div>

      {/* Strictness */}
      <div className="flex items-center justify-between gap-4 border-t border-border/40 pt-4">
        <div>
          <div className="text-[13px] font-medium text-foreground">Anti-Cheat Strictness</div>
          <div className="text-[11.5px] text-muted-foreground mt-0.5">
            Enforces minimum duration and verifies tangible outputs
          </div>
        </div>
        <div className="flex items-center gap-1 bg-surface border border-border/70 p-1 rounded-lg shrink-0">
          <button
            type="button"
            onClick={() => handleStrictnessChange('strict')}
            className={cn(
              'px-3 py-1 rounded-md text-[11.5px] font-medium transition-all cursor-pointer',
              strictness === 'strict'
                ? 'bg-card text-foreground shadow-2xs font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Strict
          </button>
          <button
            type="button"
            onClick={() => handleStrictnessChange('moderate')}
            className={cn(
              'px-3 py-1 rounded-md text-[11.5px] font-medium transition-all cursor-pointer',
              strictness === 'moderate'
                ? 'bg-card text-foreground shadow-2xs font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Moderate
          </button>
        </div>
      </div>

      {/* Require Proof */}
      <div className="flex items-center justify-between gap-4 border-t border-border/40 pt-4">
        <div>
          <div className="text-[13px] font-medium text-foreground">Require Deliverables</div>
          <div className="text-[11.5px] text-muted-foreground mt-0.5">
            Require verifiable outputs before marking goals complete
          </div>
        </div>
        <Switch checked={requireProof} onCheckedChange={handleToggleProof} />
      </div>

      {/* Metrics Row */}
      {metrics && metrics.totalEvaluations > 0 && (
        <div className="border-t border-border/40 pt-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>Integrity Index: <strong className="text-foreground font-mono">{metrics.averageHonestyScore}%</strong></span>
          <span>Verified Tasks: <strong className="text-foreground font-mono">{metrics.verifiedGoalsCount}</strong> / {metrics.totalEvaluations}</span>
        </div>
      )}
    </div>
  )
}
