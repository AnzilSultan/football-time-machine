import pytest

from backend.config import ARTIFACTS_DIR, DB_PATH, PROCESSED_DIR

DATA_READY = all(p.exists() for p in (PROCESSED_DIR / "player_season.parquet", ARTIFACTS_DIR / "player_features.parquet", DB_PATH))
requires_data = pytest.mark.skipif(not DATA_READY, reason="processed dataset / artifacts not built (run setup.py)")


def make_match():
    """A tiny but structurally faithful synthetic match for unit tests (no real stats implied)."""
    match = {
        "match_id": 1, "match_date": "2020-01-01", "competition": {"competition_id": 11, "competition_name": "La Liga"},
        "season": {"season_id": 90, "season_name": "2020/2021"},
        "home_team": {"home_team_id": 10, "home_team_name": "Home"}, "away_team": {"away_team_id": 20, "away_team_name": "Away"},
        "home_score": 1, "away_score": 0, "metadata": {"shot_fidelity_version": "2"},
    }
    lineups = [
        {"team_id": 10, "team_name": "Home", "lineup": [
            {"player_id": 1, "player_name": "Alpha Player", "player_nickname": "Alpha", "positions": [
                {"position": "Center Forward", "from": "00:00", "to": None, "from_period": 1, "to_period": None, "start_reason": "Starting XI"}]},
            {"player_id": 2, "player_name": "Beta Player", "player_nickname": None, "positions": [
                {"position": "Center Back", "from": "00:00", "to": "60:00", "from_period": 1, "to_period": 2, "start_reason": "Starting XI"},
                {"position": "Right Back", "from": "60:00", "to": "70:00", "from_period": 2, "to_period": 2, "start_reason": "Tactical Shift"},
                {"position": "Right Back", "from": "65:00", "to": "70:00", "from_period": 2, "to_period": 2, "start_reason": "Tactical Shift"}]},
        ]},
        {"team_id": 20, "team_name": "Away", "lineup": [
            {"player_id": 3, "player_name": "Gamma Player", "player_nickname": None, "positions": [
                {"position": "Goalkeeper", "from": "00:00", "to": None, "from_period": 1, "to_period": None, "start_reason": "Starting XI"}]},
        ]},
    ]

    def ev(i, t, minute, **kw):
        base = {"id": f"e{i}", "index": i, "period": 1 if minute < 45 else 2, "timestamp": "00:00:00.000", "minute": minute, "second": 0,
                "type": {"name": t}, "possession": 1, "possession_team": {"id": 10}, "team": {"id": 10}, "duration": 1.0}
        base.update(kw)
        return base

    events = [
        ev(1, "Half Start", 0), ev(2, "Half End", 45),
        ev(3, "Pass", 10, player={"id": 1}, location=[50, 40], pass_={"end_location": [70, 40], "length": 20, "shot_assist": True}),
        ev(4, "Shot", 10, player={"id": 1}, location=[110, 40], shot={"statsbomb_xg": 0.4, "outcome": {"name": "Goal"}, "key_pass_id": "e3"}),
        ev(5, "Carry", 12, player={"id": 1}, location=[50, 40], carry={"end_location": [75, 40]}),
        ev(6, "Dribble", 13, player={"id": 1}, location=[70, 40], dribble={"outcome": {"name": "Complete"}}),
        ev(7, "Pressure", 14, player={"id": 2}, location=[60, 40], counterpress=True),
        ev(8, "Duel", 15, player={"id": 2}, location=[30, 40], duel={"type": {"name": "Tackle"}, "outcome": {"name": "Won"}}),
        ev(9, "Foul Committed", 16, player={"id": 2}, location=[30, 40], foul_committed={"card": {"name": "Yellow Card"}}),
        ev(10, "Half Start", 45), ev(11, "Half End", 93, second=30),
    ]
    for e in events:
        if "pass_" in e:
            e["pass"] = e.pop("pass_")
    return match, lineups, events
