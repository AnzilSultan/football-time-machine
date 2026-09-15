import * as React from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Search, X } from 'lucide-react'
import { getEraMap, type EraMap as EraMapT, type MapPoint } from '@/lib/api'
import { useApi, useDebounce } from '@/hooks/useApi'
import { Badge, Card, CardTitle, Select, Skeleton, Tabs, TabsList, TabsTrigger, Slider } from '@/components/ui/primitives'
import { ChartCaption, CoverageBar, ErrorState, LabelledValue, PageHeader } from '@/components/common'
import { ScatterMap } from '@/components/charts/ScatterMap'
import { ERA_COLORS, GROUP_LABEL, SAMPLE_LABEL, clusterColor, fmt } from '@/lib/utils'

export default function EraMap() {
  const [params] = useSearchParams()
  const [unit, setUnit] = React.useState<'players' | 'seasons'>('players')
  const [group, setGroup] = React.useState('all')
  const [era, setEra] = React.useState('all')
  const [cluster, setCluster] = React.useState(params.get('cluster') ?? 'all')
  const [colorBy, setColorBy] = React.useState<'cluster' | 'era' | 'group'>('cluster')
  const [minCov, setMinCov] = React.useState(0)
  const [q, setQ] = React.useState(params.get('team') ?? '')
  const dq = useDebounce(q, 150).toLowerCase()
  const [selected, setSelected] = React.useState<MapPoint | null>(null)
  const [hover, setHover] = React.useState<MapPoint | null>(null)
  const map = useApi(() => getEraMap(unit), [unit])
  const data = map.data as EraMapT | null

  const points = React.useMemo(() => {
    if (!data) return []
    return data.points.filter((p) => (group === 'all' || p.position_group === group) && (era === 'all' || p.era === era) && (cluster === 'all' || String(p.cluster) === cluster) && ((p.coverage ?? 100) >= minCov))
  }, [data, group, era, cluster, minCov])
  const matches = React.useCallback((p: MapPoint) => !!dq && (p.label.toLowerCase().includes(dq) || (p.team ?? '').toLowerCase().includes(dq) || (p.season_key ?? '').toLowerCase().includes(dq)), [dq])
  const dimmed = React.useCallback((p: MapPoint) => !!dq && !matches(p), [dq, matches])
  const labelled = React.useCallback((p: MapPoint) => (unit === 'seasons') || (!!dq && matches(p) && points.filter(matches).length <= 40), [unit, dq, matches, points])
  const colorOf = React.useCallback((p: MapPoint) => colorBy === 'era' ? (ERA_COLORS[p.era] ?? '#888') : colorBy === 'group' ? ({ DF: '#6aa8ff', MF: '#2fbf71', AM: '#d5b467', FW: '#e5745b' }[p.position_group ?? ''] ?? '#888') : clusterColor(p.cluster), [colorBy])
  const eras = Array.from(new Set(data?.points.map((p) => p.era) ?? []))
  const active = hover ?? selected

  return (
    <div>
      <PageHeader eyebrow="Era Map" title="The football space, projected" subtitle="Principal-component projection of every modelled player-season (or every competition-season). Points move when filters change; click one to inspect it.">
        <Tabs value={unit} onValueChange={(v) => { setUnit(v as 'players' | 'seasons'); setSelected(null); setCluster('all') }}><TabsList><TabsTrigger value="players">Players</TabsTrigger><TabsTrigger value="seasons">Seasons</TabsTrigger></TabsList></Tabs>
      </PageHeader>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <div className="relative sm:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-dim" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={unit === 'players' ? 'Highlight player, team or season…' : 'Highlight season…'} aria-label="Highlight points" className="h-10 w-full rounded-lg border border-border bg-surface pl-9 pr-8 text-sm outline-none placeholder:text-fg-dim focus:border-border-strong" />
          {q && <button aria-label="Clear" onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-dim hover:text-fg"><X className="h-3.5 w-3.5" /></button>}
        </div>
        {unit === 'players' && <Select ariaLabel="Position group" value={group} onValueChange={setGroup} options={[{ value: 'all', label: 'All positions' }, ...Object.entries(GROUP_LABEL).filter(([k]) => k !== 'GK').map(([k, v]) => ({ value: k, label: v }))]} />}
        <Select ariaLabel="Era" value={era} onValueChange={setEra} options={[{ value: 'all', label: 'All eras' }, ...eras.map((e) => ({ value: e, label: e }))]} />
        <Select ariaLabel={unit === 'players' ? 'Archetype' : 'Era cluster'} value={cluster} onValueChange={setCluster} options={[{ value: 'all', label: unit === 'players' ? 'All archetypes' : 'All era clusters' }, ...(data?.clusters ?? []).map((c) => ({ value: String(c.cluster), label: c.name }))]} />
        <Select ariaLabel="Colour by" value={colorBy} onValueChange={(v) => setColorBy(v as typeof colorBy)} options={[{ value: 'cluster', label: unit === 'players' ? 'Colour: archetype' : 'Colour: era cluster' }, { value: 'era', label: 'Colour: era' }, ...(unit === 'players' ? [{ value: 'group', label: 'Colour: position group' }] : [])]} />
      </div>
      {unit === 'players' && (
        <div className="mb-4 flex items-center gap-3 text-xs text-fg-muted"><span className="w-40 shrink-0">Min. data coverage: <span className="num text-fg">{minCov}</span></span><Slider className="max-w-xs flex-1" value={minCov} onValueChange={setMinCov} min={0} max={100} step={5} ariaLabel="Minimum data coverage" /></div>
      )}
      {map.error && <ErrorState error={map.error} onRetry={map.reload} />}
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card className="p-2">
          {data ? <ScatterMap points={points} colorOf={colorOf} dimmed={dq ? dimmed : undefined} labelled={labelled} highlightId={selected?.id ?? null} onSelect={setSelected} onHover={setHover} radius={unit === 'seasons' ? 7 : 3.5} height={560}
            axisLabels={[`PC1 (${Math.round((data.explained_variance?.[0] ?? 0) * 100)}% of variance)`, `PC2 (${Math.round((data.explained_variance?.[1] ?? 0) * 100)}%)`]} /> : <Skeleton className="h-[560px]" />}
          <div className="flex flex-wrap items-center justify-between gap-2 px-2 pt-2 text-[11px] text-fg-dim">
            <span>{points.length} of {data?.points.length ?? 0} points shown</span>
            <div className="flex flex-wrap gap-2">
              {colorBy === 'cluster' && data?.clusters.map((c) => <button key={c.cluster} onClick={() => setCluster(String(c.cluster) === cluster ? 'all' : String(c.cluster))} className="flex items-center gap-1 hover:text-fg"><span className="h-2 w-2 rounded-full" style={{ background: clusterColor(c.cluster) }} />{c.name}</button>)}
              {colorBy === 'era' && eras.map((e) => <span key={e} className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: ERA_COLORS[e] }} />{e}</span>)}
              {colorBy === 'group' && Object.entries({ DF: 'Defenders', MF: 'Midfielders', AM: 'Att. mids & wingers', FW: 'Forwards' }).map(([k, v]) => <span key={k} className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: { DF: '#6aa8ff', MF: '#2fbf71', AM: '#d5b467', FW: '#e5745b' }[k] }} />{v}</span>)}
            </div>
          </div>
          <ChartCaption>{unit === 'players' ? `Axes are the first two principal components of ${data?.loadings ? Object.keys(data.loadings.pc1).length : ''} standardised per-90 features. Nearby points have similar statistical profiles; distance along PC1 mostly separates attacking from defensive output.` : 'Each point is a competition-season projected from standardised season features. Cluster colours match the Time Machine era clusters.'}</ChartCaption>
        </Card>
        <div>
          <AnimatePresence mode="wait">
            {active ? (
              <motion.div key={active.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                <Card>
                  <CardTitle action={selected && <button aria-label="Close" onClick={() => setSelected(null)} className="text-fg-dim hover:text-fg"><X className="h-4 w-4" /></button>}>{active.label}</CardTitle>
                  <div className="grid grid-cols-2 gap-3">
                    {unit === 'players' ? (
                      <>
                        <LabelledValue label="Season">{active.season_key}</LabelledValue><LabelledValue label="Team">{active.team}</LabelledValue>
                        <LabelledValue label="Position">{active.position} · {active.position_group}</LabelledValue><LabelledValue label="Era">{active.era}</LabelledValue>
                        <LabelledValue label="Archetype (cluster)"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: clusterColor(active.cluster) }} />{active.archetype}</span></LabelledValue>
                        <LabelledValue label="Minutes">{fmt(active.minutes, 0)}</LabelledValue>
                      </>
                    ) : (
                      <>
                        <LabelledValue label="Year">{active.year}</LabelledValue><LabelledValue label="Era">{active.era}</LabelledValue>
                        <LabelledValue label="Sample">{SAMPLE_LABEL[active.sample_type ?? ''] ?? active.sample_type}</LabelledValue><LabelledValue label="Matches">{active.matches}</LabelledValue>
                        <LabelledValue label="Era cluster"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: clusterColor(active.cluster) }} />{data?.clusters.find((c) => c.cluster === active.cluster)?.name}</span></LabelledValue>
                      </>
                    )}
                    <LabelledValue label="PCA"><span className="num">{fmt(active.x, 2)}, {fmt(active.y, 2)}</span></LabelledValue>
                  </div>
                  {unit === 'players' && (
                    <>
                      <div className="mt-4"><div className="mb-1 flex justify-between text-[11px] text-fg-dim"><span>Data coverage</span><span className="num">{fmt(active.coverage, 0)}</span></div><CoverageBar value={active.coverage} /></div>
                      <div className="mt-4"><div className="eyebrow mb-2">Top DNA features</div><div className="flex flex-wrap gap-1.5">{active.top?.map(([l, v]) => <Badge key={l} tone="green">{l} · {Math.round(v)}th</Badge>)}</div></div>
                      <Link to={`/dna/${active.player_id}?season=${active.id}`} className="mt-4 inline-block text-xs text-pitch hover:underline">Open Player DNA →</Link>
                    </>
                  )}
                  {unit === 'seasons' && <Link to={`/time-machine?season=${encodeURIComponent(active.id)}`} className="mt-4 inline-block text-xs text-pitch hover:underline">Open in Time Machine →</Link>}
                </Card>
              </motion.div>
            ) : (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <Card><CardTitle>Inspect a point</CardTitle><p className="text-xs text-fg-muted">Hover to preview, click to pin. Use the search box to highlight players, teams or seasons; scroll to zoom and drag to pan.</p>
                  {data?.loadings && (
                    <div className="mt-4"><div className="eyebrow mb-2">PC1 loadings (top)</div>
                      {Object.entries(data.loadings.pc1).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 6).map(([k, v]) => <div key={k} className="flex justify-between text-[11px] text-fg-muted"><span>{k.replace(/_per90/, '').replace(/_/g, ' ')}</span><span className="num text-fg">{v >= 0 ? '+' : ''}{fmt(v, 2)}</span></div>)}
                    </div>
                  )}
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
