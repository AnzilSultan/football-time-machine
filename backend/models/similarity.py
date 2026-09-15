"""Player similarity engine with empirical selection of space and metric.

Validation: for every player with two or more qualifying seasons, query with
one season and check whether another season *of the same player* appears in
the top-k neighbours (excluding the query row).  Real players are the most
honest ground truth available: a good similarity space should recognise
Messi 2011/12 as similar to Messi 2012/13.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.neighbors import NearestNeighbors

from backend.models.features import DIMENSION_LABELS


def self_retrieval(X: np.ndarray, player_ids: np.ndarray, metric: str, k: int = 5) -> dict:
    nn = NearestNeighbors(n_neighbors=k + 1, metric=metric).fit(X)
    dist, idx = nn.kneighbors(X)
    counts = pd.Series(player_ids).value_counts()
    multi = np.array([counts[p] > 1 for p in player_ids])
    if multi.sum() == 0:
        return {"queries": 0, "hit_at_1": None, "hit_at_k": None, "mean_reciprocal_rank": None}
    hits1 = hitsk = 0
    rr = []
    for i in np.where(multi)[0]:
        neigh = [j for j in idx[i] if j != i][:k]
        same = [player_ids[j] == player_ids[i] for j in neigh]
        if same and same[0]:
            hits1 += 1
        if any(same):
            hitsk += 1
            rr.append(1.0 / (same.index(True) + 1))
        else:
            rr.append(0.0)
    n = int(multi.sum())
    return {"queries": n, "hit_at_1": round(hits1 / n, 4), "hit_at_k": round(hitsk / n, 4),
            "mean_reciprocal_rank": round(float(np.mean(rr)), 4), "k": k}


def evaluate_spaces(spaces: dict[str, np.ndarray], player_ids: np.ndarray, metrics=("euclidean", "cosine", "manhattan"),
                    k: int = 5) -> list[dict]:
    rows = []
    for space, X in spaces.items():
        for metric in metrics:
            r = self_retrieval(X, player_ids, metric, k)
            rows.append({"space": space, "metric": metric, **r})
    return rows


def select_similarity(rows: list[dict]) -> dict:
    return max(rows, key=lambda r: ((r["hit_at_k"] or 0), (r["mean_reciprocal_rank"] or 0)))


def fit_index(X: np.ndarray, metric: str, n_neighbors: int = 30) -> NearestNeighbors:
    return NearestNeighbors(n_neighbors=min(n_neighbors, len(X)), metric=metric).fit(X)


def pairwise_distance_grid(X: np.ndarray, metric: str, n_pairs: int = 200_000, seed: int = 42, grid: int = 1001) -> list[float]:
    """Quantile grid (0..100%) of distances between random player-season pairs.

    Similarity is then reported as "closer than X% of all random pairs", which
    stays meaningful for outliers whose nearest neighbours are still far away.
    """
    rng = np.random.default_rng(seed)
    i = rng.integers(0, len(X), n_pairs)
    j = rng.integers(0, len(X), n_pairs)
    keep = i != j
    a, b = X[i[keep]], X[j[keep]]
    if metric == "cosine":
        d = 1 - (a * b).sum(1) / (np.linalg.norm(a, axis=1) * np.linalg.norm(b, axis=1) + 1e-12)
    elif metric == "manhattan":
        d = np.abs(a - b).sum(1)
    else:
        d = np.linalg.norm(a - b, axis=1)
    return np.quantile(d, np.linspace(0, 1, grid)).round(5).tolist()


def similarity_percent(d: np.ndarray | float, grid: list[float]) -> np.ndarray | float:
    """100 * (1 - F(d)) where F is the empirical CDF of random-pair distances."""
    g = np.asarray(grid)
    pos = np.searchsorted(g, np.asarray(d), side="right") / (len(g) - 1)
    return np.round(100.0 * (1.0 - np.clip(pos, 0, 1)), 1)


def explain(dna_a: pd.Series, dna_b: pd.Series) -> list[dict]:
    """Per-dimension agreement on 0-100 percentile scale."""
    out = []
    for dim, label in DIMENSION_LABELS.items():
        a, b = float(dna_a[dim]), float(dna_b[dim])
        out.append({"dimension": dim, "label": label, "a": a, "b": b,
                    "agreement": round(100 - abs(a - b), 1)})
    return sorted(out, key=lambda r: -r["agreement"])
