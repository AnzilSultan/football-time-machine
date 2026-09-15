"""Feature engineering for the player model.

Ten interpretable *DNA dimensions* are built from per-90 metrics that exist
in the dataset.  Each dimension is the mean of standardised (z-scored)
member metrics; percentiles are computed within position group so that a
centre-back's "finishing" is judged against centre-backs.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

DNA_DIMENSIONS: dict[str, list[str]] = {
    "finishing": ["npxg_per90", "non_penalty_goals_per90", "shots_per90", "shots_on_target_per90"],
    "chance_creation": ["xa_per90", "key_passes_per90", "assists_per90", "passes_into_box_per90"],
    "ball_progression": ["progressive_passes_per90", "progressive_carries_per90", "passes_into_final_third_per90",
                         "carries_into_final_third_per90"],
    "passing": ["passes_per90", "passes_completed_per90", "pass_completion", "long_balls_per90"],
    "carrying": ["carries_per90", "carry_distance_per90", "carries_into_box_per90"],
    "dribbling": ["dribbles_per90", "dribbles_completed_per90", "fouls_won_per90"],
    "possession_involvement": ["touches_per90", "passes_received_per90", "touches_attacking_third_per90",
                               "touches_penalty_area_per90"],
    "defensive_activity": ["tackles_per90", "interceptions_per90", "blocks_per90", "clearances_per90",
                           "ball_recoveries_per90"],
    "pressing": ["pressures_per90", "counterpressures_per90"],
    "aerial": ["aerials_won_per90", "aerials_lost_per90"],
}

DIMENSION_LABELS = {
    "finishing": "Finishing",
    "chance_creation": "Chance Creation",
    "ball_progression": "Ball Progression",
    "passing": "Passing",
    "carrying": "Carrying",
    "dribbling": "Dribbling",
    "possession_involvement": "Possession Involvement",
    "defensive_activity": "Defensive Activity",
    "pressing": "Pressing",
    "aerial": "Aerial Contribution",
}

MODEL_FEATURES: list[str] = sorted({m for ms in DNA_DIMENSIONS.values() for m in ms})

# Metrics shown / translated in the era translator (per-90 or rate)
TRANSLATION_METRICS = [
    "non_penalty_goals_per90", "npxg_per90", "shots_per90", "assists_per90", "xa_per90", "key_passes_per90",
    "progressive_passes_per90", "progressive_carries_per90", "passes_per90", "pass_completion",
    "carries_per90", "dribbles_completed_per90", "touches_per90", "touches_penalty_area_per90",
    "tackles_per90", "interceptions_per90", "pressures_per90", "aerials_won_per90",
]

METRIC_LABELS = {
    "non_penalty_goals_per90": "Non-penalty goals /90",
    "goals_per90": "Goals /90",
    "npxg_per90": "npxG /90",
    "xg_per90": "xG /90",
    "shots_per90": "Shots /90",
    "shots_on_target_per90": "Shots on target /90",
    "assists_per90": "Assists /90",
    "xa_per90": "xA /90",
    "key_passes_per90": "Key passes /90",
    "passes_into_box_per90": "Passes into box /90",
    "progressive_passes_per90": "Progressive passes /90",
    "progressive_carries_per90": "Progressive carries /90",
    "passes_into_final_third_per90": "Passes into final third /90",
    "carries_into_final_third_per90": "Carries into final third /90",
    "passes_per90": "Passes /90",
    "passes_completed_per90": "Completed passes /90",
    "pass_completion": "Pass completion",
    "long_balls_per90": "Long balls /90",
    "carries_per90": "Carries /90",
    "carry_distance_per90": "Carry distance /90 (yd)",
    "carries_into_box_per90": "Carries into box /90",
    "dribbles_per90": "Take-ons /90",
    "dribbles_completed_per90": "Successful take-ons /90",
    "fouls_won_per90": "Fouls won /90",
    "touches_per90": "Touches /90",
    "passes_received_per90": "Passes received /90",
    "touches_attacking_third_per90": "Att. third touches /90",
    "touches_penalty_area_per90": "Penalty-area touches /90",
    "tackles_per90": "Tackles /90",
    "interceptions_per90": "Interceptions /90",
    "blocks_per90": "Blocks /90",
    "clearances_per90": "Clearances /90",
    "ball_recoveries_per90": "Ball recoveries /90",
    "pressures_per90": "Pressures /90",
    "counterpressures_per90": "Counterpressures /90",
    "aerials_won_per90": "Aerials won /90",
    "aerials_lost_per90": "Aerials lost /90",
    "dribble_success": "Take-on success",
    "aerial_win_rate": "Aerial win rate",
    "xg_per_shot": "xG per shot",
}

OUTFIELD_GROUPS = ["DF", "MF", "AM", "FW"]


def modeling_population(ps: pd.DataFrame) -> pd.DataFrame:
    """Qualifying outfield player-seasons with a complete feature vector."""
    df = ps[(ps["qualifies"]) & (ps["position_group"].isin(OUTFIELD_GROUPS))].copy()
    complete = df[MODEL_FEATURES].notna().all(axis=1)
    return df.loc[complete].reset_index(drop=True)


def winsorize(df: pd.DataFrame, cols: list[str], lo: float = 0.005, hi: float = 0.995) -> tuple[pd.DataFrame, dict]:
    bounds = {}
    out = df.copy()
    for c in cols:
        a, b = df[c].quantile(lo), df[c].quantile(hi)
        bounds[c] = (float(a), float(b))
        out[c] = df[c].clip(a, b)
    return out, bounds


def percentile_rank(series: pd.Series) -> pd.Series:
    return (series.rank(pct=True, method="average") * 100).round(1)


def dna_from_z(z: pd.DataFrame) -> pd.DataFrame:
    """Collapse per-metric z-scores into the ten DNA dimension z-scores."""
    out = pd.DataFrame(index=z.index)
    for dim, metrics in DNA_DIMENSIONS.items():
        cols = [m for m in metrics if m in z.columns]
        sign = pd.Series(1.0, index=cols)
        if "aerials_lost_per90" in cols:
            sign["aerials_lost_per90"] = -0.5  # losing aerials is partial evidence of aerial involvement, not dominance
        out[dim] = (z[cols] * sign).sum(axis=1) / sign.abs().sum()
    return out


def group_percentiles(df: pd.DataFrame, cols: list[str], by: list[str]) -> pd.DataFrame:
    """Percentile of each column within groups (e.g. position_group)."""
    return df.groupby(by, group_keys=False)[cols].transform(percentile_rank)
