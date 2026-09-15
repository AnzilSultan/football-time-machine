import { motion, useReducedMotion } from 'framer-motion'
import { InfoTip } from '@/components/ui/primitives'
import { cn, ordinal } from '@/lib/utils'

export interface BarRow { key: string; label: string; value: number | null | undefined; secondary?: number | null; hint?: string; raw?: string }

/** Horizontal percentile bars (0-100). Bars animate width on value change; nulls render as "no data" rather than an empty bar. */
export function PercentileBars({ rows, colorA = 'var(--color-pitch)', colorB = 'var(--color-gold)', nameA, nameB, compact }: {
  rows: BarRow[]; colorA?: string; colorB?: string; nameA?: string; nameB?: string; compact?: boolean
}) {
  const reduce = useReducedMotion()
  return (
    <div className="flex flex-col gap-2.5" role="list">
      {(nameA || nameB) && (
        <div className="mb-1 flex gap-4 text-[11px] text-fg-muted">
          {nameA && <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: colorA }} />{nameA}</span>}
          {nameB && <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: colorB }} />{nameB}</span>}
        </div>
      )}
      {rows.map((r) => (
        <div key={r.key} role="listitem" className={cn('grid items-center gap-x-3', compact ? 'grid-cols-[120px_1fr_44px]' : 'grid-cols-[minmax(110px,150px)_1fr_52px]')}>
          <div className="flex items-center gap-1 truncate text-xs text-fg-muted" title={r.label}>{r.label}{r.hint && <InfoTip text={r.hint} />}</div>
          <div className="relative h-5">
            <div className="absolute inset-y-[7px] left-0 right-0 rounded-full bg-white/[0.07]" />
            {r.value != null && !Number.isNaN(r.value) && (
              <motion.div className="absolute inset-y-[7px] left-0 rounded-full" style={{ background: colorA }}
                initial={false} animate={{ width: `${Math.max(1.5, r.value)}%` }} transition={reduce ? { duration: 0 } : { duration: 0.6, ease: [0.25, 1, 0.5, 1] }} />
            )}
            {r.secondary != null && !Number.isNaN(r.secondary) && (
              <motion.div className="absolute top-[3px] h-[14px] w-[3px] rounded-sm" style={{ background: colorB }}
                initial={false} animate={{ left: `calc(${r.secondary}% - 1px)` }} transition={reduce ? { duration: 0 } : { duration: 0.6, ease: [0.25, 1, 0.5, 1] }} aria-hidden="true" />
            )}
            <div className="absolute inset-y-0 left-1/2 w-px bg-white/[0.12]" aria-hidden="true" />
          </div>
          <div className="num text-right text-xs text-fg">{r.value == null || Number.isNaN(r.value) ? <span className="text-fg-dim">no data</span> : ordinal(r.value)}</div>
        </div>
      ))}
    </div>
  )
}
