"""CLI entry: python -m backend.data_pipeline.run --scope balanced"""
from __future__ import annotations

import argparse
import logging
import sys
import time

from backend.config import DEFAULT_SCOPE, DOWNLOAD_WORKERS, SCOPES
from backend.data_pipeline.acquire import acquire
from backend.data_pipeline.build import build


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Football Time Machine data pipeline")
    ap.add_argument("--scope", default=DEFAULT_SCOPE, choices=sorted(SCOPES))
    ap.add_argument("--skip-download", action="store_true", help="use cached raw files only")
    ap.add_argument("--workers", type=int, default=DOWNLOAD_WORKERS)
    ap.add_argument("--parse-workers", type=int, default=None)
    args = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    t0 = time.time()

    def say(msg: str) -> None:
        print(f"[{time.time() - t0:6.0f}s] {msg}", flush=True)

    if not args.skip_download:
        acquire(args.scope, say, workers=args.workers)
    build(say, workers=args.parse_workers)
    say("Pipeline complete.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
