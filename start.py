#!/usr/bin/env python3
"""Start Football Time Machine.

    python start.py            # serves API + built frontend on http://127.0.0.1:8000
    python start.py --dev      # API on :8000 plus Vite dev server with HMR on :5173
    python start.py --port 9000
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
os.chdir(ROOT)
sys.path.insert(0, str(ROOT))

try:
    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env")
except ImportError:
    pass


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default=os.environ.get("FTM_API_HOST", "127.0.0.1"))
    ap.add_argument("--port", type=int, default=int(os.environ.get("FTM_API_PORT", "8000")))
    ap.add_argument("--dev", action="store_true", help="also run the Vite dev server")
    ap.add_argument("--no-browser", action="store_true")
    args = ap.parse_args()

    from backend.config import ARTIFACTS_DIR, DB_PATH, PROCESSED_DIR
    missing = [str(p) for p in (PROCESSED_DIR / "player_season.parquet", ARTIFACTS_DIR / "player_features.parquet", DB_PATH) if not p.exists()]
    if missing:
        sys.exit("Dataset / model artifacts are missing. Run `python setup.py` first.\nMissing: " + "\n  ".join(missing))
    dist = ROOT / "frontend" / "dist" / "index.html"
    if not dist.exists() and not args.dev:
        print("frontend/dist not found - run `python setup.py` (or `npm run build` in frontend/) or use --dev.")

    procs = []
    if args.dev:
        env = dict(os.environ, FTM_API_URL=f"http://{args.host}:{args.port}")
        import shutil
        procs.append(subprocess.Popen([shutil.which("npm") or "npm", "run", "dev", "--", "--host"], cwd=ROOT / "frontend", env=env))
        url = "http://localhost:5173"
    else:
        url = f"http://{args.host}:{args.port}"
    print(f"\n  Football Time Machine -> {url}\n  API docs -> http://{args.host}:{args.port}/docs\n")
    if not args.no_browser:
        try:
            webbrowser.open(url)
        except Exception:  # noqa: BLE001
            pass
    try:
        import uvicorn
        uvicorn.run("backend.api.main:app", host=args.host, port=args.port, reload=args.dev, log_level="info")
    finally:
        for p in procs:
            p.terminate()
    return 0


if __name__ == "__main__":
    sys.exit(main())
