"""Era translation: place a historical player-season in a modern population.

Method (per metric):
  1. Historical percentile  p = rank of the player's value within the source
     pool: qualifying player-seasons of the same position group from the same
     competition-season when that season is a broad sample, otherwise from a
     ±N-year window around it (N grows until the pool is large enough).  The
     pool's composition is always reported.
  2. Era-adjusted value     v' = quantile_p of the target pool distribution
     (quantile mapping).  "A player this dominant relative to peers would
     post v' in the target environment."
  3. Modern-context percentile = rank of the *raw* historical value within
     the target pool ("where the actual numbers sit today").

All outputs are labelled HYPOTHETICAL STATISTICAL COMPARISON.  Nothing here
predicts what a player would literally do.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from backend.models.features import DIMENSION_LABELS, DNA_DIMENSIONS, METRIC_LABELS, TRANSLATION_METRICS

MIN_POOL_SEASON = 25   # a single competition-season must have this many peers to stand alone
MIN_POOL_WINDOW = 40   # a year-window pool must reach this before it stops growing
MAX_WINDOW = 8


def percentile_of(value: float, pool: np.ndarray) -> float:
    pool = pool[~np.isnan(pool)]
    if len(pool) == 0:
        return float("nan")
    return float(100.0 * ((pool < value).sum() + 0.5 * (pool == value).sum()) / len(pool))


def quantile_of(p: float, pool: np.ndarray) -> float:
    pool = pool[~np.isnan(pool)]
    if len(pool) == 0:
        return float("nan")
    return float(np.quantile(pool, np.clip(p / 100.0, 0, 1)))


def _composition(pool: pd.DataFrame, cs: pd.DataFrame | None) -> dict:
    out = {"size": int(len(pool)), "seasons": int(pool["season_key"].nunique()),
           "competitions": sorted(pool["competition_name"].unique().tolist())}
    if cs is not None and len(pool):
        st = cs.set_index("season_key")["sample_type"]
        types = pool["season_key"].map(st).value_counts(normalize=True)
        out["sample_mix"] = {k: round(float(v), 3) for k, v in types.items()}
    return out


def source_pool(ps: pd.DataFrame, cs: pd.DataFrame, source: pd.Series) -> tuple[pd.DataFrame, dict]:
    """Reference population for the historical percentile, excluding the player's own seasons."""
    pg = source["position_group"]
    base = ps[ps["qualifies"] & (ps["position_group"] == pg) & (ps["player_id"] != source["player_id"])]
    sample_type = cs.set_index("season_key")["sample_type"].get(source["season_key"], "partial_season")
    same = base[base["season_key"] == source["season_key"]]
    if sample_type in ("full_season", "partial_season", "tournament") and len(same) >= MIN_POOL_SEASON:
        return same, {"scope": "season", "label": source["season_key"], **_composition(same, cs),
                      "note": "Percentiles are computed against qualifying peers in the same competition-season and position group."}
    year = int(source["season_start_year"])
    for w in range(1, MAX_WINDOW + 1):
        pool = base[(base["season_start_year"] - year).abs() <= w]
        if len(pool) >= MIN_POOL_WINDOW:
            return pool, {"scope": "window", "label": f"{year - w}–{year + w + 1} ({pg})", "window_years": w,
                          **_composition(pool, cs),
                          "note": (f"'{source['season_key']}' is a {sample_type.replace('_', ' ')} sample, too narrow to rank "
                                   f"against on its own; percentiles use every qualifying {pg} player-season within ±{w} years.")}
    pool = base[(base["season_start_year"] - year).abs() <= MAX_WINDOW]
    return pool, {"scope": "insufficient", "label": f"±{MAX_WINDOW} years ({pg})", **_composition(pool, cs),
                  "note": "Reference population is too small — treat every percentile as unreliable."}


def target_pool(ps: pd.DataFrame, cs: pd.DataFrame, season_keys: list[str], pg: str, exclude_player: int | None = None) -> tuple[pd.DataFrame, dict]:
    pool = ps[ps["qualifies"] & (ps["position_group"] == pg) & ps["season_key"].isin(season_keys)]
    if exclude_player is not None:
        pool = pool[pool["player_id"] != exclude_player]
    return pool, _composition(pool, cs)


def translate(ps: pd.DataFrame, cs: pd.DataFrame, source: pd.Series, target_keys: list[str], target_label: str) -> dict:
    pg = source["position_group"]
    src_pool, src_info = source_pool(ps, cs, source)
    tgt_pool, tgt_info = target_pool(ps, cs, target_keys, pg, exclude_player=int(source["player_id"]))
    metrics = []
    dims_hist, dims_ctx = {}, {}
    for m in TRANSLATION_METRICS:
        v = source.get(m)
        if v is None or v != v:
            metrics.append({"metric": m, "label": METRIC_LABELS.get(m, m), "historical": None, "available": False})
            continue
        sp = src_pool[m].to_numpy(dtype=float)
        tp = tgt_pool[m].to_numpy(dtype=float)
        hist_pct = percentile_of(v, sp) if len(sp) else float("nan")
        adj = quantile_of(hist_pct, tp) if hist_pct == hist_pct and len(tp) else float("nan")
        ctx_pct = percentile_of(v, tp) if len(tp) else float("nan")
        metrics.append({
            "metric": m, "label": METRIC_LABELS.get(m, m), "available": True,
            "historical": round(float(v), 3),
            "historical_percentile": _r(hist_pct),
            "era_adjusted": _r(adj, 3),
            "modern_context_percentile": _r(ctx_pct),
            "target_median": _r(float(np.nanmedian(tp)), 3) if len(tp) else None,
            "source_median": _r(float(np.nanmedian(sp)), 3) if len(sp) else None,
            "target_p90": _r(float(np.nanpercentile(tp, 90)), 3) if len(tp) else None,
        })
    for dim, members in DNA_DIMENSIONS.items():
        hp = [x["historical_percentile"] for x in metrics if x["metric"] in members and x.get("historical_percentile") is not None]
        cp = [x["modern_context_percentile"] for x in metrics if x["metric"] in members and x.get("modern_context_percentile") is not None]
        if hp:
            dims_hist[dim] = round(float(np.mean(hp)), 1)
        if cp:
            dims_ctx[dim] = round(float(np.mean(cp)), 1)

    conf = confidence(source, src_info, tgt_info)
    return {
        "label": "HYPOTHETICAL STATISTICAL COMPARISON — MODEL ESTIMATE — NOT A LITERAL PREDICTION",
        "method": "Position-group percentile within the source reference pool, quantile-mapped into the target population.",
        "source": {"player_season_id": source["player_season_id"], "player": source["display_name"], "player_id": int(source["player_id"]),
                   "season_key": source["season_key"], "position_group": pg, "position": source["position"],
                   "minutes": float(source["minutes"]), "data_coverage": float(source["data_coverage"])},
        "source_pool": src_info,
        "target_pool": {**tgt_info, "label": target_label, "season_keys": target_keys},
        "metrics": metrics,
        "dimensions": [{"dimension": d, "label": DIMENSION_LABELS[d], "historical": dims_hist.get(d),
                        "era_adjusted": dims_hist.get(d), "modern_context": dims_ctx.get(d)} for d in DNA_DIMENSIONS],
        "confidence": conf,
        "_pools": (src_pool, tgt_pool),
    }


def confidence(source: pd.Series, src_info: dict, tgt_info: dict) -> dict:
    minutes_part = min(float(source["minutes"]) / 1800.0, 1.0)
    src_part = min(src_info["size"] / 60.0, 1.0)
    tgt_part = min(tgt_info["size"] / 60.0, 1.0)
    scope_pen = {"season": 1.0, "window": 0.8, "insufficient": 0.3}[src_info["scope"]]
    fid = float(source.get("shot_fidelity_share", 1.0) or 0.0)
    score = 100 * (0.35 * minutes_part + 0.25 * src_part + 0.25 * tgt_part + 0.15 * fid) * scope_pen
    level = "high" if score >= 70 else "medium" if score >= 45 else "low"
    reasons = []
    if minutes_part < 0.5:
        reasons.append(f"Only {source['minutes']:.0f} minutes in the source season")
    if src_info["size"] < 60:
        reasons.append(f"Source reference pool is small ({src_info['size']} qualifying {source['position_group']} player-seasons)")
    if tgt_info["size"] < 60:
        reasons.append(f"Target pool is small ({tgt_info['size']} qualifying player-seasons)")
    if src_info["scope"] == "window":
        reasons.append(f"Source season is a narrow sample; a ±{src_info['window_years']}-year window of peers was used instead")
    elif src_info["scope"] == "insufficient":
        reasons.append("Source reference pool insufficient")
    mix = src_info.get("sample_mix", {})
    if mix.get("single_team_centric", 0) > 0.5:
        reasons.append("Most reference peers come from single-team samples (e.g. Barcelona-only seasons)")
    if fid < 1:
        reasons.append("Some source matches were collected at lower shot-location fidelity")
    return {"score": round(score, 1), "level": level, "reasons": reasons}


def _r(x: float, nd: int = 1):
    return None if x is None or x != x else round(float(x), nd)
