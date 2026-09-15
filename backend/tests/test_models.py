"""ML layer tests: features, PCA, clustering selection, similarity and era translation."""
import numpy as np
import pandas as pd
from sklearn.decomposition import PCA

from backend.models import clustering, era_translation, features, similarity


def _blobs(n=300, seed=0):
    rng = np.random.default_rng(seed)
    centers = np.array([[0, 0, 0], [6, 6, 0], [0, 6, 6]])
    X = np.vstack([rng.normal(c, 1.0, size=(n // 3, 3)) for c in centers])
    return X


def test_dna_from_z_averages_members():
    cols = features.MODEL_FEATURES
    z = pd.DataFrame(np.zeros((2, len(cols))), columns=cols)
    for m in features.DNA_DIMENSIONS["finishing"]:
        z.loc[0, m] = 2.0
    dna = features.dna_from_z(z)
    assert abs(dna.loc[0, "finishing"] - 2.0) < 1e-9 and dna.loc[1, "finishing"] == 0
    assert set(dna.columns) == set(features.DNA_DIMENSIONS)


def test_winsorize_and_group_percentiles():
    df = pd.DataFrame({"g": ["a"] * 5 + ["b"] * 5, "v": [1, 2, 3, 4, 100, 10, 20, 30, 40, 50]})
    w, bounds = features.winsorize(df, ["v"], lo=0.1, hi=0.9)
    assert w["v"].max() < 100 and bounds["v"][1] < 100
    pct = features.group_percentiles(df, ["v"], ["g"])
    assert pct.loc[4, "v"] == 100.0 and pct.loc[5, "v"] == 20.0


def test_pca_explained_variance_monotone():
    X = _blobs()
    p = PCA(n_components=3, random_state=42).fit(X)
    cum = np.cumsum(p.explained_variance_ratio_)
    assert np.all(np.diff(cum) >= 0) and abs(cum[-1] - 1) < 1e-9


def test_clustering_selection_prefers_true_structure():
    X = _blobs()
    results, labels = clustering.run_candidates(X, range(2, 6), dbscan_eps=[1.5], min_samples=5, min_size_share=0.05)
    best = clustering.select_best(results)
    assert best["k"] == 3 and best["silhouette"] > 0.5
    assert all("davies_bouldin" in r for r in results)
    assert len({l for l in labels[best["id"]] if l >= 0}) == 3


def test_archetype_names_are_unique_and_explained():
    dims = list(features.DNA_DIMENSIONS)
    cents = pd.DataFrame([{d: 0.0 for d in dims} | {"finishing": 1.5, "aerial": 1.2},
                          {d: 0.0 for d in dims} | {"finishing": 1.4, "aerial": 0.9, "passing": -1.0}], index=[0, 1])
    mix = pd.DataFrame([{"ST": 1.0}, {"ST": 1.0}], index=[0, 1])
    named = clustering.name_clusters(cents, mix, group="FW")
    assert len({a["name"] for a in named}) == 2
    assert all(a["description"] and a["defining_high"] for a in named)


def test_similarity_self_retrieval_and_percent():
    rng = np.random.default_rng(1)
    X = np.vstack([rng.normal(i, 0.1, size=(3, 4)) for i in range(20)])  # 20 "players" x 3 seasons
    ids = np.repeat(np.arange(20), 3)
    r = similarity.self_retrieval(X, ids, "euclidean", k=5)
    assert r["hit_at_k"] == 1.0 and r["queries"] == 60
    rows = similarity.evaluate_spaces({"raw": X}, ids)
    best = similarity.select_similarity(rows)
    assert best["space"] == "raw"
    grid = similarity.pairwise_distance_grid(X, "euclidean", n_pairs=5000)
    assert similarity.similarity_percent(0.0, grid) == 100.0
    assert similarity.similarity_percent(grid[-1] * 2, grid) == 0.0
    expl = similarity.explain(pd.Series({d: 50.0 for d in features.DNA_DIMENSIONS}), pd.Series({d: 60.0 for d in features.DNA_DIMENSIONS}))
    assert all(e["agreement"] == 90.0 for e in expl)


def test_quantile_mapping_preserves_rank():
    src = np.array([1, 2, 3, 4, 5], dtype=float)
    tgt = np.array([10, 20, 30, 40, 50], dtype=float)
    p = era_translation.percentile_of(4, src)
    assert p == 70.0
    assert era_translation.quantile_of(p, tgt) == 38.0
    assert np.isnan(era_translation.percentile_of(1, np.array([])))


def test_translate_end_to_end_on_synthetic_pool():
    rng = np.random.default_rng(3)
    rows = []
    for year, key in [(2010, "Old League 2010/11"), (2023, "New League 2023/24")]:
        for i in range(60):
            r = {m: float(rng.normal(1 if year == 2010 else 2, 0.3)) for m in features.TRANSLATION_METRICS}
            r.update({"player_id": year * 1000 + i, "player_season_id": f"{year}_{i}", "display_name": f"P{i}", "season_key": key,
                      "competition_name": key.split(" 20")[0], "season_start_year": year, "position_group": "FW", "position": "ST",
                      "qualifies": True, "minutes": 2000.0, "data_coverage": 100.0, "era": "x", "shot_fidelity_share": 1.0})
            rows.append(r)
    ps = pd.DataFrame(rows)
    cs = pd.DataFrame({"season_key": ["Old League 2010/11", "New League 2023/24"], "sample_type": ["full_season", "full_season"]})
    src = ps.iloc[0]
    out = era_translation.translate(ps, cs, src, ["New League 2023/24"], "target")
    assert out["source_pool"]["scope"] == "season" and out["source_pool"]["size"] == 59  # own row excluded
    m = out["metrics"][0]
    assert m["available"] and 0 <= m["historical_percentile"] <= 100
    assert m["era_adjusted"] > m["historical"]  # target pool sits higher, so mapped value rises
    assert out["confidence"]["level"] in ("high", "medium", "low")
    assert "NOT A LITERAL PREDICTION" in out["label"]
