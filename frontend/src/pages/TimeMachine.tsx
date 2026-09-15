import * as React from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import { getArchetypes, getTimeMachine, type TimeMachine as TM, type TmSeason } from '@/lib/api'
import { useApi } from '@/hooks/useApi'
import { Badge, Button, Card, CardTitle, Select, Skeleton, Slider } from '@/components/ui/primitives'
import { AnimatedNumber, ChartCaption, EmptyState, ErrorState, PageHeader, Section } from '@/components/common'
import { TrendChart } from '@/components/charts/TrendChart'
import { SAMPLE_LABEL, clusterColor, fmt } from '@/lib/utils'

/** First index of each distinct year, thinned so labels never overlap (≈ every 8% of the track). */
function timelineMarks(seasons: TmSeason[]) {
  const firsts: { value: number; label: string }[] = []
  seasons.forEach((s, i) => { if (i === 0 || s.year !== seasons[i - 1].year) firsts.push({ value: i, label: `${s.year}` }) })
  const minGap = Math.max(1, Math.ceil(seasons.length * 0.08))
  const out: { value: number; label: string }[] = []
  for (const m of firsts) if (!out.length || m.value - out[out.length - 1].value >= minGap) out.push(m)
  return out
}

const ABBR: Record<string, string> = { 'La Liga': 'LL', 'Premier League': 'PL', 'Serie A': 'SA', 'Ligue 1': 'L1', '1. Bundesliga': 'BL', 'FIFA World Cup': 'WC', 'UEFA Euro': 'EU', 'Copa America': 'CA', 'African Cup of Nations': 'AFCON', 'Major League Soccer': 'MLS', 'Indian Super league': 'ISL', 'Champions League': 'UCL' }
const shortKey = (s: TmSeason) => `${ABBR[s.competition] ?? s.competition.slice(0, 3)} ${s.season.replace(/^20/, '')}`

const TILES: { key: string; label: string; digits: number; hint: string }[] = [
  { key: 'goals_per_match', label: 'Goals per match', digits: 2, hint: 'Official scores, both teams.' },
  { key: 'passes_per_team_match', label: 'Passes per team-match', digits: 0, hint: 'Pass events attempted, averaged per team per match.' },
  { key: 'pass_completion', label: 'Pass completion', digits: 1, hint: 'Completed ÷ attempted passes.' },
  { key: 'pressures_per_team_match', label: 'Pressures per team-match', digits: 0, hint: 'Pressure events.' },
  { key: 'progressive_passes_per_team_match', label: 'Progressive passes', digits: 0, hint: 'Per team-match; see METHODOLOGY for definition.' },
  { key: 'progressive_carries_per_team_match', label: 'Progressive carries', digits: 0, hint: 'Per team-match.' },
  { key: 'shots_per_team_match', label: 'Shots per team-match', digits: 1, hint: 'All shot events including penalties.' },
  { key: 'xg_per_shot', label: 'xG per shot', digits: 3, hint: 'Shot quality proxy.' },
  { key: 'tackles_per_team_match', label: 'Tackles per team-match', digits: 1, hint: 'Tackle duels.' },
  { key: 'interceptions_per_team_match', label: 'Interceptions', digits: 1, hint: 'Successful interceptions per team-match.' },
  { key: 'high_turnovers_per_team_match', label: 'High turnovers', digits: 1, hint: 'Ball recoveries in the attacking third per team-match.' },
  { key: 'long_ball_share', label: 'Long-ball share', digits: 1, hint: 'Passes of 30+ yards ÷ all passes.' },
]

export default function TimeMachine() {
  const [params, setParams] = useSearchParams()
  const tm = useApi(() => getTimeMachine(), [])
  const arch = useApi(() => getArchetypes(), [])
  const [competition, setCompetition] = React.useState(params.get('competition') ?? 'all')
  const [era, setEra] = React.useState('all')
  const [group, setGroup] = React.useState('all')
  const [metric, setMetric] = React.useState('passes_per_team_match')
  const [idx, setIdx] = React.useState(0)
  const [playing, setPlaying] = React.useState(false)
  const data = tm.data as TM | null

  const seasons = React.useMemo(() => {
    if (!data) return []
    return data.seasons.filter((s) => (competition === 'all' || s.competition === competition) && (era === 'all' || s.era === era)).sort((a, b) => a.year - b.year || a.competition.localeCompare(b.competition))
  }, [data, competition, era])

  React.useEffect(() => {
    const wanted = params.get('season')
    if (wanted && seasons.length) { const i = seasons.findIndex((s) => s.season_key === wanted); if (i >= 0) setIdx(i) }
    else setIdx((i) => Math.min(i, Math.max(0, seasons.length - 1)))
  }, [seasons]) // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    if (!playing || seasons.length < 2) return
    const t = setInterval(() => setIdx((i) => (i + 1) % seasons.length), 1500)
    return () => clearInterval(t)
  }, [playing, seasons.length])
  const cur: TmSeason | undefined = seasons[idx]
  React.useEffect(() => { if (cur) setParams({ season: cur.season_key, ...(competition !== 'all' ? { competition } : {}) }, { replace: true }) }, [cur?.season_key]) // eslint-disable-line react-hooks/exhaustive-deps

  const archGroup = React.useMemo(() => Object.fromEntries((arch.data?.archetypes ?? []).map((a) => [a.name, a.position_group])), [arch.data])
  const cluster = data?.era_clusters.find((c) => c.cluster === cur?.era_cluster)
  const trend = seasons.map((s) => ({ x: shortKey(s), v: s.metrics[metric] ?? null }))
  const competitions = Array.from(new Set(data?.seasons.map((s) => s.competition) ?? [])).sort()
  const eras = Array.from(new Set(data?.seasons.map((s) => s.era) ?? []))
  const archMix = (cur?.archetypes ?? []).filter((a) => group === 'all' || archGroup[a.name] === group)
  const archTotal = archMix.reduce((n, a) => n + a.count, 0) || 1
  const reps = (cur?.representatives ?? []).filter((r) => group === 'all' || archGroup[r.archetype] === group)

  if (tm.error) return <ErrorState error={tm.error} onRetry={tm.reload} />
  return (
    <div>
      <PageHeader eyebrow="Football Time Machine" title="How has football changed?" subtitle="Season-level aggregates from every match in the dataset, standardised and clustered into eras. Only periods with real event data are shown; single-team samples are flagged rather than hidden." />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div><div className="eyebrow mb-1.5">Competition</div><Select ariaLabel="Competition" value={competition} onValueChange={setCompetition} options={[{ value: 'all', label: 'All competitions' }, ...competitions.map((c) => ({ value: c, label: c }))]} /></div>
        <div><div className="eyebrow mb-1.5">Era</div><Select ariaLabel="Era" value={era} onValueChange={setEra} options={[{ value: 'all', label: 'All eras' }, ...eras.map((e) => ({ value: e, label: e }))]} /></div>
        <div><div className="eyebrow mb-1.5">Position group (roles)</div><Select ariaLabel="Position group" value={group} onValueChange={setGroup} options={[{ value: 'all', label: 'All outfield' }, { value: 'DF', label: 'Defenders' }, { value: 'MF', label: 'Midfielders' }, { value: 'AM', label: 'Attacking mids & wingers' }, { value: 'FW', label: 'Forwards' }]} /></div>
        <div><div className="eyebrow mb-1.5">Trend metric</div><Select ariaLabel="Trend metric" value={metric} onValueChange={setMetric} options={TILES.map((t) => ({ value: t.key, label: t.label }))} /></div>
      </div>

      {!data ? <Skeleton className="h-40" /> : !seasons.length ? <EmptyState title="No seasons match these filters" /> : (
        <>
          {/* timeline scrubber */}
          <Card className="mb-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <AnimatePresence mode="wait">
                  <motion.div key={cur?.season_key} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }}>
                    <div className="display text-3xl md:text-4xl">{cur?.season_key}</div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                      <Badge tone="gold">{cur?.era}</Badge>
                      {cluster && <Badge tone="green"><span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: clusterColor(cluster.cluster) }} />{cluster.name}</Badge>}
                      <Badge tone={cur?.sample_type === 'full_season' ? 'neutral' : 'red'}>{SAMPLE_LABEL[cur?.sample_type ?? ''] ?? cur?.sample_type}{cur?.sample_type === 'single_team_centric' ? ` · ${cur.dominant_team}` : ''}</Badge>
                      <span className="text-fg-dim">{cur?.matches} matches · {cur?.teams} teams · {cur?.qualifying_player_seasons} qualifying player-seasons</span>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" aria-label="Previous season" onClick={() => setIdx((i) => Math.max(0, i - 1))}><SkipBack className="h-4 w-4" /></Button>
                <Button size="sm" variant="subtle" onClick={() => setPlaying((v) => !v)} aria-pressed={playing}>{playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}{playing ? 'Pause' : 'Play'}</Button>
                <Button size="sm" variant="ghost" aria-label="Next season" onClick={() => setIdx((i) => Math.min(seasons.length - 1, i + 1))}><SkipForward className="h-4 w-4" /></Button>
              </div>
            </div>
            <div className="mt-5">
              <Slider value={idx} onValueChange={setIdx} min={0} max={Math.max(0, seasons.length - 1)} ariaLabel="Season timeline" marks={timelineMarks(seasons)} />
            </div>
            {cur?.sample_type === 'single_team_centric' && <p className="mt-4 text-xs text-gold">This season only contains {cur.dominant_team} matches ({Math.round(cur.dominant_team_share * 100)}% of the sample). The numbers describe {cur.dominant_team} and its opponents, not the whole competition.</p>}
          </Card>

          {/* environment tiles */}
          <Section title="Football environment" description="Per team-match averages for the selected season. Values interpolate as you scrub.">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              {TILES.map((t) => {
                const v = cur?.metrics[t.key] ?? null
                const z = cur?.z[t.key] ?? null
                const pct = t.key === 'pass_completion' || t.key === 'long_ball_share'
                return (
                  <div key={t.key} className="card p-4">
                    <div className="text-[11px] uppercase tracking-wider text-fg-dim">{t.label}</div>
                    <div className="mt-1 text-2xl font-semibold tracking-tight"><AnimatedNumber value={v == null ? null : pct ? v * 100 : v} digits={pct ? 1 : t.digits} suffix={pct ? '%' : ''} /></div>
                    <div className="mt-1 text-[11px] text-fg-dim">{z == null ? '' : `${z >= 0 ? '+' : ''}${fmt(z, 2)} σ vs all seasons`}</div>
                  </div>
                )
              })}
            </div>
          </Section>

          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <Card>
              <CardTitle action={<span className="text-[11px] text-fg-dim">{seasons.length} seasons</span>}>{TILES.find((t) => t.key === metric)?.label} across the timeline</CardTitle>
              <TrendChart data={trend} series={[{ key: 'v', name: TILES.find((t) => t.key === metric)?.label ?? metric, color: '#2fbf71' }]} highlightX={cur ? shortKey(cur) : null} height={260} digits={TILES.find((t) => t.key === metric)?.digits ?? 2} yFormatter={metric === 'pass_completion' || metric === 'long_ball_share' ? (v) => `${(v * 100).toFixed(0)}%` : undefined} />
              <ChartCaption>Each point is a competition-season; the dashed line marks the selected season. Mixed sample types (full leagues, single-team samples, tournaments) sit on the same axis, so read jumps between competitions with care.</ChartCaption>
            </Card>
            <Card>
              <CardTitle>Era clusters</CardTitle>
              <div className="grid gap-2">
                {data.era_clusters.map((c) => (
                  <motion.div key={c.cluster} animate={{ borderColor: c.cluster === cur?.era_cluster ? clusterColor(c.cluster) : 'rgba(255,255,255,0.08)', backgroundColor: c.cluster === cur?.era_cluster ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0)' }} className="rounded-lg border p-3">
                    <div className="flex items-center gap-2 text-sm"><span className="h-2.5 w-2.5 rounded-full" style={{ background: clusterColor(c.cluster) }} /><span className="font-medium">{c.name}</span><span className="ml-auto text-[11px] text-fg-dim">{c.size} seasons</span></div>
                    <div className="mt-1 text-[11px] text-fg-muted">High: {c.high.join(', ') || '—'}{c.low.length ? ` · Low: ${c.low.join(', ')}` : ''}</div>
                  </motion.div>
                ))}
              </div>
              <ChartCaption>Clusters come from {data.pca ? `PCA + ${arch.data ? '' : ''}K-Means / Ward / DBSCAN candidates scored by silhouette and Davies-Bouldin` : 'clustering'} over {Object.keys(data.features).length} standardised season features. Names are generated from each cluster's high and low features. See the ML Lab for the full candidate table.</ChartCaption>
            </Card>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardTitle action={<span className="text-[11px] text-fg-dim">{group === 'all' ? 'all outfield' : group}</span>}>Player archetypes in this season</CardTitle>
              {archMix.length ? (
                <div className="grid gap-2">
                  {archMix.sort((a, b) => b.count - a.count).map((a) => (
                    <div key={a.name} className="grid grid-cols-[150px_1fr_40px] items-center gap-2 text-xs">
                      <span className="truncate text-fg-muted">{a.name}</span>
                      <div className="h-2 rounded-full bg-white/[0.07]"><motion.div className="h-full rounded-full bg-pitch/80" animate={{ width: `${(a.count / archTotal) * 100}%` }} transition={{ duration: 0.6 }} /></div>
                      <span className="num text-right">{a.count}</span>
                    </div>
                  ))}
                </div>
              ) : <div className="text-xs text-fg-dim">No qualifying player-seasons in this season for this group.</div>}
              <ChartCaption>Counts of qualifying player-seasons per archetype. Archetypes are assigned by the within-position clustering model, never by hand.</ChartCaption>
            </Card>
            <Card>
              <CardTitle>Representative players</CardTitle>
              {reps.length ? (
                <div className="grid gap-2">
                  <AnimatePresence initial={false}>
                    {reps.map((r, i) => (
                      <motion.div key={r.player_season_id} layout initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25, delay: i * 0.03 }}>
                        <Link to={`/dna/${r.player_season_id.split('_')[0]}?season=${r.player_season_id}`} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:border-border-strong">
                          <div><div className="font-medium">{r.player}</div><div className="text-[11px] text-fg-dim">{r.position} · {r.team}</div></div>
                          <div className="text-right"><Badge>{r.archetype}</Badge><div className="mt-1 text-[10px] text-fg-dim">coverage {Math.round(r.data_coverage)}</div></div>
                        </Link>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              ) : <div className="text-xs text-fg-dim">No qualifying players in this season for this group.</div>}
              <ChartCaption>The best-covered qualifying player-season per position group in this season — chosen by data coverage and minutes, not reputation.</ChartCaption>
            </Card>
          </div>
          {data.excluded_seasons.length > 0 && <p className="mt-6 text-xs text-fg-dim">Excluded from the era model (fewer than 6 matches): {data.excluded_seasons.join(', ')}.</p>}
        </>
      )}
    </div>
  )
}
