"""Central configuration: paths, data scope presets, thresholds and seeds.

Everything that governs reproducibility lives here so it can be recorded in
model metadata.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BACKEND_DIR.parent
DATA_DIR = Path(os.environ.get("FTM_DATA_DIR", BACKEND_DIR / "data"))
RAW_DIR = DATA_DIR / "raw"
PROCESSED_DIR = DATA_DIR / "processed"
CACHE_DIR = DATA_DIR / "cache"
METADATA_DIR = DATA_DIR / "metadata"
ARTIFACTS_DIR = DATA_DIR / "artifacts"
DB_PATH = PROCESSED_DIR / "football_time_machine.sqlite"

for _d in (RAW_DIR, PROCESSED_DIR, CACHE_DIR, METADATA_DIR, ARTIFACTS_DIR):
    _d.mkdir(parents=True, exist_ok=True)

RANDOM_SEED = 42
DATASET_VERSION = "1.0.0"
FEATURE_VERSION = "1.0.0"
MODEL_VERSION = "1.0.0"

# Minimum minutes for a player-season to enter the similarity / clustering
# population.  League seasons use the classic 900-minute rule; tournaments
# (max ~7 matches) use a lower bar, and that bar is surfaced in the UI.
MIN_MINUTES_LEAGUE = 900
MIN_MINUTES_TOURNAMENT = 270

# StatsBomb open data (https://github.com/statsbomb/open-data)
STATSBOMB_RAW_BASE = "https://raw.githubusercontent.com/statsbomb/open-data/master/data/"
STATSBOMB_REPO = "https://github.com/statsbomb/open-data"

# StatsBomb competition ids
LA_LIGA, PREMIER_LEAGUE, SERIE_A, LIGUE_1, BUNDESLIGA = 11, 2, 12, 7, 9
CHAMPIONS_LEAGUE, WORLD_CUP, EURO, COPA_AMERICA, AFCON, MLS, ISL = 16, 43, 55, 223, 1267, 44, 1238

TOURNAMENT_COMPETITIONS = {CHAMPIONS_LEAGUE, WORLD_CUP, EURO, COPA_AMERICA, AFCON, 53, 72, 87, 35, 1470}


@dataclass
class ScopePreset:
    name: str
    description: str
    # list of (competition_id, season_id) or (competition_id, None) for all seasons
    include: list[tuple[int, int | None]] = field(default_factory=list)
    genders: tuple[str, ...] = ("male",)


SCOPES: dict[str, ScopePreset] = {
    "minimal": ScopePreset(
        name="minimal",
        description="Messi's La Liga seasons, one full modern league season and one tournament.",
        include=[(LA_LIGA, None), (BUNDESLIGA, 281), (WORLD_CUP, 106)],
    ),
    "balanced": ScopePreset(
        name="balanced",
        description=(
            "All La Liga seasons (2004/05-2020/21), the four full 2015/16 league seasons, "
            "Premier League 2003/04, and every modern (2021+) men's competition in the open data."
        ),
        include=[
            (LA_LIGA, None),
            (PREMIER_LEAGUE, None),
            (SERIE_A, None),
            (LIGUE_1, None),
            (BUNDESLIGA, None),
            (WORLD_CUP, 3),
            (WORLD_CUP, 106),
            (EURO, None),
            (COPA_AMERICA, None),
            (AFCON, None),
            (MLS, None),
            (ISL, None),
            (CHAMPIONS_LEAGUE, None),
        ],
    ),
    "full": ScopePreset(
        name="full",
        description="Every competition-season in StatsBomb open data, men's and women's.",
        include=[],
        genders=("male", "female"),
    ),
}

DEFAULT_SCOPE = os.environ.get("FTM_DATA_SCOPE", "balanced")
DOWNLOAD_WORKERS = int(os.environ.get("FTM_DOWNLOAD_WORKERS", "8"))
API_HOST = os.environ.get("FTM_API_HOST", "127.0.0.1")
API_PORT = int(os.environ.get("FTM_API_PORT", "8000"))
