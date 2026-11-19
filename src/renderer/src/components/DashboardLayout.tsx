import React, { ReactNode } from 'react'
import { cn } from '../lib/utils'

interface PageShellProps {
  children: ReactNode
  className?: string
}

export function PageShell({ children, className }: PageShellProps): React.JSX.Element {
  return (
    <main className={cn('mx-auto h-full w-full min-h-0 px-6 pb-6 max-w-310', className)}>
      {children}
    </main>
  )
}

interface PanelProps {
  children: ReactNode
  className?: string
  inset?: boolean
}

export function Panel({ children, className, inset }: PanelProps): React.JSX.Element {
  return (
    <section
      className={cn(
        'rounded-2xl border border-border/60 bg-card text-card-foreground shadow-apple-subtle apple-card-elevated transition-all duration-200',
        inset && 'bg-surface/50 border-border/40 shadow-inner',
        className
      )}
    >
      {children}
    </section>
  )
}

interface SectionHeaderProps {
  title: string
  action?: ReactNode
  subtitle?: string
  className?: string
}

export function SectionHeader({
  title,
  action,
  subtitle,
  className
}: SectionHeaderProps): React.JSX.Element {
  return (
    <div className={cn('flex items-start justify-between gap-3', className)}>
      <div>
        <h2 className="text-[15px] font-semibold tracking-[-0.022em] text-foreground">{title}</h2>
        {subtitle && (
          <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground/90 tracking-[-0.005em]">
            {subtitle}
          </p>
        )}
      </div>
      {action}
    </div>
  )
}

interface MetricCardProps {
  label: string
  value: React.ReactNode
  accent?: boolean
  hint?: string
}

export const MetricCard = React.memo(function MetricCard({
  label,
  value,
  accent,
  hint
}: MetricCardProps): React.JSX.Element {
  return (
    <div className="group relative rounded-2xl border border-border/60 bg-card p-4.5 shadow-apple-subtle apple-card-elevated transition-all duration-200 hover:border-border/90 hover:shadow-apple-card">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/85">
        {label}
      </div>
      <div
        className={cn(
          'mt-1.5 text-[20px] sm:text-[22px] xl:text-[24px] font-bold tracking-[-0.035em] tabular-nums leading-tight truncate',
          accent ? 'text-foreground' : 'text-foreground/90'
        )}
        title={typeof value === 'string' ? value : undefined}
      >
        {value}
      </div>
      {hint && (
        <div className="mt-1 text-[12px] text-muted-foreground/75 font-normal tracking-[-0.005em] leading-normal truncate">
          {hint}
        </div>
      )}
    </div>
  )
})

interface EmptyStateProps {
  title: string
  description?: string
  icon?: ReactNode
  action?: ReactNode
  className?: string
  onClick?: () => void
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
  onClick
}: EmptyStateProps): React.JSX.Element {
  return (
    <div
      onClick={onClick}
      className={cn(
        'flex min-h-35 flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-surface/30 px-4 py-8 text-center',
        className
      )}
    >
      {icon && (
        <div className="h-10 w-10 rounded-2xl bg-surface/80 border border-border/60 flex items-center justify-center text-muted-foreground/60 mb-2.5 shadow-2xs">
          {icon}
        </div>
      )}
      <div className="text-[13.5px] font-semibold text-foreground/85 tracking-[-0.015em]">
        {title}
      </div>
      {description && (
        <div className="mt-1 max-w-xs text-[12px] leading-relaxed text-muted-foreground/80 tracking-[-0.005em]">
          {description}
        </div>
      )}
      {action && <div className="mt-3.5">{action}</div>}
    </div>
  )
}
