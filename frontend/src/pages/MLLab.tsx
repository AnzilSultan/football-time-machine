import { Bar, BarChart, CartesianGrid, Line, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { getModels, type ClusterCandidate, type ModelMeta } from '@/lib/api'
import { useApi } from '@/hooks/useApi'
import { Badge, Card, CardTitle, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/primitives'
import { ChartCaption, ErrorState, LabelledValue, PageHeader, Section, StatTile } from '@/components/common'
import { cn, fmt } from '@/lib/utils'

const tooltipStyle = { background: '#1c1f24', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 12 }

function CandidateTable({ rows, selectedId }: { rows: ClusterCandidate[]; selectedId: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-xs">
        <thead><tr className="text-left text-[10px] uppercase tracking-wider text-fg-dim"><th className="px-3 py-2">Candidate</th><th className="px-3 py-2">k</th><th className="px-3 py-2 text-right">Silhouette ↑</th><th className="px-3 py-2 text-right">Davies-Bouldin ↓</th><th className="px-3 py-2 text-right">Calinski-Harabasz ↑</th><th className="px-3 py-2">Cluster sizes</th><th className="px-3 py-2">Noise</th><th className="px-3 py-2">Eligible</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={cn('border-t border-border', r.id === selectedId && 'bg-pitch-soft text-fg', !r.eligible && 'text-fg-dim')}>
              <td className="px-3 py-1.5 font-mono">{r.algorithm} <span className="text-fg-dim">{Object.entries(r.params).map(([k, v]) => `${k}=${v}`).join(' ')}</span>{r.id === selectedId && <Badge tone="green" className="ml-2">selected</Badge>}</td>
              <td className="num px-3 py-1.5">{r.k}</td><td className="num px-3 py-1.5 text-right">{r.silhouette == null ? '—' : fmt(r.silhouette, 3)}</td><td className="num px-3 py-1.5 text-right">{r.davies_bouldin == null ? '—' : fmt(r.davies_bouldin, 3)}</td><td className="num px-3 py-1.5 text-right">{r.calinski_harabasz == null ? '—' : fmt(r.calinski_harabasz, 0)}</td>
              <td className="num px-3 py-1.5">{r.sizes.join(' / ')}</td><td className="num px-3 py-1.5">{r.noise}</td><td className="px-3 py-1.5">{r.eligible ? 'yes' : 'no'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function MLLab() {
  const models = useApi(() => getModels(), [])
  const m = models.data as ModelMeta | null
  if (models.error) return <ErrorState error={models.error} onRetry={models.reload} />
  if (!m) return <div className="grid gap-4"><Skeleton className="h-10 w-72" /><Skeleton className="h-64" /></div>
  const pcaRows = m.pca.explained_variance_ratio.map((v, i) => ({ pc: `PC${i + 1}`, variance: +(v * 100).toFixed(2), cumulative: +(m.pca.cumulative_variance[i] * 100).toFixed(1) }))
  const tmRows = m.time_machine.pca.explained_variance_ratio.map((v, i) => ({ pc: `PC${i + 1}`, variance: +(v * 100).toFixed(2) }))
  return (
    <div>
      <PageHeader eyebrow="ML Lab" title="How every result is produced" subtitle="The full methodology with the numbers that actually came out of training: population, features, preprocessing, PCA, clustering candidates, similarity validation and reproducibility metadata.">
        <Badge tone="outline">model v{m.model_version}</Badge><Badge tone="outline">features v{m.feature_version}</Badge><Badge tone="outline">dataset v{m.dataset_version}</Badge><Badge tone="outline">seed {m.random_seed}</Badge>
      </PageHeader>

      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Modelled player-seasons" value={m.population.player_seasons} digits={0} sub={`of ${fmt(m.population.all_player_seasons, 0)} in the dataset`} />
        <StatTile label="Players modelled" value={m.population.players} digits={0} />
        <StatTile label="Model features" value={m.features.n_features} digits={0} sub="per-90 rates & ratios" />
        <StatTile label="Training time" value={m.training_seconds} digits={0} suffix="s" sub={new Date(m.trained_at).toLocaleString()} />
      </div>

      <Section title="1 · Population & preprocessing" description={m.population.rule}>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardTitle>Feature engineering</CardTitle>
            <p className="mb-3 text-xs text-fg-muted">{m.features.n_features} per-90 / rate features computed from StatsBomb events, winsorised at the {m.features.winsorize.quantiles.map((q) => `${q * 100}%`).join(' / ')} quantiles and scaled with {m.features.scaling}. Ten DNA dimensions are means of member z-scores:</p>
            <div className="grid gap-1.5">
              {Object.entries(m.features.dna_dimensions).map(([k, members]) => <div key={k} className="grid grid-cols-[150px_1fr] gap-2 text-xs"><span className="text-fg">{m.features.dimension_labels[k]}</span><span className="text-fg-dim">{members.map((x) => x.replace(/_per90/, '').replace(/_/g, ' ')).join(', ')}</span></div>)}
            </div>
          </Card>
          <Card>
            <CardTitle>Exclusions (never imputed)</CardTitle>
            <div className="grid grid-cols-2 gap-3">
              <LabelledValue label="Qualify by minutes">{fmt(m.population.qualifying_by_minutes, 0)}</LabelledValue>
              <LabelledValue label="Goalkeepers excluded">{fmt(m.population.excluded_goalkeepers, 0)}</LabelledValue>
              <LabelledValue label="Below threshold">{fmt(m.population.all_player_seasons - m.population.qualifying_by_minutes, 0)}</LabelledValue>
              <LabelledValue label="Incomplete feature rows">{fmt(m.population.qualifying_by_minutes - m.population.excluded_goalkeepers - m.population.player_seasons, 0)}</LabelledValue>
            </div>
            <ChartCaption>Thresholds: 900 minutes for league seasons, 270 for tournaments. Rows with any missing feature value (for example a rate with zero attempts) are excluded from modelling rather than filled in.</ChartCaption>
          </Card>
        </div>
      </Section>

      <Section title="2 · PCA" description={`${m.pca.n_components_90pct} components are retained for clustering and one similarity candidate (≥ 90% variance). PC1 + PC2 (${Math.round(m.pca.cumulative_variance[1] * 100)}%) draw the Era Map.`}>
        <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
          <Card>
            <CardTitle>Explained variance per component</CardTitle>
            <div style={{ height: 240 }} role="img" aria-label="Bar chart of explained variance per principal component with cumulative line">
              <ResponsiveContainer><ComposedChart data={pcaRows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid vertical={false} strokeDasharray="2 4" /><XAxis dataKey="pc" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis yAxisId="l" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} unit="%" /><YAxis yAxisId="r" orientation="right" domain={[0, 100]} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} unit="%" />
                <Tooltip contentStyle={tooltipStyle} /><Bar yAxisId="l" dataKey="variance" name="Variance %" fill="#2fbf71" radius={[4, 4, 0, 0]} /><Line yAxisId="r" dataKey="cumulative" name="Cumulative %" stroke="#d5b467" strokeWidth={2} dot={false} />
              </ComposedChart></ResponsiveContainer>
            </div>
            <ChartCaption>Green bars: variance explained by each component. Gold line: cumulative share.</ChartCaption>
          </Card>
          <Card>
            <CardTitle>Loadings</CardTitle>
            {(['pc1', 'pc2'] as const).map((pc) => (
              <div key={pc} className="mb-3"><div className="eyebrow mb-1">{pc.toUpperCase()}</div>
                {Object.entries(m.pca.loadings[pc]).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1])).slice(0, 6).map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[1fr_60px_50px] items-center gap-2 text-[11px]"><span className="truncate text-fg-muted">{k.replace(/_per90/, '').replace(/_/g, ' ')}</span>
                    <div className="h-1.5 rounded-full bg-white/[0.07]"><div className={cn('h-full rounded-full', v >= 0 ? 'bg-pitch' : 'bg-danger')} style={{ width: `${Math.min(100, Math.abs(v) * 250)}%` }} /></div><span className="num text-right">{v >= 0 ? '+' : ''}{fmt(v, 2)}</span></div>
                ))}
              </div>
            ))}
          </Card>
        </div>
      </Section>

      <Section title="3 · Clustering & archetypes" description={m.clustering.stage_note ?? m.clustering.selection_rule}>
        <Card>
          <Tabs defaultValue="global">
            <TabsList className="mb-4 flex-wrap"><TabsTrigger value="global">Global ({m.clustering.space})</TabsTrigger>{Object.keys(m.clustering.by_position_group ?? {}).map((g) => <TabsTrigger key={g} value={g}>{g} · {m.clustering.by_position_group![g].n}</TabsTrigger>)}</TabsList>
            <TabsContent value="global"><CandidateTable rows={m.clustering.candidates} selectedId={m.clustering.selected.id} /><ChartCaption>Rule: {m.clustering.selection_rule}. Position mix of the selected global clusters: {Object.entries(m.clustering.global_position_mix ?? {}).map(([c, mix]) => `#${c} ${Object.entries(mix).filter(([, v]) => v >= 0.1).map(([g, v]) => `${g} ${Math.round(v * 100)}%`).join('/')}`).join(' · ')}.</ChartCaption></TabsContent>
            {Object.entries(m.clustering.by_position_group ?? {}).map(([g, rep]) => <TabsContent key={g} value={g}><CandidateTable rows={rep.candidates} selectedId={rep.selected.id} /><ChartCaption>{rep.n} player-seasons, {rep.pca_components_90pct} PCA components. k ∈ 2..6 by silhouette (min cluster share 8%).</ChartCaption></TabsContent>)}
          </Tabs>
        </Card>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {m.clustering.archetypes.map((a) => (
            <Card key={a.cluster} className="p-4">
              <div className="flex items-start justify-between"><div><div className="font-semibold">{a.name}</div><div className="text-[11px] text-fg-dim">{a.position_group} · {a.size} seasons · match {fmt(a.match_score, 2)}</div></div><Badge tone="outline">#{a.cluster}</Badge></div>
              <p className="mt-1.5 text-xs text-fg-muted">{a.description}</p>
              <div className="mt-3 grid gap-1">
                {Object.entries(a.centroid).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1])).slice(0, 5).map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[110px_1fr_40px] items-center gap-2 text-[11px]"><span className="truncate text-fg-muted">{m.features.dimension_labels[k]}</span>
                    <div className="relative h-1.5 rounded-full bg-white/[0.07]"><div className={cn('absolute top-0 h-full rounded-full', v >= 0 ? 'left-1/2 bg-pitch' : 'right-1/2 bg-danger')} style={{ width: `${Math.min(50, Math.abs(v) * 25)}%` }} /></div><span className="num text-right">{v >= 0 ? '+' : ''}{fmt(v, 2)}</span></div>
                ))}
              </div>
              <div className="mt-2 text-[10px] text-fg-dim">centroid z-scores relative to the position group · alternatives: {a.alternatives.join(', ')}</div>
            </Card>
          ))}
        </div>
        <ChartCaption>{m.clustering.archetype_naming}.</ChartCaption>
      </Section>

      <Section title="4 · Similarity engine" description={m.similarity.validation}>
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-xs">
              <thead><tr className="text-left text-[10px] uppercase tracking-wider text-fg-dim"><th className="px-3 py-2">Space</th><th className="px-3 py-2">Metric</th><th className="px-3 py-2 text-right">Queries</th><th className="px-3 py-2 text-right">Hit@1</th><th className="px-3 py-2 text-right">Hit@5</th><th className="px-3 py-2 text-right">MRR</th></tr></thead>
              <tbody>{m.similarity.candidates.map((r) => {
                const sel = r.space === m.similarity.selected.space && r.metric === m.similarity.selected.metric
                return <tr key={r.space + r.metric} className={cn('border-t border-border', sel && 'bg-pitch-soft')}><td className="px-3 py-1.5 font-mono">{r.space}{sel && <Badge tone="green" className="ml-2">selected</Badge>}</td><td className="px-3 py-1.5">{r.metric}</td><td className="num px-3 py-1.5 text-right">{r.queries}</td><td className="num px-3 py-1.5 text-right">{r.hit_at_1 == null ? '—' : `${(r.hit_at_1 * 100).toFixed(1)}%`}</td><td className="num px-3 py-1.5 text-right">{r.hit_at_k == null ? '—' : `${(r.hit_at_k * 100).toFixed(1)}%`}</td><td className="num px-3 py-1.5 text-right">{fmt(r.mean_reciprocal_rank, 3)}</td></tr>
              })}</tbody>
            </table>
          </div>
          <ChartCaption>Selected by hit@5 then MRR. Similarity percentage: {m.similarity.percent_formula}. {m.similarity.n_neighbors_stored} neighbours are precomputed per player-season.</ChartCaption>
        </Card>
      </Section>

      <Section title="5 · Era model (time machine)" description={`${m.time_machine.n_seasons} competition-seasons with at least ${m.time_machine.min_matches} matches, ${m.time_machine.features.length} standardised features.`}>
        <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
          <Card>
            <CardTitle>Season PCA</CardTitle>
            <div style={{ height: 200 }} role="img" aria-label="Explained variance of the season-level PCA"><ResponsiveContainer><BarChart data={tmRows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}><CartesianGrid vertical={false} strokeDasharray="2 4" /><XAxis dataKey="pc" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} unit="%" /><Tooltip contentStyle={tooltipStyle} /><Bar dataKey="variance" name="Variance %" fill="#d5b467" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>
            <ChartCaption>Features: {m.time_machine.features.map((f) => m.time_machine.feature_labels[f]).join(', ')}.</ChartCaption>
          </Card>
          <Card><CardTitle>Candidates</CardTitle><CandidateTable rows={m.time_machine.clustering.candidates} selectedId={m.time_machine.clustering.selected.id} /><ChartCaption>{m.time_machine.clustering.selection_rule}. Excluded seasons: {m.time_machine.excluded_seasons.length}.</ChartCaption></Card>
        </div>
      </Section>

      <Section title="6 · Parameters & reproducibility">
        <Card>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Object.entries(m.parameters).map(([k, v]) => <LabelledValue key={k} label={k.replace(/_/g, ' ')}><span className="num">{String(v)}</span></LabelledValue>)}
            <LabelledValue label="dataset content hash"><span className="num">{m.dataset_content_hash}</span></LabelledValue>
            <LabelledValue label="source commit"><span className="num break-all">{m.source_commit ?? 'unknown'}</span></LabelledValue>
            <LabelledValue label="trained at"><span className="num">{m.trained_at}</span></LabelledValue>
            <LabelledValue label="random seed"><span className="num">{m.random_seed}</span></LabelledValue>
          </div>
        </Card>
      </Section>
    </div>
  )
}
