"""API + database tests against the built dataset (skipped until setup.py has run)."""
import json
import math

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from backend.tests.conftest import requires_data

pytestmark = requires_data


@pytest.fixture(scope="module")
def client():
    from backend.api.main import app
    return TestClient(app)


def _no_nan(obj):
    if isinstance(obj, float):
        assert not math.isnan(obj) and not math.isinf(obj)
    elif isinstance(obj, dict):
        for v in obj.values():
            _no_nan(v)
    elif isinstance(obj, list):
        for v in obj:
            _no_nan(v)


def test_health_and_status(client):
    assert client.get("/api/health").json()["data_ready"] is True
    s = client.get("/api/data/status").json()
    assert s["totals"]["players"] > 1000 and s["dataset_version"]["dataset_version"]


def test_search_finds_messi_once(client):
    r = client.get("/api/search", params={"q": "messi"}).json()["results"]
    assert r[0]["label"] == "Lionel Messi"
    assert sum(1 for x in r if x["label"] == "Lionel Messi") == 1


def test_messi_profile_dna_similar_timeline(client):
    p = client.get("/api/players/5503").json()
    assert p["display_name"] == "Lionel Messi" and p["age"] is None if "age" in p else True
    assert any(s["season_key"] == "La Liga 2011/12" for s in p["seasons_detail"])
    dna = client.get("/api/players/5503/dna", params={"season": "5503_11_23"}).json()
    _no_nan(dna)
    assert dna["summary"]["goals"] == 50  # sourced from StatsBomb events, not hardcoded
    assert len(dna["dna"]["dimensions"]) == 10
    sim = client.get("/api/players/5503/similar", params={"season": "5503_11_23", "k": 5}).json()
    assert len(sim["results"]) == 5 and all(r["player"] != "Lionel Messi" for r in sim["results"])
    assert all(0 <= r["similarity"] <= 100 and r["explanation"] for r in sim["results"])
    tl = client.get("/api/players/5503/seasons").json()
    assert len(tl["seasons"]) >= 15


def test_era_translation_labels_hypothetical(client):
    t = client.get("/api/era-translation", params={"player_season_id": "5503_11_23", "target": "modern"}).json()
    _no_nan(t)
    assert "HYPOTHETICAL" in t["label"] and t["confidence"]["level"] in ("high", "medium", "low")
    assert t["source_pool"]["size"] > 0 and t["target_pool"]["size"] > 0
    assert any(m["available"] for m in t["metrics"])
    assert t["modern_comparison"]["results"]
    assert client.get("/api/era-translation", params={"player_season_id": "nope"}).status_code == 404


def test_time_machine_and_era_map(client):
    tm = client.get("/api/time-machine").json()
    _no_nan(tm)
    assert len(tm["seasons"]) >= 10 and all(s["matches"] >= 6 for s in tm["seasons"])
    assert tm["era_clusters"]
    em = client.get("/api/era-map", params={"unit": "players"}).json()
    assert len(em["points"]) > 1000 and em["explained_variance"]
    em2 = client.get("/api/era-map", params={"unit": "seasons"}).json()
    assert len(em2["points"]) == len(tm["seasons"])


def test_models_quality_sources(client):
    m = client.get("/api/models").json()
    assert m["random_seed"] == 42 and m["pca"]["explained_variance_ratio"]
    assert m["clustering"]["selected"]["silhouette"] is not None
    assert m["similarity"]["selected"]["hit_at_k"] > 0
    q = client.get("/api/data-quality").json()
    assert q["totals"]["player_seasons"] > 0 and "age" in q["missing_values"]["by_metric"]
    s = client.get("/api/data/sources").json()
    assert s["sources"][0]["license"] and s["sources"][0]["url"].startswith("https://github.com/statsbomb")


def test_compare_and_404s(client):
    c = client.get("/api/compare", params={"a": "5503_11_23", "b": "5207_11_23"}).json()
    _no_nan(c)
    assert c["comparability"]["score"] >= 0 and c["metrics"]
    assert client.get("/api/players/0").status_code == 404
    assert client.get("/api/compare", params={"a": "x", "b": "y"}).status_code == 404


def test_sqlite_database_matches_parquet():
    from backend.services.store import get_store
    s = get_store()
    with s.engine.connect() as con:
        n = con.execute(text("SELECT COUNT(*) FROM player_season")).scalar()
        goals = con.execute(text("SELECT goals FROM player_season WHERE player_season_id='5503_11_23'")).scalar()
    assert n == len(s.ps) and goals == 50


def test_model_metadata_reproducibility_fields():
    from backend.config import ARTIFACTS_DIR
    meta = json.loads((ARTIFACTS_DIR / "model_metadata.json").read_text())
    for key in ("model_version", "feature_version", "dataset_version", "random_seed", "trained_at", "source_commit", "parameters"):
        assert key in meta
