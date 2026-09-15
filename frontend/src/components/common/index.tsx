import * as React from 'react'
import { animate, motion, useReducedMotion } from 'framer-motion'
import { AlertTriangle, Database, RefreshCw, SearchX, ShieldAlert } from 'lucide-react'
import { Badge, Button, InfoTip } from '@/components/ui/primitives'
import { cn, fmt } from '@/lib/utils'
import { ApiError } from '@/lib/api'

/** Smoothly interpolates between numeric values; renders a dash for null. */
export function AnimatedNumber({ value, digits = 1, suffix = '', className, prefix = '' }: { value: number | null | undefined; digits?: number; suffix?: string; prefix?: string; className?: string }) {
  const reduce = useReducedMotion()
  const ref = React.useRef<HTMLSpanElement>(null)
  const prev = React.useRef<number>(0)
  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    if (value === null || value === undefined || Number.isNaN(value)) { el.textContent = '—'; return }
    if (reduce) { el.textContent = prefix + fmt(value, digits) + suffix; prev.current = value; return }
    const controls = animate(prev.current, value, {
      duration: 0.7, ease: [0.25, 1, 0.5, 1],
      onUpdate: (v) => { el.textContent = prefix + fmt(v, digits) + suffix },
    })
    prev.current = value
    return () => controls.stop()
  }, [value, digits, suffix, prefix, reduce])
  return <span ref={ref} className={cn('num', className)}>{value == null ? '—' : prefix + fmt(value, digits) + suffix}</span>
}

export function StatTile({ label, value, digits = 1, suffix, hint, tone, sub }: { label: string; value: number | null | undefined; digits?: number; suffix?: string; hint?: string; tone?: 'green' | 'gold'; sub?: React.ReactNode }) {
  return (
    <div className="card p-4">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-fg-dim">{label}{hint && <InfoTip text={hint} />}</div>
      <div className={cn('text-2xl md:text-[28px] font-semibold leading-none tracking-tight', tone === 'green' && 'text-pitch', tone === 'gold' && 'text-gold')}>
        <AnimatedNumber value={value} digits={digits} suffix={suffix} />
      </div>
      {sub && <div className="mt-1.5 text-xs text-fg-dim">{sub}</div>}
    </div>
  )
}

export function ConfidenceBadge({ level, score }: { level: 'high' | 'medium' | 'low'; score?: number }) {
  const tone = level === 'high' ? 'green' : level === 'medium' ? 'gold' : 'red'
  return <Badge tone={tone}>Confidence: {level}{score !== undefined ? ` · ${Math.round(score)}` : ''}</Badge>
}

export function CoverageBadge({ value, minutes }: { value: number | null | undefined; minutes?: number }) {
  if (value == null) return <Badge>Coverage —</Badge>
  const tone = value >= 80 ? 'green' : value >= 50 ? 'gold' : 'red'
  return <Badge tone={tone}>Data coverage {Math.round(value)}{minutes !== undefined ? ` · ${Math.round(minutes)} min` : ''}</Badge>
}

export function CoverageBar({ value, className }: { value: number | null | undefined; className?: string }) {
  const v = value ?? 0
  const color = v >= 80 ? 'bg-pitch' : v >= 50 ? 'bg-gold' : 'bg-danger'
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]', className)} role="meter" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label="Data coverage">
      <motion.div className={cn('h-full rounded-full', color)} initial={{ width: 0 }} animate={{ width: `${v}%` }} transition={{ duration: 0.6, ease: [0.25, 1, 0.5, 1] }} />
    </div>
  )
}

export function HypotheticalBanner({ text }: { text?: string }) {
  return (
    <div role="note" className="flex items-start gap-3 rounded-lg border border-gold/30 bg-gold-soft px-4 py-3 text-xs text-gold">
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <div className="font-semibold tracking-wide">HYPOTHETICAL STATISTICAL COMPARISON · MODEL ESTIMATE · NOT A LITERAL PREDICTION</div>
        {text && <div className="mt-1 text-gold/80">{text}</div>}
      </div>
    </div>
  )
}

export function ErrorState({ error, onRetry, title }: { error: Error | ApiError | null; onRetry?: () => void; title?: string }) {
  const hint = error instanceof ApiError ? error.hint : undefined
  const notReady = error instanceof ApiError && error.status === 503
  return (
    <div role="alert" className="card flex flex-col items-center gap-3 px-6 py-12 text-center">
      {notReady ? <Database className="h-8 w-8 text-gold" /> : <AlertTriangle className="h-8 w-8 text-danger" />}
      <div className="text-base font-semibold">{title ?? (notReady ? 'Dataset not built yet' : 'Something went wrong')}</div>
      <div className="max-w-md text-sm text-fg-muted">{error?.message ?? 'Unknown error'}</div>
      {hint && <div className="rounded-md bg-white/[0.05] px-3 py-1.5 font-mono text-xs text-fg-muted">{hint}</div>}
      {onRetry && <Button variant="outline" size="sm" onClick={onRetry}><RefreshCw className="h-3.5 w-3.5" /> Retry</Button>}
    </div>
  )
}

export function EmptyState({ title, text, icon }: { title: string; text?: string; icon?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-12 text-center">
      <div className="text-fg-dim">{icon ?? <SearchX className="h-8 w-8" />}</div>
      <div className="text-sm font-semibold">{title}</div>
      {text && <div className="max-w-md text-xs text-fg-muted">{text}</div>}
    </div>
  )
}

export function PageHeader({ eyebrow, title, subtitle, children }: { eyebrow: string; title: string; subtitle?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <motion.header initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.25, 1, 0.5, 1] }} className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        <div className="eyebrow mb-2">{eyebrow}</div>
        <h1 className="display text-3xl md:text-4xl">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-sm text-fg-muted md:text-base">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </motion.header>
  )
}

export function Section({ title, description, children, className, action }: { title: string; description?: React.ReactNode; children: React.ReactNode; className?: string; action?: React.ReactNode }) {
  return (
    <section className={cn('mb-10', className)} aria-label={title}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          {description && <p className="mt-1 max-w-3xl text-xs text-fg-muted md:text-sm">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

/** Small explanatory caption under a chart, required for accessibility. */
export function ChartCaption({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-xs leading-relaxed text-fg-dim">{children}</p>
}

export function LabelledValue({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="text-[10px] uppercase tracking-widest text-fg-dim">{label}</div>
      <div className="mt-0.5 text-sm text-fg">{children}</div>
    </div>
  )
}
