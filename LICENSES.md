# Licenses

## Application code

MIT License — Copyright (c) 2026 Austin Sajan

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions: the above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.

## Data

**StatsBomb Open Data** — https://github.com/statsbomb/open-data

Used under the StatsBomb Public Data User Agreement (`LICENSE.pdf` in that repository). In summary: the data is free to use for non-commercial purposes and public research; StatsBomb must be credited as the data source and its logo/attribution shown where the data is displayed; the data may not be sold or used to build commercial products; StatsBomb retains all rights. This application is non-commercial and displays "Data: StatsBomb Open Data" in its footer and on the Data → Sources page.

Raw files are stored locally by `setup.py` and are **not** redistributed in this repository (`backend/data/raw/` is git-ignored). Processed aggregates (`backend/data/processed`, `backend/data/artifacts`) are derived works and inherit the same non-commercial, attribution terms.

## Third-party software

Python: FastAPI, Uvicorn, pandas, NumPy, scikit-learn, SciPy, SQLAlchemy, PyArrow, RapidFuzz, Unidecode, python-dotenv, pytest, httpx, Playwright — each under its own permissive license (MIT / BSD / Apache-2.0).

JavaScript: React, React Router, Vite, Tailwind CSS, Radix UI, Recharts, D3, Framer Motion, Lucide, cmdk, class-variance-authority, clsx, tailwind-merge — MIT / ISC.

Fonts: Inter (SIL Open Font License 1.1) and JetBrains Mono (SIL OFL 1.1), self-hosted via Fontsource.
