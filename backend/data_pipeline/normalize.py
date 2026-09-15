"""Name / team / season normalisation, per-90 metrics and coverage scores."""
from __future__ import annotations

import re

import numpy as np
import pandas as pd
from unidecode import unidecode

from backend.config import MIN_MINUTES_LEAGUE, MIN_MINUTES_TOURNAMENT, TOURNAMENT_COMPETITIONS

# Raw counting metrics converted to per-90 for the master dataset.
PER90_METRICS = [
    "goals", "non_penalty_goals", "shots", "shots_on_target", "xg", "npxg", "assists", "xa", "key_passes",
    "passes", "passes_completed", "progressive_passes", "passes_into_final_third", "passes_into_box", "crosses",
    "long_balls", "passes_received", "carries", "progressive_carries", "carry_distance", "carries_into_final_third",
    "carries_into_box", "dribbles", "dribbles_completed", "dribbled_past", "touches", "touches_attacking_third",
    "touches_penalty_area", "touches_defensive_third", "tackles", "tackles_won", "interceptions", "blocks",
    "clearances", "ball_recoveries", "pressures", "counterpressures", "aerials_won", "aerials_lost",
    "fouls_committed", "fouls_won", "dispossessed", "miscontrols",
]

# Metrics whose availability defines the data-coverage score (all come from
# StatsBomb events, so availability is uniform per match; coverage therefore
# reflects sample size and fidelity rather than metric existence).
COVERAGE_METRICS = ["goals", "shots", "xg", "passes", "progressive_passes", "carries", "dribbles", "touches",
                    "tackles", "interceptions", "pressures", "aerials_won", "key_passes", "xa"]


def slugify_name(name: str) -> str:
    s = unidecode(name or "").lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s


def normalize_season(season_name: str) -> str:
    """'2011/2012' -> '2011/12'; '2022' stays '2022'."""
    m = re.fullmatch(r"(\d{4})/(\d{4})", season_name)
    if m:
        return f"{m.group(1)}/{m.group(2)[2:]}"
    return season_name


def season_start_year(season_name: str) -> int:
    return int(season_name[:4])


def display_name(row: pd.Series) -> str:
    nick = row.get("player_nickname")
    if isinstance(nick, str) and nick.strip():
        return nick.strip()
    return row["player_name"]


def per90(df: pd.DataFrame, metrics: list[str] = PER90_METRICS) -> pd.DataFrame:
    out = df.copy()
    mins = out["minutes"].replace(0, np.nan)
    for m in metrics:
        if m in out.columns:
            out[f"{m}_per90"] = (out[m] / mins * 90).round(4)
    out["pass_completion"] = (out["passes_completed"] / out["passes"].replace(0, np.nan)).round(4)
    out["dribble_success"] = (out["dribbles_completed"] / out["dribbles"].replace(0, np.nan)).round(4)
    out["shot_accuracy"] = (out["shots_on_target"] / out["shots"].replace(0, np.nan)).round(4)
    out["xg_per_shot"] = (out["xg"] / out["shots"].replace(0, np.nan)).round(4)
    out["aerial_win_rate"] = (out["aerials_won"] / (out["aerials_won"] + out["aerials_lost"]).replace(0, np.nan)).round(4)
    out["tackle_win_rate"] = (out["tackles_won"] / out["tackles"].replace(0, np.nan)).round(4)
    out["goals_minus_xg"] = (out["goals"] - out["xg"]).round(4)
    return out


def is_tournament(competition_id: int) -> bool:
    return competition_id in TOURNAMENT_COMPETITIONS


def min_minutes_for(competition_id: int) -> int:
    return MIN_MINUTES_TOURNAMENT if is_tournament(competition_id) else MIN_MINUTES_LEAGUE


def coverage_score(row: pd.Series) -> float:
    """0-100 score of how much usable information a player-season carries.

    Components: minutes (sample size, 50%), matches (20%), event fidelity (15%),
    metric availability (15%).  Missing metrics are *never* filled; the score
    simply reflects them.
    """
    minutes = float(row.get("minutes") or 0)
    matches = float(row.get("appearances") or 0)
    minute_part = min(minutes / 1800.0, 1.0)
    match_part = min(matches / 20.0, 1.0)
    fidelity = row.get("shot_fidelity_share", 1.0)
    fidelity_part = float(fidelity) if fidelity == fidelity else 0.5
    avail = [row.get(f"{m}_per90") for m in COVERAGE_METRICS]
    avail_part = sum(1 for v in avail if v is not None and v == v) / len(COVERAGE_METRICS)
    return round(100 * (0.5 * minute_part + 0.2 * match_part + 0.15 * fidelity_part + 0.15 * avail_part), 1)


def era_comparability(a: pd.Series, b: pd.Series, pool_a: int, pool_b: int) -> dict:
    """How safely two player-seasons can be compared (0-100 with reasons)."""
    metrics_a = {m for m in COVERAGE_METRICS if a.get(f"{m}_per90") == a.get(f"{m}_per90") and a.get(f"{m}_per90") is not None}
    metrics_b = {m for m in COVERAGE_METRICS if b.get(f"{m}_per90") == b.get(f"{m}_per90") and b.get(f"{m}_per90") is not None}
    overlap = len(metrics_a & metrics_b) / len(COVERAGE_METRICS)
    min_part = min(min(float(a["minutes"]), float(b["minutes"])) / 1800.0, 1.0)
    pool_part = min(min(pool_a, pool_b) / 60.0, 1.0)
    same_type = 1.0 if is_tournament(int(a["competition_id"])) == is_tournament(int(b["competition_id"])) else 0.6
    same_pos = 1.0 if a.get("position_group") == b.get("position_group") else 0.7
    score = 100 * (0.35 * overlap + 0.25 * min_part + 0.2 * pool_part) * same_type * same_pos
    reasons = []
    if overlap < 1:
        reasons.append(f"Only {overlap:.0%} of key metrics available for both seasons")
    if min_part < 0.5:
        reasons.append("Fewer than 900 minutes in at least one season")
    if pool_part < 0.5:
        reasons.append(f"Small reference population ({min(pool_a, pool_b)} qualifying player-seasons)")
    if same_type < 1:
        reasons.append("Comparing a league season with a tournament")
    if same_pos < 1:
        reasons.append("Different position groups")
    return {"score": round(score, 1), "reasons": reasons, "metric_overlap": round(overlap, 3)}
