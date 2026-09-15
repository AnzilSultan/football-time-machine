# Deploying Football Time Machine for free

The app is a single container: FastAPI serves the API **and** the built React
frontend. The processed dataset and trained ML artifacts (`backend/data/processed`,
`backend/data/metadata`, `backend/data/artifacts`, ~40 MB) are committed to the
repo, so a deploy never downloads StatsBomb data — it only installs dependencies,
builds the frontend and serves. Raw data is git-ignored. The running server needs
about 370 MB of RAM.

## 1. Put the code on GitHub

```bash
cd football-time-machine
git init
git add .
git commit -m "Football Time Machine"
# create an empty repo on github.com (no README), then:
git remote add origin https://github.com/<you>/football-time-machine.git
git push -u origin main
```

`.gitignore` excludes raw data, `node_modules`, `dist` and zips. The largest
tracked file is the SQLite database (~30 MB), under GitHub's 100 MB limit.

## 2. Host the live app on Render (free, no credit card)

Render's free web-service tier runs Docker containers with 512 MB RAM and
750 instance-hours a month, enough for one always-available service.

1. Sign up at https://render.com with your GitHub account.
2. **New → Blueprint**, select the `football-time-machine` repo. Render reads
   `render.yaml` and creates the service (or **New → Web Service**, runtime
   **Docker**, plan **Free** — the Dockerfile does the rest).
3. First build takes ~6–8 minutes (frontend build + Python deps). You get a URL
   like `https://football-time-machine.onrender.com`.

Free services spin down after 15 minutes without traffic and take ~30–60 s to
wake on the next visit — normal for a portfolio link (mention it in your README
or LinkedIn post so a reviewer waits for the first load). The Space-style
front matter at the top of README.md is harmless on GitHub/Render.

## 3. Alternatives

* **Koyeb** – free "nano" Docker instance (0.1 vCPU / 512 MB), no card, no sleep
  on the free tier at the time of writing; deploy from GitHub with the Dockerfile.
* **Hugging Face Spaces** – Docker Spaces now require a paid PRO plan; only
  Static Spaces and ZeroGPU Gradio Spaces are free, so this app (FastAPI + React)
  does not fit their free tier.
* **Railway / Fly.io** – trial credits or card required.
* **Static-only hosting (GitHub Pages, Netlify, Vercel)** is not enough on its
  own: the ML endpoints need the Python API.

## Updating the data or models

Run `python setup.py` locally, commit the changed files under `backend/data/`
and push. Render redeploys automatically on every push to `main`.
