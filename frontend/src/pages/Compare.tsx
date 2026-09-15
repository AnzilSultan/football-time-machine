import * as React from 'react'
import { useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeftRight } from 'lucide-react'
import { getCompare, getEraTranslation, getPlayer, getSearch, type Compare as CompareT, type PlayerProfile } from '@/lib/api'
import { useApi } from '@/hooks/useApi'
import { PlayerPicker } from '@/components/players/PlayerPicker'
import { Badge, Button, Card, CardTitle, Select, Skeleton, Tabs, TabsList, TabsTrigger } from '@/components/ui/primitives'
import { AnimatedNumber, ChartCaption, ConfidenceBadge, CoverageBadge, ErrorState, HypotheticalBanner, PageHeader, Section } from '@/components/common'
import { RadarDNA } from '@/components/charts/RadarDNA'
import { PercentileBars } from '@/components/charts/PercentileBars'
import { fmt, ordinal } from '@/lib/utils'

const PRESETS = [['Lionel Messi', 'Cristiano Ronaldo'], ['Xavi', 'Luka Modrić'], ['Ronaldinho', 'Neymar'], ['Thierry Henry', 'Kylian Mbappé']]

type Side = { player: { id: number; label: string } | null; season?: string }

function useSide(initialPlayer: string | null, initialSeason: string | null) {
  const [side, setSide] = React.useState<Side>({ player: null, season: initialSeason ?? undefined })
  React.useEffect(() => { if (initialPlayer) getPlayer(initialPlayer).then((p) => setSide((s) => ({ ...s, player: { id: p.player_id, label: p.display_name } }))).catch(() => undefined) }, [initialPlayer])
  const profile = useApi(() => (side.player ? getPlayer(side.player.id) : Promise.resolve(null)), [side.player?.id])
  const p = profile.data as PlayerProfile | null
  React.useEffect(() => {
    if (!p) return
    if (side.season && p.seasons_detail.some((s) => s.player_season_id === side.season)) return
    setSide((s) => ({ ...s, season: p.default_season_id ?? p.seasons_detail[0]?.player_season_id }))
  }, [p]) // eslint-disable-line react-hooks/exhaustive-deps
  return { side, setSide, profile: p }
}

export default function Compare() {
  const [params, setParams] = useSearchParams()
  const a = useSide(params.get('a'), params.get('as'))
  const b = useSide(params.get('b'), params.get('bs'))
  const [view, setView] = React.useState<'per90' | 'raw' | 'pct'>('per90')

  // default pairing resolved dynamically from the dataset
  React.useEffect(() => {
    if (params.get('a') || params.get('b')) return
    loadPreset(PRESETS[0])
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const loadPreset = async (pair: string[]) => {
    const [ra, rb] = await Promise.all(pair.map((n) => getSearch(n, 'player')))
    const ha = ra.results[0], hb = rb.results[0]
    if (ha) a.setSide({ player: { id: Number(ha.id), label: ha.label }, season: undefined })
    if (hb) b.setSide({ player: { id: Number(hb.id), label: hb.label }, season: undefined })
  }
  React.useEffect(() => {
    if (a.side.player && b.side.player && a.side.season && b.side.season) setParams({ a: String(a.side.player.id), as: a.side.season, b: String(b.side.player.id), bs: b.side.season }, { replace: true })
  }, [a.side, b.side, setParams])

  const cmp = useApi(() => (a.side.season && b.side.season ? getCompare(a.side.season, b.side.season) : Promise.resolve(null)), [a.side.season, b.side.season])
  const data = cmp.data as CompareT | null
  // era-adjusted: translate A into B's season population and vice-versa (only when both are distinct seasons)
  const trA = useApi(() => (a.side.season && data?.b.summary.season_key ? getEraTranslation(a.side.season, data.b.summary.season_key).catch(() => null) : Promise.resolve(null)), [a.side.season, data?.b.summary.season_key])
  const trB = useApi(() => (b.side.season && data?.a.summary.season_key ? getEraTranslation(b.side.season, data.a.summary.season_key).catch(() => null) : Promise.resolve(null)), [b.side.season, data?.a.summary.season_key])

  const swap = () => { const sa = a.side, sb = b.side; a.setSide(sb); b.setSide(sa) }
  const opts = (p: PlayerProfile | null) => (p?.seasons_detail ?? []).map((s) => ({ value: s.player_season_id, label: s.season_key, sublabel: `${Math.round(s.minutes)} min` }))
  const dims = data?.a.dna?.dimensions ?? data?.b.dna?.dimensions ?? []

  return (
    <div>
      <PageHeader eyebrow="Player comparison" title="Two seasons, side by side" subtitle="Raw counts, per-90 rates, position-group percentiles and DNA, with an era-comparability score that says how safely the two can be read together.">
        <div className="flex flex-wrap gap-1.5">{PRESETS.map((pr) => <Button key={pr.join()} size="sm" variant="ghost" onClick={() => loadPreset(pr)}>{pr[0].split(' ').pop()} vs {pr[1].split(' ').pop()}</Button>)}</div>
      </PageHeader>
      <div className="mb-6 grid items-end gap-3 md:grid-cols-[1fr_1fr_auto_1fr_1fr]">
        <div><div className="eyebrow mb-1.5">Player A</div><PlayerPicker value={a.side.player} onChange={(v) => a.setSide({ player: v, season: undefined })} /></div>
        <div><div className="eyebrow mb-1.5">Season A</div><Select ariaLabel="Season A" value={a.side.season} onValueChange={(s) => a.setSide((x) => ({ ...x, season: s }))} options={opts(a.profile)} placeholder="Season" disabled={!a.profile} /></div>
        <Button variant="ghost" aria-label="Swap players" onClick={swap} className="hidden md:inline-flex"><ArrowLeftRight className="h-4 w-4" /></Button>
        <div><div className="eyebrow mb-1.5">Player B</div><PlayerPicker value={b.side.player} onChange={(v) => b.setSide({ player: v, season: undefined })} /></div>
        <div><div className="eyebrow mb-1.5">Season B</div><Select ariaLabel="Season B" value={b.side.season} onValueChange={(s) => b.setSide((x) => ({ ...x, season: s }))} options={opts(b.profile)} placeholder="Season" disabled={!b.profile} /></div>
      </div>
      {cmp.error && <ErrorState error={cmp.error} onRetry={cmp.reload} />}
      {!data && !cmp.error && <div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-72" /><Skeleton className="h-72" /></div>}
      <AnimatePresence mode="wait">
        {data && (
          <motion.div key={data.a.summary.player_season_id + data.b.summary.player_season_id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
            <div className="mb-4 grid gap-4 md:grid-cols-[1fr_auto_1fr]">
              {[data.a, data.b].map((s, i) => (
                <Card key={i} className={i === 0 ? 'border-pitch/30' : 'border-gold/30'}>
                  <div className="flex items-start justify-between gap-2">
                    <div><div className="eyebrow">{i === 0 ? 'A' : 'B'}</div><h2 className="display text-2xl">{i === 0 ? a.side.player?.label : b.side.player?.label}</h2><div className="text-xs text-fg-dim">{s.summary.season_key} · {s.summary.team_name} · {s.summary.position}</div></div>
                    {s.dna ? <Badge tone={i === 0 ? 'green' : 'gold'}>{s.dna.archetype}</Badge> : <Badge tone="outline">Not modelled</Badge>}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2"><CoverageBadge value={s.summary.data_coverage} minutes={s.summary.minutes} /><Badge tone="outline">{s.summary.era}</Badge></div>
                </Card>
              ))}
              <div className="row-start-1 md:col-start-2 md:row-start-auto">
                <Card className="h-full text-center">
                  <div className="eyebrow">Similarity</div>
                  <div className="mt-1 text-3xl font-semibold tracking-tight text-pitch"><AnimatedNumber value={data.similarity?.similarity ?? null} digits={1} suffix="%" /></div>
                  <div className="mt-3 text-[10px] uppercase tracking-widest text-fg-dim">Era comparability</div>
                  <div className="text-2xl font-semibold tracking-tight"><AnimatedNumber value={data.comparability.score} digits={0} /></div>
                  <ConfidenceBadge level={data.comparability.score >= 70 ? 'high' : data.comparability.score >= 45 ? 'medium' : 'low'} />
                  {!!data.comparability.reasons.length && <ul className="mt-3 text-left text-[11px] text-fg-muted">{data.comparability.reasons.map((r) => <li key={r}>· {r}</li>)}</ul>}
                </Card>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardTitle>Player DNA</CardTitle>
                {dims.length ? <RadarDNA dimensions={dims.map((d) => ({ key: d.dimension, label: d.label }))} series={[
                  { key: 'a', name: a.side.player?.label ?? 'A', color: '#2fbf71', values: Object.fromEntries((data.a.dna?.dimensions ?? []).map((d) => [d.dimension, d.percentile])) },
                  { key: 'b', name: b.side.player?.label ?? 'B', color: '#d5b467', values: Object.fromEntries((data.b.dna?.dimensions ?? []).map((d) => [d.dimension, d.percentile])) },
                ]} /> : <div className="text-sm text-fg-muted">Neither season is in the modelling population.</div>}
                <ChartCaption>Percentiles within each player's position group across all eras. A missing polygon means that season is not modelled (goalkeeper, below minutes threshold or incomplete features).</ChartCaption>
              </Card>
              <Card>
                <CardTitle>Similarity explanation</CardTitle>
                {data.similarity ? <PercentileBars rows={data.similarity.explanation.map((e) => ({ key: e.dimension, label: e.label, value: e.a, secondary: e.b }))} nameA={a.side.player?.label} nameB={b.side.player?.label} /> : <div className="text-sm text-fg-muted">Similarity needs both seasons in the modelling population.</div>}
                <ChartCaption>Bars: player A's percentile; markers: player B's. Agreement per dimension is 100 − |gap|. Overall similarity uses the validated k-NN space, not these bars.</ChartCaption>
              </Card>
            </div>

            <Section title="Statistics" className="mt-8" action={<Tabs value={view} onValueChange={(v) => setView(v as typeof view)}><TabsList><TabsTrigger value="per90">Per 90</TabsTrigger><TabsTrigger value="raw">Raw</TabsTrigger><TabsTrigger value="pct">Percentiles</TabsTrigger></TabsList></Tabs>}>
              <Card className="overflow-x-auto p-0">
                <table className="w-full min-w-[520px] text-sm">
                  <thead><tr className="text-[11px] uppercase tracking-wider text-fg-dim"><th className="px-4 py-3 text-left font-medium">Metric</th><th className="px-4 py-3 text-right font-medium text-pitch">{a.side.player?.label}</th><th className="px-4 py-3 text-right font-medium text-gold">{b.side.player?.label}</th></tr></thead>
                  <tbody>
                    {view === 'raw' ? Object.entries(data.a.raw).map(([k, v]) => (
                      <tr key={k} className="border-t border-border"><td className="px-4 py-2 text-fg-muted">{k.replace(/_/g, ' ')}</td><td className="num px-4 py-2 text-right">{fmt(v, k === 'xg' || k === 'xa' || k === 'npxg' || k === 'shots_assisted_xg' || k === 'carry_distance' ? 1 : 0)}</td><td className="num px-4 py-2 text-right">{fmt(data.b.raw[k], k === 'xg' || k === 'xa' || k === 'npxg' || k === 'shots_assisted_xg' || k === 'carry_distance' ? 1 : 0)}</td></tr>
                    )) : data.metrics.map((m) => (
                      <tr key={m.metric} className="border-t border-border"><td className="px-4 py-2 text-fg-muted">{m.label}</td>
                        <td className="num px-4 py-2 text-right">{view === 'pct' ? ordinal(m.a_pct) : m.metric === 'pass_completion' ? (m.a == null ? '—' : `${(m.a * 100).toFixed(1)}%`) : fmt(m.a, 2)}</td>
                        <td className="num px-4 py-2 text-right">{view === 'pct' ? ordinal(m.b_pct) : m.metric === 'pass_completion' ? (m.b == null ? '—' : `${(m.b * 100).toFixed(1)}%`) : fmt(m.b, 2)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </Section>

            <Section title="Era-adjusted view" description="Each season quantile-mapped into the other's competition-season population (same position group). Where a season's own pool is too narrow, a year-window pool is used and flagged.">
              <HypotheticalBanner />
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {[{ tr: trA.data, from: a.side.player?.label, to: data.b.summary.season_key, color: 'text-pitch' }, { tr: trB.data, from: b.side.player?.label, to: data.a.summary.season_key, color: 'text-gold' }].map((x, i) => (
                  <Card key={i}>
                    <CardTitle action={x.tr ? <ConfidenceBadge level={x.tr.confidence.level} score={x.tr.confidence.score} /> : undefined}>{x.from} → {x.to}</CardTitle>
                    {x.tr ? (
                      <div className="grid gap-1.5 text-xs">
                        {x.tr.metrics.filter((m) => m.available).slice(0, 10).map((m) => (
                          <div key={m.metric} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3"><span className="truncate text-fg-muted">{m.label}</span><span className="num text-fg-dim">{fmt(m.historical, 2)}</span><span className="num text-fg-dim">{ordinal(m.historical_percentile)}</span><span className={`num w-14 text-right ${x.color}`}>{fmt(m.era_adjusted, 2)}</span></div>
                        ))}
                        <div className="mt-1 text-[10px] text-fg-dim">historical · era percentile · era-adjusted value · pools: {x.tr.source_pool.size} / {x.tr.target_pool.size}</div>
                      </div>
                    ) : trA.loading || trB.loading ? <Skeleton className="h-40" /> : <div className="text-xs text-fg-dim">Era adjustment unavailable for this pairing.</div>}
                  </Card>
                ))}
              </div>
            </Section>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
