"""Schema validation, duplicate detection and impossible-value checks.

Validation never *fixes* values by inventing data.  Rows that fail hard
checks are dropped and reported; soft anomalies are reported only.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

REQUIRED_PLAYER_MATCH = ["match_id", "player_id", "player_name", "team_id", "minutes", "competition_id", "season_id"]
REQUIRED_MATCH_KEYS = ["match_id", "match_date", "competition", "season", "home_team", "away_team", "home_score", "away_score"]
REQUIRED_EVENT_KEYS = ["id", "type", "period", "minute", "second"]


class SchemaError(ValueError):
    pass


@dataclass
class ValidationReport:
    rows_in: int = 0
    rows_out: int = 0
    duplicates_removed: int = 0
    invalid_removed: int = 0
    issues: list[dict] = field(default_factory=list)

    def add(self, kind: str, count: int, detail: str = "") -> None:
        if count:
            self.issues.append({"kind": kind, "count": int(count), "detail": detail})

    def to_dict(self) -> dict:
        return {
            "rows_in": self.rows_in,
            "rows_out": self.rows_out,
            "duplicates_removed": self.duplicates_removed,
            "invalid_removed": self.invalid_removed,
            "issues": self.issues,
        }


def validate_match_schema(match: dict) -> None:
    missing = [k for k in REQUIRED_MATCH_KEYS if k not in match]
    if missing:
        raise SchemaError(f"match {match.get('match_id')} missing keys {missing}")


def validate_events_schema(events: list[dict], match_id: int) -> None:
    if not events:
        raise SchemaError(f"match {match_id}: empty event list")
    sample = events[: min(50, len(events))]
    for e in sample:
        missing = [k for k in REQUIRED_EVENT_KEYS if k not in e]
        if missing:
            raise SchemaError(f"match {match_id}: event missing keys {missing}")


def validate_lineups_schema(lineups: list[dict], match_id: int) -> None:
    if len(lineups) != 2:
        raise SchemaError(f"match {match_id}: expected 2 lineups, got {len(lineups)}")
    for t in lineups:
        if "lineup" not in t or "team_id" not in t:
            raise SchemaError(f"match {match_id}: malformed lineup")


def validate_player_matches(df: pd.DataFrame) -> tuple[pd.DataFrame, ValidationReport]:
    rep = ValidationReport(rows_in=len(df))
    missing = [c for c in REQUIRED_PLAYER_MATCH if c not in df.columns]
    if missing:
        raise SchemaError(f"player-match table missing columns {missing}")

    dupes = df.duplicated(subset=["match_id", "player_id"], keep="first")
    rep.duplicates_removed = int(dupes.sum())
    rep.add("duplicate_player_match", rep.duplicates_removed, "same player appearing twice in one match")
    df = df.loc[~dupes].copy()

    bad = pd.Series(False, index=df.index)
    neg_minutes = df["minutes"] < 0
    rep.add("negative_minutes", neg_minutes.sum())
    bad |= neg_minutes
    too_long = df["minutes"] > df["match_length"] + 1
    rep.add("minutes_exceed_match_length", too_long.sum())
    bad |= too_long

    count_cols = [c for c in df.columns if df[c].dtype.kind in "fi" and c not in ("match_id", "player_id", "team_id",
                  "competition_id", "season_id", "jersey_number", "minutes", "match_length")]
    negatives = (df[count_cols] < 0).any(axis=1)
    rep.add("negative_counts", negatives.sum())
    bad |= negatives

    # soft checks (reported, not removed)
    rep.add("goals_exceed_shots", int((df["goals"] > df["shots"]).sum()), "kept: indicates event-tagging edge cases")
    rep.add("completed_exceed_passes", int((df["passes_completed"] > df["passes"]).sum()))
    rep.add("zero_minute_rows_with_events", int(((df["minutes"] == 0) & (df["touches"] > 0)).sum()),
            "kept: bench players with an event (e.g. card) but no recorded interval")
    rep.add("missing_position", int(df["position"].isna().sum()), "players with no recognised position label")

    rep.invalid_removed = int(bad.sum())
    df = df.loc[~bad].copy()
    rep.rows_out = len(df)
    return df, rep


def validate_team_matches(df: pd.DataFrame) -> tuple[pd.DataFrame, ValidationReport]:
    rep = ValidationReport(rows_in=len(df))
    dupes = df.duplicated(subset=["match_id", "team_id"], keep="first")
    rep.duplicates_removed = int(dupes.sum())
    df = df.loc[~dupes].copy()
    share_bad = (df["possession_share"] < 0) | (df["possession_share"] > 1) | df["possession_share"].isna()
    rep.add("possession_share_out_of_range", share_bad.sum())
    df.loc[share_bad, "possession_share"] = np.nan  # keep row, null the metric
    mismatch = (df["goals"] != df["goals_official"]).sum()
    rep.add("event_goals_vs_official_score_mismatch", int(mismatch),
            "official score used for team goals; event-derived count kept as goals_from_events")
    rep.rows_out = len(df)
    return df, rep
