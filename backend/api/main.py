"""FastAPI app exposing the Football Time Machine API and (optionally) the built frontend."""
from __future__ import annotations

import logging
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from backend.config import ARTIFACTS_DIR, DB_PATH, PROCESSED_DIR, PROJECT_DIR
from backend.services import eras as era_svc
from backend.services import players as player_svc
from backend.services.search import search as fuzzy_search
from backend.services.store import DataNotReady, clean, get_store

log = logging.getLogger(__name__)
app = FastAPI(title="Football Time Machine API", version="1.0.0",
              description="Understanding footballers, playing styles and football eras with machine learning.")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.exception_handler(DataNotReady)
async def _not_ready(_: Request, exc: DataNotReady):
    return JSONResponse(status_code=503, content={"detail": str(exc), "hint": "Run `python setup.py` to build the dataset and models."})


@app.get("/api/health")
def health():
    ready = all(p.exists() for p in (PROCESSED_DIR / "player_season.parquet", ARTIFACTS_DIR / "player_features.parquet", DB_PATH))
    return {"status": "ok", "data_ready": ready}


@app.get("/api/data/status")
def data_status():
    s = get_store()
    return clean({
        "dataset_version": s.dataset_version,
        "acquisition": {k: v for k, v in s.acquisition.items() if k != "competition_seasons"},
        "competition_seasons": len(s.cs),
        "model": {k: s.model_meta.get(k) for k in ("model_version", "feature_version", "trained_at", "random_seed", "source_commit")},
        "totals": s.quality.get("totals"),
    })


@app.get("/api/data/sources")
def data_sources():
    s = get_store()
    return clean({**s.sources, "dataset_version": s.dataset_version,
                  "competition_seasons": s.cs.sort_values(["competition_name", "season_start_year"]).to_dict(orient="records")})


@app.get("/api/data-quality")
def data_quality():
    return clean(get_store().quality)


@app.get("/api/models")
def models():
    return clean(get_store().model_meta)


@app.get("/api/search")
def search(q: str = Query(..., min_length=1), limit: int = 12, types: str | None = None):
    t = tuple(types.split(",")) if types else None
    return {"query": q, "results": fuzzy_search(get_store(), q, limit=limit, types=t)}


@app.get("/api/players")
def players(q: str | None = None, limit: int = 50, position_group: str | None = None, min_seasons: int = 1):
    s = get_store()
    if q:
        return {"players": fuzzy_search(s, q, limit=limit, types=("player",))}
    df = s.players
    if position_group:
        df = df[df["primary_position_group"] == position_group]
    df = df[df["seasons"] >= min_seasons].sort_values("total_minutes", ascending=False).head(limit)
    return {"players": clean(df.to_dict(orient="records"))}


@app.get("/api/players/{ident}")
def player(ident: str):
    s = get_store()
    p = s.resolve_player(ident)
    if not p:
        raise HTTPException(404, "Player not found")
    return player_svc.player_profile(s, p["player_id"])


@app.get("/api/players/{ident}/seasons")
def player_seasons(ident: str):
    s = get_store()
    p = s.resolve_player(ident)
    if not p:
        raise HTTPException(404, "Player not found")
    return clean(player_svc.timeline(s, p["player_id"]))


@app.get("/api/players/{ident}/dna")
def player_dna(ident: str, season: str | None = None):
    s = get_store()
    p = s.resolve_player(ident)
    if not p:
        raise HTTPException(404, "Player not found")
    psid = season or s.default_season(p["player_id"])
    if not psid or psid not in s.ps_by_id.index or int(s.ps_by_id.loc[psid, "player_id"]) != p["player_id"]:
        raise HTTPException(404, "Season not found for player")
    stats = player_svc.season_stats(s, psid)
    return stats


@app.get("/api/players/{ident}/similar")
def player_similar(ident: str, season: str | None = None, k: int = 10, same_position_group: bool = False,
                   era: str | None = None, distinct_players: bool = True):
    s = get_store()
    p = s.resolve_player(ident)
    if not p:
        raise HTTPException(404, "Player not found")
    psid = season or s.default_season(p["player_id"])
    res = player_svc.similar_players(s, psid, k=k, same_position_group=same_position_group, era=era, distinct_players=distinct_players) if psid else None
    if res is None:
        return {"source": {"player_season_id": psid}, "results": [], "method": None,
                "reason": "This player-season is not in the modeling population (goalkeeper, below the minutes threshold, or incomplete features)."}
    return res


@app.get("/api/compare")
def compare(a: str, b: str):
    res = player_svc.compare(get_store(), a, b)
    if res is None:
        raise HTTPException(404, "One of the player-seasons was not found")
    return res


@app.get("/api/eras")
def eras():
    return era_svc.eras_overview(get_store())


@app.get("/api/time-machine")
def time_machine():
    return era_svc.time_machine(get_store())


@app.get("/api/era-map")
def era_map(unit: str = "players"):
    return era_svc.era_map(get_store(), unit=unit)


@app.get("/api/era-translation/targets")
def translation_targets():
    return {"targets": era_svc.translation_targets(get_store())}


@app.get("/api/era-translation")
def era_translation(player_season_id: str, target: str = "modern", k: int = 6):
    res = era_svc.era_translation(get_store(), player_season_id, target_id=target, k=k)
    if res is None:
        raise HTTPException(404, "Player-season or target not found")
    return res


@app.get("/api/archetypes")
def archetypes():
    m = get_store().model_meta
    return clean({"archetypes": m["clustering"]["archetypes"], "selected": m["clustering"]["selected"],
                  "naming": m["clustering"]["archetype_naming"]})


# ---------------------------------------------------------------- static frontend (production)
DIST = PROJECT_DIR / "frontend" / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        candidate = DIST / path
        if path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(DIST / "index.html")
