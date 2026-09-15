"""Player-facing services: profile, DNA, similarity, timeline and comparison."""
from __future__ import annotations

import numpy as np
import pandas as pd

from backend.data_pipeline.normalize import era_comparability
from backend.data_pipeline.parse_events import PLAYER_COUNT_FIELDS
from backend.models.features import DIMENSION_LABELS, DNA_DIMENSIONS, METRIC_LABELS, TRANSLATION_METRICS
from backend.models.similarity import explain, similarity_percent
from backend.services.store import Store, clean

SEASON_SUMMARY_COLS = [
    "player_season_id", "season_key", "season", "season_start_year", "competition_name", "team_name", "position",
    "position_group", "minutes", "appearances", "starts", "goals", "assists", "xg", "xa", "shots", "key_passes",
    "data_coverage", "qualifies", "min_minutes_threshold", "is_tournament", "era", "age",
]
RAW_STAT_COLS = ["minutes", "appearances", "starts"] + PLAYER_COUNT_FIELDS
RATE_COLS = ["pass_completion", "dribble_success", "shot_accuracy", "xg_per_shot", "aerial_win_rate", "tackle_win_rate"]


def season_summary(row: pd.Series) -> dict:
    return clean({c: row.get(c) for c in SEASON_SUMMARY_COLS})


def dna_block(store: Store, player_season_id: str) -> dict | None:
    if player_season_id not in store.feat_by_id.index:
        return None
    f = store.feat_by_id.loc[player_season_id]
    dims = []
    for d, label in DIMENSION_LABELS.items():
        dims.append({"dimension": d, "label": label, "z": f[f"dna_{d}_z"], "percentile": f[f"dna_{d}_pct"],
                     "season_percentile": f[f"dna_{d}_season_pct"],
                     "members": [METRIC_LABELS.get(m, m) for m in DNA_DIMENSIONS[d]]})
    metrics = [{"metric": m, "label": METRIC_LABELS.get(m, m), "value": store.ps_by_id.loc[player_season_id, m],
                "percentile": f[f"pct_{m}"]} for m in TRANSLATION_METRICS]
    return clean({
        "player_season_id": player_season_id,
        "dimensions": dims,
        "metrics": metrics,
        "cluster": int(f["cluster"]),
        "archetype": f["archetype"],
        "pca": {"pc1": f["pc1"], "pc2": f["pc2"], "pc3": f["pc3"]},
        "percentile_basis": "within position group, pooled across all qualifying player-seasons in the dataset "
                            "(season_percentile: within the same competition-season and position group)",
    })


def player_profile(store: Store, player_id: int) -> dict | None:
    p = store.player_row(player_id)
    if not p:
        return None
    seasons = store.player_seasons(player_id)
    modeled = set(store.feat.loc[store.feat["player_id"] == player_id, "player_season_id"])
    p["seasons_detail"] = [season_summary(r) | {"modeled": r["player_season_id"] in modeled} for _, r in seasons.iterrows()]
    p["default_season_id"] = store.default_season(player_id)
    p["age_note"] = "Age / date of birth is not included in StatsBomb open data, so it is not shown."
    return clean(p)


def season_stats(store: Store, player_season_id: str) -> dict | None:
    if player_season_id not in store.ps_by_id.index:
        return None
    r = store.ps_by_id.loc[player_season_id]
    raw = {c: r.get(c) for c in RAW_STAT_COLS}
    per90 = {f"{c}_per90": r.get(f"{c}_per90") for c in PLAYER_COUNT_FIELDS if f"{c}_per90" in r.index}
    rates = {c: r.get(c) for c in RATE_COLS}
    return clean({"summary": season_summary(r), "raw": raw, "per90": per90, "rates": rates,
                  "dna": dna_block(store, player_season_id),
                  "labels": METRIC_LABELS})


def similar_players(store: Store, player_season_id: str, k: int = 10, same_position_group: bool = False,
                    exclude_same_player: bool = True, era: str | None = None, distinct_players: bool = True) -> dict | None:
    if player_season_id not in store.feat_by_id.index:
        return None
    src = store.feat_by_id.loc[player_season_id]
    try:
        rows = store.neighbors_by_id.get_group(player_season_id).sort_values("rank")
    except KeyError:
        rows = pd.DataFrame(columns=["neighbor_id", "distance"])
    grid = store.model_meta["similarity"]["distance_grid"]
    out = []
    seen: set[int] = set()
    for _, n in rows.iterrows():
        f = store.feat_by_id.loc[n["neighbor_id"]]
        if exclude_same_player and f["player_id"] == src["player_id"]:
            continue
        if distinct_players:
            if int(f["player_id"]) in seen:
                continue
            seen.add(int(f["player_id"]))
        if same_position_group and f["position_group"] != src["position_group"]:
            continue
        if era and f["era"] != era:
            continue
        sim = float(similarity_percent(n["distance"], grid))
        expl = explain(pd.Series({d: src[f"dna_{d}_pct"] for d in DNA_DIMENSIONS}),
                       pd.Series({d: f[f"dna_{d}_pct"] for d in DNA_DIMENSIONS}))
        out.append({
            "player_season_id": f["player_season_id"], "player_id": int(f["player_id"]), "player": f["display_name"],
            "season_key": f["season_key"], "team": f["team_name"], "position": f["position"],
            "position_group": f["position_group"], "era": f["era"], "archetype": f["archetype"],
            "minutes": f["minutes"], "data_coverage": f["data_coverage"],
            "similarity": sim, "distance": round(float(n["distance"]), 4),
            "explanation": expl[:5], "full_explanation": expl,
        })
        if len(out) >= k:
            break
    meta = store.model_meta["similarity"]["selected"]
    return clean({
        "source": {"player_season_id": player_season_id, "player": src["display_name"], "season_key": src["season_key"],
                   "archetype": src["archetype"], "position_group": src["position_group"]},
        "method": f"k-nearest neighbours in {meta['space']} space with {meta['metric']} distance "
                  f"(validated hit@5 = {meta['hit_at_k']:.0%} on self-retrieval)",
        "results": out,
    })


def timeline(store: Store, player_id: int) -> dict:
    seasons = store.player_seasons(player_id)
    rows = []
    for _, r in seasons.iterrows():
        d = dna_block(store, r["player_season_id"])
        rows.append(season_summary(r) | {
            "modeled": d is not None,
            "dna": {x["dimension"]: x["percentile"] for x in d["dimensions"]} if d else None,
            "archetype": d["archetype"] if d else None,
            "per90": clean({m: r.get(m) for m in TRANSLATION_METRICS}),
        })
    return {"player_id": player_id, "seasons": rows,
            "note": "Profiles are per-position-group percentiles within the dataset; season-to-season changes reflect role, "
                    "team, competition and data coverage as much as the player. No causal claim is made."}


def compare(store: Store, a_id: str, b_id: str) -> dict | None:
    if a_id not in store.ps_by_id.index or b_id not in store.ps_by_id.index:
        return None
    a, b = store.ps_by_id.loc[a_id], store.ps_by_id.loc[b_id]
    pool_a = int((store.ps["qualifies"] & (store.ps["season_key"] == a["season_key"]) & (store.ps["position_group"] == a["position_group"])).sum())
    pool_b = int((store.ps["qualifies"] & (store.ps["season_key"] == b["season_key"]) & (store.ps["position_group"] == b["position_group"])).sum())
    comp = era_comparability(a, b, pool_a, pool_b)
    da, db = dna_block(store, a_id), dna_block(store, b_id)
    sim = None
    if da and db and a_id in store.sim_ids and b_id in store.sim_ids:
        metric = store.model_meta["similarity"]["selected"]["metric"]
        xa, xb = store.sim_X[store.sim_ids[a_id]], store.sim_X[store.sim_ids[b_id]]
        if metric == "cosine":
            d = 1 - float(np.dot(xa, xb) / (np.linalg.norm(xa) * np.linalg.norm(xb) + 1e-12))
        elif metric == "manhattan":
            d = float(np.abs(xa - xb).sum())
        else:
            d = float(np.linalg.norm(xa - xb))
        sim = {"distance": round(d, 4), "similarity": float(similarity_percent(d, store.model_meta["similarity"]["distance_grid"])),
               "explanation": explain(pd.Series({x["dimension"]: x["percentile"] for x in da["dimensions"]}),
                                      pd.Series({x["dimension"]: x["percentile"] for x in db["dimensions"]}))}
    metrics = []
    for m in TRANSLATION_METRICS:
        metrics.append({"metric": m, "label": METRIC_LABELS.get(m, m), "a": a.get(m), "b": b.get(m),
                        "a_pct": store.feat_by_id.loc[a_id, f"pct_{m}"] if a_id in store.feat_by_id.index else None,
                        "b_pct": store.feat_by_id.loc[b_id, f"pct_{m}"] if b_id in store.feat_by_id.index else None})
    return clean({
        "a": season_stats(store, a_id), "b": season_stats(store, b_id),
        "metrics": metrics, "comparability": comp, "similarity": sim,
        "pool_sizes": {"a": pool_a, "b": pool_b},
    })
