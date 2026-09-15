import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from 'recharts'
import { useReducedMotion } from 'framer-motion'

export interface RadarSeries { key: string; name: string; color: string; values: Record<string, number | null | undefined> }

const SHORT: Record<string, string> = {
  'Finishing': 'Finishing', 'Chance Creation': 'Creation', 'Ball Progression': 'Progression', 'Passing': 'Passing', 'Carrying': 'Carrying',
  'Dribbling': 'Dribbling', 'Possession Involvement': 'Involvement', 'Defensive Activity': 'Defending', 'Pressing': 'Pressing', 'Aerial Contribution': 'Aerial',
}

/** Ten-dimension DNA radar. Values are 0-100 percentiles; nulls are drawn as gaps (not zero). */
export function RadarDNA({ dimensions, series, height = 320 }: { dimensions: { key: string; label: string }[]; series: RadarSeries[]; height?: number }) {
  const reduce = useReducedMotion()
  const data = dimensions.map((d) => {
    const row: Record<string, string | number | null> = { dim: SHORT[d.label] ?? d.label, full: d.label }
    for (const s of series) {
      const v = s.values[d.key]
      row[s.key] = v == null || Number.isNaN(v) ? null : v
    }
    return row
  })
  return (
    <div style={{ width: '100%', height }} role="img" aria-label={`Radar chart of ${series.map((s) => s.name).join(' and ')} across ${dimensions.length} DNA dimensions`}>
      <ResponsiveContainer>
        <RadarChart data={data} outerRadius="72%" margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
          <PolarGrid gridType="polygon" />
          <PolarAngleAxis dataKey="dim" tick={{ fill: '#a3a6a1', fontSize: 11 }} />
          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
          {series.map((s) => (
            <Radar key={s.key} name={s.name} dataKey={s.key} stroke={s.color} fill={s.color} fillOpacity={0.18} strokeWidth={2} dot={{ r: 2.5, fill: s.color, strokeWidth: 0 }}
              isAnimationActive={!reduce} animationDuration={700} animationEasing="ease-out" connectNulls={false} />
          ))}
          <Tooltip
            cursor={false}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const p = payload[0].payload as Record<string, string | number | null>
              return (
                <div className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs shadow-xl">
                  <div className="mb-1 font-medium text-fg">{p.full}</div>
                  {series.map((s) => (
                    <div key={s.key} className="flex items-center justify-between gap-4 text-fg-muted">
                      <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />{s.name}</span>
                      <span className="num text-fg">{p[s.key] == null ? '—' : `${Math.round(p[s.key] as number)}th`}</span>
                    </div>
                  ))}
                </div>
              )
            }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  )
}
