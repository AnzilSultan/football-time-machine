import * as React from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { getEraTranslation, getPlayer, getSearch, getTranslationTargets, type EraTranslation, type PlayerProfile } from '@/lib/api'
import { useApi } from '@/hooks/useApi'
import { PlayerPicker } from '@/components/players/PlayerPicker'
import { Badge, Card, CardTitle, InfoTip, Select, Skeleton } from '@/components/ui/primitives'
import { AnimatedNumber, ChartCaption, ConfidenceBadge, CoverageBadge, CoverageBar, ErrorState, HypotheticalBanner, LabelledValue, PageHeader, Section } from '@/components/common'
import { RadarDNA } from '@/components/charts/RadarDNA'
import { PercentileBars } from '@/components/charts/PercentileBars'
import { GROUP_LABEL, POSITION_LABEL, fmt, ordinal } from '@/lib/utils'

const DEFAULT_PLAYER_QUERY = 'Lionel Messi'
const DEFAULT_SEASON_KEY = 'La Liga 2011/12'

export default function EraTranslator() {
  const [params, setParams] = useSearchParams()
  const [player, setPlayer] = React.useState<{ id: number; label: string } | null>(null)
  const [seasonId, setSeasonId] = React.useState<string | undefined>(params.get('season') ?? undefined)
  const [target, setTarget] = React.useState<string>(params.get('target') ?? 'modern')

  // Resolve the default player dynamically from the dataset (never a hardcoded id).
  React.useEffect(() => {
    const pid = params.get('player')
    if (pid) { getPlayer(pid).then((p) => setPlayer({ id: p.player_id, label: p.display_name })).catch(() => undefined); return }
    getSearch(DEFAULT_PLAYER_QUERY, 'player').then((r) => { const hit = r.results[0]; if (hit) setPlayer({ id: Number(hit.id), label: hit.label }) }).catch(() => undefined)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const profile = useApi(() => (player ? getPlayer(player.id) : Promise.resolve(null)), [player?.id])
  const targets = useApi(() => getTranslationTargets(), [])

  // pick the season once the profile loads
  React.useEffect(() => {
    const p = profile.data as PlayerProfile | null
    if (!p) return
    const owned = p.seasons_detail.some((s) => s.player_season_id === seasonId)
    if (owned) return
    const wanted = p.seasons_detail.find((s) => s.season_key === DEFAULT_SEASON_KEY && s.qualifies) ?? p.seasons_detail.filter((s) => s.qualifies).sort((a, b) => b.data_coverage - a.data_coverage)[0] ?? p.seasons_detail[0]
    setSeasonId(wanted?.player_season_id)
  }, [profile.data]) // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (player && seasonId) setParams({ player: String(player.id), season: seasonId, target }, { replace: true })
  }, [player, seasonId, target, setParams])

  const tr = useApi(() => (seasonId ? getEraTranslation(seasonId, target) : Promise.resolve(null)), [seasonId, target])
  const data = tr.data as EraTranslation | null
  const seasons = (profile.data as PlayerProfile | null)?.seasons_detail ?? []
  const seasonOpts = seasons.map((s) => ({ value: s.player_season_id, label: `${s.season_key}`, sublabel: `${Math.round(s.minutes)} min${s.qualifies ? '' : ' · below threshold'}` }))
  const targetOpts = (targets.data?.targets ?? []).map((t) => ({ value: t.id, label: t.label, sublabel: `${t.qualifying_player_seasons} qualifying`, group: t.kind === 'pool' ? 'Pooled' : t.id.match(/202[1-9]/) ? 'Modern seasons (2021+)' : 'Other seasons' }))
  const current = seasons.find((s) => s.player_season_id === seasonId)

  return (
    <div>
      <PageHeader eyebrow="Era Translator" title="What if they played today?" subtitle="A historical season is ranked against its own era, then quantile-mapped into a modern population of the same position group. Percentiles, not predictions.">
        <Link to={current ? `/dna/${player?.id}?season=${current.player_season_id}` : '/dna'} className="text-xs text-fg-muted hover:text-fg">Open in Player DNA <ArrowRight className="inline h-3 w-3" /></Link>
      </PageHeader>

      <div className="mb-6 grid gap-3 md:grid-cols-[1.4fr_1.2fr_0.8fr_1.4fr]">
        <div><div className="eyebrow mb-1.5">Player</div><PlayerPicker value={player} onChange={(v) => { setPlayer(v); setSeasonId(undefined) }} /></div>
        <div><div className="eyebrow mb-1.5">Season</div><Select ariaLabel="Season" value={seasonId} onValueChange={setSeasonId} options={seasonOpts} placeholder={profile.loading ? 'Loading seasons…' : 'Season'} disabled={!seasonOpts.length} /></div>
        <div><div className="eyebrow mb-1.5">Position</div><div className="flex h-10 items-center rounded-lg border border-border bg-surface px-3 text-sm">{current ? <span>{current.position ? POSITION_LABEL[current.position] ?? current.position : '—'} <span className="text-fg-dim">· {GROUP_LABEL[current.position_group ?? ''] ?? ''}</span></span> : <span className="text-fg-dim">—</span>}</div></div>
        <div><div className="eyebrow mb-1.5">Target population</div><Select ariaLabel="Target population" value={target} onValueChange={setTarget} options={targetOpts} placeholder="Target" /></div>
      </div>

      <HypotheticalBanner text="Values below are where the player's era-relative rank would land in the target population's distribution. They describe the target population, not what the player would literally do." />

      {tr.error && <div className="mt-6"><ErrorState error={tr.error} onRetry={tr.reload} /></div>}
      {!data && !tr.error && <div className="mt-6 grid gap-4 lg:grid-cols-3"><Skeleton className="h-80" /><Skeleton className="h-80" /><Skeleton className="h-80" /></div>}

      <AnimatePresence mode="wait">
        {data && (
          <motion.div key={data.source.player_season_id + target} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }} className="mt-6">
            {/* summary strip */}
            <div className="mb-6 flex flex-wrap items-center gap-2">
              <Badge tone="gold">{data.source.player} · {data.source.season_key}</Badge>
              {data.source.archetype && <Badge>{data.source.archetype}</Badge>}
              <CoverageBadge value={data.source.data_coverage} minutes={data.source.minutes} />
              <ConfidenceBadge level={data.confidence.level} score={data.confidence.score} />
              <Badge tone="outline">Source pool: {data.source_pool.size} peers</Badge>
              <Badge tone="outline">Target pool: {data.target_pool.size} peers</Badge>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <ProfileCard title="Historical profile" tone="gold" note={data.source_pool.note} pool={`${data.source_pool.label} · ${data.source_pool.size} qualifying ${data.source.position_group}`}
                rows={data.dimensions.map((d) => ({ key: d.dimension, label: d.label, value: d.historical }))} color="var(--color-gold)" />
              <ProfileCard title="Era-adjusted profile" tone="green" note="Same percentile rank, expressed as a value from the target population's distribution (quantile mapping). Rank is preserved by construction."
                pool={data.target_pool.label}
                rows={data.metrics.filter((m) => m.available).slice(0, 10).map((m) => ({ key: m.metric, label: m.label, value: m.historical_percentile ?? null, raw: m.era_adjusted == null ? '—' : fmt(m.era_adjusted, 2) }))} color="var(--color-pitch)" showRaw />
              <ProfileCard title="Modern context profile" tone="neutral" note="Where the player's actual historical numbers would sit if dropped unadjusted into the target population."
                pool={data.target_pool.label}
                rows={data.dimensions.map((d) => ({ key: d.dimension, label: d.label, value: d.modern_context }))} color="var(--color-info)" />
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_1fr]">
              <Card>
                <CardTitle>Historical vs modern-context DNA</CardTitle>
                <RadarDNA dimensions={data.dimensions.map((d) => ({ key: d.dimension, label: d.label }))} series={[
                  { key: 'hist', name: 'Historical (own era)', color: '#d5b467', values: Object.fromEntries(data.dimensions.map((d) => [d.dimension, d.historical])) },
                  { key: 'ctx', name: 'Modern context', color: '#6aa8ff', values: Object.fromEntries(data.dimensions.map((d) => [d.dimension, d.modern_context])) },
                ]} />
                <ChartCaption>Gold: percentile among peers in the source reference pool. Blue: percentile of the same raw numbers among the target pool. Where the two diverge, the environment changed more than the player did.</ChartCaption>
              </Card>
              <Card>
                <CardTitle action={<InfoTip text={data.method} />}>Confidence &amp; reference pools</CardTitle>
                <div className="mb-3 flex items-center gap-3"><div className="text-3xl font-semibold tracking-tight"><AnimatedNumber value={data.confidence.score} digits={0} /></div><ConfidenceBadge level={data.confidence.level} /></div>
                <CoverageBar value={data.confidence.score} className="mb-4" />
                <ul className="mb-4 list-disc space-y-1 pl-4 text-xs text-fg-muted">
                  {data.confidence.reasons.length ? data.confidence.reasons.map((r) => <li key={r}>{r}</li>) : <li>No major caveats flagged for this pairing.</li>}
                </ul>
                <div className="grid gap-3 sm:grid-cols-2">
                  <LabelledValue label="Source pool">{data.source_pool.label}<div className="text-xs text-fg-dim">{data.source_pool.size} player-seasons · {data.source_pool.seasons} seasons{data.source_pool.sample_mix ? ` · ${Object.entries(data.source_pool.sample_mix).map(([k, v]) => `${Math.round(v * 100)}% ${k.replace(/_/g, ' ')}`).join(', ')}` : ''}</div></LabelledValue>
                  <LabelledValue label="Target pool">{data.target_pool.label}<div className="text-xs text-fg-dim">{data.target_pool.size} player-seasons · {data.target_pool.competitions?.join(', ')}</div></LabelledValue>
                </div>
              </Card>
            </div>

            <Section title="Metric comparison" description="Historical value → percentile within the source pool → the value at that percentile in the target pool. The last column is the modern-context percentile of the raw historical value." className="mt-8">
              <Card className="overflow-x-auto p-0">
                <table className="w-full min-w-[640px] text-sm">
                  <thead><tr className="text-left text-[11px] uppercase tracking-wider text-fg-dim">
                    <th className="px-4 py-3 font-medium">Metric</th><th className="px-4 py-3 text-right font-medium">Historical</th><th className="px-4 py-3 text-right font-medium">Era pct</th><th className="px-4 py-3 text-right font-medium">Era-adjusted</th><th className="px-4 py-3 text-right font-medium">Target median</th><th className="px-4 py-3 text-right font-medium">Modern-context pct</th>
                  </tr></thead>
                  <tbody>
                    {data.metrics.map((m) => (
                      <tr key={m.metric} className="border-t border-border">
                        <td className="px-4 py-2.5 text-fg-muted">{m.label}</td>
                        {m.available ? (
                          <>
                            <td className="num px-4 py-2.5 text-right text-gold"><AnimatedNumber value={m.historical} digits={2} /></td>
                            <td className="num px-4 py-2.5 text-right">{ordinal(m.historical_percentile)}</td>
                            <td className="num px-4 py-2.5 text-right text-pitch"><AnimatedNumber value={m.era_adjusted} digits={2} /></td>
                            <td className="num px-4 py-2.5 text-right text-fg-muted">{fmt(m.target_median, 2)}</td>
                            <td className="num px-4 py-2.5 text-right">{ordinal(m.modern_context_percentile)}</td>
                          </>
                        ) : <td colSpan={5} className="px-4 py-2.5 text-right text-xs text-fg-dim">not available for this season</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </Section>

            <Section title="Modern player comparison" description={data.modern_comparison.basis}>
              {data.modern_comparison.results.length ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {data.modern_comparison.results.map((r, i) => (
                    <motion.div key={r.player_season_id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                      <Link to={`/dna/${r.player_id}?season=${r.player_season_id}`} className="card card-hover block p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div><div className="font-semibold">{r.player}</div><div className="text-xs text-fg-dim">{r.season_key} · {r.team}</div></div>
                          <div className="text-right"><div className="num text-lg text-pitch">{fmt(r.similarity, 1)}%</div><div className="text-[10px] uppercase tracking-wider text-fg-dim">profile match</div></div>
                        </div>
                        {r.archetype && <Badge className="mt-2">{r.archetype}</Badge>}
                        <div className="mt-3 grid gap-1 text-xs">
                          {r.explanation.map((e) => <div key={e.dimension} className="flex justify-between text-fg-muted"><span>{e.label}</span><span className="num text-fg">{Math.round(e.agreement)}%</span></div>)}
                        </div>
                      </Link>
                    </motion.div>
                  ))}
                </div>
              ) : <div className="text-sm text-fg-muted">No comparable players in the target pool for this position group.</div>}
            </Section>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ProfileCard({ title, tone, note, pool, rows, color, showRaw }: { title: string; tone: 'gold' | 'green' | 'neutral'; note: string; pool: string; rows: { key: string; label: string; value: number | null; raw?: string }[]; color: string; showRaw?: boolean }) {
  return (
    <Card>
      <CardTitle action={<Badge tone={tone === 'neutral' ? 'blue' : tone}>{tone === 'gold' ? 'SOURCED + CALCULATED' : tone === 'green' ? 'MODEL ESTIMATE' : 'CALCULATED'}</Badge>}>{title}</CardTitle>
      <div className="mb-3 text-[11px] text-fg-dim">{pool}</div>
      {showRaw ? (
        <div className="grid gap-2">
          {rows.map((r) => (
            <div key={r.key} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 text-xs">
              <span className="truncate text-fg-muted">{r.label}</span>
              <span className="num text-fg-dim">{ordinal(r.value)}</span>
              <span className="num w-14 text-right text-pitch">{r.raw}</span>
            </div>
          ))}
        </div>
      ) : <PercentileBars rows={rows} colorA={color} compact />}
      <ChartCaption>{note}</ChartCaption>
    </Card>
  )
}
