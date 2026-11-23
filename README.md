# The Flex — Commute Finder (London & Paris)

A commute-first apartment discovery & ranking application built for **The Flex** (`theflex.global`). Guests, relocating professionals, and students enter their workplace or university (or two destinations for couples, flatmates, and hybrid workers) and instantly rank furnished residences by **door-to-door public transit time**, **transfer count**, and **true monthly cost**.

## Architecture & Tech Stack

Designed to match The Flex's engineering stack while deploying with zero external API keys or database setup on **Vercel**:

- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS v4 + Leaflet (CartoDB Positron tiles)
- **Backend**: Python **FastAPI** Serverless API (`api/index.py`) deployed natively on Vercel (`/api/*`), complete with OpenAPI / Swagger UI at `/api/docs`
- **Routing Engine (`api/_backend/transit.py`)**: Line-aware state-space Dijkstra graph across **London** (TfL Underground, Elizabeth Line, Windrush Overground, DLR) and **Paris** (RATP Métro & RER A/B):
  - Multi-station access & egress selection (top 4 walkable stations within 1.65 km)
  - Direct-walk detection when walking beats rail
  - Peak (`08:30`) vs Off-Peak (`11:00`) headway wait & interchange congestion modeling
  - Reverse-Dijkstra **15 / 30 / 45-minute transit-graph isochrones** rendered with union-opacity SVG panes
  - Multi-destination optimization (`Fairness Min-Max`, `Balanced Avg`, `Weekly Hybrid Days`)
  - **Rent vs. Time-Value Analyzer** including fare-zone travelcards (TfL / Navigo) and mathematical **Pareto Frontier** identification
- **Free-Text Geocoding**: `/api/geocode` bounded OpenStreetMap Nominatim proxy for any street, campus, office, or postcode in London or Paris
- **DevOps**: `vercel.json` serverless rewrites, multi-stage `Dockerfile`, and GitHub Actions CI (`.github/workflows/ci.yml`)

## Local Development

```bash
# 1. Frontend dependencies
npm install

# 2. Python FastAPI backend (in terminal 1)
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt uvicorn pytest httpx
uvicorn api.index:app --reload --port 8000

# 3. Vite dev server with /api proxy (in terminal 2)
npm run dev
```

Open `http://localhost:5173` (and inspect the FastAPI interactive schema at `http://localhost:8000/api/docs`).

## Running Tests

```bash
pytest -v
npm run build
```

## Deploying to Vercel

Push this repository to GitHub and import it in Vercel — **zero environment variables required**. Vercel builds the Vite React SPA into static CDN assets and automatically deploys `api/index.py` as a Python FastAPI Serverless Function via `vercel.json`.
