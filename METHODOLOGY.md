# Methodology

This document explains how every number in Football Time Machine is produced. The same information, with the values that actually came out of training, is shown in the app's **ML Lab** page and stored in `backend/data/artifacts/model_metadata.json`.

## 1. From events to counting statistics (`backend/data_pipeline/parse_events.py`)

Every match's `lineups` and `events` files are parsed once. StatsBomb pitch coordinates are 120 × 80 yards, attacking left → right.

**Minutes.** Each lineup entry lists position intervals (`from`, `to`). Minutes = length of the *union* of a player's intervals (intervals occasionally overlap in the source, notably in extra-time matches), capped at the match length taken from the last `Half End` event. `started` = any interval whose `start_reason` is "Starting XI". The position with the most minutes is the player's position for that match.

**Position mapping.** StatsBomb position names → position (`GK, CB, FB, DM, CM, WM, AM, W, ST`) → position group (`GK, DF, MF, AM, FW`). Goalkeepers are kept in the dataset but excluded from the outfield model.

**Counts (all per match, summed per season).** `goals` – Shot events with outcome *Goal* (own goals are separate events and never credited); `non_penalty_goals`; `shots`; `shots_on_target` – outcome Goal / Saved / Saved To Post; `xg`, `npxg` – sum of `statsbomb_xg`; `assists` – passes flagged `goal_assist`; `key_passes` – passes flagged `shot_assist`; `xa` – xG of the shot each key pass created (linked through `key_pass_id`); `passes`; `passes_completed` – passes with no `outcome`; `progressive_passes` – completed open-play passes gaining ≥ 10 yards toward goal, excluding passes that start in the own 40 % unless they finish in the final third; `passes_into_final_third`, `passes_into_box`, `crosses`, `long_balls` (≥ 30 yards); `passes_received` – Ball Receipt without failure; `carries`, `carry_distance` (forward yards), `progressive_carries` – ≥ 10 yards toward goal (same own-40 % rule) or any carry into the box; `dribbles` (take-ons) and `dribbles_completed`; `dribbled_past`; `touches` – passes + completed receipts + shots + take-ons + clearances + interceptions + recoveries + blocks + miscontrols (carries excluded to avoid double counting); `touches_attacking_third` (x ≥ 80), `touches_penalty_area`, `touches_defensive_third` (x ≤ 40); `tackles` – Duel type Tackle, `tackles_won`; `interceptions` (successful outcomes); `blocks`; `clearances`; `ball_recoveries` (not `recovery_failure`); `pressures`, `counterpressures`; `aerials_won` (any event flagged `aerial_won`), `aerials_lost` (Duel type Aerial Lost); `fouls_committed`, `fouls_won`; `yellow_cards` (Yellow Card), `red_cards` (Red Card or Second Yellow); `dispossessed`; `miscontrols`.

**Team rows.** Goals are the official score (event-derived goals are kept as `goals_from_events` and the mismatch count is reported); `possession_share` is the team's share of possession-sequence time in the match (StatsBomb publishes no possession %); plus shots, xG, passes, completion, progressive actions, pressures, defensive actions, high turnovers (recoveries at x ≥ 80).

## 2. Validation (`validate.py`)

Schema checks on matches, lineups and events; duplicate (match, player) rows removed; rows with negative minutes, minutes exceeding match length + 1, or negative counts removed and counted. Soft anomalies (goals > shots, zero-minute rows with events, unmapped positions, event-goal vs official-score mismatches) are reported in `quality_report.json` but kept. Nothing is imputed.

## 3. Master dataset (`build.py`, `normalize.py`)

Player-match rows are summed to **player-season** rows keyed by (player_id, competition, season). Names are normalised with the StatsBomb nickname as display name and an ASCII slug; seasons become `2011/12`; team = the team with most minutes. `age` is a null column: StatsBomb open data has no date of birth.

**Per-90.** Every count ÷ minutes × 90, null when minutes = 0. Rates (`pass_completion`, `dribble_success`, `shot_accuracy`, `xg_per_shot`, `aerial_win_rate`, `tackle_win_rate`) are null when the denominator is 0.

**Minimum minutes.** 900 for league seasons, 270 for tournaments (competitions capped at ~7 matches). The threshold used is stored per row (`min_minutes_threshold`) and shown in the UI.

**Data coverage score (0–100).** 50 % minutes (saturating at 1,800), 20 % appearances (saturating at 20), 15 % share of matches at StatsBomb shot-fidelity v2, 15 % share of the 14 key per-90 metrics that are non-null.

**Era comparability score (0–100).** For two player-seasons: 35 % overlap of available key metrics, 25 % min-minutes term, 20 % reference-pool size term, multiplied by 0.6 if one is a tournament and the other a league season and by 0.7 if position groups differ. Reasons are returned in words.

**Sample types** per competition-season: full / partial season, single-team-centric (dominant team ≥ 90 % of matches), tournament. Season-level aggregates (`team_season`) are per team-match means plus goals per match, pass completion, xG per shot, long-ball share, possession imbalance (mean |share − 0.5|), position-minute mix and qualifying player count.

## 4. Player model (`backend/models/`)

**Population.** Qualifying outfield player-seasons with a complete feature vector: 2,661 of 13,445 (2,929 qualify by minutes; 268 goalkeepers excluded).

**Features.** 35 per-90 / rate metrics grouped into ten DNA dimensions:

| Dimension | Member metrics |
|---|---|
| Finishing | npxG, non-penalty goals, shots, shots on target (/90) |
| Chance Creation | xA, key passes, assists, passes into box |
| Ball Progression | progressive passes, progressive carries, passes into final third, carries into final third |
| Passing | passes, completed passes, pass completion, long balls |
| Carrying | carries, carry distance, carries into box |
| Dribbling | take-ons, successful take-ons, fouls won |
| Possession Involvement | touches, passes received, attacking-third touches, penalty-area touches |
| Defensive Activity | tackles, interceptions, blocks, clearances, ball recoveries |
| Pressing | pressures, counterpressures |
| Aerial Contribution | aerials won (+), aerials lost (weight −0.5) |

**Preprocessing.** Winsorise each feature at the 0.5 / 99.5 percentiles, then z-score with `StandardScaler` fitted on the pooled population. Dimension z = weighted mean of member z-scores. **Percentiles** are computed within position group (a) pooled across all seasons and (b) within the same competition-season; both are exposed.

**PCA.** Fitted on the 35 standardised features; 13 components reach ≥ 90 % variance; PC1 + PC2 (57 %) draw the Era Map. Loadings are stored.

**Clustering.** Two stages, both with K-Means (n_init = 20), Ward agglomerative and DBSCAN candidates evaluated by silhouette, Davies-Bouldin, Calinski-Harabasz, cluster sizes and noise:

1. *Global* (all outfield, PCA-13 space, k = 3…12): reported for transparency; it mostly recovers positions (selected k = 3, silhouette 0.222).
2. *Within position group* (each of DF / MF / AM / FW in its own PCA-90 % space, k = 2…6): these are the **archetypes**. Selection rule: highest silhouette among eligible candidates (min cluster share 8 %, DBSCAN noise ≤ 10 %), Davies-Bouldin as tie-break. Result: DF k = 3 (0.233), MF k = 2 (0.285), AM k = 2 (0.229), FW k = 2 (0.391) → 9 archetypes.

**Archetype naming.** Each cluster's centroid is expressed as z-scores *relative to its position group*; the centroid is matched by cosine similarity to a lexicon of signature vectors (e.g. *Poacher* = high finishing, low passing / involvement) restricted to that position group; names are unique per group and the match score, alternatives, defining high/low features, position mix and representative seasons (closest to centroid, one per player) are all stored and displayed. The lexicon supplies words, the data supplies the clusters.

**Similarity.** Candidates: three spaces (raw z, PCA-13, DNA-10) × three metrics (Euclidean, cosine, Manhattan). Validation is **self-retrieval**: for every player with ≥ 2 qualifying seasons (960 queries), does another season of the same player appear in the top-5 neighbours? Selected: raw z + Manhattan (hit@5 = 27.9 %, hit@1 = 19.6 %, MRR 0.226). 40 neighbours are precomputed per player-season. Similarity % = 100 × (1 − F(d)) where F is the empirical CDF of distances between 200,000 random player-season pairs ("closer than X % of all pairs"). Each result carries per-dimension agreement = 100 − |percentile gap|.

## 5. Era translation (`era_translation.py`)

For a source player-season *s* with position group *g* and a target population *T* (a competition-season or the pooled 2021+ modern set):

1. **Source reference pool.** Qualifying *g* players from the same competition-season if that season is a broad sample with ≥ 25 peers; otherwise every qualifying *g* player-season within ± *w* years, growing *w* until ≥ 40 peers (max ± 8). The player's own other seasons are excluded. The pool's size, seasons, competitions and sample-type mix are returned and displayed.
2. **Historical percentile** of each metric within that pool.
3. **Era-adjusted value** = the target pool's quantile at that percentile (quantile mapping). Rank is preserved by construction.
4. **Modern-context percentile** = where the raw historical value falls in the target pool.
5. **Modern comparison** = target-pool players whose within-pool percentile profile is closest (RMS over the same metrics) to the source's era-relative profile.
6. **Confidence (0–100)** = 100 × (0.35 minutes term + 0.25 source-pool size + 0.25 target-pool size + 0.15 fidelity) × scope penalty (1.0 season / 0.8 window / 0.3 insufficient), with reasons in words.

Every response carries the label *HYPOTHETICAL STATISTICAL COMPARISON — MODEL ESTIMATE — NOT A LITERAL PREDICTION*.

## 6. Era model (`time_machine.py`)

Competition-seasons with ≥ 6 matches (33) are described by 18 standardised features (goals per match, shots, xG per shot, passes, completion, long-ball share, progressive passes/carries, take-ons, pressures, counterpressures, tackles, interceptions, clearances, high turnovers, fouls, penalty-area touches, possession imbalance). PCA (5 components, PC1 36 %, PC2 23 %) draws the season map; K-Means / Ward / DBSCAN candidates (k = 2…6) are scored as above with a 3–6 cluster usefulness window; selected K-Means k = 5 (silhouette 0.233). Cluster names are generated from the two strongest above-average features ("Direct, counter-pressing football (2003–2021)").

## 7. Reproducibility

Random seed 42 everywhere (`RANDOM_SEED`), K-Means `n_init = 20`. `model_metadata.json` stores dataset / feature / model versions, dataset content hash, source commit, every parameter, all candidate scores, the selected configurations and the training timestamp.

## 8. Verification

Spot checks against public record: Messi 2011/12 = 50 La Liga goals in 37 matches, 2012/13 = 46 in 32; Barcelona 8–0 Osasuna (2011-09-17) parses to Messi 3 goals, 2 assists. Team goals are reconciled against official scores for every match (56 mismatches out of 5,244 team-match rows are logged, official scores are used). FBref or other reference sites may be consulted manually for such checks; they are never scraped.
