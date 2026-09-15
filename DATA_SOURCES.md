# Data sources

Football Time Machine uses exactly **one** external statistical source. No paid APIs, no API keys, no scraping. FBref and similar sites are not read by the pipeline; they may be used by a human as a manual cross-check (see METHODOLOGY.md → Verification).

## StatsBomb Open Data

| Field | Value |
|---|---|
| Source | StatsBomb Open Data |
| URL | https://github.com/statsbomb/open-data (the `hudl/open-data` link redirects here) |
| Raw files | `https://raw.githubusercontent.com/statsbomb/open-data/master/data/{competitions,matches,lineups,events}/…` |
| License | StatsBomb Public Data User Agreement – free for non-commercial use with attribution; see `LICENSE.pdf` in the repository and LICENSES.md |
| Retrieval | Recorded per run in `backend/data/metadata/acquisition.json` (`retrieved_at`, `upstream_commit` from `git ls-remote`, files downloaded / cached, failures) |
| Version | Upstream master commit at retrieval (build used in this repo: `4b73468fc5b0f1950f9f66fada70ad3a4f9327cb`, retrieved 2026-09-15) |
| Integrity | `backend/data/metadata/raw_manifest.json` holds a SHA-256 for every raw file |
| Purpose | Competitions, matches, lineups (minutes, positions, starts) and full event data from which every player and team statistic is computed |
| Metrics obtained | minutes, starts, appearances, goals, non-penalty goals, shots, shots on target, xG, npxG, assists, xA, key passes, passes, completed passes, progressive passes, passes into final third / box, crosses, long balls, passes received, carries, progressive carries, carry distance, carries into final third / box, take-ons attempted / completed, dribbled past, touches (total, attacking third, penalty area, defensive third), tackles, tackles won, interceptions, blocks, clearances, ball recoveries, pressures, counterpressures, aerials won / lost, fouls committed / won, yellow / red cards, dispossessed, miscontrols; team-level possession share, goals, shots, xG, passes, pressures, high turnovers |
| Not available (kept null) | age / date of birth, player height, market value, official league-wide possession %, any metric for matches not in the open data |

### Scope presets (`backend/config.py`)

* **minimal** – every La Liga season in the open data (2004/05–2020/21, Barcelona-centric), 1. Bundesliga 2023/24, FIFA World Cup 2022.
* **balanced (default)** – all men's La Liga, Premier League, Serie A, Ligue 1 and Bundesliga seasons in the open data (this includes the four full 2015/16 league seasons and Premier League 2003/04), World Cups 2018 & 2022, Euro 2020 & 2024, Copa América 2024, AFCON 2023, MLS 2023, ISL 2021/22 and the Champions League finals. 53 competition-seasons, 2,622 matches.
* **full** – every competition-season in the repository, men's and women's.

### Sample types

Each competition-season is tagged so the UI can say what it really contains:

* `full_season` – (almost) every match of the competition (e.g. Premier League 2015/16, 380 matches)
* `partial_season` – a substantial but incomplete season (ISL 2021/22)
* `single_team_centric` – ≥ 90 % of matches involve one club (Barcelona-only La Liga seasons, PSG-only Ligue 1 2021–23, Leverkusen-only Bundesliga 2023/24, Arsenal 2003/04, Inter Miami MLS 2023)
* `tournament` – international or knock-out competitions (max ~7 matches per player)

### Provenance files written by the pipeline

* `backend/data/metadata/sources.json` – this registry plus the acquisition summary
* `backend/data/metadata/acquisition.json` – scope, competition-seasons, timestamps, commit, counts, failures
* `backend/data/metadata/raw_manifest.json` – SHA-256 per raw file
* `backend/data/metadata/dataset_version.json` – dataset version, content hash, row counts
* `backend/data/metadata/quality_report.json` – validation, duplicates, invalid rows, coverage by season / metric, metric definitions

### Failure policy

If a required file cannot be fetched after retries the acquisition raises `AcquisitionError`. `setup.py` then reuses a previously verified processed dataset **only if one exists**; otherwise it stops. No synthetic or placeholder data is ever generated.
