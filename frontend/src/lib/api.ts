/** Typed API client. All data comes from the FastAPI backend; nothing is hardcoded here. */

export class ApiError extends Error {
  status: number
  hint?: string
  constructor(status: number, message: string, hint?: string) {
    super(message)
    this.status = status
    this.hint = hint
  }
}

const cache = new Map<string, Promise<unknown>>()

export async function api<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
  const url = new URL(path, window.location.origin)
  if (params) for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') url.searchParams.set(k, String(v))
  const key = url.toString()
  if (!cache.has(key)) {
    cache.set(
      key,
      fetch(key).then(async (r) => {
        if (!r.ok) {
          let detail = r.statusText
          let hint: string | undefined
          try {
            const j = await r.json()
            detail = j.detail ?? detail
            hint = j.hint
          } catch { /* ignore */ }
          cache.delete(key)
          throw new ApiError(r.status, detail, hint)
        }
        return r.json()
      }).catch((e) => { cache.delete(key); throw e }),
    )
  }
  return cache.get(key) as Promise<T>
}

// ---------------------------------------------------------------- types
export interface SearchResult { type: 'player' | 'team' | 'season' | 'competition'; id: number | string; slug?: string; label: string; sublabel: string; score: number }
export interface PlayerListItem { player_id: number; display_name: string; player_slug: string; primary_position: string | null; primary_position_group: string | null; seasons: number; total_minutes: number; total_goals: number; first_season_year: number; last_season_year: number; teams: string; competitions: string; country: string | null }
export interface SeasonSummary { player_season_id: string; season_key: string; season: string; season_start_year: number; competition_name: string; team_name: string; position: string | null; position_group: string | null; minutes: number; appearances: number; starts: number; goals: number; assists: number; xg: number; xa: number; shots: number; key_passes: number; data_coverage: number; qualifies: boolean; min_minutes_threshold: number; is_tournament: boolean; era: string; age: number | null; modeled?: boolean }
export interface PlayerProfile extends PlayerListItem { player_name: string; seasons_detail: SeasonSummary[]; default_season_id: string | null; age_note: string }
export interface DnaDimension { dimension: string; label: string; z: number; percentile: number; season_percentile: number; members: string[] }
export interface DnaMetric { metric: string; label: string; value: number | null; percentile: number | null }
export interface DnaBlock { player_season_id: string; dimensions: DnaDimension[]; metrics: DnaMetric[]; cluster: number; archetype: string; pca: { pc1: number; pc2: number; pc3: number }; percentile_basis: string }
export interface SeasonStats { summary: SeasonSummary; raw: Record<string, number | null>; per90: Record<string, number | null>; rates: Record<string, number | null>; dna: DnaBlock | null; labels: Record<string, string> }
export interface Explanation { dimension: string; label: string; a: number; b: number; agreement: number }
export interface SimilarPlayer { player_season_id: string; player_id: number; player: string; season_key: string; team: string; position: string; position_group: string; era: string; archetype: string; minutes: number; data_coverage: number; similarity: number; distance: number; explanation: Explanation[]; full_explanation: Explanation[] }
export interface SimilarResponse { source: { player_season_id: string; player?: string; season_key?: string; archetype?: string; position_group?: string }; method: string | null; results: SimilarPlayer[]; reason?: string }
export interface TimelineSeason extends SeasonSummary { modeled: boolean; dna: Record<string, number> | null; archetype: string | null; per90: Record<string, number | null> }
export interface Timeline { player_id: number; seasons: TimelineSeason[]; note: string }
export interface TranslationTarget { id: string; label: string; season_keys: string[]; qualifying_player_seasons: number; kind: 'pool' | 'season'; sample_type?: string; matches?: number }
export interface TranslationMetric { metric: string; label: string; available: boolean; historical: number | null; historical_percentile?: number | null; era_adjusted?: number | null; modern_context_percentile?: number | null; target_median?: number | null; source_median?: number | null }
export interface EraTranslation {
  label: string; method: string
  source: { player_season_id: string; player: string; season_key: string; position_group: string; position: string; minutes: number; data_coverage: number; archetype: string | null; team: string }
  source_pool: { scope: string; label: string; size: number; seasons: number; competitions: string[]; sample_mix?: Record<string, number>; window_years?: number; note: string }
  target_pool: { size: number; seasons: number; competitions: string[]; sample_mix?: Record<string, number>; label: string; season_keys: string[] }
  metrics: TranslationMetric[]
  dimensions: { dimension: string; label: string; historical: number | null; era_adjusted: number | null; modern_context: number | null }[]
  confidence: { score: number; level: 'high' | 'medium' | 'low'; reasons: string[] }
  modern_comparison: { basis: string; results: { player_season_id: string; player_id: number; player: string; season_key: string; team: string; position: string; archetype: string; minutes: number; profile_distance: number; similarity: number; explanation: Explanation[] }[] }
}
export interface TmSeason { season_key: string; competition: string; season: string; year: number; era: string; era_cluster: number; sample_type: string; matches: number; teams: number; dominant_team: string; dominant_team_share: number; qualifying_player_seasons: number; shot_fidelity_share: number; metrics: Record<string, number | null>; z: Record<string, number | null>; pca: { pc1: number; pc2: number }; position_mix: Record<string, number>; archetypes: { name: string; count: number; share: number }[]; representatives: { player_season_id: string; player: string; position: string; team: string; archetype: string; data_coverage: number }[] }
export interface EraCluster { cluster: number; size: number; year_range: [number, number]; high: string[]; low: string[]; members: string[]; centroid: Record<string, number>; name: string }
export interface TimeMachine { seasons: TmSeason[]; features: Record<string, string>; era_clusters: EraCluster[]; pca: { n_components: number; explained_variance_ratio: number[]; loadings: Record<string, Record<string, number>> } | null; excluded_seasons: string[]; note: string }
export interface MapPoint { id: string; player_id?: number; label: string; season_key?: string; x: number; y: number; cluster: number; archetype?: string; position?: string; position_group?: string; team?: string; era: string; year: number; minutes?: number; coverage?: number; top?: [string, number][]; sample_type?: string; matches?: number }
export interface EraMap { unit: 'players' | 'seasons'; points: MapPoint[]; explained_variance: number[]; loadings?: Record<string, Record<string, number>>; clusters: { cluster: number; name: string; size?: number }[] }
export interface Archetype { cluster: number; local_cluster?: number; position_group: string; name: string; match_score: number; alternatives: string[]; defining_high: string[]; defining_low: string[]; position_mix: string[]; description: string; centroid: Record<string, number>; global_centroid?: Record<string, number>; representatives: { player_season_id: string; player: string; season_key: string }[]; size: number; mean_coverage: number }
export interface Compare { a: SeasonStats; b: SeasonStats; metrics: { metric: string; label: string; a: number | null; b: number | null; a_pct: number | null; b_pct: number | null }[]; comparability: { score: number; reasons: string[]; metric_overlap: number }; similarity: { distance: number; similarity: number; explanation: Explanation[] } | null; pool_sizes: { a: number; b: number } }
export interface CompetitionSeason { competition_id: number; season_id: number; competition_name: string; season_name: string; season: string; season_key: string; matches: number; teams: number; sample_type: string; dominant_team: string; dominant_team_share: number; is_tournament: boolean; season_start_year: number; era: string; qualifying_player_seasons: number; first_match: string; last_match: string; gender: string }
export interface ClusterCandidate { id: string; algorithm: string; params: Record<string, number | string>; k: number; silhouette: number | null; davies_bouldin: number | null; calinski_harabasz: number | null; sizes: number[]; noise: number; min_size_share: number; eligible: boolean; inertia?: number }
export interface ModelMeta {
  model_version: string; feature_version: string; dataset_version: string; dataset_content_hash: string; source_commit: string | null; random_seed: number; trained_at: string; training_seconds: number
  population: { player_seasons: number; players: number; all_player_seasons: number; qualifying_by_minutes: number; excluded_goalkeepers: number; rule: string }
  features: { model_features: string[]; n_features: number; dna_dimensions: Record<string, string[]>; dimension_labels: Record<string, string>; winsorize: { quantiles: number[] }; scaling: string }
  pca: { n_components_fitted: number; n_components_90pct: number; explained_variance_ratio: number[]; cumulative_variance: number[]; loadings: Record<string, Record<string, number>> }
  clustering: { space: string; candidates: ClusterCandidate[]; selected: ClusterCandidate; selection_rule: string; stage_note?: string; global_position_mix?: Record<string, Record<string, number>>; by_position_group?: Record<string, { n: number; pca_components_90pct: number; candidates: ClusterCandidate[]; selected: ClusterCandidate }>; archetypes: Archetype[]; archetype_naming: string }
  similarity: { candidates: { space: string; metric: string; queries: number; hit_at_1: number | null; hit_at_k: number | null; mean_reciprocal_rank: number | null; k?: number }[]; selected: { space: string; metric: string; hit_at_1: number; hit_at_k: number; mean_reciprocal_rank: number }; validation: string; distance_scale_95pct_nn: number; percent_formula: string; n_neighbors_stored: number }
  time_machine: { features: string[]; feature_labels: Record<string, string>; n_seasons: number; min_matches: number; pca: { n_components: number; explained_variance_ratio: number[]; loadings: Record<string, Record<string, number>> }; clustering: { candidates: ClusterCandidate[]; selected: ClusterCandidate; selection_rule: string; clusters: EraCluster[] }; excluded_seasons: string[] }
  parameters: Record<string, number | string>
}
export interface QualityReport {
  generated_at: string; dataset_version: string
  totals: { players: number; player_seasons: number; qualifying_player_seasons: number; player_matches: number; matches: number; competitions: number; competition_seasons: number; seasons: number; teams: number; first_season: number; last_season: number }
  missing_values: { total_cells_null: number; by_metric: Record<string, number>; note: string }
  duplicates_removed: Record<string, number>; invalid_records_removed: Record<string, number>
  validation: Record<string, { rows_in: number; rows_out: number; duplicates_removed: number; invalid_removed: number; issues: { kind: string; count: number; detail: string }[] }>
  parse_errors: string[]
  coverage_by_season: { season_key: string; player_seasons: number; qualifying: number; mean_coverage: number; matches: number }[]
  coverage_by_metric: Record<string, number>
  sample_types: Record<string, number>
  metric_definitions: Record<string, string>
}
export interface Sources {
  generated_at: string
  sources: { id: string; name: string; url: string; raw_base_url: string; license: string; license_url: string; purpose: string; metrics_obtained: string[]; known_limitations: string[] }[]
  acquisition?: { scope: string; retrieved_at: string; upstream_commit: string | null; matches: number; files_downloaded: number; files_from_cache: number; failures: string[] }
  dataset_version: { dataset_version: string; built_at: string; scope: string; source_commit: string | null; retrieved_at: string; content_hash: string; rows: Record<string, number> }
  competition_seasons: CompetitionSeason[]
}
export interface DataStatus { dataset_version: Sources['dataset_version']; acquisition: Sources['acquisition']; competition_seasons: number; model: { model_version: string; feature_version: string; trained_at: string; random_seed: number; source_commit: string | null }; totals: QualityReport['totals'] }

// ---------------------------------------------------------------- endpoints
export const getSearch = (q: string, types?: string) => api<{ query: string; results: SearchResult[] }>('/api/search', { q, types })
export const getPlayers = (params?: { q?: string; limit?: number; position_group?: string; min_seasons?: number }) => api<{ players: PlayerListItem[] }>('/api/players', params)
export const getPlayer = (id: string | number) => api<PlayerProfile>(`/api/players/${id}`)
export const getPlayerSeasons = (id: string | number) => api<Timeline>(`/api/players/${id}/seasons`)
export const getPlayerDna = (id: string | number, season?: string) => api<SeasonStats>(`/api/players/${id}/dna`, { season })
export const getSimilar = (id: string | number, season?: string, k = 10, same_position_group = false, era?: string, distinct_players = true) => api<SimilarResponse>(`/api/players/${id}/similar`, { season, k, same_position_group, era, distinct_players })
export const getCompare = (a: string, b: string) => api<Compare>('/api/compare', { a, b })
export const getTranslationTargets = () => api<{ targets: TranslationTarget[] }>('/api/era-translation/targets')
export const getEraTranslation = (player_season_id: string, target = 'modern') => api<EraTranslation>('/api/era-translation', { player_season_id, target })
export const getTimeMachine = () => api<TimeMachine>('/api/time-machine')
export const getEraMap = (unit: 'players' | 'seasons') => api<EraMap>('/api/era-map', { unit })
export const getArchetypes = () => api<{ archetypes: Archetype[]; selected: ClusterCandidate; naming: string }>('/api/archetypes')
export const getModels = () => api<ModelMeta>('/api/models')
export const getQuality = () => api<QualityReport>('/api/data-quality')
export const getSources = () => api<Sources>('/api/data/sources')
export const getStatus = () => api<DataStatus>('/api/data/status')
