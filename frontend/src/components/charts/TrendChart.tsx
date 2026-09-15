import { Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useReducedMotion } from 'framer-motion'
import { fmt } from '@/lib/utils'

export interface TrendPoint { x: string | number; [k: string]: string | number | null }

const tooltipStyle = { background: '#1c1f24', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 12, color: '#f4f4f2' }

export function TrendChart({ data, series, height = 240, xKey = 'x', highlightX, yDomain, digits = 2, area, yFormatter }: {
  data: TrendPoint[]; series: { key: string; name: string; color: string; dashed?: boolean }[]; height?: number; xKey?: string; highlightX?: string | number | null
  yDomain?: [number | 'auto', number | 'auto']; digits?: number; area?: boolean; yFormatter?: (v: number) => string
}) {
  const reduce = useReducedMotion()
  const Chart = area ? AreaChart : LineChart
  return (
    <div style={{ width: '100%', height }} role="img" aria-label={`Trend chart of ${series.map((s) => s.name).join(', ')}`}>
      <ResponsiveContainer>
        <Chart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
          <CartesianGrid vertical={false} strokeDasharray="2 4" />
          <XAxis dataKey={xKey} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={24} />
          <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} domain={yDomain ?? ['auto', 'auto']} width={44} tickFormatter={yFormatter ?? ((v: number) => fmt(v, digits))} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: 'rgba(255,255,255,0.2)' }} formatter={(v: unknown, name: unknown) => [typeof v === 'number' ? (yFormatter ? yFormatter(v) : fmt(v, digits)) : '—', String(name)]} />
          {highlightX !== undefined && highlightX !== null && <ReferenceLine x={highlightX} stroke="var(--color-gold)" strokeDasharray="3 3" />}
          {series.map((s) => area ? (
            <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} fill={s.color} fillOpacity={0.12} strokeWidth={2} dot={false} connectNulls={false}
              isAnimationActive={!reduce} animationDuration={700} />
          ) : (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? '4 4' : undefined}
              dot={{ r: 2.5, fill: s.color, strokeWidth: 0 }} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={!reduce} animationDuration={700} />
          ))}
        </Chart>
      </ResponsiveContainer>
    </div>
  )
}
