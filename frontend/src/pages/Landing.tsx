import * as React from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion'
import { ArrowRight, Dna, Hourglass, Map, Database, FlaskConical, Scale } from 'lucide-react'
import { getStatus, getTimeMachine, getArchetypes, type TimeMachine, type Archetype } from '@/lib/api'
import { useApi } from '@/hooks/useApi'
import { AnimatedNumber } from '@/components/common'
import { Reveal, Skeleton } from '@/components/ui/primitives'
import { fmt } from '@/lib/utils'
import * as d3 from 'd3'

/** Hero: real season-level trends drawn as flowing lines (passes per team-match & pressures), ordered by year. */
function HeroTimeline({ tm }: { tm: TimeMachine | null }) {
  const reduce = useReducedMotion()
  const W = 1200, H = 360
  // one point per season-start year: mean of the competition-seasons in that year (keeps the hero readable)
  const rows = React.useMemo(() => {
    if (!tm) return []
    const keep = tm.seasons.filter((s) => s.sample_type !== 'single_team_centric' || s.matches >= 25)
    const byYear = d3.group(keep, (s) => s.year)
    return Array.from(byYear, ([year, list]) => ({
      year,
      n: list.length,
      metrics: Object.fromEntries(Object.keys(list[0].metrics).map((k) => [k, d3.mean(list, (s) => s.metrics[k] ?? NaN) ?? null])),
    })).sort((a, b) => a.year - b.year)
  }, [tm])
  const series = [
    { key: 'passes_per_team_match', color: 'var(--color-pitch)', label: 'Passes per team-match' },
    { key: 'pressures_per_team_match', color: 'var(--color-gold)', label: 'Pressures per team-match' },
    { key: 'goals_per_match', color: 'rgba(255,255,255,0.55)', label: 'Goals per match' },
  ]
  const x = d3.scaleLinear().domain([d3.min(rows, (r) => r.year) ?? 2003, d3.max(rows, (r) => r.year) ?? 2024]).range([40, W - 40])
  const paths = series.map((s) => {
    const vals = rows.map((r) => r.metrics[s.key]).filter((v): v is number => v != null)
    const y = d3.scaleLinear().domain([d3.min(vals) ?? 0, d3.max(vals) ?? 1]).range([H - 50, 40])
    const line = d3.line<typeof rows[number]>().defined((r) => r.metrics[s.key] != null).x((r) => x(r.year)).y((r) => y(r.metrics[s.key] as number)).curve(d3.curveMonotoneX)
    return { ...s, d: line(rows) ?? '', pts: rows.map((r) => ({ cx: x(r.year), cy: r.metrics[s.key] != null ? y(r.metrics[s.key] as number) : null })) }
  })
  const years = Array.from(new Set(rows.map((r) => r.year))).filter((y) => y % 3 === 0 || y === rows[0]?.year)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Animated timeline of passes, pressures and goals per match across the seasons in the dataset">
      {years.map((yr) => (
        <g key={yr}>
          <line x1={x(yr)} x2={x(yr)} y1={30} y2={H - 40} stroke="rgba(255,255,255,0.06)" />
          <text x={x(yr)} y={H - 18} textAnchor="middle" fill="#6f736e" fontSize={12} fontFamily="JetBrains Mono, monospace">{yr}</text>
        </g>
      ))}
      {paths.map((p, i) => (
        <g key={p.key}>
          <motion.path d={p.d} fill="none" stroke={p.color} strokeWidth={i === 2 ? 1.2 : 2} strokeLinecap="round"
            initial={reduce ? false : { pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: 2.2, delay: 0.3 + i * 0.35, ease: 'easeInOut' }} />
          {p.pts.map((pt, j) => pt.cy != null && (
            <motion.circle key={j} cx={pt.cx} cy={pt.cy} r={2.4} fill={p.color} initial={reduce ? false : { opacity: 0, scale: 0 }} animate={{ opacity: 0.9, scale: 1 }} transition={{ delay: 0.6 + i * 0.35 + j * 0.03, duration: 0.3 }} />
          ))}
        </g>
      ))}
      <g fontSize={11} fill="#a3a6a1">
        {paths.map((p, i) => (
          <g key={p.key} transform={`translate(${44 + i * 210}, 22)`}><rect width={10} height={3} y={-2} fill={p.color} /><text x={16} y={2}>{p.label}</text></g>
        ))}
      </g>
    </svg>
  )
}

const FEATURES = [
  { to: '/era-translator', icon: Hourglass, eyebrow: 'Era Translator', title: 'What if Messi played today?', text: 'Quantile-map a historical season into a modern population, with the reference pools, confidence and data coverage in plain sight.', tone: 'gold' },
  { to: '/dna', icon: Dna, eyebrow: 'Player DNA', title: 'Who actually plays like this player?', text: 'Ten-dimension statistical fingerprints, validated nearest-neighbour similarity and data-derived archetypes, every score explained.', tone: 'green' },
  { to: '/time-machine', icon: Map, eyebrow: 'Era Explorer', title: 'How has football changed?', text: 'Travel season by season through passing, pressing, scoring and roles, with PCA and clustering over season-level aggregates.', tone: 'blue' },
]

export default function Landing() {
  const status = useApi(() => getStatus(), [])
  const tm = useApi(() => getTimeMachine(), [])
  const arch = useApi(() => getArchetypes(), [])
  const { scrollY } = useScroll()
  const heroY = useTransform(scrollY, [0, 500], [0, 60])
  const heroOpacity = useTransform(scrollY, [0, 400], [1, 0.35])
  const t = status.data?.totals
  return (
    <div className="-mt-8 md:-mt-10">
      <section className="relative overflow-hidden pt-14 md:pt-24" aria-labelledby="hero-title">
        <div className="pitch-lines pointer-events-none absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_75%)]" aria-hidden="true" />
        <motion.div style={{ y: heroY, opacity: heroOpacity }} className="relative">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.25, 1, 0.5, 1] }} className="mx-auto max-w-3xl text-center">
            <div className="eyebrow mb-4">Understanding footballers, playing styles and football eras with machine learning</div>
            <h1 id="hero-title" className="display text-5xl leading-[0.95] md:text-7xl">FOOTBALL<br />TIME MACHINE</h1>
            <p className="mx-auto mt-6 max-w-xl text-base text-fg-muted md:text-lg">Machine learning the evolution of the beautiful game.</p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link to="/era-translator" className="inline-flex h-11 items-center gap-2 rounded-lg bg-pitch px-5 text-sm font-medium text-black transition-colors hover:bg-[#3fd182]">Translate Messi 2011/12 <ArrowRight className="h-4 w-4" /></Link>
              <Link to="/time-machine" className="inline-flex h-11 items-center gap-2 rounded-lg border border-border px-5 text-sm text-fg transition-colors hover:border-border-strong">Enter the time machine</Link>
            </div>
          </motion.div>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2, duration: 0.8 }} className="mx-auto mt-10 max-w-6xl md:mt-14">
            {tm.data ? <HeroTimeline tm={tm.data} /> : <Skeleton className="aspect-[10/3] w-full" />}
            <p className="mt-2 text-center text-[11px] text-fg-dim">Real season-level aggregates from StatsBomb open data, averaged per season-start year across the competitions in the dataset. Single-team samples with fewer than 25 matches are omitted from this hero view.</p>
          </motion.div>
        </motion.div>
      </section>

      <section className="mx-auto mt-16 grid max-w-5xl grid-cols-2 gap-3 md:grid-cols-4" aria-label="Dataset scale">
        {[
          { label: 'Players', v: t?.players, d: 0 }, { label: 'Player-seasons', v: t?.player_seasons, d: 0 },
          { label: 'Matches parsed', v: t?.matches, d: 0 }, { label: 'Competition-seasons', v: t?.competition_seasons, d: 0 },
        ].map((s, i) => (
          <Reveal key={s.label} delay={i * 0.06}>
            <div className="card p-4 text-center">
              <div className="text-2xl font-semibold tracking-tight md:text-3xl"><AnimatedNumber value={s.v ?? null} digits={s.d} /></div>
              <div className="mt-1 text-[11px] uppercase tracking-wider text-fg-dim">{s.label}</div>
            </div>
          </Reveal>
        ))}
      </section>

      <section className="mx-auto mt-20 max-w-6xl" aria-labelledby="modes-title">
        <Reveal><div className="eyebrow mb-2 text-center">Three modes · one dataset · one model stack</div><h2 id="modes-title" className="display mb-8 text-center text-3xl md:text-4xl">Choose how to travel</h2></Reveal>
        <div className="grid gap-4 md:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Reveal key={f.to} delay={i * 0.08}>
              <Link to={f.to} className="card card-hover group flex h-full flex-col p-6">
                <f.icon className={`h-6 w-6 ${f.tone === 'gold' ? 'text-gold' : f.tone === 'green' ? 'text-pitch' : 'text-info'}`} />
                <div className="eyebrow mt-5">{f.eyebrow}</div>
                <h3 className="mt-2 text-xl font-semibold tracking-tight">{f.title}</h3>
                <p className="mt-2 flex-1 text-sm text-fg-muted">{f.text}</p>
                <span className="mt-5 inline-flex items-center gap-1 text-sm text-fg-muted transition-colors group-hover:text-fg">Open <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></span>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-24 max-w-6xl" aria-labelledby="built-title">
        <Reveal>
          <div className="eyebrow mb-2">Built using real football data and machine learning</div>
          <h2 id="built-title" className="display text-3xl md:text-4xl">Statistics are not timeless.</h2>
          <p className="mt-3 max-w-2xl text-fg-muted">A number means something different depending on era, position, competition, tactical environment and data availability. Every figure in this product is either sourced from StatsBomb events, calculated from them with a documented definition, produced by a model whose validation you can inspect, or labelled as a hypothetical comparison.</p>
        </Reveal>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            { icon: Database, title: 'Sourced', text: `${status.data ? fmt(status.data.totals.matches, 0) : '…'} matches of event data fetched automatically from the public StatsBomb repository, with commit, license and retrieval date recorded.`, to: '/data/sources' },
            { icon: Scale, title: 'Calculated', text: 'Per-90 rates, percentiles within position groups, coverage and comparability scores. Nulls stay null. Age is not in the data, so it is never shown.', to: '/data/quality' },
            { icon: FlaskConical, title: 'Modelled', text: `PCA, K-Means, Ward and DBSCAN candidates scored by silhouette and Davies-Bouldin; similarity space chosen by self-retrieval. ${arch.data ? arch.data.archetypes.length + ' archetypes discovered.' : ''}`, to: '/ml-lab' },
          ].map((c, i) => (
            <Reveal key={c.title} delay={i * 0.08}>
              <Link to={c.to} className="card card-hover block h-full p-6">
                <c.icon className="h-5 w-5 text-fg-muted" />
                <h3 className="mt-4 font-semibold">{c.title}</h3>
                <p className="mt-2 text-sm text-fg-muted">{c.text}</p>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {arch.data && (
        <section className="mx-auto mt-24 max-w-6xl" aria-labelledby="arch-title">
          <Reveal><div className="eyebrow mb-2">Discovered from the data</div><h2 id="arch-title" className="display text-3xl">Player archetypes</h2>
            <p className="mt-2 max-w-2xl text-sm text-fg-muted">Clusters are found separately within each position group, then named by matching each centroid's position-relative profile to a signature lexicon. Representatives are the seasons closest to each centroid.</p></Reveal>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {arch.data.archetypes.map((a: Archetype, i) => (
              <Reveal key={a.cluster} delay={(i % 3) * 0.06}>
                <Link to={`/era-map?cluster=${a.cluster}`} className="card card-hover block h-full p-5">
                  <div className="flex items-center justify-between"><h3 className="font-semibold">{a.name}</h3><span className="text-[11px] text-fg-dim">{a.position_group} · {a.size}</span></div>
                  <p className="mt-1 text-xs text-fg-muted">{a.description}</p>
                  <div className="mt-3 flex flex-wrap gap-1">{a.representatives.slice(0, 3).map((r) => <span key={r.player_season_id} className="rounded bg-white/[0.05] px-2 py-0.5 text-[11px] text-fg-muted">{r.player} · {r.season_key.replace(/.*?(\d{4}.*)/, '$1')}</span>)}</div>
                </Link>
              </Reveal>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
