# Limitations

Read this before quoting anything the app shows.

## Coverage is uneven, and that is the point

* **Single-team samples.** Most La Liga seasons in StatsBomb open data contain only FC Barcelona's matches (the same applies to PSG 2021–23, Leverkusen 2023/24, Arsenal 2003/04, Inter Miami 2023). A "La Liga 2011/12" aggregate therefore describes Barcelona and its opponents, not the league. Opponents appear in one or two matches each, so almost nobody outside Barcelona reaches 900 minutes. The UI labels these seasons *single-team sample* and the era translator refuses to rank a player against such a season on its own; it widens to a ± *n*-year window of qualifying peers and says so.
* **Only four full league seasons** (La Liga, Premier League, Serie A, Ligue 1 2015/16) plus one partial (ISL 2021/22). The "modern" target pool (2021+) is built from tournaments and single-team league samples, so it over-represents international football.
* **Tournaments** cap a player at ~7 matches, so tournament player-seasons use a 270-minute threshold and carry lower data-coverage scores. Tournament rates are noisier than league rates.
* **No pre-2003 depth.** A few 1970s–1990s finals exist as single matches and are excluded from the era model (fewer than 6 matches). The timeline never pretends to cover decades it does not have.

## What is missing from the source

* **Age** – no date of birth in StatsBomb open data. The column exists and is always null; the UI says "not in source data".
* **League-wide possession %** – not published; possession share is computed from possession-sequence durations per match.
* Height, market value, transfers, injuries, official league tables, non-StatsBomb competitions – absent by design (no other source is used).
* Old-fidelity matches (shot fidelity v1) have coarser shot locations and therefore coarser xG.

## Definitions are ours

Progressive passes / carries, touches, high turnovers and similar composites are computed from coordinates with the definitions in METHODOLOGY.md. They are consistent within this project but will not match FBref/Opta figures exactly.

## Model limitations

* **Archetypes are coarse.** Silhouette scores are modest (0.23–0.39), and the honest selection rule picked 2–3 clusters per position group. Names come from a lexicon matched to data-derived centroids; a name is a summary, not a scouting verdict.
* **Similarity hit@5 is 28 %.** Players change roles, teams and competitions between seasons, so the same player is not always his own nearest neighbour. Treat similarity as "statistically comparable", not "plays the same".
* **Percentiles depend on the pool.** A 99th percentile among 176 forwards in 2007–2016 leagues is not the same claim as among 73 modern forwards. Pool sizes and compositions are shown for every translation.
* **Era translation is quantile mapping, not simulation.** It answers "where would this rank land?", never "how many goals would he score?". The banner *HYPOTHETICAL STATISTICAL COMPARISON — MODEL ESTIMATE — NOT A LITERAL PREDICTION* is not decoration.
* **Sample type confounds the era model.** Full-season leagues cluster together partly because they average every team, whereas single-team samples are dominated by an elite club. The Time Machine states the sample type next to every season.
* **No causal claims.** Player-through-time charts show that profiles change; they do not say why.

## Legal / usage

StatsBomb open data is licensed for non-commercial use with attribution. This project is a non-commercial university piece and attributes StatsBomb throughout. Processed aggregates in `backend/data/processed` are derived works of that data and inherit its terms.
