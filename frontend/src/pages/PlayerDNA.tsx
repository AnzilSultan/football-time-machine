import * as React from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Pause, Play } from 'lucide-react'
import { getEraMap, getPlayer, getPlayerDna, getPlayerSeasons, getSearch, getSimilar, type MapPoint, type PlayerProfile, type SeasonStats, type Timeline } from '@/lib/api'
import { useApi } from '@/hooks/useApi'
import { PlayerPicker } from '@/components/players/PlayerPicker'
import { Badge, Button, Card, CardTitle, Select, Skeleton, Switch, TabsList, Tabs, TabsTrigger } from '@/components/ui/primitives'
import { AnimatedNumber, ChartCaption, CoverageBadge, CoverageBar, EmptyState, ErrorState, LabelledValue, PageHeader, Section } from '@/components/common'
import { RadarDNA } from '@/components/charts/RadarDNA'
import { PercentileBars } from '@/components/charts/PercentileBars'
import { ScatterMap } from '@/components/charts/ScatterMap'
import { TrendChart } from '@/components/charts/TrendChart'
import { GROUP_LABEL, POSITION_LABEL, clusterColor, fmt, ordinal } from '@/lib/utils'

const DIM_KEYS = ['finishing', 'chance_creation', 'ball_progression', 'passing', 'carrying', 'dribbling', 'possession_involvement', 'defensive_activity', 'pressing', 'aerial']
const DIM_LABEL: Record<string, string> = { finishing: 'Finishing', chance_creation: 'Chance Creation', ball_progression: 'Ball Progression', passing: 'Passing', carrying: 'Carrying', dribbling: 'Dribbling', possession_involvement: 'Possession Involvement', defensive_activity: 'Defensive Activity', pressing: 'Pressing', aerial: 'Aerial Contribution' }

export default function PlayerDNA() {
  const { playerId } = useParams()
  const [params, setParams] = useSearchParams()
  const nav = useNavigate()
  const [seasonId, setSeasonId] = React.useState<string | undefined>(params.get('season') ?? undefined)
  const [basis, setBasis] = React.useState<'pooled' | 'season'>('pooled')
  const [samePos, setSamePos] = React.useState(false)
  const [distinct, setDistinct] = React.useState(true)

  React.useEffect(() => {
    if (playerId) return
    getSearch('Lionel Messi', 'player').then((r) => r.results[0] && nav(`/dna/${r.results[0].id}`, { replace: true })).catch(() => undefined)
  }, [playerId, nav])

  const profile = useApi(() => (playerId ? getPlayer(playerId) : Promise.resolve(null)), [playerId])
  const p = profile.data as PlayerProfile | null
  React.useEffect(() => {
    if (!p) return
    if (seasonId && p.seasons_detail.some((s) => s.player_season_id === seasonId)) return
    setSeasonId(p.default_season_id ?? p.seasons_detail[0]?.player_season_id)
  }, [p]) // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => { if (seasonId) setParams({ season: seasonId }, { replace: true }) }, [seasonId, setParams])

  const dna = useApi(() => (playerId && seasonId ? getPlayerDna(playerId, seasonId) : Promise.resolve(null)), [playerId, seasonId])
  const similar = useApi(() => (playerId && seasonId ? getSimilar(playerId, seasonId, 8, samePos, undefined, distinct) : Promise.resolve(null)), [playerId, seasonId, samePos, distinct])
  const timeline = useApi(() => (playerId ? getPlayerSeasons(playerId) : Promise.resolve(null)), [playerId])
  const map = useApi(() => getEraMap('players'), [])
  const s = dna.data as SeasonStats | null
  const d = s?.dna ?? null
  const seasonOpts = (p?.seasons_detail ?? []).map((x) => ({ value: x.player_season_id, label: x.season_key, sublabel: `${Math.round(x.minutes)} min${x.modeled ? '' : ' · not modelled'}` }))

  const radarValues = d ? Object.fromEntries(d.dimensions.map((x) => [x.dimension, basis === 'pooled' ? x.percentile : x.season_percentile])) : {}
  const groupPoints = React.useMemo(() => {
    if (!map.data || !s?.summary.position_group) return []
    return map.data.points.filter((pt) => pt.position_group === s.summary.position_group)
  }, [map.data, s?.summary.position_group])

  if (!playerId) return <div className="grid gap-4"><Skeleton className="h-10 w-72" /><Skeleton className="h-64" /></div>
  return (
    <div>
      <PageHeader eyebrow="Player DNA" title="Who actually plays like this player?" subtitle="A ten-dimension statistical fingerprint built from StatsBomb events, ranked against the same position group, with nearest neighbours chosen by a validated similarity model.">
        <Link to={seasonId ? `/era-translator?player=${playerId}&season=${seasonId}` : '/era-translator'} className="text-xs text-fg-muted hover:text-fg">Translate to a modern era <ArrowRight className="inline h-3 w-3" /></Link>
      </PageHeader>
      <div className="mb-6 grid gap-3 md:grid-cols-[1.4fr_1fr_auto]">
        <div><div className="eyebrow mb-1.5">Player</div><PlayerPicker value={p ? { id: p.player_id, label: p.display_name } : null} onChange={(v) => { setSeasonId(undefined); nav(`/dna/${v.id}`) }} /></div>
        <div><div className="eyebrow mb-1.5">Season</div><Select ariaLabel="Season" value={seasonId} onValueChange={setSeasonId} options={seasonOpts} placeholder="Season" disabled={!seasonOpts.length} /></div>
        <div><div className="eyebrow mb-1.5">Percentile basis</div>
          <Tabs value={basis} onValueChange={(v) => setBasis(v as 'pooled' | 'season')}><TabsList><TabsTrigger value="pooled">All eras</TabsTrigger><TabsTrigger value="season">Same season</TabsTrigger></TabsList></Tabs></div>
      </div>

      {profile.error && <ErrorState error={profile.error} onRetry={profile.reload} />}
      {dna.error && !profile.error && <ErrorState error={dna.error} onRetry={dna.reload} />}
      {!s && !dna.error && !profile.error && <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]"><Skeleton className="h-72" /><Skeleton className="h-72" /></div>}

      {s && p && (
        <AnimatePresence mode="popLayout">
          <motion.div key={s.summary.player_season_id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
            <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
              {/* player card */}
              <Card className="flex flex-col">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="display text-2xl">{p.display_name}</h2>
                    <div className="mt-1 text-xs text-fg-dim">{p.player_name !== p.display_name ? p.player_name + ' · ' : ''}{p.country ?? ''}</div>
                  </div>
                  {d ? <Badge tone="green">{d.archetype}</Badge> : <Badge tone="outline">Not modelled</Badge>}
                </div>
                <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                  <LabelledValue label="Position">{s.summary.position ? POSITION_LABEL[s.summary.position] ?? s.summary.position : '—'}</LabelledValue>
                  <LabelledValue label="Club">{s.summary.team_name}</LabelledValue>
                  <LabelledValue label="Season">{s.summary.season_key}</LabelledValue>
                  <LabelledValue label="Age"><span className="text-fg-dim" title={p.age_note}>not in source data</span></LabelledValue>
                  <LabelledValue label="Minutes"><AnimatedNumber value={s.summary.minutes} digits={0} /> <span className="text-fg-dim">· {s.summary.appearances} apps</span></LabelledValue>
                  <LabelledValue label="Goals / Assists"><AnimatedNumber value={s.summary.goals} digits={0} /> / <AnimatedNumber value={s.summary.assists} digits={0} /></LabelledValue>
                  <LabelledValue label="xG / xA"><AnimatedNumber value={s.summary.xg} digits={1} /> / <AnimatedNumber value={s.summary.xa} digits={1} /></LabelledValue>
                  <LabelledValue label="Era">{s.summary.era}</LabelledValue>
                  <LabelledValue label="Group">{GROUP_LABEL[s.summary.position_group ?? ''] ?? '—'}</LabelledValue>
                </div>
                <div className="mt-5">
                  <div className="mb-1 flex items-center justify-between text-[11px] text-fg-dim"><span>Data coverage</span><CoverageBadge value={s.summary.data_coverage} /></div>
                  <CoverageBar value={s.summary.data_coverage} />
                  {!s.summary.qualifies && <p className="mt-2 text-xs text-gold">Below the {s.summary.min_minutes_threshold}-minute threshold for this competition type, so this season is excluded from similarity and clustering.</p>}
                  {s.summary.qualifies && !d && <p className="mt-2 text-xs text-gold">Goalkeepers are not part of the outfield model, so DNA and similarity are not computed.</p>}
                </div>
              </Card>
              {/* radar */}
              <Card>
                <CardTitle action={<span className="text-[11px] text-fg-dim">{basis === 'pooled' ? 'vs all qualifying seasons in the position group' : 'vs same competition-season & position group'}</span>}>DNA radar</CardTitle>
                {d ? <RadarDNA dimensions={d.dimensions.map((x) => ({ key: x.dimension, label: x.label }))} series={[{ key: 'p', name: p.display_name, color: '#2fbf71', values: radarValues }]} /> : <EmptyState title="No DNA for this season" text="DNA needs a qualifying outfield season with a complete feature vector." />}
                <ChartCaption>{d ? `Each axis is the mean z-score of its member metrics, converted to a percentile. Basis: ${d.percentile_basis}.` : 'Choose a qualifying season to see the fingerprint.'}</ChartCaption>
              </Card>
            </div>

            {d && (
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardTitle>Dimension percentiles</CardTitle>
                  <PercentileBars rows={d.dimensions.map((x) => ({ key: x.dimension, label: x.label, value: basis === 'pooled' ? x.percentile : x.season_percentile, hint: `Built from: ${x.members.join(', ')}` }))} />
                </Card>
                <Card>
                  <CardTitle>Metric percentiles (position group, all eras)</CardTitle>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {d.metrics.map((m) => (
                      <div key={m.metric} className="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-xs hover:bg-white/[0.03]">
                        <span className="truncate text-fg-muted">{m.label}</span>
                        <span className="num shrink-0"><span className="text-fg">{m.value == null ? '—' : m.metric === 'pass_completion' ? `${(m.value * 100).toFixed(1)}%` : fmt(m.value, 2)}</span> <span className="text-fg-dim">· {ordinal(m.percentile)}</span></span>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            )}

            {/* similarity */}
            <Section title="Similar players" description={similar.data?.method ?? undefined} className="mt-8" action={<div className="flex flex-wrap gap-4"><Switch checked={distinct} onCheckedChange={setDistinct} label="One season per player" /><Switch checked={samePos} onCheckedChange={setSamePos} label="Same position group only" /></div>}>
              {similar.data?.results.length ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <AnimatePresence initial={false}>
                    {similar.data.results.map((r, i) => (
                      <motion.div key={r.player_season_id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.28, delay: i * 0.03 }}>
                        <Link to={`/dna/${r.player_id}?season=${r.player_season_id}`} className="card card-hover block h-full p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0"><div className="truncate font-semibold">{r.player}</div><div className="truncate text-xs text-fg-dim">{r.season_key} · {r.team}</div></div>
                            <div className="text-right"><div className="num text-lg text-pitch">{fmt(r.similarity, 1)}%</div><div className="text-[10px] uppercase tracking-wider text-fg-dim">similarity</div></div>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1"><Badge>{r.archetype}</Badge><Badge tone="outline">{r.position}</Badge></div>
                          <div className="mt-3 grid gap-1">
                            {r.explanation.slice(0, 4).map((e) => (
                              <div key={e.dimension} className="grid grid-cols-[1fr_auto] items-center gap-2 text-[11px]">
                                <span className="text-fg-muted">{e.label}</span><span className="num text-fg">{Math.round(e.agreement)}%</span>
                                <div className="col-span-2 h-1 rounded-full bg-white/[0.07]"><motion.div className="h-full rounded-full bg-pitch/70" initial={{ width: 0 }} animate={{ width: `${e.agreement}%` }} transition={{ duration: 0.5 }} /></div>
                              </div>
                            ))}
                          </div>
                        </Link>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              ) : similar.loading ? <div className="grid gap-3 md:grid-cols-4"><Skeleton className="h-40" /><Skeleton className="h-40" /><Skeleton className="h-40" /><Skeleton className="h-40" /></div>
                : <EmptyState title="No similarity results" text={similar.data?.reason ?? 'This season is outside the modelling population.'} />}
              <ChartCaption>Similarity = 100 × (1 − F(distance)) where F is the empirical distribution of distances between random player-season pairs, so 95% means “closer than 95% of all pairs”. Per-dimension agreement = 100 − |percentile gap|.</ChartCaption>
            </Section>

            {/* PCA position */}
            {d && (
              <Section title="Position in the PCA map" description={`${GROUP_LABEL[s.summary.position_group ?? '']} only, coloured by archetype. The highlighted point is this season.`}>
                <Card className="p-2">
                  {map.data ? <ScatterMap points={groupPoints} highlightId={s.summary.player_season_id} height={360} radius={3.5} onSelect={(pt: MapPoint | null) => pt && nav(`/dna/${pt.player_id}?season=${pt.id}`)}
                    axisLabels={[`PC1 (${Math.round((map.data.explained_variance[0] ?? 0) * 100)}%)`, `PC2 (${Math.round((map.data.explained_variance[1] ?? 0) * 100)}%)`]} colorOf={(pt) => clusterColor(pt.cluster)} /> : <Skeleton className="h-[360px]" />}
                </Card>
                <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-fg-muted">
                  {map.data?.clusters.filter((c) => groupPoints.some((pt) => pt.cluster === c.cluster)).map((c) => <span key={c.cluster} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: clusterColor(c.cluster) }} />{c.name}</span>)}
                </div>
              </Section>
            )}

            <PlayerThroughTime timeline={timeline.data as Timeline | null} current={seasonId} onPick={setSeasonId} name={p.display_name} />
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  )
}

function PlayerThroughTime({ timeline, current, onPick, name }: { timeline: Timeline | null; current?: string; onPick: (id: string) => void; name: string }) {
  const [playing, setPlaying] = React.useState(false)
  const [idx, setIdx] = React.useState(0)
  const modeled = React.useMemo(() => (timeline?.seasons ?? []).filter((x) => x.modeled), [timeline])
  React.useEffect(() => {
    const i = modeled.findIndex((x) => x.player_season_id === current)
    if (i >= 0) setIdx(i)
  }, [current, modeled])
  React.useEffect(() => {
    if (!playing || modeled.length < 2) return
    const t = setInterval(() => setIdx((i) => { const n = (i + 1) % modeled.length; onPick(modeled[n].player_season_id); return n }), 1600)
    return () => clearInterval(t)
  }, [playing, modeled, onPick])
  if (!timeline) return null
  if (modeled.length < 2) return (
    <Section title="Player through time" description="Needs at least two modelled seasons to draw a trajectory." className="mt-8"><EmptyState title={`${name} has ${modeled.length} modelled season${modeled.length === 1 ? '' : 's'}`} text="Seasons below the minutes threshold, and goalkeeper seasons, are shown in the season list but not modelled." /></Section>
  )
  const data = modeled.map((x) => ({ x: x.season_key.replace(/^(.*?)(\d{4}.*)$/, '$2'), ...Object.fromEntries(DIM_KEYS.map((k) => [k, x.dna?.[k] ?? null])), key: x.player_season_id }))
  const cur = modeled[idx]
  return (
    <Section title="Player through time" description={timeline.note} className="mt-8" action={
      <Button size="sm" variant="subtle" onClick={() => setPlaying((v) => !v)} aria-pressed={playing}>{playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}{playing ? 'Pause' : 'Play seasons'}</Button>}>
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardTitle>DNA percentiles by season</CardTitle>
          <TrendChart data={data} height={260} highlightX={cur ? cur.season_key.replace(/^(.*?)(\d{4}.*)$/, '$2') : undefined} yDomain={[0, 100]} digits={0}
            series={[{ key: 'finishing', name: 'Finishing', color: '#2fbf71' }, { key: 'chance_creation', name: 'Creation', color: '#d5b467' }, { key: 'ball_progression', name: 'Progression', color: '#6aa8ff' }, { key: 'dribbling', name: 'Dribbling', color: '#b58cff' }, { key: 'defensive_activity', name: 'Defending', color: '#e5745b', dashed: true }]} />
          <ChartCaption>Percentiles within position group across all eras. Changes reflect role, team, competition and sample size as much as the player.</ChartCaption>
        </Card>
        <Card>
          <CardTitle action={<Badge tone="gold">{cur?.season_key}</Badge>}>Season scrubber</CardTitle>
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Seasons">
            {modeled.map((x, i) => (
              <button key={x.player_season_id} role="tab" aria-selected={i === idx} onClick={() => { setIdx(i); onPick(x.player_season_id) }}
                className={`rounded-md border px-2 py-1 text-[11px] transition-colors ${i === idx ? 'border-pitch bg-pitch-soft text-pitch' : 'border-border text-fg-muted hover:border-border-strong'}`}>{x.season_key.replace(/^(.*?)(\d{4}.*)$/, '$2')}</button>
            ))}
          </div>
          {cur && (
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <LabelledValue label="Team">{cur.team_name}</LabelledValue><LabelledValue label="Archetype">{cur.archetype ?? '—'}</LabelledValue>
              <LabelledValue label="Minutes"><AnimatedNumber value={cur.minutes} digits={0} /></LabelledValue><LabelledValue label="Coverage"><AnimatedNumber value={cur.data_coverage} digits={0} /></LabelledValue>
              <LabelledValue label="npxG /90"><AnimatedNumber value={cur.per90.npxg_per90} digits={2} /></LabelledValue><LabelledValue label="Key passes /90"><AnimatedNumber value={cur.per90.key_passes_per90} digits={2} /></LabelledValue>
            </div>
          )}
          <div className="mt-4 grid gap-1.5">
            {DIM_KEYS.slice(0, 6).map((k) => (
              <div key={k} className="grid grid-cols-[110px_1fr_36px] items-center gap-2 text-[11px]"><span className="text-fg-muted">{DIM_LABEL[k]}</span>
                <div className="h-1.5 rounded-full bg-white/[0.07]"><motion.div className="h-full rounded-full bg-gold" animate={{ width: `${cur?.dna?.[k] ?? 0}%` }} transition={{ duration: 0.6 }} /></div>
                <span className="num text-right">{cur?.dna?.[k] == null ? '—' : Math.round(cur.dna[k])}</span></div>
            ))}
          </div>
        </Card>
      </div>
    </Section>
  )
}
