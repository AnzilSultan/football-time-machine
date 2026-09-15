# Deploying Football Time Machine for free

The app is a single container: FastAPI serves the API **and** the built React
frontend. The processed dataset and trained ML artifacts (`backend/data/processed`,
`backend/data/metadata`, `backend/data/artifacts`, ~40 MB) are committed to the
repo so the deploy never has to download StatsBomb data. Raw data is git-ignored.

## 1. Put the code on GitHub

```bash
cd football-time-machine
git init
git add .
git commit -m "Football Time Machine"
# create an empty repo on github.com, then:
git remote add origin https://github.com/<you>/football-time-machine.git
git push -u origin main
```

`.gitignore` already excludes raw data, `node_modules`, `dist` and zips. The
largest tracked file is the SQLite database (~30 MB), under GitHub's 100 MB limit.

## 2. Host the live app on Hugging Face Spaces (recommended, free)

1. Create an account at https://huggingface.co and click **New Space**.
2. Name it `football-time-machine`, choose **Docker** as the SDK, **Blank** template, public, free CPU hardware.
3. Push this repo to the Space (it is a git remote):

```bash
git remote add hf https://huggingface.co/spaces/<you>/football-time-machine
git push hf main
```

The Space builds the `Dockerfile` (frontend build + Python deps, ~5 minutes on
first push) and serves on port 7860. Your app is live at
`https://huggingface.co/spaces/<you>/football-time-machine` and can also be
embedded or opened full-screen at `https://<you>-football-time-machine.hf.space`.

Free Spaces sleep after 48 h without visitors and wake on the next request
(cold start ~30 s). Add this to the top of `README.md` so the Space shows a
proper card (Hugging Face reads it as front matter):

```
---
title: Football Time Machine
emoji: ⚽
colorFrom: green
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
---
```

## 3. Alternatives

* **Render** (free web service, Docker): connect the GitHub repo, pick Docker,
  set env `PORT=10000`. Free instances have 512 MB RAM — enough for this app but
  close to the limit — and sleep after 15 minutes.
* **Fly.io** / **Railway**: same Dockerfile; both offer small free/trial
  allowances that change over time.
* **Static-only preview** is not possible: the ML endpoints need the Python API.

## Updating the data or models

Run `python setup.py` locally, commit the changed files under `backend/data/`
and push. The Space rebuilds automatically.
