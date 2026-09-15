"""Turn one match's lineups + events into per-player and per-team counting stats.

Every metric here is a *count* derived directly from StatsBomb events.  The
exact definitions are documented in METHODOLOGY.md and mirrored in the
``METRIC_DEFINITIONS`` table so the UI can show them.
"""
from __future__ import annotations

from collections import defaultdict
from typing import Any

PITCH_LENGTH = 120.0
PITCH_WIDTH = 80.0

POSITION_MAP = {
    "Goalkeeper": ("GK", "GK"),
    "Right Center Back": ("CB", "DF"), "Left Center Back": ("CB", "DF"), "Center Back": ("CB", "DF"),
    "Right Back": ("FB", "DF"), "Left Back": ("FB", "DF"),
    "Right Wing Back": ("FB", "DF"), "Left Wing Back": ("FB", "DF"),
    "Right Defensive Midfield": ("DM", "MF"), "Left Defensive Midfield": ("DM", "MF"),
    "Center Defensive Midfield": ("DM", "MF"),
    "Right Center Midfield": ("CM", "MF"), "Left Center Midfield": ("CM", "MF"), "Center Midfield": ("CM", "MF"),
    "Right Midfield": ("WM", "MF"), "Left Midfield": ("WM", "MF"),
    "Right Attacking Midfield": ("AM", "AM"), "Left Attacking Midfield": ("AM", "AM"),
    "Center Attacking Midfield": ("AM", "AM"), "Secondary Striker": ("AM", "AM"),
    "Right Wing": ("W", "AM"), "Left Wing": ("W", "AM"),
    "Center Forward": ("ST", "FW"), "Right Center Forward": ("ST", "FW"), "Left Center Forward": ("ST", "FW"),
}

PLAYER_COUNT_FIELDS = [
    "goals", "non_penalty_goals", "shots", "shots_on_target", "penalties_taken", "xg", "npxg",
    "assists", "xa", "key_passes", "passes", "passes_completed", "progressive_passes",
    "passes_into_final_third", "passes_into_box", "crosses", "long_balls",
    "passes_received", "carries", "progressive_carries", "carry_distance", "carries_into_final_third",
    "carries_into_box", "dribbles", "dribbles_completed", "dribbled_past",
    "touches", "touches_attacking_third", "touches_penalty_area", "touches_defensive_third",
    "tackles", "tackles_won", "interceptions", "blocks", "clearances", "ball_recoveries",
    "pressures", "counterpressures", "aerials_won", "aerials_lost", "fouls_committed", "fouls_won",
    "yellow_cards", "red_cards", "dispossessed", "miscontrols", "shots_assisted_xg",
]

TEAM_COUNT_FIELDS = [
    "goals", "shots", "xg", "passes", "passes_completed", "progressive_passes", "progressive_carries",
    "carries", "dribbles", "pressures", "counterpressures", "tackles", "interceptions", "blocks",
    "clearances", "ball_recoveries", "fouls_committed", "yellow_cards", "red_cards", "aerials_won",
    "touches_attacking_third", "touches_penalty_area", "possession_seconds", "high_turnovers", "long_balls",
]

METRIC_DEFINITIONS = {
    "goals": "Shot events with outcome Goal (own goals excluded).",
    "non_penalty_goals": "Goals from shots whose type is not Penalty.",
    "shots": "All Shot events, including penalties.",
    "shots_on_target": "Shots with outcome Goal, Saved or Saved To Post.",
    "xg": "Sum of statsbomb_xg over shots.",
    "npxg": "Sum of statsbomb_xg over non-penalty shots.",
    "assists": "Passes flagged goal_assist.",
    "xa": "Sum of the xG of shots directly assisted by the player's passes (via key_pass_id).",
    "key_passes": "Passes flagged shot_assist (passes leading directly to a shot).",
    "passes": "Pass events attempted (all types incl. set pieces).",
    "passes_completed": "Pass events with no outcome (StatsBomb records outcome only when unsuccessful).",
    "progressive_passes": "Completed open-play passes that move the ball at least 10 yards toward goal, "
                          "excluding those that start in the team's own 40% unless they end in the final third.",
    "passes_into_final_third": "Completed passes that start outside and end inside the attacking third (x >= 80).",
    "passes_into_box": "Completed passes that end inside the penalty area.",
    "crosses": "Passes flagged cross.",
    "long_balls": "Passes of 30+ yards.",
    "passes_received": "Ball Receipt events without a failed outcome.",
    "carries": "Carry events.",
    "progressive_carries": "Carries that move the ball at least 10 yards toward goal (not from own 40%) "
                           "or that enter the penalty area.",
    "carry_distance": "Sum of forward distance (yards) gained by carries.",
    "dribbles": "Dribble events attempted (take-ons).",
    "dribbles_completed": "Dribble events with outcome Complete.",
    "touches": "Passes + completed ball receipts + shots + dribbles + clearances + interceptions + "
               "ball recoveries + blocks + miscontrols (carries excluded to avoid double counting).",
    "touches_attacking_third": "Touches located at x >= 80 (attacking third).",
    "touches_penalty_area": "Touches located inside the opposition penalty area.",
    "touches_defensive_third": "Touches located at x <= 40.",
    "tackles": "Duel events of type Tackle.",
    "tackles_won": "Tackle duels with a winning outcome.",
    "interceptions": "Interception events with a successful outcome (Won / Success variants).",
    "blocks": "Block events.",
    "clearances": "Clearance events.",
    "ball_recoveries": "Ball Recovery events without recovery_failure.",
    "pressures": "Pressure events.",
    "counterpressures": "Pressure events flagged counterpress.",
    "aerials_won": "Events flagged aerial_won (pass, shot, clearance, miscontrol).",
    "aerials_lost": "Duel events of type Aerial Lost.",
    "fouls_committed": "Foul Committed events.",
    "fouls_won": "Foul Won events.",
    "yellow_cards": "Yellow Card / Second Yellow from fouls or bad behaviour.",
    "red_cards": "Red Card / Second Yellow from fouls or bad behaviour.",
    "dispossessed": "Dispossessed events.",
    "miscontrols": "Miscontrol events.",
    "possession_share": "Team share of on-ball possession time within the match (from possession sequences).",
    "minutes": "Minutes on the pitch from lineup position intervals, bounded by the actual match length.",
}

_WIN_OUTCOMES = {"Won", "Success", "Success In Play", "Success Out"}


def _clock(ts: str | None) -> float | None:
    """'67:14' -> 67.233 minutes."""
    if not ts:
        return None
    m, s = ts.split(":")
    return int(m) + int(s) / 60.0


def match_length(events: list[dict]) -> float:
    """Minutes of regulation+extra time from Half End events (falls back to last event)."""
    ends = [e for e in events if e["type"]["name"] == "Half End" and e.get("period", 0) <= 4]
    if ends:
        last = max(ends, key=lambda e: (e["period"], e["minute"], e["second"]))
        return last["minute"] + last["second"] / 60.0
    last = events[-1]
    return last["minute"] + last["second"] / 60.0


def _union_length(intervals: list[tuple[float, float]]) -> float:
    total = 0.0
    cur_end = -1.0
    for s, e in sorted(intervals):
        if s >= cur_end:
            total += e - s
            cur_end = e
        elif e > cur_end:
            total += e - cur_end
            cur_end = e
    return total


def player_minutes(lineups: list[dict], total: float) -> dict[int, dict[str, Any]]:
    """Minutes and dominant position per player from lineup position intervals."""
    out: dict[int, dict[str, Any]] = {}
    for team in lineups:
        for p in team["lineup"]:
            mins_by_pos: dict[str, float] = defaultdict(float)
            started = False
            intervals: list[tuple[float, float]] = []
            for pos in p.get("positions", []):
                if pos.get("start_reason") == "Starting XI":
                    started = True
                start = _clock(pos.get("from")) or 0.0
                end = _clock(pos.get("to"))
                if end is None:
                    end = total
                end = min(end, total)
                if end > start:
                    mins_by_pos[pos["position"]] += end - start
                    intervals.append((start, end))
            # Position intervals occasionally overlap in the source (notably in
            # extra-time matches), so minutes are the length of their *union*.
            minutes = _union_length(intervals)
            position = max(mins_by_pos, key=mins_by_pos.get) if mins_by_pos else None
            out[p["player_id"]] = {
                "player_id": p["player_id"],
                "player_name": p["player_name"],
                "player_nickname": p.get("player_nickname"),
                "team_id": team["team_id"],
                "team_name": team["team_name"],
                "country": (p.get("country") or {}).get("name"),
                "jersey_number": p.get("jersey_number"),
                "minutes": round(minutes, 2),
                "started": started,
                "position_raw": position,
                "position": POSITION_MAP.get(position, (None, None))[0] if position else None,
                "position_group": POSITION_MAP.get(position, (None, None))[1] if position else None,
            }
    return out


def _in_box(loc: list[float] | None) -> bool:
    return bool(loc) and loc[0] >= 102 and 18 <= loc[1] <= 62


def _is_progressive(start: list[float], end: list[float], threshold: float = 10.0) -> bool:
    gain = end[0] - start[0]
    if gain < threshold:
        return False
    if start[0] < 48 and end[0] < 80:  # from own 40% and not into final third
        return False
    return True


def parse_match(match: dict, lineups: list[dict], events: list[dict]) -> tuple[list[dict], list[dict]]:
    """Return (player_rows, team_rows) for one match."""
    total = match_length(events)
    players = player_minutes(lineups, total)
    pstats: dict[int, dict[str, float]] = defaultdict(lambda: {k: 0.0 for k in PLAYER_COUNT_FIELDS})
    tstats: dict[int, dict[str, float]] = defaultdict(lambda: {k: 0.0 for k in TEAM_COUNT_FIELDS})
    xg_by_id: dict[str, float] = {}
    key_pass_shot: list[tuple[str, float]] = []
    pass_owner: dict[str, int] = {}

    team_ids = {t["team_id"] for t in lineups}
    # possession time by team from possession sequences
    poss_time: dict[int, float] = defaultdict(float)
    seq_start: dict[int, float] = {}
    seq_team: dict[int, int] = {}
    for e in events:
        pid = e.get("possession")
        t = (e.get("possession_team") or {}).get("id")
        if pid is None or t is None:
            continue
        ts = e["minute"] * 60 + e["second"]
        if pid not in seq_start:
            seq_start[pid] = ts
            seq_team[pid] = t
        seq_end = ts + (e.get("duration") or 0.0)
        poss_time[pid] = max(poss_time.get(pid, 0.0), seq_end - seq_start[pid])
    for pid, dur in poss_time.items():
        tstats[seq_team[pid]]["possession_seconds"] += dur

    for e in events:
        etype = e["type"]["name"]
        team = (e.get("team") or {}).get("id")
        player = (e.get("player") or {}).get("id")
        loc = e.get("location")
        ps = pstats[player] if player is not None else None
        ts = tstats[team] if team is not None else None

        def touch():
            if ps is None or not loc:
                return
            ps["touches"] += 1
            if loc[0] >= 80:
                ps["touches_attacking_third"] += 1
                if ts is not None:
                    ts["touches_attacking_third"] += 1
            if loc[0] <= 40:
                ps["touches_defensive_third"] += 1
            if _in_box(loc):
                ps["touches_penalty_area"] += 1
                if ts is not None:
                    ts["touches_penalty_area"] += 1

        if etype == "Shot":
            sh = e.get("shot", {})
            xg = float(sh.get("statsbomb_xg") or 0.0)
            xg_by_id[e["id"]] = xg
            outcome = (sh.get("outcome") or {}).get("name")
            is_pen = (sh.get("type") or {}).get("name") == "Penalty"
            if ps is not None:
                ps["shots"] += 1
                ps["xg"] += xg
                if not is_pen:
                    ps["npxg"] += xg
                else:
                    ps["penalties_taken"] += 1
                if outcome == "Goal":
                    ps["goals"] += 1
                    if not is_pen:
                        ps["non_penalty_goals"] += 1
                if outcome in ("Goal", "Saved", "Saved To Post"):
                    ps["shots_on_target"] += 1
                if sh.get("aerial_won"):
                    ps["aerials_won"] += 1
                touch()
            if ts is not None:
                ts["shots"] += 1
                ts["xg"] += xg
                if outcome == "Goal":
                    ts["goals"] += 1
            kp = sh.get("key_pass_id")
            if kp:
                key_pass_shot.append((kp, xg))
        elif etype == "Pass":
            pa = e.get("pass", {})
            end = pa.get("end_location")
            completed = "outcome" not in pa
            if player is not None:
                pass_owner[e["id"]] = player
            if ps is not None:
                ps["passes"] += 1
                if completed:
                    ps["passes_completed"] += 1
                if pa.get("shot_assist"):
                    ps["key_passes"] += 1
                if pa.get("goal_assist"):
                    ps["assists"] += 1
                if pa.get("cross"):
                    ps["crosses"] += 1
                if (pa.get("length") or 0) >= 30:
                    ps["long_balls"] += 1
                if pa.get("aerial_won"):
                    ps["aerials_won"] += 1
                if completed and loc and end:
                    ptype = (pa.get("type") or {}).get("name")
                    open_play = ptype in (None, "Recovery", "Interception")
                    if open_play and _is_progressive(loc, end):
                        ps["progressive_passes"] += 1
                        if ts is not None:
                            ts["progressive_passes"] += 1
                    if loc[0] < 80 <= end[0]:
                        ps["passes_into_final_third"] += 1
                    if _in_box(end) and not _in_box(loc):
                        ps["passes_into_box"] += 1
                touch()
            if ts is not None:
                ts["passes"] += 1
                if completed:
                    ts["passes_completed"] += 1
                if (pa.get("length") or 0) >= 30:
                    ts["long_balls"] += 1
        elif etype == "Ball Receipt*":
            if ps is not None and "outcome" not in (e.get("ball_receipt") or {}):
                ps["passes_received"] += 1
                touch()
        elif etype == "Carry":
            end = (e.get("carry") or {}).get("end_location")
            if ps is not None and loc and end:
                ps["carries"] += 1
                gain = max(0.0, end[0] - loc[0])
                ps["carry_distance"] += gain
                prog = _is_progressive(loc, end) or (_in_box(end) and not _in_box(loc))
                if prog:
                    ps["progressive_carries"] += 1
                    if ts is not None:
                        ts["progressive_carries"] += 1
                if loc[0] < 80 <= end[0]:
                    ps["carries_into_final_third"] += 1
                if _in_box(end) and not _in_box(loc):
                    ps["carries_into_box"] += 1
            if ts is not None:
                ts["carries"] += 1
        elif etype == "Dribble":
            if ps is not None:
                ps["dribbles"] += 1
                if (e.get("dribble", {}).get("outcome") or {}).get("name") == "Complete":
                    ps["dribbles_completed"] += 1
                touch()
            if ts is not None:
                ts["dribbles"] += 1
        elif etype == "Dribbled Past":
            if ps is not None:
                ps["dribbled_past"] += 1
        elif etype == "Duel":
            du = e.get("duel", {})
            dtype = (du.get("type") or {}).get("name")
            outcome = (du.get("outcome") or {}).get("name")
            if ps is not None:
                if dtype == "Tackle":
                    ps["tackles"] += 1
                    if outcome in _WIN_OUTCOMES:
                        ps["tackles_won"] += 1
                    if ts is not None:
                        ts["tackles"] += 1
                elif dtype == "Aerial Lost":
                    ps["aerials_lost"] += 1
        elif etype == "Interception":
            outcome = ((e.get("interception") or {}).get("outcome") or {}).get("name")
            if ps is not None and outcome in _WIN_OUTCOMES:
                ps["interceptions"] += 1
                touch()
                if ts is not None:
                    ts["interceptions"] += 1
        elif etype == "Block":
            if ps is not None:
                ps["blocks"] += 1
                touch()
            if ts is not None:
                ts["blocks"] += 1
        elif etype == "Clearance":
            if ps is not None:
                ps["clearances"] += 1
                if (e.get("clearance") or {}).get("aerial_won"):
                    ps["aerials_won"] += 1
                touch()
            if ts is not None:
                ts["clearances"] += 1
        elif etype == "Ball Recovery":
            if ps is not None and not (e.get("ball_recovery") or {}).get("recovery_failure"):
                ps["ball_recoveries"] += 1
                touch()
                if ts is not None:
                    ts["ball_recoveries"] += 1
                    if loc and loc[0] >= 80:
                        ts["high_turnovers"] += 1
        elif etype == "Pressure":
            if ps is not None:
                ps["pressures"] += 1
                if e.get("counterpress"):
                    ps["counterpressures"] += 1
            if ts is not None:
                ts["pressures"] += 1
                if e.get("counterpress"):
                    ts["counterpressures"] += 1
        elif etype == "Foul Committed":
            card = ((e.get("foul_committed") or {}).get("card") or {}).get("name")
            if ps is not None:
                ps["fouls_committed"] += 1
                _card(ps, card)
            if ts is not None:
                ts["fouls_committed"] += 1
                _card(ts, card)
        elif etype == "Bad Behaviour":
            card = ((e.get("bad_behaviour") or {}).get("card") or {}).get("name")
            if ps is not None:
                _card(ps, card)
            if ts is not None:
                _card(ts, card)
        elif etype == "Foul Won":
            if ps is not None:
                ps["fouls_won"] += 1
        elif etype == "Dispossessed":
            if ps is not None:
                ps["dispossessed"] += 1
        elif etype == "Miscontrol":
            if ps is not None:
                ps["miscontrols"] += 1
                if (e.get("miscontrol") or {}).get("aerial_won"):
                    ps["aerials_won"] += 1
                touch()
        elif etype == "Own Goal For":
            if ts is not None:
                ts["goals"] += 1

    for kp_id, xg in key_pass_shot:
        owner = pass_owner.get(kp_id)
        if owner is not None:
            pstats[owner]["xa"] += xg
            pstats[owner]["shots_assisted_xg"] += xg
    for t in team_ids:
        tstats[t]["aerials_won"] = sum(pstats[p]["aerials_won"] for p in players if players[p]["team_id"] == t and p in pstats)

    total_poss = sum(tstats[t]["possession_seconds"] for t in team_ids) or 1.0
    meta = match.get("metadata") or {}
    base = {
        "match_id": match["match_id"],
        "match_date": match["match_date"],
        "competition_id": match["competition"]["competition_id"],
        "competition_name": match["competition"]["competition_name"],
        "season_id": match["season"]["season_id"],
        "season_name": match["season"]["season_name"],
        "match_length": round(total, 2),
        "data_version": meta.get("data_version"),
        "shot_fidelity_version": meta.get("shot_fidelity_version"),
        "xy_fidelity_version": meta.get("xy_fidelity_version"),
    }
    player_rows = []
    for pid, info in players.items():
        if info["minutes"] <= 0 and pid not in pstats:
            continue
        row = {**base, **info, **{k: round(v, 4) for k, v in pstats[pid].items()}}
        player_rows.append(row)
    team_rows = []
    home, away = match["home_team"], match["away_team"]
    for t in team_ids:
        is_home = t == home["home_team_id"]
        opp = away if is_home else home
        row = {
            **base,
            "team_id": t,
            "team_name": home["home_team_name"] if is_home else away["away_team_name"],
            "opponent_id": opp.get("away_team_id", opp.get("home_team_id")),
            "is_home": is_home,
            "goals_official": (match.get("home_score") if is_home else match.get("away_score")),
            "goals_conceded": (match.get("away_score") if is_home else match.get("home_score")),
            "possession_share": round(tstats[t]["possession_seconds"] / total_poss, 4),
            **{k: round(v, 4) for k, v in tstats[t].items()},
        }
        team_rows.append(row)
    return player_rows, team_rows


def _card(stats: dict, card: str | None) -> None:
    if card in ("Yellow Card",):
        stats["yellow_cards"] += 1
    elif card in ("Second Yellow", "Red Card"):
        stats["red_cards"] += 1
