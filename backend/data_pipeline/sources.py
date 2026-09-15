"""Registry of every external data source with provenance and licensing.

The application never uses data that is not described here.  The registry is
written to ``data/metadata/sources.json`` on each pipeline run together with
the retrieval date and the upstream commit that was fetched.
"""
from __future__ import annotations

import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from backend.config import METADATA_DIR, STATSBOMB_RAW_BASE, STATSBOMB_REPO

SOURCES = [
    {
        "id": "statsbomb_open_data",
        "name": "StatsBomb Open Data",
        "url": STATSBOMB_REPO,
        "raw_base_url": STATSBOMB_RAW_BASE,
        "license": "StatsBomb Public Data User Agreement (non-commercial, attribution required; CC-BY-NC-style terms)",
        "license_url": "https://github.com/statsbomb/open-data/blob/master/LICENSE.pdf",
        "purpose": "Primary and only statistical source: competitions, matches, lineups and full event data.",
        "metrics_obtained": [
            "minutes, starts, appearances (from lineups)",
            "goals, shots, xG, shots on target (Shot events)",
            "passes, completed passes, key passes, assists, xA, progressive passes (Pass events)",
            "carries, progressive carries, carry distance (Carry events)",
            "dribbles attempted / completed (Dribble events)",
            "touches, touches in attacking third and penalty area (on-ball events with locations)",
            "tackles, interceptions, blocks, clearances, ball recoveries (defensive events)",
            "pressures and counterpressures (Pressure events)",
            "aerial duels won / lost",
            "fouls committed, yellow and red cards",
        ],
        "known_limitations": [
            "Coverage is uneven: many La Liga seasons only contain FC Barcelona matches, "
            "so the season population is Barcelona plus its opponents in those games.",
            "Tournament competitions cap players at ~7 matches, so tournament player-seasons are small samples.",
            "No player date of birth is included in the open data, so age is unavailable (left null).",
            "No possession-percentage field is published; pass share is used as a documented proxy.",
            "Progressive pass/carry definitions are computed by this project from coordinates (see METHODOLOGY.md).",
            "Old-fidelity matches (shot_fidelity_version < 2) have coarser xG inputs.",
        ],
    }
]


def statsbomb_commit() -> str | None:
    """Return the upstream master commit SHA, or None if git is unavailable.

    ``git ls-remote`` only needs anonymous read access and no API key.
    """
    try:
        out = subprocess.run(
            ["git", "ls-remote", STATSBOMB_REPO + ".git", "refs/heads/master"],
            capture_output=True, text=True, timeout=30, check=False,
        )
        if out.returncode == 0 and out.stdout.strip():
            return out.stdout.split()[0]
    except (OSError, subprocess.SubprocessError):
        pass
    return None


def write_sources_metadata(extra: dict | None = None) -> Path:
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "sources": SOURCES,
    }
    if extra:
        payload.update(extra)
    path = METADATA_DIR / "sources.json"
    path.write_text(json.dumps(payload, indent=2))
    return path
