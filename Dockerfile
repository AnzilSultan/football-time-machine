# Football Time Machine — production image (Hugging Face Spaces / Render / Fly / any Docker host)
#
# The image ships the pre-built dataset and ML artifacts from backend/data
# (processed, metadata, artifacts) so no StatsBomb download happens at deploy
# time. Rebuild them locally with `python setup.py` and commit the results.

# ---- stage 1: build the React frontend -------------------------------------
FROM node:22-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---- stage 2: Python API serving the built frontend ------------------------
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    OPENBLAS_NUM_THREADS=2 OMP_NUM_THREADS=2 \
    PORT=7860
WORKDIR /app

COPY requirements.txt ./
# playwright/pytest are dev-only; everything else is needed at runtime
RUN grep -viE '^(playwright|pytest)' requirements.txt > requirements-runtime.txt \
    && pip install --no-cache-dir -r requirements-runtime.txt

COPY backend/ ./backend/
COPY start.py setup.py README.md METHODOLOGY.md LIMITATIONS.md DATA_SOURCES.md LICENSES.md ./
COPY --from=frontend /app/frontend/dist ./frontend/dist

# Hugging Face Spaces runs as a non-root user with uid 1000
RUN useradd -m -u 1000 app && chown -R app:app /app
USER app

EXPOSE 7860
CMD ["sh", "-c", "uvicorn backend.api.main:app --host 0.0.0.0 --port ${PORT}"]
