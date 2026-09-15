"""Build the clean master dataset from raw StatsBomb files.

Outputs (all under data/processed):
  player_match.parquet   one row per player per match (counting stats)
  team_match.parquet     one row per team per match
  player_season.parquet  master player-season dataset (counts, per-90, rates, coverage)
  team_season.parquet    season-level aggregates for the time machine
  players.parquet        player directory
  competition_seasons.parquet
  football_time_machine.sqlite   the same tables in SQLite
plus data/metadata/quality_report.json and dataset_version.json
"""
from __future__ import annotations

import os

# Parser workers are spawned processes; cap BLAS threads *before* numpy is
# imported so N workers x N BLAS threads cannot exhaust memory (seen on Windows).
for _v in ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "MKL_NUM_THREADS", "NUMEXPR_NUM_THREADS"):
    os.environ.setdefault(_v, "1")

import gzip
import hashlib
import json
import logging
import sqlite3
from concurrent.futures import ProcessPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

import numpy as np
import pandas as pd

from backend.config import DATASET_VERSION, DB_PATH, METADATA_DIR, PROCESSED_DIR, RAW_DIR
from backend.data_pipeline.acquire import load_acquisition
from backend.data_pipeline.normalize import (
    PER90_METRICS, coverage_score, display_name, is_tournament, min_minutes_for, normalize_season,
    per90, season_start_year, slugify_name,
)
from backend.data_pipeline.parse_events import METRIC_DEFINITIONS, PLAYER_COUNT_FIELDS, parse_match
from backend.data_pipeline.validate import (
    validate_events_schema, validate_lineups_schema, validate_match_schema, validate_player_matches,
    validate_team_matches,
)

log = logging.getLogger(__name__)
SB_RAW = RAW_DIR / "statsbomb"


def _load(rel: str):
    with gzip.open(SB_RAW / (rel + ".gz"), "rt", encoding="utf-8") as fh:
        return json.load(fh)


def _process_one(match: dict) -> tuple[list[dict], list[dict], str | None]:
    mid = match["match_id"]
    try:
        validate_match_schema(match)
        events = _load(f"events/{mid}.json")
        lineups = _load(f"lineups/{mid}.json")
        validate_events_schema(events, mid)
        validate_lineups_schema(lineups, mid)
        p, t = parse_match(match, lineups, events)
        return p, t, None
    except FileNotFoundError as exc:
        return [], [], f"match {mid}: missing raw file ({exc.filename})"
    except Exception as exc:  # noqa: BLE001
        return [], [], f"match {mid}: {type(exc).__name__}: {exc}"


def list_scope_matches() -> list[dict]:
    acq = load_acquisition()
    if not acq:
        raise RuntimeError("No acquisition record found. Run the acquire step first.")
    matches = []
    for cs in acq["competition_seasons"]:
        data = _load(f"matches/{cs['competition_id']}/{cs['season_id']}.json")
        for m in data:
            if m.get("match_status") == "available":
                m["_gender"] = cs["gender"]
                m["_country"] = cs.get("country")
                matches.append(m)
    return matches


def default_workers() -> int:
    """Conservative parallelism: each worker imports pandas/numpy (~150 MB)."""
    return max(1, min(4, (os.cpu_count() or 2) - 1))


def parse_all(matches: list[dict], progress: Callable[[str], None] | None = None, workers: int | None = None):
    say = progress or (lambda m: log.info(m))
    workers = workers or default_workers()
    prow, trow, errors = [], [], []
    say(f"  using {workers} parser worker(s)")
    if workers == 1:
        results = map(_process_one, matches)
    else:
        ex = ProcessPoolExecutor(max_workers=workers)
        results = ex.map(_process_one, matches, chunksize=8)
    try:
        for i, (p, t, err) in enumerate(results, 1):
            prow.extend(p)
            trow.extend(t)
            if err:
                errors.append(err)
            if i % 250 == 0 or i == len(matches):
                say(f"  parsed {i}/{len(matches)} matches ({len(errors)} errors)")
    finally:
        if workers > 1:
            ex.shutdown()
    return pd.DataFrame(prow), pd.DataFrame(trow), errors


def _season_key(comp: str, season: str) -> str:
    return f"{comp} {season}"


def _era_label(year: int) -> str:
    if year < 2000:
        return "Pre-2000"
    if year < 2009:
        return "2000s"
    if year < 2015:
        return "Early 2010s"
    if year < 2021:
        return "Late 2010s"
    return "2020s"


def aggregate_player_seasons(pm: pd.DataFrame) -> pd.DataFrame:
    pm = pm.copy()
    pm["season"] = pm["season_name"].map(normalize_season)
    g = pm.groupby(["player_id", "competition_id", "season_id"], sort=False)
    sums = g[PLAYER_COUNT_FIELDS + ["minutes"]].sum()
    meta = g.agg(
        player_name=("player_name", "first"),
        player_nickname=("player_nickname", "first"),
        country=("country", "first"),
        competition_name=("competition_name", "first"),
        season_name=("season_name", "first"),
        season=("season", "first"),
        appearances=("minutes", lambda s: int((s > 0).sum())),
        starts=("started", "sum"),
        matches_in_data=("match_id", "nunique"),
        shot_fidelity_share=("shot_fidelity_version", lambda s: float((s.astype(str) == "2").mean())),
    )
    # dominant position and team by minutes
    pos = (pm.groupby(["player_id", "competition_id", "season_id", "position"])["minutes"].sum()
             .reset_index().sort_values("minutes", ascending=False)
             .drop_duplicates(["player_id", "competition_id", "season_id"])
             .set_index(["player_id", "competition_id", "season_id"])["position"])
    posg = (pm.groupby(["player_id", "competition_id", "season_id", "position_group"])["minutes"].sum()
              .reset_index().sort_values("minutes", ascending=False)
              .drop_duplicates(["player_id", "competition_id", "season_id"])
              .set_index(["player_id", "competition_id", "season_id"])["position_group"])
    team = (pm.groupby(["player_id", "competition_id", "season_id", "team_id", "team_name"])["minutes"].sum()
              .reset_index().sort_values("minutes", ascending=False)
              .drop_duplicates(["player_id", "competition_id", "season_id"])
              .set_index(["player_id", "competition_id", "season_id"])[["team_id", "team_name"]])
    ps = pd.concat([meta, sums, pos.rename("position"), posg.rename("position_group"), team], axis=1).reset_index()
    ps["display_name"] = ps.apply(display_name, axis=1)
    ps["player_slug"] = ps["display_name"].map(slugify_name)
    ps["season_start_year"] = ps["season_name"].map(season_start_year)
    ps["season_key"] = [_season_key(c, s) for c, s in zip(ps["competition_name"], ps["season"])]
    ps["era"] = ps["season_start_year"].map(_era_label)
    ps["is_tournament"] = ps["competition_id"].map(is_tournament)
    ps["min_minutes_threshold"] = ps["competition_id"].map(min_minutes_for)
    ps["qualifies"] = ps["minutes"] >= ps["min_minutes_threshold"]
    ps["age"] = np.nan  # not present in StatsBomb open data - intentionally null
    ps = per90(ps)
    ps["data_coverage"] = ps.apply(coverage_score, axis=1)
    ps["player_season_id"] = ps["player_id"].astype(str) + "_" + ps["competition_id"].astype(str) + "_" + ps["season_id"].astype(str)
    ps["minutes"] = ps["minutes"].round(1)
    return ps


def aggregate_team_seasons(tm: pd.DataFrame, pm: pd.DataFrame) -> pd.DataFrame:
    tm = tm.copy()
    tm["season"] = tm["season_name"].map(normalize_season)
    tm["goals_from_events"] = tm["goals"]
    tm["goals"] = tm["goals_official"]
    g = tm.groupby(["competition_id", "season_id"], sort=False)
    per_match_cols = ["goals", "shots", "xg", "passes", "passes_completed", "progressive_passes", "progressive_carries",
                      "carries", "dribbles", "pressures", "counterpressures", "tackles", "interceptions", "blocks",
                      "clearances", "ball_recoveries", "fouls_committed", "yellow_cards", "red_cards", "aerials_won",
                      "touches_attacking_third", "touches_penalty_area", "high_turnovers", "long_balls"]
    agg = g[per_match_cols].mean().add_suffix("_per_team_match")
    meta = g.agg(
        competition_name=("competition_name", "first"),
        season_name=("season_name", "first"),
        season=("season", "first"),
        matches=("match_id", "nunique"),
        teams=("team_id", "nunique"),
        team_match_rows=("team_id", "size"),
        first_match=("match_date", "min"),
        last_match=("match_date", "max"),
        shot_fidelity_share=("shot_fidelity_version", lambda s: float((s.astype(str) == "2").mean())),
    )
    ts = pd.concat([meta, agg], axis=1).reset_index()
    ts["goals_per_match"] = ts["goals_per_team_match"] * 2
    ts["pass_completion"] = (ts["passes_completed_per_team_match"] / ts["passes_per_team_match"]).round(4)
    ts["xg_per_shot"] = (ts["xg_per_team_match"] / ts["shots_per_team_match"]).round(4)
    ts["long_ball_share"] = (ts["long_balls_per_team_match"] / ts["passes_per_team_match"]).round(4)
    # possession imbalance: mean absolute deviation from 0.5 (how lopsided matches are)
    imb = tm.groupby(["competition_id", "season_id"])["possession_share"].apply(lambda s: float((s - 0.5).abs().mean()))
    ts = ts.merge(imb.rename("possession_imbalance").reset_index(), on=["competition_id", "season_id"], how="left")
    # dominant team share of matches (flags Barcelona-only seasons)
    dom = (tm.groupby(["competition_id", "season_id", "team_name"])["match_id"].nunique().reset_index()
             .sort_values("match_id", ascending=False).drop_duplicates(["competition_id", "season_id"]))
    dom = dom.rename(columns={"team_name": "dominant_team", "match_id": "dominant_team_matches"})
    ts = ts.merge(dom, on=["competition_id", "season_id"], how="left")
    ts["dominant_team_share"] = (ts["dominant_team_matches"] / ts["matches"]).round(3)
    ts["is_tournament"] = ts["competition_id"].map(is_tournament)

    def sample_type(r):
        if r["is_tournament"]:
            return "tournament"
        if r["dominant_team_share"] >= 0.9:
            return "single_team_centric"
        if r["matches"] >= 300:
            return "full_season"
        return "partial_season"

    ts["sample_type"] = ts.apply(sample_type, axis=1)
    ts["season_start_year"] = ts["season_name"].map(season_start_year)
    ts["season_key"] = [_season_key(c, s) for c, s in zip(ts["competition_name"], ts["season"])]
    ts["era"] = ts["season_start_year"].map(_era_label)
    # player-role mix per season
    q = pm[pm["minutes"] > 0].groupby(["competition_id", "season_id", "position_group"])["minutes"].sum().unstack(fill_value=0)
    q = q.div(q.sum(axis=1), axis=0).add_prefix("minutes_share_").reset_index()
    ts = ts.merge(q, on=["competition_id", "season_id"], how="left")
    ts["qualifying_player_seasons"] = np.nan
    return ts


def build_players(ps: pd.DataFrame) -> pd.DataFrame:
    g = ps.sort_values("minutes", ascending=False).groupby("player_id")
    players = g.agg(
        player_name=("player_name", "first"),
        display_name=("display_name", "first"),
        player_slug=("player_slug", "first"),
        country=("country", "first"),
        primary_position=("position", "first"),
        primary_position_group=("position_group", "first"),
        seasons=("season_key", "nunique"),
        total_minutes=("minutes", "sum"),
        total_goals=("goals", "sum"),
        first_season_year=("season_start_year", "min"),
        last_season_year=("season_start_year", "max"),
        teams=("team_name", lambda s: " | ".join(sorted(set(s)))),
        competitions=("competition_name", lambda s: " | ".join(sorted(set(s)))),
    ).reset_index()
    players["total_minutes"] = players["total_minutes"].round(0)
    return players


def quality_report(pm_raw: pd.DataFrame, pm: pd.DataFrame, ps: pd.DataFrame, ts: pd.DataFrame,
                   reports: dict, parse_errors: list[str]) -> dict:
    metric_cols = [f"{m}_per90" for m in PER90_METRICS] + ["pass_completion", "dribble_success", "aerial_win_rate", "age"]
    missing_by_metric = {c: int(ps[c].isna().sum()) for c in metric_cols if c in ps.columns}
    cov_by_season = (ps.groupby("season_key").agg(
        player_seasons=("player_season_id", "size"),
        qualifying=("qualifies", "sum"),
        mean_coverage=("data_coverage", "mean"),
        matches=("matches_in_data", "max"),
    ).round(1).reset_index().to_dict(orient="records"))
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "dataset_version": DATASET_VERSION,
        "totals": {
            "players": int(ps["player_id"].nunique()),
            "player_seasons": int(len(ps)),
            "qualifying_player_seasons": int(ps["qualifies"].sum()),
            "player_matches": int(len(pm)),
            "matches": int(pm["match_id"].nunique()),
            "competitions": int(ps["competition_id"].nunique()),
            "competition_seasons": int(len(ts)),
            "seasons": int(ps["season"].nunique()),
            "teams": int(ps["team_id"].nunique()),
            "first_season": int(ps["season_start_year"].min()),
            "last_season": int(ps["season_start_year"].max()),
        },
        "missing_values": {
            "total_cells_null": int(ps[metric_cols].isna().sum().sum()),
            "by_metric": missing_by_metric,
            "note": "Nulls are genuine gaps (e.g. age is not published in StatsBomb open data; rates are null when the denominator is zero). They are never imputed.",
        },
        "duplicates_removed": {k: v["duplicates_removed"] for k, v in reports.items()},
        "invalid_records_removed": {k: v["invalid_removed"] for k, v in reports.items()},
        "validation": reports,
        "parse_errors": parse_errors,
        "coverage_by_season": cov_by_season,
        "coverage_by_metric": {c: round(100 * (1 - v / max(len(ps), 1)), 1) for c, v in missing_by_metric.items()},
        "sample_types": ts["sample_type"].value_counts().to_dict(),
        "metric_definitions": METRIC_DEFINITIONS,
    }


def write_sqlite(tables: dict[str, pd.DataFrame], path: Path = DB_PATH) -> None:
    if path.exists():
        path.unlink()
    with sqlite3.connect(path) as con:
        for name, df in tables.items():
            df.to_sql(name, con, index=False)
        con.execute("CREATE INDEX idx_ps_player ON player_season(player_id)")
        con.execute("CREATE INDEX idx_ps_key ON player_season(season_key)")
        con.execute("CREATE INDEX idx_pm_player ON player_match(player_id)")
        con.execute("CREATE INDEX idx_players_slug ON players(player_slug)")


def build(progress: Callable[[str], None] | None = None, workers: int | None = None) -> dict:
    say = progress or (lambda m: log.info(m))
    matches = list_scope_matches()
    say(f"Parsing {len(matches)} matches…")
    pm_raw, tm_raw, errors = parse_all(matches, say, workers=workers)
    say("Validating…")
    pm, rep_pm = validate_player_matches(pm_raw)
    tm, rep_tm = validate_team_matches(tm_raw)
    say("Aggregating player-seasons…")
    ps = aggregate_player_seasons(pm)
    say("Aggregating team-seasons…")
    ts = aggregate_team_seasons(tm, pm)
    qual = ps[ps["qualifies"]].groupby(["competition_id", "season_id"]).size().rename("qualifying_player_seasons").reset_index()
    ts = ts.drop(columns=["qualifying_player_seasons"]).merge(qual, on=["competition_id", "season_id"], how="left")
    ts["qualifying_player_seasons"] = ts["qualifying_player_seasons"].fillna(0).astype(int)
    players = build_players(ps)
    cs = ts[["competition_id", "season_id", "competition_name", "season_name", "season", "season_key", "matches",
             "teams", "sample_type", "dominant_team", "dominant_team_share", "is_tournament", "season_start_year",
             "era", "qualifying_player_seasons", "first_match", "last_match"]].copy()
    gender = {(m["competition"]["competition_id"], m["season"]["season_id"]): m["_gender"] for m in matches}
    cs["gender"] = [gender.get((c, s)) for c, s in zip(cs["competition_id"], cs["season_id"])]

    say("Writing processed tables…")
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    tables = {"player_match": pm, "team_match": tm, "player_season": ps, "team_season": ts,
              "players": players, "competition_seasons": cs}
    for name, df in tables.items():
        df.to_parquet(PROCESSED_DIR / f"{name}.parquet", index=False)
    write_sqlite(tables)

    report = quality_report(pm_raw, pm, ps, ts, {"player_match": rep_pm.to_dict(), "team_match": rep_tm.to_dict()}, errors)
    (METADATA_DIR / "quality_report.json").write_text(json.dumps(report, indent=2, default=_json_default))
    h = hashlib.sha256()
    for name in ("player_season", "team_season"):
        h.update((PROCESSED_DIR / f"{name}.parquet").read_bytes())
    acq = load_acquisition() or {}
    version = {
        "dataset_version": DATASET_VERSION,
        "built_at": datetime.now(timezone.utc).isoformat(),
        "scope": acq.get("scope"),
        "source_commit": acq.get("upstream_commit"),
        "retrieved_at": acq.get("retrieved_at"),
        "content_hash": h.hexdigest()[:16],
        "rows": {k: int(len(v)) for k, v in tables.items()},
    }
    (METADATA_DIR / "dataset_version.json").write_text(json.dumps(version, indent=2))
    say(f"Master dataset: {len(ps)} player-seasons, {len(players)} players, {len(ts)} competition-seasons")
    return report


def _json_default(o):
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.floating,)):
        return None if np.isnan(o) else float(o)
    if isinstance(o, (np.bool_,)):
        return bool(o)
    raise TypeError(str(type(o)))
