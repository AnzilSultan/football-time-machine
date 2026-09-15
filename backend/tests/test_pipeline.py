"""Data acquisition, parsing, validation and normalisation tests."""
import gzip
import json

import numpy as np
import pandas as pd
import pytest

from backend.config import SCOPES
from backend.data_pipeline import acquire, normalize, validate
from backend.data_pipeline.parse_events import _union_length, match_length, parse_match, player_minutes
from backend.tests.conftest import make_match


def test_scope_resolution_filters_gender_and_ids():
    comps = [
        {"competition_id": 11, "season_id": 23, "competition_gender": "male"},
        {"competition_id": 11, "season_id": 90, "competition_gender": "male"},
        {"competition_id": 37, "season_id": 4, "competition_gender": "female"},
        {"competition_id": 9, "season_id": 281, "competition_gender": "male"},
        {"competition_id": 9, "season_id": 27, "competition_gender": "male"},
    ]
    sel = acquire.resolve_scope("minimal", comps)
    assert {(c["competition_id"], c["season_id"]) for c in sel} == {(11, 23), (11, 90), (9, 281)}
    assert len(acquire.resolve_scope("full", comps)) == 5
    assert "balanced" in SCOPES


def test_fetch_json_uses_cache(tmp_path, monkeypatch):
    monkeypatch.setattr(acquire, "SB_RAW", tmp_path)
    rel = "matches/1/2.json"
    p = tmp_path / (rel + ".gz")
    p.parent.mkdir(parents=True)
    with gzip.open(p, "wt") as fh:
        json.dump([{"match_id": 1}], fh)
    calls = []
    monkeypatch.setattr(acquire, "_fetch", lambda url, **k: calls.append(url) or b"[]")
    data, downloaded = acquire.fetch_json(rel)
    assert data == [{"match_id": 1}] and downloaded is False and calls == []
    data, downloaded = acquire.fetch_json("matches/3/4.json")
    assert downloaded is True and data == [] and len(calls) == 1


def test_fetch_failure_raises_not_fabricates(monkeypatch, tmp_path):
    monkeypatch.setattr(acquire, "SB_RAW", tmp_path)

    def boom(url, **k):
        raise acquire.AcquisitionError("offline")

    monkeypatch.setattr(acquire, "_fetch", boom)
    with pytest.raises(acquire.AcquisitionError):
        acquire.fetch_json("events/999.json")


def test_union_length_handles_overlaps():
    assert _union_length([(0, 60), (60, 70), (65, 70)]) == 70
    assert _union_length([(0, 10), (20, 30)]) == 20
    assert _union_length([]) == 0


def test_parse_match_counts_and_minutes():
    match, lineups, events = make_match()
    assert abs(match_length(events) - 93.5) < 1e-6
    mins = player_minutes(lineups, 93.5)
    assert abs(mins[1]["minutes"] - 93.5) < 1e-6 and mins[1]["started"]
    assert abs(mins[2]["minutes"] - 70) < 1e-6 and mins[2]["position"] == "CB"
    prow, trow = parse_match(match, lineups, events)
    a = next(r for r in prow if r["player_id"] == 1)
    b = next(r for r in prow if r["player_id"] == 2)
    assert a["goals"] == 1 and a["shots"] == 1 and a["xg"] == 0.4
    assert a["key_passes"] == 1 and a["xa"] == 0.4 and a["passes"] == 1 and a["passes_completed"] == 1
    assert a["progressive_passes"] == 1 and a["progressive_carries"] == 1 and a["dribbles_completed"] == 1
    assert a["touches_penalty_area"] == 1 and a["display_name"] if "display_name" in a else True
    assert b["pressures"] == 1 and b["counterpressures"] == 1 and b["tackles"] == 1 and b["tackles_won"] == 1
    assert b["yellow_cards"] == 1 and b["fouls_committed"] == 1
    home = next(r for r in trow if r["team_id"] == 10)
    assert home["goals_official"] == 1 and home["goals"] == 1 and 0 <= home["possession_share"] <= 1


def test_validation_removes_impossible_rows_and_duplicates():
    match, lineups, events = make_match()
    prow, _ = parse_match(match, lineups, events)
    df = pd.DataFrame(prow)
    df = pd.concat([df, df.iloc[[0]]], ignore_index=True)  # duplicate
    df.loc[1, "minutes"] = -5  # impossible
    out, rep = validate.validate_player_matches(df)
    assert rep.duplicates_removed == 1 and rep.invalid_removed == 1
    assert len(out) == len(df) - 2


def test_schema_errors():
    with pytest.raises(validate.SchemaError):
        validate.validate_match_schema({"match_id": 1})
    with pytest.raises(validate.SchemaError):
        validate.validate_events_schema([], 1)
    with pytest.raises(validate.SchemaError):
        validate.validate_lineups_schema([{"team_id": 1, "lineup": []}], 1)


def test_per90_and_rates_keep_nulls():
    df = pd.DataFrame({"minutes": [900, 0], "goals": [10, 0], "passes": [450, 0], "passes_completed": [400, 0],
                       "dribbles": [0, 0], "dribbles_completed": [0, 0], "shots": [30, 0], "shots_on_target": [10, 0],
                       "xg": [8.0, 0], "aerials_won": [3, 0], "aerials_lost": [1, 0], "tackles": [0, 0], "tackles_won": [0, 0]})
    out = normalize.per90(df, metrics=["goals", "passes"])
    assert out.loc[0, "goals_per90"] == 1.0 and np.isnan(out.loc[1, "goals_per90"])  # zero minutes -> null, not 0
    assert abs(out.loc[0, "pass_completion"] - 400 / 450) < 1e-4
    assert np.isnan(out.loc[0, "dribble_success"])  # no attempts -> undefined, stays null
    assert abs(out.loc[0, "aerial_win_rate"] - 0.75) < 1e-9


def test_season_normalisation():
    assert normalize.normalize_season("2011/2012") == "2011/12"
    assert normalize.normalize_season("2022") == "2022"
    assert normalize.season_start_year("2011/2012") == 2011
    assert normalize.slugify_name("Lionel Andrés Messi") == "lionel-andres-messi"


def test_coverage_and_comparability_scores():
    row = pd.Series({"minutes": 1800, "appearances": 20, "shot_fidelity_share": 1.0, "competition_id": 11, "position_group": "FW",
                     **{f"{m}_per90": 1.0 for m in normalize.COVERAGE_METRICS}})
    assert normalize.coverage_score(row) == 100.0
    thin = row.copy()
    thin["minutes"], thin["appearances"] = 300, 4
    assert normalize.coverage_score(thin) < 60
    comp = normalize.era_comparability(row, thin, 100, 100)
    assert 0 <= comp["score"] <= 100 and any("900 minutes" in r for r in comp["reasons"])
    assert normalize.min_minutes_for(43) == 270 and normalize.min_minutes_for(11) == 900
