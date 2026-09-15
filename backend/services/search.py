"""Global fuzzy search over players, teams, competitions and seasons.

Every entity is indexed under several aliases (display name, full name,
individual name tokens, surname) so that "xavi", "ronaldo", "mbappe" or
"cristiano ronaldo" all resolve without creating duplicate players: the
aliases point back at one canonical StatsBomb player_id.
"""
from __future__ import annotations

from functools import lru_cache

from rapidfuzz import fuzz, process
from unidecode import unidecode

from backend.services.store import Store


def _norm(s: str) -> str:
    return unidecode(str(s or "")).lower().strip()


@lru_cache(maxsize=1)
def _index(store_id: int, store: Store | None = None):
    assert store is not None
    entries: list[dict] = []
    aliases: list[str] = []
    owner: list[int] = []

    def add(entry: dict, names: set[str]) -> None:
        idx = len(entries)
        entries.append(entry)
        for n in names:
            if n:
                aliases.append(n)
                owner.append(idx)

    for r in store.players.itertuples(index=False):
        disp, full = _norm(r.display_name), _norm(r.player_name)
        names = {disp, full}
        for tok in set(disp.split()) | set(full.split()):
            if len(tok) >= 3:
                names.add(tok)
        parts = full.split()
        if len(parts) > 1:
            names.add(parts[0] + " " + parts[-1])
        add({"type": "player", "id": int(r.player_id), "slug": r.player_slug, "label": r.display_name,
             "sublabel": f"{r.primary_position or '—'} · {r.teams.split(' | ')[0]} · {r.first_season_year}–{r.last_season_year + 1}",
             "weight": float(r.total_minutes)}, names)
    for team, sub in store.ps.groupby("team_name"):
        add({"type": "team", "id": int(sub["team_id"].iloc[0]), "label": team,
             "sublabel": f"{sub['player_id'].nunique()} players · {sub['season'].nunique()} seasons",
             "weight": float(sub["minutes"].sum())}, {_norm(team)} | {t for t in _norm(team).split() if len(t) >= 4})
    for r in store.cs.itertuples(index=False):
        add({"type": "season", "id": r.season_key, "label": r.season_key,
             "sublabel": f"{r.matches} matches · {r.sample_type.replace('_', ' ')}",
             "weight": float(r.matches)}, {_norm(r.season_key), _norm(r.season), _norm(r.season_name)})
    for comp, sub in store.cs.groupby("competition_name"):
        add({"type": "competition", "id": comp, "label": comp, "sublabel": f"{len(sub)} seasons in dataset",
             "weight": float(sub["matches"].sum())}, {_norm(comp)})
    return entries, aliases, owner


def search(store: Store, q: str, limit: int = 12, types: tuple[str, ...] | None = None) -> list[dict]:
    q = _norm(q)
    if not q:
        return []
    entries, aliases, owner = _index(id(store), store)
    hits = process.extract(q, aliases, scorer=fuzz.WRatio, limit=limit * 12, score_cutoff=55)
    best: dict[int, float] = {}
    for alias, score, i in hits:
        e = entries[owner[i]]
        if types and e["type"] not in types:
            continue
        s = float(score)
        if alias == q:
            s += 25
        elif alias.startswith(q):
            s += 10
        s += min(e["weight"] / 15000.0, 6)  # break ties toward well-covered entities
        best[owner[i]] = max(best.get(owner[i], 0.0), s)
    ranked = sorted(best.items(), key=lambda t: -t[1])[:limit]
    return [{k: v for k, v in entries[i].items() if k != "weight"} | {"score": round(s, 1)} for i, s in ranked]
