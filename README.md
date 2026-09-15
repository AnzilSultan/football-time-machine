---
title: Football Time Machine
emoji: ⚽
colorFrom: green
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
---

# Football Time Machine

**Understanding footballers, playing styles and football eras with machine learning.**

> Football statistics are not timeless. A number means something different depending on era, position, competition, tactical environment and data availability. Football Time Machine uses machine learning to make historical football comparisons more meaningful while being transparent about uncertainty.

Three experiences, one dataset, one model stack:

| Mode | Question | What it does |
|---|---|---|
| **Era Translator** | *What if Messi played today?* | Ranks a historical season against its own era, then quantile-maps it into a modern population of the same position group. Every output is labelled **HYPOTHETICAL STATISTICAL COMPARISON · MODEL ESTIMATE · NOT A LITERAL PREDICTION**. |
| **Player DNA** | *Who actually plays like this player?* | Ten-dimension statistical fingerprint, validated k-NN similarity with per-dimension explanations, data-derived archetypes, PCA position, player-through-time timeline. |
| **Football Time Machine / Era Map** | *How has football changed?* | Season-level aggregates standardised, projected with PCA and clustered into eras (K-Means / Ward / DBSCAN scored by silhouette and Davies-Bouldin), with an interactive scrubber and a zoomable PCA map of players or seasons. |

Plus **Compare** (any two seasons, with an era-comparability score), **ML Lab** (full methodology with the numbers that came out of training) and **Data** (quality report + provenance).

Everything on screen is either **sourced** (StatsBomb events), **calculated** (documented definitions), **modelled** (validation shown) or **hypothetical** (labelled). Nothing is hardcoded: Messi's default season is found by search at runtime, similarity scores and cluster assignments are read from trained artifacts, and missing values stay `null`.

## Quick start

Requirements: Python 3.10+, Node.js 18+, ~2 GB disk, internet access to `raw.githubusercontent.com` for the first run.

```bash
python setup.py      # check env, install deps, download StatsBomb open data, validate, build DB, train models, build UI
python start.py      # http://127.0.0.1:8000
```

`setup.py` options: `--scope minimal|balanced|full` (default balanced ≈ 2,600 matches, ~10–15 min), `--skip-download` (use cached raw files), `--skip-frontend`. `start.py --dev` runs the Vite dev server with hot reload alongside the API.

If the download fails and no verified cache exists, setup **stops with a clear error**. It never substitutes fabricated data.

## What the balanced scope contains (as built)

* 2,622 matches of StatsBomb event data (commit `4b73468f…`), 74,253 player-match rows → **13,445 player-seasons for 7,015 players** across 53 competition-seasons (12 competitions, 1970–2024).
* 2,929 player-seasons qualify by minutes (≥ 900 league / ≥ 270 tournament); **2,661 outfield player-seasons** form the modelling population.
* Coverage is uneven and deliberately visible: 24 competition-seasons are *single-team samples* (e.g. Barcelona-only La Liga seasons 2004/05–2020/21), 24 are tournaments, 4 are full league seasons (La Liga, Premier League, Serie A, Ligue 1 2015/16) and 1 is a partial season (ISL 2021/22). Sample type is shown wherever it matters.

## Architecture

```
backend/
  config.py            paths, scope presets, thresholds, seeds
  data_pipeline/       sources.py (provenance) · acquire.py (download + cache + manifest)
                       parse_events.py (event → counts) · validate.py · normalize.py · build.py (master dataset, SQLite, quality report)
  models/              features.py (DNA dimensions) · clustering.py · similarity.py · era_translation.py · time_machine.py · train.py
  services/            store.py (parquet + SQLAlchemy/SQLite) · players.py · eras.py · search.py
  api/main.py          FastAPI (also serves frontend/dist)
  tests/               pytest suite + Playwright browser_check.py
  data/                raw/ processed/ cache/ metadata/ artifacts/
frontend/              React 19 · TypeScript · Vite · Tailwind v4 · Radix (shadcn-style) · Recharts · D3 · Framer Motion · Lucide
```

### API

`/api/health` · `/api/data/status` · `/api/data/sources` · `/api/data-quality` · `/api/models` · `/api/search?q=` · `/api/players` · `/api/players/{id|slug}` · `/api/players/{id}/seasons` · `/api/players/{id}/dna?season=` · `/api/players/{id}/similar?season=&k=&same_position_group=&distinct_players=` · `/api/compare?a=&b=` · `/api/eras` · `/api/time-machine` · `/api/era-map?unit=players|seasons` · `/api/era-translation/targets` · `/api/era-translation?player_season_id=&target=` · `/api/archetypes`. Interactive docs at `/docs`.

## Tests

```bash
python -m pytest backend/tests -q            # 27 tests: acquisition, validation, per-90, era normalisation, PCA, clustering, similarity, translation, API, SQLite
python backend/tests/browser_check.py        # Playwright: every route on desktop + mobile, console errors, NaN scan, empty charts, interactions
```

## Documentation

* [DATA_SOURCES.md](DATA_SOURCES.md) – provenance, license, retrieval, scope
* [METHODOLOGY.md](METHODOLOGY.md) – metric definitions, normalisation, features, PCA, clustering, similarity, era translation, scores
* [LIMITATIONS.md](LIMITATIONS.md) – what this can and cannot claim
* [LICENSES.md](LICENSES.md) – code and data licenses
* [DEPLOY.md](DEPLOY.md) – free hosting on Render (Docker) and alternatives

## Reproducibility

`backend/data/artifacts/model_metadata.json` records dataset/feature/model versions, the dataset content hash, the upstream StatsBomb commit, random seed (42), every parameter, all candidate scores and the training timestamp. `backend/data/metadata/` holds the acquisition record, raw-file SHA-256 manifest, quality report and dataset version.

---
Built as a university machine-learning project. Data © StatsBomb, used under the StatsBomb public data user agreement (non-commercial, attribution required).
