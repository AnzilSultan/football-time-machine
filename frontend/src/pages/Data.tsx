import * as React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ExternalLink } from 'lucide-react'
import { getQuality, getSources, type QualityReport, type Sources } from '@/lib/api'
import { useApi } from '@/hooks/useApi'
import { Badge, Card, CardTitle, Skeleton, Tabs, TabsList, TabsTrigger } from '@/components/ui/primitives'
import { ErrorState, LabelledValue, PageHeader, Section, StatTile } from '@/components/common'
import { SAMPLE_LABEL, cn, fmt } from '@/lib/utils'

const tooltipStyle = { background: '#1c1f24', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 12 }

export default function DataPages() {
  const { tab } = useParams()
  const nav = useNavigate()
  const active = tab === 'sources' ? 'sources' : 'quality'
  return (
    <div>
      <PageHeader eyebrow="Data" title={active === 'quality' ? 'Data quality' : 'Data sources & provenance'} subtitle={active === 'quality' ? 'What is in the master dataset, what was removed, and how well each season and metric is covered. Missing values are reported, never filled.' : 'Every external dataset with its URL, license, retrieval date, upstream commit, purpose and known limitations.'}>
        <Tabs value={active} onValueChange={(v) => nav(`/data/${v}`)}><TabsList><TabsTrigger value="quality">Quality</TabsTrigger><TabsTrigger value="sources">Sources</TabsTrigger></TabsList></Tabs>
      </PageHeader>
      {active === 'quality' ? <Quality /> : <SourcesPage />}
    </div>
  )
}

function Quality() {
  const q = useApi(() => getQuality(), [])
  const d = q.data as QualityReport | null
  const [sortBy, setSortBy] = React.useState<'season' | 'coverage'>('season')
  if (q.error) return <ErrorState error={q.error} onRetry={q.reload} />
  if (!d) return <div className="grid gap-3 md:grid-cols-4"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
  const t = d.totals
  const cov = [...d.coverage_by_season].sort((a, b) => sortBy === 'coverage' ? b.mean_coverage - a.mean_coverage : a.season_key.localeCompare(b.season_key))
  const metricCov = Object.entries(d.coverage_by_metric).sort((a, b) => a[1] - b[1])
  const pmv = d.validation.player_match
  return (
    <>
      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <StatTile label="Players" value={t.players} digits={0} /><StatTile label="Player-seasons" value={t.player_seasons} digits={0} sub={`${fmt(t.qualifying_player_seasons, 0)} qualify by minutes`} />
        <StatTile label="Matches" value={t.matches} digits={0} sub={`${fmt(t.player_matches, 0)} player-match rows`} /><StatTile label="Competitions" value={t.competitions} digits={0} sub={`${t.competition_seasons} competition-seasons`} />
        <StatTile label="Seasons" value={t.seasons} digits={0} sub={`${t.first_season}–${t.last_season + 1}`} /><StatTile label="Teams" value={t.teams} digits={0} />
      </div>
      <div className="mb-8 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardTitle>Validation</CardTitle>
          <div className="grid grid-cols-2 gap-3">
            <LabelledValue label="Duplicates removed"><span className="num">{Object.values(d.duplicates_removed).reduce((a, b) => a + b, 0)}</span></LabelledValue>
            <LabelledValue label="Invalid records removed"><span className="num">{Object.values(d.invalid_records_removed).reduce((a, b) => a + b, 0)}</span></LabelledValue>
            <LabelledValue label="Rows in → out"><span className="num">{fmt(pmv.rows_in, 0)} → {fmt(pmv.rows_out, 0)}</span></LabelledValue>
            <LabelledValue label="Parse errors"><span className="num">{d.parse_errors.length}</span></LabelledValue>
          </div>
          <ul className="mt-3 space-y-1 text-[11px] text-fg-muted">
            {Object.entries(d.validation).flatMap(([tbl, v]) => v.issues.map((i) => <li key={tbl + i.kind}><span className="text-fg">{i.count}</span> {i.kind.replace(/_/g, ' ')} <span className="text-fg-dim">({tbl}{i.detail ? `; ${i.detail}` : ''})</span></li>))}
          </ul>
        </Card>
        <Card>
          <CardTitle>Missing values</CardTitle>
          <div className="text-2xl font-semibold tracking-tight num">{fmt(d.missing_values.total_cells_null, 0)}</div>
          <div className="text-[11px] text-fg-dim">null cells across per-90 metrics, rates and age</div>
          <p className="mt-3 text-xs text-fg-muted">{d.missing_values.note}</p>
          <div className="mt-3 grid gap-1 text-[11px]">
            {Object.entries(d.missing_values.by_metric).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => <div key={k} className="flex justify-between text-fg-muted"><span>{k.replace(/_per90/, '').replace(/_/g, ' ')}</span><span className="num text-fg">{fmt(v, 0)}</span></div>)}
          </div>
        </Card>
        <Card>
          <CardTitle>Dataset version</CardTitle>
          <div className="grid grid-cols-2 gap-3">
            <LabelledValue label="Version"><span className="num">{d.dataset_version}</span></LabelledValue>
            <LabelledValue label="Last update"><span className="num">{new Date(d.generated_at).toLocaleString()}</span></LabelledValue>
            <LabelledValue label="Sample types">{Object.entries(d.sample_types).map(([k, v]) => `${v} ${SAMPLE_LABEL[k] ?? k}`).join(' · ')}</LabelledValue>
          </div>
        </Card>
      </div>
      <Section title="Coverage by metric" description="Share of player-seasons with a non-null value. Age is 0% because StatsBomb open data does not publish dates of birth; rates are null when their denominator is zero.">
        <Card>
          <div style={{ height: 260 }} role="img" aria-label="Bar chart of coverage percentage by metric"><ResponsiveContainer><BarChart data={metricCov.map(([k, v]) => ({ k: k.replace(/_per90/, '').replace(/_/g, ' '), v }))} margin={{ top: 4, right: 8, bottom: 40, left: -12 }}><CartesianGrid vertical={false} strokeDasharray="2 4" /><XAxis dataKey="k" tick={{ fontSize: 9 }} interval={0} angle={-40} textAnchor="end" axisLine={false} tickLine={false} height={60} /><YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={tooltipStyle} formatter={(v: unknown) => [`${v}%`, 'coverage']} /><Bar dataKey="v" fill="#2fbf71" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div>
        </Card>
      </Section>
      <Section title="Coverage by season" description="Mean data-coverage score of player-seasons, qualifying counts and matches. Single-team samples have few qualifying players because opponents appear in only a couple of matches each." action={<Tabs value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}><TabsList><TabsTrigger value="season">By name</TabsTrigger><TabsTrigger value="coverage">By coverage</TabsTrigger></TabsList></Tabs>}>
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[560px] text-xs">
            <thead><tr className="text-left text-[10px] uppercase tracking-wider text-fg-dim"><th className="px-4 py-2">Competition-season</th><th className="px-4 py-2 text-right">Matches</th><th className="px-4 py-2 text-right">Player-seasons</th><th className="px-4 py-2 text-right">Qualifying</th><th className="px-4 py-2 w-48">Mean coverage</th></tr></thead>
            <tbody>{cov.map((r) => (
              <tr key={r.season_key} className="border-t border-border"><td className="px-4 py-1.5">{r.season_key}</td><td className="num px-4 py-1.5 text-right">{r.matches}</td><td className="num px-4 py-1.5 text-right">{r.player_seasons}</td><td className="num px-4 py-1.5 text-right">{r.qualifying}</td>
                <td className="px-4 py-1.5"><div className="flex items-center gap-2"><div className="h-1.5 flex-1 rounded-full bg-white/[0.07]"><div className={cn('h-full rounded-full', r.mean_coverage >= 60 ? 'bg-pitch' : r.mean_coverage >= 40 ? 'bg-gold' : 'bg-danger')} style={{ width: `${r.mean_coverage}%` }} /></div><span className="num w-8 text-right">{fmt(r.mean_coverage, 0)}</span></div></td></tr>
            ))}</tbody>
          </table>
        </Card>
      </Section>
      <Section title="Metric definitions" description="How each count is derived from StatsBomb events. Full detail in METHODOLOGY.md.">
        <Card><div className="grid gap-2 md:grid-cols-2">{Object.entries(d.metric_definitions).map(([k, v]) => <div key={k} className="text-[11px]"><span className="font-mono text-fg">{k}</span> <span className="text-fg-muted">— {v}</span></div>)}</div></Card>
      </Section>
    </>
  )
}

function SourcesPage() {
  const s = useApi(() => getSources(), [])
  const d = s.data as Sources | null
  if (s.error) return <ErrorState error={s.error} onRetry={s.reload} />
  if (!d) return <Skeleton className="h-64" />
  const acq = d.acquisition
  return (
    <>
      {d.sources.map((src) => (
        <Card key={src.id} className="mb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="text-lg font-semibold">{src.name}</h2><a href={src.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-pitch hover:underline">{src.url} <ExternalLink className="h-3 w-3" /></a></div>
            <Badge tone="gold">primary source</Badge>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <LabelledValue label="License">{src.license} <a href={src.license_url} className="text-pitch hover:underline" target="_blank" rel="noreferrer">(text)</a></LabelledValue>
            <LabelledValue label="Retrieval date"><span className="num">{acq?.retrieved_at ? new Date(acq.retrieved_at).toLocaleString() : d.dataset_version.retrieved_at}</span></LabelledValue>
            <LabelledValue label="Version / commit"><span className="num break-all">{acq?.upstream_commit ?? d.dataset_version.source_commit ?? 'unknown'}</span></LabelledValue>
            <LabelledValue label="Scope">{d.dataset_version.scope} · {acq?.matches} matches · {acq?.files_downloaded} files downloaded, {acq?.files_from_cache} cached{acq?.failures.length ? ` · ${acq.failures.length} failures` : ''}</LabelledValue>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div><div className="eyebrow mb-1.5">Purpose</div><p className="text-xs text-fg-muted">{src.purpose}</p></div>
            <div><div className="eyebrow mb-1.5">Metrics obtained</div><ul className="list-disc space-y-0.5 pl-4 text-xs text-fg-muted">{src.metrics_obtained.map((m) => <li key={m}>{m}</li>)}</ul></div>
            <div><div className="eyebrow mb-1.5">Known limitations</div><ul className="list-disc space-y-0.5 pl-4 text-xs text-fg-muted">{src.known_limitations.map((m) => <li key={m}>{m}</li>)}</ul></div>
          </div>
        </Card>
      ))}
      <Section title="Competition-seasons in the dataset" description="Sample type tells you what a season actually contains. Single-team samples describe one club and its opponents, not the league.">
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-xs">
            <thead><tr className="text-left text-[10px] uppercase tracking-wider text-fg-dim"><th className="px-4 py-2">Competition</th><th className="px-4 py-2">Season</th><th className="px-4 py-2 text-right">Matches</th><th className="px-4 py-2 text-right">Teams</th><th className="px-4 py-2">Sample</th><th className="px-4 py-2 text-right">Qualifying players</th><th className="px-4 py-2">Dates</th></tr></thead>
            <tbody>{d.competition_seasons.map((c) => (
              <tr key={c.season_key} className="border-t border-border"><td className="px-4 py-1.5">{c.competition_name}</td><td className="num px-4 py-1.5">{c.season}</td><td className="num px-4 py-1.5 text-right">{c.matches}</td><td className="num px-4 py-1.5 text-right">{c.teams}</td>
                <td className="px-4 py-1.5"><Badge tone={c.sample_type === 'full_season' ? 'green' : c.sample_type === 'tournament' ? 'blue' : 'gold'}>{SAMPLE_LABEL[c.sample_type]}{c.sample_type === 'single_team_centric' ? ` · ${c.dominant_team}` : ''}</Badge></td>
                <td className="num px-4 py-1.5 text-right">{c.qualifying_player_seasons}</td><td className="num px-4 py-1.5 text-fg-dim">{c.first_match} → {c.last_match}</td></tr>
            ))}</tbody>
          </table>
        </Card>
      </Section>
      <p className="text-xs text-fg-dim">Dataset v{d.dataset_version.dataset_version} · content hash {d.dataset_version.content_hash} · built {new Date(d.dataset_version.built_at).toLocaleString()}. See DATA_SOURCES.md, LICENSES.md and LIMITATIONS.md in the repository.</p>
    </>
  )
}
