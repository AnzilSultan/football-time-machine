"""Train every ML artifact from the master dataset and write reproducible metadata.

Run:  python -m backend.models.train
"""
from __future__ import annotations

import json
import logging
import sys
import time
from datetime import datetime, timezone
from typing import Callable

import numpy as np
import pandas as pd
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler

from backend.config import (ARTIFACTS_DIR, DATASET_VERSION, FEATURE_VERSION, METADATA_DIR, MODEL_VERSION,
                            PROCESSED_DIR, RANDOM_SEED)
from backend.models.clustering import name_clusters, run_candidates, select_best
from backend.models.features import (DIMENSION_LABELS, DNA_DIMENSIONS, MODEL_FEATURES, TRANSLATION_METRICS,
                                     dna_from_z, group_percentiles, modeling_population, winsorize)
from backend.models.similarity import evaluate_spaces, fit_index, pairwise_distance_grid, select_similarity
from backend.models.time_machine import fit_time_machine

log = logging.getLogger(__name__)


def train(progress: Callable[[str], None] | None = None) -> dict:
    say = progress or (lambda m: log.info(m))
    np.random.seed(RANDOM_SEED)
    t0 = time.time()
    ps = pd.read_parquet(PROCESSED_DIR / "player_season.parquet")
    ts = pd.read_parquet(PROCESSED_DIR / "team_season.parquet")

    # ---------------------------------------------------------------- features
    pop = modeling_population(ps)
    say(f"Modeling population: {len(pop)} qualifying outfield player-seasons of {len(ps)} "
        f"({ps['qualifies'].sum()} qualify by minutes; goalkeepers and incomplete rows excluded)")
    pop_w, bounds = winsorize(pop, MODEL_FEATURES)
    scaler = StandardScaler().fit(pop_w[MODEL_FEATURES])
    Z = scaler.transform(pop_w[MODEL_FEATURES])
    Zdf = pd.DataFrame(Z, columns=MODEL_FEATURES, index=pop.index)
    dna_z = dna_from_z(Zdf)
    dims = list(DNA_DIMENSIONS)

    feat = pop[["player_season_id", "player_id", "display_name", "season_key", "season_start_year", "era",
                "position", "position_group", "team_name", "competition_name", "season", "minutes", "data_coverage",
                "is_tournament"]].copy()
    for d in dims:
        feat[f"dna_{d}_z"] = dna_z[d].round(4)
    pct_pooled = group_percentiles(pd.concat([feat[["position_group"]], dna_z], axis=1), dims, ["position_group"])
    pct_season = group_percentiles(pd.concat([feat[["position_group", "season_key"]], dna_z], axis=1), dims,
                                   ["position_group", "season_key"])
    for d in dims:
        feat[f"dna_{d}_pct"] = pct_pooled[d]
        feat[f"dna_{d}_season_pct"] = pct_season[d]
    metric_pct = group_percentiles(pd.concat([feat[["position_group"]], pop[TRANSLATION_METRICS]], axis=1),
                                   TRANSLATION_METRICS, ["position_group"])
    for m in TRANSLATION_METRICS:
        feat[f"pct_{m}"] = metric_pct[m]

    # ---------------------------------------------------------------- PCA
    pca_full = PCA(n_components=min(len(MODEL_FEATURES), 15), random_state=RANDOM_SEED).fit(Z)
    cum = np.cumsum(pca_full.explained_variance_ratio_)
    n90 = int(np.searchsorted(cum, 0.90) + 1)
    P = pca_full.transform(Z)
    P90 = P[:, :n90]
    for i in range(3):
        feat[f"pc{i + 1}"] = P[:, i].round(4)
    say(f"PCA: {n90} components explain {cum[n90 - 1]:.1%} of variance; PC1+PC2 = {cum[1]:.1%}")

    # ---------------------------------------------------------------- clustering
    # Stage 1 (global): cluster every outfield player-season together.  This is
    # reported in the ML Lab; it mostly rediscovers positions.
    say("Evaluating global clustering candidates (KMeans / Ward / DBSCAN)…")
    g_results, g_labels = run_candidates(P90, range(3, 13), dbscan_eps=[1.5, 2.0, 2.5, 3.0], min_samples=10,
                                         min_size_share=0.03)
    g_best = select_best(g_results, prefer_k_range=(3, 12))
    feat["global_cluster"] = g_labels[g_best["id"]]
    g_mix = pd.crosstab(feat["global_cluster"], feat["position_group"], normalize="index").round(3)
    say(f"Global: {g_best['id']} silhouette={g_best['silhouette']} sizes={g_best['sizes']}")

    # Stage 2 (within position group): archetypes.  Each group gets its own
    # PCA(90%) space and candidate evaluation; k chosen by silhouette in 2..6.
    say("Evaluating within-position archetype clustering…")
    feat["cluster"] = -1
    archetypes: list[dict] = []
    group_reports: dict[str, dict] = {}
    next_id = 0
    for grp in ["DF", "MF", "AM", "FW"]:
        idx = feat.index[feat["position_group"] == grp]
        Zg = Z[idx]
        pg = PCA(n_components=min(len(MODEL_FEATURES), 15), random_state=RANDOM_SEED).fit(Zg)
        ng = int(np.searchsorted(np.cumsum(pg.explained_variance_ratio_), 0.90) + 1)
        Pg = pg.transform(Zg)[:, :ng]
        res, labs = run_candidates(Pg, range(2, 7), dbscan_eps=[2.0, 2.5, 3.0], min_samples=8, min_size_share=0.08)
        best = select_best(res, prefer_k_range=(2, 6))
        lab = labs[best["id"]]
        # group-relative DNA z-scores: how a cluster differs from *its own position group*
        dz = dna_z.loc[idx, dims]
        rel = (dz - dz.mean()) / dz.std().replace(0, 1)
        cl = pd.Series(lab, index=idx)
        cents_rel = pd.concat([cl.rename("cluster"), rel], axis=1).groupby("cluster")[dims].mean()
        cents_rel = cents_rel[cents_rel.index >= 0]
        mix = pd.crosstab(cl, feat.loc[idx, "position"], normalize="index").loc[cents_rel.index]
        named = name_clusters(cents_rel, mix, group=grp)
        for a in named:
            local = a["cluster"]
            members = idx[cl.to_numpy() == local]
            gid = next_id
            next_id += 1
            feat.loc[members, "cluster"] = gid
            d = np.linalg.norm(rel.loc[members, dims].to_numpy() - cents_rel.loc[local].to_numpy(), axis=1)
            order, seen = [], set()
            for i in np.argsort(d):  # closest to centroid, one season per player
                pid = feat.loc[members[i], "player_id"]
                if pid not in seen:
                    seen.add(pid)
                    order.append(i)
                if len(order) == 8:
                    break
            a.update({
                "cluster": gid, "local_cluster": int(local), "position_group": grp, "size": int(len(members)),
                "mean_coverage": round(float(feat.loc[members, "data_coverage"].mean()), 1),
                "global_centroid": {k: round(float(v), 3) for k, v in dz.loc[members].mean().items()},
                "representatives": [{"player_season_id": feat.loc[members[i], "player_season_id"],
                                     "player": feat.loc[members[i], "display_name"],
                                     "season_key": feat.loc[members[i], "season_key"]} for i in order],
            })
            archetypes.append(a)
        group_reports[grp] = {"n": int(len(idx)), "pca_components_90pct": ng, "candidates": res, "selected": best}
        say(f"  {grp}: {best['id']} silhouette={best['silhouette']} -> {[a['name'] for a in named]}")
    arch_by_cluster = {a["cluster"]: a["name"] for a in archetypes}
    feat["archetype"] = feat["cluster"].map(arch_by_cluster).fillna("Unclustered (noise)")
    results, best = g_results, g_best

    # ---------------------------------------------------------------- similarity
    say("Validating similarity spaces by self-retrieval…")
    spaces = {"z_raw": Z, f"pca_{n90}": P90, "dna_z": dna_z[dims].to_numpy()}
    sim_rows = evaluate_spaces(spaces, feat["player_id"].to_numpy(), k=5)
    chosen = select_similarity(sim_rows)
    X_sim = spaces[chosen["space"]]
    say(f"Selected similarity: space={chosen['space']} metric={chosen['metric']} hit@5={chosen['hit_at_k']}")
    index = fit_index(X_sim, chosen["metric"], n_neighbors=41)
    dist, idx = index.kneighbors(X_sim)
    grid = pairwise_distance_grid(X_sim, chosen["metric"])
    neigh_rows = []
    ids = feat["player_season_id"].to_numpy()
    for i in range(len(feat)):
        for rank, (j, d) in enumerate(zip(idx[i][1:], dist[i][1:]), 1):
            neigh_rows.append((ids[i], ids[j], rank, float(d)))
    neighbors = pd.DataFrame(neigh_rows, columns=["player_season_id", "neighbor_id", "rank", "distance"])

    # ---------------------------------------------------------------- time machine
    say("Fitting season-level era model…")
    tm_df, tm_meta = fit_time_machine(ts)
    say(f"Era model: {tm_meta['n_seasons']} seasons, selected {tm_meta['clustering']['selected']['id']}")

    # ---------------------------------------------------------------- persist
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    feat.to_parquet(ARTIFACTS_DIR / "player_features.parquet", index=False)
    neighbors.to_parquet(ARTIFACTS_DIR / "neighbors.parquet", index=False)
    np.savez_compressed(ARTIFACTS_DIR / "similarity_space.npz", X=X_sim, ids=ids)
    tm_df.to_parquet(ARTIFACTS_DIR / "time_machine_seasons.parquet", index=False)
    ds_version = json.loads((METADATA_DIR / "dataset_version.json").read_text())
    metadata = {
        "model_version": MODEL_VERSION,
        "feature_version": FEATURE_VERSION,
        "dataset_version": DATASET_VERSION,
        "dataset_content_hash": ds_version.get("content_hash"),
        "source_commit": ds_version.get("source_commit"),
        "random_seed": RANDOM_SEED,
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "training_seconds": round(time.time() - t0, 1),
        "population": {"player_seasons": int(len(feat)), "players": int(feat["player_id"].nunique()),
                       "all_player_seasons": int(len(ps)), "qualifying_by_minutes": int(ps["qualifies"].sum()),
                       "excluded_goalkeepers": int((ps["qualifies"] & (ps["position_group"] == "GK")).sum()),
                       "rule": "outfield, minutes >= 900 (league) or >= 270 (tournament), complete feature vector"},
        "features": {"model_features": MODEL_FEATURES, "n_features": len(MODEL_FEATURES),
                     "dna_dimensions": DNA_DIMENSIONS, "dimension_labels": DIMENSION_LABELS,
                     "winsorize": {"quantiles": [0.005, 0.995], "bounds": {k: [round(a, 4), round(b, 4)] for k, (a, b) in bounds.items()}},
                     "scaling": "StandardScaler (z-score) fitted on the pooled modeling population",
                     "scaler": {"mean": scaler.mean_.round(4).tolist(), "scale": scaler.scale_.round(4).tolist()}},
        "pca": {"n_components_fitted": int(pca_full.n_components_), "n_components_90pct": n90,
                "explained_variance_ratio": pca_full.explained_variance_ratio_.round(4).tolist(),
                "cumulative_variance": cum.round(4).tolist(),
                "loadings": {f"pc{i + 1}": {f: round(float(v), 4) for f, v in zip(MODEL_FEATURES, pca_full.components_[i])}
                             for i in range(3)}},
        "clustering": {"space": f"PCA ({n90} components, 90% variance)", "candidates": results, "selected": best,
                       "global_position_mix": {int(k): v for k, v in g_mix.to_dict(orient="index").items()},
                       "selection_rule": "highest silhouette among eligible candidates (min cluster share 3%, DBSCAN noise <= 10%); "
                                         "Davies-Bouldin breaks ties",
                       "stage_note": "Global clustering (reported here) mostly separates positions. Archetypes come from a second "
                                     "stage that clusters each position group separately in its own PCA(90%) space, k in 2..6 chosen by silhouette.",
                       "by_position_group": group_reports,
                       "archetypes": archetypes, "archetype_naming":
                       "cosine match between each cluster's position-relative DNA centroid (z-scored within its position group) "
                       "and a signature lexicon restricted to that position group; names are unique per group"},
        "similarity": {"candidates": sim_rows, "selected": chosen, "validation":
                       "self-retrieval: for players with 2+ qualifying seasons, does another season of the same player "
                       "appear in the top-5 neighbours of a query season?",
                       "distance_grid": grid,
                       "percent_formula": "100 * (1 - F(distance)) where F is the empirical CDF of distances between 200,000 random player-season pairs",
                       "n_neighbors_stored": 40},
        "time_machine": tm_meta,
        "parameters": {"kmeans_n_init": 20, "agglomerative_linkage": "ward", "dbscan_min_samples": 10,
                       "similarity_k_eval": 5, "pca_random_state": RANDOM_SEED},
    }
    (ARTIFACTS_DIR / "model_metadata.json").write_text(json.dumps(metadata, indent=2, default=_default))
    say(f"Artifacts written to {ARTIFACTS_DIR} in {time.time() - t0:.0f}s")
    return metadata


def _default(o):
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.floating,)):
        return None if np.isnan(o) else float(o)
    if isinstance(o, (np.bool_,)):
        return bool(o)
    if isinstance(o, np.ndarray):
        return o.tolist()
    raise TypeError(str(type(o)))


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    train(lambda m: print(m, flush=True))
    sys.exit(0)
