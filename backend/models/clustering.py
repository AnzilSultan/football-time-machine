"""Clustering with honest model selection, plus data-driven archetype naming."""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.cluster import DBSCAN, AgglomerativeClustering, KMeans
from sklearn.metrics import calinski_harabasz_score, davies_bouldin_score, silhouette_score

from backend.config import RANDOM_SEED
from backend.models.features import DIMENSION_LABELS


def evaluate_labels(X: np.ndarray, labels: np.ndarray) -> dict:
    mask = labels >= 0
    k = len(set(labels[mask]))
    sizes = pd.Series(labels[mask]).value_counts().sort_index().tolist()
    if k < 2 or mask.sum() < k + 2:
        return {"k": k, "silhouette": None, "davies_bouldin": None, "calinski_harabasz": None,
                "sizes": sizes, "noise": int((~mask).sum()), "min_size_share": 0.0}
    return {
        "k": k,
        "silhouette": round(float(silhouette_score(X[mask], labels[mask])), 4),
        "davies_bouldin": round(float(davies_bouldin_score(X[mask], labels[mask])), 4),
        "calinski_harabasz": round(float(calinski_harabasz_score(X[mask], labels[mask])), 2),
        "sizes": sizes,
        "noise": int((~mask).sum()),
        "min_size_share": round(min(sizes) / mask.sum(), 4),
    }


def run_candidates(X: np.ndarray, ks: range, dbscan_eps: list[float] | None = None, min_samples: int = 5,
                   min_size_share: float = 0.03) -> tuple[list[dict], dict[str, np.ndarray]]:
    """Fit KMeans, Ward agglomerative and DBSCAN candidates; return evaluations + labels."""
    results, labels = [], {}
    for k in ks:
        km = KMeans(n_clusters=k, n_init=20, random_state=RANDOM_SEED).fit(X)
        key = f"kmeans_k{k}"
        labels[key] = km.labels_
        results.append({"id": key, "algorithm": "KMeans", "params": {"n_clusters": k, "n_init": 20},
                        **evaluate_labels(X, km.labels_), "inertia": round(float(km.inertia_), 2)})
        ag = AgglomerativeClustering(n_clusters=k, linkage="ward").fit(X)
        key = f"agglomerative_ward_k{k}"
        labels[key] = ag.labels_
        results.append({"id": key, "algorithm": "Agglomerative (Ward)", "params": {"n_clusters": k, "linkage": "ward"},
                        **evaluate_labels(X, ag.labels_)})
    for eps in (dbscan_eps or []):
        db = DBSCAN(eps=eps, min_samples=min_samples).fit(X)
        key = f"dbscan_eps{eps}"
        labels[key] = db.labels_
        results.append({"id": key, "algorithm": "DBSCAN", "params": {"eps": eps, "min_samples": min_samples},
                        **evaluate_labels(X, db.labels_)})
    for r in results:
        r["eligible"] = bool(r["silhouette"] is not None and r["k"] >= 2 and r["min_size_share"] >= min_size_share
                             and r["noise"] <= 0.1 * len(X))
    return results, labels


def select_best(results: list[dict], prefer_k_range: tuple[int, int] | None = None) -> dict:
    """Pick by silhouette among eligible candidates; Davies-Bouldin breaks ties.

    ``prefer_k_range`` restricts to a *usefulness* window (e.g. 5-12 archetypes):
    a 2-cluster solution often maximises silhouette trivially (attackers vs defenders)
    but explains little.  The restriction is recorded in metadata so it is auditable.
    """
    pool = [r for r in results if r["eligible"]]
    if prefer_k_range:
        lo, hi = prefer_k_range
        windowed = [r for r in pool if lo <= r["k"] <= hi]
        pool = windowed or pool
    if not pool:
        pool = [r for r in results if r["silhouette"] is not None] or results
    return max(pool, key=lambda r: (r["silhouette"] or -1, -(r["davies_bouldin"] or 99)))


# Archetype lexicon: signature over DNA dimensions (+1 strongly high, -1 strongly low).
ARCHETYPE_LEXICON = [
    {"name": "Complete Forward", "groups": ["FW", "AM"], "sig": {"finishing": 1, "chance_creation": 0.6, "dribbling": 0.5, "possession_involvement": 0.4, "ball_progression": 0.3}},
    {"name": "Poacher", "groups": ["FW"], "sig": {"finishing": 1, "passing": -0.7, "possession_involvement": -0.5, "ball_progression": -0.5, "dribbling": -0.3}},
    {"name": "Target Forward", "groups": ["FW"], "sig": {"finishing": 0.6, "aerial": 1, "passing": -0.5, "dribbling": -0.4, "carrying": -0.4}},
    {"name": "Pressing Forward", "groups": ["FW", "AM"], "sig": {"pressing": 1, "finishing": 0.4, "defensive_activity": 0.4, "passing": -0.3}},
    {"name": "Creative Forward", "groups": ["FW"], "sig": {"chance_creation": 0.9, "passing": 0.6, "possession_involvement": 0.6, "finishing": 0.3, "aerial": -0.5}},
    {"name": "Second Striker", "groups": ["FW", "AM"], "sig": {"finishing": 0.7, "dribbling": 0.6, "chance_creation": 0.4, "pressing": 0.4, "aerial": -0.4}},
    {"name": "Inverted Winger", "groups": ["AM"], "sig": {"dribbling": 1, "finishing": 0.6, "carrying": 0.7, "chance_creation": 0.3, "aerial": -0.5}},
    {"name": "Wide Creator", "groups": ["AM"], "sig": {"chance_creation": 1, "dribbling": 0.5, "carrying": 0.5, "ball_progression": 0.4, "defensive_activity": -0.4}},
    {"name": "Direct Winger", "groups": ["AM"], "sig": {"carrying": 1, "dribbling": 0.8, "ball_progression": 0.5, "passing": -0.6, "possession_involvement": -0.3}},
    {"name": "Advanced Playmaker", "groups": ["AM", "MF"], "sig": {"chance_creation": 0.9, "passing": 0.8, "possession_involvement": 0.8, "ball_progression": 0.5, "aerial": -0.4}},
    {"name": "Creative Playmaker", "groups": ["AM", "MF"], "sig": {"chance_creation": 1, "ball_progression": 0.7, "passing": 0.5, "possession_involvement": 0.5}},
    {"name": "Progressive Creator", "groups": ["AM", "MF"], "sig": {"ball_progression": 1, "chance_creation": 0.7, "carrying": 0.6, "dribbling": 0.5}},
    {"name": "Wide Worker", "groups": ["AM"], "sig": {"pressing": 0.8, "defensive_activity": 0.7, "finishing": -0.4, "chance_creation": -0.3, "possession_involvement": -0.3}},
    {"name": "Deep-Lying Playmaker", "groups": ["MF", "DF"], "sig": {"passing": 1, "ball_progression": 0.8, "possession_involvement": 0.7, "finishing": -0.5, "dribbling": -0.2}},
    {"name": "Possession Midfielder", "groups": ["MF"], "sig": {"passing": 1, "possession_involvement": 0.8, "defensive_activity": 0.2, "finishing": -0.6, "pressing": -0.2}},
    {"name": "Ball-Winning Midfielder", "groups": ["MF"], "sig": {"defensive_activity": 1, "pressing": 0.8, "finishing": -0.6, "chance_creation": -0.4, "passing": -0.2}},
    {"name": "Pressing Midfielder", "groups": ["MF", "AM"], "sig": {"pressing": 1, "defensive_activity": 0.5, "possession_involvement": 0.2, "passing": -0.2}},
    {"name": "Box-to-Box Midfielder", "groups": ["MF"], "sig": {"ball_progression": 0.6, "defensive_activity": 0.6, "carrying": 0.5, "pressing": 0.4, "finishing": 0.3}},
    {"name": "Anchor Midfielder", "groups": ["MF"], "sig": {"passing": 0.6, "defensive_activity": 0.6, "aerial": 0.4, "carrying": -0.5, "dribbling": -0.6, "finishing": -0.6}},
    {"name": "Progressive Full-Back", "groups": ["DF"], "sig": {"ball_progression": 0.8, "carrying": 0.7, "chance_creation": 0.5, "dribbling": 0.3, "aerial": -0.6, "finishing": -0.4}},
    {"name": "Defensive Full-Back", "groups": ["DF"], "sig": {"defensive_activity": 0.8, "pressing": 0.5, "finishing": -0.8, "chance_creation": -0.3, "aerial": -0.2}},
    {"name": "Ball-Playing Centre-Back", "groups": ["DF"], "sig": {"passing": 0.9, "aerial": 0.6, "possession_involvement": 0.5, "finishing": -0.8, "dribbling": -0.7, "carrying": -0.2}},
    {"name": "Stopper Centre-Back", "groups": ["DF"], "sig": {"aerial": 1, "defensive_activity": 0.8, "finishing": -0.7, "dribbling": -0.8, "chance_creation": -0.7, "carrying": -0.5}},
    {"name": "Wide Defender", "groups": ["DF"], "sig": {"defensive_activity": 0.6, "carrying": 0.3, "pressing": 0.3, "finishing": -0.7, "aerial": -0.4, "passing": -0.3}},
]


def name_clusters(centroids: pd.DataFrame, position_mix: pd.DataFrame, group: str | None = None) -> list[dict]:
    """Assign a lexicon name to each cluster by cosine match of its centroid z-profile.

    Names are unique; if two clusters map to the same archetype the weaker match
    gets its second-best name with a qualifier.  Every assignment records the
    match score and the defining features so it can be audited.
    """
    dims = list(DIMENSION_LABELS)
    lexicon = [a for a in ARCHETYPE_LEXICON if group is None or group in a["groups"]]
    lex = np.array([[a["sig"].get(d, 0.0) for d in dims] for a in lexicon])
    lex_n = lex / np.linalg.norm(lex, axis=1, keepdims=True)
    C = centroids[dims].to_numpy()
    C_n = C / (np.linalg.norm(C, axis=1, keepdims=True) + 1e-9)
    scores = C_n @ lex_n.T  # clusters x archetypes
    order = np.argsort(-scores.max(axis=1))  # strongest matches choose first
    taken: set[int] = set()
    out: list[dict | None] = [None] * len(C)
    for ci in order:
        ranked = np.argsort(-scores[ci])
        choice = next((a for a in ranked if a not in taken), ranked[0])
        taken.add(choice)
        z = centroids.iloc[ci][dims]
        top = z.sort_values(ascending=False)
        high = [d for d in top.index[:3] if z[d] > 0.15]
        low = [d for d in top.index[::-1][:2] if z[d] < -0.15]
        mix = position_mix.iloc[ci].sort_values(ascending=False)
        main_pos = [f"{idx} {v:.0%}" for idx, v in mix.items() if v >= 0.15][:3]
        desc = _describe(high, low, mix)
        out[ci] = {
            "cluster": int(centroids.index[ci]),
            "name": lexicon[choice]["name"],
            "match_score": round(float(scores[ci, choice]), 3),
            "alternatives": [lexicon[a]["name"] for a in ranked[1:3]],
            "defining_high": [DIMENSION_LABELS[d] for d in high],
            "defining_low": [DIMENSION_LABELS[d] for d in low],
            "position_mix": main_pos,
            "description": desc,
            "centroid": {d: round(float(z[d]), 3) for d in dims},
        }
    return out  # type: ignore[return-value]


def _describe(high: list[str], low: list[str], mix: pd.Series) -> str:
    pos_word = {"FW": "forwards", "AM": "attacking midfielders and wingers", "MF": "central midfielders", "DF": "defenders"}
    top_pos = mix.index[0] if len(mix) else None
    who = pos_word.get(top_pos, "players")
    hs = ", ".join(DIMENSION_LABELS[d].lower() for d in high) or "a balanced profile"
    ls = ", ".join(DIMENSION_LABELS[d].lower() for d in low)
    s = f"Mostly {who} whose profile is defined by {hs}"
    if ls:
        s += f", with comparatively little {ls}"
    return s + "."
