"""In-memory data store backed by the processed parquet files, ML artifacts and SQLite."""
from __future__ import annotations

import json
import math
from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd
from sqlalchemy import MetaData, Table, create_engine, select

from backend.config import ARTIFACTS_DIR, DB_PATH, METADATA_DIR, PROCESSED_DIR


class DataNotReady(RuntimeError):
    pass


def _read_json(path: Path) -> dict | None:
    return json.loads(path.read_text()) if path.exists() else None


class Store:
    def __init__(self) -> None:
        required = [PROCESSED_DIR / "player_season.parquet", ARTIFACTS_DIR / "player_features.parquet", DB_PATH]
        missing = [str(p) for p in required if not p.exists()]
        if missing:
            raise DataNotReady("Processed data / ML artifacts are missing. Run `python setup.py` first. Missing: " + ", ".join(missing))
        self.ps = pd.read_parquet(PROCESSED_DIR / "player_season.parquet")
        self.players = pd.read_parquet(PROCESSED_DIR / "players.parquet")
        self.cs = pd.read_parquet(PROCESSED_DIR / "competition_seasons.parquet")
        self.ts = pd.read_parquet(PROCESSED_DIR / "team_season.parquet")
        self.feat = pd.read_parquet(ARTIFACTS_DIR / "player_features.parquet")
        self.neighbors = pd.read_parquet(ARTIFACTS_DIR / "neighbors.parquet")
        self.tm = pd.read_parquet(ARTIFACTS_DIR / "time_machine_seasons.parquet")
        sim = np.load(ARTIFACTS_DIR / "similarity_space.npz", allow_pickle=True)
        self.sim_X = sim["X"]
        self.sim_ids = {pid: i for i, pid in enumerate(sim["ids"].tolist())}
        self.model_meta = _read_json(ARTIFACTS_DIR / "model_metadata.json") or {}
        self.quality = _read_json(METADATA_DIR / "quality_report.json") or {}
        self.sources = _read_json(METADATA_DIR / "sources.json") or {}
        self.acquisition = _read_json(METADATA_DIR / "acquisition.json") or {}
        self.dataset_version = _read_json(METADATA_DIR / "dataset_version.json") or {}
        self.ps_by_id = self.ps.set_index("player_season_id", drop=False)
        self.feat_by_id = self.feat.set_index("player_season_id", drop=False)
        self.neighbors_by_id = self.neighbors.groupby("player_season_id")
        self.engine = create_engine(f"sqlite:///{DB_PATH}", future=True)
        md = MetaData()
        self.t_players = Table("players", md, autoload_with=self.engine)
        self.t_player_season = Table("player_season", md, autoload_with=self.engine)

    # ----------------------------------------------------------------- helpers
    def player_row(self, player_id: int) -> dict | None:
        with self.engine.connect() as con:
            row = con.execute(select(self.t_players).where(self.t_players.c.player_id == player_id)).mappings().first()
        return clean(dict(row)) if row else None

    def player_seasons(self, player_id: int) -> pd.DataFrame:
        return self.ps[self.ps["player_id"] == player_id].sort_values(["season_start_year", "competition_name"])

    def resolve_player(self, ident: str | int) -> dict | None:
        """Accept a numeric id or a slug."""
        try:
            return self.player_row(int(ident))
        except (TypeError, ValueError):
            pass
        with self.engine.connect() as con:
            row = con.execute(select(self.t_players).where(self.t_players.c.player_slug == str(ident))).mappings().first()
        return clean(dict(row)) if row else None

    def default_season(self, player_id: int) -> str | None:
        """Best-covered qualifying season, preferring the modeling population."""
        f = self.feat[self.feat["player_id"] == player_id]
        if len(f):
            return f.sort_values(["data_coverage", "minutes"], ascending=False).iloc[0]["player_season_id"]
        s = self.player_seasons(player_id)
        if len(s):
            return s.sort_values("minutes", ascending=False).iloc[0]["player_season_id"]
        return None


def clean(obj):
    """Recursively convert numpy / NaN values into JSON-safe Python values (NaN -> None)."""
    if isinstance(obj, dict):
        return {k: clean(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [clean(v) for v in obj]
    if isinstance(obj, pd.Series):
        return clean(obj.to_dict())
    if isinstance(obj, pd.DataFrame):
        return [clean(r) for r in obj.to_dict(orient="records")]
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating, float)):
        return None if (obj is None or math.isnan(obj) or math.isinf(obj)) else float(obj)
    if isinstance(obj, (np.bool_,)):
        return bool(obj)
    if obj is pd.NaT:
        return None
    return obj


@lru_cache(maxsize=1)
def get_store() -> Store:
    return Store()
