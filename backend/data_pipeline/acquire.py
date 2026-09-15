"""Download StatsBomb open data for a scope preset and record provenance.

Raw files are stored gzip-compressed under ``data/raw/statsbomb`` exactly as
received.  Nothing here transforms the data; the only decision is *which*
competition-seasons to fetch.
"""
from __future__ import annotations

import gzip
import hashlib
import json
import logging
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

from backend.config import DOWNLOAD_WORKERS, METADATA_DIR, RAW_DIR, SCOPES, STATSBOMB_RAW_BASE
from backend.data_pipeline.sources import statsbomb_commit, write_sources_metadata

log = logging.getLogger(__name__)
SB_RAW = RAW_DIR / "statsbomb"
USER_AGENT = "football-time-machine/1.0 (+university ML project; StatsBomb open data)"


class AcquisitionError(RuntimeError):
    """Raised when a required file cannot be fetched and no verified cache exists."""


def _fetch(url: str, retries: int = 4, timeout: int = 60) -> bytes:
    last: Exception | None = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read()
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError) as exc:
            last = exc
            if isinstance(exc, urllib.error.HTTPError) and exc.code == 404:
                raise
            time.sleep(1.5 * (attempt + 1))
    raise AcquisitionError(f"Failed to fetch {url}: {last}")


def _raw_path(relative: str) -> Path:
    return SB_RAW / (relative + ".gz")


def fetch_json(relative: str, force: bool = False) -> tuple[dict | list, bool]:
    """Fetch ``data/<relative>`` from the open-data repo, returning (json, downloaded_now).

    A verified local copy is used when present (and valid JSON) unless ``force``.
    """
    path = _raw_path(relative)
    if path.exists() and not force:
        try:
            with gzip.open(path, "rt", encoding="utf-8") as fh:
                return json.load(fh), False
        except (OSError, ValueError):
            log.warning("Corrupt cached file %s, re-downloading", path)
    raw = _fetch(STATSBOMB_RAW_BASE + relative)
    data = json.loads(raw)  # validate JSON before writing
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    with gzip.open(tmp, "wb") as fh:
        fh.write(raw)
    tmp.replace(path)
    return data, True


def competitions() -> list[dict]:
    data, _ = fetch_json("competitions.json", force=True)
    return data


def resolve_scope(scope_name: str, comps: list[dict]) -> list[dict]:
    preset = SCOPES[scope_name]
    if not preset.include:
        return [c for c in comps if c["competition_gender"] in preset.genders]
    wanted = []
    for c in comps:
        if c["competition_gender"] not in preset.genders:
            continue
        for comp_id, season_id in preset.include:
            if c["competition_id"] == comp_id and (season_id is None or c["season_id"] == season_id):
                wanted.append(c)
                break
    return wanted


def acquire(scope_name: str, progress: Callable[[str], None] | None = None, workers: int = DOWNLOAD_WORKERS) -> dict:
    """Download everything needed for ``scope_name``. Returns a provenance record."""
    say = progress or (lambda m: log.info(m))
    started = datetime.now(timezone.utc)
    commit = statsbomb_commit()
    say(f"StatsBomb open-data commit: {commit or 'unknown (git unavailable)'}")

    comps = competitions()
    selected = resolve_scope(scope_name, comps)
    say(f"Scope '{scope_name}': {len(selected)} competition-seasons")

    matches: list[dict] = []
    for c in selected:
        rel = f"matches/{c['competition_id']}/{c['season_id']}.json"
        data, _ = fetch_json(rel)
        for m in data:
            if m.get("match_status") != "available":
                continue
            matches.append(m)
    say(f"{len(matches)} matches to fetch (events + lineups)")

    files = [f"events/{m['match_id']}.json" for m in matches] + [f"lineups/{m['match_id']}.json" for m in matches]
    downloaded = cached = 0
    failures: list[str] = []
    done = 0

    def job(rel: str) -> tuple[str, bool | None]:
        try:
            _, new = fetch_json(rel)
            return rel, new
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                return rel, None
            raise

    with ThreadPoolExecutor(max_workers=workers) as ex:
        futures = {ex.submit(job, rel): rel for rel in files}
        for fut in as_completed(futures):
            done += 1
            try:
                rel, new = fut.result()
            except Exception as exc:  # noqa: BLE001 - we record and continue
                failures.append(f"{futures[fut]}: {exc}")
                continue
            if new is None:
                failures.append(f"{rel}: 404")
            elif new:
                downloaded += 1
            else:
                cached += 1
            if done % 200 == 0 or done == len(files):
                say(f"  {done}/{len(files)} files ({downloaded} downloaded, {cached} cached, {len(failures)} failed)")

    if failures and len(failures) > 0.02 * len(files):
        raise AcquisitionError(
            f"{len(failures)} of {len(files)} files could not be fetched and no cache exists. "
            "Check network access and re-run setup; the pipeline never substitutes fabricated data."
        )

    record = {
        "source_id": "statsbomb_open_data",
        "scope": scope_name,
        "retrieved_at": started.isoformat(),
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "upstream_commit": commit,
        "competition_seasons": [
            {
                "competition_id": c["competition_id"],
                "season_id": c["season_id"],
                "competition_name": c["competition_name"],
                "season_name": c["season_name"],
                "gender": c["competition_gender"],
                "country": c.get("country_name"),
            }
            for c in selected
        ],
        "matches": len(matches),
        "files_downloaded": downloaded,
        "files_from_cache": cached,
        "failures": failures,
        "raw_dir": str(SB_RAW),
        "raw_sha256_manifest": str(METADATA_DIR / "raw_manifest.json"),
    }
    (METADATA_DIR / "acquisition.json").write_text(json.dumps(record, indent=2))
    write_sources_metadata({"acquisition": {k: v for k, v in record.items() if k != "competition_seasons"}})
    say("Writing raw file manifest (sha256)…")
    _write_manifest(files)
    return record


def _write_manifest(files: list[str]) -> None:
    manifest = {}
    for rel in files:
        p = _raw_path(rel)
        if p.exists():
            manifest[rel] = hashlib.sha256(p.read_bytes()).hexdigest()
    (METADATA_DIR / "raw_manifest.json").write_text(json.dumps(manifest, indent=1))


def load_acquisition() -> dict | None:
    p = METADATA_DIR / "acquisition.json"
    return json.loads(p.read_text()) if p.exists() else None
