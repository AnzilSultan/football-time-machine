"""Season-level era analysis: standardise, PCA, cluster and evaluate."""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler

from backend.config import RANDOM_SEED
from backend.models.clustering import run_candidates, select_best

SEASON_FEATURES = {
    "goals_per_match": "Goals per match",
    "shots_per_team_match": "Shots per team-match",
    "xg_per_shot": "xG per shot",
    "passes_per_team_match": "Passes per team-match",
    "pass_completion": "Pass completion",
    "long_ball_share": "Long-ball share",
    "progressive_passes_per_team_match": "Progressive passes per team-match",
    "progressive_carries_per_team_match": "Progressive carries per team-match",
    "dribbles_per_team_match": "Take-ons per team-match",
    "pressures_per_team_match": "Pressures per team-match",
    "counterpressures_per_team_match": "Counterpressures per team-match",
    "tackles_per_team_match": "Tackles per team-match",
    "interceptions_per_team_match": "Interceptions per team-match",
    "clearances_per_team_match": "Clearances per team-match",
    "high_turnovers_per_team_match": "High turnovers per team-match",
    "fouls_committed_per_team_match": "Fouls per team-match",
    "touches_penalty_area_per_team_match": "Penalty-area touches per team-match",
    "possession_imbalance": "Possession imbalance",
}

MIN_MATCHES = 6


def fit_time_machine(ts: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    feats = list(SEASON_FEATURES)
    df = ts[(ts["matches"] >= MIN_MATCHES)].dropna(subset=feats).copy().reset_index(drop=True)
    scaler = StandardScaler().fit(df[feats])
    Z = scaler.transform(df[feats])
    n_comp = min(5, Z.shape[0] - 1, Z.shape[1])
    pca = PCA(n_components=n_comp, random_state=RANDOM_SEED).fit(Z)
    P = pca.transform(Z)
    max_k = max(2, min(6, len(df) // 4))
    results, labels = run_candidates(Z, range(2, max_k + 1), dbscan_eps=[2.0, 2.5, 3.0, 3.5, 4.0], min_samples=3,
                                     min_size_share=0.08)
    best = select_best(results, prefer_k_range=(3, 6))
    df["era_cluster"] = labels[best["id"]]
    for i in range(min(3, n_comp)):
        df[f"pc{i + 1}"] = P[:, i].round(4)
    for f in feats:
        df[f"{f}_z"] = Z[:, feats.index(f)].round(4)
    # cluster descriptions: mean z profile
    cents = df.groupby("era_cluster")[[f"{f}_z" for f in feats]].mean()
    cluster_desc = []
    for c, row in cents.iterrows():
        if c < 0:
            continue
        top = row.sort_values(ascending=False)
        high = [SEASON_FEATURES[i.replace("_z", "")] for i in top.index[:3] if row[i] > 0.3]
        low = [SEASON_FEATURES[i.replace("_z", "")] for i in top.index[::-1][:2] if row[i] < -0.3]
        members = df[df["era_cluster"] == c].sort_values("season_start_year")
        cluster_desc.append({
            "cluster": int(c), "size": int(len(members)),
            "year_range": [int(members["season_start_year"].min()), int(members["season_start_year"].max())],
            "high": high, "low": low,
            "members": members["season_key"].tolist(),
            "centroid": {f: round(float(row[f + "_z"]), 3) for f in feats},
            "name": _era_name(high, low, members),
        })
    loadings = {f"pc{i + 1}": {f: round(float(v), 4) for f, v in zip(feats, pca.components_[i])} for i in range(n_comp)}
    meta = {
        "features": feats, "feature_labels": SEASON_FEATURES, "n_seasons": int(len(df)), "min_matches": MIN_MATCHES,
        "scaler": {"mean": scaler.mean_.round(4).tolist(), "scale": scaler.scale_.round(4).tolist()},
        "pca": {"n_components": n_comp, "explained_variance_ratio": pca.explained_variance_ratio_.round(4).tolist(),
                "loadings": loadings},
        "clustering": {"candidates": results, "selected": best, "selection_rule":
                       "highest silhouette among eligible candidates with 3-6 clusters (min cluster share 8%, ≤10% DBSCAN noise); Davies-Bouldin breaks ties",
                       "clusters": cluster_desc},
        "excluded_seasons": ts.loc[(ts["matches"] < MIN_MATCHES) | ts[feats].isna().any(axis=1), "season_key"].tolist(),
    }
    return df, meta


ADJECTIVES = {
    "Passes per team-match": "possession-heavy", "Pass completion": "high-completion",
    "Pressures per team-match": "high-pressing", "Counterpressures per team-match": "counter-pressing",
    "High turnovers per team-match": "transition-heavy", "Long-ball share": "direct",
    "Clearances per team-match": "clearance-heavy", "Goals per match": "high-scoring",
    "xG per shot": "high-shot-quality", "Shots per team-match": "shot-heavy",
    "Take-ons per team-match": "dribble-heavy", "Fouls per team-match": "foul-heavy",
    "Tackles per team-match": "tackle-heavy", "Interceptions per team-match": "interception-heavy",
    "Penalty-area touches per team-match": "box-dominant", "Progressive passes per team-match": "progressive-passing",
    "Progressive carries per team-match": "carry-driven", "Possession imbalance": "lopsided",
}


def _era_name(high: list[str], low: list[str], members: pd.DataFrame) -> str:
    """Name = adjectives of the cluster's two strongest above-average features + its year span."""
    y0, y1 = int(members["season_start_year"].min()), int(members["season_start_year"].max())
    adjs = [ADJECTIVES[h] for h in high[:2] if h in ADJECTIVES]
    if not adjs and low:
        adjs = ["low-" + ADJECTIVES[low[0]].replace("high-", "").replace("-heavy", "") ] if low[0] in ADJECTIVES else []
    tag = (", ".join(adjs) + " football").capitalize() if adjs else "Balanced profile"
    return f"{tag} ({y0}–{y1})"
