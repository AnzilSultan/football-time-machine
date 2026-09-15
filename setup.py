#!/usr/bin/env python3
"""One-shot setup for Football Time Machine.

    python setup.py                 # balanced scope (default)
    python setup.py --scope minimal # quickest
    python setup.py --scope full    # every StatsBomb open competition
    python setup.py --skip-download # rebuild from cached raw files only
    python setup.py --skip-frontend # backend + data + models only

Steps: check environment -> install dependencies -> download permitted datasets
-> validate -> build the master dataset + SQLite -> train ML artifacts -> build
the frontend.  If the download fails and no verified cache exists the script
stops with a clear error; it never substitutes fabricated data.
"""
from __future__ import annotations

import argparse
import os

for _v in ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "MKL_NUM_THREADS"):
    os.environ.setdefault(_v, "2")
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
os.chdir(ROOT)
sys.path.insert(0, str(ROOT))

T0 = time.time()


def say(msg: str) -> None:
    print(f"[{time.time() - T0:6.0f}s] {msg}", flush=True)


def run(cmd: list[str], **kw) -> None:
    say("$ " + " ".join(cmd))
    subprocess.run(cmd, check=True, **kw)


def check_environment(need_node: bool) -> None:
    say(f"Python {sys.version.split()[0]} at {sys.executable}")
    if sys.version_info < (3, 10):
        sys.exit("Python 3.10+ is required.")
    if need_node:
        node = shutil.which("node")
        npm = shutil.which("npm")
        if not node or not npm:
            sys.exit("Node.js 18+ and npm are required to build the frontend (or pass --skip-frontend).")
        say("node " + subprocess.run([node, "--version"], capture_output=True, text=True).stdout.strip())
    free_gb = shutil.disk_usage(ROOT).free / 1e9
    say(f"Free disk: {free_gb:.1f} GB (balanced scope needs ~2 GB for raw + processed data)")
    if free_gb < 2:
        say("WARNING: low disk space")


def install_python_deps() -> None:
    cmd = [sys.executable, "-m", "pip", "install", "-q", "-r", "requirements.txt"]
    if os.environ.get("PIP_BREAK_SYSTEM_PACKAGES") or not (sys.prefix != sys.base_prefix):
        cmd.append("--break-system-packages")
    try:
        run(cmd)
    except subprocess.CalledProcessError:
        say("pip install with --break-system-packages failed; retrying without the flag")
        run([sys.executable, "-m", "pip", "install", "-q", "-r", "requirements.txt"])


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--scope", default=os.environ.get("FTM_DATA_SCOPE", "balanced"), choices=["minimal", "balanced", "full"])
    ap.add_argument("--skip-download", action="store_true")
    ap.add_argument("--skip-install", action="store_true")
    ap.add_argument("--skip-frontend", action="store_true")
    ap.add_argument("--workers", type=int, default=8, help="parallel downloads")
    ap.add_argument("--parse-workers", type=int, default=None, help="parser processes (default: min(4, cpu-1)); use 1 on low-memory machines")
    args = ap.parse_args()

    say("Football Time Machine setup")
    check_environment(need_node=not args.skip_frontend)
    if not args.skip_install:
        install_python_deps()

    from backend.data_pipeline.acquire import AcquisitionError, acquire
    from backend.data_pipeline.build import build
    from backend.models.train import train

    if not args.skip_download:
        try:
            rec = acquire(args.scope, say, workers=args.workers)
            say(f"Acquired {rec['matches']} matches ({rec['files_downloaded']} files downloaded, {rec['files_from_cache']} cached)")
        except AcquisitionError as exc:
            from backend.data_pipeline.acquire import load_acquisition
            if load_acquisition() and (ROOT / "backend/data/processed/player_season.parquet").exists():
                say(f"Download failed ({exc}). A previously verified processed dataset exists and will be reused.")
                say("Re-run without --skip-download once the network is back to refresh it.")
            else:
                sys.exit(f"\nDATA ACQUISITION FAILED: {exc}\nNo verified cache is available, so setup stops here rather than inventing data.")
    else:
        say("Skipping download; using cached raw files")

    say("Building master dataset…")
    report = build(say, workers=args.parse_workers)
    say(f"Dataset: {report['totals']['player_seasons']} player-seasons, {report['totals']['players']} players")
    say("Training ML artifacts…")
    meta = train(say)
    say(f"Model v{meta['model_version']} trained (seed {meta['random_seed']})")

    if not args.skip_frontend:
        fe = ROOT / "frontend"
        npm = shutil.which("npm") or "npm"  # resolves npm.cmd on Windows
        if not (fe / "node_modules").exists():
            run([npm, "install", "--no-audit", "--no-fund"], cwd=fe)
        run([npm, "run", "build"], cwd=fe)
        say("Frontend built to frontend/dist")

    say("Setup complete. Run:  python start.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
