"""Era-level services: time machine, era map, translation targets and translation."""
from __future__ import annotations

import numpy as np
import pandas as pd

from backend.models.era_translation import translate
from backend.models.features import DIMENSION_LABELS, DNA_DIMENSIONS
from backend.models.similarity import explain
from backend.models.time_machine import SEASON_FEATURES
from backend.services.store import Store, clean

MODERN_FROM_YEAR = 2021


def translation_targets(store: Store) -> list[dict]:
    cs = store.cs[store.cs["qualifying_player_seasons"] > 0].sort_values(["season_start_year", "competition_name"], ascending=[False, True])
    modern = cs[cs["season_start_year"] >= MODERN_FROM_YEAR]
    targets = [{
        "id": "modern", "label": f"All modern competitions ({MODERN_FROM_YEAR}+)",
        "season_keys": modern["season_key"].tolist(), "qualifying_player_seasons": int(modern["qualifying_player_seasons"].sum()),
        "kind": "pool",
    }]
    for r in cs.itertuples(index=False):
        targets.append({"id": r.season_key, "label": r.season_key, "season_keys": [r.season_key],
                        "qualifying_player_seasons": int(r.qualifying_player_seasons), "kind": "season",
                        "sample_type": r.sample_type, "matches": int(r.matches)})
    return targets


def era_translation(store: Store, player_season_id: str, target_id: str = "modern", k: int = 6) -> dict | None:
    if player_season_id not in store.ps_by_id.index:
        return None
    src = store.ps_by_id.loc[player_season_id]
    targets = {t["id"]: t for t in translation_targets(store)}
    t = targets.get(target_id)
    if t is None:
        return None
    result = translate(store.ps, store.cs, src, t["season_keys"], t["label"])
    _, tgt_pool = result.pop("_pools")
    # Modern comparison: rank every target-pool player *within the target pool*
    # on the same metrics, then find the profiles closest to the source's
    # historical (= era-adjusted) percentile profile.
    comps = []
    avail = [m for m in result["metrics"] if m.get("available") and m.get("historical_percentile") is not None]
    if len(tgt_pool) >= 2 and avail:
        cols = [m["metric"] for m in avail]
        src_pct = np.array([m["historical_percentile"] for m in avail], dtype=float)
        pool_pct = tgt_pool[cols].rank(pct=True).to_numpy(dtype=float) * 100
        d = np.sqrt(((pool_pct - src_pct) ** 2).mean(axis=1))
        order = np.argsort(d)[:k]
        dims = list(DNA_DIMENSIONS)
        for i in order:
            f = tgt_pool.iloc[i]
            feat_row = store.feat_by_id.loc[f["player_season_id"]] if f["player_season_id"] in store.feat_by_id.index else None
            per_dim_pool = {}
            for dim, members in DNA_DIMENSIONS.items():
                js = [j for j, m in enumerate(avail) if m["metric"] in members]
                if js:
                    per_dim_pool[dim] = float(np.mean(pool_pct[i, js]))
            src_dim = {x["dimension"]: x["historical"] for x in result["dimensions"] if x["historical"] is not None}
            common = [dd for dd in dims if dd in per_dim_pool and dd in src_dim]
            comps.append({
                "player_season_id": f["player_season_id"], "player_id": int(f["player_id"]), "player": f["display_name"],
                "season_key": f["season_key"], "team": f["team_name"], "position": f["position"],
                "archetype": feat_row["archetype"] if feat_row is not None else None,
                "minutes": f["minutes"], "profile_distance": round(float(d[i]), 2),
                "similarity": round(float(max(0.0, 100 - d[i])), 1),
                "explanation": explain(pd.Series({dd: src_dim[dd] for dd in common}), pd.Series({dd: per_dim_pool[dd] for dd in common}))[:4],
            })
    result["modern_comparison"] = {
        "basis": "Nearest players in the target pool by root-mean-square gap between the source's era-relative percentile "
                 "profile and each target player's percentile profile within the target pool (same metrics, same position group).",
        "results": comps,
    }
    src_feat = store.feat_by_id.loc[player_season_id] if player_season_id in store.feat_by_id.index else None
    result["source"]["archetype"] = src_feat["archetype"] if src_feat is not None else None
    result["source"]["team"] = src["team_name"]
    return clean(result)


def time_machine(store: Store) -> dict:
    tm = store.tm.sort_values(["season_start_year", "competition_name"])
    feats = list(SEASON_FEATURES)
    seasons = []
    for r in tm.itertuples(index=False):
        rd = r._asdict()
        f = store.feat[store.feat["season_key"] == r.season_key]
        arch = f["archetype"].value_counts()
        reps = (f.sort_values(["data_coverage", "minutes"], ascending=False)
                  .drop_duplicates("position_group").head(6))
        seasons.append({
            "season_key": r.season_key, "competition": r.competition_name, "season": r.season,
            "year": int(r.season_start_year), "era": r.era, "era_cluster": int(r.era_cluster),
            "sample_type": r.sample_type, "matches": int(r.matches), "teams": int(r.teams),
            "dominant_team": r.dominant_team, "dominant_team_share": r.dominant_team_share,
            "qualifying_player_seasons": int(r.qualifying_player_seasons),
            "shot_fidelity_share": r.shot_fidelity_share,
            "metrics": {k: rd.get(k) for k in feats},
            "z": {k: rd.get(f"{k}_z") for k in feats},
            "pca": {"pc1": rd.get("pc1"), "pc2": rd.get("pc2")},
            "position_mix": {k.replace("minutes_share_", ""): rd.get(k) for k in rd if k.startswith("minutes_share_")},
            "archetypes": [{"name": n, "count": int(c), "share": round(float(c) / len(f), 3)} for n, c in arch.items()] if len(f) else [],
            "representatives": [{"player_season_id": x["player_season_id"], "player": x["display_name"], "position": x["position"],
                                 "team": x["team_name"], "archetype": x["archetype"], "data_coverage": x["data_coverage"]}
                                for _, x in reps.iterrows()],
        })
    meta = store.model_meta.get("time_machine", {})
    return clean({
        "seasons": seasons, "features": SEASON_FEATURES, "era_clusters": meta.get("clustering", {}).get("clusters", []),
        "pca": meta.get("pca"), "excluded_seasons": meta.get("excluded_seasons", []),
        "note": "Season rows aggregate only the matches present in StatsBomb open data. 'single_team_centric' seasons "
                "(e.g. Barcelona-only La Liga seasons) describe that team and its opponents, not the whole league.",
    })


def era_map(store: Store, unit: str = "players") -> dict:
    if unit == "seasons":
        pts = [{"id": r.season_key, "label": r.season_key, "x": r.pc1, "y": r.pc2, "cluster": int(r.era_cluster),
                "year": int(r.season_start_year), "era": r.era, "sample_type": r.sample_type, "matches": int(r.matches)}
               for r in store.tm.itertuples(index=False)]
        meta = store.model_meta.get("time_machine", {})
        return clean({"unit": "seasons", "points": pts, "explained_variance": meta.get("pca", {}).get("explained_variance_ratio"),
                      "clusters": [{"cluster": c["cluster"], "name": c["name"]} for c in meta.get("clustering", {}).get("clusters", [])]})
    f = store.feat
    dims = list(DNA_DIMENSIONS)
    pts = []
    for r in f.itertuples(index=False):
        rd = r._asdict()
        pts.append({"id": r.player_season_id, "player_id": int(r.player_id), "label": r.display_name, "season_key": r.season_key,
                    "x": r.pc1, "y": r.pc2, "cluster": int(r.cluster), "archetype": r.archetype, "position": r.position,
                    "position_group": r.position_group, "team": r.team_name, "era": r.era, "year": int(r.season_start_year),
                    "minutes": r.minutes, "coverage": r.data_coverage,
                    "top": sorted(((DIMENSION_LABELS[d], rd[f"dna_{d}_pct"]) for d in dims), key=lambda t: -t[1])[:3]})
    meta = store.model_meta
    return clean({"unit": "players", "points": pts, "explained_variance": meta["pca"]["explained_variance_ratio"][:2],
                  "loadings": meta["pca"]["loadings"],
                  "clusters": [{"cluster": a["cluster"], "name": a["name"], "size": a["size"]} for a in meta["clustering"]["archetypes"]]})


def eras_overview(store: Store) -> dict:
    cs = store.cs.sort_values(["season_start_year", "competition_name"])
    meta = store.model_meta.get("time_machine", {})
    return clean({
        "competition_seasons": cs.to_dict(orient="records"),
        "eras": [{"era": e, "seasons": int(n)} for e, n in cs.groupby("era").size().items()],
        "era_clusters": meta.get("clustering", {}).get("clusters", []),
    })
